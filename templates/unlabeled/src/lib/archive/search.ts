// The archive's search: a MiniSearch index over the documents (title,
// summary, every field value, the people, the terms) for plain words, and
// exact checks for what the grammar reads out of a query (query.ts):
// phrases and codes against the record's folded text, dollar amounts against
// the figures it states, a pay range against a pay record's value, dates
// against its date. Every part must hold. The server's results page and the
// island run this same module over the same documents.

import MiniSearch from 'minisearch'
import { ARCHIVE_KINDS, type ArchiveKindKey } from './kinds'
import { codeKey, foldText, formatUsd, isEmptyQuery, parseQuery, type ParsedQuery } from './query'
import type { ArchiveDoc } from './record'

/** What a search is asked: the URL's parameters (`/archive?q&kind&category&meeting&from&to&pay_min&pay_max&sort&page`). */
export interface SearchParams {
  q: string
  kind: ArchiveKindKey | null
  /** A decision_category, campus, family, office, document kind or status, by name. */
  category: string | null
  meeting: string | null
  from: string | null
  to: string | null
  payMin: number | null
  payMax: number | null
  sort: 'relevance' | 'newest' | 'oldest'
  page: number
}

export const SORTS = ['relevance', 'newest', 'oldest'] as const

/** Results on one page of the results list. */
export const PAGE_SIZE = 30

/** The longest summary shown whole; past it a row shows a window around the first hit. */
export const CONTEXT_CHARS = 330

/** The documents the search reads: an ArchiveDoc without its raw fields. */
export type SearchDoc = Omit<ArchiveDoc, 'fields'>

export interface Facet {
  value: string
  count: number
}

export interface Context {
  before: string
  hit: string
  after: string
  /** Where the hit is: the summary, or another field. */
  where: 'summary' | 'field'
}

export interface Hit {
  doc: SearchDoc
  score: number
  context: Context | null
}

export interface SearchResult {
  parsed: ParsedQuery
  /** Matches before the kind, category and meeting filters, by kind: the chips' counts. */
  kinds: Record<ArchiveKindKey, number>
  /** Every match after the filters, sorted. */
  total: number
  /** This page's matches, sorted. */
  hits: Hit[]
  page: number
  pages: number
  categories: Facet[]
  campuses: Facet[]
  meetings: Facet[]
  /** The earliest and latest dates among the matches. */
  span: { from: string; to: string } | null
}

const fold = (s: string) => foldText(s)

interface Prepared {
  doc: SearchDoc
  hay: string
  codeHay: string
}

/** MiniSearch's term rule: folded, lower case, nothing shorter than one letter or digit. */
const processTerm = (term: string): string | null => {
  const t = fold(term).trim()
  return t ? t : null
}

export interface Searcher {
  run(params: SearchParams): SearchResult
  /** Every match for these parameters, sorted, unpaged. */
  matching(params: SearchParams): SearchDoc[]
  /** How many documents a query alone matches (no filters): for "the closest smaller query". */
  count(q: string): { count: number; first: SearchDoc | null }
  docs: SearchDoc[]
}

/** Builds the searcher over the documents (once per isolate per version on the server, once per page load in the island). */
export function createSearcher(docs: SearchDoc[]): Searcher {
  const ms = new MiniSearch<SearchDoc>({
    fields: ['title', 'summary', 'body', 'people', 'terms'],
    extractField: (doc, field) => {
      if (field === 'people') return [doc.presenter, doc.seconder].filter(Boolean).join(' ')
      if (field === 'terms') return [doc.category ?? '', ...doc.campuses, doc.mark ?? ''].join(' ')
      return String((doc as unknown as Record<string, unknown>)[field] ?? '')
    },
    processTerm,
    searchOptions: {
      boost: { title: 3, people: 2, summary: 1.5, terms: 1.5 },
      prefix: (term) => term.length >= 4,
      combineWith: 'AND',
    },
  })
  ms.addAll(docs)
  const prepared: Prepared[] = docs.map((doc) => {
    const hay = fold([doc.title, doc.summary, doc.body, doc.presenter ?? '', doc.mark ?? ''].join(' · '))
    return { doc, hay, codeHay: hay.replace(/\s+/g, '') }
  })

  const match = (parsed: ParsedQuery): Array<{ p: Prepared; score: number }> => {
    let scores: Map<string, number> | null = null
    if (parsed.words.length > 0) {
      scores = new Map(ms.search(parsed.words.join(' ')).map((r) => [String(r.id), r.score]))
    }
    const out: Array<{ p: Prepared; score: number }> = []
    for (const p of prepared) {
      const { doc } = p
      const score = scores ? scores.get(doc.id) : 0
      if (score === undefined) continue
      if (!parsed.phrases.every((phrase) => p.hay.includes(phrase))) continue
      if (!parsed.codes.every((code) => p.codeHay.includes(codeKey(code)))) continue
      if (!parsed.amounts.every((a) => doc.amounts.some((n) => n >= a.low && n <= a.high))) continue
      if (parsed.pay) {
        if (doc.pay === null) continue
        if (parsed.pay.min !== null && doc.pay < parsed.pay.min) continue
        if (parsed.pay.max !== null && doc.pay > parsed.pay.max) continue
      }
      if (!parsed.dates.every((d) => doc.date !== null && doc.date >= d.from && doc.date <= d.to)) continue
      out.push({ p, score: score ?? 0 })
    }
    return out
  }

  const select = (params: SearchParams) => {
    const parsed = parseQuery(params.q)
    let matched = match(parsed)
    // The rail's own filters, which the query does not carry.
    matched = matched.filter(({ p: { doc } }) => {
      if (params.from && (doc.date === null || doc.date < params.from)) return false
      if (params.to && (doc.date === null || doc.date > params.to)) return false
      if (params.payMin !== null || params.payMax !== null) {
        if (doc.pay === null) return false
        if (params.payMin !== null && doc.pay < params.payMin) return false
        if (params.payMax !== null && doc.pay > params.payMax) return false
      }
      return true
    })
    const narrowed = matched.filter(({ p: { doc } }) => {
      if (params.category && doc.category !== params.category && !doc.campuses.includes(params.category)) return false
      if (params.meeting && doc.meeting !== params.meeting) return false
      return true
    })
    const kinds = Object.fromEntries(ARCHIVE_KINDS.map((k) => [k.key, 0])) as Record<ArchiveKindKey, number>
    for (const { p } of narrowed) kinds[p.doc.kind]++
    const rows = params.kind ? narrowed.filter(({ p }) => p.doc.kind === params.kind) : narrowed
    const sorted = sortRows(rows, isEmptyQuery(parsed) || parsed.words.length === 0 ? (params.sort === 'relevance' ? 'newest' : params.sort) : params.sort)
    return { parsed, kinds, rows, sorted }
  }

  const run = (params: SearchParams): SearchResult => {
    const { parsed, kinds, rows, sorted } = select(params)
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
    const page = Math.min(Math.max(1, params.page), pages)
    const slice = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const dates = rows.map(({ p }) => p.doc.date).filter((d): d is string => d !== null).sort()
    return {
      parsed,
      kinds,
      total: sorted.length,
      hits: groupByKind(slice.map(({ p, score }) => ({ doc: p.doc, score, context: contextOf(p.doc, parsed) }))),
      page,
      pages,
      categories: facet(rows.map(({ p }) => p.doc.category)),
      campuses: facet(rows.flatMap(({ p }) => p.doc.campuses)),
      meetings: facet(rows.map(({ p }) => p.doc.meeting)).sort((a, b) => (a.value < b.value ? 1 : -1)),
      span: dates.length ? { from: dates[0]!, to: dates.at(-1)! } : null,
    }
  }

  const count = (q: string) => {
    const found = sortRows(match(parseQuery(q)), 'relevance')
    return { count: found.length, first: found[0]?.p.doc ?? null }
  }

  const matching = (params: SearchParams) => select(params).sorted.map(({ p }) => p.doc)

  return { run, matching, count, docs }
}

function sortRows<T extends { p: Prepared; score: number }>(rows: T[], sort: SearchParams['sort']): T[] {
  const byDate = (a: T, b: T) => (b.p.doc.date ?? '').localeCompare(a.p.doc.date ?? '')
  const copy = [...rows]
  if (sort === 'relevance') return copy.sort((a, b) => b.score - a.score || byDate(a, b))
  if (sort === 'newest') return copy.sort((a, b) => byDate(a, b) || a.p.doc.title.localeCompare(b.p.doc.title))
  // Oldest first; undated records last.
  return copy.sort((a, b) => {
    const x = a.p.doc.date
    const y = b.p.doc.date
    if (x === y) return a.p.doc.title.localeCompare(b.p.doc.title)
    if (x === null) return 1
    if (y === null) return -1
    return x < y ? -1 : 1
  })
}

/** A page's hits grouped by kind in the door's order, each group keeping the sort. */
function groupByKind(hits: Hit[]): Hit[] {
  const order = new Map(ARCHIVE_KINDS.map((k, i) => [k.key, i]))
  return hits.map((hit, i) => ({ hit, i })).sort((a, b) => order.get(a.hit.doc.kind)! - order.get(b.hit.doc.kind)! || a.i - b.i).map(({ hit }) => hit)
}

function facet(values: Array<string | null>): Facet[] {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/**
 * The first hit in the summary (else in the other fields) and the words
 * around it: the whole summary when it is short, else a window of about
 * CONTEXT_CHARS. Null when the query names nothing textual that the record
 * spells out (a date, a pay range).
 */
export function contextOf(doc: SearchDoc, parsed: ParsedQuery): Context | null {
  const needles = [
    ...parsed.phrases,
    ...parsed.codes,
    ...parsed.amounts.flatMap((a) => doc.amounts.filter((n) => n >= a.low && n <= a.high).map(formatUsd)),
    ...parsed.words,
  ].filter((n) => n.length > 0)
  if (needles.length === 0) return null
  for (const [text, where] of [
    [doc.summary, 'summary'],
    [doc.body, 'field'],
  ] as const) {
    if (!text) continue
    const folded = fold(text)
    let best: { at: number; length: number } | null = null
    for (const needle of needles) {
      const isCode = parsed.codes.includes(needle)
      const n = fold(needle)
      const at = isCode ? findCode(folded, codeKey(needle)) : folded.indexOf(n)
      if (at !== -1 && (best === null || at < best.at)) best = { at, length: isCode ? codeLength(folded, at, codeKey(needle)) : n.length }
    }
    if (!best) continue
    // `fold` keeps one character per character outside runs of whitespace,
    // so the window is cut from the same text the reader sees.
    const plain = text.replace(/\s+/g, ' ')
    const half = Math.floor((CONTEXT_CHARS - best.length) / 2)
    const short = plain.length <= CONTEXT_CHARS
    const start = short ? 0 : Math.max(0, best.at - half)
    const end = short ? plain.length : Math.min(plain.length, best.at + best.length + half)
    return {
      before: `${start > 0 ? '… ' : ''}${plain.slice(start, best.at)}`,
      hit: plain.slice(best.at, best.at + best.length),
      after: `${plain.slice(best.at + best.length, end)}${end < plain.length ? ' …' : ''}`,
      where,
    }
  }
  return null
}

/** Where a code (spaces ignored) starts in folded text; -1 when absent. */
function findCode(folded: string, key: string): number {
  for (let i = 0; i < folded.length; i++) {
    if (folded[i] === ' ') continue
    if (codeLength(folded, i, key) > 0) return i
  }
  return -1
}

/** The length of the text at `at` that spells `key` with any spaces; 0 when it does not. */
function codeLength(folded: string, at: number, key: string): number {
  let j = 0
  let i = at
  while (i < folded.length && j < key.length) {
    if (folded[i] === ' ') {
      i++
      continue
    }
    if (folded[i] !== key[j]) return 0
    i++
    j++
  }
  return j === key.length ? i - at : 0
}

/** The URL's parameters as SearchParams; anything malformed is left out. */
export function paramsOf(search: URLSearchParams): SearchParams {
  const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const amount = (v: string | null) => {
    const n = v ? Number(v.replace(/[$,\s]/g, '')) : NaN
    return Number.isFinite(n) && n >= 0 && v !== '' ? n : null
  }
  const kind = search.get('kind')
  const sort = search.get('sort')
  const page = Number(search.get('page'))
  return {
    q: (search.get('q') ?? '').trim().slice(0, 200),
    kind: ARCHIVE_KINDS.some((k) => k.key === kind) ? (kind as ArchiveKindKey) : null,
    category: search.get('category')?.trim() || null,
    meeting: day(search.get('meeting')),
    from: day(search.get('from')),
    to: day(search.get('to')),
    payMin: amount(search.get('pay_min')),
    payMax: amount(search.get('pay_max')),
    sort: (SORTS as readonly string[]).includes(sort ?? '') ? (sort as SearchParams['sort']) : 'relevance',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** The URL for these parameters, with a change; defaults and empties left out. */
export function hrefOf(params: SearchParams, change: Partial<SearchParams> = {}, path = '/archive'): string {
  const p = { ...params, ...change }
  const out = new URLSearchParams()
  if (p.q) out.set('q', p.q)
  if (p.kind) out.set('kind', p.kind)
  if (p.category) out.set('category', p.category)
  if (p.meeting) out.set('meeting', p.meeting)
  if (p.from) out.set('from', p.from)
  if (p.to) out.set('to', p.to)
  if (p.payMin !== null) out.set('pay_min', String(p.payMin))
  if (p.payMax !== null) out.set('pay_max', String(p.payMax))
  if (p.sort !== 'relevance') out.set('sort', p.sort)
  if (p.page > 1) out.set('page', String(p.page))
  const qs = out.toString()
  return qs ? `${path}?${qs}` : path
}

/** The parameter names the results page reads, for the edge cache's reads-query header. */
export const ARCHIVE_QUERY_NAMES = ['q', 'kind', 'category', 'meeting', 'from', 'to', 'pay_min', 'pay_max', 'sort', 'page'] as const

/** True when the URL asks the results page for anything (a stored copy of the door must not answer it). */
export const asksAnything = (search: URLSearchParams): boolean => ARCHIVE_QUERY_NAMES.some((name) => (search.get(name) ?? '') !== '')

/** The empty parameters: the door at rest. */
export const REST: SearchParams = { q: '', kind: null, category: null, meeting: null, from: null, to: null, payMin: null, payMax: null, sort: 'relevance', page: 1 }

const searchers = new WeakMap<object, Searcher>()

/** The searcher over an archive's documents, built once per loaded archive. */
export function searcherFor(data: { docs: SearchDoc[] }): Searcher {
  let searcher = searchers.get(data)
  if (!searcher) {
    searcher = createSearcher(data.docs)
    searchers.set(data, searcher)
  }
  return searcher
}

/**
 * The closest smaller query: the query with one of its pieces left out
 * that still matches something, the one that matches most; null when the
 * query has one piece or no smaller query matches.
 */
export function closestSmaller(searcher: Searcher, parsed: ParsedQuery): { q: string; count: number; first: SearchDoc | null } | null {
  if (parsed.pieces.length < 2) return null
  let best: { q: string; count: number; first: SearchDoc | null } | null = null
  for (let i = 0; i < parsed.pieces.length; i++) {
    const q = parsed.pieces.filter((_, j) => j !== i).join(' ')
    const found = searcher.count(q)
    if (found.count > 0 && (best === null || found.count > best.count)) best = { q, ...found }
  }
  return best
}
