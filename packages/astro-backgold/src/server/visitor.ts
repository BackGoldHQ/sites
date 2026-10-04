// `bg_vid`: a random first-party visitor id. It names the visitor for a
// server-side variant pick and is the distinct id the analytics island
// bootstraps posthog-js with, so both name the same person. It carries no
// PII and is readable by page script (not HttpOnly) for that bootstrap.

export const VISITOR_COOKIE = 'bg_vid'
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60
/** What this package mints (a UUID) or anything of the same alphabet; anything else is re-minted. */
const VISITOR_ID = /^[A-Za-z0-9-]{16,64}$/

interface CookieReader {
  get(key: string): { value: string } | undefined
}

/** The visitor's id when the request carries a well-formed one. */
export function readVisitorId(cookies: CookieReader): string | null {
  const value = cookies.get(VISITOR_COOKIE)?.value
  return value !== undefined && VISITOR_ID.test(value) ? value : null
}

export function mintVisitorId(): string {
  return crypto.randomUUID()
}

export const VISITOR_COOKIE_OPTIONS = {
  path: '/',
  maxAge: ONE_YEAR_SECONDS,
  sameSite: 'lax',
  secure: true,
  httpOnly: false,
} as const
