import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backgoldFor, type BackgoldLocals } from '../src/server/context.js'
import type { BackgoldEnv } from '../src/server/env.js'
import { API_ORIGIN, PK, SITE_ID, fakeApi, fakeContext, fakeKv, type FakeApi } from './fixtures.js'

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
    expect(bg).toMatchObject({ setup: null, firstParty: true, version: 184 })
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

    const setup = locals(await backgoldFor({ BACKGOLD_API: binding() }, fakeContext('/')))
    expect(setup).toMatchObject({ firstParty: false, setup: { missing: ['BACKGOLD_SITE_KEY'] } })
  })
})
