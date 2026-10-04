// The one address policy for everything this package renders: markdown and
// rich text, section links and media, menus and embeds. A value is checked
// as the browser will read it (entities already decoded), and anything that
// is not plainly one of the allowed forms is refused rather than repaired.

/** C0 and C1 controls, DEL, and the backslash browsers read as `/`. */
const UNSAFE_CHARACTER = /[\u0000-\u001F\u007F-\u009F\\]/
const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/
const ASCII_WHITESPACE = /^[\t\n\f\r ]+|[\t\n\f\r ]+$/g

const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const MEDIA_SCHEMES = new Set(['http', 'https'])

function checked(raw: unknown, schemes: Set<string>, anchors: boolean): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.replace(ASCII_WHITESPACE, '')
  if (value === '' || UNSAFE_CHARACTER.test(value)) return null
  if (value.startsWith('#')) return anchors && value.length > 1 ? value : null
  if (value.startsWith('/')) return value.startsWith('//') ? null : value
  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase()
  if (!scheme || !schemes.has(scheme)) return null
  if (scheme === 'http' || scheme === 'https') {
    try {
      if (!new URL(value).host) return null
    } catch {
      return null
    }
  }
  return value
}

/**
 * A link target: http(s), mailto:, tel:, or a site-relative path (one leading
 * `/`); `#anchor` too when `anchors` is set (section and menu links, which the
 * api already holds to its own allowlist). Null for anything else.
 */
export function safeHref(raw: unknown, opts: { anchors?: boolean } = {}): string | null {
  return checked(raw, LINK_SCHEMES, opts.anchors ?? false)
}

/** An image or file address: http(s) or a site-relative path. */
export function safeSrc(raw: unknown): string | null {
  return checked(raw, MEDIA_SCHEMES, false)
}

/** An absolute http(s) address: a link that leaves the page's own paths, which gets `rel="noopener"`. */
export function isAbsoluteHttp(href: string): boolean {
  return /^https?:/i.test(href)
}

/** `rel` for a link `safeHref` passed: `noopener` when it leaves the site's paths. No link opens a new tab. */
export function relFor(href: string): 'noopener' | undefined {
  return isAbsoluteHttp(href) ? 'noopener' : undefined
}

/**
 * An embed frame or script address: https, or http on localhost or
 * 127.0.0.1 for a local api. Null for anything else.
 */
export function safeEmbedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || UNSAFE_CHARACTER.test(raw) || raw.trim() !== raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  if (url.protocol === 'https:') return raw
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return raw
  return null
}
