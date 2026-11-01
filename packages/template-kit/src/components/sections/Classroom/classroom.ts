// A Classroom's courses as its grid and list layouts draw them (board D1).
//
// The courses come from the section's data rows (the bake's `courses`
// source: public, cached, the same for every reader) or, on the courses list
// page, from `GET /courses`. Neither knows who is reading. While a visitor is
// signed in, `GET /courses` read as that visitor (lib/visitor.ts) lays each
// course's progress and lock over its card, matched by slug; signed out, a
// card says what it takes to watch instead of drawing a bar that would
// always read zero.

import type { Section } from '@backgold/content'
import type { ContentAccessLevel, CourseProgress, CourseSummary, EntryLock, Visitor } from '#contract/content-api'
import { safeHref, safeSrc, signInHref } from '@backgold/astro/server'
import { rows } from '../../../lib/section'
import { text } from '../../../lib/format'
import { isAccess, stateOf } from '../../../lib/academy'
import { academyReads } from '../../../lib/visitor'

/**
 * One row of a Classroom section's data as the bake sends it: flat, like a
 * Collection's rows, with no progress and no lock detail (those come from
 * the visitor's own read).
 */
export interface ClassroomRow {
  slug: string
  title: string
  summary: string | null
  url: string | null
  hero_url: string | null
  lesson_count: number
  total_seconds: number | null
  access: ContentAccessLevel
  locked: boolean
}

export interface CourseCard {
  slug: string
  title: string
  summary: string | null
  href: string | null
  cover: string | null
  lessons: number
  seconds: number | null
  access: ContentAccessLevel
  locked: boolean
  lock: EntryLock | null
  /** This visitor's place in the course; null signed out. */
  progress: CourseProgress | null
}

export interface Classroom {
  kicker: string | null
  heading: string | null
  cards: CourseCard[]
  visitor: Visitor | null
  /** The organization's name, for a members card's "Join <org> to start this course." */
  orgName: string | null
  /** "You have finished 1 of 6 courses and have 3 under way.", with a visitor and a course. */
  summary: { finished: number; total: number; started: number } | null
  /** The sign-in door, back to this page; signed out only. */
  signIn: string | null
}

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0)
const seconds = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)

function cardOfRow(row: { [K in keyof ClassroomRow]?: unknown }): CourseCard | null {
  const title = text(row.title)
  const slug = text(row.slug)
  if (!title || !slug) return null
  return {
    slug,
    title,
    summary: text(row.summary),
    href: safeHref(row.url),
    cover: safeSrc(row.hero_url),
    lessons: count(row.lesson_count),
    seconds: seconds(row.total_seconds),
    access: isAccess(row.access) ? row.access : 'public',
    locked: row.locked === true,
    lock: null,
    progress: null,
  }
}

function cardOfSummary(course: CourseSummary): CourseCard {
  return {
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    href: safeHref(course.url),
    cover: course.hero ? safeSrc(course.hero.url) : null,
    lessons: course.lesson_count,
    seconds: course.total_seconds,
    access: course.access,
    locked: course.locked,
    lock: course.lock,
    progress: course.progress,
  }
}

/**
 * The section's classroom. `from: 'rows'` draws the section's data rows (a
 * Classroom placed on a page); `from: 'read'` reads `GET /courses` (the
 * courses list page, which has no baked rows).
 */
export async function classroomOf(
  section: Section,
  astro: { locals: App.Locals; url: URL },
  from: 'rows' | 'read' = 'rows',
): Promise<Classroom> {
  const reads = academyReads(astro)
  const { visitor } = reads
  let cards: CourseCard[]
  if (from === 'read') {
    cards = ((await reads.courses())?.courses ?? []).map(cardOfSummary)
  } else {
    cards = rows(section).flatMap((row) => cardOfRow(row) ?? [])
    if (visitor && cards.length > 0) {
      const mine = new Map(((await reads.courses())?.courses ?? []).map((c) => [c.slug, c]))
      cards = cards.map((card) => {
        const own = mine.get(card.slug)
        return own ? { ...card, locked: own.locked, lock: own.lock, progress: own.progress } : card
      })
    }
  }
  const tracked = visitor ? cards.filter((c) => !c.locked && c.progress) : []
  const states = tracked.map((c) => stateOf(c.progress!))
  return {
    kicker: text(section.copy.kicker),
    heading: text(section.copy.heading),
    cards,
    visitor,
    orgName: reads.orgName,
    summary:
      visitor && cards.length > 0
        ? { finished: states.filter((s) => s === 'finished').length, total: cards.length, started: states.filter((s) => s === 'started').length }
        : null,
    signIn: visitor ? null : signInHref(astro.url.pathname),
  }
}
