// A platform's sections and planks with the anchors the longread and columns
// layouts write, so a link to a plank lands whichever layout the page draws.
// Anchors read as words ("#plank-a-levy-needs-a-ballot") so a shared link says
// what it points at; a repeat gets a number, and a section or plank with no
// words is numbered by its place ("#platform-2", "#plank-2-1"). A section is
// kept when it has a title or a plank with a headline; a plank when it has a
// headline. A section's `num` is the row's own ("01"), else its place in the
// list written the same way, so the jump list and the headings count the
// sections (boards A2 and C3) whether or not the author typed numbers.

import type { Section } from '@backgold/content'
import { nested, rows } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Plank {
  id: string
  headline: string
  plain: string | null
  /** The plank's full text as BackGold sends it, for Prose. */
  full: unknown
}

export interface Part {
  id: string
  /** "01": the row's own number, else its place in the list. */
  num: string
  title: string | null
  ethos: string | null
  planks: Plank[]
}

export function partsWithAnchors(section: Section): Part[] {
  const taken = new Set<string>()
  const anchor = (prefix: string, words: string | null, fallback: string) => {
    const slug =
      (words ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || fallback
    let id = `${prefix}-${slug}`
    for (let n = 2; taken.has(id); n++) id = `${prefix}-${slug}-${n}`
    taken.add(id)
    return id
  }

  return rows(section)
    .map((row, i) => {
      const num = text(row.num) ?? String(i + 1).padStart(2, '0')
      const title = text(row.title)
      return {
        id: anchor('platform', title, String(i + 1)),
        num,
        title,
        ethos: text(row.ethos),
        planks: nested(row, 'planks')
          .map((p, j) => {
            const headline = text(p.headline)
            return { id: anchor('plank', headline, `${i + 1}-${j + 1}`), headline, plain: text(p.plain), full: p.full }
          })
          .filter((p): p is Plank => !!p.headline),
      }
    })
    .filter((part) => part.title || part.planks.length > 0)
}
