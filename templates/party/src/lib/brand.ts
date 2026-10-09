// The site's colours as CSS custom properties, from the brand in BackGold
// (`/site.brand`). The layout writes them into `:root`; src/styles/site.css
// reads only these names, so restyling starts here or there.
//
// A section's `band` is a ground, never a colour. The five grounds follow
// BackGold's own renderer:
//   plain    the page background
//   tint     halfway between the page and the panel colour
//   panel    the card colour
//   wash     the page with 12% of the primary colour over it
//   contrast a dark brand ground (the darker of primary and secondary,
//            fading to 35% darker), with light text
// Every band gets an ink, a muted ink, a link colour and a button pair chosen
// here so text meets WCAG AA (4.5:1) on that ground whatever the brand is:
// a brand colour that would fail on a band is swapped for the band's ink.

type Rgb = [number, number, number]

export interface BrandColors {
  primary_color?: string | null
  secondary_color?: string | null
  accent_color?: string | null
}

/** Used for any brand colour BackGold does not have. */
const FALLBACK = { primary: '#1f3a5f', secondary: '#f4efe6', accent: '#b4232c' } as const

const PAGE = '#fbfaf8'
const SURFACE = '#f0ede6'
const INK = '#16191f'
const LIGHT_INK = '#ffffff'
const AA = 4.5
/** Buttons and focus rings are not text: 3:1 against their ground (WCAG 1.4.11). */
const NON_TEXT = 3

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

/** Whichever of the dark and light ink reads better on `ground`. */
function inkOn(ground: string): string {
  return contrast(INK, ground) >= contrast(LIGHT_INK, ground) ? INK : LIGHT_INK
}

/** `color` when it reaches `ratio` on every one of `grounds`, else `fallback`. */
function readable(color: string, grounds: string[], ratio: number, fallback: string): string {
  return grounds.every((g) => contrast(color, g) >= ratio) ? color : fallback
}

/** The ink faded toward the ground as far as it can go and still pass AA. */
function mutedOn(ink: string, grounds: string[]): string {
  for (const amount of [0.72, 0.78, 0.84, 0.9]) {
    const muted = mix(ink, grounds[0]!, amount)
    if (grounds.every((g) => contrast(muted, g) >= AA)) return muted
  }
  return ink
}

/** A ground light text reads on: `color`, darkened until white reaches AA. */
function darkGround(color: string): string {
  let ground = color
  for (let step = 0; step < 20 && contrast(LIGHT_INK, ground) < AA; step++) ground = mix(ground, '#000000', 0.9)
  return ground
}

interface Band {
  ground: string
  /** The far end of the ground's gradient; the same colour except on `contrast`. */
  end: string
  ink: string
  muted: string
  link: string
  button: string
  buttonInk: string
}

interface Palette {
  primary: string
  secondary: string
  accent: string
  page: string
  bands: Record<'plain' | 'tint' | 'panel' | 'wash' | 'contrast', Band>
}

function band(ground: string, end: string, brand: { primary: string; accent: string }): Band {
  const ink = inkOn(ground)
  const grounds = [ground, end]
  const link = readable(brand.accent, grounds, AA, readable(brand.primary, grounds, AA, ink))
  const button = readable(brand.primary, grounds, NON_TEXT, readable(brand.accent, grounds, NON_TEXT, ink))
  return { ground, end, ink, muted: mutedOn(ink, grounds), link, button, buttonInk: inkOn(button) }
}

/** The palette for a brand; any colour missing or malformed falls back to FALLBACK. */
function palette(brand: BrandColors | null | undefined): Palette {
  const primary = brandColor(brand?.primary_color) ?? FALLBACK.primary
  const secondary = brandColor(brand?.secondary_color) ?? FALLBACK.secondary
  const accent = brandColor(brand?.accent_color) ?? FALLBACK.accent
  const darker = luminance(primary) <= luminance(secondary) ? primary : secondary
  const contrastGround = darkGround(darker)
  const colors = { primary, accent }
  return {
    primary,
    secondary,
    accent,
    page: PAGE,
    bands: {
      plain: band(PAGE, PAGE, colors),
      tint: band(mix(SURFACE, PAGE, 0.5), mix(SURFACE, PAGE, 0.5), colors),
      panel: band(SURFACE, SURFACE, colors),
      wash: band(mix(primary, PAGE, 0.12), mix(primary, PAGE, 0.12), colors),
      contrast: band(contrastGround, mix(contrastGround, '#000000', 0.65), colors),
    },
  }
}

/** The palette as a `:root { … }` rule. Every value is a `#rrggbb` built above, never text from BackGold. */
export function brandCss(brand: BrandColors | null | undefined): string {
  const p = palette(brand)
  const lines = [
    `--bg-brand-primary:${p.primary}`,
    `--bg-brand-secondary:${p.secondary}`,
    `--bg-brand-accent:${p.accent}`,
    `--page:${p.page}`,
  ]
  for (const [name, b] of Object.entries(p.bands)) {
    lines.push(
      `--band-${name}:${b.ground}`,
      `--band-${name}-end:${b.end}`,
      `--band-${name}-ink:${b.ink}`,
      `--band-${name}-muted:${b.muted}`,
      `--band-${name}-link:${b.link}`,
      `--band-${name}-button:${b.button}`,
      `--band-${name}-button-ink:${b.buttonInk}`,
    )
  }
  return `:root{${lines.join(';')}}`
}
