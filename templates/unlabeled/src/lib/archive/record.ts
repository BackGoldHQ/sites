// One archive entry as the index keeps it: the Content API's entry detail
// read once into the few things every archive view and the search need (its
// date, meeting, category, campuses, mark, people, vote, citation, dollar
// figures, links) plus every field value as text for the full-text index.
// The field keys are the ones archive-normalized.json defines for the five
// types and her information_request type has (docs/ARCHIVE.md).

import type { EntryDetail } from '@backgold/content'
import { figuresIn } from './query'
import { markOf, type ArchiveKindKey } from './kinds'

export interface ArchiveLink {
  label: string
  href: string
  /** True for a link that leaves the site (drawn with ↗). */
  external: boolean
}

export interface ArchiveDoc {
  id: string
  kind: ArchiveKindKey
  slug: string
  /** The entry's address on the site. */
  url: string
  title: string
  summary: string
  /** The record's own date (YYYY-MM-DD): the decision's, the meeting's, the document's meeting's, the request's publish date. */
  date: string | null
  /** The meeting it hangs off, by slug (the meeting's own slug for a meeting). */
  meeting: string | null
  /** The decision_category term, the bucket's family, the office, the document kind, the request's status, the meeting kind. */
  category: string | null
  campuses: string[]
  mark: string | null
  presenter: string | null
  seconder: string | null
  vote: string | null
  voteDetail: string | null
  citation: string[]
  /** Every dollar figure the record states: its amounts, largest amount, total, pay value and line-item figures. */
  amounts: number[]
  /** A pay record's reported value. */
  pay: number | null
  links: ArchiveLink[]
  /** Every field value and term name, as text. */
  body: string
  publishAt: string | null
  /** The raw field values, for the views that draw them (the money and pay pages, the meeting strip). */
  fields: Record<string, unknown>
}

/** A field's string value, trimmed; null when empty or not a string. */
export function str(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/** A list field's strings. */
export function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((v): v is string => v !== null) : []
}

/** A reference field's slug (`{ kind, label, slug }`), or a bare slug. */
export function refSlug(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return str(record.slug) ?? str(record.label)
  }
  return str(value)
}

/** A pdf or image field's address (`{ url, file_name, size_bytes }`). */
export function fileUrl(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return str((value as Record<string, unknown>).url)
  return null
}

/** An http(s) address, else null. */
export function httpUrl(value: unknown): string | null {
  const s = str(value)
  if (!s) return null
  try {
    const url = new URL(s)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/** Digits (with an optional decimal) as a number; null for anything else. */
export function num(value: unknown): number | null {
  const s = str(value)?.replace(/[$,\s]/g, '')
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

const isoDay = (value: unknown): string | null => {
  const s = str(value)
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

/** Every value of a field as text: strings, lists, a reference's label, a file's name. */
function textOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(textOf)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return [str(record.label), str(record.file_name)].filter((v): v is string => v !== null)
  }
  const s = str(value)
  if (!s) return []
  // Addresses are links, not words.
  return /^https?:\/\//.test(s) ? [] : [s]
}

const link = (label: string, href: string | null, external = true): ArchiveLink[] => (href ? [{ label, href, external }] : [])

/** The record's links: where its original, its text, its diagram and its files are. */
function linksOf(kind: ArchiveKindKey, f: Record<string, unknown>): ArchiveLink[] {
  switch (kind) {
    case 'board_decision': {
      const source = list(f.source_documents)[0]
      return [
        ...link('Readable text', source ? `/sources/${encodeURIComponent(source)}` : null, false),
        ...link('Diagram', httpUrl(f.timeline_diagram)),
      ]
    }
    case 'board_meeting':
      return [...link('Agenda on BoardBook', httpUrl(f.agenda_link)), ...link('Minutes on BoardBook', httpUrl(f.minutes_link)), ...link('Resolutions on BoardBook', httpUrl(f.resolutions_link))]
    case 'data_bucket':
      return [...link('Sankey diagram', httpUrl(f.sankey_diagram)), ...link('Bucket data (.mmd)', httpUrl(f.sankey_data))]
    case 'pay_record':
      return link('Open the workbook', httpUrl(f.workbook_file))
    case 'source_document':
      return [
        ...link('Open on BoardBook', httpUrl(f.boardbook_link)),
        ...link('Archived PDF', fileUrl(f.archived_file) ?? httpUrl(f.archived_file)),
        ...link('Readable text', httpUrl(f.readable_text)),
      ]
    case 'information_request':
      return link('Response PDF', fileUrl(f.response_document))
  }
}

/** A pay record's citation: the workbook and its sheet and row. */
function payCitation(f: Record<string, unknown>): string[] {
  const workbook = str(f.workbook)
  const row = str(f.workbook_row)
  return workbook ? [row ? `${workbook}, ${row}` : workbook] : []
}

/** The entry detail as the archive keeps it. */
export function toDoc(kind: ArchiveKindKey, entry: EntryDetail, urlBase: string): ArchiveDoc {
  const f = entry.fields ?? {}
  const termOf = (taxonomy: string) => entry.terms.filter((t) => t.taxonomy === taxonomy).map((t) => t.label)
  const campuses = termOf('campus')
  let date: string | null = null
  let meeting: string | null = null
  let category: string | null = null
  const amounts: number[] = []
  let pay: number | null = null
  switch (kind) {
    case 'board_decision':
      date = isoDay(f.decided_on)
      meeting = refSlug(f.meeting)
      category = termOf('decision_category')[0] ?? null
      amounts.push(...list(f.amounts).flatMap(figuresIn))
      if (num(f.largest_amount) !== null) amounts.push(num(f.largest_amount)!)
      break
    case 'board_meeting':
      date = isoDay(f.meeting_date) ?? isoDay(entry.slug)
      meeting = entry.slug
      category = str(f.meeting_kind)
      break
    case 'source_document':
      meeting = refSlug(f.meeting)
      date = isoDay(meeting) ?? isoDay(entry.slug)
      category = str(f.document_kind)
      break
    case 'data_bucket':
      category = str(f.family)
      if (num(f.total_value) !== null) amounts.push(num(f.total_value)!)
      amounts.push(...[...list(f.line_items), str(f.notes) ?? ''].flatMap(figuresIn))
      break
    case 'pay_record':
      category = termOf('district_office')[0] ?? null
      pay = num(f.pay_value)
      if (pay !== null) amounts.push(pay)
      break
    case 'information_request':
      date = isoDay(entry.publish_at)
      category = str(f.status)
      amounts.push(...[str(f.what_came_back) ?? '', entry.summary ?? ''].flatMap(figuresIn))
      break
  }
  amounts.push(...figuresIn(entry.summary ?? ''))
  const body = [...Object.values(f).flatMap(textOf), ...entry.terms.map((t) => t.label)].join(' · ')
  return {
    id: entry.id,
    kind,
    slug: entry.slug,
    url: entry.url ?? `/${urlBase}/${encodeURIComponent(entry.slug)}`,
    title: entry.title,
    summary: entry.summary ?? '',
    date,
    meeting,
    category,
    campuses,
    mark: markOf(kind, str(f.archive_id), { row: str(f.workbook_row), category }),
    presenter: str(f.presenter),
    seconder: str(f.seconder),
    vote: str(f.vote_outcome),
    voteDetail: str(f.vote_detail),
    citation: kind === 'pay_record' ? payCitation(f) : list(f.source_citation),
    amounts: [...new Set(amounts)].sort((a, b) => b - a),
    pay,
    links: linksOf(kind, f),
    body,
    publishAt: entry.publish_at,
    fields: f,
  }
}
