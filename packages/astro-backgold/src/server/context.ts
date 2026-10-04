import { createClient, kvStore, memoryCache } from '@backgold/content'
import type { BackgoldContent, ContentApiLegal, KvLike, SiteResponse } from '@backgold/content'
import { analyticsOf, type BackgoldAnalytics } from './analytics.js'
import { DEFAULT_API_ORIGIN, kvBinding, text, workerEnv, type BackgoldEnv } from './env.js'
import { withTimeout } from './timeout.js'
import { readVisitorId } from './visitor.js'

/** What `locals.backgold` holds once the site key is configured. */
export interface BackgoldReady {
  /** The isolate's publishable-key client: every read is cached under the content version. */
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
  setup: null
}

/** What `locals.backgold` holds while `BACKGOLD_SITE_KEY` (or `BACKGOLD_API_ORIGIN`) is missing or malformed. */
export interface BackgoldSetup {
  client: null
  site: null
  legal: null
  version: null
  siteUrl: string
  variant: string
  visitorId: string | null
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

function isHttpUrl(raw: string, allowPath: boolean): boolean {
  try {
    const url = new URL(raw)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.search && !url.hash && (allowPath || url.pathname === '/')
  } catch {
    return false
  }
}

/** The variable names the site cannot render without, missing or malformed. */
function setupProblems(env: BackgoldEnv): string[] {
  const missing: string[] = []
  const key = text(env.BACKGOLD_SITE_KEY)
  if (!key || !PUBLISHABLE_KEY.test(key)) missing.push('BACKGOLD_SITE_KEY')
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

let held: { signature: string; kv: KvLike | undefined; client: BackgoldContent } | undefined

/** One publishable-key client per isolate, rebuilt only if the key, origin or binding changes. */
function publishableClient(key: string, apiOrigin: string, kv: KvLike | undefined): BackgoldContent {
  const signature = `${key}\n${apiOrigin}`
  if (held && held.signature === signature && held.kv === kv) return held.client
  const client = createClient({ key, apiOrigin, cache: kv ? kvStore(kv) : memoryCache(), fetch: withTimeout() })
  held = { signature, kv, client }
  return client
}

/** `locals.backgold` for this request from an explicit environment (the middleware and tests). */
export async function backgoldFor(env: BackgoldEnv, context: BackgoldContextLike): Promise<BackgoldLocals> {
  const locals = context.locals as { backgold?: BackgoldLocals }
  if (locals.backgold) return locals.backgold

  const siteUrl = siteUrlOf(env, context.url)
  const visitorId = readVisitorId(context.cookies)
  const missing = setupProblems(env)
  let bg: BackgoldLocals
  if (missing.length > 0) {
    bg = { client: null, site: null, legal: null, version: null, siteUrl, variant: '', visitorId, setup: { missing } }
  } else {
    const apiOrigin = text(env.BACKGOLD_API_ORIGIN) ?? DEFAULT_API_ORIGIN
    const client = publishableClient(text(env.BACKGOLD_SITE_KEY)!, apiOrigin, kvBinding(env.BACKGOLD_CACHE))
    const answer = await client.site()
    const { site, legal, version } = answer
    bg = { client, site, legal, version: client.version() ?? version, siteUrl, variant: '', visitorId, setup: null }
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
