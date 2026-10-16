// A Pathways section's rows as its layouts draw them: one pathway per row
// that has a title, in the organization's order (eight at most, as the
// catalogue allows). A pathway carries its line about who it is for, what
// the visitor leaves with, the address of its programs, its programs (each
// string one program; a " · " in it splits the program's name from its
// detail, "Deciding to run · 45 min") and the statements a visitor would say
// about themselves (`fits`), which the quiz offers as answers. The outcome is
// drawn after a bold "Leave with:", so an outcome typed with that label
// already in front ("Leave with: a filing plan") loses it rather than saying
// it twice. A row's `icon` is a name the template has no drawing for, so it
// is not drawn.

import type { Section } from '@backgold/content'
import { linkOf, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

const MAX = 8
/** The quiz's rounds: one statement per pathway in each. */
const ROUNDS = 3
const LEAVE_WITH = /^\s*leave with\s*[:\-–—]\s*/i

export interface Program {
  name: string
  /** What follows the first " · ": "45 min", "Full day · Austin". */
  detail: string | null
}

export interface Pathway {
  /** "1", "2", … in row order: what a tab, a choice and a result are matched by. */
  key: string
  title: string
  summary: string | null
  outcome: string | null
  link: Link | null
  programs: Program[]
  fits: string[]
}

export interface Choice {
  key: string
  statement: string
}

/** The text strings of an array field, blanks left out. */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((s): s is string => s !== null).map((s) => s.trim()) : []
}

function programOf(value: string): Program {
  const at = value.indexOf(' · ')
  if (at === -1) return { name: value, detail: null }
  const name = value.slice(0, at).trim()
  const detail = value.slice(at + 3).trim()
  return name ? { name, detail: detail || null } : { name: detail, detail: null }
}

export function pathwaysOf(section: Section): Pathway[] {
  return rows(section)
    .flatMap((row) => {
      const title = text(row.title)?.trim()
      if (!title) return []
      const outcome = text(row.outcome)?.replace(LEAVE_WITH, '').trim() || null
      return [
        {
          key: '',
          title,
          summary: text(row.summary),
          outcome,
          link: linkOf(title, row.href),
          programs: strings(row.programs).map(programOf),
          fits: strings(row.fits),
        },
      ]
    })
    .slice(0, MAX)
    .map((p, i) => ({ ...p, key: String(i + 1) }))
}

/**
 * The quiz's rounds: round r offers the r-th statement of every pathway that
 * has one, starting each round one pathway further along the list so the
 * first answer is not always the same pathway's. A round with fewer than two
 * statements offers no choice and is left out; with no round left there is
 * no quiz.
 */
export function roundsOf(pathways: Pathway[]): Choice[][] {
  const rounds: Choice[][] = []
  for (let r = 0; r < ROUNDS; r++) {
    const offered = pathways.filter((p) => p.fits[r]).map((p) => ({ key: p.key, statement: p.fits[r] }))
    if (offered.length < 2) continue
    const turn = rounds.length % offered.length
    rounds.push([...offered.slice(turn), ...offered.slice(0, turn)])
  }
  return rounds
}

/** An id for an element of this section, unique on the page. */
export function idFor(section: Section, suffix: string): string {
  return `${section.id}-${suffix}`.replace(/[^A-Za-z0-9_-]/g, '-')
}
