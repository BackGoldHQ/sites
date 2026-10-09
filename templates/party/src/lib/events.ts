// The events page's type tabs and its `/events/<type>` addresses (board A6),
// read from the Content API's `GET /events?type=&cursor=&limit=`: upcoming
// events only, soonest first, each row shaped like an EventsList row, with
// every event type and how many upcoming events it has. The client has no
// method for the route yet, so it is read through `client.raw`, which caches
// it under the content version like every other read. Each answer is read
// once per request however many sections ask for it.

import { BackgoldApiError } from '@backgold/content'
import type { BackgoldContent, PageResponse, Section } from '@backgold/content'
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

/** The sections whose layout draws the tabs: an EventsList in its Agenda layout. */
export const drawsTabs = (section: Section): boolean => section.type === 'EventsList' && section.variant === 'agenda'

function capOf(section: Section): number | undefined {
  const max = section.options?.max
  return typeof max === 'number' && Number.isFinite(max) && max > 0 ? Math.floor(max) : undefined
}

/**
 * The tabs an Agenda section draws on the events page (`/events` or
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
 * `/events/<key>`: the events page with each Agenda section's rows read from
 * `GET /events?type=<key>`, and the type. Null (a 404) when the path names no
 * type, the events page has no Agenda section, or the key is not a type with
 * an upcoming event (one the tabs do not offer). Other sections keep their
 * baked rows.
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
    // An api without the route answers 404: no type has an address yet.
    if (error instanceof BackgoldApiError && error.status === 404) return null
    throw error
  }
  const type = typeTabs(listing).find((t) => t.key === key)
  if (!listing || !type) return null
  const rows = listing.events
  const sections = events.page.sections.map((s) => (drawsTabs(s) ? { ...s, data: { source: s.data?.source ?? 'events', items: rows } } : s))
  return { page: { ...events.page, sections }, type }
}
