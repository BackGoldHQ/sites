// A Services section's rows as its layouts draw them: what the organization
// offers and what it costs, each row typed by the operator in BackGold. The
// price and the term are the operator's own words ("$4,500/mo", "15% of
// spend", "3-month minimum") and are drawn as written: nothing here reads a
// number out of them, rounds them or adds them up.
//
// A row is drawn when it has a name; a row without one is left out. Its
// button goes to the row's address, worded by its `buttonLabel` or
// "Details", and is left out when the address is missing or unsafe. The first
// row flagged `featured` is the featured one (a second flag is not a second
// favourite); the copy's `featuredLabel` is the only words that say so, and
// only when the operator wrote it.

import type { Section } from '@backgold/content'
import { linkOf, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

/** A button's words when the row names none. */
const DETAILS = 'Details'

export interface Service {
  name: string
  summary: string | null
  /** The price as typed: "$1,500", "$4,500/mo", "15% of spend". */
  price: string | null
  /** The terms as typed: "One time, two weeks", "3-month minimum". */
  term: string | null
  /** What the service includes, in the row's order. */
  includes: string[]
  /** The row's button, or null when it has no safe address. */
  link: Link | null
  featured: boolean
}

export interface Services {
  items: Service[]
  /** The featured service, or null when no row is flagged. */
  featured: Service | null
  featuredLabel: string | null
  startingLabel: string | null
  note: string | null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((s): s is string => s !== null).map((s) => s.trim()) : []
}

/** The section's services, in the operator's order. */
export function servicesOf(section: Section): Services {
  let flagged = false
  const items = rows(section).flatMap((row): Service[] => {
    const name = text(row.name)?.trim()
    if (!name) return []
    const featured = row.featured === true && !flagged
    if (featured) flagged = true
    return [
      {
        name,
        summary: text(row.summary)?.trim() ?? null,
        price: text(row.price)?.trim() ?? null,
        term: text(row.term)?.trim() ?? null,
        includes: strings(row.includes),
        link: linkOf(text(row.buttonLabel)?.trim() ?? DETAILS, row.href),
        featured,
      },
    ]
  })
  return {
    items,
    featured: items.find((s) => s.featured) ?? null,
    featuredLabel: text(section.copy.featuredLabel)?.trim() ?? null,
    startingLabel: text(section.copy.startingLabel)?.trim() ?? null,
    note: text(section.copy.note)?.trim() ?? null,
  }
}

/** Every distinct line the services include, in the order they first appear. */
export function everyInclude(items: Service[]): string[] {
  return [...new Set(items.flatMap((s) => s.includes))]
}
