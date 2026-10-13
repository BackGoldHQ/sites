// A Membership's rows as its layouts draw them. BackGold bakes the rows from
// the organization's membership program, one per offer its join page sells,
// in the join page's order: each tier of a tiered program, else the program's
// one plan. A row's `<cadence>_cents` is what the join page charges for it at
// that cadence (a donation program's minimum), null where it is not sold so;
// a free program's one row has no amount at all. `symbolic` marks a tier
// whose price carries a meaning in its digits ("Spirit of ’71" at $19.71), and
// `benefits` is the program's list, the same on every row.
//
// Every figure shown is a row's cents, to the cent: a symbolic $19.71 is
// never rounded to a price the join page does not charge. The cadences are
// worded and ordered here (monthly, annual, lifetime, one time), so the three
// layouts say a price the same way. A row of a model this does not know, or a
// priced model's row with no price, is left out; no rows draws nothing.

import type { Section } from '@backgold/content'
import { links, rows, type Link } from '../../../lib/section'
import { formatCents, text } from '../../../lib/format'

const CADENCES =['monthly', 'annual', 'lifetime', 'onetime'] as const
export type Cadence = (typeof CADENCES)[number]

const MODELS = ['free', 'single', 'tiered', 'donation'] as const
export type Model = (typeof MODELS)[number]

/** Each cadence's suffix after a price ("$25/yr"), the suffix as a screen reader says it, and its name on the switch. */
const WORDS: Record<Cadence, { suffix: string; spoken: string; label: string }> = {
  monthly: { suffix: '/mo', spoken: 'a month', label: 'Monthly' },
  annual: { suffix: '/yr', spoken: 'a year', label: 'Annual' },
  lifetime: { suffix: 'once, for life', spoken: 'once, for life', label: 'Life' },
  onetime: { suffix: 'once', spoken: 'once', label: 'One time' },
}

/** What an offer is called when its row has no name: a donation or free program's one offer, or a single plan's. */
const UNNAMED: Record<Model, string> = {
  free: 'Member',
  single: 'Membership',
  tiered: 'Membership',
  donation: 'Supporter',
}

/** The cadence a card leads with: annual, then monthly, lifetime, one time. */
const LEAD: Cadence[] = ['annual', 'monthly', 'lifetime', 'onetime']

export interface Price {
  /** "$25", "$19.71", "$1,000". */
  amount: string
  /** "/yr", "/mo", "once, for life", "once". */
  suffix: string
  /** "a year", "a month", "once, for life", "once": the suffix in words. */
  spoken: string
  /** Whether the suffix is words set apart by a space ("$500 once, for life") rather than a slash. */
  spaced: boolean
}

export interface Offer {
  model: Model
  /** The row's name, or the model's word for an unnamed offer. */
  name: string
  /** The row's own name, when it has one. */
  named: boolean
  symbolic: boolean
  /** Cents at each cadence the offer is sold at. */
  cents: Partial<Record<Cadence, number>>
  /** The cadences it is sold at, in cadence order. */
  cadences: Cadence[]
}

export interface Membership {
  model: Model
  offers: Offer[]
  /** The cadences any offer is sold at, in cadence order. */
  cadences: Cadence[]
  benefits: string[]
  /** The join link (the section's one link), or null when the section has none. */
  join: Link | null
  note: string | null
}

function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** Dollars and cents from cents through formatCents: whole dollars as "$25", anything else to the cent ("$19.71"). */
function money(amount: number): string {
  const whole = amount - (amount % 100)
  const dollars = formatCents(whole) ?? ''
  return amount % 100 === 0 ? dollars : `${dollars}.${String(amount % 100).padStart(2, '0')}`
}

/** An amount at a cadence, worded. */
export function price(amount: number, cadence: Cadence): Price {
  const words = WORDS[cadence]
  return { amount: money(amount), suffix: words.suffix, spoken: words.spoken, spaced: !words.suffix.startsWith('/') }
}

/** "Monthly", "Annual", "Life", "One time". */
export function cadenceLabel(cadence: Cadence): string {
  return WORDS[cadence].label
}

/** The cadence a price leads with among `cadences`; null for none (a free program). */
export function leadCadenceOf(cadences: Cadence[]): Cadence | null {
  return LEAD.find((c) => cadences.includes(c)) ?? null
}

/** The cadences an offer is sold at after the one its card leads with, in cadence order. */
export function otherCadences(offer: Offer): Cadence[] {
  const lead = leadCadenceOf(offer.cadences)
  return offer.cadences.filter((c) => c !== lead)
}

/** The section's membership program, or null when it has no rows to draw. */
export function membershipOf(section: Section): Membership | null {
  const all = rows(section)
  const model = MODELS.find((m) => m === text(all[0]?.model)?.trim())
  if (!model) return null
  const offers = all.flatMap((row): Offer[] => {
    if (text(row.model)?.trim() !== model) return []
    const priced: Partial<Record<Cadence, number>> = {}
    for (const c of CADENCES) {
      const amount = cents(row[`${c}_cents`])
      if (amount !== null) priced[c] = amount
    }
    const cadences = CADENCES.filter((c) => priced[c] !== undefined)
    if (model === 'free' ? cadences.length > 0 : cadences.length === 0) return []
    const name = text(row.name)?.trim() ?? null
    return [{ model, name: name ?? UNNAMED[model], named: name !== null, symbolic: row.symbolic === true, cents: priced, cadences }]
  })
  if (offers.length === 0) return null
  const first = all.find((row) => Array.isArray(row.benefits))
  const benefits = Array.isArray(first?.benefits) ? first.benefits.map(text).filter((b): b is string => b !== null) : []
  const [join] = links(section)
  return {
    model,
    offers,
    cadences: CADENCES.filter((c) => offers.some((o) => o.cents[c] !== undefined)),
    benefits,
    join: join ?? null,
    note: text(section.copy.note),
  }
}

/**
 * The card a Tiers layout fills: the one recurring offer (monthly or annual)
 * that is not symbolic when there is exactly one among two or more offers (the
 * program's standing membership beside its symbolic and lifetime ones), else
 * the middle of exactly three (board 05's centre card: a row of three has a
 * middle, a wrapped row of more does not), else none.
 */
export function featuredOf(m: Membership): Offer | null {
  if (m.offers.length < 2) return null
  const standing = m.offers.filter((o) => !o.symbolic && (o.cents.monthly !== undefined || o.cents.annual !== undefined))
  if (standing.length === 1) return standing[0]
  return m.offers.length === 3 ? m.offers[1] : null
}

/**
 * The least the program asks at a cadence: the cheapest offer sold at it,
 * symbolic or not, since "from" names a floor and the join page sells a
 * symbolic tier at its price like any other. `from` says whether something
 * sold at that cadence costs more, or the amount is a donation's minimum.
 */
export function cheapestAt(m: Membership, cadence: Cadence): { amount: number; from: boolean } | null {
  const amounts = m.offers.flatMap((o) => (o.cents[cadence] === undefined ? [] : [o.cents[cadence]!]))
  if (amounts.length === 0) return null
  const amount = Math.min(...amounts)
  return { amount, from: amounts.some((a) => a !== amount) || m.model === 'donation' }
}
