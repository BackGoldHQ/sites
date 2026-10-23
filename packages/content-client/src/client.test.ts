import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { afterEach, describe, it } from 'node:test'
import {
  areasExample,
  areasResponseExample,
  authorExample,
  authorsExample,
  entriesExample,
  entryExample,
  eventsExample,
  menuExample,
  pageExample,
  pagesExample,
  redirectsExample,
  sectionsExample,
  shiftsExample,
  siteExample,
  sitemapExample,
  termsExample,
  typesExample,
} from '@backgold/contract/content-api-examples'
import { createClient } from './client.js'
import { memoryCache } from './cache.js'
import type { CacheStore, ClientOptions, Entry } from './contract.js'
import { BackgoldApiError, SecretKeyInBrowserError } from './errors.js'

const PK = 'bg_site_pk_testPublishable0001'
const SK = 'bg_site_sk_testSecret0001'
const scopeOf = (key: string) => createHash('sha256').update(key).digest('hex').slice(0, 16)

// ── A fake Content API ───────────────────────────────────────────────────────
//
// Answers from the shared examples the way routes/content-api.ts does:
// X-Content-Version on every answer, ETag "v<version>" and 304 on a matching
// If-None-Match for published reads, 403 SECRET_KEY_REQUIRED for a preview
// read with a publishable key, `{ error, code }` errors.

interface Call {
  url: URL
  path: string
  headers: Headers
  init: RequestInit | undefined
}
type Answer = { status: number; body?: unknown }
type Handler = (url: URL) => Answer

const ok = (body: unknown): Answer => ({ status: 200, body })
const notFound: Answer = { status: 404, body: { error: 'Not found', code: 'NOT_FOUND' } }

const ROUTES: Record<string, Handler> = {
  '/site': () => ok(siteExample),
  '/menus/primary': () => ok(menuExample),
  '/pages': () => ok(pagesExample),
  '/pages/home': () => ok(pageExample),
  '/sections/town-halls': () => ok(sectionsExample),
  '/types': () => ok(typesExample),
  '/entries/post': (url) =>
    url.searchParams.get('cursor') === 'garbage'
      ? { status: 400, body: { error: 'cursor is not one this API returned', code: 'BAD_CURSOR' } }
      : ok(entriesExample),
  '/entries/post/levy-explained': () => ok(entryExample),
  '/events': (url) =>
    url.searchParams.get('type') === 'gala'
      ? { status: 400, body: { error: 'type must be one of rally, convention, fundraiser, blank', code: 'BAD_TYPE' } }
      : ok(eventsExample),
  '/shifts': () => ok(shiftsExample),
  '/terms/tag': () => ok(termsExample),
  '/authors': () => ok(authorsExample),
  '/authors/dana-k': () => ok(authorExample),
  '/redirects': () => ok(redirectsExample),
  '/sitemap': () => ok(sitemapExample),
  '/areas': (url) =>
    url.searchParams.has('holds')
      ? ok(areasResponseExample)
      : { status: 400, body: { error: 'holds must list module kinds or form:<id>, separated by commas', code: 'BAD_HOLDS' } },
  '/preview/tok_good': () => ok(pageExample),
  '/preview/tok_bad': () => ({ status: 400, body: { error: 'This preview link is not valid or has expired', code: 'BAD_PREVIEW_TOKEN' } }),
}

function fakeApi(version = 184) {
  const api = {
    version,
    /** Answer a 304 without X-Content-Version (to prove the client keys the copy by its ETag). */
    bare304: false,
    calls: [] as Call[],
    routes: { ...ROUTES } as Record<string, Handler>,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const headers = new Headers(init?.headers)
      const path = url.pathname.replace(/^\/api\/content\/v1/, '')
      api.calls.push({ url, path, headers, init })
      const common = { 'X-Content-Version': String(api.version) }
      const preview = url.searchParams.get('preview') === '1' || path.startsWith('/preview/')
      const secretLevel = headers.get('Authorization')?.startsWith('Bearer bg_site_sk_') || headers.has('X-BackGold-Site')
      if (preview && !secretLevel) {
        return Response.json({ error: 'Preview needs a secret site key', code: 'SECRET_KEY_REQUIRED' }, { status: 403, headers: common })
      }
      const published: Record<string, string> = preview ? {} : { ETag: `"v${api.version}"` }
      if (!preview && headers.get('If-None-Match') === `"v${api.version}"`) {
        return new Response(null, { status: 304, headers: api.bare304 ? published : { ...common, ...published } })
      }
      const answer = (api.routes[path] ?? (() => notFound))(url)
      return Response.json(answer.body ?? null, { status: answer.status, headers: { ...common, ...published } })
    }) as typeof fetch,
    /** Calls whose path is `path`. */
    callsTo: (path: string) => api.calls.filter((c) => c.path === path),
  }
  return api
}

/** A memory store that records every key it is asked about. */
function recordingStore() {
  const inner = memoryCache()
  const ops: Array<{ op: 'get' | 'set' | 'delete' | 'clear'; key?: string; ttl?: number }> = []
  const keys = new Set<string>()
  const store: CacheStore = {
    get: (key) => (ops.push({ op: 'get', key }), inner.get(key)),
    set: (key, value, ttl) => (ops.push({ op: 'set', key, ttl }), keys.add(key), inner.set(key, value, ttl)),
    delete: (key) => (ops.push({ op: 'delete', key }), keys.delete(key), inner.delete(key)),
    clear: () => (ops.push({ op: 'clear' }), keys.clear(), inner.clear()),
  }
  return { store, ops, keys, inner }
}

function setup(opts: Partial<ClientOptions> = {}, version = 184) {
  const api = fakeApi(version)
  const rec = recordingStore()
  const client = createClient({ key: PK, fetch: api.fetch, cache: rec.store, ...opts })
  return { api, rec, client }
}

const realNow = Date.now
afterEach(() => {
  Date.now = realNow
})

// ── Happy paths ──────────────────────────────────────────────────────────────

describe('createClient: every named method', () => {
  it('returns each response exactly as the api sent it', async () => {
    const { client } = setup()
    assert.deepEqual(await client.site(), siteExample)
    assert.deepEqual(await client.menu('primary'), menuExample)
    assert.deepEqual(await client.pages(), pagesExample)
    assert.deepEqual(await client.page('home'), pageExample)
    assert.deepEqual(await client.section('town-halls'), sectionsExample)
    assert.deepEqual(await client.types(), typesExample)
    assert.deepEqual(await client.entries('post'), entriesExample)
    assert.deepEqual(await client.entry('post', 'levy-explained'), entryExample)
    assert.deepEqual(await client.events(), eventsExample)
    assert.deepEqual(await client.shifts(), shiftsExample)
    assert.deepEqual(await client.terms('tag'), termsExample)
    assert.deepEqual(await client.authors(), authorsExample)
    assert.deepEqual(await client.author('dana-k'), authorExample)
    assert.deepEqual(await client.redirects(), redirectsExample)
    assert.deepEqual(await client.sitemap(), sitemapExample)
    assert.deepEqual(await client.raw('/pages/home'), pageExample)
  })

  it('returns an entry with its areas', async () => {
    const { client } = setup()
    const post = await client.entry('post', 'levy-explained')
    assert.deepEqual(post?.areas, areasExample)
    assert.deepEqual(post?.entry, entryExample.entry)
  })

  it('reads the preview link with a secret key', async () => {
    const { client } = setup({ key: SK })
    assert.deepEqual(await client.preview('tok_good'), pageExample)
  })

  it('sends only Authorization, Accept and If-None-Match, to apiOrigin, never following a redirect', async () => {
    const { api, client } = setup({ apiOrigin: 'https://api.example.test///' })
    await client.page('home')
    for (const call of api.calls) {
      assert.equal(call.url.origin, 'https://api.example.test')
      assert.ok(call.url.pathname.startsWith('/api/content/v1/'))
      assert.equal(call.headers.get('Authorization'), `Bearer ${PK}`)
      assert.equal(call.headers.get('Accept'), 'application/json')
      for (const [name] of call.headers) assert.ok(['authorization', 'accept', 'if-none-match'].includes(name), name)
      assert.equal(call.init?.redirect, 'manual')
    }
  })

  it('defaults apiOrigin to https://api.backgold.com', async () => {
    const { api, client } = setup()
    await client.site()
    assert.equal(api.calls[0]!.url.origin, 'https://api.backgold.com')
  })
})

// ── Missing and failing reads ────────────────────────────────────────────────

describe('createClient: 404 and errors', () => {
  it('answers null on 404 for the single-resource reads', async () => {
    const { client } = setup({ key: SK })
    assert.equal(await client.menu('utility'), null)
    assert.equal(await client.page('nope'), null)
    assert.equal(await client.section('nope'), null)
    assert.equal(await client.entries('nope'), null)
    assert.equal(await client.entry('post', 'nope'), null)
    assert.equal(await client.terms('nope'), null)
    assert.equal(await client.author('nope'), null)
    assert.equal(await client.raw('/nope'), null)
    assert.equal(await client.preview('tok_gone'), null)
  })

  it('throws BackgoldApiError on 404 for site() and pages()', async () => {
    const pages = setup()
    pages.api.routes['/pages'] = () => notFound
    await assert.rejects(pages.client.pages(), (err: unknown) => {
      assert.ok(err instanceof BackgoldApiError)
      assert.equal(err.name, 'BackgoldApiError')
      assert.equal(err.status, 404)
      assert.equal(err.code, 'NOT_FOUND')
      assert.equal(err.message, 'Not found')
      return true
    })

    const site = setup()
    site.api.routes['/site'] = () => notFound
    await assert.rejects(site.client.site(), { name: 'BackgoldApiError', status: 404, code: 'NOT_FOUND' })
  })

  it('surfaces 400 BAD_CURSOR with its code', async () => {
    const { client } = setup()
    await assert.rejects(client.entries('post', { cursor: 'garbage' }), { name: 'BackgoldApiError', status: 400, code: 'BAD_CURSOR' })
  })

  it('surfaces 400 BAD_PREVIEW_TOKEN from preview()', async () => {
    const { client } = setup({ key: SK })
    await assert.rejects(client.preview('tok_bad'), { status: 400, code: 'BAD_PREVIEW_TOKEN' })
  })

  it('names a body that is not { error, code } HTTP_<status>', async () => {
    const { api, client } = setup()
    api.routes['/types'] = () => ({ status: 502, body: 'upstream' })
    await assert.rejects(client.types(), { status: 502, code: 'HTTP_502' })
  })

  it('refuses a raw path that is not path-absolute or carries a query', async () => {
    const { api, client } = setup()
    await assert.rejects(client.raw('pages'), TypeError)
    await assert.rejects(client.raw('/pages?x=1'), TypeError)
    assert.equal(api.calls.length, 0)
  })
})

// ── Cache ────────────────────────────────────────────────────────────────────

describe('createClient: the cache', () => {
  it('serves a second read without a network call', async () => {
    const { api, client } = setup()
    await client.pages()
    const before = api.calls.length
    assert.deepEqual(await client.pages(), pagesExample)
    assert.deepEqual(await client.site(), siteExample, 'the version check stored /site')
    assert.equal(api.calls.length, before)
  })

  it('keys reads `${scope}:v${version}:${path}?${sortedQuery}` and sends the same sorted query', async () => {
    const { api, rec, client } = setup()
    await client.entries('post', { term: 'taxes', limit: 5, cursor: undefined })
    await client.raw('/entries/post', { term: 'x', cursor: '', limit: undefined, b: '2', a: '1' })
    const scope = scopeOf(PK)
    assert.deepEqual([...rec.keys].sort(), [
      `${scope}:v184:/entries/post?a=1&b=2&term=x`,
      `${scope}:v184:/entries/post?limit=5&term=taxes`,
      `${scope}:v184:/site?`,
      `${scope}:version`,
    ])
    assert.deepEqual(
      api.callsTo('/entries/post').map((c) => c.url.search),
      ['?limit=5&term=taxes', '?a=1&b=2&term=x'],
    )
    for (const key of rec.keys) assert.ok(!key.includes(PK.slice(11)), 'no key material in a store key')
  })

  it('sends and keys an entries search and an events page by their own parameters', async () => {
    const { api, rec, client } = setup()
    await client.entries('post', { q: 'levy', term: 'taxes' })
    await client.entries('post', { q: 'budget' })
    await client.events({ type: 'fundraiser', limit: 5 })
    await client.events({ cursor: 'MjAyNi0xMC0xN1QyMzozMDowMC4wMDBafGV2dF80bTE' })
    await client.events()
    const scope = scopeOf(PK)
    assert.deepEqual([...rec.keys].sort(), [
      `${scope}:v184:/entries/post?q=budget`,
      `${scope}:v184:/entries/post?q=levy&term=taxes`,
      `${scope}:v184:/events?`,
      `${scope}:v184:/events?cursor=MjAyNi0xMC0xN1QyMzozMDowMC4wMDBafGV2dF80bTE`,
      `${scope}:v184:/events?limit=5&type=fundraiser`,
      `${scope}:v184:/site?`,
      `${scope}:version`,
    ])
    assert.deepEqual(
      api.callsTo('/events').map((c) => c.url.search),
      ['?limit=5&type=fundraiser', '?cursor=MjAyNi0xMC0xN1QyMzozMDowMC4wMDBafGV2dF80bTE', ''],
    )
    // A second read of the same search is the stored copy.
    const before = api.calls.length
    await client.entries('post', { q: 'budget' })
    assert.equal(api.calls.length, before)
  })

  it('surfaces 400 BAD_TYPE from events()', async () => {
    const { client } = setup()
    await assert.rejects(client.events({ type: 'gala' }), { name: 'BackgoldApiError', status: 400, code: 'BAD_TYPE' })
  })

  it('stores CachedRead JSON for cacheTtlSeconds', async () => {
    const { rec, client } = setup({ cacheTtlSeconds: 120 })
    await client.page('home')
    const key = `${scopeOf(PK)}:v184:/pages/home?`
    const stored = JSON.parse((await rec.inner.get(key))!)
    assert.deepEqual(JSON.parse(stored.body), pageExample)
    assert.equal(stored.etag, '"v184"')
    assert.equal(typeof stored.fetched_at, 'number')
    assert.ok(rec.ops.filter((o) => o.op === 'set').every((o) => o.ttl === 120))
  })

  it('moves to the version an answer carries, and the next read uses the new key', async () => {
    const { api, rec, client } = setup()
    await client.site()
    assert.equal(client.version(), 184)
    api.version = 185
    await client.page('home')
    assert.equal(client.version(), 185)
    const scope = scopeOf(PK)
    assert.ok(rec.keys.has(`${scope}:v185:/pages/home?`))
    assert.equal(JSON.parse((await rec.inner.get(`${scope}:version`))!).version, 185)

    const before = api.callsTo('/site').length
    await client.site()
    assert.equal(api.callsTo('/site').length, before + 1, '/site at v185 is a miss')
    assert.ok(rec.keys.has(`${scope}:v185:/site?`))
  })

  it('learns the version from a 404 too', async () => {
    const { api, client } = setup()
    await client.site()
    api.version = 190
    assert.equal(await client.page('nope'), null)
    assert.equal(client.version(), 190)
  })

  it('re-checks /site once with If-None-Match after maxVersionAgeSeconds, and a 304 is enough', async () => {
    let now = 1_000_000
    Date.now = () => now
    const { api, client } = setup({ maxVersionAgeSeconds: 60 })
    await client.pages()
    const before = api.calls.length

    now += 30_000
    await client.pages()
    assert.equal(api.calls.length, before, 'still fresh at 30 s')

    now += 31_000
    assert.deepEqual(await client.pages(), pagesExample)
    const after = api.calls.slice(before)
    assert.equal(after.length, 1, 'one conditional /site and nothing else')
    assert.equal(after[0]!.path, '/site')
    assert.equal(after[0]!.headers.get('If-None-Match'), '"v184"')
    assert.equal(client.version(), 184)

    await client.pages()
    assert.equal(api.calls.length, before + 1, 'the 304 re-confirmed the version')
  })

  it('maxVersionAgeSeconds 0 checks on every read', async () => {
    const { api, client } = setup({ maxVersionAgeSeconds: 0 })
    await client.pages()
    await client.pages()
    await client.pages()
    assert.equal(api.callsTo('/site').length, 3)
    assert.equal(api.callsTo('/pages').length, 1)
  })

  it('shares one version check between concurrent reads', async () => {
    const { api, client } = setup()
    await Promise.all([client.pages(), client.types(), client.authors(), client.page('home')])
    assert.equal(api.callsTo('/site').length, 1)

    const zero = setup({ maxVersionAgeSeconds: 0 })
    await Promise.all([zero.client.pages(), zero.client.types(), zero.client.authors()])
    assert.equal(zero.api.callsTo('/site').length, 1)
  })

  it('picks up a version another client persisted in a shared store', async () => {
    const api = fakeApi()
    const shared = memoryCache()
    const first = createClient({ key: PK, fetch: api.fetch, cache: shared })
    await first.pages()
    const before = api.calls.length
    const second = createClient({ key: PK, fetch: api.fetch, cache: shared })
    assert.deepEqual(await second.pages(), pagesExample)
    assert.equal(api.calls.length, before, 'the stored version and read are enough')
    assert.equal(second.version(), 184)
  })

  it('keeps two keys apart in one store', async () => {
    const api = fakeApi()
    const shared = memoryCache()
    const a = createClient({ key: PK, fetch: api.fetch, cache: shared })
    const b = createClient({ key: 'bg_site_pk_anotherSite0002', fetch: api.fetch, cache: shared })
    await a.pages()
    const before = api.calls.length
    await b.pages()
    assert.equal(api.calls.length, before + 2, 'b checks its own version and reads its own copy')
  })

  it('revalidates a copy from the previous version with If-None-Match, and a 304 re-uses it', async () => {
    const { api, client } = setup()
    await client.pages()
    await client.setVersion(185) // a webhook, while the api still answers 184
    assert.deepEqual(await client.pages(), pagesExample)
    const last = api.calls.at(-1)!
    assert.equal(last.path, '/pages')
    assert.equal(last.headers.get('If-None-Match'), '"v184"')
    assert.equal(client.version(), 184, 'the answer carries the version')
  })

  it('setVersion trusts and persists the version; bust forgets it', async () => {
    const { api, rec, client } = setup()
    assert.equal(client.version(), null)
    await client.setVersion(200)
    assert.equal(client.version(), 200)
    const scope = scopeOf(PK)
    assert.equal(JSON.parse((await rec.inner.get(`${scope}:version`))!).version, 200)

    await client.pages()
    assert.deepEqual(
      api.calls.map((c) => c.path),
      ['/pages'],
      'no /site check after setVersion',
    )
    // The answer said 184: the read is stored under the version it reflects, and that version is trusted.
    assert.ok(rec.keys.has(`${scope}:v184:/pages?`))
    assert.equal(client.version(), 184)

    await client.bust()
    assert.equal(client.version(), null)
    assert.equal(await rec.inner.get(`${scope}:version`), null)
    await client.types()
    assert.equal(api.callsTo('/site').length, 1, 'the next read re-learns the version')

    await assert.rejects(client.setVersion(-1), TypeError)
    await assert.rejects(client.setVersion(1.5), TypeError)
  })

  it('setVersion ignores a version older than the one known; bust() then setVersion goes back', async () => {
    const { rec, client } = setup()
    const scope = scopeOf(PK)
    await client.setVersion(190)
    await client.setVersion(185) // an earlier webhook arriving late
    assert.equal(client.version(), 190)
    assert.equal(JSON.parse((await rec.inner.get(`${scope}:version`))!).version, 190)
    await client.setVersion(191)
    assert.equal(client.version(), 191)

    await client.bust()
    await client.setVersion(185)
    assert.equal(client.version(), 185)
    assert.equal(JSON.parse((await rec.inner.get(`${scope}:version`))!).version, 185)
  })

  it('setVersion compares against a version another process stored', async () => {
    const api = fakeApi()
    const shared = memoryCache()
    await createClient({ key: PK, fetch: api.fetch, cache: shared }).setVersion(190)
    const receiver = createClient({ key: PK, fetch: api.fetch, cache: shared })
    await receiver.setVersion(185)
    assert.equal(receiver.version(), 190)
    assert.equal(JSON.parse((await shared.get(`${scopeOf(PK)}:version`))!).version, 190)
  })

  it('a broken store degrades to network reads', async () => {
    const api = fakeApi()
    const broken: CacheStore = {
      get: async () => {
        throw new Error('down')
      },
      set: async () => {
        throw new Error('down')
      },
      delete: async () => undefined,
      clear: async () => undefined,
    }
    const client = createClient({ key: PK, fetch: api.fetch, cache: broken })
    assert.deepEqual(await client.pages(), pagesExample)
  })
})

// ── Preview ──────────────────────────────────────────────────────────────────

describe('createClient: preview reads', () => {
  it('sends ?preview=1 and never touches the store', async () => {
    const { api, rec, client } = setup({ key: SK })
    assert.deepEqual(await client.page('home', { preview: true }), pageExample)
    assert.deepEqual(await client.entry('post', 'levy-explained', { preview: true }), entryExample)
    assert.deepEqual(await client.entries('post', { preview: true, term: 'taxes' }), entriesExample)
    assert.deepEqual(await client.raw('/pages/home', {}, { preview: true }), pageExample)
    assert.deepEqual(await client.preview('tok_good'), pageExample)
    assert.equal(rec.ops.length, 0)
    assert.equal(api.callsTo('/site').length, 0)
    assert.equal(api.callsTo('/pages/home')[0]!.url.search, '?preview=1')
    assert.equal(api.callsTo('/entries/post')[0]!.url.search, '?preview=1&term=taxes')
    assert.ok(api.calls.every((c) => !c.headers.has('If-None-Match')))
    assert.equal(client.version(), 184, 'still learns the version')
  })

  it('refuses a preview read with a publishable key before any request', async () => {
    const { api, client } = setup()
    await assert.rejects(client.page('home', { preview: true }), { name: 'BackgoldApiError', status: 403, code: 'SECRET_KEY_REQUIRED' })
    await assert.rejects(client.preview('tok_good'), { status: 403, code: 'SECRET_KEY_REQUIRED' })
    await assert.rejects(client.entries('post', { preview: true }), { status: 403, code: 'SECRET_KEY_REQUIRED' })
    assert.equal(api.calls.length, 0)
  })
})

// ── allEntries ───────────────────────────────────────────────────────────────

describe('createClient: allEntries', () => {
  it('walks every page via next_cursor', async () => {
    const { api, client } = setup()
    const base = entriesExample.entries[0]!
    const pages: Record<string, { entries: Entry[]; next_cursor: string | null }> = {
      '': { entries: [{ ...base, id: 'e1' }], next_cursor: 'c1' },
      c1: { entries: [{ ...base, id: 'e2' }], next_cursor: 'c2' },
      c2: { entries: [{ ...base, id: 'e3' }], next_cursor: null },
    }
    api.routes['/entries/post'] = (url) => ok(pages[url.searchParams.get('cursor') ?? '']!)
    const ids: string[] = []
    for await (const entry of client.allEntries('post', { limit: 1 })) ids.push(entry.id)
    assert.deepEqual(ids, ['e1', 'e2', 'e3'])
    assert.deepEqual(
      api.callsTo('/entries/post').map((c) => c.url.search),
      ['?limit=1', '?cursor=c1&limit=1', '?cursor=c2&limit=1'],
    )
  })

  it('yields nothing for an unknown type', async () => {
    const { client } = setup()
    const seen: Entry[] = []
    for await (const entry of client.allEntries('nope')) seen.push(entry)
    assert.deepEqual(seen, [])
  })
})

// ── Keys ─────────────────────────────────────────────────────────────────────

describe('createClient: keys', () => {
  it('refuses anything that is not a site key, naming the prefixes', () => {
    assert.throws(() => createClient({ key: 'sk_live_123' }), (err: unknown) => {
      assert.ok(err instanceof TypeError)
      assert.match(err.message, /bg_site_pk_/)
      assert.match(err.message, /bg_site_sk_/)
      return true
    })
    assert.throws(() => createClient({ key: '' }), TypeError)
  })

  it('refuses a secret key where document exists', () => {
    const g = globalThis as { document?: unknown }
    g.document = {}
    try {
      assert.throws(() => createClient({ key: SK }), SecretKeyInBrowserError)
      assert.doesNotThrow(() => createClient({ key: PK }))
    } finally {
      delete g.document
    }
    assert.doesNotThrow(() => createClient({ key: SK }))
  })

  it('refuses an apiOrigin that is not http(s)', () => {
    assert.throws(() => createClient({ key: PK, apiOrigin: 'ftp://api.example.test' }), TypeError)
    assert.throws(() => createClient({ key: PK, apiOrigin: 'not a url' }), TypeError)
  })

  it('keeps a path in apiOrigin', async () => {
    const { api, client } = setup({ apiOrigin: 'https://proxy.example.test/base/' })
    await client.site().catch(() => undefined) // the fake answers only under /api/content/v1
    assert.equal(api.calls[0]!.url.href, 'https://proxy.example.test/base/api/content/v1/site')
  })

  it('accepts only the prefix and base62, and never repeats the key', () => {
    for (const bad of ['bg_site_pk_SECRET\n', 'bg_site_sk_SECRET-1', 'bg_site_sk_SECRET 1', 'bg_site_xx_SECRET', 'SECRET']) {
      assert.throws(
        () => createClient({ key: bad }),
        (err: unknown) => err instanceof TypeError && !err.message.includes('SECRET'),
        JSON.stringify(bad),
      )
    }
    assert.throws(() => createClient({ key: 'bg_site_pk_' }), TypeError)
  })
})

// ── Audit fixes ──────────────────────────────────────────────────────────────

describe('createClient: preview reads however they are asked for', () => {
  it('routes raw /preview/ paths and preview=1 queries through the secret-key check and never stores them', async () => {
    const secret = setup({ key: SK })
    assert.deepEqual(await secret.client.raw('/preview/tok_good'), pageExample)
    assert.deepEqual(await secret.client.raw('/pages/home', { preview: '1' }), pageExample)
    assert.equal(secret.rec.ops.length, 0, 'the store is never touched')
    assert.equal(secret.api.callsTo('/site').length, 0)
    assert.equal(secret.api.callsTo('/pages/home')[0]!.url.search, '?preview=1')

    const publishable = setup()
    await assert.rejects(publishable.client.raw('/preview/tok_good'), { status: 403, code: 'SECRET_KEY_REQUIRED' })
    await assert.rejects(publishable.client.raw('/pages/home', { preview: '1' }), { status: 403, code: 'SECRET_KEY_REQUIRED' })
    assert.equal(publishable.api.calls.length, 0)
    assert.equal(publishable.rec.ops.length, 0)
  })
})

describe('createClient: browser workers', () => {
  const g = globalThis as Record<string, unknown>
  const withWorkerScope = (userAgent: string, body: () => void) => {
    class WorkerGlobalScope {}
    const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    g.WorkerGlobalScope = WorkerGlobalScope
    g.self = new WorkerGlobalScope()
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent }, configurable: true, writable: true })
    try {
      body()
    } finally {
      delete g.WorkerGlobalScope
      delete g.self
      if (navigator) Object.defineProperty(globalThis, 'navigator', navigator)
      else delete g.navigator
    }
  }

  it('refuses a secret key in a browser worker', () => {
    withWorkerScope('Mozilla/5.0', () => {
      assert.throws(() => createClient({ key: SK }), SecretKeyInBrowserError)
      assert.doesNotThrow(() => createClient({ key: PK }))
    })
    assert.doesNotThrow(() => createClient({ key: SK }))
  })

  it('allows a secret key on Cloudflare Workers', () => {
    withWorkerScope('Cloudflare-Workers', () => {
      assert.doesNotThrow(() => createClient({ key: SK }))
    })
  })
})

describe('createClient: a 404 for the site itself', () => {
  it('throws instead of answering null when the 404 carries no X-Content-Version', async () => {
    // The key's site is gone: the api's key middleware answers before any route, with no version header.
    const gone = (async () => Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })) as typeof fetch
    const client = createClient({ key: SK, fetch: gone, cache: memoryCache() })
    await client.setVersion(184) // trusted, so a read goes straight to its route
    await assert.rejects(client.page('home'), { status: 404, code: 'NOT_FOUND' })
    await assert.rejects(client.raw('/pages/x'), { status: 404, code: 'NOT_FOUND' })
    await assert.rejects(client.page('x', { preview: true }), { status: 404 })
    await assert.rejects(client.preview('tok'), { status: 404 })
    await assert.rejects(
      (async () => {
        for await (const entry of client.allEntries('post')) void entry
      })(),
      { status: 404 },
    )
  })
})

describe('createClient: revalidating a previous copy', () => {
  it('stores a 304 copy under the version its ETag names, not the version the client believed', async () => {
    const { api, rec, client } = setup()
    await client.pages()
    await client.setVersion(186) // a webhook, while the api is still at 184
    api.bare304 = true
    assert.deepEqual(await client.pages(), pagesExample)
    assert.equal(api.calls.at(-1)!.headers.get('If-None-Match'), '"v184"')
    const scope = scopeOf(PK)
    assert.ok(rec.keys.has(`${scope}:v184:/pages?`))
    assert.ok(!rec.keys.has(`${scope}:v186:/pages?`))
  })

  it('does not offer a corrupt previous copy', async () => {
    const { api, rec, client } = setup()
    await client.pages()
    const scope = scopeOf(PK)
    await rec.inner.set(`${scope}:v184:/pages?`, JSON.stringify({ body: '{not json', etag: '"v184"', fetched_at: 1 }), 60)
    await client.setVersion(185)
    assert.deepEqual(await client.pages(), pagesExample)
    assert.equal(api.calls.at(-1)!.headers.get('If-None-Match'), null)
  })
})

describe('createClient: dot segments', () => {
  it('refuses . and .. in a raw path or any path argument, literal or encoded, before any request', async () => {
    const { api, client } = setup()
    await assert.rejects(client.raw('/pages/..'), TypeError)
    await assert.rejects(client.raw('/pages/%2e%2e'), TypeError)
    await assert.rejects(client.raw('/./site'), TypeError)
    await assert.rejects(client.raw('/pages/%2E'), TypeError)
    await assert.rejects(client.entry('post', '..'), TypeError)
    await assert.rejects(client.page('.'), TypeError)
    await assert.rejects(client.terms('..'), TypeError)
    assert.equal(api.calls.length, 0)
    assert.equal(await client.page('v1.2'), null, 'a dot inside a segment is fine')
  })
})

describe('createClient: setVersion against the store', () => {
  it('compares with a newer version another process stored, and writes only a newer one', async () => {
    const api = fakeApi()
    const shared = recordingStore()
    const receiver = createClient({ key: PK, fetch: api.fetch, cache: shared.store })
    await receiver.setVersion(190)
    // Another process moves the shared record to 195.
    await createClient({ key: PK, fetch: api.fetch, cache: shared.store }).setVersion(195)
    const writes = () => shared.ops.filter((o) => o.op === 'set' && o.key === `${scopeOf(PK)}:version`).length
    const before = writes()
    await receiver.setVersion(192)
    assert.equal(receiver.version(), 195, 'the stored 195 wins over the incoming 192')
    await receiver.setVersion(195)
    assert.equal(writes(), before, 'nothing older or equal is written')
    await receiver.setVersion(196)
    assert.equal(writes(), before + 1)
    assert.equal(receiver.version(), 196)
  })
})

describe('createClient: the version record', () => {
  it('is rewritten on a new version or a confirmation over five seconds old, not on every miss', async () => {
    let now = 5_000_000
    Date.now = () => now
    const { rec, client } = setup()
    const writes = () => rec.ops.filter((o) => o.op === 'set' && o.key === `${scopeOf(PK)}:version`).length
    await client.pages()
    await client.types()
    await client.authors()
    await client.page('home')
    assert.equal(writes(), 1)
    now += 6_000
    await client.redirects()
    assert.equal(writes(), 2)
  })
})

describe('createClient: allEntries cycle guard', () => {
  it('stops on any cursor seen before', async () => {
    const { api, client } = setup()
    const base = entriesExample.entries[0]!
    const pages: Record<string, { entries: Entry[]; next_cursor: string | null }> = {
      '': { entries: [{ ...base, id: 'e1' }], next_cursor: 'c1' },
      c1: { entries: [{ ...base, id: 'e2' }], next_cursor: 'c2' },
      c2: { entries: [{ ...base, id: 'e3' }], next_cursor: 'c1' },
    }
    api.routes['/entries/post'] = (url) => ok(pages[url.searchParams.get('cursor') ?? '']!)
    const ids: string[] = []
    for await (const entry of client.allEntries('post')) ids.push(entry.id)
    assert.deepEqual(ids, ['e1', 'e2', 'e3'])
    assert.equal(api.callsTo('/entries/post').length, 3)
  })
})

describe('createClient: cacheTtlSeconds', () => {
  it('raises a ttl under 1 second to 1', async () => {
    for (const cacheTtlSeconds of [0, -5, 0.2]) {
      const { rec, client } = setup({ cacheTtlSeconds })
      await client.pages()
      const ttls = rec.ops.filter((o) => o.op === 'set').map((o) => o.ttl)
      assert.ok(ttls.length > 0 && ttls.every((t) => t === 1), `${cacheTtlSeconds} → ${ttls.join(',')}`)
    }
  })
})

// ── areas() ──────────────────────────────────────────────────────────────────

describe('createClient: areas()', () => {
  it('sends GET /areas with holds joined by commas, in the order given', async () => {
    const { api, client } = setup()
    assert.deepEqual(await client.areas({ holds: ['form:frm_vol', 'signup'] }), areasResponseExample)
    const call = api.callsTo('/areas')[0]!
    assert.equal(call.url.searchParams.get('holds'), 'form:frm_vol,signup')
    assert.equal(call.url.search, '?holds=form%3Afrm_vol%2Csignup')
    await client.areas({ holds: ['donation_form'] })
    assert.equal(api.callsTo('/areas')[1]!.url.search, '?holds=donation_form')
  })

  it('accepts every module kind and form:<id>', async () => {
    const { client } = setup()
    const kinds = ['donation_form', 'form', 'signup', 'petition', 'poll', 'event', 'store', 'advocacy', 'form:frm_A-1']
    assert.deepEqual(await client.areas({ holds: kinds }), areasResponseExample)
  })

  it('refuses an empty list before any request', async () => {
    const { api, client } = setup()
    await assert.rejects(client.areas({ holds: [] }), (err: unknown) => err instanceof TypeError && /at least one/.test(err.message))
    assert.equal(api.calls.length, 0)
  })

  it('refuses an entry the api would not read, naming it, before any request', async () => {
    const { api, client } = setup()
    for (const bad of ['donate', 'form:', 'form:bad id', `form:${'x'.repeat(65)}`, ' signup', 'signup,poll', 'Signup', 'poll:p1']) {
      await assert.rejects(
        client.areas({ holds: ['signup', bad] }),
        (err: unknown) => err instanceof TypeError && err.message.includes(JSON.stringify(bad)),
        bad,
      )
    }
    await assert.rejects(client.areas({ holds: [42 as unknown as string] }), TypeError)
    await assert.rejects(client.areas({} as { holds: string[] }), TypeError)
    assert.equal(api.calls.length, 0)
  })

  it('is cached under the content version like any published read', async () => {
    const { api, rec, client } = setup()
    await client.areas({ holds: ['donation_form'] })
    await client.areas({ holds: ['donation_form'] })
    assert.equal(api.callsTo('/areas').length, 1)
    assert.ok(rec.keys.has(`${scopeOf(PK)}:v184:/areas?holds=donation_form`))
    api.version = 185
    await client.setVersion(185)
    await client.areas({ holds: ['donation_form'] })
    assert.equal(api.callsTo('/areas').length, 2)
    assert.ok(rec.keys.has(`${scopeOf(PK)}:v185:/areas?holds=donation_form`))
  })
})

describe('createClient: live()', () => {
  const STREAM = {
    status: 'live',
    video_id: 'J54IfAUoJdQ',
    url: 'https://www.youtube.com/watch?v=J54IfAUoJdQ',
    embed_url: 'https://www.youtube.com/embed/J54IfAUoJdQ',
    title: 'Live from the statehouse',
    thumbnail_url: 'https://i.ytimg.com/vi/J54IfAUoJdQ/hqdefault_live.jpg',
    scheduled_start_at: null,
    started_at: '2026-10-23T19:02:00Z',
    channel_title: 'Libertarian Academy',
  }

  it('answers the stream GET /live names, and null for { live: null }', async () => {
    const { api, client } = setup()
    api.routes['/live'] = () => ok({ live: STREAM })
    assert.deepEqual(await client.live(), STREAM)
    const off = setup()
    off.api.routes['/live'] = () => ok({ live: null })
    assert.equal(await off.client.live(), null)
  })

  it('holds an answer 60 seconds in memory, never in the store, and shares one read', async () => {
    const { api, rec, client } = setup()
    let now = 1_000_000
    Date.now = () => now
    api.routes['/live'] = () => ok({ live: STREAM })
    const [a, b] = await Promise.all([client.live(), client.live()])
    assert.deepEqual(a, b)
    assert.equal(api.callsTo('/live').length, 1)
    api.routes['/live'] = () => ok({ live: null })
    now += 59_000
    assert.deepEqual(await client.live(), STREAM)
    assert.equal(api.callsTo('/live').length, 1)
    now += 2_000
    assert.equal(await client.live(), null)
    assert.equal(api.callsTo('/live').length, 2)
    assert.ok(![...rec.keys].some((k) => k.includes('/live')))
    assert.ok(!rec.ops.some((op) => op.key?.includes('/live')))
  })

  it('is never keyed on the content version: a new version does not re-read it', async () => {
    const { api, client } = setup()
    api.routes['/live'] = () => ok({ live: STREAM })
    await client.live()
    await client.setVersion(185)
    await client.live()
    assert.equal(api.callsTo('/live').length, 1)
  })

  it('forgets the held answer on bust()', async () => {
    const { api, client } = setup()
    api.routes['/live'] = () => ok({ live: STREAM })
    await client.live()
    api.routes['/live'] = () => ok({ live: null })
    await client.bust()
    assert.equal(await client.live(), null)
    assert.equal(api.callsTo('/live').length, 2)
  })

  it('answers null for an api with no GET /live, and for an answer not shaped like a stream', async () => {
    const { client } = setup()
    assert.equal(await client.live(), null)
    for (const live of [{ ...STREAM, status: 'ended' }, { ...STREAM, video_id: 7 }, 'live', []]) {
      const other = setup()
      other.api.routes['/live'] = () => ok({ live })
      assert.equal(await other.client.live(), null, JSON.stringify(live))
    }
  })

  it('throws any other failure and holds nothing, so the next call asks again', async () => {
    const { api, client } = setup()
    api.routes['/live'] = () => ({ status: 503, body: { error: 'Try again', code: 'UNAVAILABLE' } })
    await assert.rejects(client.live(), (err: unknown) => err instanceof BackgoldApiError && err.status === 503 && err.code === 'UNAVAILABLE')
    api.routes['/live'] = () => ok({ live: STREAM })
    assert.deepEqual(await client.live(), STREAM)
    assert.equal(api.callsTo('/live').length, 2)
  })
})

// ── First-party ──────────────────────────────────────────────────────────────

describe('createClient: first-party reads', () => {
  const SITE = 'cd_site_0001'

  it('sends X-BackGold-Site on every request and no Authorization', async () => {
    const { api, client } = setup({ key: undefined, firstParty: { siteId: SITE } })
    await client.page('home')
    await client.areas({ holds: ['signup'] })
    assert.ok(api.calls.length >= 2)
    for (const call of api.calls) {
      assert.equal(call.headers.get('X-BackGold-Site'), SITE)
      assert.equal(call.headers.has('Authorization'), false)
      assert.equal(call.headers.get('Accept'), 'application/json')
      assert.equal(call.init?.redirect, 'manual')
    }
  })

  it('needs exactly one of key and firstParty, naming both', () => {
    const namesBoth = (err: unknown) => err instanceof TypeError && /`key`/.test(err.message) && /`firstParty`/.test(err.message)
    assert.throws(() => createClient({}), namesBoth)
    assert.throws(() => createClient({ key: PK, firstParty: { siteId: SITE } }), namesBoth)
    assert.throws(() => createClient(undefined as unknown as ClientOptions), namesBoth)
  })

  it('accepts only a site id of 1–64 letters, digits, _ and -', () => {
    for (const bad of ['', 'a b', 'a/b', 'a\n', 'x'.repeat(65), 'ü']) {
      assert.throws(() => createClient({ firstParty: { siteId: bad } }), TypeError, JSON.stringify(bad))
    }
    assert.throws(() => createClient({ firstParty: {} as { siteId: string } }), TypeError)
    assert.doesNotThrow(() => createClient({ firstParty: { siteId: 'A-z_09' } }))
    assert.doesNotThrow(() => createClient({ firstParty: { siteId: 'x'.repeat(64) } }))
  })

  it('is refused in a browser like a secret key', () => {
    const g = globalThis as { document?: unknown }
    g.document = {}
    try {
      assert.throws(() => createClient({ firstParty: { siteId: SITE } }), SecretKeyInBrowserError)
    } finally {
      delete g.document
    }
  })

  it('reads previews, never from or into the store', async () => {
    const { api, rec, client } = setup({ key: undefined, firstParty: { siteId: SITE } })
    assert.deepEqual(await client.page('home', { preview: true }), pageExample)
    assert.deepEqual(await client.preview('tok_good'), pageExample)
    assert.equal(rec.ops.length, 0)
    assert.equal(api.callsTo('/pages/home')[0]!.url.search, '?preview=1')
  })

  it('caches under its own scope with the same version rules as a key client', async () => {
    const api = fakeApi()
    const rec = recordingStore()
    const firstParty = createClient({ firstParty: { siteId: SITE }, fetch: api.fetch, cache: rec.store })
    await firstParty.page('home')
    await firstParty.page('home')
    assert.equal(api.callsTo('/pages/home').length, 1)
    const scope = createHash('sha256').update(`first-party:${SITE}`).digest('hex').slice(0, 16)
    assert.ok(rec.keys.has(`${scope}:v184:/pages/home?`))
    assert.equal(firstParty.version(), 184)

    // The previous version's copy revalidates with If-None-Match; a 304 re-uses it.
    api.version = 185
    await firstParty.setVersion(185)
    api.version = 184
    assert.deepEqual(await firstParty.page('home'), pageExample)
    const last = api.callsTo('/pages/home').at(-1)!
    assert.equal(last.headers.get('If-None-Match'), '"v184"')

    await firstParty.bust()
    assert.equal(firstParty.version(), null)

    const keyed = createClient({ key: PK, fetch: api.fetch, cache: rec.store })
    await keyed.page('home')
    assert.ok(rec.keys.has(`${scopeOf(PK)}:v184:/pages/home?`))
  })
})
