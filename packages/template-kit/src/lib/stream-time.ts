// A live stream's moments in words, for the server and the browser alike (no
// imports, so components/live/LocalTime.astro's script can carry it): the
// server writes them in UTC, and the visitor's browser writes them again in
// its own zone with the same words.

/** `time`: "7:02 PM CDT" (when a stream went live). `day`: "Thursday, October 30 at 6:00 PM CDT" (when the next one starts). */
export type StreamMoment = 'time' | 'day'

const OPTIONS: Record<StreamMoment, Intl.DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' },
  day: { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' },
}

/** The moment in words, in `timeZone` (the reader's own when left out); null for a value that is not a date. */
export function streamTime(value: string | null | undefined, moment: StreamMoment, timeZone?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', timeZone ? { ...OPTIONS[moment], timeZone } : OPTIONS[moment]).format(date)
}
