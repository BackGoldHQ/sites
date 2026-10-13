// A SampleBallot's rows as its layouts draw them: the races (a candidate for
// an office, with the party, the place on the ballot, a line about them, a
// link to their page, the headshot, and whether the organization endorses
// them) and the measures (a title in `office`, the organization's position,
// the line on it and a link to its analysis), each in the order the
// organization wrote them. A race needs a name and a measure a title; any
// other row is left out. A row whose kind is not `measure` is a race.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { linkOf, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Race {
  office: string | null
  name: string
  party: string | null
  region: string | null
  summary: string | null
  link: Link | null
  photo: string | null
  endorsed: boolean
}

export type Position = 'yes' | 'no' | 'neutral'

export interface Measure {
  title: string
  position: Position | null
  summary: string | null
  link: Link | null
}

export interface Ballot {
  races: Race[]
  measures: Measure[]
}

const POSITIONS: readonly string[] = ['yes', 'no', 'neutral']

export function ballotOf(section: Section): Ballot {
  const races: Race[] = []
  const measures: Measure[] = []
  for (const row of rows(section)) {
    if (row.kind === 'measure') {
      const title = text(row.office)
      if (!title) continue
      const position = typeof row.position === 'string' && POSITIONS.includes(row.position) ? (row.position as Position) : null
      measures.push({ title, position, summary: text(row.summary), link: linkOf(title, row.href) })
      continue
    }
    const name = text(row.name)
    if (!name) continue
    races.push({
      office: text(row.office),
      name,
      party: text(row.party),
      region: text(row.region),
      summary: text(row.summary),
      link: linkOf(name, row.href),
      photo: safeSrc(row.imageUrl),
      endorsed: row.endorsed === true,
    })
  }
  return { races, measures }
}

/** The races grouped by office, each office where its first race comes, its races in row order. */
export function officesOf(races: Race[]): { office: string | null; races: Race[] }[] {
  const offices: { office: string | null; races: Race[] }[] = []
  for (const race of races) {
    const group = offices.find((o) => o.office === race.office)
    if (group) group.races.push(race)
    else offices.push({ office: race.office, races: [race] })
  }
  return offices
}

/** "Dana Whitfield (Liberty)", or the name alone with no party. */
export function nameWithParty(race: Race): string {
  return race.party ? `${race.name} (${race.party})` : race.name
}

/** A measure's position as the chip says it: "YES", "NO", "No position". */
export function positionLabel(position: Position): string {
  return position === 'neutral' ? 'No position' : position.toUpperCase()
}

/** An id for the section's own elements, from its id. */
export function idFor(section: Section, suffix: string): string {
  return `${section.id}-${suffix}`.replace(/[^A-Za-z0-9_-]/g, '-')
}
