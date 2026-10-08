import { createClient, kvStore, memoryCache } from '@backgold/content'
import type { BackgoldContent, ContentApiLegal, KvLike, SiteResponse } from '@backgold/content'
import { analyticsOf, type BackgoldAnalytics } from './analytics.js'
import { DEFAULT_API_ORIGIN, firstPartyOf, kvBinding, serviceBinding, text, workerEnv, type BackgoldEnv } from './env.js'
import { withTimeout } from './timeout.js'
import { readVisitorId } from './visitor.js'

/** What `locals.backgold` holds once the site is configured. */
export interface BackgoldReady {
  /**
   * The isolate's client: the publishable key's, or in first-party mode the
   * site id's through the `BACKGOLD_API` binding. Every read is cached under
   * the content version.
   */
  client: BackgoldContent
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
  /** True for a site Worker inside BackGold's namespace (`BACKGOLD_SITE_ID` set). */
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
  site: null
  legal: null
  version: null
  siteUrl: string
  variant: string
  visitorId: string | null
  /** True when `BACKGOLD_SITE_ID` is set. */
  firstParty: boolean
  /** The variable names to set or fix, for the setup page. */
  setup: { missing: string[] }
}

export type BackgoldLocals = BackgoldReady | BackgoldSetup

/** The parts of an Astro context (`APIContext`, the `Astro` global) this package reads. */
export interface BackgoldContextLike {
  url: URL
  locals: object
  cookies: { get(key: string): { value: string } | undefined }
}

const PUBLISHABLE_KEY = /^bg_site_pk_[A-Za-z0-9]+$/
/** A site id as `@backgold/content` accepts it for first-party reads. */
const SITE_ID = /^[A-Za-z0-9_-]{1,64}$/

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
 * `BACKGOLD_API` binding instead of a site key.
 */
function setupProblems(env: BackgoldEnv): string[] {
  const missing: string[] = []
  const siteId = text(env.BACKGOLD_SITE_ID)
  if (siteId !== undefined) {
    if (!SITE_ID.test(siteId)) missing.push('BACKGOLD_SITE_ID')
    if (!serviceBinding(env.BACKGOLD_API)) missing.push('BACKGOLD_API')
  } else {
    const key = text(env.BACKGOLD_SITE_KEY)
    if (!key || !PUBLISHABLE_KEY.test(key)) missing.push('BACKGOLD_SITE_KEY')
  }
  const origin = text(env.BACKGOLD_API_ORIGIN)
  if (origin !== undefined && !isHttpUrl(origin.replace(/\/+$/, ''), true)) missing.push('BACKGOLD_API_ORIGIN')
  return missing
}

/** `SITE_URL`'s origin when it is an http(s) URL, else the request's. */
function siteUrlOf(env: BackgoldEnv, requestUrl: URL): string {
  const configured = text(env.SITE_URL)
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

let held: { signature: string; kv: KvLike | undefined; binding: object | undefined; client: BackgoldContent } | undefined

/**
 * One client per isolate, rebuilt only if the key (or first-party site id),
 * the origin, the KV binding or the service binding changes.
 */
function isolateClient(env: BackgoldEnv, apiOrigin: string): BackgoldContent {
  const kv = kvBinding(env.BACKGOLD_CACHE)
  const firstParty = firstPartyOf(env)
  const signature = firstParty ? `first-party\n${firstParty.siteId}\n${apiOrigin}` : `key\n${text(env.BACKGOLD_SITE_KEY)!}\n${apiOrigin}`
  const binding = firstParty?.binding
  if (held && held.signature === signature && held.kv === kv && held.binding === binding) return held.client
  const cache = kv ? kvStore(kv) : memoryCache()
  const client = firstParty
    ? createClient({ firstParty: { siteId: firstParty.siteId }, apiOrigin, cache, fetch: withTimeout((input, init) => firstParty.binding.fetch(input, init)) })
    : createClient({ key: text(env.BACKGOLD_SITE_KEY)!, apiOrigin, cache, fetch: withTimeout() })
  held = { signature, kv, binding, client }
  return client
}

/** `locals.backgold` for this request from an explicit environment (the middleware and tests). */
export async function backgoldFor(env: BackgoldEnv, context: BackgoldContextLike): Promise<BackgoldLocals> {
  const locals = context.locals as { backgold?: BackgoldLocals }
  if (locals.backgold) return locals.backgold

  const siteUrl = siteUrlOf(env, context.url)
  const visitorId = readVisitorId(context.cookies)
  const firstParty = text(env.BACKGOLD_SITE_ID) !== undefined
  const missing = setupProblems(env)
  let bg: BackgoldLocals
  if (missing.length > 0) {
    bg = { client: null, site: null, legal: null, version: null, siteUrl, variant: '', visitorId, firstParty, setup: { missing } }
  } else {
    const client = isolateClient(env, text(env.BACKGOLD_API_ORIGIN) ?? DEFAULT_API_ORIGIN)
    const answer = await client.site()
    const { site, legal, version } = answer
    bg = { client, site, legal, version: client.version() ?? version, siteUrl, variant: '', visitorId, firstParty, setup: null }
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
