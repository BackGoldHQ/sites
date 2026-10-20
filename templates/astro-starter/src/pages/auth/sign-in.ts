// GET /auth/sign-in?to=<path>&title=<text>: to the giving portal's door for
// this site. The portal sends the visitor back to <SITE_URL>/auth/visitor
// with a one-minute code, so SITE_URL must be the site's address in
// BackGold: its connected domain, or, while it has none, the host of the
// preview address on its Developer page (https, the exact host). `title`
// is what the door names: the entry or lesson being opened.
import type { APIRoute } from 'astro'
import { safeReturnPath } from '@backgold/astro/server'
import { notFound, redirect, visitorSignIn } from '../../lib/visitor'

export const prerender = false

/** One line of plain text of at most 200 characters; null when there is none. */
function titleText(raw: string | null): string | null {
  const line = (raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return line === '' ? null : line.slice(0, 200)
}

export const GET: APIRoute = ({ locals, url }) => {
  const signIn = visitorSignIn(locals)
  if (!signIn) return notFound()
  const back = new URL('/auth/visitor', signIn.siteUrl)
  back.searchParams.set('to', safeReturnPath(url.searchParams.get('to')))
  const door = new URLSearchParams({ site: signIn.siteId, return: back.href })
  const title = titleText(url.searchParams.get('title'))
  if (title !== null) door.set('title', title)
  return redirect(`${signIn.portal}/site-signin?${door}`)
}
