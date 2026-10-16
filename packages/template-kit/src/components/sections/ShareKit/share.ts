// A Share kit's posts as its layouts draw them (REPORT §2 G18): the rows of
// the authored list (`share`, prop `items`), in row order, the first 12.
// Each post reads `network` (the operator's word: "X", "Facebook", "Text a
// friend"), `text` (the words a supporter posts, any address written into
// them), `href` (where the row's link goes: the network's compose or share
// page, or a page to open) and `imageUrl` (the graphic). A row without text
// is not a post. Copy and Share carry the text alone: the href is only the
// link's address and is never copied or shared.
//
// Addresses are checked as the siblings check theirs: a graphic with an
// unsafe or missing address is left out, and so is a link. There are no
// counts here and nothing about who shared: the kit is words and pictures
// a visitor carries off on their own device.

import type { Section } from '@backgold/content'
import { relFor, safeHref, safeSrc } from '@backgold/astro/server'
import { rows } from '../../../lib/section'
import { text } from '../../../lib/format'

const MAX = 12

export interface Post {
  network: string | null
  text: string
  /** Where the row's link goes, checked. */
  href: string | null
  rel: 'noopener' | undefined
  /** The graphic's checked address. */
  image: string | null
  /** The words a screen reader hears after "Copy" and "Share": "the X post", "post 3". */
  name: string
  /** The hidden words after the link's visible "Open": " on X", or " the link for post 3" with no network. */
  openHint: string
}

/** The section's posts in row order: the first 12 rows that have text. */
export function postsOf(section: Section): Post[] {
  return rows(section)
    .flatMap((row) => {
      const words = text(row.text)?.trim()
      if (!words) return []
      const network = text(row.network)?.trim() ?? null
      const href = safeHref(row.href)
      return [{ network, text: words, href, rel: href ? relFor(href) : undefined, image: safeSrc(row.imageUrl) }]
    })
    .slice(0, MAX)
    .map((post, i) => ({
      ...post,
      name: post.network ? `the ${post.network} post` : `post ${i + 1}`,
      openHint: post.network ? ` on ${post.network}` : ` the link for post ${i + 1}`,
    }))
}

/** The Copy and Share buttons' words: the section's own, or "Copy" and "Share". */
export function labelsOf(section: Section): { copy: string; share: string } {
  return {
    copy: text(section.copy.copyLabel)?.trim() ?? 'Copy',
    share: text(section.copy.shareLabel)?.trim() ?? 'Share',
  }
}
