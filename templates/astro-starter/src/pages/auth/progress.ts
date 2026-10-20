// POST /auth/progress {course, lesson, completed?, position_seconds?}: a
// lesson page saving the visitor's place. From this site's own pages only;
// sent to the api with the visitor's token, and the api's JSON comes back.
// 401 VISITOR_REQUIRED without the cookie.
import type { APIRoute } from 'astro'
import { BackgoldApiError, type LessonProgressRequest } from '@backgold/content'
import { jsonError, keepVisitorToken, notFound, visitorSignIn, visitorToken } from '../../lib/visitor'

export const prerender = false

/** `Sec-Fetch-Site: same-origin` when the browser sends it, else an `Origin` equal to the request's own. */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get('Sec-Fetch-Site')
  if (site !== null) return site === 'same-origin'
  return request.headers.get('Origin') === new URL(request.url).origin
}

const SLUG = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/

/** The body's course, lesson and what to save; null for anything else. */
function progressOf(raw: string): { course: string; lesson: string; body: LessonProgressRequest } | null {
  let fields: unknown
  try {
    fields = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return null
  const { course, lesson, completed, position_seconds } = fields as Record<string, unknown>
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

export const POST: APIRoute = async ({ locals, request, url, cookies }) => {
  const signIn = visitorSignIn(locals)
  if (!signIn) return notFound()
  if (!sameOrigin(request)) return jsonError(403, 'CROSS_ORIGIN', 'Progress is saved from this site’s own pages only.')
  const token = visitorToken(cookies)
  if (token === null) return jsonError(401, 'VISITOR_REQUIRED', 'Sign in to save your place.')
  const raw = await request.text()
  const progress = raw.length <= 2048 ? progressOf(raw) : null
  if (!progress) return jsonError(400, 'BAD_PROGRESS', 'Send {course, lesson} with completed (true or false) or position_seconds (seconds, 0 or more).')
  try {
    const answer = await signIn.client.lessonProgress(progress.course, progress.lesson, progress.body, token, {
      onVisitorRenew: (fresh) => keepVisitorToken(cookies, url, fresh),
    })
    return Response.json(answer, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof BackgoldApiError) return jsonError(error.status, error.code, error.message)
    throw error
  }
}
