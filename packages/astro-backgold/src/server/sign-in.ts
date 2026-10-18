// A visitor signing in on the site (0547). The giving portal runs the sign-in
// itself; the site's own host holds the result, so a custom domain works:
//
//   GET  /_backgold/sign-in?return=<path>&title=<text>
//        → 302 to the portal's door for this site.
//   GET  /_backgold/visitor?code=<code>&return=<path>
//        The portal's return leg: redeems its one-minute code with the api
//        (first-party), keeps the token in the HttpOnly `bg_visitor` cookie,
//        → 302 to the path with `#signed-in` (the layout's one-time notice).
//   GET  /_backgold/sign-out?return=<path>
//        Ends the token at the api (best effort), clears the cookie, → 302.
//   POST /_backgold/progress {course, lesson, completed?, position_seconds?}
//        From the lesson page, same origin only: forwards to the api with the
//        visitor's token. A JSON post (the page's script) is answered with
//        the api's JSON; a form post (`application/x-www-form-urlencoded`,
//        the page without its script) carries the same fields as strings
//        and a `return` path, and is answered 303 to that path once saved
//        (to the sign-in door, coming back there, when no one is signed in).
//
// Every answer here is `no-store`, and the routes answer 404 on a site that
// does not read first-party (a site key cannot redeem the portal's code).
// The token goes to the api only as the X-BackGold-Visitor header; the
// cookie itself is never forwarded, and the portal's own cookie is never read.

import { BackgoldApiError, VISITOR_SIGN_IN_PATH, VISITOR_SIGN_OUT_PATH } from '@backgold/content'
import type { BackgoldContent, LessonProgressRequest, VisitorOptions } from '@backgold/content'
import type { BackgoldLocals, BackgoldReady } from './context.js'
import { errorResponse } from './respond.js'
import { VISITOR_TOKEN_COOKIE, VISITOR_TOKEN_DELETE_OPTIONS, readVisitorToken, visitorTokenCookieOptions } from './visitor.js'

/** The fragment the return leg adds, which shows the layout's "You are signed in as …" notice. */
export const SIGNED_IN_FRAGMENT = 'signed-in'

/** Every `/_backgold/` path: never cached, never redirected, no visitor read of their own. */
export function isVisitorRoute(pathname: string): boolean {
  return pathname === '/_backgold' || pathname.startsWith('/_backgold/')
}

/** The cookie jar the routes and the middleware write the token cookie through (Astro's `cookies`). */
export interface VisitorCookies {
  get(key: string): { value: string } | undefined
  set(key: string, value: string, options?: ReturnType<typeof visitorTokenCookieOptions>): void
  delete(key: string, options?: typeof VISITOR_TOKEN_DELETE_OPTIONS): void
}

// ── Addresses ────────────────────────────────────────────────────────────────

const PORTAL_STAGING = 'https://giving.backgold.dev'
const PORTAL_PRODUCTION = 'https://giving.backgold.com'

/**
 * The giving portal the site's api belongs to: staging's for an api on
 * `backgold.dev` or on a local host, production's for any other (the default
 * `api.backgold.com`).
 */
export function portalOrigin(apiOrigin: string): string {
  let host: string
  try {
    host = new URL(apiOrigin).hostname
  } catch {
    return PORTAL_PRODUCTION
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost') || host.endsWith('.test')
  return local || host === 'backgold.dev' || host.endsWith('.backgold.dev') ? PORTAL_STAGING : PORTAL_PRODUCTION
}

/**
 * A path on this site to come back to: path-absolute, not protocol-relative,
 * no control character, space or backslash (a URL parser drops a tab, so
 * `/\t/host` would become `//host`), no `..` segment literal or encoded; its
 * fragment dropped. `/` for anything else.
 */
export function safeReturnPath(raw: string | null): string {
  if (raw === null) return '/'
  const path = raw.replace(/#.*$/s, '')
  if (!/^\/(?!\/)/.test(path) || /[\u0000- \u007f\\]/.test(path)) return '/'
  const segments = path.replace(/\?.*$/s, '').split('/')
  for (const segment of segments) {
    try {
      if (decodeURIComponent(segment) === '..') return '/'
    } catch {
      return '/'
    }
  }
  return path
}

/** The page title the portal's door names, as one line of plain text of at most 200 characters; null when there is none. */
function titleText(raw: string | null): string | null {
  if (raw === null) return null
  const line = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  return line === '' ? null : line.slice(0, 200)
}

/** `/_backgold/sign-in?return=<path>`: what a Sign in link points at. */
export function signInHref(returnPath: string): string {
  return `${VISITOR_SIGN_IN_PATH}?${new URLSearchParams({ return: safeReturnPath(returnPath) })}`
}

/** `/_backgold/sign-out?return=<path>`: what a Sign out link points at. */
export function signOutHref(returnPath: string): string {
  return `${VISITOR_SIGN_OUT_PATH}?${new URLSearchParams({ return: safeReturnPath(returnPath) })}`
}

const redirect = (location: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } })

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The return leg with a code the api would not redeem: a plain page with the way back to the door. */
function expiredLink(returnPath: string): Response {
  const href = escapeHtml(signInHref(returnPath))
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>That sign-in link has expired</title><p>That sign-in link has expired. <a href="${href}">Sign in again.</a></p></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  )
}

// ── The visitor on every page ────────────────────────────────────────────────

/**
 * Fills `bg.visitor` and `bg.visitorReads` from the request's token cookie
 * with one `GET /visitor`. A token the api no longer takes, and a value no
 * header could carry, clear the cookie; a renewed token rewrites it, and the
 * reads after it in this request carry the new one. When the api cannot say
 * (an error answer) the page is drawn signed out and the cookie is kept.
 */
export async function resolveVisitor(bg: BackgoldReady, cookies: VisitorCookies, url: URL): Promise<void> {
  const { present, token } = readVisitorToken(cookies)
  if (!present) return
  if (token === null) {
    cookies.delete(VISITOR_TOKEN_COOKIE, VISITOR_TOKEN_DELETE_OPTIONS)
    return
  }
  const reads: VisitorOptions = { visitor: token }
  reads.onVisitorRenew = (fresh) => {
    reads.visitor = fresh
    cookies.set(VISITOR_TOKEN_COOKIE, fresh, visitorTokenCookieOptions(url))
  }
  let answer
  try {
    answer = await bg.client.visitor(token, { onVisitorRenew: reads.onVisitorRenew })
  } catch (error) {
    if (error instanceof BackgoldApiError) return
    throw error
  }
  if (answer.visitor === null) {
    cookies.delete(VISITOR_TOKEN_COOKIE, VISITOR_TOKEN_DELETE_OPTIONS)
    return
  }
  bg.visitor = answer.visitor
  bg.visitorReads = reads
}

// ── The routes ───────────────────────────────────────────────────────────────

export interface VisitorRouteDeps {
  bg: BackgoldLocals
  cookies: VisitorCookies
  /** The api origin the site reads (`BACKGOLD_API_ORIGIN`, else `https://api.backgold.com`): it names the portal. */
  apiOrigin: string
}

/** The site's state when it can sign a visitor in: configured and first-party. */
function firstPartyOf(bg: BackgoldLocals): (BackgoldReady & { client: BackgoldContent }) | null {
  return bg.setup === null && bg.firstParty ? bg : null
}

/** `GET /_backgold/sign-in`: to the portal's door for this site, carrying the path to come back to and the page's title. */
export function handleSignIn(request: Request, deps: VisitorRouteDeps): Response {
  const bg = firstPartyOf(deps.bg)
  if (!bg) return notFound()
  const url = new URL(request.url)
  const params = new URLSearchParams({ site: bg.siteId, return: safeReturnPath(url.searchParams.get('return')) })
  const title = titleText(url.searchParams.get('title'))
  if (title !== null) params.set('title', title)
  return redirect(`${portalOrigin(deps.apiOrigin)}/site-signin?${params}`)
}

/** `GET /_backgold/visitor`: the portal's return leg. */
export async function handleVisitorReturn(request: Request, deps: VisitorRouteDeps): Promise<Response> {
  const bg = firstPartyOf(deps.bg)
  if (!bg) return notFound()
  const url = new URL(request.url)
  const returnPath = safeReturnPath(url.searchParams.get('return'))
  const code = url.searchParams.get('code')
  if (!code) return expiredLink(returnPath)
  let token: string
  try {
    token = (await bg.client.exchangeVisitor(code)).token
  } catch (error) {
    if (error instanceof BackgoldApiError || error instanceof TypeError) return expiredLink(returnPath)
    throw error
  }
  deps.cookies.set(VISITOR_TOKEN_COOKIE, token, visitorTokenCookieOptions(url))
  // The code is in this address: no page it leads to is told it.
  return redirect(`${returnPath}#${SIGNED_IN_FRAGMENT}`, { 'Referrer-Policy': 'no-referrer' })
}

/** `GET /_backgold/sign-out`: ends the token at the api (best effort), clears the cookie, back to the path. */
export async function handleSignOut(request: Request, deps: VisitorRouteDeps): Promise<Response> {
  const bg = firstPartyOf(deps.bg)
  if (!bg) return notFound()
  const url = new URL(request.url)
  const { present, token } = readVisitorToken(deps.cookies)
  if (token !== null) {
    try {
      await bg.client.signOutVisitor(token)
    } catch {
      // The cookie goes either way; the token lapses within its hour.
    }
  }
  if (present) deps.cookies.delete(VISITOR_TOKEN_COOKIE, VISITOR_TOKEN_DELETE_OPTIONS)
  return redirect(safeReturnPath(url.searchParams.get('return')))
}

/**
 * A request from a page of this site: `Sec-Fetch-Site: same-origin` when the
 * browser sends it, else an `Origin` equal to the request's own.
 */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get('Sec-Fetch-Site')
  if (site !== null) return site === 'same-origin'
  const origin = request.headers.get('Origin')
  return origin !== null && origin === new URL(request.url).origin
}

/** The largest progress body read. */
const MAX_PROGRESS_BYTES = 2048
const SLUG = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/

interface ProgressPost {
  course: string
  lesson: string
  body: LessonProgressRequest
}

/** A JSON body's `{course, lesson, completed?, position_seconds?}`, checked; null for anything else. */
function progressOfJson(raw: string): ProgressPost | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  return progressOfFields(parsed as Record<string, unknown>)
}

/**
 * A form body's fields as their JSON values: `completed` `true` or `false`,
 * `position_seconds` a number of seconds; anything else is passed on as the
 * string it is, which the check then refuses.
 */
function progressOfForm(raw: string): { progress: ProgressPost | null; returnPath: string } {
  const form = new URLSearchParams(raw)
  const fields: Record<string, unknown> = { course: form.get('course') ?? undefined, lesson: form.get('lesson') ?? undefined }
  const completed = form.get('completed')
  if (completed !== null) fields.completed = completed === 'true' ? true : completed === 'false' ? false : completed
  const position = form.get('position_seconds')
  if (position !== null) fields.position_seconds = /^\d+(\.\d+)?$/.test(position) ? Number(position) : position
  return { progress: progressOfFields(fields), returnPath: safeReturnPath(form.get('return')) }
}

/** `{course, lesson, completed?, position_seconds?}`, checked; null for anything else, or when neither field to save is there. */
function progressOfFields(fields: Record<string, unknown>): ProgressPost | null {
  const { course, lesson, completed, position_seconds } = fields
  if (typeof course !== 'string' || !SLUG.test(course) || typeof lesson !== 'string' || !SLUG.test(lesson)) return null
  const body: LessonProgressRequest = {}
  if (completed !== undefined) {
    if (typeof completed !== 'boolean') return null
    body.completed = completed
  }
  if (position_seconds !== undefined) {
    if (typeof position_seconds !== 'number' || !Number.isFinite(position_seconds) || position_seconds < 0) return null
    body.position_seconds = Math.floor(position_seconds)
  }
  if (body.completed === undefined && body.position_seconds === undefined) return null
  return { course, lesson, body }
}

/** A form post (the lesson page without its script), not the script's JSON. */
function isFormPost(request: Request): boolean {
  const type = request.headers.get('Content-Type') ?? ''
  return /^application\/x-www-form-urlencoded\s*(;|$)/i.test(type)
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })

/** `POST /_backgold/progress`: the lesson page saving the visitor's place, through the api. */
export async function handleProgress(request: Request, deps: VisitorRouteDeps): Promise<Response> {
  const bg = firstPartyOf(deps.bg)
  if (!bg) return notFound()
  if (!sameOrigin(request)) return errorResponse(403, 'CROSS_ORIGIN', 'Progress is saved from the site’s own pages only.')
  const form = isFormPost(request)
  const raw = await request.text()
  const fitting = raw.length <= MAX_PROGRESS_BYTES
  const parsed = form ? (fitting ? progressOfForm(raw) : { progress: null, returnPath: '/' }) : { progress: fitting ? progressOfJson(raw) : null, returnPath: null }
  const { token } = readVisitorToken(deps.cookies)
  if (token === null) {
    if (parsed.returnPath !== null) return seeOther(signInHref(parsed.returnPath))
    return errorResponse(401, 'VISITOR_REQUIRED', 'Sign in to save your place.')
  }
  const progress = parsed.progress
  if (!progress) {
    return errorResponse(400, 'BAD_PROGRESS', 'Send {course, lesson} with completed (true or false) or position_seconds (seconds, 0 or more).')
  }
  const url = new URL(request.url)
  try {
    const answer = await bg.client.lessonProgress(progress.course, progress.lesson, progress.body, token, {
      onVisitorRenew: (fresh) => deps.cookies.set(VISITOR_TOKEN_COOKIE, fresh, visitorTokenCookieOptions(url)),
    })
    if (parsed.returnPath !== null) return seeOther(parsed.returnPath)
    return Response.json(answer, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof BackgoldApiError) return errorResponse(error.status, error.code, error.message)
    throw error
  }
}

