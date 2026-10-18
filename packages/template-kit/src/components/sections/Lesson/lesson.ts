// A Lesson as its player and reading layouts draw it (board D3), from the
// Content API's lesson answer (`GET /courses/:course/:lesson`) read through
// lib/visitor.ts: as the visitor while one is signed in, else as the public
// reader.
//
// The lesson is the one at this address (`/<courses base>/<course>/<lesson>`,
// Course/course.ts). On a page that pins a course (`options.courseSlug`) and
// is not at a lesson's address, it is the visitor's next lesson, else the
// course's first.
//
// A locked lesson is what the api left of it: its title, cover, length and
// place in the course, no video and no notes. The page draws its teaser and
// the door the lock names: `signed_in` the sign-in door (the newsletter box
// unticked, riding along to the sign-in as `newsletter=1`), `members` the
// Join door, `tag` the door that says to ask. Which door is the api's call
// (`lesson.lock.reason`); nothing here decides who qualifies.

import type { Section } from '@backgold/content'
import type { Areas, CourseLesson, CourseProgress, EntryLock, LessonResponse, Visitor } from '@backgold/contract/content-api'
import { renderMarkdown, safeHref, safeSrc, signInHref, signOutHref } from '@backgold/astro/server'
import { countAndLength, inSentence, lockWordOf, orgNameOf } from '../../../lib/academy'
import { listOf, text } from '../../../lib/format'
import { academyReads } from '../../../lib/visitor'
import { pinnedCourseOf, routeOf, type AcademyContext } from '../Course/course'

export interface RailRow {
  n: number
  name: string
  href: string | null
  seconds: number | null
  /** This lesson, the one on the page. */
  now: boolean
  done: boolean
  locked: boolean
  /** The row's word: Done, Now, Members, Free, Sign in; null where the length stands alone. */
  word: string | null
}

export type Door =
  | { kind: 'sign-in'; returnPath: string; newsletter: string }
  | { kind: 'join'; n: number; orgName: string | null; name: string | null; signOut: string; signIn: string }
  | { kind: 'tag'; tag: string | null; orgName: string | null }

export interface Neighbor {
  n: number
  name: string
  href: string | null
}

export interface LessonView {
  courseSlug: string
  slug: string
  n: number
  total: number
  name: string
  seconds: number | null
  courseTitle: string
  courseHref: string | null
  coursesHref: string | null
  /** The video, for a reader who may watch it; null when locked or not up yet. */
  video: { src: string; poster: string | null } | null
  /** The cover, for the locked teaser. */
  cover: string | null
  locked: boolean
  /** The teaser's words over the cover: "Sign in to watch", "For members". */
  lockWord: string | null
  door: Door | null
  visitor: Visitor | null
  completed: boolean
  /** Where this visitor stopped, in seconds; null without one, or once finished. */
  resumeAt: number | null
  /** The notes (the lesson's body) as sanitized HTML; null when it has none or is locked. */
  notes: string | null
  previous: Neighbor | null
  next: Neighbor | null
  rail: {
    rows: RailRow[]
    progress: CourseProgress | null
    /** Signed out: "12 lessons · 1 h 1 min" and "Lesson 1 is free". */
    count: string
    free: string | null
  }
  /** This page's address, for the doors' and the progress form's way back. */
  path: string
}

/** The newsletter the sign-in door offers: the first email sign-up an area holds, by its kicker ("The Harbor letter"). */
function newsletterOf(areas: Areas | null | undefined): string {
  for (const items of Object.values(areas ?? {})) {
    for (const item of items) {
      for (const section of item.sections) {
        const name = section.type === 'SignupCapture' ? text(section.copy.kicker) : null
        if (name) return inSentence(name)
      }
    }
  }
  return 'the newsletter'
}

function doorOf(lock: EntryLock, n: number, visitor: Visitor | null, path: string, areas: Areas | null | undefined): Door {
  if (lock.reason === 'members') {
    return { kind: 'join', n, orgName: lock.org_name || null, name: visitor ? (visitor.first_name ?? visitor.email) : null, signOut: signOutHref(signInHref(path)), signIn: signInHref(path) }
  }
  if (lock.reason === 'tag') return { kind: 'tag', tag: lock.tag_label, orgName: lock.org_name || null }
  return { kind: 'sign-in', returnPath: path, newsletter: newsletterOf(areas) }
}

function railWordOf(lesson: CourseLesson, now: boolean, signedIn: boolean): string | null {
  if (lesson.locked) {
    const word = lesson.lock?.reason === 'signed_in' ? 'Sign in' : 'Members'
    return now ? `Now · ${word}` : word
  }
  if (now) return 'Now'
  if (signedIn) return lesson.completed ? 'Done' : null
  return lesson.access === 'public' ? 'Free' : null
}

const neighborOf = (lessons: CourseLesson[], slug: string | undefined): Neighbor | null => {
  const i = slug ? lessons.findIndex((l) => l.slug === slug) : -1
  return i === -1 ? null : { n: i + 1, name: lessons[i]!.title, href: safeHref(lessons[i]!.url) }
}

/** The lesson as the layouts draw it, for this visitor (null signed out) and this page's address. */
export function lessonView(answer: LessonResponse, visitor: Visitor | null, path: string): LessonView {
  const { lesson, course } = answer
  const lessons = [...course.lessons].sort((a, b) => a.position - b.position)
  const index = lessons.findIndex((l) => l.slug === lesson.slug)
  const n = index + 1
  const row = lessons[index]
  const locked = lesson.locked === true || row?.locked === true
  const lock = lesson.lock ?? row?.lock ?? null
  const src = locked ? null : safeSrc(lesson.media_url)
  const cover = lesson.hero ? safeSrc(lesson.hero.url) : null
  const completed = visitor !== null && row?.completed === true
  const position = visitor && !completed ? (row?.position_seconds ?? null) : null
  const free = lessons.flatMap((l, i) => (l.access === 'public' ? [String(i + 1)] : []))
  const notes = !locked && lesson.body.markdown.trim() ? renderMarkdown(lesson.body.markdown) : ''
  const orgName = orgNameOf([lock, course.lock, ...lessons.map((l) => l.lock)])
  return {
    courseSlug: course.slug,
    slug: lesson.slug,
    n: n || 1,
    total: lessons.length,
    name: lesson.title,
    seconds: lesson.duration_seconds ?? row?.duration_seconds ?? null,
    courseTitle: course.title,
    courseHref: safeHref(course.url),
    coursesHref: safeHref(course.url.replace(/\/[^/]+\/?$/, '')),
    video: src ? { src, poster: cover } : null,
    cover,
    locked,
    lockWord: locked && lock ? lockWordOf(lock) : null,
    door: locked && lock ? doorOf({ ...lock, org_name: lock.org_name || orgName || '' }, n, visitor, path, answer.areas) : null,
    visitor,
    completed,
    resumeAt: position !== null && position > 0 ? position : null,
    notes: notes.trim() ? notes : null,
    previous: neighborOf(lessons, answer.previous?.slug),
    next: neighborOf(lessons, answer.next?.slug),
    rail: {
      rows: lessons.map((l, i) => ({
        n: i + 1,
        name: l.title,
        href: safeHref(l.url),
        seconds: l.duration_seconds,
        now: l.slug === lesson.slug,
        done: visitor !== null && l.completed,
        locked: l.locked,
        word: railWordOf(l, l.slug === lesson.slug, visitor !== null),
      })),
      progress: visitor ? course.progress : null,
      count: countAndLength(course.lesson_count || lessons.length, course.total_seconds),
      free: free.length === 0 ? null : free.length === 1 ? `Lesson ${free[0]} is free` : `Lessons ${listOf(free)} are free`,
    },
    path,
  }
}

/** The lesson this section names (course.ts's address or pin), read for this visitor; null when there is none. */
export async function lessonOf(section: Section, astro: AcademyContext): Promise<LessonView | null> {
  const reads = academyReads(astro)
  const route = await routeOf(astro)
  const pinned = pinnedCourseOf(section)
  const courseSlug = pinned ?? route?.course ?? null
  if (!courseSlug) return null
  let lessonSlug = route && route.course === courseSlug ? route.lesson : null
  if (!lessonSlug) {
    const course = (await reads.course(courseSlug))?.course
    const lessons = [...(course?.lessons ?? [])].sort((a, b) => a.position - b.position)
    lessonSlug = (reads.visitor ? course?.progress?.next_lesson_slug : null) ?? lessons[0]?.slug ?? null
  }
  if (!lessonSlug) return null
  const answer = await reads.lesson(courseSlug, lessonSlug)
  return answer ? lessonView(answer, reads.visitor, astro.url.pathname) : null
}
