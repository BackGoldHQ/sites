// GET /auth/visitor?code=<code>&to=<path>: the portal's way back. The code
// is redeemed here, on the server, with the secret key (it is good for one
// minute and once); the token goes into the HttpOnly `bg_visitor` cookie and
// the visitor goes on to the path. A code the api will not redeem answers a
// small "That sign-in link has expired" page with the way back to the door.
import type { APIRoute } from 'astro'
import { BackgoldApiError } from '@backgold/content'
import { safeReturnPath } from '@backgold/astro/server'
import { keepVisitorToken, notFound, redirect, signInHref, visitorSignIn } from '../../lib/visitor'

export const prerender = false

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function expiredLink(to: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>That sign-in link has expired</title><p>That sign-in link has expired. <a href="${escapeHtml(signInHref(to))}">Sign in again.</a></p></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  )
}

export const GET: APIRoute = async ({ locals, url, cookies }) => {
  const signIn = visitorSignIn(locals)
  if (!signIn) return notFound()
  const to = safeReturnPath(url.searchParams.get('to'))
  const code = url.searchParams.get('code')
  if (!code) return expiredLink(to)
  let token: string
  try {
    token = (await signIn.client.exchangeVisitor(code)).token
  } catch (error) {
    if (error instanceof BackgoldApiError || error instanceof TypeError) return expiredLink(to)
    throw error
  }
  keepVisitorToken(cookies, url, token)
  // The code is in this address: no page it leads to is told it.
  return redirect(to, { 'Referrer-Policy': 'no-referrer' })
}
