// /archive/money and the data bucket page: the data buckets grouped by
// family, the Financial family by fund. The fund is the page's reading of a
// bucket's title and basis (General Fund, Debt Service and bonds, Capital
// projects, Child nutrition, Grants), not a field. A bucket's line items are
// split into a label and the figure it states (with the sign the text sets
// before it). A flow is drawn only where a bucket feeds others and its line
// items add up, to the dollar, to what it feeds (`pairingOf`). Staff and
// student buckets are counts, read by `countOf`, and drawn as ramps.

import { figuresIn, formatUsd } from './query'
import { list, num, str } from './record'
import type { ArchiveDoc } from './record'

export const FUNDS = [
  { key: 'general', name: 'General Fund', note: 'Revenue, spending, balances and amendments of the district’s operating fund.' },
  { key: 'debt', name: 'Debt Service and bonds', note: 'Debt service revenue and payments, bonded debt outstanding, defeasance and refunding bonds.' },
  { key: 'capital', name: 'Capital projects', note: 'The capital projects transfer and the facilities contract awards it paid for.' },
  { key: 'nutrition', name: 'Child nutrition', note: 'The child nutrition fund’s appropriations and transfers.' },
  { key: 'grants', name: 'Grants', note: 'Federal and state grant and mixed-fund program money and its spending.' },
] as const

export type FundKey = (typeof FUNDS)[number]['key']

/** The fund a Financial bucket belongs to, by the words in its title and basis. */
export function fundOf(doc: ArchiveDoc): FundKey {
  const words = `${doc.title} ${str(doc.fields.basis) ?? ''}`.toLowerCase()
  if (/nutrition/.test(words)) return 'nutrition'
  if (/grant|federal & state|mixed-fund/.test(words)) return 'grants'
  if (/capital|vatre/.test(words)) return 'capital'
  if (/debt|bond|defeas/.test(words)) return 'debt'
  return 'general'
}

export interface LineItem {
  label: string
  /** The figure the line states first, negative when the text sets a minus right before it; null when it states none. */
  value: number | null
  /** The sign the text sets right before that figure (`+$922,446`), else null. */
  sign: '+' | '−' | null
  text: string
}

/** A line item as its label (the words before its first figure, or its colon), that figure and its sign. */
export function lineItem(text: string): LineItem {
  const figure = figuresIn(text)[0] ?? null
  const at = /\$\s?\d/.exec(text)?.index ?? -1
  const signed = at > 0 ? /([+\-−])$/.exec(text.slice(0, at))?.[1] : undefined
  const sign = signed === '+' ? '+' : signed ? '−' : null
  const value = figure === null ? null : sign === '−' ? -figure : figure
  const colon = text.indexOf(':')
  const cut = colon > 0 && (at === -1 || colon < at) ? colon : at > 0 ? at : -1
  const label = (cut > 0 ? text.slice(0, cut) : text).replace(/[\s:+−–—-]+$/, '').trim()
  return { label: label || text, value, sign, text }
}

/** A line's figure as the text states it, its sign kept: `+$922,446`; null when it states none. */
export const lineFigure = (l: LineItem): string | null => (l.value === null ? null : `${l.sign ?? ''}${formatUsd(Math.abs(l.value))}`)

export interface Bucket {
  doc: ArchiveDoc
  family: string
  side: string | null
  total: number | null
  totalLabel: string | null
  basis: string | null
  lines: LineItem[]
  fedBy: string | null
  flowsTo: string | null
}

const same = (a: number, b: number) => Math.abs(a - b) < 1

export function bucketOf(doc: ArchiveDoc): Bucket {
  const f = doc.fields
  const lines = list(f.line_items).map(lineItem)
  return {
    doc,
    family: str(f.family) ?? doc.category ?? 'Financial',
    side: str(f.flow_side),
    total: num(f.total_value),
    totalLabel: str(f.total_label),
    basis: str(f.basis),
    lines,
    fedBy: str(f.fed_by),
    flowsTo: str(f.flows_to),
  }
}

// ---- Counts (staff and student buckets) ----

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DAY_BEFORE = new RegExp(`\\b${MONTH}\\.?\\s+$`, 'i')
const COUNT_NOUN = /^\s*(?:teachers?|hires?|students?|staff|positions?|employees?|people|persons?|members?|separations?|departures?|appointments?|retirees?|schools?|campuses|records?|rows?)\b/i

/**
 * The count a text states, or null. Dates (`07-01-2025`, `May 5, 2026`),
 * years (`2025`, `FY2025-26`), ordinals, percents, dollar figures, dotted
 * item numbers (`II.G.5`), list markers (`1.`) and digits inside words
 * (`HB2`) are skipped. Of what is left, a number with thousands separators or
 * followed by a count noun (`823 students`) comes first, then one set apart
 * as a count (`(33)`, `~820`), then the first plain number.
 */
export function countIn(text: string): number | null {
  let best: { value: number; score: number } | null = null
  for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)) {
    const i = m.index
    const j = i + m[0].length
    const before = text.slice(0, i)
    const after = text.slice(j)
    if (/[A-Za-z0-9.\-–\/$]$/.test(before)) continue
    if (/^(?:[A-Za-z%\/\-–]|[.,:]\d)/.test(after)) continue
    const plain = !m[0].includes(',')
    const value = Number(m[0].replace(/,/g, ''))
    if (plain && m[0].length === 4 && value >= 1900 && value <= 2099) continue
    if (DAY_BEFORE.test(before)) continue
    if (/^\.\s/.test(after) && /(?:^|[|:])\s*$/.test(before)) continue
    const score = !plain || COUNT_NOUN.test(after) ? 3 : /[(~]\s*$/.test(before) ? 2 : 1
    if (!best || score > best.score) best = { value, score }
  }
  return best?.value ?? null
}

/** A count bucket's count: its total_value, else its line items' counts summed, else the first of its title, total label and summary that states one. */
export function countOf(doc: ArchiveDoc): number | null {
  const total = num(doc.fields.total_value)
  if (total !== null) return total
  const lines = list(doc.fields.line_items).map(countIn)
  if (lines.length > 0 && lines.every((n) => n !== null)) return lines.reduce<number>((a, b) => a + (b ?? 0), 0)
  for (const text of [doc.title, str(doc.fields.total_label), doc.summary]) {
    const n = text ? countIn(text) : null
    if (n !== null) return n
  }
  return null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The first calendar day a text writes out (`May 5, 2026`), as YYYY-MM-DD. */
export function dayIn(text: string): string | null {
  const m = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2}),?\\s+((?:19|20)\\d{2})\\b`, 'i').exec(text)
  if (!m) return null
  const month = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
}

/** The agenda item a text cites (`Agenda Item II.G.5`, `Action Item III.C`). */
export const itemIn = (text: string): string | null => /\bItem\s+([IVX]+(?:\.[A-Z0-9]+)+)/.exec(text)?.[1] ?? null

/** How a ramp is filled: a stated total solid, a part a total names hatched, a remainder derived from the others open. */
export type RampFill = 'solid' | 'hatched' | 'open'

/** The counts a summary breaks a total into (`Retire: 3 | Resign: 4 | Termination: 1`), or null without two. */
function breakdownOf(doc: ArchiveDoc): number[] | null {
  const parts = doc.summary.split('|').map(countIn)
  return parts.length > 1 && parts.every((n) => n !== null) ? (parts as number[]) : null
}

const textOf = (doc: ArchiveDoc) => [doc.title, str(doc.fields.total_label) ?? '', doc.summary].join(' ')

/** Each counted bucket's fill within its family (see RampFill). */
function fillsOf(counted: Array<{ doc: ArchiveDoc; count: number }>): Map<string, RampFill> {
  const fills = new Map<string, RampFill>()
  const remainder = (doc: ArchiveDoc) => /\b(?:calculation|derived|minus|not separately itemized)\b/i.test(textOf(doc))
  const totals = counted.filter(({ doc, count }) => {
    if (remainder(doc)) return false
    const parts = breakdownOf(doc)
    return /\btotal\b/i.test(textOf(doc)) || (parts !== null && parts.reduce((a, b) => a + b, 0) === count)
  })
  const named = new Set(totals.flatMap(({ doc }) => breakdownOf(doc) ?? []))
  for (const { doc, count } of counted) {
    fills.set(doc.id, remainder(doc) ? 'open' : totals.some((t) => t.doc.id === doc.id) ? 'solid' : named.has(count) ? 'hatched' : 'solid')
  }
  return fills
}

// ---- Flows between buckets ----

export interface FlowSide {
  label: string
  value: number
  href?: string
  /** The line under the label beside the figure: the bucket's mark, "this bucket", where a part is named. */
  note?: string
  /** Drawn white: the bucket the page is about. */
  solid?: boolean
}

export interface Pairing {
  /** The bucket whose line items flow in. */
  feeder: Bucket
  left: FlowSide[]
  /** The buckets it feeds at their totals, largest first, then any part its flows_to names that none of them is. */
  right: FlowSide[]
  /** The buckets on the right. */
  fed: Bucket[]
  total: number
}

/** The bucket marks (`left-01`, `right-02`) a fed_by or flows_to text names. */
const marksIn = (text: string | null): string[] => [...new Set(text?.match(/\b(?:left|right|node)-\d+\b/g) ?? [])]

/** A fed_by or flows_to text cut at the marks it names, each mark (with a `Bucket_Details/` before it) carrying the bucket's address. */
export function linkedMarks(text: string, buckets: Bucket[]): Array<{ text: string; href?: string; title?: string }> {
  const parts: Array<{ text: string; href?: string; title?: string }> = []
  let from = 0
  for (const m of text.matchAll(/(?:Bucket_Details\/)?\b((?:left|right|node)-\d+)\b/g)) {
    const bucket = buckets.find((b) => b.doc.mark === m[1])
    if (!bucket) continue
    if (m.index > from) parts.push({ text: text.slice(from, m.index) })
    parts.push({ text: m[0], href: bucket.doc.url, title: bucket.doc.title })
    from = m.index + m[0].length
  }
  if (from < text.length) parts.push({ text: text.slice(from) })
  return parts
}

/** The parts a flows_to text names with a figure: `Transfer to Capital Projects Fund ($9,724,724)`, `Issuance Costs: $100,000`. */
export function namedParts(text: string | null): Array<{ label: string; value: number }> {
  if (!text) return []
  const head = text.split(/\s--\s*see\b/i)[0]!
  const parts: Array<{ label: string; value: number }> = []
  for (const m of head.matchAll(/([A-Za-z][^,;:()$]*?)\s*(?:\(([^)]*\$[^)]*)\)|:\s*(\$\s?[\d,]+(?:\.\d+)?))/g)) {
    const value = figuresIn(m[2] ?? m[3] ?? '')[0]
    const label = m[1]!.replace(/^and\s+/i, '').trim()
    if (value !== undefined && label) parts.push({ label, value })
  }
  return parts
}

/** The buckets a bucket feeds: those whose fed_by names it, and those its flows_to names. */
function fedOf(feeder: Bucket, buckets: Bucket[]): Bucket[] {
  const mark = feeder.doc.mark
  if (!mark) return []
  const named = marksIn(feeder.flowsTo)
  return buckets.filter((b) => b !== feeder && b.family === feeder.family && b.doc.mark !== null && (marksIn(b.fedBy).includes(mark) || named.includes(b.doc.mark)))
}

const sumOf = (sides: Array<{ value: number }>) => sides.reduce((n, s) => n + s.value, 0)

/**
 * The flow a feeder draws: its line items in, the buckets it feeds out at
 * their totals, when the two add up to the dollar; failing that, with the
 * parts its flows_to names that no fed bucket is (a transfer out) added to
 * the out side. Otherwise the reason it cannot be drawn, in one line.
 */
export function feederFlow(feeder: Bucket, buckets: Bucket[]): { pairing: Pairing } | { pairing: null; reason: string } {
  const mark = feeder.doc.mark ?? 'The bucket'
  const fed = fedOf(feeder, buckets)
  if (fed.length === 0) return { pairing: null, reason: `${mark} names no bucket it feeds.` }
  const untotalled = fed.find((b) => b.total === null)
  if (untotalled) return { pairing: null, reason: `${untotalled.doc.mark ?? untotalled.doc.title} states no total to draw.` }
  const left: FlowSide[] = feeder.lines.filter((l) => l.value !== null && l.value > 0).map((l) => ({ label: l.label, value: l.value! }))
  if (left.length === 0) return { pairing: null, reason: `${mark}’s line items state no figures to draw.` }
  const sorted = [...fed].sort((a, b) => b.total! - a.total!)
  const out: FlowSide[] = sorted.map((b) => ({ label: b.doc.title, value: b.total!, href: b.doc.url, note: b.doc.mark ?? undefined }))
  const extras: FlowSide[] = namedParts(feeder.flowsTo)
    .filter((p) => !fed.some((b) => same(b.total!, p.value)))
    .map((p) => ({ label: p.label, value: p.value, note: `named in ${mark}’s flows_to` }))
  const inSum = sumOf(left)
  for (const right of [out, [...out, ...extras]]) {
    if (same(inSum, sumOf(right))) return { pairing: { feeder, left, right, fed: sorted, total: inSum } }
  }
  return { pairing: null, reason: `${mark}’s line items add up to ${formatUsd(inSum)}, the buckets it feeds to ${formatUsd(sumOf(out))}.` }
}

/**
 * The flow a bucket sits in: as the feeder, else fed by a bucket its fed_by
 * names or whose flows_to names it. Null with no reason when the bucket names
 * no flow at all; null with the first reason when none can be drawn.
 */
export function flowFor(bucket: Bucket, buckets: Bucket[]): { pairing: Pairing | null; reason: string | null } {
  const reasons: string[] = []
  const feeders = [
    ...(fedOf(bucket, buckets).length > 0 ? [bucket] : []),
    ...buckets.filter((b) => b !== bucket && b.family === bucket.family && ((b.doc.mark !== null && marksIn(bucket.fedBy).includes(b.doc.mark)) || (bucket.doc.mark !== null && marksIn(b.flowsTo).includes(bucket.doc.mark)))),
  ]
  for (const feeder of feeders) {
    const flow = feederFlow(feeder, buckets)
    if (flow.pairing) return { pairing: flow.pairing, reason: null }
    reasons.push(flow.reason)
  }
  if (feeders.length === 0 && marksIn(bucket.fedBy).length > 0) reasons.push(`The bucket its fed_by names (${marksIn(bucket.fedBy).join(', ')}) is not in the archive.`)
  return { pairing: null, reason: reasons[0] ?? null }
}

// ---- The page ----

export interface CountRamp {
  bucket: Bucket
  count: number | null
  fill: RampFill
}

export interface DatedBucket {
  bucket: Bucket
  day: string
  item: string | null
}

export interface MoneyView {
  families: Array<{ name: string; count: number }>
  funds: Array<{ key: FundKey; name: string; note: string; buckets: Bucket[]; flows: Pairing[] }>
  /** Staff and student buckets: the counts as ramps (the family's largest the full width), the dated ones as a list. */
  counts: Array<{ name: string; size: number; ramps: CountRamp[]; dated: DatedBucket[]; max: number }>
  /** How many Financial buckets feed others (each fund's flows are the ones that balance). */
  feeders: number
}

/** The families in the archive's order. */
const FAMILY_ORDER = ['Financial', 'Staff population', 'Student population']

const SIDE_ORDER: Record<string, number> = { Inflow: 0, Node: 1, Outflow: 2 }

export function moneyView(docs: ArchiveDoc[]): MoneyView {
  const buckets = docs.filter((d) => d.kind === 'data_bucket').map(bucketOf)
  const families = new Map<string, Bucket[]>()
  for (const b of buckets) families.set(b.family, [...(families.get(b.family) ?? []), b])
  const financial = families.get('Financial') ?? []
  const bySlug = (a: Bucket, b: Bucket) => (SIDE_ORDER[a.side ?? ''] ?? 1) - (SIDE_ORDER[b.side ?? ''] ?? 1) || a.doc.slug.localeCompare(b.doc.slug)
  const order = (name: string) => {
    const i = FAMILY_ORDER.indexOf(name)
    return i === -1 ? FAMILY_ORDER.length : i
  }
  const sorted = [...families].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
  const feeders = financial.filter((b) => fedOf(b, financial).length > 0)
  const flows = feeders.map((b) => feederFlow(b, financial).pairing).filter((p): p is Pairing => p !== null)
  return {
    families: sorted.map(([name, list]) => ({ name, count: list.length })),
    funds: FUNDS.map((fund) => {
      const inFund = financial.filter((b) => fundOf(b.doc) === fund.key).sort(bySlug)
      return { ...fund, buckets: inFund, flows: flows.filter((p) => inFund.includes(p.feeder)) }
    }).filter((f) => f.buckets.length > 0),
    counts: sorted
      .filter(([name]) => name !== 'Financial')
      .map(([name, list]) => {
        const read = [...list].sort(bySlug).map((bucket) => {
          const count = countOf(bucket.doc)
          const text = `${bucket.doc.title} ${bucket.doc.summary}`
          return { bucket, count, day: count === null ? dayIn(text) : null, item: itemIn(text) }
        })
        const counted = read.filter((r): r is typeof r & { count: number } => r.count !== null)
        const fills = fillsOf(counted.map((r) => ({ doc: r.bucket.doc, count: r.count })))
        return {
          name,
          size: list.length,
          ramps: read.filter((r) => r.day === null).map((r) => ({ bucket: r.bucket, count: r.count, fill: fills.get(r.bucket.doc.id) ?? 'solid' })),
          dated: read.filter((r): r is typeof r & { day: string } => r.day !== null).map((r) => ({ bucket: r.bucket, day: r.day, item: r.item })),
          max: Math.max(1, ...counted.map((r) => r.count)),
        }
      }),
    feeders: feeders.length,
  }
}
