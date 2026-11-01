import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backgoldFor, type BackgoldLocals } from '../src/server/context.js'
import type { BackgoldEnv } from '../src/server/env.js'
import { API_ORIGIN, OTHER_SITE_ID, PK, SITE_ID, fakeApi, fakeContext, fakeKv, type FakeApi } from './fixtures.js'

let api: FakeApi
let publicFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  api = fakeApi(184)
  // A first-party site never reaches the api over the public internet.
  publicFetch = vi.fn(async () => {
    throw new Error('public fetch used')
  })
  vi.stubGlobal('fetch', publicFetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** A service binding to the fake api's FirstParty entrypoint; each call is a new binding, so a new isolate client. */
const binding = () => ({ fetch: vi.fn(api.fetch) })

const firstPartyEnv = (overrides: Partial<BackgoldEnv> = {}): BackgoldEnv => ({
  BACKGOLD_SITE_ID: SITE_ID,
  BACKGOLD_API: binding(),
  BACKGOLD_API_ORIGIN: API_ORIGIN,
  SITE_URL: 'https://pinevalleyliberty.org',
  ...overrides,
})

const locals = (bg: BackgoldLocals) => bg as BackgoldLocals & { setup: { missing: string[] } | null }

describe('first-party mode', () => {
  it('needs no site key: reads /site through the binding as the site', async () => {
    const env = firstPartyEnv()
    const bg = await backgoldFor(env, fakeContext('/'))
    expect(bg).toMatchObject({ setup: null, firstParty: true, siteId: SITE_ID, version: 184 })
    expect(bg.site?.id).toBe('cd_8f2a')
    expect(env.BACKGOLD_API!.fetch).toHaveBeenCalled()
    expect(publicFetch).not.toHaveBeenCalled()
    expect(api.calls.map((u) => u.origin)).toEqual([API_ORIGIN])
    for (const headers of api.headers) {
      expect(headers.get('X-BackGold-Site')).toBe(SITE_ID)
      expect(headers.has('Authorization')).toBe(false)
    }
  })

  it('ignores a site key that is also set', async () => {
    await backgoldFor(firstPartyEnv({ BACKGOLD_SITE_KEY: PK }), fakeContext('/'))
    expect(api.headers.every((h) => !h.has('Authorization'))).toBe(true)
  })

  it('reports a missing or unusable binding, and never the site key', async () => {
    for (const BACKGOLD_API of [undefined, {} as never, { fetch: 'no' } as never]) {
      const bg = locals(await backgoldFor(firstPartyEnv({ BACKGOLD_API }), fakeContext('/')))
      expect(bg.firstParty).toBe(true)
      expect(bg.setup).toEqual({ missing: ['BACKGOLD_API'] })
    }
    expect(api.calls).toHaveLength(0)
  })

  it('reports a malformed site id and a malformed api origin', async () => {
    const bg = locals(await backgoldFor(firstPartyEnv({ BACKGOLD_SITE_ID: 'cd 8f2a', BACKGOLD_API_ORIGIN: 'ftp://api.example' }), fakeContext('/')))
    expect(bg.setup).toEqual({ missing: ['BACKGOLD_SITE_ID', 'BACKGOLD_API_ORIGIN'] })
  })

  it('sends the site token from the environment on every read, and none without one', async () => {
    await backgoldFor(firstPartyEnv({ BACKGOLD_SITE_TOKEN: 'tok_site_cd_8f2a' }), fakeContext('/'))
    expect(api.headers.length).toBeGreaterThan(0)
    for (const headers of api.headers) {
      expect(headers.get('X-BackGold-Site')).toBe(SITE_ID)
      expect(headers.get('X-BackGold-Site-Token')).toBe('tok_site_cd_8f2a')
    }
    const seen = api.headers.length
    await backgoldFor(firstPartyEnv({ BACKGOLD_SITE_TOKEN: '  ' }), fakeContext('/'))
    await backgoldFor(firstPartyEnv(), fakeContext('/'))
    expect(api.headers.length).toBeGreaterThan(seen)
    expect(api.headers.slice(seen).every((h) => !h.has('X-BackGold-Site-Token'))).toBe(true)
  })

  it('never takes a site token from the request', async () => {
    await backgoldFor(firstPartyEnv(), fakeContext('/', { headers: { 'X-BackGold-Site-Token': 'tok_from_a_visitor' } }))
    expect(api.headers.length).toBeGreaterThan(0)
    expect(api.headers.every((h) => !h.has('X-BackGold-Site-Token'))).toBe(true)
  })

  it('keeps one client per binding and site id', async () => {
    const env = firstPartyEnv()
    const a = await backgoldFor(env, fakeContext('/'))
    const b = await backgoldFor(env, fakeContext('/issues'))
    expect(a.client).toBe(b.client)
    const c = await backgoldFor({ ...env, BACKGOLD_API: binding() }, fakeContext('/'))
    expect(c.client).not.toBe(a.client)
  })
})

describe('key mode', () => {
  it('is not first-party, and still needs the site key when BACKGOLD_SITE_ID is blank', async () => {
    vi.stubGlobal('fetch', api.fetch)
    const ready = await backgoldFor({ BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: API_ORIGIN, BACKGOLD_CACHE: fakeKv(), BACKGOLD_SITE_ID: '  ' }, fakeContext('/'))
    expect(ready).toMatchObject({ setup: null, firstParty: false })
    expect(api.headers[0]!.get('Authorization')).toBe(`Bearer ${PK}`)
    expect(api.headers[0]!.has('X-BackGold-Site')).toBe(false)

    expect(ready.siteId).toBe('cd_8f2a')

    const setup = locals(await backgoldFor({}, fakeContext('/')))
    expect(setup).toMatchObject({ firstParty: false, siteId: null, setup: { missing: ['BACKGOLD_SITE_KEY'] } })
  })

  it('ignores an X-BackGold-Site a visitor sends: the key names the site', async () => {
    vi.stubGlobal('fetch', api.fetch)
    const bg = await backgoldFor({ BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: API_ORIGIN }, fakeContext('/', { headers: { 'X-BackGold-Site': OTHER_SITE_ID } }))
    expect(bg).toMatchObject({ setup: null, firstParty: false, siteId: 'cd_8f2a' })
    for (const headers of api.headers) {
      expect(headers.get('Authorization')).toBe(`Bearer ${PK}`)
      expect(headers.has('X-BackGold-Site')).toBe(false)
    }
  })
})

/** The client's store scope for a first-party site: 16 hex of SHA-256 of `first-party:<site id>` (client.ts). */
const scopeOf = (siteId: string) => createHash('sha256').update(`first-party:${siteId}`).digest('hex').slice(0, 16)

describe('the dispatched form (binding, no BACKGOLD_SITE_ID)', () => {
  const dispatchedEnv = (overrides: Partial<BackgoldEnv> = {}): BackgoldEnv => ({
    BACKGOLD_API: binding(),
    BACKGOLD_API_ORIGIN: API_ORIGIN,
    ...overrides,
  })
  const asSite = (siteId: string, path = '/', origin?: string) =>
    fakeContext(path, { headers: { 'X-BackGold-Site': siteId }, ...(origin ? { origin } : {}) })

  it('is configured: the site arrives with each request, and no setup is reported', async () => {
    const bg = await backgoldFor(dispatchedEnv(), asSite(SITE_ID))
    expect(bg).toMatchObject({ setup: null, firstParty: true, siteId: SITE_ID })
    expect(publicFetch).not.toHaveBeenCalled()
  })

  it('reads two sites as two sites on one isolate: two clients, each request as its own site', async () => {
    const env = dispatchedEnv({ BACKGOLD_CACHE: fakeKv() })
    const a = await backgoldFor(env, asSite(SITE_ID))
    const seenByA = api.headers.length
    const b = await backgoldFor(env, asSite(OTHER_SITE_ID))
    expect(a.siteId).toBe(SITE_ID)
    expect(b.siteId).toBe(OTHER_SITE_ID)
    expect(a.client).not.toBe(b.client)
    expect(api.headers.slice(0, seenByA).every((h) => h.get('X-BackGold-Site') === SITE_ID)).toBe(true)
    expect(api.headers.slice(seenByA).every((h) => h.get('X-BackGold-Site') === OTHER_SITE_ID)).toBe(true)
    expect(api.headers.every((h) => !h.has('Authorization'))).toBe(true)

    const again = await backgoldFor(env, asSite(SITE_ID, '/issues'))
    expect(again.client).toBe(a.client)
  })

  it('shares no cache entry between sites on one BACKGOLD_CACHE: each client keys under its own scope', async () => {
    const kv = fakeKv()
    const env = dispatchedEnv({ BACKGOLD_CACHE: kv })
    const a = (await backgoldFor(env, asSite(SITE_ID))).client!
    await a.page('home')
    const keysA = new Set(kv.data.keys())
    const b = (await backgoldFor(env, asSite(OTHER_SITE_ID))).client!
    await b.page('home')
    const keysB = [...kv.data.keys()].filter((key) => !keysA.has(key))

    expect(keysA.size).toBeGreaterThan(0)
    expect(keysB.length).toBeGreaterThan(0)
    expect([...keysA].every((key) => key.startsWith(`${scopeOf(SITE_ID)}:`))).toBe(true)
    expect(keysB.every((key) => key.startsWith(`${scopeOf(OTHER_SITE_ID)}:`))).toBe(true)
    expect(kv.data.has(`${scopeOf(SITE_ID)}:version`)).toBe(true)
    expect(kv.data.has(`${scopeOf(OTHER_SITE_ID)}:version`)).toBe(true)
    // B read the same paths A had stored, from the api, never from A's entries.
    expect(api.calls.filter((u) => u.pathname.endsWith('/pages/home'))).toHaveLength(2)
  })

  it('keeps clients for 32 sites, dropping the least recently used', async () => {
    const env = dispatchedEnv()
    const ids = Array.from({ length: 33 }, (_, i) => `site_${i}`)
    const first = new Map<string, unknown>()
    for (const id of ids.slice(0, 32)) first.set(id, (await backgoldFor(env, asSite(id))).client)
    expect((await backgoldFor(env, asSite('site_0'))).client).toBe(first.get('site_0'))
    await backgoldFor(env, asSite('site_32'))
    expect((await backgoldFor(env, asSite('site_0'))).client).toBe(first.get('site_0'))
    expect((await backgoldFor(env, asSite('site_1'))).client).not.toBe(first.get('site_1'))
  })

  it('lets BACKGOLD_SITE_ID win over the header', async () => {
    const env = firstPartyEnv()
    const bg = await backgoldFor(env, asSite(OTHER_SITE_ID))
    expect(bg.siteId).toBe(SITE_ID)
    expect(api.headers.every((h) => h.get('X-BackGold-Site') === SITE_ID)).toBe(true)
  })

  it('takes every site’s origin from its request, never SITE_URL', async () => {
    const bg = await backgoldFor(dispatchedEnv({ SITE_URL: 'https://one-site.example' }), asSite(SITE_ID, '/', 'https://westmark.example'))
    expect(bg.siteUrl).toBe('https://westmark.example')
  })

  it('reports only a malformed api origin, and stays first-party', async () => {
    const bg = locals(await backgoldFor(dispatchedEnv({ BACKGOLD_API_ORIGIN: 'ftp://api.example' }), asSite(SITE_ID)))
    expect(bg).toMatchObject({ firstParty: true, siteId: null, setup: { missing: ['BACKGOLD_API_ORIGIN'] } })
    expect(api.calls).toHaveLength(0)
  })

  it('refuses to build a request’s state with no well-formed X-BackGold-Site (the middleware answers 404 first)', async () => {
    const env = dispatchedEnv()
    for (const context of [fakeContext('/'), asSite('cd 8f2a'), asSite('x'.repeat(65)), asSite('../cd_8f2a')]) {
      await expect(backgoldFor(env, context)).rejects.toThrow(/No site/)
    }
    expect(api.calls).toHaveLength(0)
  })
})
