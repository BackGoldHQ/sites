// A Scorecard's rows as its layouts draw them. One authored list (`votes`)
// carries two kinds of row, and each layout reads its own:
//
// - a vote: `bill`, `issue`, `vote` ('yea' | 'nay' | 'absent'), `position`
//   ('agrees' | 'disagrees': whether the vote agrees with the party's
//   position), `date` (YYYY-MM-DD) and `href` (the roll call). The Table
//   layout draws these, the Record vs. promise layout lists their bills.
// - a person: `name`, `office`, `grade` (a letter), `score` (0 to 100) and
//   `imageUrl`. The Grades layout draws these.
//
// A row without a bill is not a vote and one without a name is not a person;
// a value outside its list ('maybe' for a vote) is left out rather than shown.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { linkOf, rows, type Link } from '../../../lib/section'
import { formatShortDay, text } from '../../../lib/format'

const VOTES = { yea: 'Yea', nay: 'Nay', absent: 'Absent' } as const
const POSITIONS = ['agrees', 'disagrees'] as const

export interface Vote {
  bill: string
  /** The roll call, when the row has a safe address for it. */
  link: Link | null
  issue: string | null
  /** "Yea", "Nay" or "Absent". */
  vote: string | null
  position: (typeof POSITIONS)[number] | null
  /** The day as written (YYYY-MM-DD), for `<time datetime>`. */
  date: string | null
  /** "Sep 10", or "Sep 10, 2024" when the votes span more than one year. */
  day: string | null
}

export interface Graded {
  name: string
  office: string | null
  grade: string | null
  /** The score rounded to a whole number, when it is a number from 0 to 100. */
  score: number | null
  photo: string | null
}

const YEAR = /^(\d{4})-\d{2}-\d{2}/

/** The section's votes in row order: the rows that name a bill. */
export function votesOf(section: Section): Vote[] {
  const found = rows(section).flatMap((row) => {
    const bill = text(row.bill)
    if (!bill) return []
    const vote = text(row.vote)?.trim().toLowerCase()
    const position = text(row.position)?.trim().toLowerCase()
    const date = text(row.date)?.trim() ?? null
    return [
      {
        bill,
        link: linkOf(bill, row.href),
        issue: text(row.issue),
        vote: vote && vote in VOTES ? VOTES[vote as keyof typeof VOTES] : null,
        position: POSITIONS.find((p) => p === position) ?? null,
        date: date && formatShortDay(date) ? date : null,
        day: null as string | null,
      },
    ]
  })
  const years = new Set(found.map((v) => (v.date ? YEAR.exec(v.date)?.[1] : null)).filter(Boolean))
  for (const v of found) {
    const short = formatShortDay(v.date)
    v.day = short && years.size > 1 ? `${short}, ${YEAR.exec(v.date!)![1]}` : short
  }
  return found
}

/** The section's graded people in row order: the rows that name someone. */
export function gradedOf(section: Section): Graded[] {
  return rows(section).flatMap((row) => {
    const name = text(row.name)
    if (!name) return []
    const score = typeof row.score === 'number' && Number.isFinite(row.score) && row.score >= 0 && row.score <= 100 ? Math.round(row.score) : null
    return [{ name, office: text(row.office), grade: text(row.grade)?.trim() ?? null, score, photo: safeSrc(row.imageUrl) }]
  })
}
