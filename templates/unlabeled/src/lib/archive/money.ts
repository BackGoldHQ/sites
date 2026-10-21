// /archive/money: the data buckets grouped by family, the Financial family
// by fund. The fund is the page's reading of a bucket's title and basis
// (General Fund, Debt Service and bonds, Capital projects, Child nutrition,
// Grants), not a field. A bucket's line items are split into a label and the
// figure it states, and a flow is drawn only where those figures add up to
// the bucket's own total.

import { figuresIn } from './query'
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
  /** The figure the line states first; null when it states none. */
  value: number | null
  text: string
}

/** A line item as its label (the words before its first figure, or its colon) and that figure. */
export function lineItem(text: string): LineItem {
  const value = figuresIn(text)[0] ?? null
  const colon = text.indexOf(':')
  const dollar = text.indexOf('$')
  const cut = colon > 0 && (dollar === -1 || colon < dollar) ? colon : dollar > 0 ? dollar : -1
  const label = (cut > 0 ? text.slice(0, cut) : text).replace(/[\s:–—-]+$/, '').trim()
  return { label: label || text, value, text }
}

export interface Bucket {
  doc: ArchiveDoc
  family: string
  side: string | null
  total: number | null
  totalLabel: string | null
  basis: string | null
  lines: LineItem[]
  /** True when the lines' figures add up to the total, to the dollar: the only buckets drawn as a flow. */
  balanced: boolean
}

export function bucketOf(doc: ArchiveDoc): Bucket {
  const f = doc.fields
  const lines = list(f.line_items).map(lineItem)
  const total = num(f.total_value)
  const values = lines.map((l) => l.value)
  const sum = values.every((v) => v !== null) ? values.reduce<number>((a, b) => a + (b ?? 0), 0) : null
  return {
    doc,
    family: str(f.family) ?? doc.category ?? 'Financial',
    side: str(f.flow_side),
    total,
    totalLabel: str(f.total_label),
    basis: str(f.basis),
    lines,
    balanced: total !== null && lines.length > 1 && sum !== null && Math.abs(sum - total) < 1,
  }
}

/** The first count a staff or student bucket states (`~1,046`, `(226)`), for its ramp. */
export function countOf(doc: ArchiveDoc): number | null {
  const m = /(?:~|\()?\b(\d{1,3}(?:,\d{3})+|\d+)\b/.exec(`${doc.title} ${doc.summary}`.replace(/\b(19|20)\d{2}(-\d{2})?\b/g, ' '))
  return m ? Number(m[1]!.replace(/,/g, '')) : null
}

export interface MoneyView {
  families: Array<{ name: string; count: number }>
  funds: Array<{ key: FundKey; name: string; note: string; buckets: Bucket[] }>
  /** Staff and student buckets, each family with its largest count (the ramps' full width). */
  counts: Array<{ name: string; buckets: Array<Bucket & { count: number | null }>; max: number }>
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
  return {
    families: sorted.map(([name, list]) => ({ name, count: list.length })),
    funds: FUNDS.map((fund) => ({ ...fund, buckets: financial.filter((b) => fundOf(b.doc) === fund.key).sort(bySlug) })).filter((f) => f.buckets.length > 0),
    counts: sorted
      .filter(([name]) => name !== 'Financial')
      .map(([name, list]) => {
        const withCount = list.map((b) => ({ ...b, count: countOf(b.doc) })).sort(bySlug)
        return { name, buckets: withCount, max: Math.max(1, ...withCount.map((b) => b.count ?? 0)) }
      }),
  }
}
