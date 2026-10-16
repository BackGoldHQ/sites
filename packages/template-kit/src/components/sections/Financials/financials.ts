// A Financials section's figures as its layouts draw them (REPORT §2 G15,
// "where the money goes"). The figures are the organization's own published
// ones, drawn verbatim: nothing here sums, normalises, derives a total or
// computes a percentage. A row is a figure:
//
// - `category`, what the money went to, in the operator's words;
// - `share`, its part of the whole as the organization published it, a number
//   from 0 to 100 (anything else is left out, and the figure is drawn without
//   a bar, a slice or a share);
// - `amount`, the operator's words for the money ("$412,000"), never parsed;
// - `note`, a line under it.
//
// A row with neither a category nor an amount is not drawn, and at most
// twelve figures are.

import type { Section } from '@backgold/content'
import { rows } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Figure {
  category: string | null
  /** The published share, 0 to 100, as given. */
  share: number | null
  /** The operator's words for the money. */
  amount: string | null
  note: string | null
}

const MAX = 12

function shareOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

/** The section's figures in row order. */
export function rowsOf(section: Section): Figure[] {
  return rows(section)
    .flatMap((row) => {
      const category = text(row.category)
      const amount = text(row.amount)
      if (!category && !amount) return []
      return [{ category, share: shareOf(row.share), amount, note: text(row.note) }]
    })
    .slice(0, MAX)
}

const PERCENT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** A share as it is shown: "62%", "12.5%". */
export function shareLabel(share: number): string {
  return `${PERCENT.format(share)}%`
}
