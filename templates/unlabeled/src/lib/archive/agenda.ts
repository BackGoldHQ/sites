// A board agenda's outline, read from its text extraction: every numbered
// item (`II.E.8.` and the title on the lines after it), in the agenda's own
// order, so a meeting's decisions can hang on the items they cite
// (`agenda_item`). The text is the archive's, OCR noise and all.

export interface AgendaItem {
  /** The item number as the agenda writes it, without its last dot: `II.E.8`. */
  number: string
  title: string
  /** The 1-based line the number is on. */
  line: number
  /** 1 for `II`, 2 for `II.E`, 3 for `II.E.8`. */
  depth: number
}

const ITEM = /^\s*((?:[IVXL]+)(?:\.[A-Z])?(?:\.\d{1,2})?)\.\s*(.*)$/

/** The item key an `agenda_item` value and an outline number share: `II.E.8.` and `ii.e.8` are `II.E.8`. */
export const itemKey = (value: string): string => value.trim().replace(/\.$/, '').toUpperCase()

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 }

/** A roman numeral's value; NaN for anything else. */
function romanValue(numeral: string): number {
  let total = 0
  for (let i = 0; i < numeral.length; i++) {
    const v = ROMAN[numeral[i]!]
    const next = ROMAN[numeral[i + 1] ?? '']
    if (v === undefined) return Number.NaN
    total += next !== undefined && next > v ? -v : v
  }
  return total
}

/**
 * The outline: each line that is only an item number (or a number and its
 * title) opens an item, and its title runs on until a blank line or the
 * next item. The outline's top numerals run in order (I, II, III…), so a
 * numbered line inside an attached document (a contract's own "IV.", "V.")
 * is not an agenda item: an item counts only under the current top numeral
 * or the one after it. An item number seen again later (the agenda repeats
 * items on their own pages) keeps its first place.
 */
export function agendaOutline(text: string): AgendaItem[] {
  const lines = text.split(/\r?\n/)
  const items: AgendaItem[] = []
  const seen = new Set<string>()
  let current = 0
  for (let i = 0; i < lines.length; i++) {
    const m = ITEM.exec(lines[i]!)
    if (!m) continue
    const number = itemKey(m[1]!)
    if (seen.has(number)) continue
    const top = romanValue(number.split('.')[0]!)
    if (!(top === current || top === current + 1)) continue
    const words: string[] = m[2] ? [m[2].trim()] : []
    for (let j = i + 1; j < lines.length && words.join(' ').length < 240; j++) {
      const next = lines[j]!.trim()
      if (!next || ITEM.test(lines[j]!)) break
      words.push(next)
    }
    const title = words.join(' ').replace(/\s*\[[^\]]*\]?\s*$/, '').replace(/\s+/g, ' ').trim()
    if (!title) continue
    seen.add(number)
    current = top
    items.push({ number, title, line: i + 1, depth: number.split('.').length })
  }
  return items
}

/** The 1-based lines of a text that mention an item number (`II.E.8.`), for the reading pane to set in white. */
export function linesCiting(text: string, number: string): number[] {
  const key = itemKey(number)
  const escaped = key.replace(/\./g, '\\.')
  const re = new RegExp(`(^|[^A-Z.])${escaped}\\.?(?![\\d.])`, 'i')
  return text
    .split(/\r?\n/)
    .flatMap((line, i) => (re.test(line) ? [i + 1] : []))
}
