import { isBlogType } from './format.js'
import type { Author, BackgoldContent, ContentTypeSummary, EntriesResponse, Entry, EntryDetail, PageResponse, TermsResponse } from '@backgold/content'

/** A routable type, or `'blog'`: the built-in types that share `/blog`. */
export type ResolvedType = ContentTypeSummary | 'blog'

/** What a path on the site is (plan D7, the brief's §6 order). */
export type Resolved =
  | { kind: 'page'; page: PageResponse }
  | { kind: 'index'; type: ResolvedType; entries: Entry[]; next_cursor: string | null }
  | { kind: 'entry'; type: ContentTypeSummary; entry: EntryDetail }
  | { kind: 'author'; author: Author; entries: Entry[] }
  | { kind: 'term'; type: ResolvedType; taxonomy: TermsResponse['taxonomy']; term: TermsResponse['terms'][number]; entries: Entry[] }
  | { kind: 'feed'; type: ResolvedType }
  | { kind: 'not_found' }

/** The api's largest page; an index shows the first one (the edge cache drops `?cursor=`). */
const INDEX_LIMIT = 50
const BLOG_BASE = 'blog'
const AUTHORS_BASE = 'authors'
const FEED_FILE = 'feed.xml'
const NOT_FOUND: Resolved = { kind: 'not_found' }

/** A path's decoded segments (no trailing slash, no query); null for anything no route can name. */
function segmentsOf(pathname: string): string[] | null {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null
  const path = pathname.replace(/[?#].*$/s, '').replace(/\/+$/, '')
  if (path === '') return []
  const segments: string[] = []
  for (const part of path.slice(1).split('/')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(part)
    } catch {
      return null
    }
    if (decoded === '' || decoded === '.' || decoded === '..' || /[/\\\u0000-\u001F\u007F]/.test(decoded)) return null
    segments.push(decoded)
  }
  return segments
}

function samePath(url: string, segments: string[]): boolean {
  const other = segmentsOf(url)
  return other !== null && other.length === segments.length && other.every((s, i) => s === segments[i])
}

/** Newest first, as the api orders one type's list. */
function newestFirst(a: Entry, b: Entry): number {
  const at = a.publish_at ?? ''
  const bt = b.publish_at ?? ''
  if (at !== bt) return at < bt ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/**
 * The first page of a type's entries. `/blog` merges the built-in types'
 * first pages; its `next_cursor` is the one type's when only one built-in
 * type is routable, and null otherwise (a cursor names one type's list).
 */
async function firstPage(bg: BackgoldContent, types: ContentTypeSummary[], term?: string): Promise<{ entries: Entry[]; next_cursor: string | null }> {
  const pages = (await Promise.all(types.map((t) => bg.entries(t.key, { limit: INDEX_LIMIT, term })))).filter(
    (p): p is EntriesResponse => p !== null,
  )
  if (pages.length === 1) return { entries: pages[0]!.entries, next_cursor: pages[0]!.next_cursor }
  return { entries: pages.flatMap((p) => p.entries).sort(newestFirst).slice(0, INDEX_LIMIT), next_cursor: null }
}

/**
 * Resolve a pathname against the site's pages, `/types` url bases, authors and
 * terms: a published page, a type's index at its `url_base` (the built-ins at
 * `/blog`), an entry, an author at `/authors/<slug>`, a term index at
 * `/<url_base>/<taxonomy>/<slug>`, a type's feed at `/<url_base>/feed.xml`.
 * Redirects are the middleware's. A malformed path is `not_found`; an api
 * failure throws.
 */
export async function resolveRoute(bg: BackgoldContent, pathname: string): Promise<Resolved> {
  const segments = segmentsOf(pathname)
  if (!segments) return NOT_FOUND
  if (segments.length === 0) {
    const page = await bg.page('home')
    return page ? { kind: 'page', page } : NOT_FOUND
  }

  const [{ pages }, { types }] = await Promise.all([bg.pages(), bg.types()])
  const listed = pages.find((p) => samePath(p.url, segments))
  if (listed) {
    const page = await bg.page(listed.is_home ? 'home' : listed.slug)
    if (page) return { kind: 'page', page }
  }

  const [base, second, third, ...rest] = segments as [string, ...string[]]
  const blogTypes = types.filter(isBlogType)
  let type: ResolvedType | undefined
  let members: ContentTypeSummary[] = []
  if (base === BLOG_BASE && blogTypes.length > 0) {
    type = 'blog'
    members = blogTypes
  } else {
    const custom = types.find((t) => !t.built_in && t.routable && t.url_base === base)
    if (custom) {
      type = custom
      members = [custom]
    }
  }

  if (!type) {
    if (base === AUTHORS_BASE && second !== undefined && third === undefined) {
      const found = await bg.author(second)
      // The api lists entries by type and term, not by author.
      return found ? { kind: 'author', author: found.author, entries: [] } : NOT_FOUND
    }
    return NOT_FOUND
  }
  if (rest.length > 0) return NOT_FOUND

  if (second === undefined) return { kind: 'index', type, ...(await firstPage(bg, members)) }

  if (third === undefined) {
    if (second === FEED_FILE) return { kind: 'feed', type }
    for (const member of members) {
      const found = await bg.entry(member.key, second)
      if (found) return { kind: 'entry', type: member, entry: found.entry as EntryDetail }
    }
    return NOT_FOUND
  }

  const terms = await bg.terms(second)
  const term = terms?.terms.find((t) => t.slug === third)
  if (!terms || !term) return NOT_FOUND
  const listing = await firstPage(bg, members, term.slug)
  // `?term=` matches the slug in any taxonomy; the page names one.
  const entries = listing.entries.filter((e) => e.terms.some((t) => t.taxonomy === terms.taxonomy.key && t.slug === term.slug))
  return { kind: 'term', type, taxonomy: terms.taxonomy, term, entries }
}
