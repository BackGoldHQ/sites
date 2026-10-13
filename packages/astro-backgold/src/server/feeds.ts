import type { BackgoldContent, ContentTypeSummary, Entry } from '@backgold/content'
import { absoluteUrl, blogBaseOf, isBlogType, isoDate, listIndexPath, siteName, writtenBy, xmlEscape } from './format.js'

/** Entries per feed. */
const FEED_SIZE = 50

/** An Atom feed's `updated` when it has no entries to date it by. */
const NEVER = new Date(0).toISOString()

const time = (entry: Entry): number => Date.parse(entry.publish_at ?? entry.updated_at) || 0

/** The newest entries of the types, merged by date. */
async function newest(bg: BackgoldContent, types: ContentTypeSummary[]): Promise<Entry[]> {
  const pages = await Promise.all(types.map((t) => bg.entries(t.key, { limit: FEED_SIZE })))
  return pages
    .flatMap((page) => page?.entries ?? [])
    .sort((a, b) => time(b) - time(a))
    .slice(0, FEED_SIZE)
}

/**
 * An Atom feed of a routable type's entries, or of the blog types merged
 * (`'blog'`: its home is `/feed.xml`, whichever address asked, and its HTML
 * page is the blog base's list).
 */
export async function atomFeed(bg: BackgoldContent, siteUrl: string, type: ContentTypeSummary | 'blog'): Promise<string> {
  const [{ site }, all] = await Promise.all([bg.site(), type === 'blog' ? bg.types().then((r) => r.types) : [type]])
  const types = type === 'blog' ? all.filter(isBlogType) : all
  const index = listIndexPath(type, type === 'blog' ? (blogBaseOf(all) ?? undefined) : undefined) ?? ''
  const self = type === 'blog' ? `${siteUrl}/feed.xml` : `${siteUrl}${index}/feed.xml`
  const name = siteName(site)
  const title = type === 'blog' ? name : `${type.plural_label} · ${name}`

  const entries: string[] = []
  let updated: string | null = null
  for (const entry of await newest(bg, types)) {
    const url = absoluteUrl(entry.url, siteUrl)
    const entryUpdated = isoDate(entry.updated_at)
    if (!url || !entryUpdated) continue
    if (!updated || entryUpdated > updated) updated = entryUpdated
    const published = isoDate(entry.publish_at)
    const lines = [
      '  <entry>',
      `    <id>${xmlEscape(url)}</id>`,
      `    <title>${xmlEscape(entry.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${xmlEscape(url)}"/>`,
      `    <updated>${entryUpdated}</updated>`,
    ]
    if (published) lines.push(`    <published>${published}</published>`)
    for (const author of writtenBy(entry.authors)) lines.push(`    <author><name>${xmlEscape(author.display_name)}</name></author>`)
    if (entry.summary) lines.push(`    <summary>${xmlEscape(entry.summary)}</summary>`)
    lines.push('  </entry>')
    entries.push(lines.join('\n'))
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${xmlEscape(self)}</id>`,
    `  <title>${xmlEscape(title)}</title>`,
    `  <updated>${updated ?? NEVER}</updated>`,
    `  <link rel="self" type="application/atom+xml" href="${xmlEscape(self)}"/>`,
    `  <link rel="alternate" type="text/html" href="${xmlEscape(`${siteUrl}${index || '/'}`)}"/>`,
    `  <author><name>${xmlEscape(name)}</name></author>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n')
}
