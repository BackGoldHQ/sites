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

/** Whether a type's entries live under `/blog` (the routable built-ins). */
export const isBlogType = (type: ContentTypeSummary): boolean => type.built_in && type.routable

/** A routable type's index path, or null when the type has no pages of its own. */
export function typeIndexPath(type: ContentTypeSummary | 'blog'): string | null {
  if (type === 'blog' || isBlogType(type)) return '/blog'
  if (!type.routable || !type.url_base) return null
  return `/${encodeURIComponent(type.url_base)}`
}

/** The bylines that name an author of the work, not its editor or photographer. */
export const writtenBy = (authors: EntryAuthor[]): EntryAuthor[] =>
  authors.filter((a) => a.role === 'Written by' || a.role === 'Interview by')

/** What the site is called: its name, else its domain. */
export const siteName = (site: { name: string | null; domain: string }): string => site.name ?? site.domain
