// /_backgold/frame.css: the template's stylesheet for BackGold's module
// frames (src/styles/frame.css), which a frame loads from the site's origin
// when the site asks it to (TemplateConfig `frameSkin`). The frames are
// served from BackGold's own origins, so any origin may read it; it carries
// nothing but the look, and changes only with a deploy.
import type { APIRoute } from 'astro'
import css from './styles/frame.css?raw'

export const prerender = false

export const GET: APIRoute = () =>
  new Response(css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=604800',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
