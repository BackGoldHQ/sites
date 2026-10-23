// createClient — the typed, cache-aware reader of the headless Content API
// (/api/content/v1). The rules it keeps (graph decisions "@backgold/content
// bundles the shared contract and keeps the api's cache key rule" and
// "Content API caches by site id and version, never by URL"):
//
//   - A published read is stored under `${scope}:v${version}:${path}?${query}`,
//     the api's own key rule (packages/api/src/lib/content-api/cache.ts) with
//     `scope` = 16 hex of SHA-256 of the key (of `first-party:<site id>` for
//     a first-party client), so no key material reaches a store. A version bump is a miss by construction; nothing is purged.
//   - The version is learned from every answer's X-Content-Version (304s and
//     errors carry it too), from a conditional GET /site when the known one is
//     older than maxVersionAgeSeconds, or from setVersion (a webhook). It is
//     kept in memory and in the store under `${scope}:version`.
//   - A preview read — `{ preview: true }`, a `preview=1` query, or a path
//     under /preview/ — needs a secret key or first-party reads, is refused
//     locally without one, and never reads or writes the store.
//   - A visitor read — a call with a visitor's token, per call or on the
//     client — sends X-BackGold-Visitor, never reads or writes the store, and
//     hands a renewed token (X-BackGold-Visitor-Renew) to onVisitorRenew.
//   - `live()` (GET /live, the organization's YouTube stream) is outside the
//     content version: never stored, its answer held in memory for 60 s.
//   - Reads carry only Authorization, Accept and If-None-Match (the api's
//     CORS allows no other request header) and go only to apiOrigin. A
//     first-party client (a site Worker in BackGold's namespace, reaching the
//     api through a service binding, where CORS does not apply) sends
//     X-BackGold-Site in place of Authorization. Visitor calls add
//     X-BackGold-Visitor, and the two writes (progress, the code exchange)
//     Content-Type: they are server-side calls.

import { type SITE_KEY_PREFIXES, VISITOR_HEADER, VISITOR_RENEW_HEADER, siteKeyKind } from '@backgold/contract/content-api'
import type {
  AreasResponse,
  AuthorResponse,
  AuthorsResponse,
  BackgoldContent,
  CachedRead,
  CourseResponse,
  CoursesResponse,
  CreateClient,
  EntriesResponse,
  Entry,
  EventsResponse,
  LessonProgressResponse,
  LessonResponse,
  LiveStream,
  MenuResponse,
  PageResponse,
  PagesResponse,
  PreviewResponse,
  ReadOptions,
  RedirectsResponse,
  SectionsResponse,
  ShiftsResponse,
  SiteResponse,
  SitemapResponse,
  TermsResponse,
  TypedEntryResponse,
  TypesResponse,
  VisitorExchangeResponse,
  VisitorOptions,
  VisitorResponse,
} from './contract.js'
import { holdsQuery } from './areas.js'
import { memoryCache } from './cache.js'
import { BackgoldApiError, SecretKeyInBrowserError } from './errors.js'
import { sha256Hex } from './hash.js'
import { DEFAULT_API_ORIGIN, SITE_KEY_PATTERN, contentApiBase } from './request.js'

/** The header a first-party request names its site with (the api's SITE_HEADER, middleware/site-content-key.ts). */
const SITE_HEADER = 'X-BackGold-Site'
/** A site id as a first-party client accepts it. */
const SITE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

const DEFAULT_MAX_VERSION_AGE_SECONDS = 60
const DEFAULT_CACHE_TTL_SECONDS = 3600
/** The version record is rewritten for a new version, or when its confirmation is older than this. */
const VERSION_WRITE_INTERVAL_MS = 5000
/** How long `live()` holds an answer: the api's own `max-age` for GET /live. */
const LIVE_HOLD_MS = 60_000

/** The key prefixes, held equal to the api's SITE_KEY_PREFIXES by the type check. */
const KEY_PREFIXES = { publishable: 'bg_site_pk_', secret: 'bg_site_sk_' } as const satisfies typeof SITE_KEY_PREFIXES

/**
 * A visitor token as a header can carry it: printable ASCII with no space,
 * at most 4096 characters. Anything else is refused before a request, and a
 * renewed token outside it is never handed on.
 */
const VISITOR_TOKEN_PATTERN = /^[\x21-\x7E]{1,4096}$/

/** A token the client will send, else a TypeError that never repeats the value. */
function checkVisitorToken(token: unknown): string {
  if (typeof token !== 'string' || !VISITOR_TOKEN_PATTERN.test(token)) {
    throw new TypeError('A visitor token is the string the api minted at sign-in: 1–4096 printable characters, no spaces')
  }
  return token
}

/** The api's answer to a preview read with a publishable key (lib/content-api/cache.ts SECRET_KEY_REQUIRED). */
const secretKeyRequired = () => new BackgoldApiError(403, 'SECRET_KEY_REQUIRED', 'Preview needs a secret site key')

type Query = Record<string, string | undefined>
/** What a 404 for the named resource becomes: `null` for a single-resource read, an error for a list or the site. */
type OnMissing = 'null' | 'throw'

/** The route's parameters sorted by name, undefined and empty values dropped. */
function normalizeQuery(query: Query): Array<[string, string]> {
  return Object.entries(query)
    .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/** The version an answer reflects, from X-Content-Version; null when absent or not a whole number. */
function answeredVersion(res: Response): number | null {
  const raw = res.headers.get('X-Content-Version')
  return raw !== null && /^\d{1,15}$/.test(raw.trim()) ? Number(raw.trim()) : null
}

const etagOf = (version: number) => `"v${version}"`

/** The version an ETag names (`"v184"`, `W/"v184"`); null for any other tag. */
function etagVersion(etag: string): number | null {
  const match = /^(?:W\/)?"v(\d{1,15})"$/.exec(etag.trim())
  return match ? Number(match[1]) : null
}

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

/** The body of a stored read, parsed; undefined when it is not JSON (a corrupt copy is a miss). */
function parsedBody(read: CachedRead): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(read.body) }
  } catch {
    return undefined
  }
}

/** The stream in a `GET /live` answer: null for `{ live: null }`, and for anything not shaped like a stream. */
function liveOf(body: unknown): LiveStream | null {
  const live = isRecord(body) ? body.live : null
  if (!isRecord(live)) return null
  if (live.status !== 'live' && live.status !== 'upcoming') return null
  if (typeof live.video_id !== 'string' || typeof live.title !== 'string') return null
  return live as unknown as LiveStream
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

/** A `.` or `..` segment, literal or percent-encoded, which a URL parser would collapse. */
function isDotSegment(segment: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return true
  }
  return decoded === '.' || decoded === '..'
}

/**
 * A path under the mount: path-absolute, with no query or fragment of its own
 * and no `.`/`..` segment (literal or `%2e`), so it cannot climb out of
 * /api/content/v1 or name the same resource under two cache keys.
 */
function checkPath(path: string): void {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('?') || path.includes('#')) {
    throw new TypeError(`A Content API path starts with "/" and carries no query string or fragment (got ${JSON.stringify(path)})`)
  }
  if (path.split('/').some(isDotSegment)) {
    throw new TypeError(`A Content API path has no "." or ".." segment (got ${JSON.stringify(path)})`)
  }
}

/**
 * True in a browser page (`document`) or a browser worker (a
 * WorkerGlobalScope), where a secret key would be readable by anyone.
 * Cloudflare's runtime is a WorkerGlobalScope too and is a server, so it is
 * told apart by its navigator.userAgent.
 */
function inBrowser(): boolean {
  const g = globalThis as {
    document?: unknown
    WorkerGlobalScope?: unknown
    self?: unknown
    navigator?: { userAgent?: unknown }
  }
  if (typeof g.document !== 'undefined') return true
  if (typeof g.WorkerGlobalScope !== 'function' || typeof g.self === 'undefined') return false
  try {
    if (!(g.self instanceof (g.WorkerGlobalScope as abstract new () => unknown))) return false
  } catch {
    return false
  }
  return g.navigator?.userAgent !== 'Cloudflare-Workers'
}

/** How a client names itself to the api: the headers it sends, what its store scope hashes, and what it may read. */
interface Credential {
  kind: 'publishable' | 'secret'
  headers: Record<string, string>
  scopeSeed: string
  firstParty: boolean
}

/**
 * Exactly one of `key` (a site key as the api mints it; the message never
 * repeats the key) and `firstParty` (a site id), else a TypeError.
 * First-party reads are secret-level.
 */
function credentialOf(opts: Parameters<CreateClient>[0] | undefined): Credential {
  const key = opts?.key
  const firstParty = opts?.firstParty
  if ((key == null) === (firstParty == null)) {
    throw new TypeError(
      'createClient needs exactly one of `key` (a site key from the site\'s Developer page) or `firstParty` ({ siteId }, for a site Worker inside BackGold\'s namespace)',
    )
  }
  if (firstParty != null) {
    const siteId: unknown = firstParty.siteId
    if (typeof siteId !== 'string' || !SITE_ID_PATTERN.test(siteId)) {
      throw new TypeError('firstParty.siteId is a site id: 1–64 letters, digits, "_" or "-"')
    }
    return { kind: 'secret', headers: { [SITE_HEADER]: siteId }, scopeSeed: `first-party:${siteId}`, firstParty: true }
  }
  const kind = typeof key === 'string' && SITE_KEY_PATTERN.test(key) ? siteKeyKind(key) : null
  if (!kind || typeof key !== 'string') {
    throw new TypeError(
      `createClient needs a site key: ${KEY_PREFIXES.publishable}… (publishable) or ${KEY_PREFIXES.secret}… (secret) followed by letters and digits, from the site's Developer page`,
    )
  }
  return { kind, headers: { Authorization: `Bearer ${key}` }, scopeSeed: key, firstParty: false }
}

/**
 * Builds a client. Throws a TypeError unless exactly one of a site key and a
 * first-party site id is given, and SecretKeyInBrowserError for a secret key
 * or first-party reads in a browser page or worker.
 */
export const createClient: CreateClient = (opts) => {
  const { kind, headers: credentialHeaders, scopeSeed, firstParty } = credentialOf(opts)
  if (kind === 'secret' && inBrowser()) throw new SecretKeyInBrowserError()
  const clientVisitor = opts.visitor === undefined ? undefined : checkVisitorToken(opts.visitor)
  const clientOnRenew = opts.onVisitorRenew

  const api = contentApiBase(opts.apiOrigin ?? DEFAULT_API_ORIGIN)
  const store = opts.cache ?? memoryCache()
  const maxVersionAgeMs = Math.max(0, opts.maxVersionAgeSeconds ?? DEFAULT_MAX_VERSION_AGE_SECONDS) * 1000
  const ttl = Number.isFinite(opts.cacheTtlSeconds) ? Math.max(1, opts.cacheTtlSeconds!) : DEFAULT_CACHE_TTL_SECONDS
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init))

  let scopePromise: Promise<string> | null = null
  const scope = () => (scopePromise ??= sha256Hex(scopeSeed).then((hex) => hex.slice(0, 16)))
  const versionKey = async () => `${await scope()}:version`
  const readKey = async (version: number, path: string, qs: string) => `${await scope()}:v${version}:${path}?${qs}`

  // The version this client trusts, when it was last confirmed, the one
  // before it (whose stored reads can revalidate with If-None-Match), the
  // record last written to the store, and the in-flight version check every
  // concurrent read shares.
  let known: number | null = null
  let confirmedAt = 0
  let previous: number | null = null
  let persisted: StoredVersion | null = null
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

  const trust = (version: number, at = Date.now()) => {
    if (known !== null && known !== version) previous = known
    known = version
    confirmedAt = at
  }
  /** Writes the version record (setVersion's write lets the store's error through). */
  const writeVersion = async (strict: boolean) => {
    const record: StoredVersion = { version: known!, confirmed_at: confirmedAt }
    const k = await versionKey()
    if (strict) await store.set(k, JSON.stringify(record), ttl)
    else await storeSet(k, JSON.stringify(record))
    persisted = record
  }
  /**
   * Trusts an answer's version. A published answer also persists it, but only
   * when the version changed or the stored confirmation is more than five
   * seconds old: KV takes one write per key per second.
   */
  const learn = async (version: number, persist: boolean) => {
    trust(version)
    if (!persist) return
    if (persisted?.version === version && confirmedAt - persisted.confirmed_at <= VERSION_WRITE_INTERVAL_MS) return
    await writeVersion(false)
  }

  /** Adopts a stored version record that is newer than the one in memory (another process may have written it). */
  const adopt = (stored: StoredVersion | null) => {
    persisted = stored
    if (stored && (known === null || stored.version > known)) trust(stored.version, stored.confirmed_at)
  }

  const fresh = () => known !== null && maxVersionAgeMs > 0 && Date.now() - confirmedAt < maxVersionAgeMs

  interface SendInit {
    ifNoneMatch?: string
    /** The visitor's token, sent as X-BackGold-Visitor. */
    visitor?: string
    method?: 'GET' | 'POST' | 'DELETE'
    /** A JSON body. */
    body?: unknown
  }

  const send = (path: string, qs: string, init: SendInit = {}) => {
    const url = `${api.base}${path}${qs ? `?${qs}` : ''}`
    if (new URL(url).origin !== api.origin) throw new TypeError(`Refusing to send a request outside ${api.origin}`)
    const headers: Record<string, string> = { ...credentialHeaders, Accept: 'application/json' }
    if (init.ifNoneMatch) headers['If-None-Match'] = init.ifNoneMatch
    if (init.visitor) headers[VISITOR_HEADER] = init.visitor
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    // A redirect is never followed: the credential goes to apiOrigin and nowhere else.
    return doFetch(url, {
      method: init.method ?? 'GET',
      headers,
      redirect: 'manual',
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    })
  }

  /** The call's visitor: its own token, else the client's, with its renew callback; null for an anonymous read. */
  const visitorOf = (call: VisitorOptions | undefined): { token: string; onRenew: ((token: string) => void) | undefined } | null => {
    const token = call?.visitor !== undefined ? checkVisitorToken(call.visitor) : clientVisitor
    return token === undefined ? null : { token, onRenew: call?.onVisitorRenew ?? clientOnRenew }
  }
  /** Hands a renewed token on, when the answer carries a well-formed one. */
  const reportRenewal = (res: Response, onRenew: ((token: string) => void) | undefined) => {
    const fresh = res.headers.get(VISITOR_RENEW_HEADER)?.trim()
    if (onRenew && fresh && VISITOR_TOKEN_PATTERN.test(fresh)) onRenew(fresh)
  }

  /** GET /site, conditional on the known version; a 304 confirms it, a 200 is stored like any read. */
  const checkSite = async (): Promise<number> => {
    const held = known
    const res = await send('/site', '', { ifNoneMatch: held !== null ? etagOf(held) : undefined })
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
  const ensureVersion = (): Promise<number> => {
    if (fresh()) return Promise.resolve(known!)
    versionCheck ??= (async () => {
      if (known === null) adopt(parseStoredVersion(await storeGet(await versionKey())))
      return fresh() ? known! : checkSite()
    })().finally(() => {
      versionCheck = null
    })
    return versionCheck
  }

  /**
   * A 404 names a missing resource only when the answer carries the site's
   * X-Content-Version; without it the site itself is gone (tombstoned, the
   * headless grant revoked), which is never a null.
   */
  const missing = (res: Response, onMissing: OnMissing) =>
    res.status === 404 && onMissing === 'null' && answeredVersion(res) !== null

  const previewRead = async <T>(path: string, qs: string, onMissing: OnMissing): Promise<T | null> => {
    if (kind !== 'secret') throw secretKeyRequired()
    const res = await send(path, qs)
    const answered = answeredVersion(res)
    if (answered !== null) await learn(answered, false)
    if (res.ok) return JSON.parse(await res.text()) as T
    if (missing(res, onMissing)) return null
    throw await apiError(res)
  }

  /**
   * A call made for one visitor (a read, or one of the visitor's writes):
   * never stored, its version trusted but not persisted, a renewed token
   * handed on whatever the status. A 204 answers undefined.
   */
  const visitorCall = async <T>(
    path: string,
    qs: string,
    visitor: { token: string; onRenew: ((token: string) => void) | undefined },
    onMissing: OnMissing,
    init: Omit<SendInit, 'visitor' | 'ifNoneMatch'> = {},
  ): Promise<T | null> => {
    const res = await send(path, qs, { ...init, visitor: visitor.token })
    reportRenewal(res, visitor.onRenew)
    const answered = answeredVersion(res)
    if (answered !== null) await learn(answered, false)
    if (res.status === 204) return undefined as T
    if (res.ok) return JSON.parse(await res.text()) as T
    if (missing(res, onMissing)) return null
    throw await apiError(res)
  }

  const read = async <T>(path: string, query: Query, opts: ReadOptions | undefined, onMissing: OnMissing): Promise<T | null> => {
    checkPath(path)
    const params = normalizeQuery(opts?.preview ? { ...query, preview: '1' } : query)
    const qs = new URLSearchParams(params).toString()
    // A draft never reaches the store, however the caller asked for it.
    const preview = params.some(([name, value]) => name === 'preview' && value === '1') || path.startsWith('/preview/')
    if (preview) return previewRead<T>(path, qs, onMissing)
    // Nor does an answer for one visitor.
    const visitor = visitorOf(opts)
    if (visitor) return visitorCall<T>(path, qs, visitor, onMissing)

    const version = await ensureVersion()
    const key = await readKey(version, path, qs)
    const hit = parseCachedRead(await storeGet(key))
    const hitBody = hit ? parsedBody(hit) : undefined
    if (hitBody) return hitBody.value as T

    // A copy from the previous version can revalidate: a 304 means the api is
    // still at the version its ETag names. A corrupt copy, or one under a tag
    // that names no version, is not offered.
    let prior: { read: CachedRead; version: number; body: unknown } | null = null
    if (previous !== null && previous !== version) {
      const read = parseCachedRead(await storeGet(await readKey(previous, path, qs)))
      const body = read ? parsedBody(read) : undefined
      const tagged = read ? etagVersion(read.etag) : null
      if (read && body && tagged !== null) prior = { read, version: tagged, body: body.value }
    }
    const res = await send(path, qs, { ifNoneMatch: prior?.read.etag })
    const answered = answeredVersion(res)
    if (answered !== null) await learn(answered, true)

    if (res.status === 304 && prior) {
      await storeSet(await readKey(prior.version, path, qs), JSON.stringify(prior.read))
      return prior.body as T
    }
    if (res.ok) {
      const at = answered ?? version
      const text = await res.text()
      const body = JSON.parse(text) as T
      const read: CachedRead = { body: text, etag: res.headers.get('ETag') ?? etagOf(at), fetched_at: Date.now() }
      await storeSet(await readKey(at, path, qs), JSON.stringify(read))
      return body
    }
    if (missing(res, onMissing)) return null
    throw await apiError(res)
  }

  const must = async <T>(path: string): Promise<T> => (await read<T>(path, {}, undefined, 'throw'))!

  // GET /live, outside the content version: the last answer and when it came,
  // and the read every concurrent caller shares while one is in flight.
  let liveHeld: { stream: LiveStream | null; at: number } | null = null
  let liveRead: Promise<LiveStream | null> | null = null
  const live = (): Promise<LiveStream | null> => {
    if (liveHeld && Date.now() - liveHeld.at < LIVE_HOLD_MS) return Promise.resolve(liveHeld.stream)
    liveRead ??= (async () => {
      const res = await send('/live', '')
      if (!res.ok && res.status !== 404) throw await apiError(res)
      // An api that serves no GET /live (404) has no stream to show.
      const stream = res.ok ? liveOf(JSON.parse(await res.text())) : null
      liveHeld = { stream, at: Date.now() }
      return stream
    })().finally(() => {
      liveRead = null
    })
    return liveRead
  }
  const seg = encodeURIComponent

  const entries = <K extends string>(type: K, opts: Parameters<BackgoldContent['entries']>[1] = {}) =>
    read<EntriesResponse>(
      `/entries/${seg(type)}`,
      { term: opts.term, q: opts.q, cursor: opts.cursor, limit: opts.limit === undefined ? undefined : String(opts.limit), include: opts.include },
      { preview: opts.preview, visitor: opts.visitor, onVisitorRenew: opts.onVisitorRenew },
      'null',
    )

  async function* allEntries<K extends string>(
    type: K,
    opts: Parameters<BackgoldContent['allEntries']>[1] = {},
  ): AsyncGenerator<Entry, void, undefined> {
    const seen = new Set<string>()
    let cursor: string | undefined
    for (;;) {
      const page = await entries(type, { ...opts, cursor })
      if (!page) return
      yield* page.entries
      // A cursor seen before would walk the same pages again.
      if (!page.next_cursor || seen.has(page.next_cursor)) return
      seen.add(page.next_cursor)
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
    events: async (eventsOpts = {}) =>
      (await read<EventsResponse>(
        '/events',
        {
          type: eventsOpts.type,
          cursor: eventsOpts.cursor,
          limit: eventsOpts.limit === undefined ? undefined : String(eventsOpts.limit),
        },
        undefined,
        'throw',
      ))!,
    shifts: async (shiftsOpts = {}) =>
      (await read<ShiftsResponse>(
        '/shifts',
        { cursor: shiftsOpts.cursor, limit: shiftsOpts.limit === undefined ? undefined : String(shiftsOpts.limit) },
        undefined,
        'throw',
      ))!,
    terms: (taxonomy) => read<TermsResponse>(`/terms/${seg(taxonomy)}`, {}, undefined, 'null'),
    authors: () => must<AuthorsResponse>('/authors'),
    author: (slug) => read<AuthorResponse>(`/authors/${seg(slug)}`, {}, undefined, 'null'),
    redirects: () => must<RedirectsResponse>('/redirects'),
    sitemap: () => must<SitemapResponse>('/sitemap'),
    areas: async (areasOpts) => {
      const holds = holdsQuery(areasOpts?.holds)
      return (await read<AreasResponse>('/areas', { holds }, undefined, 'throw'))!
    },
    courses: (coursesOpts = {}) =>
      read<CoursesResponse>(
        '/courses',
        { cursor: coursesOpts.cursor, limit: coursesOpts.limit === undefined ? undefined : String(coursesOpts.limit) },
        coursesOpts,
        'null',
      ),
    course: (slug, courseOpts) => read<CourseResponse>(`/courses/${seg(slug)}`, {}, courseOpts, 'null'),
    lesson: (courseSlug, lessonSlug, lessonOpts) =>
      read<LessonResponse>(`/courses/${seg(courseSlug)}/${seg(lessonSlug)}`, {}, lessonOpts, 'null'),
    visitor: async (token, visitorOpts) =>
      (await visitorCall<VisitorResponse>('/visitor', '', { token: checkVisitorToken(token), onRenew: visitorOpts?.onVisitorRenew ?? clientOnRenew }, 'throw'))!,
    lessonProgress: async (courseSlug, lessonSlug, body, token, progressOpts) =>
      (await visitorCall<LessonProgressResponse>(
        `/courses/${seg(courseSlug)}/${seg(lessonSlug)}/progress`,
        '',
        { token: checkVisitorToken(token), onRenew: progressOpts?.onVisitorRenew ?? clientOnRenew },
        'throw',
        { method: 'POST', body },
      ))!,
    async exchangeVisitor(code) {
      if (!firstParty && kind !== 'secret') {
        throw new BackgoldApiError(403, 'SECRET_KEY_REQUIRED', 'Redeeming a visitor hand-off code needs a secret site key or a first-party client')
      }
      if (typeof code !== 'string' || code === '' || code.length > 512) throw new TypeError('A hand-off code is the non-empty string the portal sent back')
      const res = await send('/visitor/exchange', '', { method: 'POST', body: { code } })
      const answered = answeredVersion(res)
      if (answered !== null) await learn(answered, false)
      if (!res.ok) throw await apiError(res)
      return JSON.parse(await res.text()) as VisitorExchangeResponse
    },
    async signOutVisitor(token) {
      await visitorCall<void>('/visitor', '', { token: checkVisitorToken(token), onRenew: undefined }, 'throw', { method: 'DELETE' })
    },
    live,
    preview: (token) => read<PreviewResponse>(`/preview/${seg(token)}`, {}, undefined, 'null'),
    raw: <T = unknown>(path: string, query: Query = {}, opts?: ReadOptions) => read<T>(path, query, opts, 'null'),

    version: () => known,
    async setVersion(version) {
      if (!Number.isInteger(version) || version < 0) throw new TypeError(`A content version is a whole number ≥ 0 (got ${version})`)
      // Monotonic: webhooks arrive out of order, so the incoming version is
      // compared with the larger of memory and the store, re-read every time
      // (another process may have written a newer one), and written only when
      // it is newer than the store's. Two concurrent writers can still race:
      // KV has no compare-and-swap.
      const stored = parseStoredVersion(await store.get(await versionKey()))
      adopt(stored)
      if (known !== null && version < known) return
      trust(version)
      if (!stored || version > stored.version) await writeVersion(true)
    },
    async bust() {
      liveHeld = null
      if (known !== null) previous = known
      known = null
      confirmedAt = 0
      persisted = null
      await store.delete(await versionKey())
    },
  }
}
