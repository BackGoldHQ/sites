// /_backgold/fonts/<file>: one of her font files for BackGold's frames
// (src/frame/faces.ts), read from Google Fonts' file host and answered from
// the site's own origin, which a skinned frame's font-src admits, with
// `Access-Control-Allow-Origin: *` (font files are fetched with CORS). Only a
// woff2 path of that host is answered; anything else is a 404.
import type { APIRoute } from 'astro'
import { FONT_HOST, FONT_PATH } from './faces.ts'

export const prerender = false

export const GET: APIRoute = async ({ params }) => {
  const path = params.path ?? ''
  if (!FONT_PATH.test(path)) return new Response('Not found', { status: 404 })
  const res = await fetch(`${FONT_HOST}${path}`).catch(() => null)
  if (!res || !res.ok) return new Response('Not found', { status: 404 })
  return new Response(res.body, {
    headers: {
      'Content-Type': 'font/woff2',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
