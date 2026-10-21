// Dates and labels as the archive's pages set them. Every date here is a
// calendar day (YYYY-MM-DD), shown in UTC so a server elsewhere never moves it.

const LONG = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
const SHORT = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

const at = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`)
const valid = (day: string | null | undefined): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(day) && !Number.isNaN(at(day).getTime())

/** "August 20, 2026". */
export const longDay = (day: string | null | undefined): string | null => (valid(day) ? LONG.format(at(day)) : null)

/** "Aug 20, 2026". */
export const shortDay = (day: string | null | undefined): string | null => (valid(day) ? SHORT.format(at(day)) : null)

/** "Thursday". */
export const weekday = (day: string | null | undefined): string | null => (valid(day) ? WEEKDAY.format(at(day)) : null)

/** The parts the meeting strip and the meeting's head set: year, month (AUG), day (20). */
export function dayParts(day: string): { year: string; month: string; day: string } {
  return { year: day.slice(0, 4), month: MONTH.format(at(day)).toUpperCase(), day: day.slice(8, 10) }
}

/** Whole days from one calendar day to another. */
export const daysBetween = (from: string, to: string): number => Math.round((at(to).getTime() - at(from).getTime()) / 86_400_000)

/** A count and its noun: "1 record", "8 records". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
