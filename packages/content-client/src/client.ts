// createClient — the typed, cache-aware reader of the headless Content API
// (/api/content/v1). The rules it keeps (graph decisions "@backgold/content
// bundles the shared contract and keeps the api's cache key rule" and
// "Content API caches by site id and version, never by URL"):
//
//   - A published read is stored under `${scope}:v${version}:${path}?${query}`,
//     the api's own key rule (packages/api/src/lib/content-api/cache.ts) with
//     `scope` = 16 hex of SHA-256 of the key, so no key material reaches a
//     store. A version bump is a miss by construction; nothing is purged.
//   - The version is learned from every answer's X-Content-Version (304s and
//     errors carry it too), from a conditional GET /site when the known one is
//     older than maxVersionAgeSeconds, or from setVersion (a webhook). It is
//     kept in memory and in the store under `${scope}:version`.
//   - Preview reads need a secret key, are refused locally without one, and
//     never read or write the store.
//   - Requests carry only Authorization, Accept and If-None-Match (the api's
//     CORS allows no other request header) and go only to apiOrigin.

import type { SITE_KEY_PREFIXES } from '@givegold/shared'
import { siteKeyKind } from '@givegold/shared/content-api'
import type {
  AuthorResponse,
  AuthorsResponse,
  BackgoldContent,
  CachedRead,
  CreateClient,
  EntriesResponse,
  Entry,
  MenuResponse,
  PageResponse,
  PagesResponse,
  PreviewResponse,
  ReadOptions,
  RedirectsResponse,
  SectionsResponse,
  SiteResponse,
  SitemapResponse,
  TermsResponse,
  TypedEntryResponse,
  TypesResponse,
} from './contract.js'
import { memoryCache } from './cache.js'
import { BackgoldApiError, SecretKeyInBrowserError } from './errors.js'
import { sha256Hex } from './hash.js'

const DEFAULT_API_ORIGIN = 'https://api.backgold.com'
const CONTENT_API_PREFIX = '/api/content/v1'
const DEFAULT_MAX_VERSION_AGE_SECONDS = 60
const DEFAULT_CACHE_TTL_SECONDS = 3600

/** The key prefixes, held equal to the api's SITE_KEY_PREFIXES by the type check. */
const KEY_PREFIXES = { publishable: 'bg_site_pk_', secret: 'bg_site_sk_' } as const satisfies typeof SITE_KEY_PREFIXES

/** The api's answer to a preview read with a publishable key (lib/content-api/cache.ts SECRET_KEY_REQUIRED). */
const secretKeyRequired = () => new BackgoldApiError(403, 'SECRET_KEY_REQUIRED', 'Preview needs a secret site key')

type Query = Record<string, string | undefined>
/** What a 404 becomes: `null` for a single-resource read, an error for a list or the site. */
type OnMissing = 'null' | 'throw'

/** The query string of a read: the route's parameters sorted by name, undefined and empty values dropped. */
function queryString(query: Query): string {
  const params = Object.entries(query)
    .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return new URLSearchParams(params).toString()
}

/** The version an answer reflects, from X-Content-Version; null when absent or not a whole number. */
function answeredVersion(res: Response): number | null {
  const raw = res.headers.get('X-Content-Version')
  return raw !== null && /^\d{1,15}$/.test(raw.trim()) ? Number(raw.trim()) : null
}

const etagOf = (version: number) => `"v${version}"`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A stored read, or null for anything the client did not write. */
function parseCachedRead(raw: string | null): CachedRead | null {
  if (raw === null) return null
  try {
    const read: unknown = JSON.parse(raw)
    if (isRecord(read) && typeof read.body === 'string' && typeof read.etag === 'string' && typeof read.fetched_at === 'number') {
      return { body: read.body, etag: read.etag, fetched_at: read.fetched_at }
    }
  } catch {
    // Not a stored read.
  }
  return null
}

/** The version record stored under `${scope}:version`. */
interface StoredVersion {
  version: number
  /** Unix milliseconds when the api (or setVersion) last confirmed it. */
  confirmed_at: number
}

function parseStoredVersion(raw: string | null): StoredVersion | null {
  if (raw === null) return null
  try {
    const stored: unknown = JSON.parse(raw)
    if (
      isRecord(stored) &&
      typeof stored.version === 'number' &&
      Number.isInteger(stored.version) &&
      stored.version >= 0 &&
      typeof stored.confirmed_at === 'number'
    ) {
      return { version: stored.version, confirmed_at: stored.confirmed_at }
    }
  } catch {
    // Not a stored version.
  }
  return null
}

/** The api's `{ error, code }`, or `HTTP_<status>` when the body is not that shape. */
async function apiError(res: Response): Promise<BackgoldApiError> {
  let text = ''
  try {
    text = await res.text()
  } catch {
    // An unreadable body is reported by its status alone.
  }
  try {
    const body: unknown = JSON.parse(text)
    if (isRecord(body) && typeof body.error === 'string' && typeof body.code === 'string') {
      return new BackgoldApiError(res.status, body.code, body.error)
    }
  } catch {
    // Not JSON.
  }
  return new BackgoldApiError(res.status, `HTTP_${res.status}`, `The BackGold Content API answered ${res.status}`)
}

/** A path under the mount `raw` accepts: path-absolute, with no query or fragment of its own. */
function checkPath(path: string): void {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('?') || path.includes('#')) {
    throw new TypeError(`A Content API path starts with "/" and carries no query string or fragment (got ${JSON.stringify(path)})`)
  }
}

function parseApiOrigin(raw: string): { base: string; origin: string } {
  const trimmed = raw.replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new TypeError(`apiOrigin is not a URL: ${JSON.stringify(raw)}`)
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash) {
    throw new TypeError(`apiOrigin must be an http(s) origin with no query or fragment: ${JSON.stringify(raw)}`)
  }
  return { base: trimmed + CONTENT_API_PREFIX, origin: url.origin }
}

/**
 * Builds a client. Throws a TypeError for anything that is not a site key,
 * and SecretKeyInBrowserError for a secret key where `document` exists.
 */
export const createClient: CreateClient = (opts) => {
  const key = opts?.key
  const kind = typeof key === 'string' ? siteKeyKind(key) : null
  if (!kind || typeof key !== 'string') {
    throw new TypeError(
      `createClient needs a site key: ${KEY_PREFIXES.publishable}… (publishable) or ${KEY_PREFIXES.secret}… (secret), from the site's Developer page`,
    )
  }
  if (kind === 'secret' && typeof (globalThis as { document?: unknown }).document !== 'undefined') {
    throw new SecretKeyInBrowserError()
  }

  const api = parseApiOrigin(opts.apiOrigin ?? DEFAULT_API_ORIGIN)
  const store = opts.cache ?? memoryCache()
  const maxVersionAgeMs = Math.max(0, opts.maxVersionAgeSeconds ?? DEFAULT_MAX_VERSION_AGE_SECONDS) * 1000
  const ttl = opts.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init))

  let scopePromise: Promise<string> | null = null
  const scope = () => (scopePromise ??= sha256Hex(key).then((hex) => hex.slice(0, 16)))
  const versionKey = async () => `${await scope()}:version`
  const readKey = async (version: number, path: string, qs: string) => `${await scope()}:v${version}:${path}?${qs}`

  // The version this client trusts, when it was last confirmed, the one
  // before it (whose stored reads can revalidate with If-None-Match), and the
  // in-flight version check every concurrent read shares.
  let known: number | null = null
  let confirmedAt = 0
  let previous: number | null = null
  let versionCheck: Promise<number> | null = null

  // A broken store degrades a read to a network read; it never fails one.
  const storeGet = async (k: string) => {
    try {
      return await store.get(k)
    } catch {
      return null
    }
  }
  const storeSet = async (k: string, value: string) => {
    try {
      await store.set(k, value, ttl)
    } catch {
      // Best effort.
    }
  }

  const trust = (version: number) => {
    if (known !== null && known !== version) previous = known
    known = version
    confirmedAt = Date.now()
  }
  const storedVersion = (version: number) => JSON.stringify({ version, confirmed_at: confirmedAt } satisfies StoredVersion)
  /** Trusts an answer's version; a published answer also persists it. */
  const learn = async (version: number, persist: boolean) => {
    trust(version)
    if (persist) await storeSet(await versionKey(), storedVersion(version))
  }

  const fresh = () => known !== null && maxVersionAgeMs > 0 && Date.now() - confirmedAt < maxVersionAgeMs

  const send = (path: string, qs: string, ifNoneMatch?: string) => {
    const url = `${api.base}${path}${qs ? `?${qs}` : ''}`
    if (new URL(url).origin !== api.origin) throw new TypeError(`Refusing to send the site key outside ${api.origin}`)
    const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch
    // A redirect is never followed: the key goes to apiOrigin and nowhere else.
    return doFetch(url, { method: 'GET', headers, redirect: 'manual' })
  }

  /** GET /site, conditional on the known version; a 304 confirms it, a 200 is stored like any read. */
  const checkSite = async (): Promise<number> => {
    const held = known
    const res = await send('/site', '', held !== null ? etagOf(held) : undefined)
    const answered = answeredVersion(res)
    if (res.status === 304 && (answered ?? held) !== null) {
      await learn((answered ?? held)!, true)
      return known!
    }
    if (!res.ok) throw await apiError(res)
    const text = await res.text()
    const body: unknown = JSON.parse(text)
    const version = answered ?? (isRecord(body) && typeof body.version === 'number' ? body.version : null)
    if (version === null) throw new BackgoldApiError(res.status, 'NO_CONTENT_VERSION', 'The answer to GET /site carried no content version')
    await learn(version, true)
    const read: CachedRead = { body: text, etag: res.headers.get('ETag') ?? etagOf(version), fetched_at: Date.now() }
    await storeSet(await readKey(version, '/site', ''), JSON.stringify(read))
    return version
  }

  /** The version to key a published read on: the trusted one while fresh, else one shared check. */
  /** With no version in memory, adopts the one in the store (another process may have written it). */
  const loadStoredVersion = async () => {
    if (known !== null) return
    const stored = parseStoredVersion(await storeGet(await versionKey()))
    if (stored && known === null) {
      known = stored.version
      confirmedAt = stored.confirmed_at
    }
  }

  const ensureVersion = (): Promise<number> => {
    if (fresh()) return Promise.resolve(known!)
    versionCheck ??= (async () => {
      await loadStoredVersion()
      return fresh() ? known! : checkSite()
    })().finally(() => {
      versionCheck = null
    })
    return versionCheck
  }

  const previewRead = async <T>(path: string, qs: string, onMissing: OnMissing): Promise<T | null> => {
    if (kind !== 'secret') throw secretKeyRequired()
    const res = await send(path, qs)
    const answered = answeredVersion(res)
    if (answered !== null) await learn(answered, false)
    if (res.ok) return JSON.parse(await res.text()) as T
    if (res.status === 404 && onMissing === 'null') return null
    throw await apiError(res)
  }

  const read = async <T>(path: string, query: Query, opts: ReadOptions | undefined, onMissing: OnMissing): Promise<T | null> => {
    checkPath(path)
    if (opts?.preview) return previewRead<T>(path, queryString({ ...query, preview: '1' }), onMissing)

    const qs = queryString(query)
    const version = await ensureVersion()
    const key = await readKey(version, path, qs)
    const hit = parseCachedRead(await storeGet(key))
    if (hit) {
      try {
        return JSON.parse(hit.body) as T
      } catch {
        // A corrupt copy is a miss.
      }
    }

    const prior =
      previous !== null && previous !== version ? parseCachedRead(await storeGet(await readKey(previous, path, qs))) : null
    const res = await send(path, qs, prior?.etag)
    const answered = answeredVersion(res)
    if (answered !== null) await learn(answered, true)
    const at = answered ?? version

    if (res.status === 304 && prior) {
      await storeSet(await readKey(at, path, qs), JSON.stringify(prior))
      return JSON.parse(prior.body) as T
    }
    if (res.ok) {
      const text = await res.text()
      const body = JSON.parse(text) as T
      const read: CachedRead = { body: text, etag: res.headers.get('ETag') ?? etagOf(at), fetched_at: Date.now() }
      await storeSet(await readKey(at, path, qs), JSON.stringify(read))
      return body
    }
    if (res.status === 404 && onMissing === 'null') return null
    throw await apiError(res)
  }

  const must = async <T>(path: string): Promise<T> => (await read<T>(path, {}, undefined, 'throw'))!
  const seg = encodeURIComponent

  const entries = <K extends string>(type: K, opts: Parameters<BackgoldContent['entries']>[1] = {}) =>
    read<EntriesResponse>(
      `/entries/${seg(type)}`,
      { term: opts.term, cursor: opts.cursor, limit: opts.limit === undefined ? undefined : String(opts.limit) },
      { preview: opts.preview },
      'null',
    )

  async function* allEntries<K extends string>(
    type: K,
    opts: Parameters<BackgoldContent['allEntries']>[1] = {},
  ): AsyncGenerator<Entry, void, undefined> {
    let cursor: string | undefined
    for (;;) {
      const page = await entries(type, { ...opts, cursor })
      if (!page) return
      yield* page.entries
      if (!page.next_cursor || page.next_cursor === cursor) return
      cursor = page.next_cursor
    }
  }

  return {
    site: () => must<SiteResponse>('/site'),
    menu: (menuKey) => read<MenuResponse>(`/menus/${seg(menuKey)}`, {}, undefined, 'null'),
    pages: () => must<PagesResponse>('/pages'),
    page: (slug, opts) => read<PageResponse>(`/pages/${seg(slug)}`, {}, opts, 'null'),
    section: (sectionKey) => read<SectionsResponse>(`/sections/${seg(sectionKey)}`, {}, undefined, 'null'),
    types: () => must<TypesResponse>('/types'),
    entries,
    allEntries,
    entry: <K extends string>(type: K, slug: string, opts?: ReadOptions) =>
      read<TypedEntryResponse<K>>(`/entries/${seg(type)}/${seg(slug)}`, {}, opts, 'null'),
    terms: (taxonomy) => read<TermsResponse>(`/terms/${seg(taxonomy)}`, {}, undefined, 'null'),
    authors: () => must<AuthorsResponse>('/authors'),
    author: (slug) => read<AuthorResponse>(`/authors/${seg(slug)}`, {}, undefined, 'null'),
    redirects: () => must<RedirectsResponse>('/redirects'),
    sitemap: () => must<SitemapResponse>('/sitemap'),
    preview: (token) => previewRead<PreviewResponse>(`/preview/${seg(token)}`, '', 'null'),
    raw: <T = unknown>(path: string, query: Query = {}, opts?: ReadOptions) => read<T>(path, query, opts, 'null'),

    version: () => known,
    async setVersion(version) {
      if (!Number.isInteger(version) || version < 0) throw new TypeError(`A content version is a whole number ≥ 0 (got ${version})`)
      // Monotonic: webhooks can arrive out of order, so an older version than
      // the one known (in memory or the store) is ignored; bust() first to go back.
      await loadStoredVersion()
      if (known !== null && version < known) return
      trust(version)
      await store.set(await versionKey(), storedVersion(version), ttl)
    },
    async bust() {
      if (known !== null) previous = known
      known = null
      confirmedAt = 0
      await store.delete(await versionKey())
    },
  }
}
