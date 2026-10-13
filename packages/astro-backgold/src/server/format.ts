// Escaping and addresses shared by the SEO routes, the feeds and the head.

import type { ContentTypeSummary, EntryAuthor } from '@backgold/content'

// Characters XML 1.0 cannot carry at all, escaped or not.
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Text or an attribute value for an XML document. */
export function xmlEscape(value: string): string {
  return value
    .replace(NOT_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** One line of text: every run of whitespace, newlines included, is one space. */
export const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** Markdown inline text that reads literally: no emphasis, link, code or HTML. */
export function markdownText(value: string): string {
  return oneLine(value).replace(/[\\`*_[\]<>#|!]/g, (c) => `\\${c}`)
}

/**
 * A whole markdown line of authored text that reads literally: `markdownText`,
 * `&` escaped so no entity decodes, `<` and `>` as entities so neither
 * appears raw, and whatever would start a block at the line's head (a list
 * marker, a numbered item, a fence, a setext underline) or read as one of
 * `labels` (`URL:` …) escaped.
 */
export function markdownLine(value: string, labels: readonly string[] = []): string {
  const line = markdownText(value)
    .replace(/&/g, '\\&')
    .replace(/\\</g, '&lt;')
    .replace(/\\>/g, '&gt;')
    .replace(/^(\d{1,9})([.)])/, '$1\\$2')
    .replace(/^([-+=~])/, '\\$1')
  const label = /^([A-Za-z]+):/.exec(line)
  return label && labels.includes(label[1]!) ? `${label[1]}\\:${line.slice(label[0].length)}` : line
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** HTML or plain text as plain text lines: scripts and styles dropped with their content, tags dropped, block ends kept as line breaks, common entities decoded. */
export function htmlToTextLines(html: string): string[] {
  return html
    .replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<(?:br|\/?(?:p|div|li|ul|ol|h[1-6]|blockquote|tr|section|article))\b[^>]*>/gi, '\n')
    .replace(/<\/?[A-Za-z!?/][^>]*>?/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, name: string) => ENTITIES[name]!)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** A URL inside a markdown link's parentheses. */
export const markdownUrl = (url: string): string => url.replace(/[\s()<>]/g, (c) => encodeURIComponent(c))

/** A site-relative path (`/…`, never `//host`), its query and fragment kept. */
export function sitePath(raw: string): string | null {
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  try {
    const url = new URL(raw, 'https://site.invalid')
    return url.host === 'site.invalid' ? `${url.pathname}${url.search}${url.hash}` : null
  } catch {
    return null
  }
}

/** An absolute http(s) URL as is, a site-relative path on `siteUrl`, anything else null. */
export function absoluteUrl(raw: string | null | undefined, siteUrl: string): string | null {
  if (!raw) return null
  const path = sitePath(raw)
  if (path !== null) return `${siteUrl}${path}`
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/** A timestamp as an RFC 3339 / W3C date-time in UTC, or null when it is not one. */
export function isoDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const time = Date.parse(raw)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/**
 * The address the blog types listed under before it was the organization's
 * own: what an api older than `@backgold/astro` 0.4 reports as their
 * `url_base`, with no `index` beside it.
 */
const LEGACY_BLOG_BASE = 'blog'

/**
 * Whether a type is one of the blog types, which list together (post, podcast
 * and video): the api names their shared list with `index: 'blog'`. An api
 * that reports no `index` at all (older than this package) is read by its
 * old rule: a routable built-in that reports `blog` as its url_base, or none.
 * A built-in with an address of its own (the newsletter, at `newsletters`)
 * lists alone, like a custom type.
 */
export function isBlogType(type: ContentTypeSummary): boolean {
  const index = (type as { index?: ContentTypeSummary['index'] }).index
  if (index !== undefined) return index === 'blog'
  return type.built_in && type.routable && (type.url_base ?? LEGACY_BLOG_BASE) === LEGACY_BLOG_BASE
}

/**
 * The blog types' shared address, without slashes (`news`, or `blog` on an
 * organization that kept it): the url_base the blog types report, the post
 * type's first. Null when the site has no blog type.
 */
export function blogBaseOf(types: readonly ContentTypeSummary[]): string | null {
  const group = types.filter(isBlogType)
  const lead = group.find((t) => t.key === 'post') ?? group[0]
  return lead ? (lead.url_base ?? LEGACY_BLOG_BASE) : null
}

/**
 * A list's address without slashes: the blog types' merged list (`'blog'`) at
 * `base`, the blog base (the legacy `blog` when it is not given); any other
 * routable type at its url_base (a blog type's is the blog base); null for a
 * type with no pages of its own.
 */
export function listBase(type: ContentTypeSummary | 'blog', base?: string): string | null {
  if (type === 'blog') return base ?? LEGACY_BLOG_BASE
  if (!type.routable) return null
  return type.url_base ?? (isBlogType(type) ? LEGACY_BLOG_BASE : null)
}

/** A list's path (`/<listBase>`), or null when the type has no pages of its own. */
export function listIndexPath(type: ContentTypeSummary | 'blog', base?: string): string | null {
  const segment = listBase(type, base)
  return segment === null ? null : `/${encodeURIComponent(segment)}`
}

/** What an address is called where nothing names it: capitalised, a hyphen read as a space (`news` is "News", `press-room` "Press room"). */
export function baseLabel(base: string): string {
  const words = base.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The bylines that name an author of the work, not its editor or photographer. */
export const writtenBy = (authors: EntryAuthor[]): EntryAuthor[] =>
  authors.filter((a) => a.role === 'Written by' || a.role === 'Interview by')

/** What the site is called: its name, else its domain. */
export const siteName = (site: { name: string | null; domain: string }): string => site.name ?? site.domain
