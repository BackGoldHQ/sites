// The Kindling grounds for BackGold's module frames (TemplateConfig
// `frameColors`): a frame on a band the stylesheet draws as parchment (tint,
// wash) wears the parchment's colours, mixed here exactly as
// src/styles/template.css § 1 mixes them from the theme's own: the page's
// gold and ember, and the ink, the contrast ground taken toward black. The
// ink is the text, the links and the call (night-filled, in parchment), the
// fields sit on paper, the rules are the ink thinned over the parchment. A
// frame on any other band keeps the band's colours.

import type { FrameColors, FrameColorsAdjust } from '@backgold/template-kit/lib/brand'

const BLACK = '#000000'
const WHITE = '#ffffff'

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `a` mixed `share` (0 to 1) over `b`, as CSS color-mix in srgb does it. */
function mix(a: string, share: number, b: string): string {
  const [x, y] = [channels(a), channels(b)]
  return `#${x.map((c, i) => Math.round(c * share + y[i]! * (1 - share)).toString(16).padStart(2, '0')).join('')}`
}

export const kindlingFrameColors: FrameColorsAdjust = (colors, _scheme, band, bands): FrameColors => {
  if (band !== 'tint' && band !== 'wash') return colors
  const gold = bands.plain.accent
  const ink = mix(bands.contrast.ground, 0.6, BLACK)
  const parchment = mix(gold, 0.13, WHITE)
  return {
    ...colors,
    ground: parchment,
    ink,
    muted: mix(ink, 0.68, parchment),
    accent: mix(gold, 0.45, ink),
    link: ink,
    button: ink,
    buttonInk: parchment,
    button2: ink,
    button2Ink: parchment,
    surface: mix(parchment, 0.4, WHITE),
    line: mix(ink, 0.14, parchment),
    lineStrong: mix(ink, 0.35, parchment),
  }
}
