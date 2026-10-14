// A Booking section's rows as its layouts draw them. BackGold bakes the rows
// from the organization's booking module: one per active meeting type, in the
// order the operator's list of meeting types shows them, each with its public
// booking page (`url`), where the time is picked and the booking made. The
// section draws no calendar, no times and no form; every row's one action is a
// link to its booking page.
//
// A meeting type is worded the way the operator app words it: its length in
// minutes ("30 min") and where it happens ("Video call", "Phone call",
// "In person"; a custom place is "Details to follow", since the place's own
// words are not baked). Its price is a row's cents to the cent ("$250",
// "$19.50"), "Free" at 0, and nothing when the type names no price (null,
// every row today). A row with no name or no safe booking page is left out:
// a card that cannot be booked would promise a booking that does not exist.
// No rows draws nothing.

import type { Section } from '@backgold/content'
import { linkOf, rows, type Link } from '../../../lib/section'
import { formatCents, text } from '../../../lib/format'

/** Where a meeting happens, in the operator app's words (its `locationLabel`). */
const PLACES: Record<string, string> = {
  video_link: 'Video call',
  phone: 'Phone call',
  in_person: 'In person',
  custom: 'Details to follow',
}

export interface MeetingType {
  name: string
  description: string | null
  /** "30 min · Video call": the length and the place, whichever the row has. */
  meta: string | null
  /** "$250", "$19.50", "Free", or null when the type names no price. */
  price: string | null
  /** The button to the type's booking page, worded by the section's pick label. */
  book: Link
}

/** A price from cents through formatCents: whole dollars as "$250", anything else to the cent ("$19.50"); "Free" at 0. */
function priceOf(cents: unknown): string | null {
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 0) return null
  if (cents === 0) return 'Free'
  const dollars = formatCents(cents - (cents % 100)) ?? ''
  return cents % 100 === 0 ? dollars : `${dollars}.${String(cents % 100).padStart(2, '0')}`
}

/** The section's meeting types, in the rows' order; none when it has no bookable rows. */
export function meetingTypesOf(section: Section): MeetingType[] {
  const label = text(section.copy.pickLabel)?.trim() ?? 'Pick a time'
  return rows(section).flatMap((row): MeetingType[] => {
    const name = text(row.name)?.trim()
    const book = linkOf(label, row.url)
    if (!name || !book) return []
    const minutes = typeof row.duration_minutes === 'number' && Number.isInteger(row.duration_minutes) && row.duration_minutes > 0 ? row.duration_minutes : null
    const place = PLACES[text(row.location_kind)?.trim() ?? ''] ?? null
    const meta = [minutes !== null ? `${minutes} min` : null, place].filter((part): part is string => part !== null).join(' · ')
    return [{ name, description: text(row.description)?.trim() ?? null, meta: meta || null, price: priceOf(row.price_cents), book }]
  })
}
