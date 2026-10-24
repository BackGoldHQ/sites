// A ContentPost as its player and theater layouts draw it: the piece's title
// and its page on this site (/<blog base>/<slug>, as the Card layout links
// it), its date, its media, its notes and the section's links.
//
// The media is what the entry page's own layouts play: a video row's YouTube
// or Vimeo address in that player (lib/entries.ts playerOf), any other video
// in the browser's player with the hero as its poster, an audio row's file in
// the browser's audio controls beside the hero, and the hero alone when the
// piece has no media. The notes are the bake's render of the entry body
// (headings, lists, links and paragraphs), reduced to the entry editor's
// allowlist again here before the page emits them (notesOf).

import type { Section } from '@backgold/content'
import { blogBaseOf, sanitizeRichText, safeSrc } from '@backgold/astro/server'
import { basePath, playerOf } from '../../../lib/entries'
import { links, rows, type Link } from '../../../lib/section'
import { formatDay, text } from '../../../lib/format'

export type LessonMedia =
  | { kind: 'embed'; src: string }
  | { kind: 'video'; src: string; poster: string | null }
  | { kind: 'audio'; src: string; cover: string | null }
  | { kind: 'image'; src: string }

export interface Lesson {
  /** The section's own heading, drawn as a kicker over the title. */
  kicker: string | null
  title: string
  href: string | null
  /** The row's own date, for `<time datetime>`, with `day` its words; both null without a date. */
  date: string | null
  day: string | null
  media: LessonMedia | null
  /** The notes as sanitized HTML, or null when the piece has no body. */
  notes: string | null
  notesLabel: string
  links: Link[]
  /** The links' heading, or null when the operator left it blank. */
  linksHeading: string | null
}

function mediaOf(row: Record<string, unknown>): LessonMedia | null {
  const src = safeSrc(row.media_url)
  const image = safeSrc(row.image_url)
  if (src && row.media_kind === 'video') {
    const player = playerOf(src)
    return player ? { kind: 'embed', src: player } : { kind: 'video', src, poster: image }
  }
  if (src && row.media_kind === 'audio') return { kind: 'audio', src, cover: image }
  return image ? { kind: 'image', src: image } : null
}

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The body as HTML a page can emit: the bake's HTML through the allowlist, or
 * plain text as paragraphs (a blank line between them). The Prose layout
 * emits it as it is, under the section's title.
 */
export function bodyOf(value: unknown): string {
  const raw = text(value)?.trim()
  if (!raw) return ''
  return raw.startsWith('<')
    ? sanitizeRichText(raw)
    : raw
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeText(p)}</p>`)
        .join('')
}

/**
 * The notes: the body (bodyOf) with its headings moved down two levels
 * (h2 → h4, h3 → h5) to sit under the section's title (h2) and the notes'
 * own heading (h3).
 */
function notesOf(value: unknown): string {
  return bodyOf(value).replace(/<(\/?)h([23])>/g, (_, slash: string, level: string) => `<${slash}h${Number(level) + 2}>`)
}

/**
 * The body's first paragraph as plain text, whole (the layout clamps it), or
 * null when the body has none: the notes' first `<p>` that holds words, with
 * its markup gone and the sanitizer's three entities read back (a paragraph
 * holding only a picture is passed over). A plain-text body's first
 * paragraph is the text before its first blank line.
 */
export function dekOf(value: unknown): string | null {
  for (const [, inner = ''] of notesOf(value).matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const dek = inner
      .replace(/<br>/g, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
    if (dek) return dek
  }
  return null
}

/** The section's piece, or null when the bake found none (the section then draws nothing, as the Card layout does). */
export async function lessonOf(section: Section, bg: App.Locals['backgold']): Promise<Lesson | null> {
  const [row] = rows(section)
  const title = text(row?.title)
  if (!row || !title) return null
  const slug = text(row.slug)
  const base = slug && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug) && bg.setup === null ? blogBaseOf((await bg.client.types()).types) : null
  const date = text(row.date)
  const day = formatDay(date)
  const notes = notesOf(section.copy.postHtml)
  return {
    kicker: text(section.copy.heading),
    title,
    href: base ? `${basePath(base)}/${slug}` : null,
    date: day ? date : null,
    day,
    media: mediaOf(row),
    notes: notes.trim() ? notes : null,
    notesLabel: text(section.copy.notesLabel)?.trim() ?? 'Notes',
    links: links(section),
    linksHeading: text(section.copy.linksHeading)?.trim() ?? null,
  }
}
