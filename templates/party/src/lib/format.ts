// Dates, money and copy as the components show them. A moment given with a
// time zone (an event row carries its own IANA `timezone`) is shown in that
// zone and named by the zone's short name ("CDT"), so an event reads in its
// own day and time wherever the page is served. Without a usable zone a value
// is shown as written: the calendar day and clock time in the value itself,
// so a server in another time zone never moves it to another day, and a time
// written in UTC (ending in `Z`) says "UTC". A date with no time is a
// calendar day, with no zone.

import { sanitizeRichText } from '@backgold/astro/server'

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/
// A time that names its offset (`Z` or `±hh:mm`) is one moment, which a zone can show.
const INSTANT = /[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})$/i

const DAY = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
const DAY_AND_TIME_PARTS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}
const DAY_AND_TIME = new Intl.DateTimeFormat('en-US', { ...DAY_AND_TIME_PARTS, timeZone: 'UTC' })

// One formatter per zone, built on first use (building one is the costly
// part); null for a name Intl does not know.
const IN_ZONE = new Map<string, Intl.DateTimeFormat | null>()

function inZone(timeZone: unknown): Intl.DateTimeFormat | null {
  const zone = text(timeZone)?.trim()
  if (!zone) return null
  let format = IN_ZONE.get(zone)
  if (format === undefined) {
    try {
      format = new Intl.DateTimeFormat('en-US', { ...DAY_AND_TIME_PARTS, timeZone: zone, timeZoneName: 'short' })
    } catch (err) {
      if (!(err instanceof RangeError)) throw err
      format = null
    }
    IN_ZONE.set(zone, format)
  }
  return format
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
 * "Saturday, October 10, 2026 at 10:00 AM CDT" for a moment shown in
 * `timeZone`. With no usable zone: "… at 7:00 PM UTC" for a UTC time, the
 * clock time as written for any other. "October 10, 2026" for a date with no
 * time, zone or not. Null when the value is not a date.
 */
export function formatWhen(value: unknown, timeZone?: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = wallClock(value)
  if (!parsed) return null
  if (!parsed.hasTime) return DAY.format(parsed.date)
  const trimmed = value.trim()
  const zoned = INSTANT.test(trimmed) ? inZone(timeZone) : null
  if (zoned) return zoned.format(new Date(trimmed))
  return /z$/i.test(trimmed) ? `${DAY_AND_TIME.format(parsed.date)} UTC` : DAY_AND_TIME.format(parsed.date)
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
