// The edge cache is the bake: a rendered GET is stored in the Workers Cache
// API under the site, the build, its content version, the variant slot and
// the path, so a version bump or a code deploy makes every older entry
// unreachable without a purge. The
// key is synthetic (https://backgold.cache/…) and never fetched.

/** The Workers Cache API surface used here; structural, so no Cloudflare types are needed. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

import { CURSOR_PARAM, validCursor } from './cursor.js'
import { SEARCH_PARAM, validSearch } from './search.js'

const KEY_ORIGIN = 'https://backgold.cache'

/**
 * Query names that enter the key, each with the check its value must pass:
 * `cursor`, a list page past the first, when it is a cursor the api would
 * accept; `q`, a list's search term, when it is 2–80 characters after trim,
 * matching the api's own check. Every other name, and a value that fails its
 * check, never mints an entry, so `/?x=1` and `/` share one and so do
 * `/blog?cursor=junk` and `/blog`. A name added here must be one the
 * renderer reads, or visitors can fill the cache with copies.
 */
const CACHE_QUERY_ALLOWLIST: Readonly<Record<string, (value: string) => boolean>> = {
  [CURSOR_PARAM]: (value) => validCursor(value) !== null,
  [SEARCH_PARAM]: (value) => validSearch(value) !== null,
}

/** How long an entry may live at the edge; a version bump retires it sooner. */
const EDGE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/** Holds the render's own Cache-Control on a stored copy, restored on a hit. */
const BROWSER_CACHE_CONTROL = 'X-Backgold-Cache-Control'
/** `HIT` or `MISS` on every response the edge cache looked at. */
export const CACHE_STATUS_HEADER = 'X-Backgold-Cache'

/** The site's preview page (a draft, BackGold's signed token in its query). */
export function isPreviewPath(pathname: string): boolean {
  return pathname === '/preview' || pathname.startsWith('/preview/')
}

/** Paths the edge cache never reads or writes. */
export function isUncachedPath(pathname: string, setupPath: string): boolean {
  return (
    isPreviewPath(pathname) ||
    pathname === '/api/backgold' ||
    pathname.startsWith('/api/backgold/') ||
    pathname === setupPath
  )
}

/**
 * Each allowlisted name's first value (the one the renderer reads) when it
 * passes its check, sorted by name; empty when none does.
 */
function normalizedQuery(url: URL): string {
  const kept: [string, string][] = []
  for (const name of Object.keys(CACHE_QUERY_ALLOWLIST).sort()) {
    const value = url.searchParams.get(name)
    if (value && CACHE_QUERY_ALLOWLIST[name]!(value)) kept.push([name, value])
  }
  return new URLSearchParams(kept).toString()
}

export interface CacheKeyInput {
  siteId: string
  /** The `astro build` that rendered it: a code deploy is a miss, as a content bump is. */
  buildId: string
  /**
   * The origin the render wrote into its canonical, og:url, sitemap and feeds
   * (`SITE_URL`, else the request's): a render for one Host is never served
   * to another.
   */
  siteUrl: string
  version: number
  variant: string
  url: URL
}

/** `https://backgold.cache/<site id>/<build id>/<version>/<variant>/<site origin>/<path>?<normalized query>`. */
export function cacheKey(input: CacheKeyInput): string {
  const path = input.url.pathname.replace(/^\/+/, '')
  const query = normalizedQuery(input.url)
  return `${KEY_ORIGIN}/${encodeURIComponent(input.siteId)}/${encodeURIComponent(input.buildId)}/${input.version}/${encodeURIComponent(input.variant)}/${encodeURIComponent(input.siteUrl)}/${path}?${query}`
}

/** A stored copy as it goes back to a visitor: the render's Cache-Control, and HIT. */
export function fromCache(stored: Response): Response {
  const response = new Response(stored.body, stored)
  const original = response.headers.get(BROWSER_CACHE_CONTROL)
  response.headers.delete(BROWSER_CACHE_CONTROL)
  if (original) response.headers.set('Cache-Control', original)
  else response.headers.delete('Cache-Control')
  response.headers.set(CACHE_STATUS_HEADER, 'HIT')
  return response
}

/**
 * Whether a render may be stored: a 200 with no cookie of its own and no
 * Cache-Control that forbids sharing. `setsCookie` covers cookies Astro holds
 * aside until after the middleware (`Astro.cookies.set`).
 */
export function isStorable(response: Response, setsCookie: boolean): boolean {
  if (response.status !== 200 || setsCookie || response.headers.has('Set-Cookie')) return false
  if (response.headers.get('Vary')?.trim() === '*') return false
  const cacheControl = response.headers.get('Cache-Control')?.toLowerCase() ?? ''
  return !/\b(no-store|private|no-cache)\b/.test(cacheControl)
}

/** The copy to store: the edge TTL in Cache-Control, the render's own kept aside. */
export function toStore(response: Response): Response {
  const stored = new Response(response.body, response)
  const original = response.headers.get('Cache-Control')
  if (original) stored.headers.set(BROWSER_CACHE_CONTROL, original)
  stored.headers.set('Cache-Control', `public, max-age=${EDGE_MAX_AGE_SECONDS}`)
  stored.headers.delete(CACHE_STATUS_HEADER)
  return stored
}
