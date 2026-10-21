// /archive/index.json: the documents the archive's search runs over, for
// the island on /archive (src/components/archive/Island.astro), which builds
// the same MiniSearch index from them. A path the edge cache keys under the
// content version like every page, so a publish serves a new copy and
// nothing older.
import type { APIRoute } from 'astro'
import { loadArchive, sourceOf } from '../../lib/archive/index'
import type { SearchDoc } from '../../lib/archive/search'

export const GET: APIRoute = async ({ locals }) => {
  const source = sourceOf(locals)
  if (!source) return new Response(null, { status: 503 })
  const data = await loadArchive(source)
  const docs: SearchDoc[] = data.docs.map(({ fields: _fields, ...doc }) => doc)
  return new Response(JSON.stringify({ format: data.format, version: data.version, docs }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  })
}
