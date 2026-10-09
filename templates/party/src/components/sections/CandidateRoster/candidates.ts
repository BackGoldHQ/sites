// A CandidateRoster's rows as its layouts draw them: each approved candidate
// with the office, its level, the place, the issues, the headshot, and links
// to their site and their donate page in BackGold (followed as given; a
// donation never happens here).

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { linkOf, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Candidate {
  name: string
  office: string | null
  /** 'statewide', 'legislative', 'judicial', 'local', or null. */
  level: string | null
  region: string | null
  status: string | null
  issues: string[]
  photo: string | null
  site: Link | null
  donate: Link | null
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
      },
    ]
  })
}

/** The level as a voter reads it on the ballot. */
export const LEVEL_LABELS: Record<string, string> = {
  statewide: 'Statewide',
  legislative: 'Legislature',
  judicial: 'Judicial',
  local: 'Local',
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
