// The next board meeting on her Events page, for the latest meeting in the
// archive to point forward to (board U4, note 5): the soonest upcoming event
// that is a board meeting by the test her event page uses for its archive
// door (src/components/EventPage.astro: a Hearing, or a title that names a
// board meeting), read from the kit's events listing (`GET /events`,
// upcoming events only, soonest first). Null when there is none or the read
// fails: the page then draws its plain "Latest in the archive".
import type { BackgoldContent } from '@backgold/content'
import { eventPagePath, eventsListing } from '@backgold/template-kit/lib/events'

export interface NextMeeting {
  /** "Oct 22, 2026", in the event's own zone. */
  date: string
  /** The event's page on this site. */
  href: string
}

/** Whether an event is a board meeting: a Hearing, or a title naming a board meeting. */
const isBoardMeeting = (type: unknown, title: unknown): boolean =>
  (typeof type === 'string' && type.toLowerCase() === 'hearing') || (typeof title === 'string' && /\bboard meeting\b/i.test(title))

/** The day of an instant in `timeZone` (UTC when it is not one Intl knows), as "Oct 22, 2026"; null when it does not parse. */
function dayOf(value: string, timeZone: unknown): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: typeof timeZone === 'string' && timeZone ? timeZone : 'UTC' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date)
  }
}

export async function nextBoardMeeting(client: BackgoldContent, request: Request): Promise<NextMeeting | null> {
  try {
    const listing = await eventsListing(client, request, { limit: 50 })
    for (const row of listing?.events ?? []) {
      if (!isBoardMeeting(row.type, row.title) || typeof row.starts_at !== 'string') continue
      const href = eventPagePath(row.url)
      const date = dayOf(row.starts_at, row.timezone)
      if (href && date) return { date, href }
    }
    return null
  } catch {
    return null
  }
}
