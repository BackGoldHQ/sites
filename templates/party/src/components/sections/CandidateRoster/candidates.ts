// A CandidateRoster's rows as its layouts draw them: each approved candidate
// with the office, its level (the label BackGold sends: Federal, State,
// County, …), the place, the issues, the headshot, and links to their site
// and, when the record has one, their donate address (followed as given; a
// donation never happens here). A row carries `endorsed` when the party has
// endorsed the candidate: the bake writes the flag from the record's
// endorsement once one exists, and every layout draws an "Endorsed" chip on a
// row that has it and nothing on a row that does not.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { linkOf, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Candidate {
  name: string
  office: string | null
  /** The office's level as a voter reads it ("State", "County"), or null. */
  level: string | null
  region: string | null
  status: string | null
  issues: string[]
  photo: string | null
  site: Link | null
  donate: Link | null
  /** The party endorses this candidate; false unless the row says so. */
  endorsed: boolean
}

export function candidatesOf(section: Section): Candidate[] {
  return rows(section).flatMap((row) => {
    const name = text(row.name)
    if (!name) return []
    const issues = Array.isArray(row.issues) ? row.issues.filter((i): i is string => typeof i === 'string' && i.trim() !== '') : []
    return [
      {
        name,
        office: text(row.office),
        level: text(row.level),
        region: text(row.region),
        status: text(row.status),
        issues,
        photo: safeSrc(row.image_url),
        site: linkOf('Website', row.web_url),
        donate: linkOf('Donate', row.donate_url),
        endorsed: row.endorsed === true,
      },
    ]
  })
}

/** The levels BackGold sends, in ballot order; any other level comes after them. */
export const BALLOT_ORDER = ['Federal', 'State', 'County', 'Local', 'Municipal', 'Judicial', 'School board', 'Other']

/** A level's place in BALLOT_ORDER (an unknown or missing level last). */
export function levelRank(level: string | null): number {
  const i = level ? BALLOT_ORDER.indexOf(level) : -1
  return i < 0 ? BALLOT_ORDER.length : i
}

/** "RA" for a headshot that has not been uploaded. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}
