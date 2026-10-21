// The template's own middleware, which Astro runs inside @backgold/astro's
// (so the edge cache stores what it sends): on an HTML page it marks the
// starred word in each heading and writes the doodle sprite once
// (src/lib/marked.ts). Every other response, and one with no body, passes
// through untouched.
import { defineMiddleware } from 'astro:middleware'
import { rewritePage } from './lib/marked.ts'

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next()
  if (context.request.method === 'HEAD' || !response.body || response.status === 204 || response.status === 304) return response
  if (!(response.headers.get('content-type') ?? '').toLowerCase().startsWith('text/html')) return response
  const html = rewritePage(await response.text())
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(html, { status: response.status, statusText: response.statusText, headers })
})
