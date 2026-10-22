// The archive's spreadsheets: the whole archive (/archive/archive.csv), a
// row per record with the columns every kind shares and its address on the
// site; and its meetings' links (/archive/download-links.csv, the original
// archive's DownloadLinks.csv), a row per board meeting with its BoardBook
// links and the PDFs the archive keeps.

import type { ArchiveData } from './index'
import { fileUrl, httpUrl, str } from './record'

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

const LINK_COLUMNS = ['meeting_date', 'meeting_kind', 'agenda_on_boardbook', 'minutes_on_boardbook', 'resolutions_on_boardbook', 'agenda_download', 'minutes_download', 'agenda_pdf', 'minutes_pdf', 'url'] as const

/** The board meetings, oldest first, a row each: its date and kind, its BoardBook pages and downloads, the archived PDFs, its page here. */
export function downloadLinksCsv(data: ArchiveData, origin: string): string {
  const meetings = data.docs.filter((d) => d.kind === 'board_meeting').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const rows = meetings.map((d) => {
    const f = d.fields
    return [
      d.date ?? '',
      str(f.meeting_kind) ?? '',
      httpUrl(f.agenda_link) ?? '',
      httpUrl(f.minutes_link) ?? '',
      httpUrl(f.resolutions_link) ?? '',
      httpUrl(f.agenda_download) ?? '',
      httpUrl(f.minutes_download) ?? '',
      fileUrl(f.agenda_pdf) ?? '',
      fileUrl(f.minutes_pdf) ?? '',
      new URL(d.url, origin).href,
    ]
      .map(csvCell)
      .join(',')
  })
  return `${LINK_COLUMNS.join(',')}\r\n${rows.map((r) => `${r}\r\n`).join('')}`
}
