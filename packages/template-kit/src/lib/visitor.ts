// Who is reading, and the academy's reads as that reader makes them: the
// Classroom, Course and Lesson sections and the course entry layouts read
// their courses through `academyReads` only, so a visitor's progress and
// locks come from the visitor-scoped reads and never from a section's baked
// (public, cached) data.
//
// `visitorOf` reads `locals.backgold.visitor` (`GET /visitor` for the request's
// `bg_visitor` cookie, set by @backgold/astro's middleware; null with no
// cookie, or when the runtime does not set it). `academyReads` calls the
// client's `courses`, `course` and `lesson` methods when the client has them,
// passing the cookie's token as `visitor` while there is a visitor; a client
// without them is read through `raw()` as the public reader, so the answer
// carries no progress and the public locks.

import type { AstroCookies } from 'astro'
import { VISITOR_COOKIE, VISITOR_SIGN_IN_PATH, VISITOR_SIGN_OUT_PATH, type CourseResponse, type CoursesResponse, type LessonResponse, type Visitor } from '@backgold/contract/content-api'

/** The visitor signed in on this site for this request, or null. */
export function visitorOf(locals: App.Locals): Visitor | null {
  const bg = locals.backgold as { visitor?: Visitor | null }
  return bg.visitor ?? null
}

interface VisitorReadOptions {
  /** The `bg_visitor` token: the read is that visitor's, never stored. */
  visitor?: string
}

/** The client's visitor-scoped course reads, as @backgold/content names them. */
interface AcademyClient {
  courses?: (opts?: VisitorReadOptions) => Promise<CoursesResponse | null>
  course?: (slug: string, opts?: VisitorReadOptions) => Promise<CourseResponse | null>
  lesson?: (courseSlug: string, lessonSlug: string, opts?: VisitorReadOptions) => Promise<LessonResponse | null>
}

export interface AcademyReads {
  visitor: Visitor | null
  courses: () => Promise<CoursesResponse | null>
  course: (slug: string) => Promise<CourseResponse | null>
  lesson: (courseSlug: string, lessonSlug: string) => Promise<LessonResponse | null>
}

/** A slug the api could have minted: anything else is never sent. */
export const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/

/** The academy's reads for this request: the visitor's while one is signed in, else the public reader's. */
export function academyReads(astro: { locals: App.Locals; cookies: AstroCookies }): AcademyReads {
  const bg = astro.locals.backgold
  const visitor = visitorOf(astro.locals)
  const token = visitor ? astro.cookies.get(VISITOR_COOKIE)?.value : undefined
  const opts: VisitorReadOptions = token ? { visitor: token } : {}
  const client = bg.client
  const academy = client as unknown as AcademyClient
  const none = async () => null
  if (!client) return { visitor: null, courses: none, course: none, lesson: none }
  return {
    visitor,
    courses: () => (academy.courses ? academy.courses(opts) : client.raw<CoursesResponse>('/courses')),
    course: (slug) => {
      if (!SLUG.test(slug)) return none()
      return academy.course ? academy.course(slug, opts) : client.raw<CourseResponse>(`/courses/${slug}`)
    },
    lesson: (courseSlug, lessonSlug) => {
      if (!SLUG.test(courseSlug) || !SLUG.test(lessonSlug)) return none()
      return academy.lesson ? academy.lesson(courseSlug, lessonSlug, opts) : client.raw<LessonResponse>(`/courses/${courseSlug}/${lessonSlug}`)
    },
  }
}

/** The site's sign-in door, coming back to `path`. */
export const signInHref = (path: string): string => `${VISITOR_SIGN_IN_PATH}?return=${encodeURIComponent(path)}`

/** Signing the visitor out of the site, coming back to `path`. */
export const signOutHref = (path: string): string => `${VISITOR_SIGN_OUT_PATH}?return=${encodeURIComponent(path)}`
