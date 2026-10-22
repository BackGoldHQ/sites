// /archive/download-links.csv: a row per board meeting with its BoardBook
// links and archived PDFs, the original archive's DownloadLinks.csv
// (src/lib/archive/csv.ts).
import type { APIRoute } from 'astro'
import { downloadLinksCsv } from '../../lib/archive/csv'
import { loadArchive, sourceOf } from '../../lib/archive/index'

export const GET: APIRoute = async ({ locals }) => {
  const source = sourceOf(locals)
  if (!source) return new Response(null, { status: 503 })
  const data = await loadArchive(source)
  return new Response(downloadLinksCsv(data, locals.backgold.siteUrl), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="DownloadLinks.csv"' },
  })
}
