// /archive/pay: the pay records by district office, a histogram of the
// reported values, and the table's four sort keys. No ranking view: Value
// is a sort key, never a page or a callout of its own (brief decision 6).

import { str } from './record'
import type { ArchiveDoc } from './record'

export const PAY_SORTS = ['office', 'name', 'value', 'row'] as const
export type PaySort = (typeof PAY_SORTS)[number]

export interface PayRow {
  doc: ArchiveDoc
  person: string
  /** The last word of the name, as the workbook gives it: the default order within an office. */
  last: string
  position: string | null
  office: string
  value: number | null
  display: string | null
  row: number | null
}

export function payRows(docs: ArchiveDoc[]): PayRow[] {
  return docs
    .filter((d) => d.kind === 'pay_record')
    .map((doc) => {
      const person = str(doc.fields.person) ?? doc.title
      return {
        doc,
        person,
        last: person.split(/\s+/).at(-1) ?? person,
        position: str(doc.fields.position),
        office: doc.category ?? 'No office given',
        value: doc.pay,
        display: str(doc.fields.pay_display),
        row: Number(/row\s+(\d+)/i.exec(str(doc.fields.workbook_row) ?? '')?.[1] ?? NaN) || null,
      }
    })
}

const byName = (a: PayRow, b: PayRow) => a.last.localeCompare(b.last) || a.person.localeCompare(b.person)

export function sortPay(rows: PayRow[], sort: PaySort): PayRow[] {
  const copy = [...rows]
  switch (sort) {
    case 'office':
      return copy.sort((a, b) => a.office.localeCompare(b.office) || byName(a, b))
    case 'name':
      return copy.sort(byName)
    case 'value':
      return copy.sort((a, b) => (a.value ?? -1) - (b.value ?? -1) || byName(a, b))
    case 'row':
      return copy.sort((a, b) => (a.row ?? Infinity) - (b.row ?? Infinity))
  }
}

/** The values under this are set apart in their own hatched bin, past a break in the axis. */
export const SMALL_VALUE = 1_000
const BIN = 25_000

export interface Bin {
  label: string
  count: number
  small: boolean
}

/** The histogram: one bin for values under $1,000, then $25,000 bins from the first that holds a value to the last. */
export function histogram(rows: PayRow[]): Bin[] {
  const values = rows.map((r) => r.value).filter((v): v is number => v !== null)
  const small = values.filter((v) => v < SMALL_VALUE)
  const rest = values.filter((v) => v >= SMALL_VALUE)
  const bins: Bin[] = []
  if (small.length) bins.push({ label: 'Under $1,000', count: small.length, small: true })
  if (rest.length) {
    const first = Math.floor(Math.min(...rest) / BIN)
    const last = Math.floor(Math.max(...rest) / BIN)
    for (let i = first; i <= last; i++) {
      const lo = i * BIN
      bins.push({ label: `$${Math.max(lo, SMALL_VALUE) / 1000}K–${(lo + BIN) / 1000}K`, count: rest.filter((v) => Math.floor(v / BIN) === i).length, small: false })
    }
  }
  return bins
}
