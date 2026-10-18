// The academy's words and numbers, as boards D1 (Classroom), D2 (Course) and
// D3 (Lesson) of docs/design/academy-2026-10 print them: a lesson's length
// ("4:50"), a course's ("1 h 1 min"), the lesson count, the progress
// phrases, who can watch, and the doors' links. Every number comes from the
// Content API; none is typed by the organization.

import type { ContentAccessLevel, CourseProgress, EntryLock } from '@backgold/contract/content-api'

/** The built-in content type the courses are. */
export const COURSE_TYPE_KEY = 'course'

/** The site's Join page (the members door's "See how to join") and its Contact page (the tag door's). */
export const JOIN_PATH = '/join'
export const CONTACT_PATH = '/contact'

/** The Content API's access levels (CONTENT_ACCESS_LEVELS in the platform's constants). */
const ACCESS_LEVELS: readonly ContentAccessLevel[] = ['public', 'signed_in', 'members', 'tag']

/** A row's `access` as the Content API names it. */
export const isAccess = (value: unknown): value is ContentAccessLevel => (ACCESS_LEVELS as readonly unknown[]).includes(value)

const whole = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null)

/** A lesson's length as a clock: "4:50", "1:02:05"; null without one. */
export function clockOf(seconds: unknown): string | null {
  const s = whole(seconds)
  if (s === null) return null
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** A course's length in words: "1 h 1 min", "52 min"; null without one. */
export function lengthOf(seconds: unknown): string | null {
  const s = whole(seconds)
  if (s === null || s === 0) return null
  const minutes = Math.max(1, Math.round(s / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** "12 lessons", "1 lesson". */
export const lessonsOf = (count: number): string => `${count} ${count === 1 ? 'lesson' : 'lessons'}`

/** "12 lessons · 1 h 1 min", or the count alone when no lesson carries a length. */
export function countAndLength(count: number, seconds: number | null): string {
  const length = lengthOf(seconds)
  return length ? `${lessonsOf(count)} · ${length}` : lessonsOf(count)
}

export type CourseState = 'new' | 'started' | 'finished'

/** Where a visitor stands in a course: finished means every lesson they can open (ruling 10). */
export function stateOf(progress: CourseProgress): CourseState {
  if (progress.openable > 0 && progress.completed >= progress.openable) return 'finished'
  return progress.completed > 0 ? 'started' : 'new'
}

/** "38 min left", or null when no unfinished lesson carries a length. */
export function leftOf(progress: CourseProgress): string | null {
  const length = lengthOf(progress.seconds_left)
  return length ? `${length} left` : null
}

/** The organization's name, from the first lock that carries it (the Content API names it on a lock only). */
export function orgNameOf(locks: (EntryLock | null | undefined)[]): string | null {
  for (const lock of locks) if (lock?.org_name) return lock.org_name
  return null
}

/**
 * Who can watch, as D2's About this course words it: "Anyone", "Anyone
 * signed in with their email", "Members of <org>", "People in <tag>".
 */
export function whoCanWatch(access: ContentAccessLevel, orgName: string | null, tag: string | null): string {
  switch (access) {
    case 'public':
      return 'Anyone'
    case 'signed_in':
      return 'Anyone signed in with their email'
    case 'members':
      return orgName ? `Members of ${orgName}` : 'Members'
    case 'tag':
      return tag ? `People in ${tag}` : 'People the organization invites'
  }
}

/** A signed-out card's chip: what it takes to watch. */
export function accessChipOf(access: ContentAccessLevel, tag: string | null): string {
  switch (access) {
    case 'public':
      return 'Free'
    case 'signed_in':
      return 'Free with your email'
    case 'members':
      return 'For members'
    case 'tag':
      return tag ? `For ${tag} members` : 'By invitation'
  }
}

/** A lock's word on a syllabus row or a cover: "For members", "For Fall Cohort members", "Sign in to watch". */
export function lockWordOf(lock: EntryLock): string {
  if (lock.reason === 'members') return 'For members'
  if (lock.reason === 'tag') return lock.tag_label ? `For ${lock.tag_label} members` : 'By invitation'
  return 'Sign in to watch'
}

/** "Lesson 5: Decide what you want". */
export const lessonTitle = (n: number, title: string): string => `Lesson ${n}: ${title}`

/** "the Harbor letter", from the heading "The Harbor letter"; the article lowered to sit inside a sentence. */
export function inSentence(name: string): string {
  const trimmed = name.trim()
  return /^the\s/i.test(trimmed) ? `the ${trimmed.slice(4)}` : `the ${trimmed}`
}
