import { createClient, kvStore, memoryCache } from '@backgold/content'
import type { BackgoldContent, ContentApiLegal, KvLike, SiteResponse } from '@backgold/content'
import { analyticsOf, type BackgoldAnalytics } from './analytics.js'
import { DEFAULT_API_ORIGIN, SITE_ID_PATTERN, firstPartyOf, isDispatched, kvBinding, namesNoSite, serviceBinding, text, workerEnv, type BackgoldEnv } from './env.js'
import { withTimeout } from './timeout.js'
import { readVisitorId } from './visitor.js'

/** What `locals.backgold` holds once the site is configured. */
export interface BackgoldReady {
  /**
   * The site's client: the publishable key's, or in first-party mode the
   * site id's through the `BACKGOLD_API` binding, one per site per isolate.
   * Every read is cached under the content version.
   */
  client: BackgoldContent
  /**
   * The site this request renders: in first-party mode `BACKGOLD_SITE_ID`,
   * or in the dispatched form the request's `X-BackGold-Site`; with a site
   * key, the `/site` answer's `site.id`.
   */
  siteId: string
  site: SiteResponse['site']
  /** The legal line every HTML page must show. */
  legal: ContentApiLegal
  /** The content version this request renders. */
  version: number
  /** The site's public origin, no trailing slash. */
  siteUrl: string
  /** The edge-cache variant slot; empty until experiments exist. */
  variant: string
  /** The `bg_vid` visitor id; null until the middleware has read or minted it. */
  visitorId: string | null
  /** The `/site` answer's analytics block; absent while the site does not share its analytics. */
  analytics?: BackgoldAnalytics
  /** True for a site Worker inside BackGold's namespace (`BACKGOLD_SITE_ID` set, or the dispatched form). */
  firstParty: boolean
  setup: null
}

/**
 * What `locals.backgold` holds while the site cannot read BackGold: the site
 * key (or, in first-party mode, the `BACKGOLD_API` binding) is missing or
 * malformed, or `BACKGOLD_API_ORIGIN` is.
 */
export interface BackgoldSetup {
  client: null
  siteId: null
  site: null
  legal: null
  version: null
  siteUrl: string
  variant: string
  visitorId: string | null
  /** True when `BACKGOLD_SITE_ID` is set, or in the dispatched form. */
  firstParty: boolean
  /** The variable names to set or fix, for the setup page. */
  setup: { missing: string[] }
}

export type BackgoldLocals = BackgoldReady | BackgoldSetup

/** The parts of an Astro context (`APIContext`, the `Astro` global) this package reads. */
export interface BackgoldContextLike {
  url: URL
  /** The request; its `X-BackGold-Site` names the site in the dispatched form. */
  request?: { headers: Headers }
  locals: object
  cookies: { get(key: string): { value: string } | undefined }
}

const PUBLISHABLE_KEY = /^bg_site_pk_[A-Za-z0-9]+$/

function isHttpUrl(raw: string, allowPath: boolean): boolean {
  try {
    const url = new URL(raw)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.search && !url.hash && (allowPath || url.pathname === '/')
  } catch {
    return false
  }
}

/**
 * The variable names the site cannot render without, missing or malformed.
 * With `BACKGOLD_SITE_ID` set the site is first-party and needs the
 * `BACKGOLD_API` binding instead of a site key. The binding without
 * `BACKGOLD_SITE_ID` is the dispatched form, configured: its site arrives
 * with each request.
 */
function setupProblems(env: BackgoldEnv): string[] {
  const missing: string[] = []
  const siteId = text(env.BACKGOLD_SITE_ID)
  if (siteId !== undefined) {
    if (!SITE_ID_PATTERN.test(siteId)) missing.push('BACKGOLD_SITE_ID')
    if (!serviceBinding(env.BACKGOLD_API)) missing.push('BACKGOLD_API')
  } else if (!isDispatched(env)) {
    const key = text(env.BACKGOLD_SITE_KEY)
    if (!key || !PUBLISHABLE_KEY.test(key)) missing.push('BACKGOLD_SITE_KEY')
  }
  const origin = text(env.BACKGOLD_API_ORIGIN)
  if (origin !== undefined && !isHttpUrl(origin.replace(/\/+$/, ''), true)) missing.push('BACKGOLD_API_ORIGIN')
  return missing
}

/**
 * `SITE_URL`'s origin when it is an http(s) URL, else the request's. The
 * dispatched form always takes the request's: one shared Worker serves
 * every site on its template, so no one var can name their origins.
 */
function siteUrlOf(env: BackgoldEnv, requestUrl: URL): string {
  const configured = isDispatched(env) ? undefined : text(env.SITE_URL)
  if (configured !== undefined) {
    try {
      const url = new URL(configured)
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin
    } catch {
      // Falls back to the request's origin.
    }
  }
  return requestUrl.origin
}

/** The most sites an isolate keeps a client for; past it the least recently used is dropped. */
const MAX_HELD_CLIENTS = 32

const held = new Map<string, { kv: KvLike | undefined; binding: object | undefined; client: BackgoldContent }>()

/**
 * One client per site per isolate, keyed by the key (or first-party site id)
 * and the origin, and rebuilt only if the KV binding or the service binding
 * changes. A dispatched Worker serves many sites, so the map holds up to
 * MAX_HELD_CLIENTS of them. Each client's store keys carry its own scope (a
 * hash of the key, or of `first-party:<site id>`), so sites sharing one
 * `BACKGOLD_CACHE` never read each other's values.
 */
function siteClient(env: BackgoldEnv, apiOrigin: string, firstParty: ReturnType<typeof firstPartyOf>): BackgoldContent {
  const kv = kvBinding(env.BACKGOLD_CACHE)
  const signature = firstParty ? `first-party\n${firstParty.siteId}\n${apiOrigin}` : `key\n${text(env.BACKGOLD_SITE_KEY)!}\n${apiOrigin}`
  const binding = firstParty?.binding
  const kept = held.get(signature)
  held.delete(signature)
  if (kept && kept.kv === kv && kept.binding === binding) {
    held.set(signature, kept)
    return kept.client
  }
  const cache = kv ? kvStore(kv) : memoryCache()
  const client = firstParty
    ? createClient({ firstParty: { siteId: firstParty.siteId }, apiOrigin, cache, fetch: withTimeout((input, init) => firstParty.binding.fetch(input, init)) })
    : createClient({ key: text(env.BACKGOLD_SITE_KEY)!, apiOrigin, cache, fetch: withTimeout() })
  held.set(signature, { kv, binding, client })
  while (held.size > MAX_HELD_CLIENTS) held.delete(held.keys().next().value!)
  return client
}

/**
 * `locals.backgold` for this request from an explicit environment (the
 * middleware and tests). Throws for a dispatched request that names no
 * site, which the middleware has already answered with `noSite()`.
 */
export async function backgoldFor(env: BackgoldEnv, context: BackgoldContextLike): Promise<BackgoldLocals> {
  const locals = context.locals as { backgold?: BackgoldLocals }
  if (locals.backgold) return locals.backgold

  const siteUrl = siteUrlOf(env, context.url)
  const visitorId = readVisitorId(context.cookies)
  const missing = setupProblems(env)
  let bg: BackgoldLocals
  if (missing.length > 0) {
    const firstParty = text(env.BACKGOLD_SITE_ID) !== undefined || isDispatched(env)
    bg = { client: null, siteId: null, site: null, legal: null, version: null, siteUrl, variant: '', visitorId, firstParty, setup: { missing } }
  } else {
    if (namesNoSite(env, context.request?.headers)) throw new Error('No site: this dispatched request carries no well-formed X-BackGold-Site')
    const firstParty = firstPartyOf(env, context.request?.headers)
    const client = siteClient(env, text(env.BACKGOLD_API_ORIGIN) ?? DEFAULT_API_ORIGIN, firstParty)
    const answer = await client.site()
    const { site, legal, version } = answer
    const siteId = firstParty?.siteId ?? site.id
    bg = { client, siteId, site, legal, version: client.version() ?? version, siteUrl, variant: '', visitorId, firstParty: firstParty !== undefined, setup: null }
    const analytics = analyticsOf(answer)
    if (analytics) bg.analytics = analytics
  }
  locals.backgold = bg
  return bg
}

/**
 * The request's BackGold state, read once per request: the middleware puts
 * it on `locals.backgold`, and this returns that (or builds it, for a route
 * that runs without the middleware).
 */
export async function getBackgold(context: BackgoldContextLike): Promise<BackgoldLocals> {
  return backgoldFor(await workerEnv(), context)
}
