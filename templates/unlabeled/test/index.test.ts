import { describe, expect, it } from 'vitest'
import type { BackgoldContent, ContentTypeSummary, EntryDetail } from '@backgold/content'
import { archiveKey, buildArchive } from '../src/lib/archive/index'
import { createSearcher, paramsOf } from '../src/lib/archive/search'

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
  board_meeting: [entry('board_meeting', '2026-08-20', 'Board meeting, August 20, 2026', { meeting_date: '2026-08-20', meeting_kind: 'Regular meeting' })],
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
    expect(archiveKey('site_1', 184)).toBe('bg-archive:site_1:v184:f1')
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

  it('counts a smaller query for the empty result', () => {
    expect(run('q=flock+hvac').total).toBe(0)
    expect(search.count('hvac').count).toBe(1)
  })
})
