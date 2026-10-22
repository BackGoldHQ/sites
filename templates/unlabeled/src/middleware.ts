// The query names a source document's page reads (src/components/entries/
// source.astro): `find` (the words marked in its text) and `all` (the whole
// text, not the window around the cited item). The page is an entry the
// kit's catch-all draws, and a header its layout sets arrives after the
// response has started, so they are set here, on the way out, for every
// address under the sources base: the edge cache (BackGold's middleware,
// which runs around this one) then never answers either name with the bare
// page's stored copy, and never stores a render that carries one.
import { defineMiddleware } from 'astro:middleware'
import { READS_QUERY_HEADER } from '@backgold/astro/server'
import { kindOf } from './lib/archive/kinds'

const SOURCE_PAGE = new RegExp(`^/${kindOf('source_document').base}/[^/]+/?$`)
const SOURCE_QUERY_NAMES = ['find', 'all']

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next()
  if (!SOURCE_PAGE.test(context.url.pathname) || !(response.headers.get('Content-Type') ?? '').startsWith('text/html')) return response
  const marked = new Response(response.body, response)
  marked.headers.set(READS_QUERY_HEADER, SOURCE_QUERY_NAMES.join(','))
  if (SOURCE_QUERY_NAMES.some((name) => context.url.searchParams.get(name))) marked.headers.set('Cache-Control', 'no-store')
  return marked
})
