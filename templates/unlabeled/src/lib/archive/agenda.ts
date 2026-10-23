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
 * next item, or a long line in capitals after a title in mixed case (the
 * heading of the item's attached page). The outline's top numerals run in order (I, II, III…), so a
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
      // A long line in capitals after a title in mixed case is the item's own page heading, not its title.
      if (words.some((w) => /[a-z]/.test(w)) && !/[a-z]/.test(next) && (next.match(/[A-Z]/g) ?? []).length >= 12) break
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

// ── Hanging a decision on an item by its title ──────────────────────────────
//
// Most decisions carry no `agenda_item`. A decision without one hangs on the
// item whose title its own title matches: both titles cut to words (case,
// punctuation and a word's ending ignored, filler words dropped), each word
// weighted by how few of the agenda's items use it (a policy code like `FO`
// or a project code like `26.16` counts for much, "approve" for almost
// nothing), the score the weight of the shared words over the weight of
// both titles' words (a weighted Dice coefficient). An item whose title names
// a different procurement number (`CSP 25.11` against `CSP 25.15`) or a
// different policy code (`CW(LOCAL)` against `DEC (Local)`) than the
// decision's is out. The best item must score at least MATCH_MIN and lead
// the next best by MATCH_LEAD times, or the decision is left with no item:
// the page never guesses between two items.

/** The lowest score a title match is taken at. */
export const MATCH_MIN = 0.3
/** How far the best item must lead the next best, as a ratio of their scores. */
export const MATCH_LEAD = 1.3

const FILLER = new Set(
  'a an and are as at be by for from if in into is it its of on or the to with this that these those discuss appropriate take action consider regarding approve approval approved acceptance accept report item'.split(' '),
)

/** A word's stem: plurals and the common endings cut, so "revisions" and "revise", "trackers" and "tracker" meet. */
function stem(word: string): string {
  if (/\d/.test(word)) return word
  let w = word
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  for (const end of ['ing', 'ion', 'ed', 'e']) {
    if (w.length > end.length + 3 && w.endsWith(end)) return w.slice(0, -end.length)
  }
  return w
}

/** The codes a title names, by family: procurement numbers (`CSP 26.16` → `26.16`) and policy codes (`FO(LOCAL)` → `FO`). */
function titleCodes(title: string): { procurement: Set<string>; policy: Set<string> } {
  const procurement = new Set([...title.matchAll(/\b(?:CSP|RFP|RFQ|RFCSP|IFB)\s*#?\s*(\d{2}\.\d{2})\b/gi)].map((m) => m[1]!))
  const policy = new Set([...title.matchAll(/\b([A-Z]{1,4})\s*\((?:LOCAL|LEGAL)\)/gi)].map((m) => m[1]!.toUpperCase()))
  return { procurement, policy }
}

/** Whether two titles name codes of one family and share none of them. */
function codesConflict(a: ReturnType<typeof titleCodes>, b: ReturnType<typeof titleCodes>): boolean {
  const apart = (x: Set<string>, y: Set<string>) => x.size > 0 && y.size > 0 && ![...x].some((c) => y.has(c))
  return apart(a.procurement, b.procurement) || apart(a.policy, b.policy)
}

/** A title's words as the matcher compares them. */
export function titleWords(title: string): Set<string> {
  const text = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
  const words = new Set<string>()
  for (const raw of text.split(/[^a-z0-9.]+/)) {
    const word = raw.replace(/^\.+|\.+$/g, '')
    if (!word || FILLER.has(word) || (word.length < 2 && !/\d/.test(word))) continue
    words.add(stem(word))
  }
  return words
}

/**
 * The item (its number) a decision's title matches among `items` (the
 * outline's items that hold records: depth 3), or null when none scores
 * MATCH_MIN or two are too close to call.
 */
export function matchItem(title: string, items: readonly Pick<AgendaItem, 'number' | 'title'>[]): string | null {
  const wanted = titleWords(title)
  if (wanted.size === 0 || items.length === 0) return null
  const sets = items.map((i) => titleWords(i.title))
  const seen = new Map<string, number>()
  for (const set of sets) for (const w of set) seen.set(w, (seen.get(w) ?? 0) + 1)
  const weight = (w: string) => Math.log(1 + items.length / (seen.get(w) ?? 0.5))
  const total = (set: Set<string>) => [...set].reduce((n, w) => n + weight(w), 0)
  const own = total(wanted)
  const codes = titleCodes(title)
  const scores = sets.map((set, i) => {
    if (codesConflict(codes, titleCodes(items[i]!.title))) return 0
    const shared = [...set].filter((w) => wanted.has(w)).reduce((n, w) => n + weight(w), 0)
    return (2 * shared) / (own + total(set))
  })
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0])
  const [best, second] = [order[0]!, order[1]]
  if (best[0] < MATCH_MIN) return null
  if (second && second[0] * MATCH_LEAD > best[0]) return null
  return items[best[1]]!.number
}

/**
 * The item a decision hangs on: its `agenda_item` when it has one, else the
 * item of the outline its title matches (matchItem over the outline's
 * depth-3 items), else null (No item cited).
 */
export function itemFor(decision: { title: string; agendaItem: string | null }, outline: readonly AgendaItem[]): string | null {
  if (decision.agendaItem) return itemKey(decision.agendaItem)
  return matchItem(decision.title, outline.filter((i) => i.depth === 3))
}

/**
 * Where the meeting was held, as the agenda's head writes it: the lines after
 * the date and time line ("Thursday, August 20, 2026 5:00 PM") up to a blank
 * line or the first item, joined ("Board Room of the Beaumont ISD
 * Administration Building, 3395 Harrison Ave, Beaumont, TX 77706-5009").
 * Null when the head has no such line or what follows does not read as a
 * place (no street number, or longer than a place runs).
 */
export function agendaVenue(text: string): string | null {
  const lines = text.split(/\r?\n/, 12).map((l) => l.replace(/\u200b/g, '').trim())
  const at = lines.findIndex((l) => /\b(?:19|20)\d{2}\b/.test(l) && /\b\d{1,2}:\d{2}\s*[AP]\.?M\b/i.test(l))
  if (at < 0) return null
  const parts: string[] = []
  for (const line of lines.slice(at + 1, at + 4)) {
    if (!line || ITEM.test(line)) break
    parts.push(line)
  }
  const venue = parts.join(' ').replace(/\s+/g, ' ').replace(/[\s,]+$/, '')
  if (!venue || venue.length > 200 || !/\b\d+\s+[A-Za-z]/.test(venue)) return null
  return venue
}
