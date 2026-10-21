// The colours this template sends BackGold's module frames (TemplateConfig
// `frameColors`): the band's, with the frame's rules and field edges drawn in
// the pen. The template sets every frame on a card of the band's surface,
// and the frame's fields are that surface too, so with the band's own pale
// lines a field has no edge you can see (Kettle Commons' tint: #e8c87a on
// #fffdf7, 1.5:1). The strong line becomes the pen, the band's ink mixed 82%
// over its strong line (template.css `--edge`), and the hairline the ink at
// 30% over the line, as the template's own cards and rules draw them.
import type { FrameColors } from '@backgold/template-kit/lib/brand'

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `a` mixed `share` (0 to 1) over `b`, as CSS color-mix in srgb does it. */
export function mix(a: string, share: number, b: string): string {
  const [x, y] = [channels(a), channels(b)]
  return `#${x.map((c, i) => Math.round(c * share + y[i]! * (1 - share)).toString(16).padStart(2, '0')).join('')}`
}

export function frameColors(colors: FrameColors): FrameColors {
  return { ...colors, line: mix(colors.ink, 0.3, colors.line), lineStrong: mix(colors.ink, 0.82, colors.lineStrong) }
}
