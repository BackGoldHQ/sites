// The six content types the archive reads, in the order the door counts
// them: the five the BISD archive was normalized into (brief §4.2) and her
// own records requests. Labels and addresses come from GET /types when the
// organization has the type; these are what the page says when it does not.

export const ARCHIVE_KINDS = [
  { key: 'board_meeting', singular: 'Board meeting', plural: 'Board meetings', base: 'meetings', chip: 'Meetings', code: 'MTG' },
  { key: 'board_decision', singular: 'Board decision', plural: 'Board decisions', base: 'decisions', chip: 'Decisions', code: 'DEC' },
  { key: 'data_bucket', singular: 'Data bucket', plural: 'Data buckets', base: 'data', chip: 'Data', code: 'BKT' },
  { key: 'pay_record', singular: 'Pay record', plural: 'Pay records', base: 'pay', chip: 'Pay', code: 'PAY' },
  { key: 'source_document', singular: 'Source document', plural: 'Source documents', base: 'sources', chip: 'Documents', code: 'DOC' },
  { key: 'information_request', singular: 'Records request', plural: 'Records requests', base: 'records', chip: 'Requests', code: 'REQ' },
] as const

export type ArchiveKindKey = (typeof ARCHIVE_KINDS)[number]['key']
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number]

export const ARCHIVE_KIND_KEYS: readonly ArchiveKindKey[] = ARCHIVE_KINDS.map((k) => k.key)

export const isArchiveKind = (key: string): key is ArchiveKindKey => (ARCHIVE_KIND_KEYS as readonly string[]).includes(key)

export const kindOf = (key: ArchiveKindKey): ArchiveKind => ARCHIVE_KINDS.find((k) => k.key === key)!

/** The five kinds the holdings numerals count (her requests get their own chip). */
export const HOLDINGS: readonly ArchiveKindKey[] = ['board_meeting', 'board_decision', 'data_bucket', 'pay_record', 'source_document']

/**
 * The short prefix a decision's row mark carries, by its decision_category
 * term: FAC-D26, FIN-D093, GOV-D01.
 */
const CATEGORY_PREFIX: Record<string, string> = {
  Facilities: 'FAC',
  Finance: 'FIN',
  Governance: 'GOV',
  'Board policy': 'POL',
  'Library and reading programs': 'LIB',
  Staffing: 'STF',
  'AP and college readiness': 'AP',
  'Complaints and resolutions': 'CMP',
  'Teacher certification': 'CRT',
  'Waivers and exemptions': 'WVR',
}

/** A category the table does not name: its first three letters. */
const prefixOf = (category: string | null): string =>
  category && Object.hasOwn(CATEGORY_PREFIX, category) ? CATEGORY_PREFIX[category]! : (category ?? 'DEC').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()

/**
 * A record's short mark on a row: a decision's category prefix and archive
 * number (from `archive_id`), a bucket's node (`left-01`), a pay record's
 * workbook row; null when the record carries none.
 */
export function markOf(kind: ArchiveKindKey, archiveId: string | null, extra: { row?: string | null; category?: string | null } = {}): string | null {
  if (kind === 'board_decision' && archiveId) {
    const number = archiveId.split('/')[1]
    return number ? `${prefixOf(extra.category ?? null)}-${number}` : null
  }
  if (kind === 'data_bucket' && archiveId) {
    const node = /(left|right|node)-\d+/.exec(archiveId)?.[0]
    return node ?? null
  }
  if (kind === 'pay_record' && extra.row) {
    const row = /row\s+(\d+)/i.exec(extra.row)?.[1]
    return row ? `Row ${row}` : null
  }
  return null
}
