// An Issues section's rows as its rows and checklist layouts read them: the
// rows with a title or a body (the rule every Issues layout keeps), each with
// its picture (`imageUrl`, null for none or an unsafe one), its `note` (a
// chip such as "Week 0") and what it `includes`, its blank lines left out,
// in the row's order.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { rows } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Issue {
  title: string | null
  body: unknown
  picture: string | null
  note: string | null
  includes: string[]
}

export function issuesOf(section: Section): Issue[] {
  return rows(section).flatMap((row) => {
    if (!text(row.title) && !text(row.body)) return []
    const includes = Array.isArray(row.includes) ? row.includes.map((s) => text(s)?.trim()).filter((s): s is string => !!s) : []
    return [
      {
        title: text(row.title),
        body: row.body,
        picture: safeSrc(row.imageUrl),
        note: text(row.note)?.trim() || null,
        includes,
      },
    ]
  })
}

/** "01", "02": an issue's place in the list. */
export const numeral = (i: number): string => String(i + 1).padStart(2, '0')
