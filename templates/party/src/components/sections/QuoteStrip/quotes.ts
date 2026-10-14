// A QuoteStrip's rows as its logos, carousel and wall layouts draw them:
// `quote` (the operator's words, verbatim), `attribution` (who said it),
// `role` (their title or organization) and `logoUrl` (the client's mark,
// shown only from a safe address). A row is a quote when it has words; a row
// with a mark is a client on the logos wall whether or not it has words.
//
// `quoted` says the words already open and close with a quotation mark the
// operator typed, so a layout that sets curly quotes around them leaves them
// as typed instead of doubling them.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { rows, type Row } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Quote {
  quote: string
  quoted: boolean
  attribution: string | null
  role: string | null
  logo: string | null
}

export interface Mark {
  logo: string
  /** The client's name for the mark's alt text: the attribution, else the role, else empty. */
  name: string
}

const OPENS = /^["'“”‘’„«»]/
const CLOSES = /["'“”‘’»«]$/

function read(row: Row) {
  const quote = text(row.quote)?.trim() ?? null
  return {
    quote,
    quoted: quote !== null && quote.length > 1 && OPENS.test(quote) && CLOSES.test(quote),
    attribution: text(row.attribution)?.trim() ?? null,
    role: text(row.role)?.trim() ?? null,
    logo: safeSrc(row.logoUrl),
  }
}

/** The section's quotes in row order: the rows with words. */
export function quotesOf(section: Section): Quote[] {
  return rows(section)
    .map(read)
    .filter((q): q is Quote => q.quote !== null)
}

/** The logos wall: each row's mark in row order, a mark two rows share once. */
export function marksOf(section: Section): Mark[] {
  const seen = new Set<string>()
  const marks: Mark[] = []
  for (const row of rows(section).map(read)) {
    if (!row.logo || seen.has(row.logo)) continue
    seen.add(row.logo)
    marks.push({ logo: row.logo, name: row.attribution ?? row.role ?? '' })
  }
  return marks
}
