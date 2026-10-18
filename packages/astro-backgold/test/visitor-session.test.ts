// The signed-in visitor (0547): the middleware's cache bypass and visitor
// read, the four `/_backgold/` routes, and resolveRoute's lesson.

import { createClient, memoryCache } from '@backgold/content'
import type { ContentTypeSummary } from '@backgold/content'
import { CONTENT_API_EXAMPLES } from '@backgold/contract/content-api-examples'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMiddleware, type MiddlewareDeps } from '../src/middleware.js'
import { backgoldFor, type BackgoldLocals } from '../src/server/context.js'
import type { BackgoldEnv } from '../src/server/env.js'
import { resolveRoute } from '../src/server/resolve.js'
import { handleProgress, handleSignIn, handleSignOut, handleVisitorReturn, portalOrigin, safeReturnPath, type VisitorRouteDeps } from '../src/server/sign-in.js'
import { API_ORIGIN, PK, SITE_ID, fakeApi, fakeCache, fakeContext, fakeKv, type FakeApi } from './fixtures.js'

const TOKEN = 'visitor.eyJhaWQiOiJkYV8xIn0.c2ln'
const FRESH = 'visitor.eyJhaWQiOiJkYV8xIiwiZXhwIjoyfQ.bmV3'
const DANA = { first_name: 'Dana', email: 'dana.m@example.com', member: false }

/**
 * The fixture api with the visitor's endpoints: GET /visitor knows TOKEN
 * (and FRESH), renewing TOKEN when `renew` is set; DELETE /visitor; POST
 * /visitor/exchange takes the code `good`; progress needs the header.
 */
function visitorApi(opts: { renew?: boolean } = {}) {
  const base = fakeApi(184)
  const writes: Array<{ method: string; path: string; headers: Headers; body: string | undefined }> = []
  const inner = base.fetch
  base.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const path = url.pathname.replace(/^\/api\/content\/v1/, '')
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const common: Record<string, string> = { 'X-Content-Version': '184' }
    const token = headers.get('X-BackGold-Visitor')
    if (token !== null) {
      common['Cache-Control'] = 'private, no-store'
      if (opts.renew && token === TOKEN) common['X-BackGold-Visitor-Renew'] = FRESH
    }
    if (path === '/visitor' || path === '/visitor/exchange' || path.endsWith('/progress')) {
      writes.push({ method, path, headers, body: typeof init?.body === 'string' ? init.body : undefined })
    }
    if (path === '/visitor' && method === 'GET') return Response.json({ visitor: token === TOKEN || token === FRESH ? DANA : null }, { headers: common })
    if (path === '/visitor' && method === 'DELETE') return new Response(null, { status: 204, headers: common })
    if (path === '/visitor/exchange' && method === 'POST') {
      const { code } = JSON.parse(String(init?.body)) as { code: string }
      if (code !== 'good') return Response.json({ error: 'That sign-in link has expired', code: 'BAD_VISITOR_CODE' }, { status: 400, headers: common })
      return Response.json({ token: TOKEN, expires_at: '2026-10-18T01:00:00.000Z', visitor: DANA }, { headers: common })
    }
    if (path === '/courses/foundations/one/progress' && method === 'POST') {
      if (token === null) return Response.json({ error: 'Sign in first', code: 'VISITOR_REQUIRED' }, { status: 401, headers: common })
      return Response.json(
        { progress: { completed: true, completed_at: '2026-10-18T00:00:00.000Z', position_seconds: 0 }, course: { completed: 1, total: 4, openable: 4, seconds_left: null, next_lesson_slug: 'two' } },
        { headers: common },
      )
    }
    if (token !== null) {
      // Any other read for a visitor answers as the anonymous one would, privately.
      const plain = new Headers(headers)
      plain.delete('X-BackGold-Visitor')
      const res = await inner(input, { ...init, headers: plain })
      const copy = new Response(res.body, res)
      for (const [name, value] of Object.entries(common)) copy.headers.set(name, value)
      return copy
    }
    return inner(input, init)
  }) as typeof fetch
  return Object.assign(base, { writes })
}

let api: FakeApi & { writes: Array<{ method: string; path: string; headers: Headers; body: string | undefined }> }

beforeEach(() => {
  api = visitorApi()
  vi.stubGlobal('fetch', api.fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** A single-site first-party Worker (the binding and BACKGOLD_SITE_ID), its own KV per test. */
function firstParty(over: Partial<BackgoldEnv> = {}, cache = fakeCache()): MiddlewareDeps & { cache: ReturnType<typeof fakeCache> } {
  return {
    env: { BACKGOLD_SITE_ID: SITE_ID, BACKGOLD_API: { fetch: (input, init) => api.fetch(input, init) }, BACKGOLD_API_ORIGIN: API_ORIGIN, BACKGOLD_CACHE: fakeKv(), ...over },
    cache,
    buildId: 'b1',
  }
}

const html = () => vi.fn(async (_rewrite?: string) => new Response('<html>rendered</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))
const bgOf = (ctx: { locals: object }) => (ctx.locals as { backgold: BackgoldLocals }).backgold
const visitorCalls = () => api.writes.filter((w) => w.path === '/visitor' && w.method === 'GET')

describe('the middleware with a signed-in visitor', () => {
  it('never reads or writes the edge cache for a request carrying bg_visitor, and answers it private', async () => {
    const d = firstParty()
    await runMiddleware(fakeContext('/'), html(), d)
    expect(d.cache.stored.size).toBe(1)

    const next = html()
    const ctx = fakeContext('/', { cookies: { bg_visitor: TOKEN } })
    const res = await runMiddleware(ctx, next, d)
    expect(next).toHaveBeenCalled()
    expect(res.headers.has('X-Backgold-Cache')).toBe(false)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(d.cache.stored.size).toBe(1)

    await runMiddleware(fakeContext('/about', { cookies: { bg_visitor: TOKEN } }), html(), d)
    expect([...d.cache.stored.keys()].some((k) => k.includes('/about'))).toBe(false)
  })

  it('reads the visitor once per request with the header, never the cookie, and hands it to the render', async () => {
    const ctx = fakeContext('/', { cookies: { bg_visitor: TOKEN } })
    await runMiddleware(ctx, html(), firstParty())
    const bg = bgOf(ctx)
    expect(bg.visitor).toEqual(DANA)
    expect(bg.visitorReads?.visitor).toBe(TOKEN)
    expect(visitorCalls()).toHaveLength(1)
    expect(visitorCalls()[0]!.headers.get('X-BackGold-Visitor')).toBe(TOKEN)
    for (const w of api.writes) expect(w.headers.has('Cookie')).toBe(false)
    expect(ctx.deletedCookies).toEqual([])
  })

  it('clears the cookie when the api answers null, and draws the page signed out', async () => {
    const ctx = fakeContext('/', { cookies: { bg_visitor: 'visitor.revoked.sig' } })
    const res = await runMiddleware(ctx, html(), firstParty())
    expect(bgOf(ctx).visitor).toBeNull()
    expect(bgOf(ctx).visitorReads).toBeUndefined()
    expect(ctx.deletedCookies).toEqual([{ name: 'bg_visitor', options: { path: '/' } }])
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('clears a cookie no header could carry without asking the api', async () => {
    const ctx = fakeContext('/', { cookies: { bg_visitor: 'two words' } })
    await runMiddleware(ctx, html(), firstParty())
    expect(ctx.deletedCookies.map((c) => c.name)).toEqual(['bg_visitor'])
    expect(visitorCalls()).toHaveLength(0)
  })

  it('rewrites the cookie with a renewed token, and the reads after it carry the new one', async () => {
    api = visitorApi({ renew: true })
    vi.stubGlobal('fetch', api.fetch)
    const ctx = fakeContext('/', { cookies: { bg_visitor: TOKEN } })
    await runMiddleware(ctx, html(), firstParty())
    expect(ctx.setCookies.filter((c) => c.name === 'bg_visitor')).toEqual([
      { name: 'bg_visitor', value: FRESH, options: { path: '/', maxAge: 2592000, sameSite: 'lax', secure: true, httpOnly: true } },
    ])
    expect(bgOf(ctx).visitorReads?.visitor).toBe(FRESH)
  })

  it('drops Secure from a renewed cookie on plain http localhost only', async () => {
    api = visitorApi({ renew: true })
    vi.stubGlobal('fetch', api.fetch)
    const ctx = fakeContext('/', { cookies: { bg_visitor: TOKEN }, origin: 'http://localhost:4321' })
    await runMiddleware(ctx, html(), firstParty({ SITE_URL: undefined }))
    expect(ctx.setCookies.find((c) => c.name === 'bg_visitor')?.options).toMatchObject({ secure: false, httpOnly: true })
  })

  it('reads no visitor on the machine routes or the /_backgold/ routes, and keeps those out of the cache', async () => {
    const d = firstParty()
    for (const path of ['/api/backgold/webhook', '/_backgold/sign-out', '/_backgold/sign-in']) {
      await runMiddleware(fakeContext(path, { cookies: { bg_visitor: TOKEN } }), html(), d)
    }
    const res = await runMiddleware(fakeContext('/_backgold/sign-in'), html(), d)
    expect(res.headers.has('X-Backgold-Cache')).toBe(false)
    expect(visitorCalls()).toHaveLength(0)
    expect(d.cache.stored.size).toBe(0)
  })

  it('leaves an anonymous request as it was: no visitor read, cached', async () => {
    const ctx = fakeContext('/')
    const res = await runMiddleware(ctx, html(), firstParty())
    expect(bgOf(ctx).visitor).toBeNull()
    expect(visitorCalls()).toHaveLength(0)
    expect(res.headers.get('X-Backgold-Cache')).toBe('MISS')
  })
})

// ── The routes ───────────────────────────────────────────────────────────────

async function routeDeps(path: string, opts: { cookies?: Record<string, string>; env?: Partial<BackgoldEnv>; origin?: string } = {}) {
  const ctx = fakeContext(path, { cookies: opts.cookies, origin: opts.origin })
  const bg = await backgoldFor(firstParty(opts.env).env, ctx)
  const deps: VisitorRouteDeps = { bg, cookies: ctx.cookies, apiOrigin: opts.env?.BACKGOLD_API_ORIGIN ?? 'https://api.backgold.com' }
  return { ctx, deps, url: ctx.url }
}

describe('/_backgold/sign-in', () => {
  it('sends the visitor to the portal’s door for this site with the path and the title', async () => {
    const { deps, url } = await routeDeps('/_backgold/sign-in?return=%2Fcourses%2Ffoundations%2Fone%3Fat%3D2&title=Lesson%205%3A%20Decide%3Cb%3E')
    const res = handleSignIn(new Request(url), deps)
    expect(res.status).toBe(302)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const to = new URL(res.headers.get('Location')!)
    expect(to.origin).toBe('https://giving.backgold.com')
    expect(to.pathname).toBe('/site-signin')
    expect(Object.fromEntries(to.searchParams)).toEqual({ site: SITE_ID, return: '/courses/foundations/one?at=2', title: 'Lesson 5: Decideb' })
  })

  it('returns to / for anything but a path on this site', async () => {
    for (const raw of ['https://evil.example/', '//evil.example', '/\\evil.example', '/%2e%2e/x', 'courses', '/a b', '/\t/evil.example']) {
      const { deps, url } = await routeDeps(`/_backgold/sign-in?return=${encodeURIComponent(raw)}`)
      const to = new URL(handleSignIn(new Request(url), deps).headers.get('Location')!)
      expect(to.searchParams.get('return'), raw).toBe('/')
      expect(to.searchParams.has('title')).toBe(false)
    }
  })

  it('names the staging portal for an api on backgold.dev or a local host', () => {
    expect(portalOrigin('https://api.backgold.dev')).toBe('https://giving.backgold.dev')
    expect(portalOrigin('http://localhost:8787')).toBe('https://giving.backgold.dev')
    expect(portalOrigin('https://api.backgold.com')).toBe('https://giving.backgold.com')
    expect(portalOrigin('https://api.backgold.dev.evil.example')).toBe('https://giving.backgold.com')
  })

  it('answers 404 on a site that reads with a key', async () => {
    const ctx = fakeContext('/_backgold/sign-in')
    const bg = await backgoldFor({ BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: API_ORIGIN, BACKGOLD_CACHE: fakeKv() }, ctx)
    expect(handleSignIn(new Request(ctx.url), { bg, cookies: ctx.cookies, apiOrigin: API_ORIGIN }).status).toBe(404)
  })
})

describe('/_backgold/visitor', () => {
  it('redeems the code, sets the HttpOnly token cookie and returns to the path with the notice fragment', async () => {
    const { ctx, deps, url } = await routeDeps('/_backgold/visitor?code=good&return=%2Fcourses%2Ffoundations%2Fone%23top')
    const res = await handleVisitorReturn(new Request(url), deps)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/courses/foundations/one#signed-in')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(ctx.setCookies).toEqual([{ name: 'bg_visitor', value: TOKEN, options: { path: '/', maxAge: 2592000, sameSite: 'lax', secure: true, httpOnly: true } }])
    const exchange = api.writes.find((w) => w.path === '/visitor/exchange')!
    expect(exchange.headers.get('X-BackGold-Site')).toBe(SITE_ID)
    expect(JSON.parse(exchange.body!)).toEqual({ code: 'good' })
  })

  it('returns to / for a return path off the site', async () => {
    const { deps, url } = await routeDeps('/_backgold/visitor?code=good&return=https%3A%2F%2Fevil.example%2F')
    expect((await handleVisitorReturn(new Request(url), deps)).headers.get('Location')).toBe('/#signed-in')
  })

  it('draws the expired page, with the way back to the door, for a used or missing code', async () => {
    for (const query of ['code=used&return=%2Fcourses%2Ffoundations', 'return=%2Fcourses%2Ffoundations']) {
      const { ctx, deps, url } = await routeDeps(`/_backgold/visitor?${query}`)
      const res = await handleVisitorReturn(new Request(url), deps)
      expect(res.status).toBe(400)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      const body = await res.text()
      expect(body).toContain('That sign-in link has expired. <a href="/_backgold/sign-in?return=%2Fcourses%2Ffoundations">Sign in again.</a>')
      expect(ctx.setCookies).toEqual([])
    }
  })
})

describe('/_backgold/sign-out', () => {
  it('ends the token at the api, clears the cookie and returns to the path', async () => {
    const { ctx, deps, url } = await routeDeps('/_backgold/sign-out?return=%2Fcourses', { cookies: { bg_visitor: TOKEN } })
    const res = await handleSignOut(new Request(url), deps)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/courses')
    expect(ctx.deletedCookies).toEqual([{ name: 'bg_visitor', options: { path: '/' } }])
    const ended = api.writes.find((w) => w.method === 'DELETE')!
    expect(ended.headers.get('X-BackGold-Visitor')).toBe(TOKEN)
  })

  it('still clears the cookie when the api cannot be reached, and goes to / for a path off the site', async () => {
    const { ctx, deps, url } = await routeDeps('/_backgold/sign-out?return=%2F%2Fevil.example', { cookies: { bg_visitor: TOKEN } })
    const bg = deps.bg as { client: { signOutVisitor: (t: string) => Promise<void> } }
    bg.client.signOutVisitor = async () => Promise.reject(new TypeError('network'))
    const res = await handleSignOut(new Request(url), deps)
    expect(res.headers.get('Location')).toBe('/')
    expect(ctx.deletedCookies.map((c) => c.name)).toEqual(['bg_visitor'])
  })
})

describe('/_backgold/progress', () => {
  const post = (url: URL, body: unknown, headers: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' }) =>
    new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('forwards the visitor’s progress with the header and answers the api’s JSON', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress', { cookies: { bg_visitor: TOKEN } })
    const res = await handleProgress(post(url, { course: 'foundations', lesson: 'one', completed: true, position_seconds: 12.7 }), deps)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toMatchObject({ progress: { completed: true }, course: { completed: 1 } })
    const sent = api.writes.find((w) => w.path.endsWith('/progress'))!
    expect(sent.headers.get('X-BackGold-Visitor')).toBe(TOKEN)
    expect(sent.headers.has('Cookie')).toBe(false)
    expect(JSON.parse(sent.body!)).toEqual({ completed: true, position_seconds: 12 })
  })

  it('accepts an Origin equal to the site’s when the browser sends no Sec-Fetch-Site', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress', { cookies: { bg_visitor: TOKEN } })
    const res = await handleProgress(post(url, { course: 'foundations', lesson: 'one', completed: true }, { Origin: url.origin }), deps)
    expect(res.status).toBe(200)
  })

  it('refuses a request from another site, or one that says nothing of where it came from', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress', { cookies: { bg_visitor: TOKEN } })
    const asked: Array<Record<string, string>> = [{ 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { Origin: 'https://evil.example' }, {}]
    for (const headers of asked) {
      const res = await handleProgress(post(url, { course: 'foundations', lesson: 'one', completed: true }, headers), deps)
      expect(res.status, JSON.stringify(headers)).toBe(403)
    }
    expect(api.writes.filter((w) => w.path.endsWith('/progress'))).toEqual([])
  })

  it('answers 401 without the cookie and sends nothing', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress')
    const res = await handleProgress(post(url, { course: 'foundations', lesson: 'one', completed: true }), deps)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Sign in to save your place.', code: 'VISITOR_REQUIRED' })
    expect(api.writes).toEqual([])
  })

  it('answers 400 for a body it cannot forward', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress', { cookies: { bg_visitor: TOKEN } })
    for (const body of ['not json', [], { course: 'foundations', lesson: 'one' }, { course: '../x', lesson: 'one', completed: true }, { course: 'foundations', lesson: 'one', completed: 'yes' }, { course: 'foundations', lesson: 'one', position_seconds: -1 }, 'x'.repeat(3000)]) {
      const res = await handleProgress(post(url, body), deps)
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400)
    }
  })
})

describe('/_backgold/progress as a form post', () => {
  const form = (url: URL, fields: Record<string, string>, headers: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' }) =>
    new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields).toString() })
  const fields = { course: 'foundations', lesson: 'one', completed: 'true', return: '/courses/foundations/one' }

  it('forwards the fields as their JSON values and answers 303 to the return path', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress', { cookies: { bg_visitor: TOKEN } })
    const res = await handleProgress(form(url, { ...fields, position_seconds: '12' }), deps)
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/courses/foundations/one')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const sent = api.writes.find((w) => w.path.endsWith('/progress'))!
    expect(sent.headers.get('X-BackGold-Visitor')).toBe(TOKEN)
    expect(JSON.parse(sent.body!)).toEqual({ completed: true, position_seconds: 12 })
  })

  it('sends a return path off the site to /', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress', { cookies: { bg_visitor: TOKEN } })
    for (const back of ['//evil.example', 'https://evil.example/x', '/a/%2E%2E/b']) {
      const res = await handleProgress(form(url, { ...fields, return: back }), deps)
      expect(res.headers.get('Location'), back).toBe('/')
    }
  })

  it('refuses a form from another site as the JSON path does', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress', { cookies: { bg_visitor: TOKEN } })
    for (const headers of [{ 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'https://evil.example' }, {}] as Array<Record<string, string>>) {
      const res = await handleProgress(form(url, fields, headers), deps)
      expect(res.status, JSON.stringify(headers)).toBe(403)
    }
    expect(api.writes.filter((w) => w.path.endsWith('/progress'))).toEqual([])
  })

  it('sends a visitor with no cookie to the sign-in door, coming back to the lesson, and saves nothing', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress')
    const res = await handleProgress(form(url, fields), deps)
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/_backgold/sign-in?return=%2Fcourses%2Ffoundations%2Fone')
    expect(api.writes).toEqual([])
  })

  it('answers 400 for fields it cannot forward', async () => {
    const { deps, url } = await routeDeps('/_backgold/progress', { cookies: { bg_visitor: TOKEN } })
    for (const bad of [{ course: 'foundations', lesson: 'one' }, { ...fields, completed: 'yes' }, { ...fields, completed: undefined, position_seconds: '-1' }, { ...fields, course: '../x' }]) {
      const clean = Object.fromEntries(Object.entries(bad).filter(([, v]) => v !== undefined)) as Record<string, string>
      const res = await handleProgress(form(url, clean), deps)
      expect(res.status, JSON.stringify(clean)).toBe(400)
    }
    expect(api.writes.filter((w) => w.path.endsWith('/progress'))).toEqual([])
  })
})

describe('safeReturnPath', () => {
  it('keeps a path and its query, drops the fragment, and refuses everything else', () => {
    expect(safeReturnPath('/courses/foundations?at=2#notes')).toBe('/courses/foundations?at=2')
    for (const raw of [null, '', 'x', '//evil.example', '/\\x', '/..', '/a/%2E%2E/b', '/%zz', 'javascript:alert(1)']) expect(safeReturnPath(raw), String(raw)).toBe('/')
  })
})

// ── resolveRoute ─────────────────────────────────────────────────────────────

describe('resolveRoute: the courses', () => {
  const course: ContentTypeSummary = { key: 'course', singular_label: 'Course', plural_label: 'Courses', routable: true, url_base: 'courses', built_in: true, index: null, fields: [] }
  const lessonAnswer = { lesson: { ...(CONTENT_API_EXAMPLES.EntryResponse as { entry: object }).entry, slug: 'one', type: 'video' }, course: { slug: 'foundations' }, previous: null, next: null, areas: { sidebar: [] } }

  function coursesApi() {
    const calls: Array<{ key: string; visitor: string | null }> = []
    const routes: Record<string, unknown> = {
      '/site': CONTENT_API_EXAMPLES.SiteResponse,
      '/pages': { pages: [] },
      '/types': { types: [course] },
      '/entries/course?limit=50': { entries: [], next_cursor: null, areas: {} },
      '/entries/course/foundations': { entry: { ...(CONTENT_API_EXAMPLES.EntryResponse as { entry: object }).entry, slug: 'foundations', type: 'course' }, areas: {} },
      '/courses/foundations/one': lessonAnswer,
      '/terms/foundations': { taxonomy: { key: 'foundations', label: 'F' }, terms: [] },
    }
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const key = `${url.pathname.replace(/^\/api\/content\/v1/, '')}${url.search}`
      calls.push({ key, visitor: new Headers(init?.headers).get('X-BackGold-Visitor') })
      const body = routes[key]
      const headers = { 'X-Content-Version': '184', ETag: '"v184"' }
      return body === undefined ? Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers }) : Response.json(body, { headers })
    }) as typeof globalThis.fetch
    return { client: createClient({ key: PK, apiOrigin: API_ORIGIN, cache: memoryCache(), fetch }), calls }
  }

  it('resolves the list, a course and a lesson at the course type’s base', async () => {
    const { client } = coursesApi()
    expect(await resolveRoute(client, '/courses')).toMatchObject({ kind: 'index', type: course, base: 'courses' })
    expect(await resolveRoute(client, '/courses/foundations')).toMatchObject({ kind: 'entry', type: course, entry: { slug: 'foundations' } })
    expect(await resolveRoute(client, '/courses/foundations/one')).toEqual({
      kind: 'lesson',
      type: course,
      base: 'courses',
      courseSlug: 'foundations',
      lessonSlug: 'one',
      lesson: lessonAnswer,
      areas: { sidebar: [] },
    })
  })

  it('falls through to a term, then not_found, when the course has no such lesson', async () => {
    const { client, calls } = coursesApi()
    expect(await resolveRoute(client, '/courses/foundations/two')).toEqual({ kind: 'not_found' })
    expect(calls.map((c) => c.key)).toContain('/terms/foundations')
    expect(await resolveRoute(client, '/courses/foundations/one/more')).toEqual({ kind: 'not_found' })
  })

  it('reads the entry, the list and the lesson for the visitor it is given', async () => {
    const { client, calls } = coursesApi()
    const reads = { visitor: TOKEN }
    await resolveRoute(client, '/courses', reads)
    await resolveRoute(client, '/courses/foundations', reads)
    await resolveRoute(client, '/courses/foundations/one', reads)
    const sent = (key: string) => calls.filter((c) => c.key === key).map((c) => c.visitor)
    expect(sent('/entries/course?limit=50')).toEqual([TOKEN])
    expect(sent('/entries/course/foundations')).toEqual([TOKEN])
    expect(sent('/courses/foundations/one')).toEqual([TOKEN])
    expect(sent('/types').every((v) => v === null)).toBe(true)
  })
})
