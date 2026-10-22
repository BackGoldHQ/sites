import { describe, expect, it } from 'vitest'
import { bucketOf, countIn, countOf, dayIn, feederFlow, flowFor, itemIn, lineFigure, lineItem, linkedMarks, moneyView, namedParts } from '../src/lib/archive/money'
import type { ArchiveDoc } from '../src/lib/archive/record'

// The archive's own staff, student and FY2025 General Fund buckets, as
// archive-normalized.json gives them (title, summary, fields).

const doc = (slug: string, title: string, summary: string | null, fields: Record<string, unknown>, mark: string | null = null): ArchiveDoc => ({
  id: slug,
  kind: 'data_bucket',
  slug,
  url: `/data/${slug}`,
  title,
  summary: summary ?? '',
  date: null,
  meeting: null,
  category: String(fields.family),
  campuses: [],
  mark,
  presenter: null,
  seconder: null,
  request: null,
  vote: null,
  voteDetail: null,
  citation: [],
  amounts: [],
  pay: null,
  links: [],
  body: '',
  publishAt: null,
  fields,
})

const staff = (slug: string, title: string, summary: string | null, total_label: string | null = null) => doc(slug, title, summary, { family: 'Staff population', flow_side: 'Node', total_value: null, total_label, line_items: [] })
const students = (slug: string, title: string, summary: string) => doc(slug, title, summary, { family: 'Student population', flow_side: 'Node', total_value: null, total_label: null, line_items: [] })

const STAFF = [
  staff('staff-population-01-total-teachers-baseline', 'TOTAL TEACHERS', 'Total Teachers: ~1,046 | Adjunct Status: 226 (22%)', "2025-26 HB2 BASELINE (~1,046) — Used here as the Sankey's left-side anchor (no true April 2025 figure exists)"),
  staff('staff-population-02-certified-standard', 'CERTIFIED / STANDARD CERTIFICATION (~820) 2025-26 HB2 Baseline', 'Calculation: 1,046 - 226 = 820 | Share of Teaching: Workforce ~78%', 'Derived Complement'),
  staff('staff-population-03-adjunct-alt-cert', 'ADJUNCT / ALTERNATIVE CERTIFICATION (226) 22% of the 2025-26 Teaching Workforce', 'ACP - Degreed: 213 | BRACE - Non-Degreed: 13'),
  staff('staff-population-04-acp-degreed', 'ACP', '213 of the 226 adjunct-status teachers are degreed and: enrolled in an Alternative Certification Program (ACP), supported via EPP partners Region V ESC and TeachWorthy', 'DEGREED, ENROLLED (213) — Alternative Certification Program'),
  staff('staff-population-05-brace-non-degreed', 'BRACE', "13 of the 226 adjunct-status teachers are non-degreed and: enrolled in the District's BRACE Program, aligned with the District's 'Elevate Pathway' certification support structure", 'NON-DEGREED, ENROLLED (13) — District BRACE Program (Elevate Pathway)'),
  staff('staff-population-06-new-hires-july-2025', 'NEW HIRES', 'Elementary: Schools: 10 | Middle: Schools: 7 | High: Schools: 5 | Curriculum: 1 | Special: Education: 9 | Transportation: 1', 'JULY 2025 HR REPORT (33) — Hiring Date Range: 07-01-2025 through 07-31-2025'),
  staff('staff-population-07-active-staff-pool-july-2025', 'ACTIVE STAFF POOL', null, 'JULY 2025 SNAPSHOT — (Pass-through node, not a sourced headcount)'),
  staff('staff-population-08-departed-july-2025', 'DEPARTED/SEPARATED', 'Retire: 3 | Resign: 4 | Termination: 1', 'JULY 2025 (8) — Separation Date Range: 07-01-2025 through 07-31-2025'),
  staff('staff-population-09-retired', 'RETIRED (3) July 2025 Employee Separation Report', null),
  staff('staff-population-10-resigned', 'RESIGNED (4) July 2025 Employee Separation Report', null),
  staff('staff-population-11-terminated', 'TERMINATED (1) July 2025 Employee Separation Report', null),
  staff('staff-population-12-greenwood-head-start-director', 'NEW APPOINTMENT: VALENCIA GREENWOOD Director of Bingman Head Start', 'Board approved appointment of Valencia Greenwood as Director: of Bingman Head Start at the August 21, 2025 regular meeting. Office of Head Start requires key positions to receive Board approval and be submitted to the Office of Head Start for final approval.'),
  staff('staff-population-13-acting-superintendent-agreement', 'NEW APPOINTMENT: ACTING SUPERINTENDENT AGREEMENT May 5, 2026 Special Meeting', "At a Special Meeting on May 5, 2026, the Board (convened as a: Board of Managers) listed 'Acting Superintendent Agreement' as Action Item III.C, alongside a 'Superintendent Certification Waiver' (III.D) and a temporary suspension of several Local board policies (III.E)."),
  staff('staff-population-14-named-leadership-new-hires', 'NAMED LEADERSHIP NEW HIRES (2) Aggregation Node', '1. Valencia Greenwood -- Director, Bingman Head Start: (approved Aug 21, 2025) | 2. Acting Superintendent Agreement: (approved May 5, 2026, individual not named in record)'),
  staff('staff-population-15-former-superintendent', "FORMER SUPERINTENDENT 'S.A.' (pre-separation)", "The record identifies a 'Former Superintendent of Schools': only by the initials 'S.A.' in the July 23, 2026 Board of Managers agenda item approving a Voluntary Separation Agreement."),
  staff('staff-population-16-departed-voluntary-separation-superintendent', 'DEPARTED/SEPARATED: VOLUNTARY SEPARATION AGREEMENT July 23, 2026', "Board of Managers approved a Voluntary Separation Agreement: with the Former Superintendent of Schools ('S.A.'), Agenda Item II.G.5 (Action Item), July 23, 2026."),
]

const STUDENTS = [
  students('student-population-fy2025-26-enrollment-projection', 'FY2025-26 Enrollment Projection 16,131 students', 'District-wide Total: 16,131 students | As-of Date: 2025-06-24 (Board approval)'),
  students('student-population-fy2026-27-enrollment-projection', 'FY2026-27 Enrollment Projection 15,308 students', 'District-wide Total: 15,308 students | As-of Date: 2026-06-25 (Board approval)'),
  students('student-population-net-enrollment-decline', 'Net Enrollment Decline Departed / Graduated / Transferred Out 823 students (not separately itemized)', '16,131 minus 15,308: = 823 students | Spans: 2025-06-24 to 2026-06-25'),
]

const money = (slug: string, title: string, mark: string, fields: Record<string, unknown>) => doc(slug, title, null, { family: 'Financial', fed_by: null, flows_to: null, ...fields }, mark)

const GF = [
  money('financial-left-01-fy2025-gf-revenue', 'FY2025 Actual General Fund Revenue & Beginning Balance', 'left-01', {
    flow_side: 'Inflow',
    total_value: '250587198',
    line_items: [
      'Beginning Fund Balance (Jul 1 2024): $67,312,951 Source: AFR Exhibit C-3, Fund Balance-Beginning, GF column',
      'Local & Property Tax Revenue (FY2025 Actual): $122,323,174 Source: AFR Exhibit C-2, Total Revenues-Local, GF column',
      'State Program Revenue (FY2025 Actual): $58,147,736 Source: AFR Exhibit C-2, GF column',
      'Federal Program Revenue (FY2025 Actual): $2,653,912 Source: AFR Exhibit C-2, GF column',
      'Sale of Real/Personal Property (Other Financing Source): $149,425 Source: AFR Exhibit C-3, GF column',
    ],
    flows_to: 'Ending Fund Balance ($68,235,397), Transfer to Capital Projects Fund ($9,724,724), and 12 function-level expenditure buckets -- see Bucket_Details/right-01 and right-02',
  }),
  money('financial-right-01-ending-gf-balance', 'Ending Fund Balance / Surplus General Fund (Jun 30 2025)', 'right-01', {
    flow_side: 'Outflow',
    total_value: '68235397',
    line_items: [
      "Unassigned fund balance: $62,980,397 (36% of total GF expenditures, ~132 days -- well above TEA's 75-day/25% recommendation and 45-day/12.5% minimum)",
      'Total fund balance: $68,235,397 (40% of expenditures)',
      'Net change during FY2025: +$922,446, after a $9,724,724 transfer out to the Capital Projects Fund',
      'Whitley Penn issued an unmodified (clean) audit opinion, no material weaknesses, no current-year findings',
    ],
    fed_by: 'FY2025 General Fund (Audited Actual) hub -- see Bucket_Details/left-01',
  }),
  money('financial-right-02-fy2025-gf-expenditures', 'FY2025 Actual General Fund Expenditures by Function', 'right-02', {
    flow_side: 'Outflow',
    total_value: '172627077',
    line_items: ['Instruction: $89,161,372'],
    fed_by: 'FY2025 General Fund (Audited Actual) hub -- see Bucket_Details/left-01. NOTE: the FY2025-26 salary increase of 4% adopted the following budget year is NOT part of this FY2025-actual figure.',
  }),
  money('financial-left-06-midyear-amendments', 'Mid-Year Budget Amendments - New Revenue Recognized', 'left-06', {
    flow_side: 'Inflow',
    total_value: '5965365',
    line_items: ['D041 -- Budget Amendment GF-3: $1,200,000', 'D057 -- Budget Amendment GF-5: $1,309,524', 'D085 -- Budget Amendment GF-12: $2,155,841'],
    flows_to: 'Budget Amendment Program Allocations (GF-3): $2,500,000 Special Education Program Allocations (GF-5): $1,309,524 Attendance-Credit Allocations (GF-12): $2,155,841 -- see Bucket_Details/right-13',
  }),
  money('financial-right-13-budget-amendment-allocations', 'Budget Amendment Program Allocations (GF-3/GF-5/GF-12)', 'right-13', {
    flow_side: 'Outflow',
    total_value: '5965365',
    line_items: [],
    fed_by: 'Mid-Year Budget Amendments - New Revenue Recognized -- see Bucket_Details/left-06',
  }),
]

describe('countIn', () => {
  it('skips dates, years, ordinals, percents, item numbers, list markers and digits in words', () => {
    expect(countIn('JULY 2025 HR REPORT (33) — Hiring Date Range: 07-01-2025 through 07-31-2025')).toBe(33)
    expect(countIn('FY2025-26 Enrollment Projection 16,131 students')).toBe(16131)
    expect(countIn('2025-26 HB2 BASELINE (~1,046)')).toBe(1046)
    expect(countIn('ADJUNCT / ALTERNATIVE CERTIFICATION (226) 22% of the 2025-26 Teaching Workforce')).toBe(226)
    expect(countIn('NEW APPOINTMENT: ACTING SUPERINTENDENT AGREEMENT May 5, 2026 Special Meeting')).toBeNull()
    expect(countIn('Agenda Item II.G.5 (Action Item), July 23, 2026.')).toBeNull()
    expect(countIn('1. Valencia Greenwood -- Director: (approved Aug 21, 2025) | 2. Acting Superintendent')).toBeNull()
    expect(countIn('the 3rd reading')).toBeNull()
    expect(countIn('JULY 2025 SNAPSHOT — (Pass-through node, not a sourced headcount)')).toBeNull()
  })

  it('prefers thousands separators and count nouns, then a count set apart, then the first number', () => {
    expect(countIn('Calculation: 1,046 - 226 = 820')).toBe(1046)
    expect(countIn('Net Enrollment Decline Departed / Graduated / Transferred Out 823 students (not separately itemized)')).toBe(823)
    expect(countIn('CERTIFIED / STANDARD CERTIFICATION (~820) 2025-26 HB2 Baseline')).toBe(820)
    expect(countIn('Retire: 3 | Resign: 4')).toBe(3)
  })
})

describe('countOf', () => {
  it('reads every staff and student bucket as the board does', () => {
    const counts = Object.fromEntries([...STAFF, ...STUDENTS].map((d) => [d.slug.replace(/^(staff|student)-population-/, ''), countOf(d)]))
    expect(counts).toEqual({
      '01-total-teachers-baseline': 1046,
      '02-certified-standard': 820,
      '03-adjunct-alt-cert': 226,
      '04-acp-degreed': 213,
      '05-brace-non-degreed': 13,
      '06-new-hires-july-2025': 33,
      '07-active-staff-pool-july-2025': null,
      '08-departed-july-2025': 8,
      '09-retired': 3,
      '10-resigned': 4,
      '11-terminated': 1,
      '12-greenwood-head-start-director': null,
      '13-acting-superintendent-agreement': null,
      '14-named-leadership-new-hires': 2,
      '15-former-superintendent': null,
      '16-departed-voluntary-separation-superintendent': null,
      'fy2025-26-enrollment-projection': 16131,
      'fy2026-27-enrollment-projection': 15308,
      'net-enrollment-decline': 823,
    })
  })

  it('takes total_value, then the line items, before the text', () => {
    expect(countOf(doc('x', 'TEACHERS (12)', '', { family: 'Staff population', total_value: '40', line_items: [] }))).toBe(40)
    expect(countOf(doc('x', 'TEACHERS (12)', '', { family: 'Staff population', total_value: null, line_items: ['Elementary: 10', 'Middle: 7'] }))).toBe(17)
  })
})

describe('the count families', () => {
  const view = moneyView([...STAFF, ...STUDENTS])
  const [staffFamily, studentFamily] = view.counts

  it('draws the counts as ramps on the family scale and the dated buckets as a list', () => {
    expect(staffFamily!.max).toBe(1046)
    expect(staffFamily!.dated.map((d) => [d.bucket.doc.slug.slice(17, 19), d.day, d.item])).toEqual([
      ['12', '2025-08-21', null],
      ['13', '2026-05-05', 'III.C'],
      ['15', '2026-07-23', null],
      ['16', '2026-07-23', 'II.G.5'],
    ])
    expect(staffFamily!.ramps).toHaveLength(12)
    expect(studentFamily!.max).toBe(16131)
  })

  it('fills a stated total solid, the parts a total names hatched, a derived remainder open', () => {
    const fills = Object.fromEntries([...staffFamily!.ramps, ...studentFamily!.ramps].filter((r) => r.count !== null).map((r) => [r.count, r.fill]))
    expect(fills).toEqual({ 1046: 'solid', 820: 'open', 226: 'solid', 213: 'hatched', 13: 'hatched', 33: 'solid', 8: 'solid', 3: 'hatched', 4: 'hatched', 1: 'hatched', 2: 'solid', 16131: 'solid', 15308: 'solid', 823: 'open' })
  })

  it('reads days and agenda items', () => {
    expect(dayIn('approved at the August 21, 2025 regular meeting')).toBe('2025-08-21')
    expect(dayIn('Sept 18 2025')).toBe('2025-09-18')
    expect(itemIn('listed as Action Item III.C')).toBe('III.C')
  })
})

describe('line items', () => {
  it('keeps the sign the text sets before the figure', () => {
    const net = lineItem('Net change during FY2025: +$922,446, after a $9,724,724 transfer out to the Capital Projects Fund')
    expect(net).toMatchObject({ label: 'Net change during FY2025', value: 922446, sign: '+' })
    expect(lineFigure(net)).toBe('+$922,446')
    const down = lineItem('Net change: −$1,500')
    expect(down.value).toBe(-1500)
    expect(lineFigure(down)).toBe('−$1,500')
    expect(lineFigure(lineItem('GF-3 (Sept 18 2025): $1,000,000 + $150,000 = $2,500,000'))).toBe('$1,000,000')
    expect(lineFigure(lineItem('Whitley Penn issued an unmodified (clean) audit opinion'))).toBeNull()
  })
})

describe('flows between buckets', () => {
  const buckets = GF.map(bucketOf)
  const [left01, right01, right02, left06, right13] = buckets

  it('reads the parts a flows_to names with a figure', () => {
    expect(namedParts(left01!.flowsTo)).toEqual([
      { label: 'Ending Fund Balance', value: 68235397 },
      { label: 'Transfer to Capital Projects Fund', value: 9724724 },
    ])
  })

  it('draws FY2025 General Fund: left-01’s lines in, right-02, right-01 and the transfer out, in = out', () => {
    const { pairing } = flowFor(right01!, buckets)
    expect(pairing?.feeder).toBe(left01)
    expect(pairing?.total).toBe(250587198)
    expect(pairing?.left.map((s) => s.value)).toEqual([67312951, 122323174, 58147736, 2653912, 149425])
    expect(pairing?.right.map((s) => [s.label, s.value])).toEqual([
      ['FY2025 Actual General Fund Expenditures by Function', 172627077],
      ['Ending Fund Balance / Surplus General Fund (Jun 30 2025)', 68235397],
      ['Transfer to Capital Projects Fund', 9724724],
    ])
    expect(flowFor(right02!, buckets).pairing?.feeder).toBe(left01)
    expect(flowFor(left01!, buckets).pairing?.feeder).toBe(left01)
  })

  it('draws nothing where the feeder’s lines do not add up, and says why', () => {
    expect(feederFlow(left06!, buckets)).toEqual({ pairing: null, reason: 'left-06’s line items add up to $4,665,365, the buckets it feeds to $5,965,365.' })
    expect(flowFor(right13!, buckets)).toEqual({ pairing: null, reason: 'left-06’s line items add up to $4,665,365, the buckets it feeds to $5,965,365.' })
  })

  it('links the marks a fed_by names', () => {
    expect(linkedMarks(right01!.fedBy!, buckets)).toEqual([
      { text: 'FY2025 General Fund (Audited Actual) hub -- see ' },
      { text: 'Bucket_Details/left-01', href: '/data/financial-left-01-fy2025-gf-revenue', title: 'FY2025 Actual General Fund Revenue & Beginning Balance' },
    ])
  })

  it('puts a flow under its feeder’s fund on the money page, and none for a bucket that does not balance', () => {
    const view = moneyView(GF)
    expect(view.funds.flatMap((f) => f.flows.map((p) => p.feeder.doc.mark))).toEqual(['left-01'])
    expect(view.feeders).toBe(2)
  })
})
