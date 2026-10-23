// A day as the academy's cards print it: "Oct 20, 2026" (board K4's meta line).

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** "Oct 20, 2026" for an ISO date or instant (the UTC day), or null when the value is not one. */
export function shortDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  const at = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(at) ? null : SHORT.format(at)
}
