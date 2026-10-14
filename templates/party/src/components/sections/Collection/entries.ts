// A Collection's rows as its library, shelves and outline layouts draw them:
// each entry's title, its page on this site, its summary, its picture, and
// its first term (the one a library's chips and a shelf group by), in the
// order the bake listed them. The "See all" link to the type's index reads
// "See all <plural>" as BackGold's own Collection block words it, and only
// while there are entries to see.

import type { Section } from '@backgold/content'
import { safeHref, safeSrc } from '@backgold/astro/server'
import { linkOf, nested, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface CollectionEntry {
  title: string
  href: string | null
  summary: string | null
  image: string | null
  /** The entry's first term's label, or null when it has none. */
  term: string | null
}

export function entriesOf(section: Section): CollectionEntry[] {
  return rows(section).flatMap((row) => {
    const title = text(row.title)
    if (!title) return []
    const [first] = nested(row, 'terms')
    return [
      {
        title,
        href: safeHref(row.url, { anchors: true }),
        summary: text(row.summary),
        image: safeSrc(row.image_url),
        term: text(first?.label)?.trim() ?? null,
      },
    ]
  })
}

/** The distinct first terms, in the order they first appear. */
export function termsOf(entries: CollectionEntry[]): string[] {
  return [...new Set(entries.map((e) => e.term).filter((t): t is string => t !== null))]
}

/** The type's plural name ("Courses"), or null when the bake gave none. */
export function pluralOf(section: Section): string | null {
  return text(section.copy.pluralLabel)?.trim() ?? null
}

/** "See all courses", to the type's index; none without entries, a label or a safe address. */
export function seeAllOf(section: Section, entries: CollectionEntry[]): Link[] {
  const plural = pluralOf(section)
  const href = section.links?.[0]?.url
  const link = entries.length > 0 && plural ? linkOf(`See all ${plural.toLowerCase()}`, href) : null
  return link ? [link] : []
}
