// The site's redirects from `GET /redirects` (read through the client, so
// cached under the content version like every other read).

import type { RedirectsResponse } from '@backgold/content'
import { safeSrc } from './urls.js'

const REDIRECT_STATUSES = new Set([301, 302, 307, 308])

/**
 * A rule this site follows: a 410 (no destination), or a destination that is
 * an absolute http(s) URL or a path on this site. Anything else
 * (`javascript:`, `data:`, `//host`, `mailto:`) is ignored, never sent as a
 * Location.
 */
function usable(rule: RedirectsResponse['redirects'][number]): boolean {
  return rule.destination === null || rule.destination === '' || safeSrc(rule.destination) !== null
}

/** A path compared without a trailing slash (but `/` stays `/`), percent-decoding where it decodes. */
function normalizePath(path: string): string {
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // An invalid escape is compared as written.
  }
  const trimmed = decoded.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** The redirect or 410 for `pathname`, or null when no usable rule names it. */
export function redirectFor(rules: RedirectsResponse['redirects'], pathname: string): Response | null {
  const path = normalizePath(pathname)
  const rule = rules.find((r) => usable(r) && normalizePath(r.source) === path)
  if (!rule) return null
  if (rule.destination === null || rule.destination === '') {
    return new Response('Gone', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  const status = REDIRECT_STATUSES.has(rule.status_code) ? rule.status_code : 301
  const destination = safeSrc(rule.destination)!
  // A header value must be printable ASCII; anything else is percent-encoded.
  const location = /[^\x21-\x7e]/.test(destination) ? encodeURI(destination) : destination
  return new Response(null, { status, headers: { Location: location } })
}
