import { strict as assert } from 'node:assert'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { cacheApiStore, kvStore, memoryCache, type CacheLike } from './cache.js'
import type { KvLike } from './contract.js'
import { fsCache } from './fs.js'

const realNow = Date.now
afterEach(() => {
  Date.now = realNow
})

describe('memoryCache', () => {
  it('round-trips, deletes and clears', async () => {
    const store = memoryCache()
    assert.equal(await store.get('a'), null)
    await store.set('a', '1', 60)
    await store.set('b', '2', 60)
    assert.equal(await store.get('a'), '1')
    await store.delete('a')
    assert.equal(await store.get('a'), null)
    await store.clear()
    assert.equal(await store.get('b'), null)
  })

  it('honours the ttl on read', async () => {
    let now = 1_000
    Date.now = () => now
    const store = memoryCache()
    await store.set('a', '1', 10)
    now += 9_999
    assert.equal(await store.get('a'), '1')
    now += 1
    assert.equal(await store.get('a'), null)
  })

  it('evicts the oldest-written value past max', async () => {
    const store = memoryCache({ max: 2 })
    await store.set('a', '1', 60)
    await store.set('b', '2', 60)
    await store.set('a', '1b', 60) // a re-write moves a to the back
    await store.set('c', '3', 60)
    assert.equal(await store.get('b'), null)
    assert.equal(await store.get('a'), '1b')
    assert.equal(await store.get('c'), '3')
  })
})

describe('kvStore', () => {
  function fakeKv() {
    const map = new Map<string, string>()
    const puts: Array<{ key: string; expirationTtl?: number }> = []
    const kv: KvLike = {
      get: async (key) => map.get(key) ?? null,
      put: async (key, value, options) => {
        puts.push({ key, expirationTtl: options?.expirationTtl })
        map.set(key, value)
      },
      delete: async (key) => {
        map.delete(key)
      },
    }
    return { kv, map, puts }
  }

  it('clamps a ttl under 60 seconds up to 60', async () => {
    const { kv, puts } = fakeKv()
    const store = kvStore(kv)
    await store.set('short', 'x', 10)
    await store.set('zero', 'x', 0)
    await store.set('long', 'x', 3600)
    await store.set('fraction', 'x', 90.2)
    assert.deepEqual(
      puts.map((p) => p.expirationTtl),
      [60, 60, 3600, 91],
    )
  })

  it('prefixes keys, round-trips, deletes and clears what it wrote', async () => {
    const { kv, map } = fakeKv()
    map.set('foreign', 'kept')
    const store = kvStore(kv, { prefix: 'bg:' })
    await store.set('a', '1', 60)
    await store.set('b', '2', 60)
    assert.deepEqual([...map.keys()].sort(), ['bg:a', 'bg:b', 'foreign'])
    assert.equal(await store.get('a'), '1')
    await store.delete('a')
    assert.equal(await store.get('a'), null)
    await store.clear()
    assert.deepEqual([...map.keys()], ['foreign'])
  })

  it('stores a key past 512 bytes under its hash', async () => {
    const { kv, map } = fakeKv()
    const store = kvStore(kv)
    const long = `scope:v1:/entries/post?cursor=${'x'.repeat(600)}`
    await store.set(long, 'v', 60)
    assert.equal(await store.get(long), 'v')
    const [stored] = [...map.keys()]
    assert.match(stored!, /^sha256:[0-9a-f]{64}$/)
  })
})

describe('cacheApiStore', () => {
  function fakeCache() {
    const map = new Map<string, Response>()
    const cache: CacheLike = {
      match: async (req) => map.get(req.url)?.clone(),
      put: async (req, res) => {
        map.set(req.url, res)
      },
      delete: async (req) => map.delete(req.url),
    }
    return { cache, map }
  }

  it('stores each key as a synthetic request with max-age', async () => {
    const { cache, map } = fakeCache()
    const store = cacheApiStore({ cache, prefix: 'p:' })
    await store.set('abc:v1:/pages?', 'body', 3600)
    const [url] = [...map.keys()]
    assert.equal(url, `https://backgold-content.cache/${encodeURIComponent('p:abc:v1:/pages?')}`)
    assert.equal(map.get(url!)!.headers.get('Cache-Control'), 'max-age=3600')
    assert.equal(await store.get('abc:v1:/pages?'), 'body')
    assert.equal(await store.get('other'), null)
  })

  it('never writes max-age=0', async () => {
    const { cache, map } = fakeCache()
    await cacheApiStore({ cache }).set('a', 'x', 0)
    assert.equal([...map.values()][0]!.headers.get('Cache-Control'), 'max-age=1')
  })

  it('deletes and clears what it wrote', async () => {
    const { cache, map } = fakeCache()
    const store = cacheApiStore({ cache })
    await store.set('a', '1', 60)
    await store.set('b', '2', 60)
    await store.delete('a')
    assert.equal(await store.get('a'), null)
    await store.clear()
    assert.equal(map.size, 0)
  })

  it('uses caches.default when no cache is passed, and says so when there is none', async () => {
    const { cache } = fakeCache()
    const g = globalThis as { caches?: unknown }
    const had = Object.getOwnPropertyDescriptor(globalThis, 'caches')
    Object.defineProperty(globalThis, 'caches', { value: { default: cache }, configurable: true, writable: true })
    try {
      const store = cacheApiStore()
      await store.set('a', '1', 60)
      assert.equal(await store.get('a'), '1')
      g.caches = undefined
      await assert.rejects(cacheApiStore().get('a'), TypeError)
    } finally {
      if (had) Object.defineProperty(globalThis, 'caches', had)
      else delete g.caches
    }
  })
})

describe('fsCache', () => {
  it('round-trips through files named by the hash of the key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bg-content-fs-'))
    try {
      const store = fsCache(join(dir, 'cache'))
      assert.equal(await store.get('missing'), null)
      await store.set('scope:v1:/pages?', '{"pages":[]}', 3600)
      assert.equal(await store.get('scope:v1:/pages?'), '{"pages":[]}')
      const files = await readdir(join(dir, 'cache'))
      assert.equal(files.length, 1)
      assert.match(files[0]!, /^[0-9a-f]{64}\.json$/)

      await store.delete('scope:v1:/pages?')
      assert.equal(await store.get('scope:v1:/pages?'), null)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('expires values and clears only its own files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bg-content-fs-'))
    try {
      let now = 1_000_000
      Date.now = () => now
      const store = fsCache(dir)
      await store.set('a', '1', 10)
      await store.set('b', '2', 3600)
      await writeFile(join(dir, 'README.txt'), 'not the store’s')
      now += 10_000
      assert.equal(await store.get('a'), null)
      assert.equal(await store.get('b'), '2')
      await store.clear()
      assert.deepEqual(await readdir(dir), ['README.txt'])
      await fsCache(join(dir, 'never-made')).clear()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
