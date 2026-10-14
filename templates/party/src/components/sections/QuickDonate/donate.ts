// A QuickDonate's choices as its layouts draw them: the donate link (the
// section's one link, whose label is the button's), the amounts, the one that
// starts selected, the monthly switch when the section offers it, and the
// address each choice hands to BackGold's donate page (and, for the jar
// layout, its unit and the quantities of it). The donate page reads
// `?amount=` in whole dollars from 1 to 99,999 and `?frequency=monthly`, so an
// amount outside that is left out here rather than sent and ignored there.
// Null when the section has no donate link: there is nothing to give through.

import type { Section } from '@backgold/content'
import { links, type Link } from '../../../lib/section'
import { formatCents, text } from '../../../lib/format'

/** The amounts when the section names none the donate page would take. */
const DEFAULT_AMOUNTS = [10, 25, 50, 100, 250]
/** Three rows of three, with Other. */
const MAX_AMOUNTS = 8

export interface QuickDonate {
  donate: Link
  /** Whole dollars, in the order the section lists them. */
  amounts: number[]
  /** The amount that starts selected, when the section's default is one of them. */
  selected: number | null
  /** The monthly switch's label, or null when the section does not offer it. */
  monthly: string | null
  note: string | null
}

function wholeDollars(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim().replace(/^\$/, '') : ''
  if (!/^\d{1,5}$/.test(raw)) return null
  const dollars = Number(raw)
  return dollars >= 1 && dollars <= 99999 ? dollars : null
}

function amountsOf(value: unknown): number[] {
  const parts = typeof value === 'string' ? value.split(',') : []
  const amounts = [...new Set(parts.map(wholeDollars).filter((n): n is number => n !== null))]
  return amounts.length > 0 ? amounts.slice(0, MAX_AMOUNTS) : DEFAULT_AMOUNTS
}

export function quickDonate(section: Section): QuickDonate | null {
  const [donate] = links(section)
  if (!donate) return null
  const amounts = amountsOf(section.options?.amounts)
  const preset = wholeDollars(section.options?.defaultAmount)
  return {
    donate,
    amounts,
    selected: preset !== null && amounts.includes(preset) ? preset : null,
    monthly: section.options?.monthly === true ? (text(section.copy.monthlyLabel) ?? 'Make it monthly') : null,
    note: text(section.copy.note),
  }
}

/** "$25", "$1,000". */
export function dollars(amount: number): string {
  return formatCents(amount * 100) ?? `$${amount}`
}

/** The donate address with `?amount=` set, or with none for Other (any amount already on the link is replaced). */
export function amountHref(href: string, amount: number | null): string {
  const url = new URL(href, 'https://site.invalid')
  url.searchParams.delete('amount')
  if (amount !== null) url.searchParams.set('amount', String(amount))
  return url.origin === 'https://site.invalid' ? `${url.pathname}${url.search}${url.hash}` : url.href
}

/** The button's words: "Donate $25" with an amount selected, else the link's own label. */
export function giveLabel(qd: QuickDonate): string {
  return qd.selected === null ? qd.donate.label : `${qd.donate.label} ${dollars(qd.selected)}`
}

/** The jar layout's quantities of its unit. */
const JAR_COUNTS = [1, 3, 5]

export interface Jar {
  /** Whole dollars: one of what the jar asks for. */
  unit: number
  /** Each quantity with its total; a quantity whose total the donate page would not take is left out. */
  choices: { count: number; amount: number }[]
}

/**
 * The jar layout's choices: its unit is the section's default amount when
 * the donate page would take it, else the first of its amounts (the rest are
 * not drawn), offered as 1, 3 and 5 of it.
 */
export function jarOf(section: Section, qd: QuickDonate): Jar {
  const unit = wholeDollars(section.options?.defaultAmount) ?? qd.amounts[0]
  const choices = JAR_COUNTS.map((count) => ({ count, amount: unit * count })).filter((c) => wholeDollars(c.amount) !== null)
  return { unit, choices }
}
