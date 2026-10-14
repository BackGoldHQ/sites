// A CaseStudies section as its layouts draw it: the cases in the authored
// list (`cases`), in row order. Each row carries `tag` (a chip, "State House
// · 2024"), `title`, `challenge`, `approach`, `result`, up to three figures
// (`metric` with `metricLabel`, `metric2` with `metric2Label`, `metric3`
// with `metric3Label`), a `before` and an `after` (the hero figure's label
// is what they measure), `href` and `imageUrl`. A row without a title is not
// a case. Figures are the operator's typed text ("$412k", "−42%", "40+") and
// are drawn as typed; a label with no figure draws nothing.
//
// From the section's own copy and links: the read button's words
// (`readLabel`), the section's read link (`readLabel` → `readHref`), the
// before and after labels ("Before" and "After" when left blank, so the two
// panels are never told apart by their colour alone) and the note.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { linkOf, links, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

interface Metric {
  value: string
  label: string | null
}

export interface Case {
  tag: string | null
  title: string
  challenge: string | null
  approach: string | null
  result: string | null
  /** The figures that are set, in their order (`metric`, `metric2`, `metric3`). */
  metrics: Metric[]
  /** The hero figure, `metric`, with its label. */
  hero: Metric | null
  /** What the before and after measure: `metricLabel`, whether or not the hero figure is set. */
  measure: string | null
  before: string | null
  after: string | null
  /** The row's own address, checked. */
  href: string | null
  /** The title as a link to that address. */
  link: Link | null
  photo: string | null
}

const trimmed = (value: unknown): string | null => text(value)?.trim() ?? null

/** The section's cases in row order: the rows that have a title. */
export function casesOf(section: Section): Case[] {
  return rows(section).flatMap((row) => {
    const title = trimmed(row.title)
    if (!title) return []
    const metrics = (
      [
        ['metric', 'metricLabel'],
        ['metric2', 'metric2Label'],
        ['metric3', 'metric3Label'],
      ] as const
    ).flatMap(([value, label]) => {
      const figure = trimmed(row[value])
      return figure ? [{ value: figure, label: trimmed(row[label]) }] : []
    })
    const heroValue = trimmed(row.metric)
    const measure = trimmed(row.metricLabel)
    const link = linkOf(title, row.href)
    return [
      {
        tag: trimmed(row.tag),
        title,
        challenge: text(row.challenge),
        approach: text(row.approach),
        result: text(row.result),
        metrics,
        hero: heroValue ? { value: heroValue, label: measure } : null,
        measure,
        before: trimmed(row.before),
        after: trimmed(row.after),
        href: link?.href ?? null,
        link,
        photo: safeSrc(row.imageUrl),
      },
    ]
  })
}

/** The section's read link (`readLabel` → `readHref`), or null. */
export function readLinkOf(section: Section): Link | null {
  return links(section)[0] ?? null
}

/**
 * The read button for a case: the section's `readLabel` to the row's own
 * address, else the section's read link. Null without the words or an
 * address.
 */
export function readFor(section: Section, item: Case): Link | null {
  return (item.href ? linkOf(section.copy.readLabel, item.href) : null) ?? readLinkOf(section)
}

/** The before and after labels, "Before" and "After" when left blank. */
export function sidesOf(section: Section): { before: string; after: string } {
  return {
    before: trimmed(section.copy.beforeLabel) ?? 'Before',
    after: trimmed(section.copy.afterLabel) ?? 'After',
  }
}

/** The tags in the order they first appear, each once. */
export function tagsOf(cases: Case[]): string[] {
  return [...new Set(cases.map((c) => c.tag).filter((tag): tag is string => tag !== null))]
}
