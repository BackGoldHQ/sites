// The archive's query grammar: what the search box understands, read out of
// one string. The server's results page and the island both parse with this
// module, so a query means the same thing with scripts on or off.
//
//   plain words         superintendent · west brook · cheryl hernandez
//   a quoted phrase     "sallie curtis"
//   a policy code       CH(LOCAL) · CH (Local) · RFP 25.11 · CSP 26.16
//   a dollar amount     $68 million · 68 million · $68M · 68,000,000 · 68000000
//   a pay range         pay:90000-125000 · pay:90k-125k
//   a date or a month   2026-08-20 · 2026-08 · August 20, 2026 · february 2026 · 2025
//
// A dollar amount is read to its stated precision: "$68 million" and
// "68,000,000" both mean $68,000,000 to $68,999,999, and "$480,354" means
// that figure to the cent. Plain numbers count as amounts when they carry a
// `$`, a scale word, thousands separators, or five or more digits; a
// four-digit number from 1900 to 2099 is a year.

/** An inclusive range of dollars. */
export interface AmountRange {
  low: number
  high: number
  /** The words that asked for it, as typed. */
  source: string
}

/** An inclusive range of days, as YYYY-MM-DD. */
export interface DateRange {
  from: string
  to: string
  source: string
}

export interface ParsedQuery {
  /** The query as typed, trimmed. */
  raw: string
  /** Words for the full-text index, in order. */
  words: string[]
  /** Quoted phrases, lower case, inner spaces collapsed. */
  phrases: string[]
  /** Policy and procurement codes, as typed. */
  codes: string[]
  amounts: AmountRange[]
  pay: { min: number | null; max: number | null; source: string } | null
  dates: DateRange[]
  /** Every piece the query was read into, in order, for "closest smaller query". */
  pieces: string[]
}

const SCALES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mil: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** A month name or its three-letter (or "sept") abbreviation as 1–12; null for anything else. */
export function monthOf(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, '')
  if (w.length < 3) return null
  const i = MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w) && (w.length === 3 || w === 'sept')))
  return i === -1 ? null : i + 1
}

const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const isDay = (year: number, month: number, day: number) => month >= 1 && month <= 12 && day >= 1 && day <= lastDay(year, month)

/**
 * A figure (digits with optional separators and decimals) and an optional
 * scale as the range its stated precision covers: the last stated digit's
 * place is the step. `68` million is 68,000,000–68,999,999; `68.2` million
 * is 68,200,000–68,299,999; `68000000` is the same as `68` million (trailing
 * zeros state nothing); `480,354` is exact; `$562,143.00` is exact to the cent.
 */
export function amountRange(figure: string, scale = 1, source = figure): AmountRange | null {
  const clean = figure.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(clean)) return null
  const [whole, fraction = ''] = clean.split('.') as [string, string?]
  const value = Number(clean) * scale
  if (!Number.isFinite(value) || value <= 0) return null
  let step: number
  if (fraction.length > 0) {
    // Stated decimals: the last one is the step (cents on a bare figure).
    step = scale * 10 ** -fraction.length
  } else {
    const zeros = /0*$/.exec(whole)![0].length
    step = scale * 10 ** Math.min(zeros, whole.length - 1)
  }
  // Below a cent nothing is stated: a whole figure at scale 1 covers its cents.
  const high = value + Math.max(step, 0.01) - 0.01
  return { low: round2(value), high: round2(high), source }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** `90000`, `90k`, `1.2m` as a number; null for anything else. */
function payFigure(raw: string): number | null {
  const m = /^\$?(\d+(?:\.\d+)?)(k|m)?$/i.exec(raw.replace(/,/g, ''))
  if (!m) return null
  return Number(m[1]) * (m[2] ? SCALES[m[2].toLowerCase()]! : 1)
}

// Tokens are read left to right by these patterns, first match wins.
const PHRASE = /^"([^"]*)"?/
const PAY = /^pay:\s*(\$?[\d.,]+[km]?)?\s*(?:-|–|to)\s*(\$?[\d.,]+[km]?)?(?=\s|$)/i
const PAREN_CODE = /^([a-z]{1,4})\s?\((local|legal|exhibit|regulation)\)/i
const DOT_CODE = /^([a-z]{2,5})\s?(\d{1,3}\.\d{1,3})(?![\d.])/i
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})(?![\d-])/
const ISO_MONTH = /^(\d{4})-(\d{2})(?![\d-])/
const WORD_DATE = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/i
const MONTH_YEAR = /^([a-z]{3,9})\.?,?\s+(\d{4})(?!\d)/i
const MONEY = /^(\$)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(k|m|mm|mil|million|thousand|b|bn|billion)?(?![a-z\d])/i
const WORD = /^[^\s"]+/

/** The query, read. Total: it never throws, and anything unrecognized is a word. */
export function parseQuery(input: string | null | undefined): ParsedQuery {
  const raw = (input ?? '').trim().replace(/\s+/g, ' ')
  const out: ParsedQuery = { raw, words: [], phrases: [], codes: [], amounts: [], pay: null, dates: [], pieces: [] }
  let rest = raw
  while (rest.length > 0) {
    rest = rest.replace(/^\s+/, '')
    if (!rest) break
    let m: RegExpExecArray | null
    const take = (n: number, piece: string) => {
      out.pieces.push(piece)
      rest = rest.slice(n)
    }
    if ((m = PHRASE.exec(rest))) {
      // A lone or empty quote asks for nothing and is dropped.
      const phrase = m[1]!.trim().toLowerCase().replace(/\s+/g, ' ')
      if (phrase) {
        out.phrases.push(phrase)
        out.pieces.push(m[0].length > 1 && m[0].endsWith('"') ? m[0] : `"${m[1]!.trim()}"`)
      }
      rest = rest.slice(m[0].length)
      continue
    }
    if ((m = PAY.exec(rest))) {
      const min = m[1] ? payFigure(m[1]) : null
      const max = m[2] ? payFigure(m[2]) : null
      if (min !== null || max !== null) {
        out.pay = { min, max, source: m[0] }
        take(m[0].length, m[0])
        continue
      }
    }
    if ((m = PAREN_CODE.exec(rest)) || (m = DOT_CODE.exec(rest))) {
      out.codes.push(m[0])
      take(m[0].length, m[0])
      continue
    }
    if ((m = ISO_DAY.exec(rest))) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
      if (isDay(y, mo, d)) {
        out.dates.push({ from: m[0], to: m[0], source: m[0] })
        take(m[0].length, m[0])
        continue
      }
    }
    if ((m = ISO_MONTH.exec(rest))) {
      const [y, mo] = [Number(m[1]), Number(m[2])]
      if (mo >= 1 && mo <= 12) {
        out.dates.push({ from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${pad(lastDay(y, mo))}`, source: m[0] })
        take(m[0].length, m[0])
        continue
      }
    }
    // A date-shaped token that names no day is one word, never a year and a number.
    if ((m = /^\d{4}-\d{2}(?:-\d{2})?(?![\d-])/.exec(rest))) {
      out.words.push(m[0])
      take(m[0].length, m[0])
      continue
    }
    if ((m = WORD_DATE.exec(rest))) {
      const mo = monthOf(m[1]!)
      const [d, y] = [Number(m[2]), Number(m[3])]
      if (mo !== null && isDay(y, mo, d)) {
        const day = `${y}-${pad(mo)}-${pad(d)}`
        out.dates.push({ from: day, to: day, source: m[0] })
        take(m[0].length, m[0])
        continue
      }
    }
    if ((m = MONTH_YEAR.exec(rest))) {
      const mo = monthOf(m[1]!)
      const y = Number(m[2])
      if (mo !== null) {
        out.dates.push({ from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${pad(lastDay(y, mo))}`, source: m[0] })
        take(m[0].length, m[0])
        continue
      }
    }
    if ((m = MONEY.exec(rest))) {
      const [, dollar, figure, scaleWord] = m
      const digits = figure!.replace(/[,.]/g, '').length
      const grouped = figure!.includes(',')
      const year = !dollar && !scaleWord && !grouped && /^\d{4}$/.test(figure!) && Number(figure) >= 1900 && Number(figure) <= 2099
      if (year) {
        out.dates.push({ from: `${figure}-01-01`, to: `${figure}-12-31`, source: m[0] })
        take(m[0].length, m[0])
        continue
      }
      if (dollar || scaleWord || grouped || (digits >= 5 && !figure!.includes('.'))) {
        const range = amountRange(figure!, scaleWord ? SCALES[scaleWord.toLowerCase()]! : 1, m[0].trim())
        if (range) {
          out.amounts.push(range)
          take(m[0].length, m[0].trim())
          continue
        }
      }
    }
    // Every other run of characters up to a space or a quote is a word; a
    // quote is always taken above, so this always consumes something.
    const word = WORD.exec(rest)?.[0] ?? rest.charAt(0)
    // A dangling `$` or punctuation on its own says nothing.
    if (/[\p{L}\p{N}]/u.test(word)) out.words.push(word)
    take(word.length, word)
  }
  return out
}

/** True when the query asks for nothing at all. */
export const isEmptyQuery = (q: ParsedQuery): boolean =>
  q.words.length === 0 && q.phrases.length === 0 && q.codes.length === 0 && q.amounts.length === 0 && q.pay === null && q.dates.length === 0

/** A policy or procurement code with its spaces and case gone, for matching: `CH (Local)` is `ch(local)`. */
export const codeKey = (code: string): string => code.toLowerCase().replace(/\s+/g, '')

/** Text lowered, accents gone and whitespace collapsed, as phrases and codes are matched against. */
export function foldText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Every dollar figure written in a text (`$1,200,000`, `$562,143.00`, `$2.5 million`), as numbers. */
export function figuresIn(text: string): number[] {
  const found: number[] = []
  const re = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(million|billion|thousand|[mbk])\b)?/gi
  for (const m of text.matchAll(re)) {
    const scale = m[2] ? SCALES[m[2].toLowerCase()]! : 1
    const n = Number(m[1]!.replace(/,/g, '')) * scale
    if (Number.isFinite(n) && n > 0) found.push(round2(n))
  }
  return found
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A dollar figure as written on the page: no cents when it has none. */
export const formatUsd = (n: number): string => (Number.isInteger(n) ? usd0.format(n) : usd2.format(n))

/** What a parsed query was read as, for the dashed chips under the field. */
export function parseChips(q: ParsedQuery): string[] {
  const chips: string[] = []
  for (const a of q.amounts) chips.push(a.low === a.high ? `Dollar amount ${formatUsd(a.low)}` : `Dollar amount ${formatUsd(a.low)} to ${formatUsd(a.high)}`)
  if (q.pay) {
    const { min, max } = q.pay
    chips.push(min !== null && max !== null ? `Pay value ${formatUsd(min)} to ${formatUsd(max)}` : min !== null ? `Pay value ${formatUsd(min)} or more` : `Pay value up to ${formatUsd(max!)}`)
  }
  for (const d of q.dates) chips.push(d.from === d.to ? `Date ${d.from}` : `Dates ${d.from} to ${d.to}`)
  for (const c of q.codes) chips.push(`Code ${c}`)
  for (const p of q.phrases) chips.push(`Phrase “${p}”`)
  return chips
}

const SCALE_SPELLINGS = [
  { scale: 1e9, word: 'billion', letter: 'B' },
  { scale: 1e6, word: 'million', letter: 'M' },
  { scale: 1e3, word: 'thousand', letter: 'K' },
] as const

/**
 * The other ways of writing a dollar amount that read as the same range
 * (board U2, frame 3): with the scale word, with its letter, with thousands
 * separators, as bare digits. Each spelling is parsed back and kept only
 * when it asks for exactly this range; the spelling that was typed is left
 * out. "$68 million" gives 68 million · $68M · 68,000,000 · 68000000.
 */
export function sameAmounts(a: AmountRange): string[] {
  const candidates: string[] = []
  for (const { scale, word, letter } of SCALE_SPELLINGS) {
    const n = round2(a.low / scale)
    if (n < 1 || Math.abs(n * scale - a.low) > 0.001) continue
    const figure = String(n)
    candidates.push(`$${figure} ${word}`, `${figure} ${word}`, `$${figure}${letter}`)
    break
  }
  const whole = Number.isInteger(a.low)
  candidates.push(a.low.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }))
  if (whole) candidates.push(`${a.low.toLocaleString('en-US')}.00`, String(a.low))
  const typed = a.source.toLowerCase().replace(/\s+/g, ' ')
  const out: string[] = []
  for (const c of candidates) {
    if (c.toLowerCase() === typed || out.includes(c)) continue
    const back = parseQuery(c)
    if (back.amounts.length === 1 && back.words.length === 0 && back.amounts[0]!.low === a.low && back.amounts[0]!.high === a.high) out.push(c)
  }
  return out
}

/** The "Same answer for …" line under the field for each dollar amount the query asks for, when it has other spellings. */
export function sameAnswerLines(q: ParsedQuery): string[] {
  return q.amounts.map(sameAmounts).filter((same) => same.length > 0).map((same) => `Same answer for ${same.join(' · ')}`)
}

/** What "Matched in" reads of a record: the search document's text parts. */
export interface MatchableDoc {
  title: string
  summary: string
  body: string
  presenter: string | null
  seconder: string | null
  category: string | null
  campuses: string[]
  amounts: number[]
  pay: number | null
  date: string | null
}

/** The parts of a record "Matched in" names, in the order it names them. */
const MATCH_PARTS = ['titles', 'summaries', 'people', 'terms', 'details', 'pay values', 'dates'] as const

/**
 * Where the query's parts were found across the records it matched (board
 * U2, frame 3, "Matched in titles · details · pay values"): words, phrases
 * and codes by the part of each record that holds them, dollar amounts by
 * the figure they hit (a pay record's value, else the title, the summary or
 * the other fields), a pay range in pay values, a date in dates. Empty when
 * the query asks for nothing or nothing matched.
 */
export function matchedIn(docs: MatchableDoc[], q: ParsedQuery): string[] {
  const found = new Set<(typeof MATCH_PARTS)[number]>()
  const needles = [...q.words, ...q.phrases].map((w) => foldText(w)).filter(Boolean)
  const codes = q.codes.map(codeKey)
  for (const doc of docs) {
    const parts = {
      titles: foldText(doc.title),
      summaries: foldText(doc.summary),
      people: foldText([doc.presenter ?? '', doc.seconder ?? ''].join(' ')),
      terms: foldText([doc.category ?? '', ...doc.campuses].join(' ')),
      details: foldText(doc.body),
    }
    for (const [part, text] of Object.entries(parts) as Array<[keyof typeof parts, string]>) {
      if (needles.some((n) => text.includes(n)) || codes.some((c) => text.replace(/\s+/g, '').includes(c))) found.add(part)
    }
    for (const a of q.amounts) {
      const hit = (n: number) => n >= a.low && n <= a.high
      if (doc.pay !== null && hit(doc.pay)) found.add('pay values')
      else if (figuresIn(doc.title).some(hit)) found.add('titles')
      else if (figuresIn(doc.summary).some(hit)) found.add('summaries')
      else if (doc.amounts.some(hit)) found.add('details')
    }
    if (q.pay && doc.pay !== null) found.add('pay values')
    if (q.dates.length > 0 && doc.date !== null) found.add('dates')
  }
  return MATCH_PARTS.filter((p) => found.has(p))
}

/** The "Matched in …" line under the field; null when nothing matched. */
export function matchedLine(docs: MatchableDoc[], q: ParsedQuery): string | null {
  const parts = matchedIn(docs, q)
  return parts.length > 0 ? `Matched in ${parts.join(' · ')}` : null
}
