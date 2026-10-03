// The stores the client keeps reads and the site's content version in. Each
// implements CacheStore (contract.ts): keys are opaque strings the client
// builds, values are strings, and `ttlSeconds` is how long a value may live.
// `fsCache` lives in ./fs.ts so this module stays free of node: imports.

import type { CacheStore, KvLike } from './contract.js'
import { sha256Hex } from './hash.js'

// ── Memory ───────────────────────────────────────────────────────────────────

export interface MemoryCacheOptions {
  /** The most values held at once; the oldest-written goes first. Default 500. */
  max?: number
}

/**
 * A Map in this process: any runtime, nothing survives a restart. Holds at
 * most `max` values, evicting in the order they were written (a re-write
 * moves a key to the back). An expired value reads as absent and is dropped.
 * A `ttlSeconds` that is not a positive number means no expiry.
 */
export function memoryCache(opts: MemoryCacheOptions = {}): CacheStore {
  const max = Math.max(1, Math.floor(opts.max ?? 500))
  const map = new Map<string, { value: string; expiresAt: number }>()
  return {
    async get(key) {
      const held = map.get(key)
      if (!held) return null
      if (held.expiresAt <= Date.now()) {
        map.delete(key)
        return null
      }
      return held.value
    },
    async set(key, value, ttlSeconds) {
      const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Number.POSITIVE_INFINITY
      map.delete(key)
      map.set(key, { value, expiresAt })
      while (map.size > max) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
    },
    async delete(key) {
      map.delete(key)
    },
    async clear() {
      map.clear()
    },
  }
}

// ── Workers Cache API ────────────────────────────────────────────────────────

/** The Workers Cache API surface the store needs — structural, so no Cloudflare types are required. */
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete(request: Request): Promise<boolean>
}

export interface CacheApiStoreOptions {
  /** Default `caches.default`, read at the first call. */
  cache?: CacheLike
  /** Prepended to every key, to share one cache between clients. Default ''. */
  prefix?: string
}

/** The synthetic origin the store's requests live under; it is never fetched. */
const CACHE_API_ORIGIN = 'https://backgold-content.cache/'

/**
 * The Workers Cache API (`caches.default` unless one is passed). Each key is
 * stored as a synthetic request under https://backgold-content.cache/ with
 * `Cache-Control: max-age=<ttl>`; the Cache API is per data center and may
 * evict any value early.
 *
 * `clear()` deletes only the keys this store wrote in this isolate: the Cache
 * API cannot list its entries. Values another isolate wrote stay until their
 * max-age — the client's keys carry the content version, so a stale value is
 * never read under a new version.
 */
export function cacheApiStore(opts: CacheApiStoreOptions = {}): CacheStore {
  const prefix = opts.prefix ?? ''
  const written = new Set<string>()
  const cache = (): CacheLike => {
    if (opts.cache) return opts.cache
    const fallback = (globalThis as { caches?: { default?: CacheLike } }).caches?.default
    if (!fallback) throw new TypeError('cacheApiStore needs the Workers Cache API (caches.default) or a `cache` option')
    return fallback
  }
  const request = (key: string) => new Request(CACHE_API_ORIGIN + encodeURIComponent(prefix + key))
  return {
    async get(key) {
      const hit = await cache().match(request(key))
      return hit ? hit.text() : null
    },
    async set(key, value, ttlSeconds) {
      // max-age=0 is "do not store" to the Cache API, so the floor is one second.
      const maxAge = Math.max(1, Math.ceil(ttlSeconds))
      await cache().put(
        request(key),
        new Response(value, { headers: { 'Cache-Control': `max-age=${maxAge}`, 'Content-Type': 'text/plain; charset=utf-8' } }),
      )
      written.add(key)
    },
    async delete(key) {
      await cache().delete(request(key))
      written.delete(key)
    },
    async clear() {
      const keys = [...written]
      written.clear()
      await Promise.all(keys.map((key) => cache().delete(request(key))))
    },
  }
}

// ── Workers KV ───────────────────────────────────────────────────────────────

export interface KvStoreOptions {
  /** Prepended to every key, to share one namespace between clients. Default ''. */
  prefix?: string
}

/** KV refuses an `expirationTtl` under 60 seconds. */
const KV_MIN_TTL_SECONDS = 60
/** KV's key length limit, in UTF-8 bytes. */
const KV_MAX_KEY_BYTES = 512

/**
 * A Workers KV namespace. KV requires `expirationTtl` ≥ 60, so a shorter ttl
 * is raised to 60 seconds. KV is eventually consistent: a write can take up to
 * a minute to reach other locations. A key longer than KV's 512-byte limit is
 * stored under its SHA-256 instead.
 *
 * `clear()` deletes only the keys this store wrote in this process: listing a
 * namespace is not part of the KV surface the store takes. Older values stay
 * until their ttl — under a content version the client no longer reads.
 */
export function kvStore(kv: KvLike, opts: KvStoreOptions = {}): CacheStore {
  const prefix = opts.prefix ?? ''
  const written = new Set<string>()
  const encoder = new TextEncoder()
  const kvKey = async (key: string) => {
    const full = prefix + key
    return encoder.encode(full).length <= KV_MAX_KEY_BYTES ? full : `${prefix}sha256:${await sha256Hex(key)}`
  }
  return {
    async get(key) {
      return kv.get(await kvKey(key), 'text')
    },
    async set(key, value, ttlSeconds) {
      await kv.put(await kvKey(key), value, { expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlSeconds)) })
      written.add(key)
    },
    async delete(key) {
      await kv.delete(await kvKey(key))
      written.delete(key)
    },
    async clear() {
      const keys = [...written]
      written.clear()
      await Promise.all(keys.map(async (key) => kv.delete(await kvKey(key))))
    },
  }
}
