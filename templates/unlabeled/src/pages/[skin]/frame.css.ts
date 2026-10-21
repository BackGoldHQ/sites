// /_backgold/frame.css: her skin for BackGold's frames (src/lib/frame-skin.ts),
// which each frame links from this site's origin when the kit sends `skin`
// (src/template.ts `frameSkin`). Astro leaves a pages folder whose name
// starts with "_" out of routing, so the address is this route's one value
// of `skin`; any other is a 404. Readable from any origin (the frames are
// BackGold's, on other origins), cached for five minutes.
import type { APIRoute } from 'astro'
import { FRAME_SKIN_CSS } from '../../lib/frame-skin'

export const GET: APIRoute = ({ params }) => {
  if (params.skin !== '_backgold') return new Response('Not found', { status: 404 })
  return new Response(FRAME_SKIN_CSS, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  })
}
