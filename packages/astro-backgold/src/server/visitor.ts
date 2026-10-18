import { VISITOR_COOKIE as VISITOR_COOKIE_NAME } from '@backgold/content'

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

// `bg_visitor`: the signed-in visitor's token (0547), set by
// `/_backgold/visitor` when the giving portal hands a sign-in back to the
// site. HttpOnly: page script never sees it. It is sent to the api only as
// the X-BackGold-Visitor header, and a request that carries it is never
// answered from, or stored in, the edge cache.

export const VISITOR_TOKEN_COOKIE = VISITOR_COOKIE_NAME
/** The cookie outlives the token's hour: the api renews a token up to thirty days old while the portal session stands. */
const VISITOR_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
/** A token as a header carries it (the client's own check): printable ASCII, no space. */
const VISITOR_TOKEN = /^[\x21-\x7E]{1,4096}$/

/** Plain http on a local host (`astro dev`, `wrangler dev`), where a Secure cookie would never come back. */
function isLocalHttp(url: URL): boolean {
  if (url.protocol !== 'http:') return false
  const host = url.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
}

/** The token cookie's attributes for a response to `url`. */
export function visitorTokenCookieOptions(url: URL) {
  return {
    path: '/',
    maxAge: VISITOR_TOKEN_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: !isLocalHttp(url),
    httpOnly: true,
  } as const
}

/** What clearing the token cookie names: its path. */
export const VISITOR_TOKEN_DELETE_OPTIONS = { path: '/' } as const

/**
 * The request's token cookie: `present` whenever it carries one at all (the
 * request is then a visitor's, never cached), `token` only when the value is
 * one the client will send.
 */
export function readVisitorToken(cookies: CookieReader): { present: boolean; token: string | null } {
  const value = cookies.get(VISITOR_TOKEN_COOKIE)?.value
  if (value === undefined) return { present: false, token: null }
  return { present: true, token: VISITOR_TOKEN.test(value) ? value : null }
}
