// The site's faces, as the layout (src/layouts/Site.astro) loads them.
//
// A site wearing a saved theme in BackGold names two faces in `/site`'s
// `theme.fonts`, `heading` and `body`: each a family, its CSS stack, and
// where it comes from. `builtin` (one of BackGold's faces) and `fontsource`
// (a family the organization imported) are woff2 files BackGold serves at
// `/lp-runtime/<hash>.woff2`, one per weight, listed in the face's `files`;
// `system` downloads nothing. They are declared the way a hosted BackGold
// page declares them: one @font-face rule per weight, `font-display: swap`,
// never render-blocking. The stacks become `--site-font-heading` and
// `--site-font-body`, which src/styles/site.css's `--font-display` and
// `--font` read.
//
// Where the files load from follows how the site reads BackGold, as the live
// counts do (src/lib/live.ts). First-party (inside BackGold's namespace) the
// api serves /lp-runtime on the site's own host, so the rules name the
// same-origin path, exactly as a hosted page does, and nothing is
// preconnected. With a site key they name the api's address the theme gives,
// and the page preconnects to it.
//
// A slot with no theme face, or one whose family, stack or source is not of
// the shapes above, keeps the template's own face: Fraunces for headings,
// Public Sans for text, from Google Fonts. A file whose weight or address is
// not of those shapes is left out, as a hosted page leaves out a weight it has
// no file for. Every value written into CSS passed one of the patterns below,
// so none carries anything but a family name, a stack or a file address.

import type { SiteResponse } from '@backgold/content'

type SiteTheme = SiteResponse['site']['theme']

/** The template's own faces, by slot, as Google Fonts families. */
const OWN_FACES = {
  heading: 'Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,800;1,9..144,500',
  body: 'Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
} as const

const GOOGLE_FONTS = 'https://fonts.googleapis.com'
const GOOGLE_FILES = 'https://fonts.gstatic.com'

/** A family as BackGold names one (letters, digits, spaces, `+`, `-`). */
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 +-]{0,63}$/
/** A stack: quoted family names and bare keywords (`serif`, `-apple-system`), comma-separated. */
const STACK = /^(?:"[A-Za-z0-9 +-]{1,64}"|'[A-Za-z0-9 +-]{1,64}'|-?[A-Za-z][A-Za-z0-9-]{0,63})(?:\s*,\s*(?:"[A-Za-z0-9 +-]{1,64}"|'[A-Za-z0-9 +-]{1,64}'|-?[A-Za-z][A-Za-z0-9-]{0,63}))*$/
/** A woff2 file as BackGold serves one: content-addressed under /lp-runtime. */
const FILE_PATH = /^\/lp-runtime\/[0-9a-f]{64}\.woff2$/

type Slot = keyof typeof OWN_FACES

interface Face {
  family: string
  stack: string
  /** Each weight's file address, as the page names it. */
  files: Array<{ weight: number; href: string; origin: string }>
}

export interface SiteFonts {
  /** The theme's stacks as custom properties and its @font-face rules; '' when the template's own faces are all there is. */
  css: string
  /** The Google Fonts stylesheet for the template's own faces still in use; null when the theme replaced both. */
  stylesheet: string | null
  /** The origins the page connects to for its faces; `crossorigin` for the ones serving font files. */
  preconnects: Array<{ href: string; crossorigin: boolean }>
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** A file of a face: its weight and its address on the page, or null when either is not one BackGold serves. */
function fileOf(value: unknown, firstParty: boolean): Face['files'][number] | null {
  const file = record(value)
  const weight = file?.weight
  if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 100 || weight > 900 || typeof file?.url !== 'string') return null
  let url: URL
  try {
    url = new URL(file.url)
  } catch {
    return null
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash || !FILE_PATH.test(url.pathname)) return null
  return firstParty ? { weight, href: url.pathname, origin: '' } : { weight, href: `${url.origin}${url.pathname}`, origin: url.origin }
}

/** A theme face the page can declare, or null when it is missing or not of the shapes above. */
function faceOf(value: unknown, firstParty: boolean): Face | null {
  const face = record(value)
  if (!face || typeof face.family !== 'string' || typeof face.stack !== 'string') return null
  if (!FAMILY.test(face.family) || face.stack.length > 400 || !STACK.test(face.stack)) return null
  if (face.source === 'system') return { family: face.family, stack: face.stack, files: [] }
  if (face.source !== 'builtin' && face.source !== 'fontsource') return null
  const files = (Array.isArray(face.files) ? face.files : []).flatMap((f) => fileOf(f, firstParty) ?? [])
  return { family: face.family, stack: face.stack, files }
}

/** The faces a page of this site loads, and how (see the top of this file). */
export function siteFonts(theme: SiteTheme | undefined, firstParty: boolean): SiteFonts {
  const fonts = record(record(theme)?.fonts)
  const faces: Record<Slot, Face | null> = { heading: faceOf(fonts?.heading, firstParty), body: faceOf(fonts?.body, firstParty) }
  const props: string[] = []
  const rules: string[] = []
  const origins = new Set<string>()
  for (const slot of ['heading', 'body'] as const) {
    const face = faces[slot]
    if (!face) continue
    props.push(`--site-font-${slot}:${face.stack}`)
    for (const file of face.files) {
      const rule = `@font-face{font-family:"${face.family}";font-style:normal;font-weight:${file.weight};font-display:swap;src:url(${file.href}) format('woff2')}`
      if (!rules.includes(rule)) rules.push(rule)
      if (file.origin) origins.add(file.origin)
    }
  }
  const own = (['heading', 'body'] as const).filter((slot) => !faces[slot]).map((slot) => OWN_FACES[slot])
  const preconnects = [...origins].map((href) => ({ href, crossorigin: true }))
  if (own.length > 0) preconnects.unshift({ href: GOOGLE_FONTS, crossorigin: false }, { href: GOOGLE_FILES, crossorigin: true })
  return {
    css: props.length > 0 ? `:root{${props.join(';')}}${rules.join('')}` : '',
    stylesheet: own.length > 0 ? `${GOOGLE_FONTS}/css2?${own.map((family) => `family=${family}`).join('&')}&display=swap` : null,
    preconnects,
  }
}
