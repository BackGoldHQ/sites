// Visitors signing in on this site through BackGold's giving portal, to open
// the entries the organization keeps for people it knows. The portal runs the
// sign-in and hands it back to /auth/visitor with a one-minute code; this
// Worker redeems the code with the site's secret key and keeps the visitor's
// token in its own HttpOnly cookie, `bg_visitor`. @backgold/astro's
// middleware reads who that is on every page (`locals.backgold.visitor`) and
// what to pass to a read made for them (`locals.backgold.visitorReads`).
//
// The secret key is the Worker secret BACKGOLD_SITE_SECRET_KEY. Without it,
// and while the site is still being set up, every /auth/ route answers 404.

import type { AstroCookies } from 'astro'
import { createClient, VISITOR_COOKIE, type BackgoldContent } from '@backgold/content'
import { VISITOR_TOKEN_DELETE_OPTIONS, portalOrigin, readVisitorToken, safeReturnPath, visitorTokenCookieOptions } from '@backgold/astro/server'
import { env } from 'cloudflare:workers'

const SECRET_KEY = /^bg_site_sk_[A-Za-z0-9]+$/
const DEFAULT_API_ORIGIN = 'https://api.backgold.com'

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** The site's secret key when BACKGOLD_SITE_SECRET_KEY holds one; null otherwise. */
function secretKey(): string | null {
  const key = trimmed(env.BACKGOLD_SITE_SECRET_KEY)
  return SECRET_KEY.test(key) ? key : null
}

/** True when this site signs visitors in: configured, with a secret key. */
export function signInReady(locals: App.Locals): boolean {
  return locals.backgold.setup === null && secretKey() !== null
}

interface VisitorSignIn {
  /** A client on the secret key, built for this request: it redeems codes and saves progress, and stores nothing. */
  client: BackgoldContent
  /** The site's id, which the portal's door names. */
  siteId: string
  /** The site's public origin (SITE_URL), which the portal sends the visitor back to. */
  siteUrl: string
  /** The giving portal for the api the site reads. */
  portal: string
}

/** What the /auth/ routes work with; null when the site does not sign visitors in. */
export function visitorSignIn(locals: App.Locals): VisitorSignIn | null {
  const bg = locals.backgold
  const key = secretKey()
  if (bg.setup !== null || key === null) return null
  const apiOrigin = trimmed(env.BACKGOLD_API_ORIGIN) || DEFAULT_API_ORIGIN
  return { client: createClient({ key, apiOrigin }), siteId: bg.siteId, siteUrl: bg.siteUrl, portal: portalOrigin(apiOrigin) }
}

/** `/auth/sign-in?to=<path>&title=<text>`: what a Sign in link points at. */
export function signInHref(to: string, title?: string | null): string {
  const params = new URLSearchParams({ to: safeReturnPath(to) })
  if (title) params.set('title', title)
  return `/auth/sign-in?${params}`
}

/** `/auth/sign-out?to=<path>`: what a Sign out link points at. */
export function signOutHref(to: string): string {
  return `/auth/sign-out?${new URLSearchParams({ to: safeReturnPath(to) })}`
}

/** The visitor's token from the cookie, when it holds one the api could read. */
export function visitorToken(cookies: AstroCookies): string | null {
  return readVisitorToken(cookies).token
}

export function keepVisitorToken(cookies: AstroCookies, url: URL, token: string): void {
  cookies.set(VISITOR_COOKIE, token, visitorTokenCookieOptions(url))
}

export function dropVisitorToken(cookies: AstroCookies): void {
  if (readVisitorToken(cookies).present) cookies.delete(VISITOR_COOKIE, VISITOR_TOKEN_DELETE_OPTIONS)
}

// ── Answers ──────────────────────────────────────────────────────────────────
// Every /auth/ answer is no-store: none is the same for two visitors.

export const redirect = (location: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } })

export const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export const jsonError = (status: number, code: string, error: string) =>
  Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } })
