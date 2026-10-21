// The last board meeting on the record, for an event page's archive door
// (src/components/EventPage.astro): the newest `board_meeting` entry (the
// Content API lists a type newest first) and what its page holds, read from
// its fields: the kind of meeting, the agenda, the resolutions, the minutes
// or that there are none yet. Null when the type is not published or has no
// entry, or a read fails: the page then draws no door.
import type { BackgoldContent } from '@backgold/content'

export interface LastMeeting {
  /** "Aug 20, 2026". */
  date: string
  href: string
  /** What it holds, in words: "Regular meeting", "Agenda and resolutions", "No minutes yet". */
  holds: string[]
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const present = (value: unknown) => value !== null && value !== undefined && value !== ''

/** What a meeting's fields say it holds. */
export function meetingHolds(fields: Record<string, unknown>): string[] {
  const holds: string[] = []
  if (typeof fields.meeting_kind === 'string' && fields.meeting_kind.trim()) holds.push(fields.meeting_kind.trim())
  const agenda = present(fields.agenda_pdf) || present(fields.agenda_link)
  const resolutions = present(fields.resolutions_link)
  if (agenda || resolutions) holds.push(agenda && resolutions ? 'Agenda and resolutions' : agenda ? 'Agenda' : 'Resolutions')
  holds.push(present(fields.minutes_pdf) || present(fields.minutes_link) ? 'Minutes' : 'No minutes yet')
  return holds
}

export async function lastMeeting(client: BackgoldContent): Promise<LastMeeting | null> {
  try {
    const page = await client.entries('board_meeting', { limit: 1 })
    const newest = page?.entries[0]
    if (!newest?.url) return null
    const detail = await client.entry('board_meeting', newest.slug)
    const fields = (detail?.entry.fields ?? {}) as Record<string, unknown>
    const day = typeof fields.meeting_date === 'string' ? fields.meeting_date : newest.publish_at
    const parsed = day ? new Date(day.length === 10 ? `${day}T12:00:00Z` : day) : null
    const date = parsed && !Number.isNaN(parsed.getTime()) ? DATE.format(parsed) : newest.title
    return { date, href: newest.url, holds: meetingHolds(fields) }
  } catch {
    return null
  }
}
