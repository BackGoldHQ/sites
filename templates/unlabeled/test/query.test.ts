import { describe, expect, it } from 'vitest'
import { amountRange, figuresIn, matchedIn, parseChips, parseQuery, sameAmounts, sameAnswerLines } from '../src/lib/archive/query'

const MILLION_68 = { low: 68_000_000, high: 68_999_999.99 }

describe('dollar amounts read to their stated precision', () => {
  it.each(['$68 million', '68 million', '$68M', '68M', '68,000,000', '68000000', '$68,000,000'])('%s means $68,000,000 to $68,999,999', (q) => {
    const parsed = parseQuery(q)
    expect(parsed.amounts).toHaveLength(1)
    expect(parsed.amounts[0]).toMatchObject(MILLION_68)
    expect(parsed.words).toEqual([])
  })

  it('reads a stated decimal as the step', () => {
    expect(parseQuery('$68.2 million').amounts[0]).toMatchObject({ low: 68_200_000, high: 68_299_999.99 })
  })

  it('reads an exact figure to the cent', () => {
    expect(amountRange('480,354')).toMatchObject({ low: 480_354, high: 480_354.99 })
    expect(amountRange('562,143.00')).toMatchObject({ low: 562_143, high: 562_143 })
  })

  it('reads thousands and billions, trailing zeros stating nothing', () => {
    expect(parseQuery('$250k').amounts[0]).toMatchObject({ low: 250_000, high: 259_999.99 })
    expect(parseQuery('$251k').amounts[0]).toMatchObject({ low: 251_000, high: 251_999.99 })
    expect(parseQuery('1.5 billion').amounts[0]).toMatchObject({ low: 1_500_000_000, high: 1_599_999_999.99 })
  })

  it('leaves short bare numbers as words and four-digit years as dates', () => {
    expect(parseQuery('2 more').amounts).toEqual([])
    expect(parseQuery('2 more').words).toEqual(['2', 'more'])
    expect(parseQuery('2025').dates).toEqual([{ from: '2025-01-01', to: '2025-12-31', source: '2025' }])
  })

  it('shows the parse as chips', () => {
    expect(parseChips(parseQuery('$68 million'))).toEqual(['Dollar amount $68,000,000 to $68,999,999.99'])
  })

  it('names the other spellings that give the same answer, leaving out the one typed', () => {
    expect(sameAnswerLines(parseQuery('$68 million'))).toEqual(['Same answer for 68 million · $68M · 68,000,000 · 68000000'])
    expect(sameAmounts(parseQuery('68000000').amounts[0]!)).toEqual(['$68 million', '68 million', '$68M', '68,000,000'])
    expect(sameAmounts(parseQuery('$68.2 million').amounts[0]!)).toEqual(['68.2 million', '$68.2M', '68,200,000', '68200000'])
    expect(sameAmounts(parseQuery('$480,354').amounts[0]!)).toEqual(['480,354', '480354'])
    expect(sameAmounts(parseQuery('$562,143.00').amounts[0]!)).toEqual(['562,143.00'])
    expect(sameAnswerLines(parseQuery('hvac'))).toEqual([])
  })

  it('every spelling it names reads as the same range', () => {
    for (const q of ['$68 million', '$250k', '1.5 billion', '$480,354', '$562,143.00']) {
      const [a] = parseQuery(q).amounts
      for (const other of sameAmounts(a!)) expect(parseQuery(other).amounts[0]).toMatchObject({ low: a!.low, high: a!.high })
    }
  })

  it('names the parts of the records a query matched in', () => {
    const doc = { title: 'HVAC replacement', summary: 'Approved for $562,143.00.', body: 'Odom Academy · CSP 26.16', presenter: 'Cheryl Hernandez', seconder: null, category: 'Facilities', campuses: ['Odom Academy'], amounts: [562_143], pay: null, date: '2026-08-20' }
    const pay = { ...doc, title: 'A Person — Stipend', summary: '', body: '', presenter: null, category: null, campuses: [], amounts: [81_980], pay: 81_980 }
    expect(matchedIn([doc], parseQuery('hvac hernandez'))).toEqual(['titles', 'people'])
    expect(matchedIn([doc], parseQuery('odom'))).toEqual(['terms', 'details'])
    expect(matchedIn([doc], parseQuery('CSP 26.16 august 2026'))).toEqual(['details', 'dates'])
    expect(matchedIn([doc, pay], parseQuery('$562,143'))).toEqual(['summaries'])
    expect(matchedIn([pay], parseQuery('$81,980'))).toEqual(['pay values'])
    expect(matchedIn([], parseQuery('hvac'))).toEqual([])
  })

  it('finds every figure a text writes', () => {
    expect(figuresIn('Approve $562,143.00 and $1,200,000; about $2.5 million more')).toEqual([562_143, 1_200_000, 2_500_000])
  })
})

describe('dates and months', () => {
  it('reads an ISO day, an ISO month, a written day and a month name with its year', () => {
    expect(parseQuery('2026-08-20').dates).toEqual([{ from: '2026-08-20', to: '2026-08-20', source: '2026-08-20' }])
    expect(parseQuery('2026-02').dates[0]).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(parseQuery('August 20, 2026').dates[0]).toMatchObject({ from: '2026-08-20', to: '2026-08-20' })
    expect(parseQuery('february 2026').dates[0]).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(parseQuery('Sept 2025').dates[0]).toMatchObject({ from: '2025-09-01', to: '2025-09-30' })
  })

  it('leaves an impossible day and a non-month alone', () => {
    expect(parseQuery('2026-02-30').dates).toEqual([])
    expect(parseQuery('decision 2026').words).toEqual(['decision'])
  })
})

describe('pay ranges', () => {
  it('reads a closed and an open range, in digits or k', () => {
    expect(parseQuery('pay:90000-125000').pay).toMatchObject({ min: 90_000, max: 125_000 })
    expect(parseQuery('pay:90k-125k').pay).toMatchObject({ min: 90_000, max: 125_000 })
    expect(parseQuery('pay:100000-').pay).toMatchObject({ min: 100_000, max: null })
    expect(parseQuery('pay:-1000').pay).toMatchObject({ min: null, max: 1_000 })
  })
})

describe('words, phrases and codes', () => {
  it('reads quoted phrases, policy and procurement codes, and the words between', () => {
    const parsed = parseQuery('"Sallie Curtis" CH(LOCAL) hvac RFP 25.11 CH (Local)')
    expect(parsed.phrases).toEqual(['sallie curtis'])
    expect(parsed.codes).toEqual(['CH(LOCAL)', 'RFP 25.11', 'CH (Local)'])
    expect(parsed.words).toEqual(['hvac'])
    expect(parsed.pieces).toEqual(['"Sallie Curtis"', 'CH(LOCAL)', 'hvac', 'RFP 25.11', 'CH (Local)'])
  })

  it('closes an unterminated quote', () => {
    expect(parseQuery('"west brook').phrases).toEqual(['west brook'])
  })

  it.each(['"', '""', 'foo "', '"a" ""', 'x ""'])('drops a lone or empty quote in %s', (q) => {
    const parsed = parseQuery(q)
    expect(parsed.phrases.every((p) => p.length > 0)).toBe(true)
    expect(parsed.pieces.every((p) => p !== '"' && p !== '""')).toBe(true)
  })

  it('never throws, whatever is typed', () => {
    const alphabet = 'a "$.,:-0123456789kKmM '
    let seed = 7
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed
    }
    for (let i = 0; i < 2000; i++) {
      const length = next() % 24
      let q = ''
      for (let j = 0; j < length; j++) q += alphabet[next() % alphabet.length]
      expect(() => parseQuery(q), JSON.stringify(q)).not.toThrow()
    }
  })

  it('reads an empty query as nothing', () => {
    expect(parseQuery('   ').pieces).toEqual([])
  })
})
