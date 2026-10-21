// /archive/archive.csv: the whole archive as one spreadsheet, a row per
// record, with the columns every kind shares and its address on this site.
import type { APIRoute } from 'astro'
import { loadArchive, sourceOf } from '../../lib/archive/index'

const COLUMNS = ['kind', 'mark', 'title', 'date', 'meeting', 'category', 'campuses', 'presenter', 'vote', 'amounts', 'reported_pay_value', 'citation', 'summary', 'url'] as const

const cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

export const GET: APIRoute = async ({ locals }) => {
  const source = sourceOf(locals)
  if (!source) return new Response(null, { status: 503 })
  const data = await loadArchive(source)
  const origin = locals.backgold.siteUrl
  const label = new Map(data.types.map((t) => [t.key, t.singular]))
  const rows = data.docs.map((d) =>
    [
      label.get(d.kind) ?? d.kind,
      d.mark ?? '',
      d.title,
      d.date ?? '',
      d.meeting ?? '',
      d.category ?? '',
      d.campuses.join('; '),
      d.presenter ?? '',
      d.vote ?? '',
      d.amounts.join('; '),
      d.pay === null ? '' : String(d.pay),
      d.citation.join('; '),
      d.summary,
      new URL(d.url, origin).href,
    ].map(cell).join(','),
  )
  return new Response(`${COLUMNS.join(',')}\r\n${rows.join('\r\n')}\r\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="archive.csv"' },
  })
}
