import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { entryExample, pageExample } from '@backgold/contract/content-api-examples'
import { createClient } from './client.js'
import { memoryCache } from './cache.js'
import type { CacheStore, ClientOptions } from './contract.js'

// A visitor's reads and writes: the X-BackGold-Visitor header, the store left
// alone, the renewed token handed on, and the visitor's three calls.

const PK = 'bg_site_pk_testPublishable0001'
const SITE = 'cd_8f2a'
const TOKEN = 'visitor.eyJhaWQiOiJkYV8xIn0.c2ln'
const FRESH = 'visitor.eyJhaWQiOiJkYV8xIiwiZXhwIjoyfQ.bmV3'

interface Call {
  path: string
  method: string
  headers: Headers
  body: string | undefined
}

const visitorBody = { visitor: { first_name: 'Dana', email: 'dana.m@example.com', member: false } }
const courseBody = { course: { slug: 'foundations', lessons: [] }, areas: {} }
const lessonBody = { lesson: entryExample.entry, course: courseBody.course, previous: null, next: null, areas: {} }
const progressBody = {
  progress: { completed: true, completed_at: '2026-10-18T00:00:00.000Z', position_seconds: 312 },
  course: { completed: 1, total: 4, openable: 4, seconds_left: 900, next_lesson_slug: 'two' },
}

function fakeApi(opts: { renew?: string } = {}) {
  const calls: Call[] = []
  const answer = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const path = url.pathname.replace(/^\/api\/content\/v1/, '')
    const method = init?.method ?? 'GET'
    calls.push({ path: `${path}${url.search}`, method, headers, body: typeof init?.body === 'string' ? init.body : undefined })
    const common: Record<string, string> = { 'X-Content-Version': '184' }
    if (headers.has('X-BackGold-Visitor')) {
      common['Cache-Control'] = 'private, no-store'
      if (opts.renew !== undefined) common['X-BackGold-Visitor-Renew'] = opts.renew
    }
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: common })
    if (path === '/site') return json({ site: { id: SITE }, version: 184 })
    if (path === '/pages/home') return json(pageExample)
    if (path === '/entries/post/levy-explained') return json(entryExample)
    if (path === '/courses') return json({ courses: [], next_cursor: null, areas: {} })
    if (path === '/courses/foundations') return json(courseBody)
    if (path === '/courses/foundations/one') return json(lessonBody)
    if (path === '/courses/foundations/one/progress' && method === 'POST') {
      return headers.has('X-BackGold-Visitor') ? json(progressBody) : json({ error: 'Sign in first', code: 'VISITOR_REQUIRED' }, 401)
    }
    if (path === '/visitor' && method === 'GET') return json(headers.get('X-BackGold-Visitor') === TOKEN ? visitorBody : { visitor: null })
    if (path === '/visitor' && method === 'DELETE') return new Response(null, { status: 204, headers: common })
    if (path === '/visitor/exchange' && method === 'POST') {
      const { code } = JSON.parse(String(init?.body)) as { code: string }
      return code === 'good'
        ? json({ token: TOKEN, expires_at: '2026-10-18T01:00:00.000Z', visitor: visitorBody.visitor })
        : json({ error: 'That sign-in link has expired', code: 'BAD_VISITOR_CODE' }, 400)
    }
    return json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  }) as typeof globalThis.fetch
  return { calls, fetch: answer, callsTo: (path: string) => calls.filter((c) => c.path === path) }
}

function recordingStore() {
  const inner = memoryCache()
  const ops: string[] = []
  const store: CacheStore = {
    get: (key) => (ops.push(`get ${key}`), inner.get(key)),
    set: (key, value, ttl) => (ops.push(`set ${key}`), inner.set(key, value, ttl)),
    delete: (key) => (ops.push(`delete ${key}`), inner.delete(key)),
    clear: () => (ops.push('clear'), inner.clear()),
  }
  return { store, ops }
}

function setup(opts: Partial<ClientOptions> = {}, api = fakeApi()) {
  const rec = recordingStore()
  const client = createClient({ firstParty: { siteId: SITE }, fetch: api.fetch, cache: rec.store, ...opts } as ClientOptions)
  return { api, rec, client }
}

describe('visitor reads', () => {
  it('sends X-BackGold-Visitor and never reads or writes the store', async () => {
    const { api, rec, client } = setup()
    assert.deepEqual(await client.page('home', { visitor: TOKEN }), pageExample)
    assert.deepEqual(await client.entry('post', 'levy-explained', { visitor: TOKEN }), entryExample)
    assert.deepEqual(await client.course('foundations', { visitor: TOKEN }), courseBody)
    assert.deepEqual(await client.lesson('foundations', 'one', { visitor: TOKEN }), lessonBody)
    assert.deepEqual(await client.courses({ visitor: TOKEN, limit: 12 }), { courses: [], next_cursor: null, areas: {} })
    assert.deepEqual(rec.ops, [])
    for (const call of api.calls) assert.equal(call.headers.get('X-BackGold-Visitor'), TOKEN)
    assert.equal(api.callsTo('/courses?limit=12').length, 1)
  })

  it('keeps an anonymous read of the same address on the store, and never answers a visitor from it', async () => {
    const { api, rec, client } = setup()
    await client.course('foundations')
    await client.course('foundations')
    assert.equal(api.callsTo('/courses/foundations').length, 1)
    assert.ok(rec.ops.some((op) => op.startsWith('set ') && op.endsWith(':/courses/foundations?')))
    const before = rec.ops.length
    await client.course('foundations', { visitor: TOKEN })
    assert.equal(rec.ops.length, before)
    assert.equal(api.callsTo('/courses/foundations').length, 2)
    assert.equal(api.callsTo('/courses/foundations').at(-1)!.headers.has('If-None-Match'), false)
  })

  it('reads for the client’s own visitor on every call', async () => {
    const { api, rec, client } = setup({ visitor: TOKEN })
    await client.page('home')
    await client.course('foundations')
    assert.deepEqual(rec.ops.filter((op) => op.includes('/pages/home') || op.includes('/courses')), [])
    for (const call of api.calls.filter((c) => c.path !== '/site')) assert.equal(call.headers.get('X-BackGold-Visitor'), TOKEN)
  })

  it('hands a renewed token to the per-call callback, else the client’s', async () => {
    const api = fakeApi({ renew: FRESH })
    const fromClient: string[] = []
    const { client } = setup({ onVisitorRenew: (t) => fromClient.push(t) }, api)
    const perCall: string[] = []
    await client.lesson('foundations', 'one', { visitor: TOKEN, onVisitorRenew: (t) => perCall.push(t) })
    assert.deepEqual(perCall, [FRESH])
    assert.deepEqual(fromClient, [])
    await client.course('foundations', { visitor: TOKEN })
    await client.visitor(TOKEN)
    assert.deepEqual(fromClient, [FRESH, FRESH])
  })

  it('never hands on a malformed renewal', async () => {
    const renewed: string[] = []
    const { client } = setup({}, fakeApi({ renew: 'two words' }))
    await client.course('foundations', { visitor: TOKEN, onVisitorRenew: (t) => renewed.push(t) })
    assert.deepEqual(renewed, [])
  })

  it('refuses a token a header cannot carry, without naming it', async () => {
    const { api, client } = setup()
    for (const bad of ['', 'has space', 'line\nbreak', 'x'.repeat(4097)]) {
      await assert.rejects(client.course('foundations', { visitor: bad }), (error: Error) => error instanceof TypeError && !error.message.includes(bad || '\u0000'))
      await assert.rejects(client.visitor(bad), TypeError)
    }
    assert.throws(() => createClient({ firstParty: { siteId: SITE }, fetch: api.fetch, visitor: 'has space' }), TypeError)
    assert.equal(api.calls.length, 0)
  })
})

describe('the visitor’s calls', () => {
  it('visitor(token) answers who it is, or null for a token the api no longer takes', async () => {
    const { client } = setup()
    assert.deepEqual(await client.visitor(TOKEN), visitorBody)
    assert.deepEqual(await client.visitor('visitor.expired.sig'), { visitor: null })
  })

  it('lessonProgress POSTs the JSON body with the visitor header', async () => {
    const { api, rec, client } = setup()
    assert.deepEqual(await client.lessonProgress('foundations', 'one', { completed: true, position_seconds: 312 }, TOKEN), progressBody)
    const call = api.callsTo('/courses/foundations/one/progress')[0]!
    assert.equal(call.method, 'POST')
    assert.equal(call.headers.get('X-BackGold-Visitor'), TOKEN)
    assert.equal(call.headers.get('Content-Type'), 'application/json')
    assert.deepEqual(JSON.parse(call.body!), { completed: true, position_seconds: 312 })
    assert.deepEqual(rec.ops, [])
  })

  it('exchangeVisitor redeems a code first-party, and surfaces the api’s error for a used one', async () => {
    const { api, client } = setup()
    const answer = await client.exchangeVisitor('good')
    assert.equal(answer.token, TOKEN)
    const call = api.callsTo('/visitor/exchange')[0]!
    assert.equal(call.method, 'POST')
    assert.equal(call.headers.get('X-BackGold-Site'), SITE)
    assert.equal(call.headers.has('X-BackGold-Visitor'), false)
    assert.deepEqual(JSON.parse(call.body!), { code: 'good' })
    await assert.rejects(client.exchangeVisitor('used'), { name: 'BackgoldApiError', status: 400, code: 'BAD_VISITOR_CODE' })
  })

  it('exchangeVisitor is refused before any request on a key client', async () => {
    const api = fakeApi()
    const client = createClient({ key: PK, fetch: api.fetch })
    await assert.rejects(client.exchangeVisitor('good'), { name: 'BackgoldApiError', status: 403, code: 'FIRST_PARTY_REQUIRED' })
    assert.equal(api.calls.length, 0)
  })

  it('signOutVisitor sends DELETE /visitor with the token', async () => {
    const { api, client } = setup()
    assert.equal(await client.signOutVisitor(TOKEN), undefined)
    const call = api.callsTo('/visitor')[0]!
    assert.equal(call.method, 'DELETE')
    assert.equal(call.headers.get('X-BackGold-Visitor'), TOKEN)
  })
})
