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
  AuthorResponse,
  AuthorsResponse,
  ContentTypeSummary,
  EntriesResponse,
  Entry,
  EntryDetail,
  EntryResponse,
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
  MenuItem,
  MenuResponse,
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
  /** A site key: `bg_site_pk_…` (publishable, published reads) or `bg_site_sk_…` (secret, drafts too; never in a browser). */
  key: string
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
  /** How long a stored read may live under its version. Default 3600. */
  cacheTtlSeconds?: number
  /** The fetch to use. Default `globalThis.fetch`. Tests pass their own. */
  fetch?: typeof fetch
}

/** Options a list read takes. */
export interface EntriesOptions {
  /** A term slug (`?term=`). */
  term?: string
  /** 1–50; the api's default when omitted. */
  limit?: number
  /** The `next_cursor` of the previous page. */
  cursor?: string
  /** Read drafts too (`?preview=1`; needs a secret key; never cached). */
  preview?: boolean
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
export type TypedEntryResponse<K extends string> = { entry: TypedEntryDetail<K> }

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
  allEntries<K extends string>(type: K, opts?: Omit<EntriesOptions, 'cursor'>): AsyncIterable<Entry>
  /** `GET /entries/:type/:slug` with typed `fields` when the type map knows the key; null when unpublished or unknown. */
  entry<K extends string>(type: K, slug: string, opts?: ReadOptions): Promise<TypedEntryResponse<K> | null>
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
  /** `GET /preview/:token` — a secret key; never cached. Throws BAD_PREVIEW_TOKEN on a bad or expired token. */
  preview(token: string): Promise<PreviewResponse | null>
  /**
   * Any `GET` under the api, for an endpoint this client does not name yet.
   * Cached and versioned like every other read. `query` values are
   * normalized the way the api's cache key normalizes them (sorted by name,
   * undefined dropped). Throws on any non-2xx other than 404 (→ null).
   */
  raw<T = unknown>(path: string, query?: Record<string, string | undefined>, opts?: ReadOptions): Promise<T | null>

  /** The content version this client currently trusts; null before the first read. */
  version(): number | null
  /** Trust `version` from now on (what a webhook receiver calls); persisted to the store. */
  setVersion(version: number): Promise<void>
  /** Forget the version so the next read re-learns it from the api. */
  bust(): Promise<void>
}

/** Build a client. Throws `SecretKeyInBrowserError` for a secret key where `document` exists. */
export type CreateClient = (opts: ClientOptions) => BackgoldContent

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
  /** Reject a timestamp older than this. Default 300 (what BackGold's own verifier uses). */
  toleranceSeconds?: number
  /** Unix seconds "now"; tests pass their own. */
  now?: number
}

/** HMAC-SHA256 over `<t>.<rawBody>`, constant-time compared; false on any malformed input. Never throws. */
export type VerifyBackgoldWebhook = (input: VerifyWebhookInput) => Promise<boolean>

/** The event when `rawBody` is one of the five content events in the house envelope; null otherwise. Never throws. */
export type ParseContentEvent = (rawBody: string) => ContentEvent | null

// ── Preview ──────────────────────────────────────────────────────────────────

/** What BackGold's "Preview on your site" link carries to the partner's preview route. */
export interface PreviewRequest {
  token: string
  /** The page's path on the site, path-absolute; `/` when absent or unsafe. */
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
 * `required` is `| null`. Deterministic: the same types give the same text.
 */
export type GenerateTypes = (types: readonly ContentTypeSummary[], opts?: GenerateTypesOptions) => string
