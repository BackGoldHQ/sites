// A Comparison's sides and rows as its layouts draw them.
//
// - A side is one of three, always in this order: `us` (labelled `usLabel`),
//   `them` (`themLabel`) and `them2` (`them2Label`). Only a side with a label
//   is drawn anywhere; each layout then leaves out a side no row fills.
// - A row is an issue: `issue`, each side's position in words (`us`, `them`,
//   `them2`) and its place on the spectrum (`usAt`, `themAt`, `them2At`, from
//   0 at `leftLabel` to 100 at `rightLabel`). A row without an issue is not
//   drawn; a place that is not a number from 0 to 100 is left out.
//
// Each side carries the short forms the Spectrum layout marks its rail with:
// ours a pill with `short` (the label when it is 14 characters or fewer, else
// its leading capitalised words, at most two: "Pine Valley" for "Pine Valley
// for Liberty"), the others a circle with `initial` (the first letter of the
// label's first word after a leading "The", "A" or "An"; two letters for
// both when the two others would share one).

import type { Section } from '@backgold/content'
import { rows } from '../../../lib/section'
import { text } from '../../../lib/format'

export const SIDES = ['us', 'them', 'them2'] as const
export type SideKey = (typeof SIDES)[number]

export interface Side {
  key: SideKey
  label: string
  /** Ours: the label, or its leading words when it is long. */
  short: string
  /** The others: one or two letters for the label. */
  initial: string
}

export interface Line {
  issue: string
  /** Each side's position, in words. */
  says: Record<SideKey, string | null>
  /** Each side's place from 0 (left) to 100 (right). */
  at: Record<SideKey, number | null>
}

const SHORT = 14
const ARTICLE = /^(the|a|an)$/i

function words(label: string): string[] {
  const all = label.trim().split(/\s+/)
  return all.length > 1 && ARTICLE.test(all[0]!) ? all.slice(1) : all
}

function shortOf(label: string): string {
  const trimmed = label.trim()
  if (trimmed.length <= SHORT) return trimmed
  const all = trimmed.split(/\s+/)
  const lead: string[] = []
  for (const word of all) {
    if (lead.length === 2 || !/^\p{Lu}/u.test(word)) break
    lead.push(word)
  }
  return lead.length > 0 ? lead.join(' ') : all[0]!
}

function letters(label: string, count: 1 | 2): string {
  const [first = '', second] = words(label)
  const picked = count === 1 ? first.slice(0, 1) : second ? first.slice(0, 1) + second.slice(0, 1) : first.slice(0, 2)
  return picked.toUpperCase()
}

/** The sides with a label, ours first. */
export function sidesOf(section: Section): Side[] {
  const labelled = SIDES.flatMap((key) => {
    const label = text(section.copy[`${key}Label`])?.trim()
    return label ? [{ key, label, short: shortOf(label), initial: letters(label, 1) }] : []
  })
  const others = labelled.filter((s) => s.key !== 'us')
  if (others.length === 2 && others[0]!.initial === others[1]!.initial) {
    for (const side of others) side.initial = letters(side.label, 2)
  }
  return labelled
}

function place(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

/** The section's issues in row order: the rows that name one. */
export function linesOf(section: Section): Line[] {
  return rows(section).flatMap((row) => {
    const issue = text(row.issue)
    if (!issue) return []
    return [
      {
        issue,
        says: { us: text(row.us), them: text(row.them), them2: text(row.them2) },
        at: { us: place(row.usAt), them: place(row.themAt), them2: place(row.them2At) },
      },
    ]
  })
}
