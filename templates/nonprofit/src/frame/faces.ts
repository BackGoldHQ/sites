// The template's faces for BackGold's frames. A skinned frame admits fonts
// from the site's origin only (docs/FRAME-SKINS.md in the platform), so the
// frame stylesheet carries @font-face rules whose files are this site's own
// addresses, /_backgold/fonts/<file>, which src/frame/font.ts answers from
// Google Fonts' file host with `Access-Control-Allow-Origin: *`. The rules
// are Google's for Shantell Sans and Nunito (latin and latin-ext only), read
// once per isolate; when that read fails the frame draws in the look's face.

const FACES_CSS =
  'https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Shantell+Sans:wght,BNCE,INFM@300..800,-100..100,0..100&display=swap'
/** A browser Google serves woff2 to. */
const WOFF2_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
/** The file host the rules name, and the path a font file has there. */
export const FONT_HOST = 'https://fonts.gstatic.com/'
export const FONT_PATH = /^s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_-]+\.woff2$/
export const FONTS_BASE = '/_backgold/fonts/'

let faces: Promise<string> | null = null

/** The @font-face rules, their files on this site; '' when Google could not be read. */
export function frameFaces(): Promise<string> {
  faces ??= fetch(FACES_CSS, { headers: { 'User-Agent': WOFF2_AGENT } })
    .then((res) => (res.ok ? res.text() : ''))
    .then((css) =>
      css
        .split(/(?=\/\* [a-z-]+ \*\/)/)
        .filter((block) => /^\/\* latin(-ext)? \*\//.test(block))
        .join('')
        .replaceAll(FONT_HOST, FONTS_BASE),
    )
    .catch(() => '')
    .then((css) => {
      if (!css) faces = null
      return css
    })
  return faces
}
