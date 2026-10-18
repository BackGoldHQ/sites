// Who is reading, and the academy's reads as that reader makes them: the
// Classroom, Course and Lesson sections and the course entry layouts read
// their courses through `academyReads` only, so a visitor's progress and
// locks come from the visitor-scoped reads and never from a section's baked
// (public, cached) data.
//
// `visitorOf` is `locals.backgold.visitor`: who @backgold/astro's middleware
// found signed in for this request (`GET /visitor` with the `bg_visitor`
// cookie's token), null for everyone else. `academyReads` passes
// `locals.backgold.visitorReads` (the visitor's token and its renewal, set by
// the same middleware; undefined signed out) to the client's `courses`,
// `course` and `lesson`: a signed-in visitor's read is theirs and never
// stored, anyone else's is the public, cached read. The kit never reads the
// token itself.

import type { CourseResponse, CoursesResponse, LessonResponse, Visitor } from '@backgold/content'

/** The visitor signed in on this site for this request, or null. */
export function visitorOf(locals: App.Locals): Visitor | null {
  return locals.backgold.visitor
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
export function academyReads(astro: { locals: App.Locals }): AcademyReads {
  const bg = astro.locals.backgold
  const none = async () => null
  if (bg.setup !== null) return { visitor: null, courses: none, course: none, lesson: none }
  const { client, visitorReads } = bg
  return {
    visitor: bg.visitor,
    courses: () => client.courses(visitorReads),
    course: (slug) => (SLUG.test(slug) ? client.course(slug, visitorReads) : none()),
    lesson: (courseSlug, lessonSlug) => (SLUG.test(courseSlug) && SLUG.test(lessonSlug) ? client.lesson(courseSlug, lessonSlug, visitorReads) : none()),
  }
}
