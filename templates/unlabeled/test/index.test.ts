import { describe, expect, it } from 'vitest'
import type { BackgoldContent, ContentTypeSummary, EntryDetail } from '@backgold/content'
import { ARCHIVE_FORMAT, archiveKey, buildArchive } from '../src/lib/archive/index'
import { createSearcher, paramsOf } from '../src/lib/archive/search'
import { downloadLinksCsv } from '../src/lib/archive/csv'
import { archiveReadme } from '../src/lib/archive/readme'
import { requestMeta } from '../src/lib/archive/record'
import { matchedLine, parseQuery } from '../src/lib/archive/query'

const type = (key: string, url_base: string, singular: string): ContentTypeSummary => ({
  key,
  singular_label: singular,
  plural_label: `${singular}s`,
  routable: true,
  url_base,
  built_in: false,
  index: null,
  fields: [],
})

const entry = (kind: string, slug: string, title: string, fields: Record<string, unknown>, extra: Partial<EntryDetail> = {}): EntryDetail => ({
  id: `ci_${slug}`,
  slug,
  type: kind,
  title,
  summary: null,
  url: null,
  hero: null,
  media_url: null,
  publish_at: null,
  updated_at: '2026-10-20T00:00:00.000Z',
  terms: [],
  authors: [],
  access: 'public',
  locked: false,
  lock: null,
  duration_seconds: null,
  renditions: null,
  body: { markdown: '' },
  fields,
  ...extra,
})

const ENTRIES: Record<string, EntryDetail[]> = {
  board_meeting: [
    entry('board_meeting', '2026-08-20', 'Board meeting, August 20, 2026', {
      meeting_date: '2026-08-20',
      meeting_kind: 'Regular meeting',
      agenda_link: 'https://meetings.boardbook.org/Public/Agenda/748?meeting=759781',
      resolutions_link: 'https://meetings.boardbook.org/Meeting/Supplementals/748?meeting=759781',
      agenda_download: 'https://meetings.boardbook.org/Public/DownloadAgenda/748?meeting=759781',
      minutes_link: null,
      agenda_pdf: { url: 'https://api.example/api/media-files/agenda', file_name: 'agenda.pdf', size_bytes: 1 },
    }),
  ],
  information_request: [
    entry(
      'information_request',
      'current-bisd-diagnosticians',
      'Current BISD diagnosticians',
      { requested_from: 'Beaumont ISD', status: 'Fulfilled', requested_on: '2026-09-21', responded_on: '2026-10-08' },
      { publish_at: '2026-09-21T17:00:00.000Z' },
    ),
    entry('information_request', 'bisd-central-admin-staff-pay', 'BISD Central Admin Staff & Pay', { requested_from: 'Beaumont ISD', status: 'Fulfilled', requested_on: '2026-09-21' }),
  ],
  board_decision: [
    entry(
      'board_decision',
      '2026-08-20-facilities-d26-hvac',
      'Contract Award: HVAC Replacement Project (CSP 26.16), Odom Academy',
      {
        meeting: { kind: 'entry', label: 'Board meeting, August 20, 2026', slug: '2026-08-20' },
        decided_on: '2026-08-20',
        presenter: 'Cheryl Hernandez',
        vote_outcome: 'Not specified',
        amounts: ['$562,143'],
        largest_amount: '562143',
        source_citation: ['August 20 2026 agenda'],
        source_documents: ['2026-08-20-agenda'],
        archive_id: 'FacilitiesDecisions/D26',
      },
      {
        summary: 'The administration recommended Apex Alliance, LLC for the project in the amount of $562,143.00.',
        body: { markdown: 'The administration recommended Apex Alliance, LLC for the project. **Four responses** were received from [Trane](https://example.org) dealers.' },
        terms: [
          { taxonomy: 'decision_category', slug: 'facilities', label: 'Facilities' },
          { taxonomy: 'campus', slug: 'odom-academy', label: 'Odom Academy' },
        ],
      },
    ),
    entry(
      'board_decision',
      '2026-06-25-finance-d087-ch-local',
      'Policy Revision: Board Policy CH(LOCAL), Purchasing Threshold Raised to $100,000',
      { decided_on: '2026-06-25', vote_outcome: 'Not specified', archive_id: 'FinancialConsiderations/D087' },
      { terms: [{ taxonomy: 'decision_category', slug: 'finance', label: 'Finance' }] },
    ),
  ],
  data_bucket: [
    entry(
      'data_bucket',
      'financial-right-01-ending-gf-balance',
      'Ending Fund Balance / Surplus General Fund (Jun 30 2025)',
      { family: 'Financial', total_value: '68235397', line_items: ['Total fund balance: $68,235,397 (40% of expenditures)'], archive_id: 'Financial/right-01-ending-gf-balance' },
      { summary: 'Total fund balance: $68,235,397' },
    ),
  ],
  pay_record: [
    entry('pay_record', 'pay-60', 'Ryan Adam Justice — Supervisor Programmer', { person: 'Ryan Adam Justice', pay_value: '81980.03', workbook: 'STATE APPOINTED ADMIN.xlsx', workbook_row: 'Sheet1 row 60' }, { terms: [{ taxonomy: 'district_office', slug: 'it', label: 'Information Technology' }] }),
    entry('pay_record', 'pay-12', 'A Person — Stipend', { person: 'A Person', pay_value: '10.5' }),
  ],
}

/** A client over ENTRIES: one list page per 50, one detail read per entry, counted. */
function fakeClient(types: ContentTypeSummary[]) {
  const reads = { lists: 0, details: 0 }
  const client = {
    types: async () => ({ types }),
    allEntries: async function* (key: string) {
      reads.lists++
      for (const e of ENTRIES[key] ?? []) {
        const { body: _b, fields: _f, ...listed } = e
        yield listed
      }
    },
    entry: async (key: string, slug: string) => {
      reads.details++
      const found = ENTRIES[key]?.find((e) => e.slug === slug)
      return found ? { entry: found, areas: {} } : null
    },
  } as unknown as BackgoldContent
  return { client, reads }
}

const TYPES = [type('board_meeting', 'meetings', 'Board meeting'), type('board_decision', 'decisions', 'Board decision'), type('data_bucket', 'data', 'Data bucket'), type('pay_record', 'pay', 'Pay record')]

describe('the index build', () => {
  it('reads every entry of each archive type the organization has, and only those', async () => {
    const { client, reads } = fakeClient(TYPES)
    const data = await buildArchive(client, 184)
    expect(data.version).toBe(184)
    expect(data.docs).toHaveLength(6)
    expect(reads).toEqual({ lists: 4, details: 6 })
    expect(data.types.find((t) => t.key === 'source_document')?.present).toBe(false)
    expect(data.types.find((t) => t.key === 'board_decision')).toMatchObject({ present: true, base: 'decisions', plural: 'Board decisions' })
  })

  it('keeps each record as the views read it', async () => {
    const { client } = fakeClient(TYPES)
    const { docs } = await buildArchive(client, 1)
    const hvac = docs.find((d) => d.slug === '2026-08-20-facilities-d26-hvac')!
    expect(hvac).toMatchObject({
      kind: 'board_decision',
      url: '/decisions/2026-08-20-facilities-d26-hvac',
      date: '2026-08-20',
      meeting: '2026-08-20',
      category: 'Facilities',
      campuses: ['Odom Academy'],
      mark: 'FAC-D26',
      presenter: 'Cheryl Hernandez',
      amounts: [562_143],
    })
    expect(hvac.links.map((l) => l.label)).toEqual(['Readable text'])
    const pay = docs.find((d) => d.slug === 'pay-60')!
    expect(pay).toMatchObject({ pay: 81_980.03, mark: 'Row 60', category: 'Information Technology', citation: ['STATE APPOINTED ADMIN.xlsx, Sheet1 row 60'] })
    expect(docs.find((d) => d.kind === 'data_bucket')).toMatchObject({ mark: 'right-01', amounts: [68_235_397] })
  })

  it('degrades to an empty archive for an organization with none of the types', async () => {
    const { client, reads } = fakeClient([type('post', 'news', 'Post')])
    const data = await buildArchive(client, 1)
    expect(data.docs).toEqual([])
    expect(reads).toEqual({ lists: 0, details: 0 })
  })

  it('names its KV key by site, content version and format', () => {
    expect(archiveKey('site_1', 184)).toBe(`bg-archive:site_1:v184:f${ARCHIVE_FORMAT}`)
  })
})

describe('records requests in the index', async () => {
  const types = [...TYPES, { ...type('information_request', 'records', 'Information request'), plural_label: 'Information requests' }]
  const { client } = fakeClient(types)
  const data = await buildArchive(client, 1)

  it('calls the type by the archive\'s own labels, not the organization\'s', () => {
    expect(data.types.find((t) => t.key === 'information_request')).toMatchObject({ present: true, base: 'records', singular: 'Records request', plural: 'Records requests' })
  })

  it('carries requested from, the two days and the status for the row', () => {
    const diag = data.docs.find((d) => d.slug === 'current-bisd-diagnosticians')!
    expect(diag.request).toEqual({ from: 'Beaumont ISD', requestedOn: '2026-09-21', respondedOn: '2026-10-08', status: 'Fulfilled' })
    expect(requestMeta(diag.request)).toEqual(['Beaumont ISD', 'Responded Oct 8, 2026', 'Fulfilled'])
    const asked = data.docs.find((d) => d.slug === 'bisd-central-admin-staff-pay')!
    expect(requestMeta(asked.request)).toEqual(['Beaumont ISD', 'Requested Sep 21, 2026', 'Fulfilled'])
    expect(data.docs.find((d) => d.kind === 'board_decision')!.request).toBeNull()
  })

  it('leaves out request facts an older index never wrote', () => {
    expect(requestMeta(undefined)).toEqual([])
  })
})

describe('the downloads', async () => {
  const { client } = fakeClient(TYPES)
  const data = await buildArchive(client, 7)

  it('writes DownloadLinks.csv a row per meeting, its BoardBook links and archived PDFs', () => {
    const [head, row, end] = downloadLinksCsv(data, 'https://unlabeledtexas.com').split('\r\n')
    expect(head).toBe('meeting_date,meeting_kind,agenda_on_boardbook,minutes_on_boardbook,resolutions_on_boardbook,agenda_download,minutes_download,agenda_pdf,minutes_pdf,url')
    expect(row).toBe(
      '2026-08-20,Regular meeting,https://meetings.boardbook.org/Public/Agenda/748?meeting=759781,,https://meetings.boardbook.org/Meeting/Supplementals/748?meeting=759781,https://meetings.boardbook.org/Public/DownloadAgenda/748?meeting=759781,,https://api.example/api/media-files/agenda,,https://unlabeledtexas.com/meetings/2026-08-20',
    )
    expect(end).toBe('')
  })

  it('writes READ_ME.txt from the index: the disclaimers, the kinds with counts, the downloads', () => {
    const text = archiveReadme(data, 'https://unlabeledtexas.com')
    expect(text).toContain('01 Dates and completeness')
    expect(text).toContain('Every summary links to its source. Read the source.')
    expect(text).toMatch(/^ {4}2 {2}Board decisions +https:\/\/unlabeledtexas\.com\/decisions$/m)
    expect(text).toMatch(/^ {4}6 {2}in all$/m)
    expect(text).toContain('DownloadLinks.csv  https://unlabeledtexas.com/archive/download-links.csv')
    expect(text.split('\n').every((line) => line.length <= 80 || !line.includes(' '))).toBe(true)
  })
})

describe('the search over the built index', async () => {
  const { client } = fakeClient(TYPES)
  const { docs } = await buildArchive(client, 1)
  const search = createSearcher(docs)
  const run = (qs: string) => search.run(paramsOf(new URLSearchParams(qs)))

  it('answers plain words, with the match in context', () => {
    const r = run('q=hvac')
    expect(r.total).toBe(1)
    expect(r.hits[0]!.doc.mark).toBe('FAC-D26')
  })

  it('answers a dollar amount in any spelling to its stated precision', () => {
    for (const q of ['$68 million', '68,000,000', '68000000', '$68M']) {
      const r = run(`q=${encodeURIComponent(q)}`)
      expect(r.hits.map((h) => h.doc.slug)).toEqual(['financial-right-01-ending-gf-balance'])
      expect(r.hits[0]!.context?.hit).toBe('$68,235,397')
    }
    expect(run('q=%24562%2C143').total).toBe(1)
  })

  it('answers a policy code however it is spaced', () => {
    expect(run('q=CH+(Local)').hits.map((h) => h.doc.mark)).toEqual(['FIN-D087'])
  })

  it('answers a pay range from the query or from the rail', () => {
    expect(run('q=pay%3A80000-90000').hits.map((h) => h.doc.slug)).toEqual(['pay-60'])
    expect(run('pay_max=1000').hits.map((h) => h.doc.slug)).toEqual(['pay-12'])
  })

  it('answers a month and narrows by kind and category', () => {
    expect(run('q=august+2026').total).toBe(2)
    expect(run('q=august+2026&kind=board_meeting').total).toBe(1)
    expect(run('category=Odom+Academy').total).toBe(1)
    expect(run('q=august+2026').kinds).toMatchObject({ board_meeting: 1, board_decision: 1 })
  })

  it('answers a lone or empty quote without throwing', () => {
    for (const q of ['"', '""', 'foo "', '"a" ""', 'x ""']) expect(() => run(`q=${encodeURIComponent(q)}`)).not.toThrow()
  })

  it('searches the entry\'s own text, not just its summary', () => {
    expect(run('q=trane+dealers').hits.map((h) => h.doc.mark)).toEqual(['FAC-D26'])
  })

  it('says where a query matched across its results', () => {
    expect(matchedLine(search.matching(paramsOf(new URLSearchParams('q=hvac'))), parseQuery('hvac'))).toBe('Matched in titles')
    expect(matchedLine(search.matching(paramsOf(new URLSearchParams('q=%2468+million'))), parseQuery('$68 million'))).toBe('Matched in summaries')
    expect(matchedLine(search.matching(paramsOf(new URLSearchParams('q=trane+dealers'))), parseQuery('trane dealers'))).toBe('Matched in details')
    expect(matchedLine(search.matching(paramsOf(new URLSearchParams('q=pay%3A80000-90000'))), parseQuery('pay:80000-90000'))).toBe('Matched in pay values')
  })

  it('counts a smaller query for the empty result', () => {
    expect(run('q=flock+hvac').total).toBe(0)
    expect(search.count('hvac').count).toBe(1)
  })
})
