// Dates, money and copy as the components show them. A date-only value is
// the calendar day as written, so a server in another time zone never moves
// it. A time with an explicit UTC `Z` or offset is an instant: given a zone
// (an event row's own IANA `timezone`), it is shown in that zone with the
// zone's short name ("… at 6:00 PM CDT"); with no zone, or one `Intl` does
// not know, a `Z` time is shown in UTC and says "UTC", and an offset time as
// written. A time with no offset is a wall clock and is shown as written.

import { sanitizeRichText } from '@backgold/astro/server'

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/

const DAY = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
const DAY_AND_TIME_FIELDS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}
const DAY_AND_TIME = new Intl.DateTimeFormat('en-US', { ...DAY_AND_TIME_FIELDS, timeZone: 'UTC' })

// A `Z` or a ±hh:mm offset at the end: the value names an instant.
const INSTANT = /(?:z|[+-]\d{2}:?\d{2})$/i

// One formatter per zone, null for a zone `Intl` rejects.
const IN_ZONE = new Map<string, Intl.DateTimeFormat | null>()

function inZone(zone: string): Intl.DateTimeFormat | null {
  let formatter = IN_ZONE.get(zone)
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', { ...DAY_AND_TIME_FIELDS, timeZone: zone, timeZoneName: 'short' })
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      formatter = null
    }
    IN_ZONE.set(zone, formatter)
  }
  return formatter
}

function wallClock(value: string): { date: Date; hasTime: boolean } | null {
  const m = WALL_CLOCK.exec(value)
  if (!m || Number.isNaN(Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value))) return null
  const [, y, mo, d, h, mi] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0)))
  return { date, hasTime: h !== undefined }
}

/** "October 8, 2026", or null when the value is not a date. */
export function formatDay(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = wallClock(value)
  return parsed ? DAY.format(parsed.date) : null
}

/**
 * "Thursday, October 8, 2026 at 7:00 PM CDT" for an instant in `zone`; the
 * day alone when the value has no time. See the top of this file for a value
 * with no zone or no offset.
 */
export function formatWhen(value: unknown, zone?: string | null): string | null {
  if (typeof value !== 'string') return null
  const parsed = wallClock(value)
  if (!parsed) return null
  if (!parsed.hasTime) return DAY.format(parsed.date)
  const offset = INSTANT.exec(value.trim())?.[0]
  if (!offset) return DAY_AND_TIME.format(parsed.date)
  const named = zone?.trim() ? inZone(zone.trim()) : null
  if (named) return named.format(new Date(value))
  return /z/i.test(offset) ? `${DAY_AND_TIME.format(parsed.date)} UTC` : DAY_AND_TIME.format(parsed.date)
}

const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** Whole dollars from cents: 1240000 → "$12,400". */
export function formatCents(cents: unknown): string | null {
  return typeof cents === 'number' && Number.isFinite(cents) ? DOLLARS.format(Math.round(cents / 100)) : null
}

/** A file size: 2048 → "2 KB". */
export function formatBytes(bytes: unknown): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A non-blank string, or null. */
export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * A copy value from BackGold: the editor's restricted HTML when it opens with
 * a prose tag (sanitized), else plain text with a blank line between
 * paragraphs (escaped by Astro when rendered).
 */
export type Prose = { html: string } | { paragraphs: string[] }

const RICH_PROSE = /^\s*<\s*(p|br|strong|em|a)[\s/>]/i

export function prose(value: unknown): Prose | null {
  const raw = text(value)
  if (!raw) return null
  if (RICH_PROSE.test(raw)) return { html: sanitizeRichText(raw) }
  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return paragraphs.length > 0 ? { paragraphs } : null
}

/** "A", "A and B", "A, B and C". */
export function listOf(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * A stat a hosted BackGold page fills in live (`auto:…`) has no value a
 * server can show; it is left out rather than shown as code.
 */
export function literalStat(value: unknown): string | null {
  const raw = text(value)
  return raw && !raw.startsWith('auto:') ? raw : null
}
