// /_backgold/frame.css: the template's stylesheet for BackGold's frames
// (src/styles/frame.css), which a frame links from the site's origin when the
// site asks it to (TemplateConfig `frameSkin`) and BackGold honours it, with
// the template's faces as @font-face rules on this site's own addresses
// (src/frame/faces.ts). The frames are served from BackGold's origins, so any
// origin may read it: no Cross-Origin-Resource-Policy narrower than
// cross-origin. It carries nothing but the look and changes with a deploy.
import type { APIRoute } from 'astro'
import skin from '../styles/frame.css?raw'
import { frameFaces } from './faces.ts'

export const prerender = false

export const GET: APIRoute = async () =>
  new Response(`${await frameFaces()}\n${skin}`, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=604800',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
