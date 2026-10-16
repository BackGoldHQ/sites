// Reading a section from the Content API: its rows, media and links, each
// address already checked.

import type { Entry, Section } from '@backgold/content'
import { relFor, safeHref, safeSrc } from '@backgold/astro/server'
import { text } from './format'

export type Row = Record<string, unknown>

/** `data.items` rows that are objects. */
export function rows(section: Section): Row[] {
  return (section.data?.items ?? []).filter((item): item is Row => !!item && typeof item === 'object' && !Array.isArray(item))
}

/** An array field of a row, as rows. */
export function nested(row: Row, key: string): Row[] {
  const value = row[key]
  return Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === 'object' && !Array.isArray(item)) : []
}

export interface Media {
  url: string
  alt: string
}

/** The first of `keys` the section has media for, with a safe address. */
export function media(section: Section, ...keys: string[]): Media | null {
  for (const key of keys) {
    const m = section.media?.[key]
    const url = m ? safeSrc(m.url) : null
    if (url) return { url, alt: typeof m?.alt === 'string' ? m.alt : '' }
  }
  return null
}

/**
 * A Hero's photo: the first of `keys` the section has media for, its alt text
 * the section's `copy.imageAlt` (empty when the section has none).
 */
export function heroPhoto(section: Section, ...keys: string[]): Media | null {
  const m = media(section, ...keys)
  return m ? { url: m.url, alt: text(section.copy.imageAlt) ?? '' } : null
}

export interface Link {
  label: string
  href: string
  rel: 'noopener' | undefined
}

/** A link with a label and a safe address, or null. */
export function linkOf(label: unknown, href: unknown): Link | null {
  const name = text(label)
  const safe = safeHref(href, { anchors: true })
  return name && safe ? { label: name, href: safe, rel: relFor(safe) } : null
}

/** The section's links, unsafe ones left out. */
export function links(section: Section): Link[] {
  return (section.links ?? []).map((l) => linkOf(l.label, l.url)).filter((l): l is Link => l !== null)
}

/** A card for an entry: what EntryCard shows. */
export interface Card {
  title: string
  href: string | null
  summary: string | null
  image: Media | null
  /** The entry's category, drawn as a chip: a `category` term first, else its first term. */
  category: string | null
  date: string | null
  /** What the card says under its summary, before the day it was published. */
  meta: string | null
}

export function entryCard(entry: Entry): Card {
  const image = entry.hero ? safeSrc(entry.hero.url) : null
  const category = entry.terms.find((t) => t.taxonomy === 'category') ?? entry.terms[0]
  return {
    title: entry.title,
    href: entry.url ? safeHref(entry.url) : null,
    summary: entry.summary,
    image: image ? { url: image, alt: '' } : null,
    category: category?.label ?? null,
    date: entry.publish_at,
    meta: null,
  }
}

/** A page opens with a Hero that has a headline: that headline is its <h1>, and the Hero leads the page. */
export function leadsWithHero(sections: Section[]): boolean {
  const first = sections[0]
  return first?.type === 'Hero' && text(first.copy.headline) !== null
}
