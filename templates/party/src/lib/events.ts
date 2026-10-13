// The events page's type tabs and its `/events/<type>` addresses (board A6),
// read from the Content API's `GET /events?type=&cursor=&limit=`: upcoming
// events only, soonest first, each row shaped like an EventsList row, with
// every event type and how many upcoming events it has. The client has no
// method for the route yet, so it is read through `client.raw`, which caches
// it under the content version like every other read. Each answer is read
// once per request however many sections ask for it.
//
// Each event's own page is `/events/<slug>` on this site (board A7), read
// from `GET /events/<slug>` the same way. An event row's `url` is its page on
// BackGold; eventPagePath turns it into the address here, so every list,
// card and agenda row opens the event on the site.

import { BackgoldApiError } from '@backgold/content'
import type { Areas, BackgoldContent, PageResponse, Section, SectionEmbed } from '@backgold/content'
import { resolveRoute } from '@backgold/astro/server'

/** The built-in events page's address, where the tabs lead. */
export const EVENTS_PATH = '/events'

export interface EventType {
  key: string
  label: string
  /** How many upcoming events have this type. */
  upcoming: number
}

export interface EventsListing {
  /** Rows shaped like an EventsList section's `data.items`. */
  events: Record<string, unknown>[]
  types: EventType[]
  next_cursor: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function listingOf(body: unknown): EventsListing | null {
  if (!isRecord(body) || !Array.isArray(body.events) || !Array.isArray(body.types)) return null
  const types = body.types.flatMap((t): EventType[] =>
    isRecord(t) && typeof t.key === 'string' && t.key !== '' && typeof t.label === 'string' && t.label.trim() !== '' && typeof t.upcoming === 'number'
      ? [{ key: t.key, label: t.label, upcoming: t.upcoming }]
      : [],
  )
  return { events: body.events.filter(isRecord), types, next_cursor: typeof body.next_cursor === 'string' ? body.next_cursor : null }
}

const read = new WeakMap<Request, Map<string, Promise<EventsListing | null>>>()

/**
 * `GET /events` with `type` and `limit` when given; null when the answer is
 * not the route's shape. A failed read throws (BackgoldApiError).
 */
export function eventsListing(client: BackgoldContent, request: Request, query: { type?: string; limit?: number }): Promise<EventsListing | null> {
  const params = { type: query.type, limit: query.limit === undefined ? undefined : String(query.limit) }
  const key = `${params.type ?? ''}\n${params.limit ?? ''}`
  let seen = read.get(request)
  if (!seen) read.set(request, (seen = new Map()))
  let answer = seen.get(key)
  if (!answer) {
    answer = client.raw<unknown>('/events', params).then(listingOf)
    seen.set(key, answer)
  }
  return answer
}

/** The tabs after "All": every type with an upcoming event, in the api's order. */
export function typeTabs(listing: EventsListing | null): EventType[] {
  return (listing?.types ?? []).filter((t) => t.upcoming > 0)
}

/** The type key `/events/<key>` names, or null for any other path. */
export function eventTypeKeyOf(pathname: string): string | null {
  const m = /^\/events\/([^/]+)\/?$/.exec(pathname)
  if (!m) return null
  try {
    return decodeURIComponent(m[1]!)
  } catch {
    return null
  }
}

/** A type's address under the events page. */
export const eventTypePath = (key: string): string => `${EVENTS_PATH}/${encodeURIComponent(key)}`

/** An EventsList in its Calendar layout: a month at a time, read by its own window. */
export const drawsCalendar = (section: Section): boolean => section.type === 'EventsList' && section.variant === 'calendar'

/** The sections whose layout draws the tabs: an EventsList in its Agenda or Calendar layout. */
export const drawsTabs = (section: Section): boolean =>
  section.type === 'EventsList' && (section.variant === 'agenda' || section.variant === 'calendar')

/**
 * The most rows `GET /events` returns in one read: the route answers 400
 * BAD_LIMIT for a `limit` outside 1 to 50 (the api's ENTRY_LIMIT_MAX, which
 * no package the template reads exports).
 */
const EVENTS_LIMIT_MAX = 50

/** The section's row cap as a `limit`, at most EVENTS_LIMIT_MAX. */
function capOf(section: Section): number | undefined {
  const max = section.options?.max
  return typeof max === 'number' && Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), EVENTS_LIMIT_MAX) : undefined
}

/**
 * The tabs an Agenda or Calendar section draws on the events page (`/events` or
 * `/events/<key>`) and the key of the one being shown (null for All); null
 * anywhere else, when no type has an upcoming event, or when the route cannot
 * be read (the section then draws without tabs). On `/events/<key>` it reuses
 * the read that filtered the rows; on `/events` it asks for one row, since
 * only the types are wanted.
 */
export async function tabsFor(
  client: BackgoldContent,
  request: Request,
  section: Section,
  pathname: string,
): Promise<{ tabs: EventType[]; active: string | null } | null> {
  const active = eventTypeKeyOf(pathname)
  if (active === null && pathname.replace(/\/+$/, '') !== EVENTS_PATH) return null
  let listing: EventsListing | null
  try {
    listing = await eventsListing(client, request, active === null ? { limit: 1 } : { type: active, limit: capOf(section) })
  } catch {
    return null
  }
  const tabs = typeTabs(listing)
  return tabs.length > 0 ? { tabs, active } : null
}

/**
 * `/events/<key>`: the events page with each Agenda and Calendar section's rows read from
 * `GET /events?type=<key>`, and the type. Null (a 404) when the path names no
 * type, the events page has no Agenda or Calendar section, or the key is not a type with
 * an upcoming event (one the tabs do not offer), including a key the api
 * refuses as no type at all. Other sections keep their baked rows; any other
 * failed read throws.
 */
export async function typedEventsPage(
  client: BackgoldContent,
  request: Request,
  pathname: string,
): Promise<{ page: PageResponse; type: EventType } | null> {
  const key = eventTypeKeyOf(pathname)
  if (key === null) return null
  const events = await resolveRoute(client, EVENTS_PATH)
  if (events.kind !== 'page') return null
  const agenda = events.page.sections.filter(drawsTabs)
  if (agenda.length === 0) return null
  let listing: EventsListing | null
  try {
    listing = await eventsListing(client, request, { type: key, limit: capOf(agenda[0]!) })
  } catch (error) {
    // An api without the route answers 404: no type has an address yet. A key
    // outside the api's event types answers 400 BAD_TYPE: no such type. Any
    // other 400 (BAD_LIMIT, BAD_CURSOR) is the template's own mistake and throws.
    if (error instanceof BackgoldApiError && (error.status === 404 || (error.status === 400 && error.code === 'BAD_TYPE'))) return null
    throw error
  }
  const type = typeTabs(listing).find((t) => t.key === key)
  if (!listing || !type) return null
  const rows = listing.events
  const sections = events.page.sections.map((s) => (drawsTabs(s) ? { ...s, data: { source: s.data?.source ?? 'events', items: rows } } : s))
  return { page: { ...events.page, sections }, type }
}

// ── The calendar's month ────────────────────────────────────────────────────
//
// A calendar shows one month: `?month=YYYY-MM` on its page's address, else
// the month it is today. Its rows come from `GET /events?from=&to=`, a window
// of days (past ones included) the api takes up to 42 of. The api's days are
// UTC days and each event is placed on its day in its own time zone, so the
// window runs a day either side of the month and the calendar keeps the rows
// that fall in the month.

/** The query parameter that names the calendar's month. */
export const MONTH_PARAM = 'month'

export interface CalendarMonth {
  year: number
  /** 0 for January. */
  monthIndex: number
}

/** How far from the current month the calendar's arrows go: a year back, two ahead. */
const MONTHS_BACK = 12
const MONTHS_AHEAD = 24

const monthKey = (m: CalendarMonth) => m.year * 12 + m.monthIndex
const monthOfKey = (key: number): CalendarMonth => ({ year: Math.floor(key / 12), monthIndex: key % 12 })

/** `month` moved by `by` months. */
export const shiftMonth = (month: CalendarMonth, by: number): CalendarMonth => monthOfKey(monthKey(month) + by)

/** Whether `month` is one the calendar's arrows reach from `current`. */
export function monthInReach(month: CalendarMonth, current: CalendarMonth): boolean {
  const offset = monthKey(month) - monthKey(current)
  return offset >= -MONTHS_BACK && offset <= MONTHS_AHEAD
}

/** `?month=YYYY-MM` as a month inside reach of `current`, else null (the calendar shows `current`). */
export function monthOf(value: string | null, current: CalendarMonth): CalendarMonth | null {
  const m = value ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value) : null
  if (!m) return null
  const month = { year: Number(m[1]), monthIndex: Number(m[2]) - 1 }
  return monthInReach(month, current) ? month : null
}

/** "2026-10": the month as `?month=` names it. */
export const monthParam = (m: CalendarMonth): string => `${m.year}-${String(m.monthIndex + 1).padStart(2, '0')}`

/** Today's date in `timeZone` (UTC when it is not one Intl knows). */
export function todayIn(timeZone: string | null): CalendarMonth & { day: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: timeZone ?? 'UTC' }).formatToParts(new Date())
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' }).formatToParts(new Date())
  }
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: part('year'), monthIndex: part('month') - 1, day: part('day') }
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** How many pages of 50 a month reads at most: 200 events. */
const MONTH_PAGES_MAX = 4

const monthReads = new WeakMap<Request, Map<string, Promise<Record<string, unknown>[] | null>>>()

/**
 * The month's events with a day either side, soonest first, from `GET
 * /events?from=&to=` (narrowed to `type` when given), up to 200 of them; null
 * when the answer is not the route's shape. A failed read throws
 * (BackgoldApiError). Read once per request however many sections ask.
 */
export function monthEvents(
  client: BackgoldContent,
  request: Request,
  month: CalendarMonth,
  type: string | null,
): Promise<Record<string, unknown>[] | null> {
  const from = isoDay(Date.UTC(month.year, month.monthIndex, 0))
  const to = isoDay(Date.UTC(month.year, month.monthIndex + 1, 1))
  const key = `${from}\n${to}\n${type ?? ''}`
  let seen = monthReads.get(request)
  if (!seen) monthReads.set(request, (seen = new Map()))
  let answer = seen.get(key)
  if (!answer) {
    answer = (async () => {
      const rows: Record<string, unknown>[] = []
      let cursor: string | undefined
      for (let page = 0; page < MONTH_PAGES_MAX; page++) {
        const listing = listingOf(
          await client.raw<unknown>('/events', { from, to, type: type ?? undefined, limit: String(EVENTS_LIMIT_MAX), cursor }),
        )
        if (!listing) return null
        rows.push(...listing.events)
        if (!listing.next_cursor) break
        cursor = listing.next_cursor
      }
      return rows
    })()
    seen.set(key, answer)
  }
  return answer
}

/**
 * The event's page on this site for a row's `url` (its page on BackGold, whose
 * last path part is the event's slug): `/events/<slug>`. Null when the value
 * is not an address with a path.
 */
export function eventPagePath(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null
  let path: string
  try {
    path = new URL(url, 'https://site.invalid').pathname
  } catch {
    return null
  }
  const slug = path.split('/').filter(Boolean).at(-1)
  return slug ? `${EVENTS_PATH}/${slug}` : null
}

/** One event as `GET /events/<slug>` answers it: its list row and what its page shows. */
export interface EventDetail {
  id: string
  slug: string
  title: string
  starts_at: string
  ends_at: string | null
  timezone: string | null
  /** The type key (`fundraiser`), or null. */
  type: string | null
  location: string | null
  is_virtual: boolean
  sells_tickets: boolean
  description: string | null
  venue: string | null
  address: string | null
  image_url: string | null
  embed: SectionEmbed
}

function detailOf(body: unknown): { event: EventDetail; areas: Areas } | null {
  if (!isRecord(body) || !isRecord(body.event) || !isRecord(body.areas)) return null
  const e = body.event
  const embed = e.embed
  if (typeof e.id !== 'string' || typeof e.slug !== 'string' || typeof e.title !== 'string' || typeof e.starts_at !== 'string') return null
  if (!isRecord(embed) || typeof embed.script !== 'string' || !(typeof embed.iframe === 'string' || embed.iframe === null)) return null
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
  return {
    event: {
      id: e.id,
      slug: e.slug,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: str(e.ends_at),
      timezone: str(e.timezone),
      type: str(e.type),
      location: str(e.location),
      is_virtual: e.is_virtual === true,
      sells_tickets: e.sells_tickets === true,
      description: str(e.description),
      venue: str(e.venue),
      address: str(e.address),
      image_url: str(e.image_url),
      embed: { iframe: embed.iframe as string | null, script: embed.script },
    },
    areas: body.areas as Areas,
  }
}

/** The slug `/events/<slug>` names, or null for any other path. */
export const eventSlugOf = eventTypeKeyOf

/**
 * `/events/<slug>`: the event and its page's areas, or null (a 404) when the
 * path names none, the api has no such event, or the answer is not the
 * route's shape. Any other failed read throws.
 */
export async function eventPage(client: BackgoldContent, pathname: string): Promise<{ event: EventDetail; areas: Areas } | null> {
  const slug = eventSlugOf(pathname)
  if (slug === null) return null
  let body: unknown
  try {
    body = await client.raw<unknown>(`${EVENTS_PATH}/${encodeURIComponent(slug)}`)
  } catch (error) {
    if (error instanceof BackgoldApiError && error.status === 404) return null
    throw error
  }
  return detailOf(body)
}
