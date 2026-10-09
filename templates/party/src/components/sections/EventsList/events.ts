// An EventsList's rows as its layouts draw them: each event's title, start,
// place, type, whether it still takes registrations, and its page, at most the
// section's `max` of them. Dates are lib/format.ts's: the parts below are
// read off the string formatWhen writes, so every layout shows the same day
// and time the list layout does.

import type { Section } from '@backgold/content'
import { linkOf, rows, type Link } from '../../../lib/section'
import { formatWhen, text } from '../../../lib/format'

interface When {
  /** "Tuesday, October 14, 2026 at 7:00 PM UTC", as formatWhen writes it. */
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
  /** "7:00 PM UTC", or null when the value has no time. */
  time: string | null
}

export interface EventRow {
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
  /** The event's own page, labelled with its title. */
  link: Link | null
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, i, 1)),
)

// formatWhen writes "Tuesday, October 14, 2026 at 7:00 PM" (", 7:00 PM" on an
// older ICU), or "October 14, 2026" for a value with no time.
const WHEN = /^(?:(\p{L}+), )?(\p{L}+) (\d{1,2}), (\d{4})(?:(?:,| at) (.+))?$/u

function whenOf(value: unknown): When | null {
  const full = formatWhen(value)
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

function typeLabel(value: unknown): string | null {
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
      return [
        {
          title,
          startsAt,
          when: whenOf(startsAt),
          place: text(row.location) ?? (row.is_virtual === true ? 'Online' : null),
          type: typeLabel(row.type),
          closed: row.registration_closed === true,
          link: linkOf(title, row.url),
        },
      ]
    })
    .slice(0, cap)
}
