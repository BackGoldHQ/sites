// An About section as its portrait and books layouts read it: the person's
// words from the copy, and the authored list (`credentials`, prop `items`)
// sorted by each row's `kind`:
//
// - 'credential': a line of what the person has done or holds ("Former
//   campaign manager"), its `detail` under it, its `year` before it, its
//   `href` on the label;
// - 'book': a book the person wrote, its `imageUrl` the cover, its `year`
//   and `detail` (the publisher, "New") the line under the title, its `href`
//   where to get it;
// - 'milestone': a step of the person's story, its `year` over its `label`,
//   its `detail` under.
//
// Each kind keeps the operator's row order. A row with no label, or with a
// kind that is not one of the three, is left out. A year is drawn as typed;
// one that is a plain four-digit year is also given to `<time datetime>`.
// The pull quote (`quote`) is drawn without any quote marks typed around it,
// since the layout sets it as a quotation, and its source as written.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { linkOf, links, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Credential {
  label: string
  /** The label's link, when the row has a safe address. */
  link: Link | null
  detail: string | null
  year: string | null
  /** The year as a `<time datetime>` value, when it is a four-digit year. */
  datetime: string | null
}

export interface Book {
  title: string
  /** Where to get the book, when the row has a safe address. */
  link: Link | null
  detail: string | null
  year: string | null
  datetime: string | null
  /** The cover's address, or null for none or an unsafe one. */
  cover: string | null
}

export interface Credentials {
  credentials: Credential[]
  books: Book[]
  milestones: Credential[]
}

const trimmed = (value: unknown): string | null => text(value)?.trim() || null

const yearOf = (year: string | null): string | null => (year && /^\d{4}$/.test(year) ? year : null)

/** The section's credential, book and milestone rows, each in row order. */
export function credentialsOf(section: Section): Credentials {
  const out: Credentials = { credentials: [], books: [], milestones: [] }
  for (const row of rows(section)) {
    const label = trimmed(row.label)
    if (!label) continue
    const year = trimmed(row.year)
    const line: Credential = { label, link: linkOf(label, row.href), detail: trimmed(row.detail), year, datetime: yearOf(year) }
    if (row.kind === 'credential') out.credentials.push(line)
    else if (row.kind === 'milestone') out.milestones.push(line)
    else if (row.kind === 'book') out.books.push({ ...line, title: label, cover: safeSrc(row.imageUrl) })
  }
  return out
}

/** The pull quote and its source; null without a quote. */
export function quoteOf(section: Section): { quote: string; source: string | null } | null {
  const quote = trimmed(section.copy.quote)?.replace(/^["“”']+|["“”']+$/g, '').trim()
  return quote ? { quote, source: trimmed(section.copy.quoteSource) } : null
}

/** The section's one button (`buttonLabel` → `buttonHref`), or null. */
export function buttonOf(section: Section): Link | null {
  return links(section)[0] ?? null
}

/**
 * The photo's treatment (`options.photoStyle`), as BackGold's own About
 * block reads it: 'photo' (the default) crops to fill; 'badge' and 'plain'
 * show the whole picture (a logo), on the band's surface or on nothing.
 */
export function photoStyleOf(section: Section): 'photo' | 'badge' | 'plain' {
  const style = section.options?.photoStyle
  return style === 'badge' || style === 'plain' ? style : 'photo'
}
