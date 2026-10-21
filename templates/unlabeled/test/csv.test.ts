import { describe, expect, it } from 'vitest'
import { csvCell } from '../src/lib/archive/csv'

describe('the CSV cell', () => {
  it.each(['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('never lets a spreadsheet read %j as a formula', (value) => {
    const cell = csvCell(value)
    expect(cell.replace(/^"/, '').startsWith("'")).toBe(true)
  })

  it('quotes a value holding a quote, a comma or a line break', () => {
    expect(csvCell('a, "b"')).toBe('"a, ""b"""')
    expect(csvCell('=a,b')).toBe(`"'=a,b"`)
    expect(csvCell('plain')).toBe('plain')
  })
})
