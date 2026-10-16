// Reading entries for the entry and list layouts (src/components/entries):
// where a type's list lives, a term's address, the byline, the reading time,
// the filter a list offers, the news list's search, and a video's player.

import type { BackgoldContent, ContentTypeSummary, EntriesResponse, Entry, EntryAuthor, PageResponse } from '@backgold/content'
import { isBlogType, type ResolvedType } from '@backgold/astro/server'

/** A list's path from its base, the address resolveRoute names it by (`news` is `/news`). */
export const basePath = (base: string): string => `/${encodeURIComponent(base)}`

/**
 * A list's name. The blog types' list (post, podcast and video together, at
 * the organization's blog base) is named by its intro page's title when it
 * has one, else by its address: "News" at `news`, "Blog" at `blog`. Every
 * other type's list is named by its plural.
 */
export function listName(type: ResolvedType, base: string, intro: PageResponse | null = null): string {
  if (type !== 'blog' && !isBlogType(type)) return type.plural_label
  const words = base.replace(/-/g, ' ')
  return intro?.page.title?.trim() || words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The list an entry of `type` is listed in, for its breadcrumb: the type's
 * url_base, which for a blog type is the blog base its types share, and that
 * list's name. Null for a type with no pages, or none.
 */
export function listOf(type: ContentTypeSummary | undefined): { path: string; name: string } | null {
  if (!type?.routable || !type.url_base) return null
  return { path: basePath(type.url_base), name: listName(type, type.url_base) }
}

/** The address of a term's list under a type's list. */
export function termPath(base: string, taxonomy: string, slug: string): string {
  return `${base}/${encodeURIComponent(taxonomy)}/${encodeURIComponent(slug)}`
}

/** One byline role and the people under it, in the order the entry lists them. */
export interface BylineGroup {
  role: string
  people: Array<EntryAuthor & { href: string }>
}

export function bylineGroups(authors: EntryAuthor[]): BylineGroup[] {
  const groups = new Map<string, BylineGroup['people']>()
  for (const author of authors) {
    groups.set(author.role, [...(groups.get(author.role) ?? []), { ...author, href: `/authors/${encodeURIComponent(author.slug)}` }])
  }
  return [...groups].map(([role, people]) => ({ role, people }))
}

/** The people who wrote it (or gave the interview), never its editor or photographer. */
export const writers = (authors: EntryAuthor[]): EntryAuthor[] => authors.filter((a) => a.role === 'Written by' || a.role === 'Interview by')

/** Initials for a person with no picture: "Dana K." is "DK". */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, '').charAt(0))
    .filter(Boolean)
  return (letters.length > 1 ? letters[0]! + letters.at(-1)! : (letters[0] ?? '')).toUpperCase()
}

/** Minutes to read a markdown body at 220 words a minute; null for an empty body. */
export function readingMinutes(markdown: string | undefined): number | null {
  const words = (markdown ?? '').replace(/[#>*_`[\]()!|-]/g, ' ').split(/\s+/).filter(Boolean).length
  return words === 0 ? null : Math.max(1, Math.round(words / 220))
}

/** A list's filter: one taxonomy and the terms in it a listed entry carries. */
export interface ListFilter {
  taxonomy: string
  terms: Array<{ slug: string; label: string }>
}

/**
 * The filter a list offers: its categories, or its tags when no listed entry
 * carries a category. Only terms a listed entry carries are offered, so a term
 * with nothing published under it never shows; they are in label order here,
 * and the list frame puts them in the organization's order (`listTermsOf`).
 */
export function filterOf(entries: Entry[]): ListFilter | null {
  for (const taxonomy of ['category', 'tag']) {
    const seen = new Map<string, string>()
    for (const entry of entries) {
      for (const term of entry.terms) if (term.taxonomy === taxonomy && !seen.has(term.slug)) seen.set(term.slug, term.label)
    }
    if (seen.size > 0) {
      const terms = [...seen].map(([slug, label]) => ({ slug, label })).sort((a, b) => a.label.localeCompare(b.label))
      return { taxonomy, terms }
    }
  }
  return null
}

/**
 * The term a list frame draws as a link at the end of its filter row instead
 * of as one of its chips (board C10's "Press releases →"): the category with
 * this slug, when the organization has one. Named by its slug, so featuring
 * it asks the Content API for nothing new; an organization that names its
 * press category otherwise gets it as an ordinary chip.
 */
const FEATURED_TERM = { taxonomy: 'category', slug: 'press-releases' } as const

/** What a list frame's filter row draws: the chips, in order, and the featured term's link. */
export interface ListTerms {
  chips: ListFilter['terms']
  /** `key` is `<taxonomy>/<slug>`, as a term's list names its term. */
  featured: { key: string; label: string; href: string } | null
}

/**
 * The filter's terms in the organization's order (each term's `position` from
 * GET /terms, label order among equals and for a term /terms does not list),
 * the featured term taken out of them, and the featured term's link under the
 * list at `base` when its taxonomy lists it, whether or not a listed entry
 * carries it.
 */
export async function listTermsOf(client: BackgoldContent, base: string, filter: ListFilter | null): Promise<ListTerms> {
  const read = (taxonomy: string) => client.terms(taxonomy).catch(() => null)
  const [own, featuredTaxonomy] = await Promise.all([
    filter ? read(filter.taxonomy) : null,
    filter?.taxonomy === FEATURED_TERM.taxonomy ? null : read(FEATURED_TERM.taxonomy),
  ])
  const position = new Map((own?.terms ?? []).map((t) => [t.slug, t.position]))
  const at = (slug: string) => position.get(slug) ?? Number.POSITIVE_INFINITY
  const featuredIn = filter?.taxonomy === FEATURED_TERM.taxonomy ? own : featuredTaxonomy
  const featured = featuredIn?.terms.find((t) => t.slug === FEATURED_TERM.slug) ?? null
  const chips = (filter?.terms ?? [])
    .filter((t) => !(featured && filter?.taxonomy === FEATURED_TERM.taxonomy && t.slug === featured.slug))
    .sort((a, b) => at(a.slug) - at(b.slug) || a.label.localeCompare(b.label))
  return {
    chips,
    featured: featured ? { key: `${FEATURED_TERM.taxonomy}/${featured.slug}`, label: featured.label, href: termPath(base, FEATURED_TERM.taxonomy, featured.slug) } : null,
  }
}

/** The entry's first term in the list's filter taxonomy (else its first term): the line over a row's title. */
export function rowTerm(entry: Entry, taxonomy: string | undefined): Entry['terms'][number] | null {
  return entry.terms.find((t) => t.taxonomy === taxonomy) ?? entry.terms[0] ?? null
}

/** A type's singular name for an entry's type key, from GET /types. */
export function singularOf(types: ContentTypeSummary[], key: string): string | null {
  return types.find((t) => t.key === key)?.singular_label ?? null
}

/** A YouTube or Vimeo address as its player's address (YouTube's privacy-enhanced one); null for anything else. */
export function playerOf(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^www\./, '')
  const youtube =
    host === 'youtu.be'
      ? parsed.pathname.slice(1)
      : host === 'youtube.com' || host === 'm.youtube.com'
        ? (parsed.searchParams.get('v') ?? /^\/(?:embed|shorts|live)\/([^/]+)/.exec(parsed.pathname)?.[1] ?? '')
        : ''
  if (/^[A-Za-z0-9_-]{11}$/.test(youtube)) return `https://www.youtube-nocookie.com/embed/${youtube}`
  const vimeo = host === 'vimeo.com' || host === 'player.vimeo.com' ? /(\d{6,12})/.exec(parsed.pathname)?.[1] : undefined
  return vimeo ? `https://player.vimeo.com/video/${vimeo}` : null
}

/** The shortest and longest search the Content API answers (`GET /entries/:type?q=`). */
const SEARCH_MIN = 2
const SEARCH_MAX = 80

/** A list's `?q=`, trimmed, when it is a search the api answers (2 to 80 characters); else null. */
export function searchQuery(raw: string | null): string | null {
  const q = raw?.trim() ?? ''
  const length = Array.from(q).length
  return length >= SEARCH_MIN && length <= SEARCH_MAX ? q : null
}

/**
 * The news list's search: each blog type read with `?q=` (at most 20 entries
 * each, no later page), newest first. Cached under the content version like
 * every other read.
 */
export async function searchNews(client: BackgoldContent, q: string): Promise<Entry[]> {
  const { types } = await client.types()
  const pages = await Promise.all(types.filter(isBlogType).map((t) => client.raw<EntriesResponse>(`/entries/${encodeURIComponent(t.key)}`, { q })))
  return pages
    .flatMap((page) => page?.entries ?? [])
    .sort((a, b) => ((a.publish_at ?? '') !== (b.publish_at ?? '') ? ((a.publish_at ?? '') < (b.publish_at ?? '') ? 1 : -1) : a.id < b.id ? 1 : -1))
}
