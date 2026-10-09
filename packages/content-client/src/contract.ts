/**
 * The public surface of `@backgold/content` — the typed, cache-aware client
 * for the BackGold headless Content API (`/api/content/v1`). This file is the
 * contract the implementation is built to (Sites CMS W9a, plan in
 * docs/design/headless-starter-2026-10/README.md §4): every exported name
 * here is public, documented in the README, and stable within a major.
 *
 * Every response type is the api's own contract type from `@givegold/shared`
 * content-api.ts, bundled into this package's declarations at build so a
 * consumer never sees the private package.
 */
import type {
  AreaItem,
  Areas,
  AreasResponse,
  AuthorResponse,
  AuthorsResponse,
  ContentTypeSummary,
  EntriesResponse,
  Entry,
  EntryDetail,
  EntryResponse,
  EventsResponse,
  MenuResponse,
  PageResponse,
  PagesResponse,
  RedirectsResponse,
  SectionsResponse,
  SiteMenuKey,
  SiteResponse,
  SitemapResponse,
  TermsResponse,
  TypesResponse,
} from '@givegold/shared/content-api'

export type {
  AreaItem,
  Areas,
  AreasResponse,
  Author,
  AuthorResponse,
  AuthorsResponse,
  ContentApiError,
  ContentApiLegal,
  ContentTypeField,
  ContentTypeSummary,
  EntriesResponse,
  Entry,
  EntryAuthor,
  EntryDetail,
  EntryResponse,
  EntryTerm,
  EventLiveCounts,
  EventsListRow,
  EventsLiveResponse,
  EventsResponse,
  EventTypeSummary,
  MenuItem,
  MenuResponse,
  MenuShowsOn,
  MenuShowsOnPage,
  MenuTarget,
  PageResponse,
  PageSummary,
  PagesResponse,
  RedirectsResponse,
  Section,
  SectionBand,
  SectionBleed,
  SectionData,
  SectionEmbed,
  SectionLink,
  SectionLinkTarget,
  SectionMedia,
  SectionsResponse,
  SiteArea,
  SiteMenuKey,
  SiteResponse,
  SitemapResponse,
  TermsResponse,
  TypesResponse,
} from '@givegold/shared/content-api'

// ── Cache ────────────────────────────────────────────────────────────────────

/** One stored read: the body as the api sent it, under the ETag it carried. */
export interface CachedRead {
  body: string
  etag: string
  /** Unix milliseconds when the body was fetched. */
  fetched_at: number
}

/**
 * Where the client keeps reads and the site's content version. Four stores
 * ship: `memoryCache()` (any runtime), `cacheApiStore()` (the Workers Cache
 * API), `kvStore(namespace)` (Workers KV) and, from `@backgold/content/fs`,
 * `fsCache(dir)` for a Node build step. Keys are opaque strings the client
 * builds; a store never interprets them. `ttlSeconds` is advisory: a store
 * may evict sooner, never later than its own ceiling.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  /** Forget everything this store holds for the client (best effort). */
  clear(): Promise<void>
}

/** The Workers KV surface the KV store needs — structural, so no Cloudflare types are required. */
export interface KvLike {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

// ── Client ───────────────────────────────────────────────────────────────────

export interface ClientOptions {
  /**
   * A site key: `bg_site_pk_…` (publishable, published reads) or `bg_site_sk_…` (secret, drafts too; never in a browser).
   * Exactly one of `key` and `firstParty` is given.
   */
  key?: string
  /**
   * First-party reads, for a site Worker inside BackGold's own namespace only:
   * pass the service binding to the api as `fetch` and the site's id here.
   * Every request names the site with `X-BackGold-Site` and carries no
   * Authorization; reads are secret-level (drafts too; never in a browser).
   * A site built elsewhere uses `key`. Exactly one of `key` and `firstParty`
   * is given.
   */
  firstParty?: FirstPartyOptions
  /** The api worker origin. Default `https://api.backgold.com`. */
  apiOrigin?: string
  /** Default `memoryCache()`. */
  cache?: CacheStore
  /**
   * How long a known content version is trusted before `/site` is re-checked
   * (`If-None-Match`, a 304 costs nothing). Default 60 seconds; 0 re-checks
   * on every read. A webhook calling `setVersion` makes the check moot.
   */
  maxVersionAgeSeconds?: number
  /** How long a stored read may live under its version. Default 3600; a value under 1 is raised to 1 (each store keeps its own floor). */
  cacheTtlSeconds?: number
  /** The fetch to use. Default `globalThis.fetch`. Tests pass their own. */
  fetch?: typeof fetch
}

export interface FirstPartyOptions {
  /** The site's id: letters, digits, `_` and `-`, 1–64 characters. */
  siteId: string
}

/** What `areas()` takes. */
export interface AreasOptions {
  /**
   * The modules the route holds: module kinds (`donation_form`, `form`,
   * `signup`, `petition`, `poll`, `event`, `store`, `advocacy`) and
   * `form:<form id>` for a particular form; at least one entry. Sent as
   * `?holds=` joined by commas.
   */
  holds: string[]
}

/** Options a list read takes. */
export interface EntriesOptions {
  /** A term slug (`?term=`). */
  term?: string
  /**
   * Search titles and summaries (`?q=`), ignoring case: 2–80 characters once
   * trimmed. A search is one page of at most 20 (`next_cursor` is null, and
   * it takes no cursor); it combines with `term`.
   */
  q?: string
  /** 1–50 (1–20 with `q`); the api's default when omitted. */
  limit?: number
  /** The `next_cursor` of the previous page. */
  cursor?: string
  /** Read drafts too (`?preview=1`; needs a secret key; never cached). */
  preview?: boolean
}

/** What `events()` takes. */
export interface EventsOptions {
  /** Only events of this type (`rally`, `convention`, `fundraiser`, `blank`); `types` still counts every type. */
  type?: string
  /** The `next_cursor` of the previous page. */
  cursor?: string
  /** 1–50; the api's default (20) when omitted. */
  limit?: number
}

export interface ReadOptions {
  /** Read the draft (`?preview=1`; needs a secret key; never cached). */
  preview?: boolean
}

/**
 * The per-type field map a consumer augments (by hand, or with the file
 * `backgold-content types` writes) so `entry(type, slug)` returns typed
 * `fields`. Empty here; `declare module '@backgold/content' { interface
 * BackgoldTypeMap { press_release: { … } } }` fills it in.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BackgoldTypeMap {}

/** `fields` for a type key: the augmented shape when the map knows it, else the api's loose record. */
export type FieldsOf<K extends string> = K extends keyof BackgoldTypeMap ? BackgoldTypeMap[K] : Record<string, unknown>

export type TypedEntryDetail<K extends string> = Omit<EntryDetail, 'fields'> & { fields: FieldsOf<K> }
export type TypedEntryResponse<K extends string> = { entry: TypedEntryDetail<K>; areas: Areas }

/** What `preview(token)` answers: a draft page or a draft entry, by the token's kind. */
export type PreviewResponse = PageResponse | EntryResponse

export interface BackgoldContent {
  /** `GET /site`: identity, brand, social, SEO, the legal line, the version. */
  site(): Promise<SiteResponse>
  /** `GET /menus/:key`; null for a key the site does not have. */
  menu(key: SiteMenuKey): Promise<MenuResponse | null>
  /** `GET /pages`. */
  pages(): Promise<PagesResponse>
  /** `GET /pages/:slug` (`home` is the home page); null when unpublished or unknown. */
  page(slug: string, opts?: ReadOptions): Promise<PageResponse | null>
  /** `GET /sections/:key` (`header`, `footer`, or a synced section's key); null when unknown. */
  section(key: string): Promise<SectionsResponse | null>
  /** `GET /types`. */
  types(): Promise<TypesResponse>
  /** `GET /entries/:type`, one page; null for an unknown type. */
  entries<K extends string>(type: K, opts?: EntriesOptions): Promise<EntriesResponse | null>
  /** Every entry of a type, walking the cursor; yields nothing for an unknown type. */
  allEntries<K extends string>(type: K, opts?: Omit<EntriesOptions, 'cursor' | 'q'>): AsyncIterable<Entry>
  /** `GET /entries/:type/:slug` with typed `fields` when the type map knows the key; null when unpublished or unknown. */
  entry<K extends string>(type: K, slug: string, opts?: ReadOptions): Promise<TypedEntryResponse<K> | null>
  /**
   * `GET /events`: the organization's upcoming public events, soonest first,
   * one page at a time, with every upcoming event counted by type. Cached and
   * versioned like every published read. Going and seats left move between
   * publishes and are not here: read `GET /events/live?ids=` yourself (it is
   * cached 30 seconds and never by version, so not through `raw`).
   */
  events(opts?: EventsOptions): Promise<EventsResponse>
  /** `GET /terms/:taxonomy`; null for an unknown taxonomy. */
  terms(taxonomy: string): Promise<TermsResponse | null>
  /** `GET /authors`. */
  authors(): Promise<AuthorsResponse>
  /** `GET /authors/:slug`; null when unknown. */
  author(slug: string): Promise<AuthorResponse | null>
  /** `GET /redirects`. */
  redirects(): Promise<RedirectsResponse>
  /** `GET /sitemap`. */
  sitemap(): Promise<SitemapResponse>
  /**
   * `GET /areas?holds=`: the areas for a route of yours with no BackGold page
   * behind it, described by the modules it holds. Cached and versioned like
   * every other published read. Throws a TypeError, before any request, for
   * an empty list or an entry that is not a module kind or `form:<id>`.
   */
  areas(opts: AreasOptions): Promise<AreasResponse>
  /** `GET /preview/:token` — a secret key; never cached. Throws BAD_PREVIEW_TOKEN on a bad or expired token. */
  preview(token: string): Promise<PreviewResponse | null>
  /**
   * Any `GET` under the api, for an endpoint this client does not name yet.
   * Cached and versioned like every other read. `query` values are
   * normalized the way the api's cache key normalizes them (sorted by name,
   * undefined and empty dropped); a `preview=1` query or a path under
   * `/preview/` is a preview read, never cached. A 404 for the thing named →
   * null; a 404 for the site itself (no X-Content-Version) throws, as does
   * any other non-2xx.
   */
  raw<T = unknown>(path: string, query?: Record<string, string | undefined>, opts?: ReadOptions): Promise<T | null>

  /** The content version this client currently trusts; null before the first read. */
  version(): number | null
  /**
   * Trust `version` from now on (what a webhook receiver calls); persisted to
   * the store. Monotonic: the store's record is re-read on every call and a
   * version lower than the larger of memory and the store is ignored, because
   * webhooks can arrive out of order; it is written only when newer than the
   * store's. Two processes writing at once can still race (KV has no
   * compare-and-swap). To go backwards, call `bust()` first. Surfaces the
   * store's error.
   */
  setVersion(version: number): Promise<void>
  /** Forget the version, in memory and the store; the next read re-learns it (another process sharing the store may already have written a newer one). Surfaces the store's error. */
  bust(): Promise<void>
}

/**
 * Build a client. Throws a TypeError unless exactly one of `key` (a site key)
 * and `firstParty` (a valid site id) is given, and `SecretKeyInBrowserError`
 * for a secret key or first-party reads in a browser page or browser worker.
 */
export type CreateClient = (opts: ClientOptions) => BackgoldContent

// ── Areas ────────────────────────────────────────────────────────────────────

/**
 * True when an area item shows at `now` (Unix milliseconds, default
 * `Date.now()`): its `from` is unset or at or before `now`, and its `until` is
 * unset or after `now`. An instant `Date.parse` cannot read counts as unset,
 * so a malformed string never hides content.
 */
export type VisibleNow = (item: Pick<AreaItem, 'from' | 'until'>, now?: number) => boolean

// ── Errors ───────────────────────────────────────────────────────────────────

/** A non-2xx answer the client did not turn into `null`: `{ error, code }` from the api, with the HTTP status. */
export interface BackgoldApiErrorShape {
  name: 'BackgoldApiError'
  status: number
  /** The api's `code` (e.g. `SECRET_KEY_REQUIRED`, `BAD_CURSOR`, `BAD_PREVIEW_TOKEN`), or `HTTP_<status>` when the body had none. */
  code: string
  message: string
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

/** The five content events (`CONTENT_WEBHOOK_EVENTS` in the api). */
export type ContentEventType =
  | 'site.published'
  | 'content.published'
  | 'content.unpublished'
  | 'menu.updated'
  | 'redirects.updated'

/** A content event's envelope as BackGold POSTs it (docs/WEBHOOKS.md): ids and the version, never a title, body or person. */
export interface ContentEvent {
  id: string
  type: ContentEventType
  created_at: string
  data: {
    site_domain_id: string
    content_version: number
    page_id?: string
    content_item_id?: string
    menu_key?: string
  }
}

export interface VerifyWebhookInput {
  /** The request body, byte-for-byte as received (re-serializing JSON breaks the signature). */
  rawBody: string
  /** The `X-BackGold-Signature` header: `t=<unix seconds>,v1=<hex>`. */
  signature: string | null | undefined
  /** The endpoint's signing secret (`whsec_…`), shown once when the endpoint was created. */
  secret: string
  /** Reject a timestamp more than this many seconds from `now`, in either direction. Default 300 (BackGold's own verifier's window). */
  toleranceSeconds?: number
  /** Unix seconds "now"; tests pass their own. */
  now?: number
}

/** HMAC-SHA256 over `<t>.<rawBody>`, constant-time compared, with `t` within the tolerance either side of now; false on any malformed input. Never throws. */
export type VerifyBackgoldWebhook = (input: VerifyWebhookInput) => Promise<boolean>

/** The event when `rawBody` is one of the five content events in the house envelope; null otherwise. Never throws. */
export type ParseContentEvent = (rawBody: string) => ContentEvent | null

// ── Preview ──────────────────────────────────────────────────────────────────

/** What BackGold's "Preview on your site" link carries to the partner's preview route. */
export interface PreviewRequest {
  token: string
  /** The page's path on the site, path-absolute; `/` when absent or unsafe (a control character, space, backslash, `//` or `..`). */
  path: string
}

/** Reads `bg_preview` (and `path`) off the preview route's URL; null when there is no token. */
export type PreviewFromRequest = (url: string | URL) => PreviewRequest | null

// ── Codegen (`@backgold/content/codegen`) ────────────────────────────────────

export interface GenerateTypesOptions {
  /** The module the generated file augments. Default `@backgold/content`. */
  moduleName?: string
  /** Printed in the header; default the current date. */
  generatedAt?: string
}

/**
 * The TypeScript source of a file that augments `BackgoldTypeMap` with one
 * interface per content type, each field typed by its kind: short/long/rich
 * text and link → `string`; image → `{ url: string }`; pdf → `{ url, file_name,
 * size_bytes }`; date/datetime → ISO `string`; boolean → `boolean`; choice →
 * the union of its choices; choices → that union as an array; list →
 * `string[]`; reference → `{ kind: 'entry'; label: string; slug: string } |
 * { kind: string; label: string; url?: string }`. A field that is not
 * `required` is `| null`; `required` holds for published entries, while a
 * preview read of a draft may answer null for any field. Deterministic: the
 * same types and the same `generatedAt` (the CLI's `--generated-at`) give the
 * same bytes.
 */
export type GenerateTypes = (types: readonly ContentTypeSummary[], opts?: GenerateTypesOptions) => string
