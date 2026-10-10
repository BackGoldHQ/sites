// What every Blog layout lists: the newest entries of the types /blog lists
// (posts, podcasts, videos: the built-in types that share it, never one with
// an address of its own like the newsletter), newest first. The section
// carries no rows of its own; its `maxItems` caps the count, else the
// layout's own number.

import type { Entry, Section } from '@backgold/content'
import { safeHref, safeSrc } from '@backgold/astro/server'
import { sharesBlog } from '../../../lib/entries'
import { formatDay, formatShortDay, listOf } from '../../../lib/format'
import { initials } from '../CandidateRoster/candidates'

/** The section's `maxItems` when set, else `fallback`. */
export function shownOf(section: Section, fallback: number): number {
  const max = section.options?.maxItems
  return typeof max === 'number' && Number.isFinite(max) && max > 0 ? Math.floor(max) : fallback
}

export async function latestEntries(bg: App.Locals['backgold'], count: number): Promise<Entry[]> {
  if (bg.setup !== null) return []
  const { types } = await bg.client.types()
  const blogTypes = types.filter(sharesBlog)
  const lists = await Promise.all(blogTypes.map((t) => bg.client.entries(t.key, { limit: count })))
  return lists
    .flatMap((list) => list?.entries ?? [])
    .sort((a, b) => (b.publish_at ?? '').localeCompare(a.publish_at ?? ''))
    .slice(0, count)
}

/** One post as the Lead story and List layouts draw it. */
interface Story {
  title: string
  href: string | null
  summary: string | null
  /** The cover, decorative: the title beside it says what the post is. */
  image: string | null
  /** The post's category (its first term, a `category` term first). */
  category: string | null
  date: string | null
  day: string | null
  /** "Oct 2", the date as the Lead story's bylines show it. */
  shortDay: string | null
  /** "A and B", the post's authors. */
  byline: string | null
  /** The first author's picture, else their initials ("CP"); null without an author. */
  avatar: { url: string | null; initials: string } | null
}

export function storyOf(entry: Entry): Story {
  const category = entry.terms.find((t) => t.taxonomy === 'category') ?? entry.terms[0]
  const named = entry.authors.filter((a) => a.display_name && a.display_name.trim() !== '')
  const authors = named.map((a) => a.display_name)
  const first = named[0]
  return {
    title: entry.title,
    href: entry.url ? safeHref(entry.url) : null,
    summary: entry.summary,
    image: entry.hero ? safeSrc(entry.hero.url) : null,
    category: category?.label ?? null,
    date: entry.publish_at,
    day: formatDay(entry.publish_at),
    shortDay: formatShortDay(entry.publish_at),
    byline: authors.length > 0 ? listOf(authors) : null,
    avatar: first ? { url: safeSrc(first.avatar_url), initials: initials(first.display_name) } : null,
  }
}
