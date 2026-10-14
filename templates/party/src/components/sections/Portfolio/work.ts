// A Portfolio section's work as its layouts draw it: the rows of the
// authored list (`work`, prop `items`), in row order, the first 24. Each
// piece reads `title`, `kind` (a short word: "Mail", "Video", "Brand"),
// `client`, `year`, `summary`, `role`, `result`, its picture (`imageUrl`),
// the more pictures a lightbox shows (`images`, a list of addresses) and
// its page (`href`). A row without a title is not a piece of work.
//
// Every address is checked as the siblings check theirs: a picture with an
// unsafe or missing address is left out, and so is a link. A piece's
// pictures are its own picture first, then `images`, each once.
//
// `clientLabel` ("Client") prefixes the client wherever a layout shows it
// ("Client: A State House campaign"); without it the client stands alone.

import type { Section } from '@backgold/content'
import { relFor, safeSrc } from '@backgold/astro/server'
import { linkOf, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

const MAX = 24

export interface Work {
  title: string
  kind: string | null
  client: string | null
  year: string | null
  summary: string | null
  role: string | null
  result: string | null
  /** The piece's picture and its more pictures, safe addresses, each once. */
  pictures: string[]
  /** The piece's page, when the row has a safe address for it. */
  link: Link | null
}

/** A short field: trimmed text, or a number written as text (a year typed as 2024). */
function short(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return text(value)?.trim() ?? null
}

/** The section's work in row order: the first 24 rows that have a title. */
export function workOf(section: Section): Work[] {
  return rows(section)
    .flatMap((row) => {
      const title = short(row.title)
      if (!title) return []
      const more = Array.isArray(row.images) ? row.images : []
      const pictures = [...new Set([row.imageUrl, ...more].map((url) => safeSrc(url)).filter((url): url is string => !!url))]
      return [
        {
          title,
          kind: short(row.kind),
          client: short(row.client),
          year: short(row.year),
          summary: text(row.summary),
          role: text(row.role),
          result: text(row.result),
          pictures,
          link: linkOf(title, row.href),
        },
      ]
    })
    .slice(0, MAX)
}

/** The kinds the work names, each once, in the order the rows first name them. */
export function kindsOf(work: Work[]): string[] {
  return [...new Set(work.map((w) => w.kind).filter((kind): kind is string => kind !== null))]
}

/** "Client: A State House campaign", or the client alone without a label; null with no client. */
export function clientOf(work: Work, clientLabel: string | null): string | null {
  if (!work.client) return null
  return clientLabel ? `${clientLabel}: ${work.client}` : work.client
}

/** "Client: A State House campaign · 2024", the parts a piece has; null with neither. */
export function creditOf(work: Work, clientLabel: string | null): string | null {
  return [clientOf(work, clientLabel), work.year].filter(Boolean).join(' · ') || null
}

/** "Mail · 2024", the parts a piece has; null with neither. */
export function kindAndYear(work: Work): string | null {
  return [work.kind, work.year].filter(Boolean).join(' · ') || null
}

/**
 * Where a piece goes without script: its page, else its first picture, else
 * nowhere (null).
 */
export function targetOf(work: Work): { href: string; rel: 'noopener' | undefined } | null {
  if (work.link) return { href: work.link.href, rel: work.link.rel }
  return work.pictures[0] ? { href: work.pictures[0], rel: relFor(work.pictures[0]) } : null
}

/** An id unique to the section, for aria-controls and labels. */
export function idFor(section: Section, suffix: string): string {
  return `${section.id}-${suffix}`.replace(/[^A-Za-z0-9_-]/g, '-')
}
