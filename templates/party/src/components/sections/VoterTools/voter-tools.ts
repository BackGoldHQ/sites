// A VoterTools section as its layouts draw it: its words, its two links and
// its key dates. The links go to the official lookups the organization
// names (its state's registration check and polling-place finder); BackGold
// has no lookup of its own yet, so nothing here asks the visitor for
// anything. The Content API sends the links without their keys, so each is
// told apart by its label: the one labelled with `registerLabel` is the
// registration link, the one labelled with `pollingLabel` the polling link.
// A date row is drawn when it has a label; its `date` (YYYY-MM-DD, a
// calendar day) is kept only when it is one.

import type { Section } from '@backgold/content'
import { linkOf, rows, type Link } from '../../../lib/section'
import { formatDay, formatShortDay, text } from '../../../lib/format'

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

export interface KeyDate {
  label: string
  /** The row's YYYY-MM-DD, for `<time datetime>` and the island; null when the row has no usable date. */
  day: string | null
  /** "Oct 20" */
  short: string | null
  /** "October 20, 2026", for a screen reader. */
  full: string | null
  note: string | null
}

export interface VoterTools {
  kicker: string | null
  heading: string | null
  register: Link | null
  polling: Link | null
  idNote: string | null
  earlyVoting: string | null
  electionDay: string | null
  datesHeading: string | null
  dates: KeyDate[]
}

export function voterTools(section: Section): VoterTools {
  const copy = section.copy
  const registerLabel = text(copy.registerLabel)
  const pollingLabel = text(copy.pollingLabel)
  let register: Link | null = null
  let polling: Link | null = null
  for (const raw of section.links ?? []) {
    const link = linkOf(raw.label, raw.url)
    if (!link) continue
    if (!register && link.label === registerLabel) register = link
    else if (!polling && link.label === pollingLabel) polling = link
  }
  const dates = rows(section).flatMap((row): KeyDate[] => {
    const label = text(row.label)
    if (!label) return []
    const raw = text(row.date)?.trim() ?? null
    const day = raw && CALENDAR_DAY.test(raw) && formatShortDay(raw) ? raw : null
    return [{ label, day, short: formatShortDay(day), full: formatDay(day), note: text(row.note) }]
  })
  return {
    kicker: text(copy.kicker),
    heading: text(copy.heading),
    register,
    polling,
    idNote: text(copy.idNote),
    earlyVoting: text(copy.earlyVoting),
    electionDay: text(copy.electionDay),
    datesHeading: text(copy.datesHeading),
    dates,
  }
}
