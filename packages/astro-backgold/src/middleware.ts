// The request pipeline, in order: a dispatched request that names no site
// answers 404, then (a) setup check, (b) the `bg_vid` visitor
// cookie, (c) the site's redirects, (d) the edge cache. Registered by the
// integration; `@backgold/astro/middleware` exports `onRequest` for a site
// that composes its own middleware with `sequence()`.

import './locals.js'
import type { MiddlewareHandler } from 'astro'
import options from 'virtual:backgold/options'
import { backgoldFor, type BackgoldContextLike } from './server/context.js'
import { CACHE_STATUS_HEADER, cacheKey, fromCache, isPreviewPath, isStorable, isUncachedPath, toStore, type EdgeCache } from './server/edge-cache.js'
import { namesNoSite, waitUntilOf, workerEnv, type BackgoldEnv } from './server/env.js'
import { PREVIEW_HEADERS } from './server/preview.js'
import { redirectFor } from './server/redirects.js'
import { errorResponse, noSite } from './server/respond.js'
import { SETUP_PATH } from './server/setup.js'
import { apiUnavailable, isApiTimeout } from './server/timeout.js'
import { VISITOR_COOKIE, VISITOR_COOKIE_OPTIONS, mintVisitorId } from './server/visitor.js'

/** The parts of Astro's middleware context the pipeline uses. */
export interface MiddlewareContextLike extends BackgoldContextLike {
  request: Request
  cookies: BackgoldContextLike['cookies'] & {
    set(key: string, value: string, options?: typeof VISITOR_COOKIE_OPTIONS): void
    /** The Set-Cookie values set so far by any middleware or the page (`AstroCookies.headers()`). */
    headers(): Iterable<string>
  }
}

export type MiddlewareNext = (rewrite?: string) => Promise<Response>

export interface MiddlewareDeps {
  env: BackgoldEnv
  /** `caches.default`; absent where the runtime has no Cache API (and in `astro dev`). */
  cache: EdgeCache | undefined
  /** This build's id (the integration's options module), part of every edge-cache key. */
  buildId: string
  waitUntil?: (promise: Promise<unknown>) => void
}

/** A path the setup page stands in for: everything but `/api/…` and files with an extension other than `.html`. */
function isHtmlPath(pathname: string): boolean {
  if (pathname === '/api' || pathname.startsWith('/api/')) return false
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  return !last.includes('.') || last.endsWith('.html')
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  const copy = new Response(response.body, response)
  for (const [name, value] of Object.entries(headers)) copy.headers.set(name, value)
  return copy
}

/**
 * The pipeline, with a timed-out Content API read (the site's own, the
 * page's or a route's, before its response started) answered by a 504 that
 * no cache keeps. On the preview page every answer carries PREVIEW_HEADERS
 * and any error is a bounded 502; elsewhere any other error is the page's to
 * report.
 */
export async function runMiddleware(context: MiddlewareContextLike, next: MiddlewareNext, deps: MiddlewareDeps): Promise<Response> {
  const preview = isPreviewPath(context.url.pathname)
  try {
    const response = await pipeline(context, next, deps)
    return preview ? withHeaders(response, PREVIEW_HEADERS) : response
  } catch (error) {
    if (isApiTimeout(error)) return preview ? withHeaders(apiUnavailable(), PREVIEW_HEADERS) : apiUnavailable()
    if (preview) return errorResponse(502, 'PREVIEW_UNAVAILABLE', 'This preview could not be shown. Try again.', PREVIEW_HEADERS)
    throw error
  }
}

async function pipeline(context: MiddlewareContextLike, next: MiddlewareNext, deps: MiddlewareDeps): Promise<Response> {
  const { pathname } = context.url
  const method = context.request.method
  // A template's shared Worker with no site named: nothing to render, nothing to set up.
  if (namesNoSite(deps.env, context.request.headers)) return noSite()
  const bg = await backgoldFor(deps.env, context)

  // (a) Setup: until the site key is set, the template's setup page answers every HTML path.
  if (bg.setup) {
    if (!isHtmlPath(pathname)) return next()
    const response = await (pathname === SETUP_PATH ? next() : next(SETUP_PATH))
    return withHeaders(response, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' })
  }
  if (pathname === SETUP_PATH) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  // (b) The visitor id: read now so the render can use it; a new one is sent after the cache step.
  const machineRoute = pathname === '/api/backgold' || pathname.startsWith('/api/backgold/')
  const mint = bg.visitorId === null && !machineRoute
  if (mint) bg.visitorId = mintVisitorId()
  const finish = (response: Response): Response => {
    if (mint) context.cookies.set(VISITOR_COOKIE, bg.visitorId!, VISITOR_COOKIE_OPTIONS)
    return response
  }

  const reads = method === 'GET' || method === 'HEAD'
  const uncached = isUncachedPath(pathname, SETUP_PATH)

  // (c) Redirects and 410s, before anything renders.
  if (reads && !uncached) {
    const redirect = redirectFor((await bg.client.redirects()).redirects, pathname)
    if (redirect) return finish(redirect)
  }

  // (d) The edge cache.
  if (method !== 'GET' || uncached || !deps.cache) return finish(await next())
  const key = new Request(cacheKey({ siteId: bg.siteId, buildId: deps.buildId, siteUrl: bg.siteUrl, version: bg.version, variant: bg.variant, url: context.url }))
  const hit = await deps.cache.match(key).catch(() => undefined)
  if (hit) return finish(fromCache(hit))

  const response = await next()
  // Read before `finish` adds the visitor cookie, which is never stored.
  const setsCookie = [...context.cookies.headers()].length > 0
  if (isStorable(response, setsCookie)) {
    const put = deps.cache.put(key, toStore(response.clone())).catch(() => undefined)
    if (deps.waitUntil) deps.waitUntil(put)
    else await put
  }
  return finish(withHeaders(response, { [CACHE_STATUS_HEADER]: 'MISS' }))
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  // `astro dev` keeps no edge cache, so an edited component shows on the next reload.
  // Written as the one property `import.meta.env.DEV` so Vite replaces it with
  // a literal: any other reference to `import.meta.env` is inlined as the whole
  // object, which in an SSR build carries the build machine's environment.
  const cache = import.meta.env.DEV ? undefined : (globalThis as { caches?: { default?: EdgeCache } }).caches?.default
  return runMiddleware(context, next, { env: await workerEnv(), cache, buildId: options.buildId, waitUntil: waitUntilOf(context.locals) })
}
