// A Course as its syllabus and outline layouts draw it (board D2), and the
// course address both the Course and the Lesson sections read their course
// from.
//
// The course is the one at this address (`/<courses base>/<course>`, and a
// lesson's `/<courses base>/<course>/<lesson>`, the base the course type's
// `url_base`), or the section's `options.courseSlug` on a page that pins one.
// It is read through lib/visitor.ts: as the visitor while one is signed in
// (each lesson's Done and the course's bar, the locks as that visitor meets
// them), else as the public reader. The section's own data carries no course.

import type { Section } from '@backgold/content'
import type { ContentAccessLevel, CourseDetail, CourseLesson, CourseProgress, EntryLock, Visitor } from '@backgold/contract/content-api'
import { safeHref, safeSrc, signInHref, signOutHref } from '@backgold/astro/server'
import { COURSE_TYPE_KEY, finishedOn, lockWordOf, whoCanWatch } from '../../../lib/academy'
import { SLUG, academyReads, type AcademyReads } from '../../../lib/visitor'

export interface AcademyContext {
  locals: App.Locals
  url: URL
}

/** The course (and lesson) this address names under the course type's base, or null. */
export async function routeOf(astro: AcademyContext): Promise<{ course: string; lesson: string | null } | null> {
  const client = astro.locals.backgold.client
  if (!client) return null
  const base = (await client.types()).types.find((t) => t.key === COURSE_TYPE_KEY)?.url_base
  let parts: string[]
  try {
    parts = astro.url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
  if (!base || parts[0] !== base || !parts[1] || parts.length > 3) return null
  return { course: parts[1], lesson: parts[2] ?? null }
}

/** The section's pinned course (`options.courseSlug`), or null when it pins none. */
export function pinnedCourseOf(section: Section): string | null {
  const slug = section.options?.courseSlug
  return typeof slug === 'string' && SLUG.test(slug) ? slug : null
}

export type LessonState = 'done' | 'next' | 'locked' | 'open'

export interface SyllabusRow {
  n: number
  slug: string
  /** The lesson's own title, "Decide what you want". */
  name: string
  href: string | null
  seconds: number | null
  state: LessonState
  lock: EntryLock | null
  /** The lock's word ("For members", "Sign in to watch"); null on an open lesson. */
  lockWord: string | null
  access: ContentAccessLevel
}

export interface CourseView {
  title: string
  summary: string | null
  cover: string | null
  /** The courses list (the course address's parent), for the breadcrumb. */
  coursesHref: string | null
  lessons: number
  seconds: number | null
  access: ContentAccessLevel
  visitor: Visitor | null
  /** The visitor's place; null signed out. */
  progress: CourseProgress | null
  rows: SyllabusRow[]
  /** The lesson this visitor finished last and when ("Lesson 4 finished on Tuesday"); null signed out or before any `completed_at`. */
  lastFinished: { n: number; on: string } | null
  /** The lesson the head's button opens ("Continue · Lesson 5", "Start · Lesson 1"); null when there is none to open. */
  next: { row: SyllabusRow; verb: 'Continue' | 'Start' } | null
  /** "Anyone signed in with their email". */
  whoCanWatch: string
  /** The lessons whose rule is not the course's: "Lesson 9", "Members of <org>". */
  exceptions: { n: number; who: string }[]
  signIn: string
  signOut: string
}

function rowOf(lesson: CourseLesson, n: number, progress: CourseProgress | null): SyllabusRow {
  const state: LessonState = lesson.locked ? 'locked' : lesson.completed ? 'done' : progress?.next_lesson_slug === lesson.slug ? 'next' : 'open'
  return {
    n,
    slug: lesson.slug,
    name: lesson.title,
    href: safeHref(lesson.url),
    seconds: lesson.duration_seconds,
    state,
    lock: lesson.locked ? lesson.lock : null,
    lockWord: lesson.locked && lesson.lock ? lockWordOf(lesson.lock) : null,
    access: lesson.access,
  }
}

/** The newest `completed_at` among the visitor's finished lessons. */
function lastFinishedOf(lessons: CourseLesson[], visitor: Visitor | null): { n: number; on: string } | null {
  if (!visitor) return null
  let best: { n: number; at: number } | null = null
  for (const [i, lesson] of lessons.entries()) {
    const at = lesson.completed && lesson.completed_at !== null ? Date.parse(lesson.completed_at) : NaN
    if (!Number.isNaN(at) && (best === null || at > best.at)) best = { n: i + 1, at }
  }
  if (best === null) return null
  const on = finishedOn(new Date(best.at).toISOString())
  return on ? { n: best.n, on } : null
}

/** The course as the layouts draw it, for this visitor (null signed out), this page's address and the organization's name. */
export function courseView(course: CourseDetail, visitor: Visitor | null, path: string, orgName: string | null): CourseView {
  const lessons = [...course.lessons].sort((a, b) => a.position - b.position)
  const progress = visitor ? course.progress : null
  const rows = lessons.map((lesson, i) => rowOf(lesson, i + 1, progress))
  const nextRow = progress ? rows.find((r) => r.slug === progress.next_lesson_slug) : rows[0]
  const coursesPath = course.url.replace(/\/[^/]+\/?$/, '')
  return {
    title: course.title,
    summary: course.summary,
    cover: course.hero ? safeSrc(course.hero.url) : null,
    coursesHref: coursesPath ? safeHref(coursesPath) : null,
    lessons: course.lesson_count || lessons.length,
    seconds: course.total_seconds,
    access: course.access,
    visitor,
    progress,
    rows,
    lastFinished: lastFinishedOf(lessons, progress ? visitor : null),
    next: nextRow ? { row: nextRow, verb: progress && progress.completed > 0 ? 'Continue' : 'Start' } : null,
    whoCanWatch: whoCanWatch(course.access, orgName, course.lock?.tag_label ?? null),
    exceptions: rows.filter((r) => r.access !== course.access).map((r) => ({ n: r.n, who: whoCanWatch(r.access, orgName, r.lock?.tag_label ?? null) })),
    signIn: signInHref(path, course.title),
    signOut: signOutHref(path),
  }
}

/** The course this section names (its pin, else the address), read for this visitor; null when there is none. */
export async function courseOf(section: Section, astro: AcademyContext, reads: AcademyReads = academyReads(astro)): Promise<CourseView | null> {
  const slug = pinnedCourseOf(section) ?? (await routeOf(astro))?.course ?? null
  if (!slug) return null
  const found = await reads.course(slug)
  return found ? courseView(found.course, reads.visitor, astro.url.pathname, reads.orgName) : null
}
