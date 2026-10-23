import type { PageResponse } from '@backgold/content'
import { CONTENT_API_EXAMPLES } from '@backgold/contract/content-api-examples'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMiddleware, type MiddlewareDeps } from '../src/middleware.js'
import type { BackgoldReady } from '../src/server/context.js'
import { DRAWN_ENTRY_HEADER, DRAWN_PAGE_HEADER, drawnInstead } from '../src/server/drawn.js'
import { resolveRoute } from '../src/server/resolve.js'
import { API_ORIGIN, PK, fakeApi, fakeCache, fakeContext, fakeKv, type FakeContext } from './fixtures.js'

const HOME = CONTENT_API_EXAMPLES.PageResponse as PageResponse
const ENTRY = (CONTENT_API_EXAMPLES.EntryResponse as { entry: { id: string } }).entry
const SHERIFF = { ...ENTRY, id: 'ci_sheriff', slug: 'sheriff', type: 'endorsement', url: '/endorsements/sheriff' }
/** A published page at /preview, so the preview page's own path resolves to a page. */
const PREVIEW_PAGE = { ...HOME, page: { ...HOME.page, id: 'lp_preview', slug: 'preview', url: '/preview', is_home: false } }

/** The fixture api (endorsements at /endorsements), plus an entry, its list and a page at /preview. */
const EXTRA: Record<string, unknown> = {
  '/pages': { pages: [...(CONTENT_API_EXAMPLES.PagesResponse as { pages: unknown[] }).pages, { id: 'lp_preview', slug: 'preview', title: 'Preview', url: '/preview', is_home: false, published_at: null, updated_at: '2026-10-01T00:00:00.000Z' }] },
  '/pages/preview': PREVIEW_PAGE,
  '/entries/endorsement': { entries: [SHERIFF], next_cursor: null, areas: {} },
  '/entries/endorsement/sheriff': { entry: SHERIFF, areas: {} },
}

beforeEach(() => {
  const api = fakeApi(184)
  vi.stubGlobal('fetch', (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const body = EXTRA[url.pathname.replace(/^\/api\/content\/v1/, '')]
    return body === undefined ? api.fetch(input, init) : Response.json(body, { headers: { 'X-Content-Version': '184', ETag: '"v184"' } })
  }) as typeof fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function deps(cache: ReturnType<typeof fakeCache> | undefined = fakeCache()): MiddlewareDeps {
  return { env: { BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: API_ORIGIN, SITE_URL: 'https://pinevalleyliberty.org', BACKGOLD_CACHE: fakeKv() }, cache, buildId: 'b1' }
}

/** A page that resolves each of `paths` (default: its own address) as the catch-all route does, then renders `init`. */
function render(ctx: FakeContext, paths?: Array<string | URL>, init: ResponseInit = {}) {
  return vi.fn(async (_rewrite?: string) => {
    const { client } = (ctx.locals as { backgold: BackgoldReady }).backgold
    for (const path of paths ?? [ctx.url]) await resolveRoute(client, path)
    return new Response('<html>rendered</html>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, ...init })
  })
}

async function drawnOn(path: string, paths?: Array<string | URL>, opts: { method?: string; init?: ResponseInit; deps?: MiddlewareDeps } = {}) {
  const ctx = fakeContext(path, { method: opts.method })
  const res = await runMiddleware(ctx, render(ctx, paths, opts.init), opts.deps ?? deps())
  return { page: res.headers.get(DRAWN_PAGE_HEADER), entry: res.headers.get(DRAWN_ENTRY_HEADER), res }
}

describe('what a render drew', () => {
  it('names a drawn page by its id, and no entry', async () => {
    expect(await drawnOn('/')).toMatchObject({ page: HOME.page.id, entry: null })
  })

  it('names a drawn entry by its id, and no page', async () => {
    expect(await drawnOn('/endorsements/sheriff')).toMatchObject({ page: null, entry: 'ci_sheriff' })
  })

  it('names nothing for a list, an unknown path or a feed', async () => {
    for (const path of ['/endorsements', '/no-such-page', '/endorsements/feed.xml']) expect(await drawnOn(path), path).toMatchObject({ page: null, entry: null })
  })

  it('names nothing on the preview page, whatever its render resolves', async () => {
    const d = await drawnOn('/preview?bg_preview=tok_good&path=/', ['/preview', '/'])
    expect(d).toMatchObject({ page: null, entry: null })
    expect(d.res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('serves the name with the stored copy on a hit', async () => {
    const d = deps()
    const first = fakeContext('/')
    const miss = await runMiddleware(first, render(first), d)
    expect(miss.headers.get('X-Backgold-Cache')).toBe('MISS')
    expect(miss.headers.get(DRAWN_PAGE_HEADER)).toBe(HOME.page.id)
    const second = fakeContext('/')
    const next = render(second)
    const hit = await runMiddleware(second, next, d)
    expect(next).not.toHaveBeenCalled()
    expect(hit.headers.get('X-Backgold-Cache')).toBe('HIT')
    expect(hit.headers.get(DRAWN_PAGE_HEADER)).toBe(HOME.page.id)
  })

  it('names the page without an edge cache too (astro dev)', async () => {
    expect(await drawnOn('/', undefined, { deps: deps(undefined) })).toMatchObject({ page: HOME.page.id })
  })

  it('takes the first resolution of the request’s own path; other paths and later reads never change it', async () => {
    expect(await drawnOn('/endorsements', ['/', '/endorsements', '/endorsements/sheriff'])).toMatchObject({ page: null, entry: null })
    expect(await drawnOn('/', ['/endorsements', '/', '/endorsements/sheriff'])).toMatchObject({ page: HOME.page.id, entry: null })
    expect(await drawnOn('/endorsements/sheriff/', ['/endorsements/sheriff'])).toMatchObject({ entry: 'ci_sheriff' })
  })

  it('names a page drawn in place of a path that resolved to nothing (the kit’s /events/<type>), never in place of a page or an entry', async () => {
    /** A page that resolves its own address, then `instead` (a page read at another path) as the catch-all's typed events page does. */
    const swapping = (ctx: FakeContext, instead: string) =>
      vi.fn(async (_rewrite?: string) => {
        const { client } = (ctx.locals as { backgold: BackgoldReady }).backgold
        await resolveRoute(client, ctx.url)
        drawnInstead(await resolveRoute(client, instead))
        return new Response('<html>rendered</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
      })
    const named = async (path: string, instead: string) => {
      const ctx = fakeContext(path)
      const res = await runMiddleware(ctx, swapping(ctx, instead), deps())
      return { page: res.headers.get(DRAWN_PAGE_HEADER), entry: res.headers.get(DRAWN_ENTRY_HEADER) }
    }
    expect(await named('/no-such-page/volunteer', '/preview')).toEqual({ page: 'lp_preview', entry: null })
    expect(await named('/', '/preview')).toEqual({ page: HOME.page.id, entry: null })
    expect(await named('/endorsements/sheriff', '/preview')).toEqual({ page: null, entry: 'ci_sheriff' })
    expect(await named('/preview?bg_preview=tok_good', '/')).toEqual({ page: null, entry: null })
  })

  it('names nothing on a render that is not a 200 HTML page, or a request that is not a GET', async () => {
    expect(await drawnOn('/', undefined, { init: { status: 500 } })).toMatchObject({ page: null })
    expect(await drawnOn('/', undefined, { init: { headers: { 'Content-Type': 'application/json' } } })).toMatchObject({ page: null })
    for (const method of ['HEAD', 'POST']) expect(await drawnOn('/', undefined, { method }), method).toMatchObject({ page: null })
  })
})
