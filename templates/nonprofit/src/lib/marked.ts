// The template's two rewrites of a rendered page, which src/middleware.ts
// applies to every HTML response (the kit draws the headings, so the
// template marks them after the fact; a kit heading helper is the brief's
// decision 9, the owner's call):
//
// - The marked word. An operator marks the one word that matters in a
//   heading by wrapping it in asterisks (`Everyone *helps*.`). In an h1, h2
//   or h3 that holds exactly one such pair, in one run of text, the pair
//   becomes the word in a `.np-mark` span with both marker strokes after it
//   (the underline swoosh and the circle-around, `#m-under` and `#m-circle`
//   in the sprite); template.css shows the circle in a page-opening Hero's
//   headline and the underline everywhere else. A heading with no star, more
//   than one pair, a lone star or a star across a tag is left as written:
//   the template never guesses the word. Nothing inside <script>, <style>,
//   a tag's attributes or the heading's tags is touched, and a page already
//   rewritten comes out unchanged.
// - The sprite. The doodle sprite (doodles.ts) goes in once, right after
//   <body>.
// - The draw-in. A page with a marked word gets one small script before
//   </body>: under prefers-reduced-motion: no-preference it holds each
//   mark's stroke back and draws it in once (template.css, 600ms) when the
//   word enters the viewport. Without it the stroke is simply there.

import { doodleSprite } from './doodles.ts'

const SPRITE_CLASS = 'np-sprite'
/** A <script> or <style> element whole, which the rewrite passes over. */
const RAW = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const HEADING = /<(h[1-3])(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi
/** One starred word or phrase: no space just inside either star. */
const PAIR = /\*([^\s*<>](?:[^*<>]*[^\s*<>])?)\*/

const DRAW_IN =
  '<script data-np-draw-in>(function(){var m=document.querySelectorAll(".np-mark");' +
  'if(!m.length||!window.IntersectionObserver||!window.matchMedia("(prefers-reduced-motion: no-preference)").matches)return;' +
  'var o=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++){var t=es[i].target;if(!es[i].isIntersecting)continue;' +
  't.removeAttribute("data-np-wait");t.setAttribute("data-np-draw","");o.unobserve(t)}},{threshold:0.6});' +
  'for(var i=0;i<m.length;i++){m[i].setAttribute("data-np-wait","");o.observe(m[i])}})()</script>'

const strokes =
  '<svg class="np-mark-u" aria-hidden="true" focusable="false"><use href="#m-under"></use></svg>' +
  '<svg class="np-mark-c" aria-hidden="true" focusable="false"><use href="#m-circle"></use></svg>'

/** A heading's inner HTML with its one starred pair marked, or as it was. */
export function markHeading(inner: string): string {
  const parts = inner.split(/(<[^>]*>)/)
  const texts = parts.filter((_, i) => i % 2 === 0)
  if (texts.join('').split('*').length !== 3) return inner
  const at = parts.findIndex((part, i) => i % 2 === 0 && PAIR.test(part))
  if (at < 0) return inner
  parts[at] = parts[at]!.replace(PAIR, (_, word: string) => `<span class="np-mark"><span class="np-mark-word">${word}</span>${strokes}</span>`)
  return parts.join('')
}

/** Every h1 to h3 outside <script> and <style>, marked. */
function markHeadings(html: string): string {
  return html.replace(HEADING, (whole, tag: string, attrs: string | undefined, inner: string) => {
    if (!inner.includes('*')) return whole
    const marked = markHeading(inner)
    return marked === inner ? whole : `<${tag}${attrs ?? ''}>${marked}</${tag}>`
  })
}

/** The page with its marked words and its sprite: what the middleware sends. */
export function rewritePage(html: string): string {
  let out = ''
  let last = 0
  for (const raw of html.matchAll(RAW)) {
    out += markHeadings(html.slice(last, raw.index)) + raw[0]
    last = raw.index + raw[0].length
  }
  out += markHeadings(html.slice(last))
  if (!out.includes(`class="${SPRITE_CLASS}"`)) out = out.replace(/<body\b[^>]*>/i, (body) => body + doodleSprite())
  if (out.includes('class="np-mark"') && !out.includes('data-np-draw-in')) out = out.replace(/<\/body>/i, `${DRAW_IN}</body>`)
  return out
}
