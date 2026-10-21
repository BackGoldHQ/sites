// The whole archive as one spreadsheet (/archive/archive.csv): a row per
// record, the columns every kind shares, and its address on the site.

import type { ArchiveData } from './index'

const COLUMNS = ['kind', 'mark', 'title', 'date', 'meeting', 'category', 'campuses', 'presenter', 'vote', 'amounts', 'reported_pay_value', 'citation', 'summary', 'url'] as const

/**
 * One cell: a value a spreadsheet would read as a formula (one starting with
 * `=`, `+`, `-`, `@`, a tab or a carriage return) gets a leading `'`, and a
 * value holding a quote, a comma or a line break is quoted.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function archiveCsv(data: ArchiveData, origin: string): string {
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
    ]
      .map(csvCell)
      .join(','),
  )
  return `${COLUMNS.join(',')}\r\n${rows.map((r) => `${r}\r\n`).join('')}`
}
