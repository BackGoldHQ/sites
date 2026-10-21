import { describe, expect, it } from 'vitest'
import { agendaOutline, itemKey, linesCiting } from '../src/lib/archive/agenda'

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
].join('\n')

describe('the agenda outline', () => {
  it('reads the numbered items in order, titles run on, attachments left out', () => {
    const outline = agendaOutline(AGENDA)
    expect(outline.map((i) => i.number)).toEqual(['I', 'II', 'II.E', 'II.E.8', 'III'])
    expect(outline.find((i) => i.number === 'II.E.8')).toMatchObject({ line: 8, depth: 3, title: 'Approve Rankings and Contract for HVAC Replacement Project (CSP 26.16)' })
  })

  it('finds the lines that cite an item', () => {
    expect(itemKey('ii.e.8.')).toBe('II.E.8')
    expect(linesCiting(AGENDA, 'II.E.8')).toEqual([8, 15, 16])
  })
})
