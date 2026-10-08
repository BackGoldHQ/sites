// A fake Content API answering from the shared examples, the way the api's
// routes/content-api.ts does (X-Content-Version on every answer, ETag
// "v<version>" and 304 on a match), plus the stores and the context the
// middleware is handed on a Worker.

import { createHmac } from 'node:crypto'
import { CONTENT_API_EXAMPLES } from '@givegold/shared/content-api-examples'
import type { KvLike } from '@backgold/content'
import type { EdgeCache } from '../src/server/edge-cache.js'
import type { MiddlewareContextLike } from '../src/middleware.js'

export const PK = 'bg_site_pk_testPublishable0001'
export const SK = 'bg_site_sk_testSecret0001'
export const WEBHOOK_SECRET = 'whsec_testSecret0001'
export const API_ORIGIN = 'https://api.backgold.test'

const ROUTES: Record<string, string> = {
  '/site': 'SiteResponse',
  '/menus/primary': 'MenuResponse',
  '/pages': 'PagesResponse',
  '/pages/home': 'PageResponse',
  '/types': 'TypesResponse',
  '/entries/post': 'EntriesResponse',
  '/entries/post/levy-explained': 'EntryResponse',
  '/authors': 'AuthorsResponse',
  '/redirects': 'RedirectsResponse',
  '/sitemap': 'SitemapResponse',
  '/areas': 'AreasResponse',
}

/** A site id as a first-party read names it. */
export const SITE_ID = 'cd_8f2a'

export interface FakeApi {
  version: number
  calls: URL[]
  /** The headers of each call, in order. */
  headers: Headers[]
  fetch: typeof fetch
}

/**
 * Reads are answered for any caller; a preview needs secret-level reads: a
 * secret key, or a first-party `X-BackGold-Site` (what the api's FirstParty
 * entrypoint lets through) with no Authorization.
 */
export function fakeApi(version = 184): FakeApi {
  const api: FakeApi = {
    version,
    calls: [],
    headers: [],
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      api.calls.push(url)
      const headers = new Headers(input instanceof Request ? input.headers : init?.headers)
      api.headers.push(headers)
      const path = url.pathname.replace(/^\/api\/content\/v1/, '')
      const common = { 'X-Content-Version': String(api.version) }
      if (path.startsWith('/preview/')) {
        const secretKey = headers.get('Authorization')?.startsWith('Bearer bg_site_sk_') === true
        const firstParty = headers.get('X-BackGold-Site') === SITE_ID && !headers.has('Authorization')
        if (!secretKey && !firstParty) {
          return Response.json({ error: 'Preview needs a secret site key', code: 'SECRET_KEY_REQUIRED' }, { status: 403, headers: common })
        }
        const token = path.slice('/preview/'.length)
        if (token === 'tok_good') return Response.json(CONTENT_API_EXAMPLES.PageResponse, { headers: { ...common, 'Cache-Control': 'private, no-store' } })
        if (token === 'tok_entry') return Response.json(CONTENT_API_EXAMPLES.EntryResponse, { headers: common })
        if (token === 'tok_gone') return Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: common })
        return Response.json({ error: 'This preview link is not valid or has expired', code: 'BAD_PREVIEW_TOKEN' }, { status: 400, headers: common })
      }
      const etag = `"v${api.version}"`
      if (headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: { ...common, ETag: etag } })
      const name = ROUTES[path]
      if (!name) return Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: common })
      const body = name === 'SiteResponse' ? { ...(CONTENT_API_EXAMPLES.SiteResponse as object), version: api.version } : CONTENT_API_EXAMPLES[name]
      return Response.json(body, { headers: { ...common, ETag: etag } })
    }) as typeof fetch,
  }
  return api
}

/** A Workers KV namespace in a Map. */
export function fakeKv(): KvLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    async get(key) {
      return data.get(key) ?? null
    },
    async put(key, value) {
      data.set(key, value)
    },
    async delete(key) {
      data.delete(key)
    },
  }
}

/** `caches.default` in a Map: what was stored, by key URL. */
export function fakeCache(): EdgeCache & { stored: Map<string, { status: number; headers: Headers; body: string }> } {
  const stored = new Map<string, { status: number; headers: Headers; body: string }>()
  return {
    stored,
    async match(request) {
      const held = stored.get(request.url)
      return held ? new Response(held.body, { status: held.status, headers: held.headers }) : undefined
    },
    async put(request, response) {
      if (response.headers.has('Set-Cookie')) throw new TypeError('the Cache API refuses Set-Cookie')
      stored.set(request.url, { status: response.status, headers: new Headers(response.headers), body: await response.text() })
    },
  }
}

export interface FakeContext extends MiddlewareContextLike {
  /** Cookies set on the response, in order. */
  setCookies: Array<{ name: string; value: string; options: unknown }>
}

export function fakeContext(path: string, opts: { method?: string; cookies?: Record<string, string>; origin?: string } = {}): FakeContext {
  const url = new URL(path, opts.origin ?? 'https://pinevalleyliberty.org')
  const setCookies: FakeContext['setCookies'] = []
  const incoming = opts.cookies ?? {}
  return {
    url,
    request: new Request(url, { method: opts.method ?? 'GET' }),
    locals: {},
    setCookies,
    cookies: {
      get: (name) => (name in incoming ? { value: incoming[name]! } : undefined),
      set: (name, value, options) => {
        setCookies.push({ name, value, options })
      },
      headers: () => setCookies.map((c) => `${c.name}=${c.value}`),
    },
  }
}

/** BackGold's signature header for `body` (the api's signWebhookPayload). */
export function sign(body: string, secret: string, t: number): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
}

export function contentEvent(version: number, siteId = 'cd_8f2a'): string {
  return JSON.stringify({
    id: 'evt_1',
    type: 'content.published',
    created_at: '2026-10-04T12:00:00.000Z',
    data: { site_domain_id: siteId, content_version: version, content_item_id: 'ci_7d1' },
  })
}
