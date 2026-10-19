// GET /auth/sign-out?to=<path>: clears the visitor's cookie and goes on to
// the path. The api has no call that ends a token today: the token that was
// in the cookie is good until its hour is up, and while the visitor's portal
// session stands a read that presents it after that is still renewed.
import type { APIRoute } from 'astro'
import { safeReturnPath } from '@backgold/astro/server'
import { dropVisitorToken, notFound, redirect, visitorSignIn } from '../../lib/visitor'

export const prerender = false

export const GET: APIRoute = ({ locals, url, cookies }) => {
  if (!visitorSignIn(locals)) return notFound()
  dropVisitorToken(cookies)
  return redirect(safeReturnPath(url.searchParams.get('to')))
}
