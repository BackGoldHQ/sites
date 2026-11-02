// The storefront the kit draws for every template (board 06 of the store
// design): static pages built from the Content API's catalog reads, readable
// with scripts off, and one small live island.
//
//   /store                       the shop: the departments rail (each with
//                                its published count, only departments with
//                                something in them; the api lists only those
//                                whose storefront page is on, each under its
//                                nearest listed ancestor), the site's collections
//                                under it, the grid of listings (each card
//                                the link, no buttons) and a collection band
//                                carrying the page's one call (GET /products).
//   /store/departments/<slug>    the same, narrowed to a department and
//                                everything under it (`?department=`); a
//                                department the api does not list has none.
//                                Its rail carries the filter panel: a
//                                group per facet the api sends with
//                                `?department=`, each value a link that
//                                toggles `?attr=<key>:<value>` (repeatable,
//                                keys AND, a key's values OR) in the page's
//                                own address, which passes to GET /products.
//                                The shop's root has no facets.
//   /store/<slug>                one listing (GET /products/<slug>): its
//                                gallery, copy, attributes, related listings
//                                by collection, and the Product + Offer
//                                JSON-LD in the HTML. Its price,
//                                availability and Add to cart are the island
//                                (components/store/StoreScript.astro), which
//                                reads GET /products/live on view.
//   /collections/<slug>          one collection (GET /collections/<slug>):
//                                its cover, intro, the ordered grid, then one
//                                call back to the shop.
//
// A grid's later pages ride `?cursor=` as a list's do. Availability is the
// api's word, never a count. Prices are the build's; the island shows the
// live one when it differs.
//
// The cart belongs to the hosted checkout (`/s/<org>/checkout` on BackGold,
// on the host of a listing's `buy_url`), a different origin from the site's,
// so the site keeps its own cart and hands it over. The contract:
//
// - The island keeps the lines in localStorage on the site's origin under
//   `gg-cart:<org slug>`, as an array in the checkout cart's own `CartItem`
//   shape (the platform's frontend services/store-cart.ts): `variant_id`,
//   `product_slug`, `product_name`, `variant_name`, `unit_price_cents`,
//   `quantity`, `photo_url`, `needs_shipping`, and `answers` as
//   `{ order?, units? }` keyed by label when the listing asks questions. A
//   second add of the same item adds its quantity to the line, keeps the
//   newer once-per-order answers and appends its units' answers, as the
//   checkout's own add does.
// - The header's Cart link counts the lines' quantities. It, and the
//   island's Check out after an add, go to
//   `<checkout>#cart=<base64url of the UTF-8 JSON of the CartItem[]>`, in
//   the fragment, never the query, so answers reach no server log. The
//   checkout replaces its cart for the organization with the lines handed
//   over (the site's cart is what the buyer saw), takes at most 50 lines and
//   64 KB, one line per item, a quantity of 1 to 99, names of at most 255
//   characters, `units` no longer than the quantity and answers that are
//   strings or lists of strings (a line that breaks one is dropped), and
//   clears the fragment; it quotes prices
//   again itself, so a line's `unit_price_cents` is for display only. The
//   site forgets its cart in the click that hands it over (the link's
//   address already carries the lines, so a new tab gets them too): the
//   checkout owns the cart from then on, and an empty site cart's link goes
//   to the checkout as it stands. A later hand-over of new lines replaces
//   the checkout's cart, never adds to it.

import type { BackgoldContent, CollectionResponse, ProductDepartment, ProductDetail, ProductFacet, ProductResponse, ProductSummary, ProductsResponse } from '@backgold/content'
import { BackgoldApiError } from '@backgold/content'
import { PRODUCT_ATTR_FILTERS_MAX, PRODUCT_ATTR_KEY_PATTERN, PRODUCT_ATTR_VALUE_MAX } from '#contract/content-api'

/** The api's availability word: `in_stock`, `low`, `out` or `preorder`. */
export type ProductAvailability = ProductSummary['availability']

export const STORE_PATH = '/store'
export const COLLECTIONS_PATH = '/collections'
/** The segment under /store that a department's own page sits under. */
const DEPARTMENTS_SEGMENT = 'departments'
/** How many listings a grid page shows. */
export const STORE_PAGE_SIZE = 24

export const productPath = (slug: string): string => `${STORE_PATH}/${encodeURIComponent(slug)}`
export const collectionPath = (slug: string): string => `${COLLECTIONS_PATH}/${encodeURIComponent(slug)}`
export const departmentPath = (slug: string): string => `${STORE_PATH}/${DEPARTMENTS_SEGMENT}/${encodeURIComponent(slug)}`

/** Which storefront page a path is, or null for any other path. */
export type StoreRoute =
  | { kind: 'store'; department: null }
  | { kind: 'store'; department: string }
  | { kind: 'product'; slug: string }
  | { kind: 'collection'; slug: string }

const decoded = (segment: string): string | null => {
  try {
    const value = decodeURIComponent(segment)
    return value && !value.includes('/') ? value : null
  } catch {
    return null
  }
}

export function storeRouteOf(pathname: string): StoreRoute | null {
  const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (segments[0] === 'store') {
    if (segments.length === 1) return { kind: 'store', department: null }
    if (segments.length === 2) {
      const slug = decoded(segments[1]!)
      return slug ? { kind: 'product', slug } : null
    }
    if (segments.length === 3 && segments[1] === DEPARTMENTS_SEGMENT) {
      const slug = decoded(segments[2]!)
      return slug ? { kind: 'store', department: slug } : null
    }
    return null
  }
  if (segments[0] === 'collections' && segments.length === 2) {
    const slug = decoded(segments[1]!)
    return slug ? { kind: 'collection', slug } : null
  }
  return null
}

/** A read the api has no answer for: an api older than the catalog (404), or a cursor or slug it refuses (400). */
const absent = (error: unknown): boolean => error instanceof BackgoldApiError && (error.status === 404 || error.status === 400)

/** One page of the shop as the api answered it, and the filters that page is under. */
export interface Storefront {
  shop: ProductsResponse
  filters: StoreFilters
}

/**
 * One page of the shop (a department's, with one, under its filters), or
 * null when the api serves no catalog or refuses the page. Filters the api
 * refuses (400 `BAD_ATTR`) are dropped: the page is read again without them,
 * and drawn unfiltered.
 */
export async function storefront(
  client: BackgoldContent,
  opts: { department: string | null; cursor: string | null; filters: StoreFilters },
): Promise<Storefront | null> {
  const read = (filters: StoreFilters) =>
    client.products({
      limit: STORE_PAGE_SIZE,
      ...(opts.department ? { department: opts.department } : {}),
      ...(filters.length > 0 ? { attr: attrOption(filters) } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
    })
  try {
    return { shop: await read(opts.filters), filters: opts.filters }
  } catch (error) {
    if (opts.filters.length > 0 && error instanceof BackgoldApiError && error.code === 'BAD_ATTR') {
      try {
        return { shop: await read([]), filters: [] }
      } catch (again) {
        if (absent(again)) return null
        throw again
      }
    }
    if (absent(error)) return null
    throw error
  }
}

// ── The filter panel ─────────────────────────────────────────────────────────

/** The query name a department page's filters ride in, as GET /products takes them. */
export const FILTER_PARAM = 'attr'

/** One chosen attribute value. */
export interface StoreFilter {
  key: string
  value: string
}

/** The filters a page is under, in the order its address names them. */
export type StoreFilters = readonly StoreFilter[]

/**
 * The page address's `?attr=<key>:<value>` filters: each split at its first
 * colon, a key the api would refuse, an empty or overlong value, a repeat and
 * any past the api's limit left out, so a hand-typed address never fails the
 * page.
 */
export function storeFiltersOf(params: URLSearchParams): StoreFilters {
  const out: StoreFilter[] = []
  for (const raw of params.getAll(FILTER_PARAM)) {
    const colon = raw.indexOf(':')
    if (colon === -1) continue
    const key = raw.slice(0, colon)
    const value = raw.slice(colon + 1)
    if (!PRODUCT_ATTR_KEY_PATTERN.test(key) || value === '' || value.length > PRODUCT_ATTR_VALUE_MAX) continue
    if (out.some((f) => f.key === key && f.value === value)) continue
    out.push({ key, value })
    if (out.length === PRODUCT_ATTR_FILTERS_MAX) break
  }
  return out
}

/** The filters as `products({ attr })` takes them: a key's values together. */
function attrOption(filters: StoreFilters): Record<string, string[]> {
  const attr: Record<string, string[]> = {}
  for (const { key, value } of filters) (attr[key] ??= []).push(value)
  return attr
}

/** A department page's address under these filters, and at a later page with a cursor. */
export function filteredPath(path: string, filters: StoreFilters, cursor: string | null = null): string {
  const query = [
    ...filters.map((f) => `${FILTER_PARAM}=${encodeURIComponent(f.key)}:${encodeURIComponent(f.value)}`),
    ...(cursor ? [`cursor=${encodeURIComponent(cursor)}`] : []),
  ]
  return query.length > 0 ? `${path}?${query.join('&')}` : path
}

export interface FacetLink {
  label: string
  href: string
  count: number
  chosen: boolean
}

export interface FacetGroup {
  key: string
  label: string
  links: FacetLink[]
}

/** A facet value as the panel names it: the api's text, `true` and `false` as Yes and No. */
export function facetValueText(facet: Pick<ProductFacet, 'kind'>, value: string): string {
  if (facet.kind === 'boolean' && (value === 'true' || value === 'false')) return value === 'true' ? 'Yes' : 'No'
  return value
}

/**
 * The filter panel: one group per facet, in the api's order, each value a
 * link to the page with that value toggled (the other chosen values kept,
 * the cursor dropped). A chosen value the api did not list (nothing matches
 * it under the other filters) is kept at the end with a count of 0, so it
 * can still be turned off.
 */
export function facetGroups(facets: readonly ProductFacet[], filters: StoreFilters, path: string): FacetGroup[] {
  const isChosen = (key: string, value: string) => filters.some((f) => f.key === key && f.value === value)
  const toggled = (key: string, value: string): StoreFilters =>
    isChosen(key, value) ? filters.filter((f) => !(f.key === key && f.value === value)) : [...filters, { key, value }]
  return facets.map((facet) => {
    const values = [...facet.values]
    for (const f of filters) if (f.key === facet.key && !values.some((v) => v.value === f.value)) values.push({ value: f.value, count: 0 })
    return {
      key: facet.key,
      label: facet.label,
      links: values.map((v) => ({
        label: facetValueText(facet, v.value),
        href: filteredPath(path, toggled(facet.key, v.value)),
        count: v.count,
        chosen: isChosen(facet.key, v.value),
      })),
    }
  })
}

/** A listing for its page, or null (unknown, unpublished, or an api older than the catalog). */
export async function productPage(client: BackgoldContent, slug: string): Promise<ProductResponse | null> {
  try {
    return await client.product(slug)
  } catch (error) {
    if (absent(error)) return null
    throw error
  }
}

/** A collection for its page, or null (unknown, unpublished, or an api older than the catalog). */
export async function collectionPage(client: BackgoldContent, slug: string): Promise<CollectionResponse | null> {
  try {
    return await client.collection(slug)
  } catch (error) {
    if (absent(error)) return null
    throw error
  }
}

// ── Words and numbers ────────────────────────────────────────────────────────

/** The availability words a card and the island show. */
export const AVAILABILITY_WORDS: Record<ProductAvailability, string> = {
  in_stock: 'In stock',
  low: 'Only a few left',
  out: 'Sold out',
  preorder: 'Preorder',
}

/** The chip class an availability word wears: quiet when in stock, the accent when few are left. */
export const AVAILABILITY_CHIPS: Record<ProductAvailability, string> = {
  in_stock: 'chip-wash',
  low: 'chip-accent',
  out: '',
  preorder: 'chip-wash',
}

const WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const CENTS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A price from cents: "$30" for whole dollars, "$24.50" otherwise. */
export function money(cents: number): string {
  return cents % 100 === 0 ? WHOLE.format(cents / 100) : CENTS.format(cents / 100)
}

/** A listing's price on a card: one price, or "From $X" when its items differ. */
export function priceLabel(product: Pick<ProductSummary, 'price_from_cents' | 'price_to_cents'>): string {
  return product.price_from_cents === product.price_to_cents ? money(product.price_from_cents) : `From ${money(product.price_from_cents)}`
}

// ── The rail ─────────────────────────────────────────────────────────────────

export interface RailLink {
  label: string
  href: string
  count: number
  current: boolean
  /** 0 for a top-level department, 1 for one under the department being shown. */
  depth: 0 | 1
}

const byPosition = (a: ProductDepartment, b: ProductDepartment) => a.position - b.position || a.label.localeCompare(b.label)

/**
 * The departments rail: every top-level department with a published listing
 * in it or under it, in the tree's order; on a department's page, its path
 * is current and the departments under it with something in them follow it.
 */
export function departmentRail(departments: readonly ProductDepartment[], current: string | null): RailLink[] {
  const live = departments.filter((d) => d.count > 0)
  const bySlug = new Map(live.map((d) => [d.slug, d]))
  const shown = current ? bySlug.get(current) ?? null : null
  // The current department's root, so its top-level row is marked current too.
  const path = new Set<string>()
  for (let node = shown; node; node = node.parent_id ? live.find((d) => d.id === node!.parent_id) ?? null : null) path.add(node.id)
  const link = (d: ProductDepartment, depth: 0 | 1): RailLink => ({ label: d.label, href: departmentPath(d.slug), count: d.count, current: path.has(d.id), depth })
  const out: RailLink[] = []
  for (const root of live.filter((d) => d.parent_id === null).sort(byPosition)) {
    out.push(link(root, 0))
    if (shown && path.has(root.id)) {
      for (const child of live.filter((d) => d.parent_id === shown.id).sort(byPosition)) out.push(link(child, 1))
    }
  }
  return out
}

/** The department a page narrows to, by its slug; null when the tree has no such live department. */
export function departmentOf(departments: readonly ProductDepartment[], slug: string | null): ProductDepartment | null {
  return slug ? departments.find((d) => d.slug === slug && d.count > 0) ?? null : null
}

/**
 * How many published listings the shop has: the top-level departments'
 * counts, or the page's own count when nothing is classified. GET /products
 * carries no total, so when a top-level department's storefront page is off
 * the api does not list it: its children come up as top-level departments
 * and still count, but the listings filed on it directly are left out of the
 * sum.
 */
export function shopCount(response: ProductsResponse): number {
  const roots = response.departments.filter((d) => d.parent_id === null).reduce((n, d) => n + d.count, 0)
  return Math.max(roots, response.products.length)
}

// ── The product page ─────────────────────────────────────────────────────────

/** An attribute's value as the details table shows it; null leaves the row out. */
export function attributeText(value: ProductDetail['attributes'][number]['value']): string | null {
  if (value === null) return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export interface RelatedGroup {
  title: string
  href: string | null
  products: ProductSummary[]
}

/**
 * The related listings grouped by the collection they share with the
 * listing, in the order of the listing's own collections; one the api names
 * without a shared collection goes under "More from the shop".
 */
export function relatedGroups(product: ProductDetail): RelatedGroup[] {
  const groups = new Map<string, RelatedGroup>()
  for (const ref of product.collections) groups.set(ref.slug, { title: ref.title, href: collectionPath(ref.slug), products: [] })
  const loose: ProductSummary[] = []
  for (const other of product.related) {
    const shared = other.collections.find((c) => groups.has(c.slug))
    if (shared) groups.get(shared.slug)!.products.push(other)
    else loose.push(other)
  }
  const out = [...groups.values()].filter((g) => g.products.length > 0)
  if (loose.length > 0) out.push({ title: 'More from the shop', href: null, products: loose })
  return out
}

const SCHEMA_AVAILABILITY: Record<ProductAvailability, string> = {
  in_stock: 'https://schema.org/InStock',
  low: 'https://schema.org/LimitedAvailability',
  out: 'https://schema.org/OutOfStock',
  preorder: 'https://schema.org/PreOrder',
}

/**
 * The listing as schema.org Product JSON-LD with one Offer per item, from
 * the build: the price in dollars and cents in USD, the availability, the
 * SKU and (with a UPC) the gtin12, each Offer at the listing's page on this
 * site.
 */
export function productJsonLd(product: ProductDetail, siteUrl: string): Record<string, unknown> {
  const url = new URL(productPath(product.slug), siteUrl).toString()
  const sku = product.items.find((i) => i.sku)?.sku ?? null
  const description = product.seo.description ?? product.short_description
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url,
    ...(description ? { description } : {}),
    ...(product.photos.length > 0 ? { image: product.photos.map((p) => p.url) } : {}),
    ...(sku ? { sku } : {}),
    ...(product.manufacturer ? { brand: { '@type': 'Brand', name: product.manufacturer.name } } : {}),
    ...(product.department.length > 0 ? { category: product.department.map((d) => d.label).join(' > ') } : {}),
    offers: product.items.map((item) => ({
      '@type': 'Offer',
      ...(item.sku ? { sku: item.sku } : {}),
      ...(item.upc ? { gtin12: item.upc } : {}),
      name: item.name,
      price: (item.price_cents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: SCHEMA_AVAILABILITY[item.availability],
      url,
    })),
  }
}

/**
 * Where the order goes, as the one line under the availability word (never
 * a choice): picked up at the store, shipped to a licensed dealer the buyer
 * names at checkout, or shipped to the buyer when there is something to
 * ship; null for a listing with nothing to ship to the buyer.
 */
export function shipLine(product: Pick<ProductDetail, 'ship_to' | 'ships'>): string | null {
  if (product.ship_to === 'store') return 'Pick up at the store'
  if (product.ship_to === 'third_party') return 'Ships to a licensed dealer you name at checkout'
  return product.ships ? 'Ships to you' : null
}

/** The sentence a listing that counts as a political contribution carries before Add to cart (DS §18.1). */
export const contributionLine = (siteName: string): string => `A purchase is a political contribution to ${siteName}.`

// ── The checkout ─────────────────────────────────────────────────────────────

export interface Checkout {
  /** The organization's slug on BackGold, the cart's key (`gg-cart:<org>`). */
  org: string
  /** The hosted checkout: `<origin>/s/<org>/checkout`. */
  url: string
}

/** Where a listing's cart checks out, read off its `buy_url` (`<origin>/s/<org>/<slug>`); null when it is not that shape. */
export function checkoutOf(buyUrl: string): Checkout | null {
  try {
    const url = new URL(buyUrl)
    const m = /^\/s\/([^/]+)\/[^/]+\/?$/.exec(url.pathname)
    if (!m || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null
    const org = decodeURIComponent(m[1]!)
    return { org, url: `${url.origin}/s/${encodeURIComponent(org)}/checkout` }
  } catch {
    return null
  }
}

/** The checkout of the first listing that names one. */
export function checkoutFor(products: readonly Pick<ProductSummary, 'buy_url'>[]): Checkout | null {
  for (const p of products) {
    const found = checkoutOf(p.buy_url)
    if (found) return found
  }
  return null
}

/** What the island reads about the listing from the page: the build's view of it. */
export interface IslandProduct {
  id: string
  slug: string
  name: string
  photo_url: string | null
  ships: boolean
  /** Where the order goes: a pickup at the store ships nothing to the buyer. */
  ship_to: ProductDetail['ship_to']
  buy_url: string
  /** When the build read the listing (its `updated_at`), for "As of the last build". */
  built_at: string
  items: Array<{ id: string; name: string; price_cents: number; compare_at_cents: number | null; availability: ProductAvailability }>
}

export function islandProduct(product: ProductDetail): IslandProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    photo_url: product.photos[0]?.url ?? null,
    ships: product.ships,
    ship_to: product.ship_to,
    buy_url: product.buy_url,
    built_at: product.updated_at,
    items: product.items.map(({ id, name, price_cents, compare_at_cents, availability }) => ({ id, name, price_cents, compare_at_cents, availability })),
  }
}

/** The item a page opens on: the first one that can be bought, else the first. */
export function firstBuyable<T extends { availability: ProductAvailability }>(items: readonly T[]): T | null {
  return items.find((i) => i.availability !== 'out') ?? items[0] ?? null
}
