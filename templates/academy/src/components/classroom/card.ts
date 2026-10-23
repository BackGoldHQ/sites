// What a course says on the classroom (board K2), for its card in the grid
// and its row in the list. Signed in, on a course the visitor can open:
// the disc with the ring (or the check once finished), the words of their
// place ("4 of 12 lessons", "Not started · 9 lessons") or the Finished
// chip with "7 of 7", and the word that opens it (Continue, Start).
// Signed out: the chip of what it takes to watch, in gold when an email
// will do ("Free with your email", "Free") and quiet with the lock
// otherwise ("For members"), and the count ("12 lessons"). On a course a
// visitor cannot open: the lock disc, the lock's word as the quiet chip,
// the count, and for a members course "Join <org> to start this course.".

import type { CourseProgress } from '@backgold/contract/content-api'
import type { CourseCard } from '@backgold/template-kit/components/sections/Classroom/classroom.ts'
import { accessChipOf, lessonsOf, lockWordOf, stateOf } from '@backgold/template-kit/lib/academy'

export interface CardWords {
  /** The visitor's course progress, for the bar along the cover's foot; null signed out or locked. */
  tracked: CourseProgress | null
  disc: { state: 'progress' | 'finished' | 'locked'; completed: number; total: number } | null
  chip: { label: string; tone: 'gold' | 'quiet'; icon: 'check' | 'lock' | null } | null
  /** The words of the visitor's place, or the count. */
  meta: string | null
  /** The word that opens the course, drawn with an arrow. */
  action: 'Continue' | 'Start' | null
  join: string | null
}

export function cardWords(card: CourseCard, signedIn: boolean, orgName: string | null): CardWords {
  const tracked = signedIn && !card.locked && card.progress ? card.progress : null
  const count = lessonsOf(card.lessons)
  if (tracked) {
    const state = stateOf(tracked)
    const disc = { state: state === 'finished' ? ('finished' as const) : ('progress' as const), completed: tracked.completed, total: tracked.total }
    if (state === 'finished') {
      return { tracked, disc, chip: { label: 'Finished', tone: 'gold', icon: 'check' }, meta: `${tracked.completed} of ${tracked.total}`, action: null, join: null }
    }
    if (state === 'new') {
      return { tracked, disc, chip: null, meta: `Not started · ${count}`, action: 'Start', join: null }
    }
    return { tracked, disc, chip: null, meta: `${tracked.completed} of ${lessonsOf(tracked.total)}`, action: 'Continue', join: null }
  }
  if (signedIn && card.locked) {
    const join = card.lock?.reason === 'members' ? (orgName ? `Join ${orgName} to start this course.` : 'Join to start this course.') : null
    return {
      tracked: null,
      disc: { state: 'locked', completed: 0, total: card.lessons },
      chip: { label: card.lock ? lockWordOf(card.lock) : accessChipOf(card.access, null), tone: 'quiet', icon: 'lock' },
      meta: count,
      action: null,
      join,
    }
  }
  const open = card.access === 'public' || card.access === 'signed_in'
  return {
    tracked: null,
    disc: null,
    chip: { label: accessChipOf(card.access, card.lock?.tag_label ?? null), tone: open ? 'gold' : 'quiet', icon: open ? null : 'lock' },
    meta: count,
    action: null,
    join: null,
  }
}
