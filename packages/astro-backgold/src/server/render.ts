// What the shipped `.astro` components compute, as plain functions (built to
// dist/render.js, which the components import; not a public entry). Every
// address a component renders passes through ./urls.ts here, and every
// authored string reaches the page either as text Astro escapes or as the
// output of the allowlist sanitizer.

import type { MenuItem, Section, SectionEmbed } from '@backgold/content'
import type { BackgoldLocals } from './context.js'
import { isPreviewPath } from './edge-cache.js'
import { sanitizeRichText } from './markdown.js'
import { relFor, safeEmbedUrl, safeHref, safeSrc } from './urls.js'
import { VISITOR_COOKIE } from './visitor.js'

// ── Copy ─────────────────────────────────────────────────────────────────────

/**
 * A copy value is the entry editor's restricted HTML when it opens with one
 * of the builder's prose tags (packages/site prose.ts isRichProse); anything
 * else is plain text, with a blank line between paragraphs.
 */
const RICH_PROSE = /^\s*<\s*(p|br|strong|em|a)[\s/>]/i

export type CopyBlock = { key: string; html: string } | { key: string; paragraphs: string[] }

/** The section's heading (`heading`, else `title`) and every other copy value in order. */
export function copyOf(section: Section): { heading: string | null; blocks: CopyBlock[] } {
  const copy = section.copy ?? {}
  const headingKey = typeof copy.heading === 'string' && copy.heading.trim() ? 'heading' : typeof copy.title === 'string' && copy.title.trim() ? 'title' : null
  const blocks: CopyBlock[] = []
  for (const [key, value] of Object.entries(copy)) {
    if (key === headingKey || typeof value !== 'string' || !value.trim()) continue
    if (RICH_PROSE.test(value)) blocks.push({ key, html: sanitizeRichText(value) })
    else blocks.push({ key, paragraphs: value.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) })
  }
  return { heading: headingKey ? copy[headingKey]! : null, blocks }
}

// ── Media and links ──────────────────────────────────────────────────────────

export interface MediaItem {
  key: string
  kind: 'image' | 'pdf' | 'video'
  url: string
  alt: string
}

const IMAGE_EXTENSION = /\.(avif|gif|jpe?g|png|svg|webp)$/i
const VIDEO_EXTENSION = /\.(m4v|mov|mp4|webm)$/i
const VIDEO_HOST = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/i

function mediaKind(key: string, url: string): MediaItem['kind'] {
  let path = url
  let host = ''
  try {
    const parsed = new URL(url, 'https://site.invalid')
    path = parsed.pathname
    host = parsed.hostname
  } catch {
    // safeSrc already parsed it; a relative path stays as written.
  }
  if (IMAGE_EXTENSION.test(path) || /poster/i.test(key)) return 'image'
  if (/\.pdf$/i.test(path) || /pdf/i.test(key)) return 'pdf'
  if (VIDEO_EXTENSION.test(path) || VIDEO_HOST.test(host) || /video/i.test(key)) return 'video'
  return 'image'
}

/** The section's media with safe addresses: images, and PDFs and videos as links. */
export function mediaOf(section: Section): MediaItem[] {
  const out: MediaItem[] = []
  for (const [key, media] of Object.entries(section.media ?? {})) {
    const url = media && typeof media.url === 'string' ? safeSrc(media.url) : null
    if (url) out.push({ key, kind: mediaKind(key, url), url, alt: typeof media.alt === 'string' ? media.alt : '' })
  }
  return out
}

export interface SafeLink {
  label: string
  href: string
  rel: 'noopener' | undefined
}

/** A link a component may render, or null. Absolute links get `rel="noopener"`; no link opens a new tab. */
export function linkOf(label: unknown, href: unknown, external = false): SafeLink | null {
  if (typeof label !== 'string' || !label.trim() || typeof href !== 'string') return null
  const safe = safeHref(href, { anchors: true })
  if (!safe) return null
  return { label, href: safe, rel: external ? 'noopener' : relFor(safe) }
}

export function linksOf(section: Section): SafeLink[] {
  return (section.links ?? []).map((l) => linkOf(l.label, l.url, l.target?.kind === 'external')).filter((l): l is SafeLink => l !== null)
}

// ── Data rows ────────────────────────────────────────────────────────────────

export interface DataRow {
  title: string | null
  href: string | null
  rel: 'noopener' | undefined
  text: string | null
  image: string | null
  /** `datetime` and the date as shown. */
  date: { iso: string; label: string } | null
}

function firstString(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value
    if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') return (value as { url: string }).url
  }
  return null
}

const DATE_LABEL = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** The date as authored: the calendar day in the value itself, so an offset never moves it. */
function dateOf(value: string | null): DataRow['date'] {
  if (!value || Number.isNaN(Date.parse(value))) return null
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1]
  if (!day) return null
  return { iso: value, label: DATE_LABEL.format(new Date(`${day}T00:00:00Z`)) }
}

/** Each `data.items` row, best effort, whatever the source: a title, a link, a line of text, an image, a date. */
export function dataRowsOf(section: Section): DataRow[] {
  const rows: DataRow[] = []
  for (const item of section.data?.items ?? []) {
    if (typeof item === 'string') {
      if (item.trim()) rows.push({ title: item, href: null, rel: undefined, text: null, image: null, date: null })
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const title = firstString(row, ['title', 'name', 'label', 'headline'])
    const text = firstString(row, ['summary', 'description', 'quote', 'body', 'blurb', 'value'])
    const rawHref = firstString(row, ['url', 'link_url', 'web_url'])
    const href = rawHref ? safeHref(rawHref, { anchors: true }) : null
    const rawImage = firstString(row, ['image_url', 'image', 'hero'])
    const image = rawImage ? safeSrc(rawImage) : null
    const date = dateOf(firstString(row, ['publish_at', 'starts_at', 'date', 'deadline']))
    if (!title && !text && !image && !date) continue
    rows.push({ title, href, rel: href ? relFor(href) : undefined, text, image, date })
  }
  return rows
}

// ── Embeds ───────────────────────────────────────────────────────────────────

export type EmbedPlan = { kind: 'iframe'; src: string } | { kind: 'mount'; attributes: Record<string, string>; script: string }

/** `data-…` names only: a mount can never carry an event handler, a style or a src. */
const MOUNT_ATTRIBUTE = /^data-[a-z0-9][a-z0-9-]{0,63}$/

/** What to render for an embed, or null when its addresses are not https (or a local http api). */
export function embedPlan(embed: SectionEmbed | null | undefined): EmbedPlan | null {
  if (!embed) return null
  if (embed.iframe !== null && embed.iframe !== undefined) {
    const src = safeEmbedUrl(embed.iframe)
    return src ? { kind: 'iframe', src } : null
  }
  const script = safeEmbedUrl(embed.script)
  if (!script || !embed.mount) return null
  const attributes: Record<string, string> = {}
  for (const [name, value] of Object.entries(embed.mount)) {
    if (MOUNT_ATTRIBUTE.test(name) && typeof value === 'string') attributes[name] = value
  }
  return Object.keys(attributes).length > 0 ? { kind: 'mount', attributes, script } : null
}

const emitted = new WeakMap<object, Set<string>>()

/** True the first time `key` is asked for during one render (keyed by its request), so a page carries one copy of a script. */
export function firstOnPage(request: Request, key: string): boolean {
  let seen = emitted.get(request)
  if (!seen) emitted.set(request, (seen = new Set()))
  if (seen.has(key)) return false
  seen.add(key)
  return true
}

// ── Menus ────────────────────────────────────────────────────────────────────

export interface MenuNode {
  label: string
  href: string | null
  rel: 'noopener' | undefined
  current: boolean
  children: MenuNode[]
}

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/** The menu with safe addresses, the current page marked. An item whose address is unsafe keeps its label and children. */
export function menuOf(items: readonly MenuItem[], pathname: string): MenuNode[] {
  const here = trimSlash(pathname)
  return items.map((item) => {
    const link = item.url === null ? null : linkOf(item.label, item.url, item.external)
    return {
      label: item.label,
      href: link?.href ?? null,
      rel: link?.rel,
      current: link !== null && link.href.startsWith('/') && trimSlash(link.href) === here,
      children: menuOf(item.children ?? [], pathname),
    }
  })
}

// ── Analytics ────────────────────────────────────────────────────────────────

/**
 * The island's settings as one JSON string for a `data-` attribute, or null
 * when the site does not share its analytics, and on the preview page (its
 * address carries the signed preview token, and its text is a draft). The
 * visitor id is read from the `bg_vid` cookie in the browser, never written
 * into the page: a page is cached and served to every visitor.
 */
export function analyticsPayload(bg: BackgoldLocals | undefined, pathname: string): string | null {
  if (!bg || bg.setup || !bg.analytics || isPreviewPath(pathname)) return null
  const { key, ingest, group, site_domain_id, environment } = bg.analytics
  return JSON.stringify({ key, ingest, organization: group.organization, site_domain_id, environment, cookie: VISITOR_COOKIE })
}
