// An EventsList's rows as its layouts draw them: each event's id (for its
// live counts), title, start, place, type, whether it still takes
// registrations, its page on this site (`/events/<slug>`, lib/events.ts), the
// action a button offers on it, its calendar file (`/events/<slug>.ics`, which
// the event page's route serves) and its pinned location, at most the
// section's `max` of them. Dates are lib/format.ts's, in the event's own time
// zone: the parts below are read off the string formatWhen writes, so every
// layout shows (and the agenda groups by) the same day and time the list
// layout does. A row's time carries its zone's short name ("7:00 PM CDT");
// `clock` is the time alone, for rows under a line that names the zone once
// (sharedZone).

import type { Section } from '@backgold/content'
import { linkOf, rows, type Link } from '../../../lib/section'
import { formatWhen, text, zoneName } from '../../../lib/format'
import { eventPagePath } from '../../../lib/events'

export interface When {
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
  /** "7:00 PM", the time without its zone's name; null when the value has no time. */
  clock: string | null
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
  /** The event's IANA zone, or null when it has none. */
  zone: string | null
  /** The event's own page on this site, labelled with its title. */
  link: Link | null
  /**
   * The button's link to the event's page: "Details" once registration has
   * closed, else "Get tickets" when the event sells tickets, else "RSVP".
   */
  action: Link | null
  /**
   * "Add to calendar": the event's calendar file on this site, the event
   * page's `.ics`. Null without a page or a start that parses, since the
   * route has no file to serve then.
   */
  calendar: Link | null
  /** The pinned location's latitude, or null when the event has no pin. */
  lat: number | null
  /** The pinned location's longitude, or null when the event has no pin. */
  lng: number | null
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, i, 1)),
)

// formatWhen writes "Tuesday, October 14, 2026 at 7:00 PM CDT" (", 7:00 PM
// CDT" on an older ICU), or "October 14, 2026" for a value with no time.
const WHEN = /^(?:(\p{L}+), )?(\p{L}+) (\d{1,2}), (\d{4})(?:(?:,| at) (.+))?$/u

/** A start as the rows show it, in its own zone (formatWhen's parts); null when it does not parse. */
export function whenOf(value: unknown, timeZone: unknown): When | null {
  const full = formatWhen(value, timeZone)
  const m = full ? WHEN.exec(full) : null
  if (!full || !m) return null
  const [, weekday, month, day, year, time] = m
  const bare = formatWhen(value, timeZone, false)
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
    clock: (bare ? WHEN.exec(bare)?.[5] : undefined) ?? time ?? null,
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

/** A finite number within ±`limit`, or null. */
function degrees(value: unknown, limit: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null
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
      const lat = degrees(row.lat, 90)
      const lng = degrees(row.lng, 180)
      const dated = startsAt !== null && !Number.isNaN(Date.parse(startsAt))
      return [
        {
          id: text(row.id),
          title,
          startsAt,
          when: whenOf(startsAt, row.timezone),
          place: text(row.location) ?? (row.is_virtual === true ? 'Online' : null),
          type: typeLabel(row.type),
          closed,
          zone: text(row.timezone)?.trim() || null,
          link: linkOf(title, page),
          action: linkOf(closed ? 'Details' : tickets ? 'Get tickets' : 'RSVP', page),
          calendar: page && dated ? linkOf('Add to calendar', `${page}.ics`) : null,
          // A pin needs both halves.
          lat: lat !== null && lng !== null ? lat : null,
          lng: lat !== null && lng !== null ? lng : null,
        },
      ]
    })
    .slice(0, cap)
}

/**
 * The zone a list of events names once under its rows (boards A6 and C5,
 * "Times are Mountain Time."), so the rows drop it from their times: the
 * name of the one zone every timed row is in, or null when the rows span
 * zones or name none Intl knows.
 */
export function sharedZone(events: EventRow[]): string | null {
  const zones = new Set(events.filter((e) => e.when?.time).map((e) => e.zone))
  return zones.size === 1 ? zoneName([...zones][0]) : null
}
