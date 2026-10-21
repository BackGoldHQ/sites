// /archive/archive.csv: the whole archive as one spreadsheet (src/lib/archive/csv.ts).
import type { APIRoute } from 'astro'
import { archiveCsv } from '../../lib/archive/csv'
import { loadArchive, sourceOf } from '../../lib/archive/index'

export const GET: APIRoute = async ({ locals }) => {
  const source = sourceOf(locals)
  if (!source) return new Response(null, { status: 503 })
  const data = await loadArchive(source)
  return new Response(archiveCsv(data, locals.backgold.siteUrl), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="archive.csv"' },
  })
}
