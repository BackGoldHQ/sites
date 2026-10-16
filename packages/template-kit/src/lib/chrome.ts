// The site's header and footer as BackGold's operator set them up: GET /site's
// `chrome` (each part's layout and the footer's own words), against what the
// template's template.json `chrome` (its config's manifest) says it draws. A
// layout the site names that the template does not list is drawn as the
// template's first, exactly as a section's variant falls back; a `/site`
// answer with no `chrome` at all (an older BackGold) reads as the template's
// firsts and no words.
import type { SiteTemplateManifest } from '@backgold/contract/site-templates'
import { relFor, safeHref } from '@backgold/astro/server'

export type HeaderLayout = SiteTemplateManifest['chrome']['header'][number]
export type FooterLayout = SiteTemplateManifest['chrome']['footer'][number]

/** A link on the footer's bottom row, or a closing-call button: its address already checked. */
export interface ChromeLink {
  label: string
  href: string
  rel: string | undefined
}

/** The footer's closing call (its `closing` layout). */
export interface ClosingCall {
  headline: string
  body: string | null
  tagline: string | null
  imageUrl: string | null
  buttons: ChromeLink[]
}

export interface SiteChrome {
  header: { layout: HeaderLayout }
  footer: {
    layout: FooterLayout
    blurb: string | null
    address: string | null
    phone: string | null
    legalLinks: ChromeLink[]
    copyright: string | null
    closing: ClosingCall | null
  }
}

/** What `/site` carries, read structurally so an older answer still parses. */
interface Raw {
  chrome?: {
    header?: { layout?: unknown }
    footer?: {
      layout?: unknown
      blurb?: unknown
      address?: unknown
      phone?: unknown
      legal_links?: unknown
      copyright?: unknown
      closing?: {
        headline?: unknown
        body?: unknown
        tagline?: unknown
        image_url?: unknown
        buttons?: unknown
      } | null
    }
  }
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** The layout this template draws for a stored value: the value when listed, else the template's first. */
function drawn<T extends string>(listed: readonly T[], value: unknown): T {
  return typeof value === 'string' && (listed as readonly string[]).includes(value) ? (value as T) : listed[0]!
}

/** The rows that have a label and an address safe to follow, in order. */
function linksOf(value: unknown): ChromeLink[] {
  if (!Array.isArray(value)) return []
  const out: ChromeLink[] = []
  for (const row of value as Array<{ label?: unknown; url?: unknown }>) {
    const label = str(row?.label)
    const href = typeof row?.url === 'string' ? safeHref(row.url) : null
    if (label && href) out.push({ label, href, rel: relFor(href) })
  }
  return out
}

export function chromeOf(site: unknown, manifest: SiteTemplateManifest): SiteChrome {
  const raw = ((site ?? {}) as Raw).chrome ?? {}
  const footer = raw.footer ?? {}
  const layout = drawn(manifest.chrome.footer, footer.layout)
  const closingRaw = footer.closing
  const headline = closingRaw ? str(closingRaw.headline) : null
  const image = closingRaw ? str(closingRaw.image_url) : null
  const closing: ClosingCall | null =
    layout === 'closing' && closingRaw && headline
      ? {
          headline,
          body: str(closingRaw.body),
          tagline: str(closingRaw.tagline),
          // The photo only from an address this site would load as an image.
          imageUrl: image && /^https:\/\//.test(image) ? image : null,
          buttons: linksOf(closingRaw.buttons).slice(0, 2),
        }
      : null
  return {
    header: { layout: drawn(manifest.chrome.header, raw.header?.layout) },
    footer: {
      layout,
      blurb: str(footer.blurb),
      address: str(footer.address),
      phone: str(footer.phone),
      legalLinks: linksOf(footer.legal_links),
      copyright: str(footer.copyright),
      closing,
    },
  }
}

/** The bottom row's copyright line: the one written, else "© <year> <name>". */
export function copyrightLine(written: string | null, name: string, year = new Date().getFullYear()): string {
  return written ?? `© ${year} ${name}`
}
