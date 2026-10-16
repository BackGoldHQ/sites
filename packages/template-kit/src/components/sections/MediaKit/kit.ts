// A MediaKit section as its layouts draw it: what a booker or a reporter
// needs about one person or organization. The copy carries the name
// (`heading`), the line under it (`role`), the two bios, the facts line and
// the words of the talks heading and the contact card; the media its
// headshot (`imageUrl`). The Content API sends the two links without their
// keys, so each is told apart by its label, as VoterTools does: the one
// labelled with `bookLabel` is the booking link, the one labelled with
// `kitLabel` the press kit.
//
// The authored list (`mediakit`) holds rows of four kinds, in row order:
//   asset       a download (`title`, `detail` "JPG · 2 MB", `href`)
//   talk        a talk the person gives (`title`, `detail` "45 min keynote")
//   appearance  a past appearance (`outlet`, else `title`; `href`)
//   mention     a press mention (`outlet`, `title`, `detail`, `date`, `href`)
// A row of no known kind is left out, as is a row with nothing to name it
// by: an appearance needs an outlet or a title, the others a title. A
// `date` is kept only when it is a calendar day (YYYY-MM-DD).

import type { Section } from '@backgold/content'
import { safeHref } from '@backgold/astro/server'
import { linkOf, media, rows, type Link, type Media } from '../../../lib/section'
import { formatDay, text } from '../../../lib/format'

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

export interface KitRow {
  /** The row's title, or for an appearance with none, its outlet. */
  title: string
  detail: string | null
  outlet: string | null
  /** The row's YYYY-MM-DD, for `<time datetime>`; null when it has no usable date. */
  day: string | null
  /** "March 14, 2026" */
  dayLabel: string | null
  /** The row's link, named by its title, when it has a safe address. */
  link: Link | null
}

export interface MediaKit {
  kicker: string | null
  heading: string | null
  role: string | null
  facts: string | null
  talksHeading: string | null
  contactHeading: string | null
  contactLine: string | null
  photo: Media | null
  book: Link | null
  kit: Link | null
  assets: KitRow[]
  talks: KitRow[]
  appearances: KitRow[]
  mentions: KitRow[]
}

export function mediaKitOf(section: Section): MediaKit {
  const copy = section.copy
  const bookLabel = text(copy.bookLabel)
  const kitLabel = text(copy.kitLabel)
  let book: Link | null = null
  let kit: Link | null = null
  for (const raw of section.links ?? []) {
    const link = linkOf(raw.label, raw.url)
    if (!link) continue
    if (!book && link.label === bookLabel) book = link
    else if (!kit && link.label === kitLabel) kit = link
  }
  const found: Record<'asset' | 'talk' | 'appearance' | 'mention', KitRow[]> = { asset: [], talk: [], appearance: [], mention: [] }
  for (const row of rows(section)) {
    const kind = row.kind
    if (kind !== 'asset' && kind !== 'talk' && kind !== 'appearance' && kind !== 'mention') continue
    const outlet = text(row.outlet)?.trim() ?? null
    const title = text(row.title)?.trim() ?? (kind === 'appearance' ? outlet : null)
    if (!title) continue
    const raw = text(row.date)?.trim() ?? null
    const day = raw && CALENDAR_DAY.test(raw) && formatDay(raw) ? raw : null
    found[kind].push({
      title,
      detail: text(row.detail)?.trim() ?? null,
      outlet,
      day,
      dayLabel: formatDay(day),
      link: linkOf(title, row.href),
    })
  }
  return {
    kicker: text(copy.kicker),
    heading: text(copy.heading),
    role: text(copy.role),
    facts: text(copy.facts),
    talksHeading: text(copy.talksHeading),
    contactHeading: text(copy.contactHeading),
    contactLine: text(copy.contactLine),
    photo: media(section, 'imageUrl'),
    book,
    kit,
    assets: found.asset,
    talks: found.talk,
    appearances: found.appearance,
    mentions: found.mention,
  }
}

/** The number of words in a bio, its markup dropped: the bio card's "48 words". */
export function wordCount(value: unknown): number {
  const raw = text(value)
  if (!raw) return 0
  return raw.replace(/<[^>]*>/g, ' ').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

export interface ContactPart {
  text: string
  /** A mailto: address for an email, the address itself for a URL; null for plain words. */
  href: string | null
}

// An email address, or an http(s) address up to the next space.
const CONTACT_ADDRESS = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s<>"]+)/gi

/**
 * The contact line in parts: each email address a mailto: link, each web
 * address a link (trailing punctuation left outside it), the words between
 * as they were written.
 */
export function contactParts(line: string): ContactPart[] {
  const parts: ContactPart[] = []
  let at = 0
  for (const match of line.matchAll(CONTACT_ADDRESS)) {
    let found = match[0]
    if (match[2]) found = found.replace(/[.,;:!?)\]]+$/, '')
    const start = match.index ?? 0
    const href = safeHref(match[1] ? `mailto:${found}` : found)
    if (!href) continue
    if (start > at) parts.push({ text: line.slice(at, start), href: null })
    parts.push({ text: found, href })
    at = start + found.length
  }
  if (at < line.length) parts.push({ text: line.slice(at), href: null })
  return parts
}
