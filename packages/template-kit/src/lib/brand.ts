// The site's colours as CSS custom properties, from the brand in BackGold
// (`/site.brand`): the template's token sheet. The layout writes them into
// `:root`, a light set and a dark set; src/styles/site.css reads only these
// names, so restyling starts here or there.
//
// Which set shows is the site's appearance (`/site.style`'s `appearance`, the
// same pin a hosted BackGold site keeps): `light` or `dark` pins one set and
// the header has no toggle; `auto`, or none, follows the visitor's system and
// the header's toggle overrides it, by `data-gg-mode` on <html> (the attribute
// and the `gg-mode` storage key a hosted BackGold site's toggle uses, so a
// visitor's choice carries over when a site moves to the template).
//
// The derivations follow boards A1 and A13 (docs/design/sites-unification-
// 2026-10/mockups), drawn for a brand of indigo (primary), parchment
// (secondary) and coral (accent):
//   page      the secondary colour when it is light enough to read on
//             (parchment), else a near-white; dark mode: the primary deep
//             in shadow.
//   ink       the primary steeped in near-black when the primary is dark
//             (A1's #191c33), else a neutral ink; dark mode: the secondary.
//   accent    "accent text": kickers, numerals, date lines, the wordmark's
//             second line. The accent colour itself when it reads at AA on
//             the ground; else taken darker (light grounds) or lighter (dark
//             grounds) a twentieth at a time, only until it does.
//   button    the main call (Donate, Join the party): the accent colour, with
//             whichever ink reads on it. In dark mode the accent stays itself
//             when it holds 3:1 against the page, as a fill must (WCAG
//             1.4.11), and is lightened only until it does. On a ground where
//             the call's ink falls short of AA, or the call nearly matches the
//             ground (under 1.5:1), the primary colour takes its place.
//             `button-2` is the quieter solid button (RSVP, Sign me up): the
//             primary colour.
//   link      a text link: the primary colour on light grounds.
//
// A section's `band` is a ground, never a colour. The grounds:
//   plain     the page
//   tint      a step off the page, deeper in the page's own hue
//   panel     the card colour
//   wash      the primary colour washed over white
//   contrast  the primary itself (dark mode: the secondary), flat
//   brand     not a band an organization picks: the primary colour as a
//             ground in both modes (dark mode: lifted a step), for the
//             footer, the announcement strip and a solid card (A1's footer,
//             top bar and the sidebar's call to action)
//   photo     not a band an organization picks: the dark scrim the template
//             lays over a photo (Hero · Full photo), the same in both modes
// Every band gets an ink, a muted ink, an accent, a link colour, two button
// pairs, a card colour and two rule colours, chosen here so text meets WCAG
// AA (4.5:1) on that ground whatever the brand is: a brand colour that would
// fail on a band is swapped for the band's ink.

type Rgb = [number, number, number]

export interface BrandColors {
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
}

/** Used for any brand colour BackGold does not have. */
const FALLBACK = { primary: '#1f3a5f', secondary: '#f4efe6', accent: '#b4232c' } as const

const PAGE = '#fbfaf8'
const DARK_PAGE = '#121417'
const INK = '#16191f'
const LIGHT_INK = '#ffffff'
const BLACK = '#000000'
const AA = 4.5
/** Buttons and focus rings are not text: 3:1 against their ground (WCAG 1.4.11). */
const NON_TEXT = 3
/** A ground lighter than this takes dark text. */
const LIGHT_GROUND = 0.18

function parse(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`
}

/** `#rrggbb` when the value is one, else null. */
function brandColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : null
}

/** `amount` of `a` over `b` (0 = all b, 1 = all a). */
function mix(a: string, b: string, amount: number): string {
  const x = parse(a)
  const y = parse(b)
  return hex([0, 1, 2].map((i) => x[i]! * amount + y[i]! * (1 - amount)) as Rgb)
}

/** A light colour taken deeper in its own hue: each channel's distance from white times `k` (A1's tint is the page at 1.7). */
function deepen(color: string, k: number): string {
  return hex(parse(color).map((c) => 255 - (255 - c) * k) as Rgb)
}

function luminance(color: string): number {
  const [r, g, b] = parse(color).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG contrast ratio of two colours, 1 to 21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const isLight = (ground: string) => luminance(ground) > LIGHT_GROUND

/** Whichever of `dark` and `light` reads better on `ground`. */
function inkOn(ground: string, dark = INK, light = LIGHT_INK): string {
  return contrast(dark, ground) >= contrast(light, ground) ? dark : light
}

/** `color` when it reaches `ratio` on every one of `grounds`, else `fallback`. */
function readable(color: string, grounds: string[], ratio: number, fallback: string): string {
  return grounds.every((g) => contrast(color, g) >= ratio) ? color : fallback
}

/** The first of `candidates` that reads at AA on `ground`, else `fallback`. */
function firstReadable(candidates: string[], ground: string, fallback: string): string {
  return candidates.find((c) => contrast(c, ground) >= AA) ?? fallback
}

/**
 * `color` taken toward `toward` (black or white) a twentieth at a time, at
 * most `limit` of the way, stopping at the first step that reaches `ratio` on
 * `ground`: `color` itself when it already does, else `fallback`.
 */
function reaching(color: string, toward: string, limit: number, ground: string, ratio: number, fallback: string): string {
  for (let step = 0; step <= Math.round(limit * 20); step++) {
    const candidate = mix(toward, color, step / 20)
    if (contrast(candidate, ground) >= ratio) return candidate
  }
  return fallback
}

/** A ground light text reads on: `color`, darkened until white reaches AA. */
function darkGround(color: string): string {
  let ground = color
  for (let step = 0; step < 20 && contrast(LIGHT_INK, ground) < AA; step++) ground = mix(ground, BLACK, 0.9)
  return ground
}

interface Band {
  ground: string
  ink: string
  muted: string
  accent: string
  link: string
  button: string
  buttonInk: string
  button2: string
  button2Ink: string
  surface: string
  line: string
  lineStrong: string
}

type BandName = 'plain' | 'tint' | 'panel' | 'wash' | 'contrast' | 'brand' | 'photo'

/** One mode's inks and brand colours, which every band of that mode starts from. */
interface Mode {
  primary: string
  accent: string
  /** Text on a light ground. */
  darkText: string
  /** Text on a dark ground. */
  lightText: string
  /** The main call's fill in this mode: the accent (dark mode: lightened only as far as a fill needs). */
  call: string
  /** The page's card colour and rules, for every light ground. */
  surface: string
  line: string
  lineStrong: string
}

function band(ground: string, m: Mode): Band {
  const light = isLight(ground)
  const ink = light ? readable(m.darkText, [ground], AA, inkOn(ground)) : readable(m.lightText, [ground], AA, inkOn(ground))
  const muted = light
    ? firstReadable([0.78, 0.84, 0.9].map((a) => mix(mix(m.primary, ink, 0.5), ground, a)), ground, ink)
    : firstReadable([0.72, 0.78, 0.84, 0.9].map((a) => mix(LIGHT_INK, ground, a)), ground, ink)
  const accent = light ? reaching(m.accent, BLACK, 0.4, ground, AA, ink) : reaching(m.accent, LIGHT_INK, 0.7, ground, AA, ink)
  const link = light ? readable(m.primary, [ground], AA, ink) : firstReadable([mix(LIGHT_INK, m.primary, 0.72)], ground, ink)
  const buttonInk = inkOn(m.call, m.darkText, LIGHT_INK)
  const callReads = contrast(buttonInk, m.call) >= AA && contrast(m.call, ground) >= 1.5
  const button = callReads ? m.call : readable(m.primary, [ground], NON_TEXT, ink)
  const button2 = light ? readable(m.primary, [ground], NON_TEXT, ink) : contrast(m.primary, ground) >= 1.25 ? m.primary : ink
  return {
    ground,
    ink,
    muted,
    accent,
    link,
    button,
    buttonInk: callReads ? buttonInk : inkOn(button),
    button2,
    button2Ink: inkOn(button2, m.darkText, m.lightText),
    surface: light ? m.surface : mix(LIGHT_INK, ground, 0.035),
    line: light ? m.line : mix(LIGHT_INK, ground, 0.1),
    lineStrong: light ? m.lineStrong : mix(LIGHT_INK, ground, 0.2),
  }
}

interface Palette {
  primary: string
  secondary: string
  accent: string
  page: string
  bands: Record<BandName, Band>
}

function colorsOf(brand: BrandColors | null | undefined) {
  return {
    primary: brandColor(brand?.primary_color) ?? FALLBACK.primary,
    secondary: brandColor(brand?.secondary_color) ?? FALLBACK.secondary,
    accent: brandColor(brand?.accent_color) ?? FALLBACK.accent,
  }
}

/** The light palette for a brand; any colour missing or malformed falls back to FALLBACK. */
function lightPalette(brand: BrandColors | null | undefined): Palette {
  const { primary, secondary, accent } = colorsOf(brand)
  const page = luminance(secondary) >= 0.75 ? secondary : PAGE
  const steeped = mix(primary, '#101010', 0.45)
  const darkText = luminance(primary) < 0.08 && contrast(steeped, page) >= 7 ? steeped : INK
  const darker = luminance(primary) <= luminance(secondary) ? primary : secondary
  const contrastGround = contrast(LIGHT_INK, primary) >= AA ? primary : darkGround(darker)
  const m: Mode = {
    primary,
    accent,
    darkText,
    lightText: contrast(page, contrastGround) >= AA ? page : LIGHT_INK,
    call: accent,
    surface: mix(LIGHT_INK, page, 0.8),
    line: mix(deepen(page, 2), darkText, 0.95),
    lineStrong: mix(deepen(page, 3), darkText, 0.9),
  }
  return {
    primary,
    secondary,
    accent,
    page,
    bands: {
      plain: band(page, m),
      tint: band(deepen(page, 1.7), m),
      panel: band(m.surface, m),
      wash: band(mix(primary, LIGHT_INK, 0.11), m),
      contrast: band(contrastGround, m),
      brand: band(contrastGround, m),
      photo: band(darkGround(mix(primary, BLACK, 0.4)), m),
    },
  }
}

/** The dark palette (board A13's other theme): the primary deep in shadow, the secondary as ink, the contrast band light. */
function darkPalette(brand: BrandColors | null | undefined): Palette {
  const { primary, secondary, accent } = colorsOf(brand)
  const shadowed = mix(primary, BLACK, 0.43)
  const page = luminance(shadowed) < 0.03 ? shadowed : DARK_PAGE
  const lightText = luminance(secondary) >= 0.75 ? mix(secondary, BLACK, 0.98) : '#f1ede6'
  const steeped = mix(primary, '#101010', 0.45)
  const darkText = luminance(primary) < 0.08 ? steeped : INK
  const contrastGround = luminance(secondary) >= 0.75 ? deepen(secondary, 1.3) : '#efe7d6'
  const m: Mode = {
    primary: mix(primary, LIGHT_INK, 0.94),
    accent,
    darkText,
    lightText,
    call: reaching(accent, LIGHT_INK, 0.7, page, NON_TEXT, accent),
    surface: mix(LIGHT_INK, contrastGround, 0.5),
    line: mix(deepen(contrastGround, 2), darkText, 0.95),
    lineStrong: mix(deepen(contrastGround, 3), darkText, 0.9),
  }
  const lightModeColors = lightPalette(brand)
  return {
    primary,
    secondary,
    accent,
    page,
    bands: {
      plain: band(page, m),
      tint: band(mix(primary, BLACK, 0.55), m),
      panel: band(mix(primary, BLACK, 0.66), m),
      wash: band(mix(primary, BLACK, 0.72), m),
      contrast: band(contrastGround, m),
      brand: band(darkGround(mix(primary, LIGHT_INK, 0.94)), m),
      // A photo does not change with the visitor's theme: its scrim and words are light mode's.
      photo: { ...lightModeColors.bands.photo, button: m.call, buttonInk: inkOn(m.call, INK, LIGHT_INK) },
    },
  }
}

function lines(p: Palette): string[] {
  const out = [
    `--bg-brand-primary:${p.primary}`,
    `--bg-brand-secondary:${p.secondary}`,
    `--bg-brand-accent:${p.accent}`,
    `--page:${p.page}`,
    // A shadow is the page's ink on a light page and black on a dark one (a light shadow reads as a glow).
    `--shadow-ink:${isLight(p.page) ? p.bands.plain.ink : BLACK}`,
  ]
  for (const [name, b] of Object.entries(p.bands)) {
    out.push(
      `--band-${name}:${b.ground}`,
      `--band-${name}-ink:${b.ink}`,
      `--band-${name}-muted:${b.muted}`,
      `--band-${name}-accent:${b.accent}`,
      `--band-${name}-link:${b.link}`,
      `--band-${name}-button:${b.button}`,
      `--band-${name}-button-ink:${b.buttonInk}`,
      `--band-${name}-button-2:${b.button2}`,
      `--band-${name}-button-2-ink:${b.button2Ink}`,
      `--band-${name}-surface:${b.surface}`,
      `--band-${name}-line:${b.line}`,
      `--band-${name}-line-strong:${b.lineStrong}`,
    )
  }
  return out
}

export type Appearance = 'light' | 'dark' | 'auto'

/**
 * The site's appearance from `/site.style` (a JSON string, or null): its
 * `appearance` when it is `light` or `dark`, else `auto`.
 */
export function appearanceOf(style: string | null | undefined): Appearance {
  if (!style) return 'auto'
  try {
    const parsed: unknown = JSON.parse(style)
    const value = parsed && typeof parsed === 'object' ? (parsed as { appearance?: unknown }).appearance : null
    return value === 'light' || value === 'dark' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

/**
 * The palettes as CSS. A pinned appearance is one `:root` rule. Auto is the
 * light set on `:root`, the dark set under `prefers-color-scheme: dark`
 * unless the visitor chose light, and the dark set when the visitor chose
 * dark. Every value is a `#rrggbb` built above, never text from BackGold.
 */
export function brandCss(brand: BrandColors | null | undefined, appearance: Appearance = 'auto'): string {
  const light = lines(lightPalette(brand)).join(';')
  const dark = lines(darkPalette(brand)).join(';')
  if (appearance === 'light') return `:root{color-scheme:light;${light}}`
  if (appearance === 'dark') return `:root{color-scheme:dark;${dark}}`
  return (
    `:root{color-scheme:light;${light}}` +
    `@media (prefers-color-scheme:dark){:root:not([data-gg-mode="light"]){color-scheme:dark;${dark}}}` +
    `:root[data-gg-mode="dark"]{color-scheme:dark;${dark}}`
  )
}

/** The grounds a section may sit on, as BackGold names them. */
export const SECTION_BANDS = ['plain', 'tint', 'panel', 'wash', 'contrast'] as const
export type SectionBand = (typeof SECTION_BANDS)[number]

/** One band's colours as a BackGold module's `look` value: eleven hex colours, no '#', joined by '.'. */
function lookValue(b: Band): string {
  return [b.ink, b.muted, b.accent, b.link, b.button, b.buttonInk, b.button2, b.button2Ink, b.surface, b.line, b.lineStrong]
    .map((c) => c.slice(1))
    .join('.')
}

/**
 * The query a BackGold module's frame takes to wear this site where it sits
 * (BackGold's embed look: `look`, `look_dark`): the colours of `band`, the
 * light set, and the dark set unless the appearance pins one. A module drawn
 * in a card sits on the card colour, which is the panel band's ground.
 */
export function moduleLook(brand: BrandColors | null | undefined, band: SectionBand, appearance: Appearance): Record<string, string> {
  const light = lookValue(lightPalette(brand).bands[band])
  const dark = lookValue(darkPalette(brand).bands[band])
  if (appearance === 'light') return { look: light }
  if (appearance === 'dark') return { look: dark }
  return { look: light, look_dark: dark }
}
