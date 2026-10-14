// A Stories section as its layouts draw it. Two things are read:
//
// - the featured story, from the section's copy, media and links: `label`
//   (the chip over it, "Featured story"), `title`, `summary`, `status` and
//   `outcome`, the picture (`imageUrl`), the read link (`readLabel` →
//   `readHref`) and the watch link (`watchLabel` → `watchHref`). The
//   Spotlight layout draws it; there is no featured story without a title.
// - the stories in the authored list (`stories`), in row order: `label` (a
//   tag, or the year on the Timeline), `title`, `body`, `status`, `tone`
//   ('won' | 'progress' | 'lost' | 'none'), `imageUrl` and `href`. A row
//   without a title is not a story.
//
// A tone is not a colour: it says how the status word is set (the accent
// chip for a win, a plain chip in progress, a muted outline for a loss, the
// bare word for none). A missing or unknown tone reads as 'none', and a tone
// with no status word draws nothing.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { links, linkOf, media, rows, type Link, type Media } from '../../../lib/section'
import { text } from '../../../lib/format'

const TONES = ['won', 'progress', 'lost', 'none'] as const
export type Tone = (typeof TONES)[number]

export interface Story {
  label: string | null
  title: string
  /** The title's link, when the row has a safe address for it. */
  link: Link | null
  body: string | null
  status: string | null
  tone: Tone
  photo: string | null
}

export interface Featured {
  label: string | null
  title: string
  summary: string | null
  status: string | null
  outcome: string | null
  picture: Media | null
  read: Link | null
  watch: Link | null
}

/** The section's stories in row order: the rows that have a title. */
export function storiesOf(section: Section): Story[] {
  return rows(section).flatMap((row) => {
    const title = text(row.title)?.trim()
    if (!title) return []
    const tone = text(row.tone)?.trim().toLowerCase()
    return [
      {
        label: text(row.label)?.trim() ?? null,
        title,
        link: linkOf(title, row.href),
        body: text(row.body),
        status: text(row.status)?.trim() ?? null,
        tone: TONES.find((t) => t === tone) ?? 'none',
        photo: safeSrc(row.imageUrl),
      },
    ]
  })
}

/**
 * The featured story, or null without a title. A link the projection left
 * out (no label, no address, an unsafe one) is simply absent, so the two are
 * told apart by their labels, not their places: the watch link is the one
 * labelled `watchLabel`, the read link any other.
 */
export function featuredOf(section: Section): Featured | null {
  const title = text(section.copy.title)?.trim()
  if (!title) return null
  const watchLabel = text(section.copy.watchLabel)
  const readLabel = text(section.copy.readLabel)
  const found = links(section)
  const watch = found.find((l) => l.label === watchLabel && l.label !== readLabel) ?? (found.length > 1 ? found[1]! : null)
  const read = found.find((l) => l !== watch) ?? null
  return {
    label: text(section.copy.label)?.trim() ?? null,
    title,
    summary: text(section.copy.summary),
    status: text(section.copy.status)?.trim() ?? null,
    outcome: text(section.copy.outcome)?.trim() ?? null,
    picture: media(section, 'imageUrl'),
    read,
    watch,
  }
}

/** A label that is a year ("2024"), for `<time datetime>`; null for a tag. */
export function yearOf(label: string | null): string | null {
  return label && /^\d{4}$/.test(label) ? label : null
}
