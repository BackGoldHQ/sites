// /archive/README.txt: the archive's READ_ME in plain text, from the index
// (src/lib/archive/readme.ts). Served inline so a browser shows it; the
// door's link downloads it as READ_ME.txt.
import type { APIRoute } from 'astro'
import { archiveReadme } from '../../lib/archive/readme'
import { loadArchive, sourceOf } from '../../lib/archive/index'

export const GET: APIRoute = async ({ locals }) => {
  const source = sourceOf(locals)
  if (!source) return new Response(null, { status: 503 })
  const data = await loadArchive(source)
  return new Response(archiveReadme(data, locals.backgold.siteUrl), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'inline; filename="READ_ME.txt"' },
  })
}
