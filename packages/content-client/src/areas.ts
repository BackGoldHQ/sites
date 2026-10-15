// Areas: the view-time rule for an area item's window (`visibleNow`) and the
// `holds` list `areas()` sends to `GET /areas` (packages/api/src/lib/
// content-api/areas.ts parseHolds).

import type { SitePageModuleKind } from '@backgold/contract/content-api'
import type { VisibleNow } from './contract.js'

/**
 * The module kinds a route can hold. The api's list is SITE_PAGE_MODULE_KINDS
 * in the platform's shared constants; the vendored contract carries only its
 * type, SitePageModuleKind, and the check below fails the build if the two
 * ever differ.
 */
const HOLD_KINDS = ['donation_form', 'form', 'signup', 'petition', 'poll', 'event', 'store', 'advocacy'] as const
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const sameAsApi: Exact<(typeof HOLD_KINDS)[number], SitePageModuleKind> = true
void sameAsApi

/** A form id as the api accepts it after `form:`. */
const FORM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The `holds` query value for `GET /areas`: the entries joined by commas, in
 * the caller's order. Each entry is a module kind or `form:<form id>`; an
 * empty list, or the first entry that is neither, throws a TypeError before
 * any request (the api answers 400 BAD_HOLDS to a request with no module).
 */
export function holdsQuery(holds: unknown): string {
  if (!Array.isArray(holds)) throw new TypeError('areas() needs { holds: string[] }')
  if (holds.length === 0) throw new TypeError('areas() holds needs at least one module kind or form:<form id>')
  for (const entry of holds) {
    const valid =
      typeof entry === 'string' &&
      ((HOLD_KINDS as readonly string[]).includes(entry) || (entry.startsWith('form:') && FORM_ID_PATTERN.test(entry.slice(5))))
    if (!valid) {
      throw new TypeError(
        `areas() holds lists module kinds (${HOLD_KINDS.join(', ')}) or form:<form id>; ${JSON.stringify(entry)} is neither`,
      )
    }
  }
  return holds.join(',')
}

/** An instant as Unix milliseconds; null when unset or not a date `Date.parse` reads. */
function instant(value: string | null): number | null {
  if (value === null) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

export const visibleNow: VisibleNow = (item, now = Date.now()) => {
  const from = instant(item.from)
  const until = instant(item.until)
  return (from === null || from <= now) && (until === null || until > now)
}
