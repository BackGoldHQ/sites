import { describe, expect, it } from 'vitest'
import { agendaOutline, agendaVenue, itemFor, itemKey, linesCiting, matchItem } from '../src/lib/archive/agenda'
import AUG_20 from './fixtures/agenda-2026-08-20.txt?raw'

const AGENDA = [
  'Regular Meeting',
  'I.',
  'CALL TO ORDER',
  'II.',
  'REGULAR OPEN BOARD MEETING',
  'II.E.',
  'CONSENT AGENDA',
  'II.E.8.',
  'Approve Rankings and Contract',
  'for HVAC Replacement Project (CSP',
  '26.16)',
  '',
  'IV.',
  'FUNDING FOR THE JJAEP (inside an attached contract)',
  'II.E.8.',
  'ITEM NUMBER/TITLE: II.E.8. Approve Rankings',
  'III.',
  'CLOSED SESSION',
  'III.A.',
  'Approve an Order Authorizing Refunding Bonds',
  'ORDER AUTHORIZING THE ISSUANCE',
].join('\n')

describe('the agenda outline', () => {
  it('reads the numbered items in order, titles run on, attachments left out', () => {
    const outline = agendaOutline(AGENDA)
    expect(outline.map((i) => i.number)).toEqual(['I', 'II', 'II.E', 'II.E.8', 'III', 'III.A'])
    expect(outline.find((i) => i.number === 'III.A')?.title).toBe('Approve an Order Authorizing Refunding Bonds')
    expect(outline.find((i) => i.number === 'II.E.8')).toMatchObject({ line: 8, depth: 3, title: 'Approve Rankings and Contract for HVAC Replacement Project (CSP 26.16)' })
  })

  it('finds the lines that cite an item', () => {
    expect(itemKey('ii.e.8.')).toBe('II.E.8')
    expect(linesCiting(AGENDA, 'II.E.8')).toEqual([8, 15, 16])
  })
})

// AUG_20: the Aug 20, 2026 agenda's head and every item's number and title
// lines, verbatim from the archive's text extraction (August 20 2026-agenda.txt).
const outline = agendaOutline(AUG_20)
const items = outline.filter((i) => i.depth === 3)

// The meeting's fifteen decisions as the archive files them: the eleven with an
// `agenda_item`, and the four without one.
const DECISIONS: { mark: string; title: string; agendaItem: string | null }[] = [
  { mark: 'AP-D06', title: 'Approve Interlocal MOU with Communities In Schools for CCMR / TSI Readiness Services', agendaItem: 'II.F.3' },
  { mark: 'FAC-D26', title: 'Contract Award: HVAC Replacement Project (CSP 26.16), Odom Academy', agendaItem: 'II.E.8' },
  { mark: 'FAC-D27', title: 'Order Authorizing Issuance of Unlimited Tax Refunding Bonds, Series 2026', agendaItem: 'II.F.5' },
  { mark: 'FIN-D092', title: 'Resolution: Annual Review of Investment Policy and Investment Strategies (Aug 20', agendaItem: 'II.E.6' },
  { mark: 'FIN-D093', title: 'Contract Award: HVAC Replacement Project (CSP 26.16, Odom ES)', agendaItem: 'II.E.8' },
  { mark: 'FIN-D094', title: 'Report: Interlocal Agreements for Fiscal Year 2025-2026 (Cooperative Purchasing)', agendaItem: null },
  { mark: 'FIN-D095', title: 'Report: IMA Purchases Over $50,000 (August 2026)', agendaItem: 'II.E.10' },
  { mark: 'FIN-D096', title: 'Budget Amendment GF-2 (2026-27)', agendaItem: 'II.E.13' },
  { mark: 'FIN-D097', title: 'Interlocal Agreement: Minnie Rogers Juvenile Justice Center (MRJJC) 2026-2027', agendaItem: 'II.F.2' },
  { mark: 'FIN-D098', title: 'Order Authorizing Issuance of Unlimited Tax Refunding Bonds, Series 2026', agendaItem: 'II.F.5' },
  { mark: 'GOV-D10', title: 'Board Reviews/Accepts Lone Star Governance Time Use Trackers (Self-Evaluation)', agendaItem: null },
  { mark: 'POL-D18', title: 'Revise Board Policy CW (Local) - Naming Facilities', agendaItem: 'II.E.2' },
  { mark: 'POL-D19', title: 'Revise Board Policy FO (Local) - Prohibit Corporal Punishment', agendaItem: null },
  { mark: 'POL-D20', title: 'Revise Board Policy DEC (Local) - Leave Certification & Accrual Limits', agendaItem: null },
  { mark: 'POL-D21', title: 'Resolution: Annual Review of Investment Policy CDA (Local) - FY2026', agendaItem: 'II.E.6' },
]

describe('hanging a decision on the Aug 20, 2026 agenda', () => {
  it('reads the real outline', () => {
    expect(items.map((i) => i.number)).toEqual([
      'II.D.1', 'II.E.1', 'II.E.2', 'II.E.3', 'II.E.4', 'II.E.5', 'II.E.6', 'II.E.7', 'II.E.8', 'II.E.9', 'II.E.10', 'II.E.11', 'II.E.12', 'II.E.13', 'II.E.14',
      'II.F.1', 'II.F.2', 'II.F.3', 'II.F.4', 'II.F.5', 'II.G.1', 'II.G.2', 'III.A.1',
    ])
    expect(items.find((i) => i.number === 'II.G.1')?.title).toBe('Discuss, Review, and Approve Time Use Tracker')
  })

  it('hangs each of the four without an agenda_item on the item its title matches', () => {
    const matched = Object.fromEntries(DECISIONS.filter((d) => !d.agendaItem).map((d) => [d.mark, matchItem(d.title, items)]))
    expect(matched).toEqual({ 'FIN-D094': 'II.E.9', 'GOV-D10': 'II.G.1', 'POL-D19': 'II.E.4', 'POL-D20': 'II.E.12' })
  })

  it('matches the eleven with an agenda_item to the item they name, from their titles alone', () => {
    for (const d of DECISIONS.filter((d) => d.agendaItem)) expect([d.mark, matchItem(d.title, items)]).toEqual([d.mark, d.agendaItem])
  })

  it('keeps a decision’s own agenda_item over its title', () => {
    expect(itemFor({ title: 'Budget Amendment GF-2 (2026-27)', agendaItem: 'ii.e.13.' }, outline)).toBe('II.E.13')
    expect(itemFor({ title: 'Revise Board Policy FO (Local) - Prohibit Corporal Punishment', agendaItem: null }, outline)).toBe('II.E.4')
  })

  it('places every decision of the meeting on an item', () => {
    const placed = DECISIONS.map((d) => itemFor(d, outline))
    expect(placed.filter((p) => p !== null && outline.some((i) => i.number === p))).toHaveLength(15)
  })

  it('guesses nothing: no match, a near tie, or a different code is left with no item', () => {
    expect(matchItem('Closed-Session Level 3 Employee Grievance Hearing', items)).toBeNull()
    // Two items name interlocal memoranda of understanding; the title names neither partner.
    expect(matchItem('Approve Interlocal Memorandum of Understanding', items)).toBeNull()
    // II.E.8 is CSP 26.16; a different procurement number never hangs on it.
    expect(matchItem('Contract Award: HVAC Replacement Project (CSP 26.15)', items)).toBeNull()
    // II.E.2 is CW(LOCAL); a different policy code never hangs on it.
    expect(matchItem('Revise Board Policy BE (Local) - Naming Facilities', items)).toBeNull()
  })

  it('reads where the meeting was held from the agenda’s head', () => {
    expect(agendaVenue(AUG_20)).toBe('Board Room of the Beaumont ISD Administration Building, 3395 Harrison Ave, Beaumont, TX 77706-5009')
    expect(agendaVenue('Team of 8 Training\nTuesday, July 15, 2025 2:00 PM\nConference Room A, 3395 Harrison Ave, Beaumont, TX 77706-5009\nI.\nINTRODUCTION')).toBe(
      'Conference Room A, 3395 Harrison Ave, Beaumont, TX 77706-5009',
    )
    expect(agendaVenue('Regular Meeting\nThursday, August 20, 2026 5:00 PM\n\nI.\nCALL TO ORDER')).toBeNull()
    expect(agendaVenue('Regular Meeting\nBoard Room\nI.\nCALL TO ORDER')).toBeNull()
    expect(agendaVenue('')).toBeNull()
  })
})
