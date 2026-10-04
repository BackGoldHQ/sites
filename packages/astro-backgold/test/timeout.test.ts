import { afterEach, describe, expect, it, vi } from 'vitest'
import { runMiddleware } from '../src/middleware.js'
import { API_TIMEOUT_MS, isApiTimeout, withTimeout } from '../src/server/timeout.js'
import { API_ORIGIN, PK, fakeCache, fakeContext, fakeKv } from './fixtures.js'

/** A fetch that never answers on its own: it settles only when its signal aborts. */
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('withTimeout', () => {
  it('aborts a read that never answers', async () => {
    const error = await withTimeout(hangingFetch, 20)('https://api.example/x').catch((e: unknown) => e)
    expect(isApiTimeout(error)).toBe(true)
  })

  it('still honours the caller’s own signal', async () => {
    const controller = new AbortController()
    const read = withTimeout(hangingFetch, 60_000)('https://api.example/x', { signal: controller.signal })
    controller.abort()
    const error = await read.catch((e: unknown) => e)
    expect(isApiTimeout(error)).toBe(false)
    expect((error as Error).name).toBe('AbortError')
  })

  it('is ten seconds', () => {
    expect(API_TIMEOUT_MS).toBe(10_000)
  })
})

describe('a timed-out Content API read', () => {
  it('ends the request with a 504 that no cache keeps and that names nothing internal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))))
    const cache = fakeCache()
    const next = vi.fn(async () => new Response('rendered'))
    const env = { BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: API_ORIGIN, SITE_URL: 'https://pinevalleyliberty.org', BACKGOLD_CACHE: fakeKv() }
    const res = await runMiddleware(fakeContext('/issues'), next, { env, cache, buildId: 'b1' })
    expect(res.status).toBe(504)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.text()
    expect(body).not.toContain(API_ORIGIN)
    expect(body).not.toContain(PK)
    expect(next).not.toHaveBeenCalled()
    expect(cache.stored.size).toBe(0)
  })

  it('during the render is a 504 too, and other errors are the page’s', async () => {
    const env = { BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: API_ORIGIN, SITE_URL: 'https://pinevalleyliberty.org', BACKGOLD_CACHE: fakeKv() }
    const { fakeApi } = await import('./fixtures.js')
    vi.stubGlobal('fetch', fakeApi(184).fetch)
    const timedOut = vi.fn(async () => Promise.reject(new DOMException('timeout', 'TimeoutError')))
    expect((await runMiddleware(fakeContext('/issues'), timedOut, { env, cache: fakeCache(), buildId: 'b1' })).status).toBe(504)
    const broken = vi.fn(async () => Promise.reject(new Error('boom')))
    await expect(runMiddleware(fakeContext('/issues'), broken, { env: { ...env, BACKGOLD_CACHE: fakeKv() }, cache: fakeCache(), buildId: 'b1' })).rejects.toThrow('boom')
  })
})
