import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMiddleware, type MiddlewareDeps } from '../src/middleware.js'
import { backgoldFor } from '../src/server/context.js'
import { cacheKey } from '../src/server/edge-cache.js'
import type { BackgoldEnv } from '../src/server/env.js'
import { SETUP_PATH } from '../src/server/setup.js'
import { API_ORIGIN, PK, SK, fakeApi, fakeCache, fakeContext, fakeKv, type FakeApi } from './fixtures.js'

let api: FakeApi

beforeEach(() => {
  api = fakeApi(184)
  vi.stubGlobal('fetch', api.fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** A fresh KV binding per test, so each test gets its own isolate client. */
function deps(overrides: Partial<BackgoldEnv> = {}, cache = fakeCache()): MiddlewareDeps & { cache: ReturnType<typeof fakeCache> } {
  return { env: { BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: API_ORIGIN, SITE_URL: 'https://pinevalleyliberty.org', BACKGOLD_CACHE: fakeKv(), ...overrides }, cache, buildId: 'b1' }
}

const html = (init: ResponseInit = {}) => vi.fn(async (_rewrite?: string) => new Response('<html>rendered</html>', { status: 200, headers: { 'Content-Type': 'text/html' }, ...init }))

describe('setup check', () => {
  it('rewrites every HTML path to the setup page while the site key is missing', async () => {
    for (const env of [{ BACKGOLD_SITE_KEY: undefined }, { BACKGOLD_SITE_KEY: 'not-a-key' }, { BACKGOLD_SITE_KEY: SK }]) {
      const ctx = fakeContext('/issues')
      const next = html()
      const d = deps(env)
      const res = await runMiddleware(ctx, next, d)
      expect(next).toHaveBeenCalledWith(SETUP_PATH)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex')
      expect((ctx.locals as { backgold: { setup: unknown } }).backgold.setup).toEqual({ missing: ['BACKGOLD_SITE_KEY'] })
      expect(d.cache.stored.size).toBe(0)
      expect(ctx.setCookies).toEqual([])
    }
    expect(api.calls).toHaveLength(0)
  })

  it('names a malformed api origin too', async () => {
    const ctx = fakeContext('/')
    await runMiddleware(ctx, html(), deps({ BACKGOLD_API_ORIGIN: 'ftp://api.example' }))
    expect((ctx.locals as { backgold: { setup: unknown } }).backgold.setup).toEqual({ missing: ['BACKGOLD_API_ORIGIN'] })
  })

  it('leaves non-HTML paths alone', async () => {
    for (const path of ['/api/backgold/webhook', '/robots.txt', '/favicon.ico']) {
      const next = html()
      await runMiddleware(fakeContext(path), next, deps({ BACKGOLD_SITE_KEY: undefined }))
      expect(next).toHaveBeenCalledWith()
    }
  })

  it('answers 404 at the setup path once the key is set', async () => {
    const next = html()
    const res = await runMiddleware(fakeContext(SETUP_PATH), next, deps())
    expect(res.status).toBe(404)
    expect(next).not.toHaveBeenCalled()
  })

  it('fills locals.backgold from /site once configured', async () => {
    const ctx = fakeContext('/')
    await runMiddleware(ctx, html(), deps())
    const bg = (ctx.locals as { backgold: Record<string, unknown> }).backgold
    expect(bg).toMatchObject({ setup: null, version: 184, siteUrl: 'https://pinevalleyliberty.org', variant: '' })
    expect((bg.site as { id: string }).id).toBe('cd_8f2a')
    expect(bg.legal).toEqual({ disclaimer: expect.stringContaining('Paid for by'), required: true })
  })
})

describe('bg_vid', () => {
  it('mints a visitor id, hands it to the render and sets a one-year Lax Secure cookie readable by script', async () => {
    const ctx = fakeContext('/')
    await runMiddleware(ctx, html(), deps())
    const visitorId = (ctx.locals as { backgold: { visitorId: string } }).backgold.visitorId
    expect(visitorId).toMatch(/^[0-9a-f-]{36}$/)
    expect(ctx.setCookies).toEqual([
      { name: 'bg_vid', value: visitorId, options: { path: '/', maxAge: 31536000, sameSite: 'lax', secure: true, httpOnly: false } },
    ])
  })

  it('reuses a well-formed id and sets no cookie', async () => {
    const ctx = fakeContext('/', { cookies: { bg_vid: '6d1f3c1e-5b0a-4c55-9d1e-2b7f0f6c9a11' } })
    await runMiddleware(ctx, html(), deps())
    expect((ctx.locals as { backgold: { visitorId: string } }).backgold.visitorId).toBe('6d1f3c1e-5b0a-4c55-9d1e-2b7f0f6c9a11')
    expect(ctx.setCookies).toEqual([])
  })

  it('re-mints a malformed id', async () => {
    const ctx = fakeContext('/', { cookies: { bg_vid: '<script>' } })
    await runMiddleware(ctx, html(), deps())
    expect(ctx.setCookies).toHaveLength(1)
    expect(ctx.setCookies[0]!.value).not.toBe('<script>')
  })

  it('sets no cookie on the machine routes', async () => {
    const ctx = fakeContext('/api/backgold/webhook', { method: 'POST' })
    await runMiddleware(ctx, html(), deps())
    expect(ctx.setCookies).toEqual([])
  })
})

describe('redirects', () => {
  it('answers a rule with its status and destination, matching a trailing slash', async () => {
    for (const path of ['/old-issues', '/old-issues/']) {
      const next = html()
      const res = await runMiddleware(fakeContext(path), next, deps())
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/issues')
      expect(next).not.toHaveBeenCalled()
    }
  })

  it('answers 410 for a rule with no destination', async () => {
    const res = await runMiddleware(fakeContext('/2022-slate'), html(), deps())
    expect(res.status).toBe(410)
  })

  it('still sends the visitor cookie with a redirect', async () => {
    const ctx = fakeContext('/old-issues')
    await runMiddleware(ctx, html(), deps())
    expect(ctx.setCookies.map((c) => c.name)).toEqual(['bg_vid'])
  })
})

describe('edge cache', () => {
  it('keys by site, build, version, an empty variant slot and the path, dropping unknown queries', () => {
    const key = cacheKey({ siteId: 'cd_8f2a', buildId: 'b1', siteUrl: 'https://pinevalleyliberty.org', version: 184, variant: '', url: new URL('https://pinevalleyliberty.org/blog/levy?utm_source=x&b=2') })
    expect(key).toBe('https://backgold.cache/cd_8f2a/b1/184//https%3A%2F%2Fpinevalleyliberty.org/blog/levy?')
    expect(cacheKey({ siteId: 'cd_8f2a', buildId: 'b1', siteUrl: 'https://pinevalleyliberty.org', version: 184, variant: '', url: new URL('https://pinevalleyliberty.org/blog/levy') })).toBe(key)
    expect(cacheKey({ siteId: 'cd_8f2a', buildId: 'b1', siteUrl: 'https://pinevalleyliberty.org', version: 184, variant: 'b', url: new URL('https://pinevalleyliberty.org/') })).toBe(
      'https://backgold.cache/cd_8f2a/b1/184/b/https%3A%2F%2Fpinevalleyliberty.org/?',
    )
  })

  it('keys by the origin the render names: per Host without SITE_URL, one entry with it', async () => {
    const hosts = ['https://pinevalleyliberty.org', 'https://attacker.example']
    const bare = deps({ SITE_URL: undefined })
    for (const origin of hosts) await runMiddleware(fakeContext('/endorsements', { origin }), html(), bare)
    expect([...bare.cache.stored.keys()]).toEqual([
      'https://backgold.cache/cd_8f2a/b1/184//https%3A%2F%2Fpinevalleyliberty.org/endorsements?',
      'https://backgold.cache/cd_8f2a/b1/184//https%3A%2F%2Fattacker.example/endorsements?',
    ])

    const pinned = deps()
    for (const origin of hosts) await runMiddleware(fakeContext('/endorsements', { origin }), html(), pinned)
    expect([...pinned.cache.stored.keys()]).toEqual(['https://backgold.cache/cd_8f2a/b1/184//https%3A%2F%2Fpinevalleyliberty.org/endorsements?'])
  })

  it('misses on a page the previous build stored, at the same content version', async () => {
    const cache = fakeCache()
    await runMiddleware(fakeContext('/'), html(), { ...deps({}, cache), buildId: 'a1b2c3d4e5f6' })
    const after = await runMiddleware(fakeContext('/'), html(), { ...deps({}, cache), buildId: '0f1e2d3c4b5a' })
    expect(after.headers.get('X-Backgold-Cache')).toBe('MISS')
    expect([...cache.stored.keys()]).toEqual(['https://backgold.cache/cd_8f2a/a1b2c3d4e5f6/184//https%3A%2F%2Fpinevalleyliberty.org/?', 'https://backgold.cache/cd_8f2a/0f1e2d3c4b5a/184//https%3A%2F%2Fpinevalleyliberty.org/?'])
  })

  it('stores a 200 render once and serves the copy on the next read', async () => {
    const d = deps()
    const first = await runMiddleware(fakeContext('/'), html(), d)
    expect(first.headers.get('X-Backgold-Cache')).toBe('MISS')
    expect(await first.text()).toBe('<html>rendered</html>')
    expect([...d.cache.stored.keys()]).toEqual(['https://backgold.cache/cd_8f2a/b1/184//https%3A%2F%2Fpinevalleyliberty.org/?'])

    const next = html()
    const second = await runMiddleware(fakeContext('/'), next, d)
    expect(next).not.toHaveBeenCalled()
    expect(second.headers.get('X-Backgold-Cache')).toBe('HIT')
    expect(await second.text()).toBe('<html>rendered</html>')
  })

  it('never mints an entry for an unknown query', async () => {
    const d = deps()
    await runMiddleware(fakeContext('/?utm_source=a'), html(), d)
    await runMiddleware(fakeContext('/?cachebuster=1'), html(), d)
    expect([...d.cache.stored.keys()]).toEqual(['https://backgold.cache/cd_8f2a/b1/184//https%3A%2F%2Fpinevalleyliberty.org/?'])
  })

  it('keeps the render’s own Cache-Control for the visitor and a long one for the edge', async () => {
    const d = deps()
    await runMiddleware(fakeContext('/'), html({ headers: { 'Cache-Control': 'public, max-age=60' } }), d)
    const stored = [...d.cache.stored.values()][0]!
    expect(stored.headers.get('Cache-Control')).toMatch(/^public, max-age=\d{6,}$/)
    const hit = await runMiddleware(fakeContext('/'), html(), d)
    expect(hit.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(hit.headers.has('X-Backgold-Cache-Control')).toBe(false)
  })

  it('never stores the visitor cookie, and still sends it on a hit', async () => {
    const d = deps()
    await runMiddleware(fakeContext('/'), html(), d)
    const stored = [...d.cache.stored.values()][0]!
    expect(stored.headers.has('Set-Cookie')).toBe(false)
    const ctx = fakeContext('/')
    await runMiddleware(ctx, html(), d)
    expect(ctx.setCookies.map((c) => c.name)).toEqual(['bg_vid'])
  })

  it('never stores a response that sets a cookie of its own', async () => {
    const d = deps()
    await runMiddleware(fakeContext('/'), html({ headers: { 'Set-Cookie': 'session=1' } }), d)
    const ctx = fakeContext('/pages', { cookies: { bg_vid: '6d1f3c1e-5b0a-4c55-9d1e-2b7f0f6c9a11' } })
    const next = vi.fn(async () => {
      ctx.cookies.set('cart', '1')
      return new Response('<html></html>', { status: 200 })
    })
    await runMiddleware(ctx, next, d)
    expect(d.cache.stored.size).toBe(0)
  })

  it('never stores a non-200 or a no-store render', async () => {
    const d = deps()
    for (const init of [{ status: 404 }, { status: 500 }, { status: 200, headers: { 'Cache-Control': 'no-store' } }, { status: 200, headers: { 'Cache-Control': 'private' } }]) {
      await runMiddleware(fakeContext('/missing'), html(init), d)
    }
    expect(d.cache.stored.size).toBe(0)
  })

  it('never reads or writes /preview, /api/backgold/* or the setup page', async () => {
    const d = deps()
    for (const path of ['/preview?bg_preview=tok_good', '/api/backgold/webhook', '/api/backgold/revalidate']) {
      const next = html()
      const res = await runMiddleware(fakeContext(path), next, d)
      expect(next).toHaveBeenCalled()
      expect(res.headers.has('X-Backgold-Cache')).toBe(false)
    }
    await runMiddleware(fakeContext('/'), html(), deps({ BACKGOLD_SITE_KEY: undefined }, d.cache))
    expect(d.cache.stored.size).toBe(0)
  })

  it('never caches a POST', async () => {
    const d = deps()
    await runMiddleware(fakeContext('/', { method: 'POST' }), html(), d)
    expect(d.cache.stored.size).toBe(0)
  })

  it('a new content version misses the old entry', async () => {
    const d = deps()
    await runMiddleware(fakeContext('/'), html(), d)
    // A webhook for 185: the api has moved on and the isolate's client is told.
    api.version = 185
    const bg = await backgoldFor(d.env, fakeContext('/'))
    await bg.client!.setVersion(185)
    const next = html()
    await runMiddleware(fakeContext('/'), next, d)
    expect(next).toHaveBeenCalled()
    expect([...d.cache.stored.keys()].sort()).toEqual(['https://backgold.cache/cd_8f2a/b1/184//https%3A%2F%2Fpinevalleyliberty.org/?', 'https://backgold.cache/cd_8f2a/b1/185//https%3A%2F%2Fpinevalleyliberty.org/?'])
  })

  it('just renders where there is no Cache API', async () => {
    const d = deps()
    const next = html()
    const res = await runMiddleware(fakeContext('/'), next, { ...d, cache: undefined })
    expect(next).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('hands the store to waitUntil when the runtime has one', async () => {
    const d = deps()
    const pending: Array<Promise<unknown>> = []
    await runMiddleware(fakeContext('/'), html(), { ...d, waitUntil: (p) => pending.push(p) })
    expect(pending).toHaveLength(1)
    await Promise.all(pending)
    expect(d.cache.stored.size).toBe(1)
  })
})

describe('the preview page', () => {
  const PREVIEW = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

  it('carries the preview headers on every answer, the page’s own 404 included', async () => {
    for (const status of [200, 404, 500]) {
      const d = deps()
      const res = await runMiddleware(fakeContext('/preview?bg_preview=..'), html({ status }), d)
      expect(res.status).toBe(status)
      for (const [name, value] of Object.entries(PREVIEW)) expect(res.headers.get(name)).toBe(value)
      expect(d.cache.stored.size).toBe(0)
    }
  })

  it('answers a render that throws with a bounded 502 that names nothing internal', async () => {
    const next = vi.fn(async () => Promise.reject(new TypeError('A Content API path has no "." or ".." segment (got "/preview/..")')))
    const res = await runMiddleware(fakeContext('/preview?bg_preview=..'), next, deps())
    expect(res.status).toBe(502)
    for (const [name, value] of Object.entries(PREVIEW)) expect(res.headers.get(name)).toBe(value)
    expect(await res.text()).not.toContain('segment')
  })

  it('answers a timed-out read with the 504, preview headers on it', async () => {
    const next = vi.fn(async () => Promise.reject(new DOMException('timeout', 'TimeoutError')))
    const res = await runMiddleware(fakeContext('/preview?bg_preview=tok_good'), next, deps())
    expect(res.status).toBe(504)
    for (const [name, value] of Object.entries(PREVIEW)) expect(res.headers.get(name)).toBe(value)
  })

  it('leaves a thrown error on any other page to the page', async () => {
    await expect(runMiddleware(fakeContext('/issues'), vi.fn(async () => Promise.reject(new Error('boom'))), deps())).rejects.toThrow('boom')
  })
})
