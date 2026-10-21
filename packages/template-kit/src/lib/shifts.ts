// The organization's volunteer shifts as the kit's volunteer pages draw them
// (src/routes/volunteer.astro, `/volunteer`, and
// src/routes/volunteer-shift.astro, `/volunteer/<slug>`), read from the
// Content API's `GET /shifts`: every open shift, soonest first, each with its
// counts, its state (`open`, `full`, `waitlist`, `closed`), what it belongs to
// and BackGold's sign-up card for it: `signup_embed.iframe`, the frame the
// shift's page sets in the site's look, and `signup_url`, the same card as a
// page of its own on BackGold, which a page links to when the api sends no
// frame (an api older than the frame). The counts move between publishes,
// so the pages draw them as built and read them again from `GET /shifts/live`
// after load (components/volunteer/ShiftLive.astro).
//
// Times are the organization's zone's (the row's `timezone`), as lib/format.ts
// writes them: "6:00 PM to 8:00 PM CDT" for a shift that ends the day it
// starts.

import type { Areas, BackgoldContent, SectionEmbed, ShiftsListRow } from '@backgold/content'
import { safeHref } from '@backgold/astro/server'
import { whenOf, monthName, type When } from '../components/sections/EventsList/events'

export const VOLUNTEER_PATH = '/volunteer'

/** A shift's own page on this site. */
export const shiftPath = (slug: string): string => `${VOLUNTEER_PATH}/${encodeURIComponent(slug)}`

/** A row of `GET /shifts` with the sign-up frame the api sends beside it; an older api sends none. */
export type ShiftRow = ShiftsListRow & { signup_embed?: { iframe: string | null } | null }

/** The most shifts the list reads (four pages of 50). */
const MOST = 200

/**
 * Every open shift, soonest first, walking the feed's cursor up to MOST rows;
 * null when the api does not serve the feed (an older api) or the read fails.
 */
export async function openShifts(client: BackgoldContent): Promise<ShiftRow[] | null> {
  const rows: ShiftRow[] = []
  let cursor: string | undefined
  try {
    do {
      const page = await client.shifts({ limit: 50, ...(cursor ? { cursor } : {}) })
      rows.push(...(page.shifts as ShiftRow[]))
      cursor = page.next_cursor ?? undefined
    } while (cursor && rows.length < MOST)
  } catch {
    return rows.length > 0 ? rows : null
  }
  return rows.slice(0, MOST)
}

/** The areas of a volunteer page: those that show on every page and on pages that hold events (an EventsList holds an event). Null when the read fails. */
export async function volunteerAreas(client: BackgoldContent): Promise<Areas | null> {
  try {
    return (await client.areas({ holds: ['event'] })).areas
  } catch {
    return null
  }
}

/** The shift's sign-up frame as ModuleFrame takes it, or null when the api sent none. */
export function signupEmbedOf(shift: ShiftRow): SectionEmbed | null {
  const iframe = shift.signup_embed?.iframe
  return typeof iframe === 'string' && iframe !== '' ? { iframe, script: '' } : null
}

/** A shift's button, by its state: words, and whether it draws as the quiet button (nothing to sign up for). */
export const SHIFT_ACTIONS: Record<ShiftsListRow['state'], { label: string; quiet: boolean }> = {
  open: { label: 'Sign up', quiet: false },
  waitlist: { label: 'Join the waitlist', quiet: false },
  full: { label: 'Full', quiet: true },
  closed: { label: 'Closed', quiet: true },
}

/** The most spots drawn as dots; past that, the words alone. */
export const MOST_DOTS = 24

/** One shift as the volunteer pages draw it. */
export interface ShiftView {
  id: string
  slug: string
  title: string
  startsAt: string
  when: When | null
  /** "6:00 PM to 8:00 PM CDT", the start's time alone across days, or null for an undated row. */
  time: string | null
  place: string | null
  /** The shift's page on this site. */
  href: string
  state: ShiftsListRow['state']
  action: { label: string; quiet: boolean }
  signedUp: number
  capacity: number | null
  /** The counts in words, as the live script writes them too: "6 of 10 filled · 4 spots left". */
  words: string
  /** One per spot (`true` taken), up to MOST_DOTS; empty with no capacity or more spots than that. */
  dots: boolean[]
}

/** A shift's counts in words: "6 of 10 filled · 4 spots left", "10 of 10 filled · Full", "3 signed up", or '' with no one yet and no capacity. */
export function countWords(signedUp: number, capacity: number | null): string {
  if (capacity !== null && capacity > 0) {
    const left = capacity - signedUp
    return `${signedUp} of ${capacity} filled · ${left > 0 ? `${left} ${left === 1 ? 'spot' : 'spots'} left` : 'Full'}`
  }
  return signedUp > 0 ? `${signedUp} signed up` : ''
}

export function shiftView(shift: ShiftRow): ShiftView {
  const when = whenOf(shift.starts_at, shift.timezone)
  const end = whenOf(shift.ends_at, shift.timezone)
  const sameDay = when && end && when.year === end.year && when.monthIndex === end.monthIndex && when.day === end.day
  const capacity = typeof shift.capacity === 'number' && shift.capacity > 0 ? shift.capacity : null
  const signedUp = Math.max(0, shift.signed_up)
  return {
    id: shift.id,
    slug: shift.slug,
    title: shift.title,
    startsAt: shift.starts_at,
    when,
    time: when?.clock && sameDay && end?.time ? `${when.clock} to ${end.time}` : (when?.time ?? null),
    place: shift.location?.trim() || null,
    href: shiftPath(shift.slug),
    state: shift.state,
    action: SHIFT_ACTIONS[shift.state] ?? SHIFT_ACTIONS.closed,
    signedUp,
    capacity,
    words: countWords(signedUp, capacity),
    dots: capacity !== null && capacity <= MOST_DOTS ? Array.from({ length: capacity }, (_, i) => i < signedUp) : [],
  }
}

/** The words of every state's button, for the live script. */
export const SHIFT_ACTION_LABELS = JSON.stringify(Object.fromEntries(Object.entries(SHIFT_ACTIONS).map(([state, a]) => [state, a.label])))

/** A run of shifts in one week, Monday to Sunday in the shifts' own calendar. */
export interface ShiftWeek {
  /** The Monday, "2026-11-02", which the script matches to say This week and Next week; '' for undated rows. */
  key: string
  /** "Week of Nov 2"; null for undated rows. */
  heading: string | null
  /** "Nov 2 to 8", "Nov 30 to Dec 6"; null for undated rows. */
  dates: string | null
  shifts: ShiftView[]
}

const short = (d: Date) => `${monthName(d.getUTCMonth()).slice(0, 3)} ${d.getUTCDate()}`

/** The shifts grouped by week, in their order; a week with no shift is not drawn. */
export function weeksOf(shifts: ShiftView[]): ShiftWeek[] {
  const weeks: ShiftWeek[] = []
  for (const shift of shifts) {
    let monday: Date | null = null
    if (shift.when) {
      monday = new Date(Date.UTC(shift.when.year, shift.when.monthIndex, Number(shift.when.day)))
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
    }
    const key = monday ? monday.toISOString().slice(0, 10) : ''
    const last = weeks[weeks.length - 1]
    if (last && last.key === key) {
      last.shifts.push(shift)
      continue
    }
    let dates: string | null = null
    if (monday) {
      const sunday = new Date(monday)
      sunday.setUTCDate(sunday.getUTCDate() + 6)
      dates = `${short(monday)} to ${sunday.getUTCMonth() === monday.getUTCMonth() ? sunday.getUTCDate() : short(sunday)}`
    }
    weeks.push({ key, heading: monday ? `Week of ${short(monday)}` : null, dates, shifts: [shift] })
  }
  return weeks
}

/** A maps search for the shift's place, or null with none. */
export function mapLinkOf(place: string | null): string | null {
  return place ? safeHref(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`) : null
}

const emitted = new WeakSet<Request>()

/** True the first time it is asked during one render, so a page carries one copy of the shifts' live script. */
export function firstShiftScript(request: Request): boolean {
  if (emitted.has(request)) return false
  emitted.add(request)
  return true
}
