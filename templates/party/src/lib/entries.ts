// Reading entries for the entry and list layouts (src/components/entries):
// where a type's list lives, a term's address, the byline, the reading time,
// the filter a list offers, the news list's search, and a video's player.

import type { BackgoldContent, ContentTypeSummary, EntriesResponse, Entry, EntryAuthor } from '@backgold/content'
import type { ResolvedType } from '@backgold/astro/server'

/**
 * A routable built-in type that shares `/blog` (post, podcast, video): one
 * that reports `blog` as its url_base, or none. A built-in that reports a base
 * of its own (the newsletter, at `newsletters`) has its own list there, like a
 * type the organization adds.
 */
export const sharesBlog = (type: ContentTypeSummary): boolean => type.built_in && type.routable && (type.url_base ?? 'blog') === 'blog'

/** The path a type's list lives at: `/blog` for the built-in types that share it, `/<url_base>` for every other type. */
export function listPath(type: ResolvedType | undefined): string | null {
  if (type === undefined) return null
  if (type === 'blog' || sharesBlog(type)) return '/blog'
  return type.url_base ? `/${encodeURIComponent(type.url_base)}` : null
}

/** A list's name: News for the built-in types' shared list, the type's own plural for every other type. */
export const listName = (type: ResolvedType | undefined): string => (type === undefined || type === 'blog' || sharesBlog(type) ? 'News' : type.plural_label)

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
 * with nothing published under it never shows; they are in label order.
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
 * The news list's search: each built-in type that shares `/blog` read with
 * `?q=` (at most 20 entries each, no later page), newest first. Cached under
 * the content version like every other read.
 */
export async function searchNews(client: BackgoldContent, q: string): Promise<Entry[]> {
  const { types } = await client.types()
  const pages = await Promise.all(types.filter(sharesBlog).map((t) => client.raw<EntriesResponse>(`/entries/${encodeURIComponent(t.key)}`, { q })))
  return pages
    .flatMap((page) => page?.entries ?? [])
    .sort((a, b) => ((a.publish_at ?? '') !== (b.publish_at ?? '') ? ((a.publish_at ?? '') < (b.publish_at ?? '') ? 1 : -1) : a.id < b.id ? 1 : -1))
}

/**
 * The slug of the page whose Hero opens the news list (board A4: the kicker,
 * "From the party" and its line over the posts). The page is content, written
 * in BackGold like any other; its own address leads to the news list.
 */
export const NEWS_INTRO_SLUG = 'news'
