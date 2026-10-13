// An EventsList's rows as its layouts draw them: each event's id (for its
// live counts), title, start, place, type, whether it still takes
// registrations, its page on this site (`/events/<slug>`, lib/events.ts), and
// the action a button offers on it, at most the section's `max` of them. Dates are lib/format.ts's, in the event's own time
// zone: the parts below are read off the string formatWhen writes, so every
// layout shows (and the agenda groups by) the same day and time the list
// layout does.

import type { Section } from '@backgold/content'
import { linkOf, rows, type Link } from '../../../lib/section'
import { formatWhen, text } from '../../../lib/format'
import { eventPagePath } from '../../../lib/events'

interface When {
  /** "Tuesday, October 14, 2026 at 7:00 PM CDT", as formatWhen writes it. */
  full: string
  /** "Tue", or null for a date with no time (formatWhen leaves the weekday out). */
  weekday: string | null
  /** "October" */
  month: string
  /** "Oct" */
  monthShort: string
  /** "14" */
  day: string
  year: number
  /** 0 for January. */
  monthIndex: number
  /** "7:00 PM CDT", or null when the value has no time. */
  time: string | null
}

export interface EventRow {
  /** The event's id, which names its live counts' slot; null when the row has none. */
  id: string | null
  title: string
  /** The row's own value, for `<time datetime>`. */
  startsAt: string | null
  when: When | null
  /** The location, or "Online" for a virtual event with none. */
  place: string | null
  /** The event's type as a label ("Rally"), or null when it has none. */
  type: string | null
  /** The event has stopped taking registrations. */
  closed: boolean
  /** The event's own page on this site, labelled with its title. */
  link: Link | null
  /**
   * The button's link to the event's page: "Details" once registration has
   * closed, else "Get tickets" when the event sells tickets, else "RSVP".
   */
  action: Link | null
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, i, 1)),
)

// formatWhen writes "Tuesday, October 14, 2026 at 7:00 PM CDT" (", 7:00 PM
// CDT" on an older ICU), or "October 14, 2026" for a value with no time.
const WHEN = /^(?:(\p{L}+), )?(\p{L}+) (\d{1,2}), (\d{4})(?:(?:,| at) (.+))?$/u

function whenOf(value: unknown, timeZone: unknown): When | null {
  const full = formatWhen(value, timeZone)
  const m = full ? WHEN.exec(full) : null
  if (!full || !m) return null
  const [, weekday, month, day, year, time] = m
  const monthIndex = MONTHS.indexOf(month!)
  if (monthIndex < 0) return null
  return {
    full,
    weekday: weekday ? weekday.slice(0, 3) : null,
    month: month!,
    monthShort: month!.slice(0, 3),
    day: day!,
    year: Number(year),
    monthIndex,
    time: time ?? null,
  }
}

export function monthName(monthIndex: number): string {
  return MONTHS[monthIndex] ?? ''
}

/** 'buttons' puts a button under each event; 'link' (or none) makes the title the link. */
export function actionsOf(section: Section): 'buttons' | 'link' {
  return section.options?.actions === 'buttons' ? 'buttons' : 'link'
}

/** An event type as a label ("Rally"), or null for none or `blank`. */
export function typeLabel(value: unknown): string | null {
  const raw = text(value)?.trim().replace(/[_-]+/g, ' ')
  if (!raw || raw === 'blank') return null
  return raw[0]!.toUpperCase() + raw.slice(1)
}

export function eventsOf(section: Section): EventRow[] {
  const max = section.options?.max
  const cap = typeof max === 'number' && Number.isFinite(max) && max > 0 ? Math.floor(max) : Infinity
  return rows(section)
    .flatMap((row) => {
      const title = text(row.title)
      if (!title) return []
      const startsAt = text(row.starts_at)
      const closed = row.registration_closed === true
      const tickets = !closed && row.sells_tickets === true
      const page = eventPagePath(row.url)
      return [
        {
          id: text(row.id),
          title,
          startsAt,
          when: whenOf(startsAt, row.timezone),
          place: text(row.location) ?? (row.is_virtual === true ? 'Online' : null),
          type: typeLabel(row.type),
          closed,
          link: linkOf(title, page),
          action: linkOf(closed ? 'Details' : tickets ? 'Get tickets' : 'RSVP', page),
        },
      ]
    })
    .slice(0, cap)
}
