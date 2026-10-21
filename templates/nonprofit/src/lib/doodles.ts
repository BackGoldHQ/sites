// The template's doodle set (board N-catalogue): nine marks and 24 icons,
// each one pen stroke on a 48-unit square with round caps and joins, drawn
// by one hand; and the three marker strokes a marked word wears (an
// underline swoosh and a circle-around), each stretched to its word. Every doodle is a `currentColor` stroke, so it takes the colour
// of whatever holds it and follows the organization's brand in both schemes.
//
// The sprite (`doodleSprite`) is written once per page by src/middleware.ts
// as hidden <symbol>s, `d-<name>` and `m-<mark>`; a component draws one with
// Doodle.astro, `<svg><use href="#d-heart"/></svg>`.

/** The marks: what each is for is on N-catalogue. */
export const MARKS = {
  arrow: 'M6 35C12 27 18 21 26 19.5C31 18.6 36 18.8 41 19.6M33.5 12.5C36.5 15.3 39 17.4 41.6 19.4C38.6 21.3 36.1 23.6 33.8 26.4',
  loop: 'M4 31C10 31.5 16 28 19 22.5C21.5 17.5 19.5 11.5 15 12C10.5 12.5 11 19.5 15.5 24C20.5 29 29 30 35.5 27C40 25 42.5 21.5 44 17.5',
  star: 'M24.2 5.8C25.6 10.3 27 14.3 28.7 18.4C33.3 18.5 37.7 18.8 42.2 19.4C38.6 22.2 35 25 31.4 27.4C32.8 31.8 34 36.1 35.2 40.6C31.5 37.8 27.7 35.3 23.8 32.8C20 35.4 16.2 38.1 12.6 40.8C13.8 36.3 15.2 31.9 16.9 27.5C13.2 25.1 9.5 22.3 5.9 19.6C10.5 19 15 18.6 19.6 18.4C21 14.3 22.5 10.1 24.6 6.6',
  heart: 'M24 40.6C17.5 36.4 10.8 31.2 7.6 24.6C5 19.2 6.6 12.6 12.2 10.8C17.3 9.2 21.6 12.4 23.9 16.8C25.9 12.2 30.4 8.8 35.6 10.2C41.4 11.8 43.3 18.6 40.6 24C37.4 30.6 30.6 35.8 24.6 40.2',
  underline: 'M3.5 30.5C12 27.6 22 26.4 31 26.6C36 26.7 40.5 27.2 44.5 27.9M9 36.5C17 34.6 26.5 34 35 34.8',
  circle: 'M31 8.6C21 6.8 9.8 11.4 7 20.4C4.4 29 11.6 38.6 23.2 39.6C33.6 40.5 42.4 34 42.2 24.4C42 15.8 34.6 9.6 25.4 9.2C20.4 9 15.6 10.6 12.4 13.4',
  check: 'M7.5 26C11 28.6 14.6 32.6 18.2 38.2C22.6 28.6 29.8 18.2 41.5 8.5',
  exclaim: 'M24.6 6.5C24 14.2 23.6 21.8 23.8 29.5M23.9 39.3L24.1 39.6',
  squiggle: 'M2.5 25C6.5 17 10.5 17 14 24.5C17.5 32 21.5 32 25 24.5C28.5 17 32.5 17 36 24.5C39 31 42.5 31 45.5 25',
} as const

/** The icons a row's `icon` maps to (iconOf). */
export const ICONS = {
  sprout: 'M24 42C24.2 35 23.6 29 24 22.5M24 27C17 27.3 11.3 22.6 10.4 14.6C18.4 13.8 23.4 18.4 24 26.6M24.2 22.4C25.4 14.6 31.2 10.2 38.8 10.8C38.4 18.8 32.4 23 24.4 22.6M11.5 42.2C19.5 41 28.5 41.2 37 42',
  book: 'M24 14.5C18.4 10.6 11.8 10 6.2 12.2C6 20 6.2 28 6.6 36C12.2 34 18.6 34.6 24 38C29.4 34.4 36 33.8 41.6 35.8C42 28 42 20 41.8 12C36.2 10 29.6 10.4 24 14.5ZM24 15C24.2 22.6 24 30.4 24 37.4',
  basket: 'M7.6 19.8C18.4 19.2 29.6 19.4 40.6 20C39.6 26.6 38 33 36 39.2C28 40.8 20 40.8 12 39.4C10 33 8.6 26.6 7.6 19.8ZM15 19.6C14.6 9.8 33 8.8 33.2 19.8M18 25.4C18.4 29 18.8 32.6 19.4 36M24.2 25.2C24 28.8 24 32.4 24.2 36.4M30.4 25.4C30 29 29.4 32.6 28.8 36',
  wrench: 'M31.6 7.6C26.4 6.4 21.4 11 22.8 16.8L9.6 30.4C7.4 32.8 8.2 36.8 10.8 38.6C13.4 40.4 16.6 39.8 18.2 37.8L31 24.6C36.4 26.4 41.6 22.4 40.8 16.6L35.4 21L31 19.4L30.4 14.6Z',
  pin: 'M24 42.4C17 33.6 11.2 26.4 11.4 18.8C11.6 11.2 17.2 6.2 24.2 6.4C31.2 6.6 36.8 11.6 36.6 19C36.4 26.6 30.8 33.4 24.4 42M24.6 14C20.6 13.8 19.4 20.8 23.8 21.8C28.6 22.6 29.2 14.6 24.2 14.2',
  clock: 'M23.8 7.2C14.2 7.4 7.4 14.8 7.6 24.4C7.8 33.8 15.4 40.8 24.6 40.6C33.8 40.4 40.8 33 40.4 23.6C40 14.4 32.8 7.4 23 7.6M24.2 14.4C24 17.8 24 21.4 24.2 24.6C26.6 26.2 29 27.6 31.6 28.8',
  calendar: 'M8.8 12.8C19 12.2 29.2 12.4 39.4 12.8C39.8 22 39.8 31 39.4 40.2C29.2 40.8 19 40.6 9 40.2C8.4 31 8.4 22 8.8 12.8ZM9 20.4C19 20 29 20.2 39.2 20.6M17 7.6C17.2 10.4 17.2 13 17 15.8M31 7.6C31.2 10.4 31.2 13 31 15.8M17.4 28.6L17.6 28.8M24.2 28.4L24.4 28.6M31 28.6L31.2 28.8M17.4 34.2L17.6 34.4',
  mail: 'M7 13.8C18.4 13.2 29.8 13.2 41.2 13.6C41.4 21 41.4 28.2 41 35.4C29.8 36 18.6 36 7.4 35.6C6.8 28.4 6.8 21 7 13.8ZM7.8 15C13.4 19.4 18.6 23.6 24 27.2C29.6 23.4 35 19.2 40.4 14.6',
  phone: 'M14.2 7.8C10.6 8.6 8 12.2 9 17.4C11.2 27.6 20.6 37 31 39.2C36 40.2 39.6 37.6 40.4 34L33.4 28.2L28.4 31.2C23.4 28.4 20 25 17 20L20.2 15.2Z',
  people: 'M17.4 20.6C12.8 20.6 13 12.2 17.6 12.2C22 12.2 22.2 20.6 17.6 20.6M7.4 36.4C7.6 29.4 12 26 17.4 26C22.8 26 27 29.4 27.4 36.2M32 19C28.6 19 28.6 12.8 32.2 12.8C35.8 12.8 35.6 19 32.2 19M30.6 24.2C36.4 23.6 40.6 27.6 40.8 33.4',
  house: 'M7.6 22.2C13 17.6 18.6 13.2 24.2 8.8C29.8 13 35.2 17.4 40.6 22M11.8 19.4C11.6 26 11.6 32.6 12 39.2C20 39.6 28 39.6 36.2 39.2C36.4 32.6 36.4 26 36 19.4M20.4 39.2C20.2 35.6 20.2 32.2 20.4 28.8C23 28.6 25.4 28.6 27.8 28.8C28 32.2 28 35.6 27.8 39',
  sun: 'M24.2 16.6C19.6 16.4 16.4 20 16.6 24.4C16.8 28.6 20.2 31.6 24.4 31.4C28.6 31.2 31.6 27.8 31.2 23.6C30.8 19.6 27.6 16.6 23.4 16.8M24 5.6L24.2 10.4M24.2 37.6L24 42.4M5.6 24.2L10.4 24M37.6 24L42.4 24.2M11 11L14.2 14.4M33.8 33.6L37 37M37.2 11.2L34 14.4M14.2 33.8L11 37',
  play: 'M16.6 11.6C23.4 15.4 30 19.6 36.6 24.2C30 28.6 23.4 32.6 16.8 36.6C16.4 28.2 16.4 20 16.6 11.6Z',
  doc: 'M13.2 6.4C18.4 6.2 23.6 6.2 28.8 6.4L36 13.6C36.2 23 36.2 32.4 36 41.6C28.4 42 20.8 42 13.2 41.6C12.8 30 12.8 18 13.2 6.4ZM28.8 6.6C28.6 9 28.6 11.4 28.8 13.6C31.2 13.8 33.6 13.8 35.8 13.6M18.4 22.4C22.6 22.2 26.8 22.2 31 22.4M18.4 28.2C22.6 28 26.8 28 31 28.2M18.4 34C21 33.8 23.4 33.8 26 34',
  search: 'M20.4 8.6C13.6 8.4 8.8 13.6 9 20C9.2 26.4 14.4 31.2 20.8 30.8C27 30.4 31.6 25.2 31.2 19C30.8 13 25.8 8.6 19.6 9M28.6 28.6C32 32 35.6 35.6 39.4 39.4',
  menu: 'M8 14.4C18.6 13.8 29.4 14 40 14.6M8.4 24.2C18.8 23.8 29.4 24 39.6 24.4M8 34C18.6 33.6 29.2 33.8 40 34.2',
  close: 'M11.6 11.4C19.6 19.6 27.8 28 36.2 36.4M36.6 11.6C28.4 19.8 20 28.2 11.4 36.4',
  share: 'M24 30.6C24.2 22.6 24 14.6 24.2 7M16 14.2C18.6 11.6 21.2 9.4 24 6.8C26.8 9.2 29.4 11.8 32 14.4M15.6 21.2C13.4 21.2 11.4 21.2 9.4 21.4C9 28.4 9 35 9.4 41.4C19 41.8 28.6 41.8 38.4 41.4C38.8 35 38.8 28.4 38.4 21.4C36.4 21.2 34.4 21.2 32.4 21.2',
  clip: 'M30.6 13.6L17.6 28C14.8 31.2 18.8 35.2 22 32.2L36.2 17C40.6 12.2 34.4 6.2 29.6 10.8L14.4 26.8C9.4 32.4 17 40.4 22.6 35L33.4 23.8',
  sparkle: 'M24 6.4C24.8 17.6 28.4 22.2 40.4 24C28.6 25.8 25 30.2 24 41.6C23 30.2 19.4 25.8 7.6 24C19.4 22.2 23 17.6 24 6.4Z',
  kettle: 'M9.8 39C8.8 29.4 13.4 21.4 24 21.2C34.6 21 39.6 29 38.4 39C29 39.8 19.2 39.8 9.8 39ZM20.8 21.2C20.6 17.4 27.2 17.2 27.2 21.2M13.8 23.4C12.6 13.4 35.6 12.8 34 23M38 28.2C41.6 26.4 43.6 23 44.6 18.8M21 13C19 10.6 22.6 8.6 20.8 5.8M27.2 12.6C25.2 10.2 28.8 8.2 27 5.4',
  gift: 'M9.2 19.4C19 18.8 29 19 38.8 19.6C39.2 22.2 39.2 24.6 38.8 27C29 27.4 19 27.4 9.2 27C8.8 24.4 8.8 22 9.2 19.4ZM11.4 27.2C11.2 31.8 11.4 36.4 11.8 41C19.8 41.4 28 41.4 36 41C36.4 36.4 36.6 31.8 36.4 27.2M24 19.4C24.2 26.6 24 33.8 24.2 41M24 19.2C20.4 12.4 13.4 12.6 14.6 16.6C15.6 19.4 20.4 19.6 23.8 19.2C27.6 19.6 32.4 19.4 33.4 16.6C34.6 12.6 27.6 12.4 24 19.2',
  plus: 'M24.2 9.6C24 19.4 24 29 24.2 38.6M9.6 24.2C19.2 23.8 29 23.8 38.6 24.2',
  minus: 'M9.6 24.2C19.2 23.8 29 23.8 38.6 24.2',
} as const

export type DoodleName = keyof typeof MARKS | keyof typeof ICONS

/** A marked word's strokes, each in a box of its own proportions, stretched to the word (non-scaling, so the pen keeps its width). */
const MARKERS = {
  under: { viewBox: '0 0 200 24', d: 'M4 15C40 9 86 7 128 8.5C152 9.4 175 11 196 13.5M30 20C70 17 120 16.5 168 18' },
  circle: { viewBox: '0 0 200 80', d: 'M138 7C96 1 40 6 15 22C-3 34 4 58 40 70C82 82 150 78 182 62C204 50 200 26 176 15C148 3 100 2 62 9' },
} as const

const ALIASES: Record<string, DoodleName> = {
  // The platform's own icon keys (packages/site icon-paths.ts), as an operator picks them in BackGold.
  leaf: 'sprout',
  briefcase: 'wrench',
  home: 'house',
  globe: 'pin',
  'dollar-sign': 'gift',
  zap: 'sparkle',
  lightbulb: 'sun',
  scale: 'doc',
  shield: 'house',
  food: 'basket',
  market: 'basket',
  pantry: 'basket',
  garden: 'sprout',
  growth: 'sprout',
  learning: 'book',
  tutoring: 'book',
  tools: 'wrench',
  repair: 'wrench',
  housing: 'house',
  shelter: 'house',
  community: 'people',
  members: 'people',
  users: 'people',
  giving: 'gift',
  meals: 'kettle',
  kitchen: 'kettle',
  place: 'pin',
  cal: 'calendar',
  date: 'calendar',
  time: 'clock',
  email: 'mail',
  video: 'play',
  document: 'doc',
}

/** Words in a category's name that say which doodle it gets (termIcon), beyond the icon names and aliases. */
const TERM_WORDS: Record<string, DoodleName> = {
  grow: 'sprout',
  homework: 'book',
  library: 'book',
  school: 'book',
  tool: 'wrench',
  volunteer: 'people',
  neighbor: 'people',
  food: 'basket',
  donor: 'gift',
}

/**
 * The doodle a row's `icon` value draws: its own name or an alias
 * (N-catalogue's list), the sparkle for any other word, and null when the
 * row names no icon, so nothing is drawn for it.
 */
export function iconOf(value: unknown): DoodleName | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const key = value.trim().toLowerCase()
  if (Object.hasOwn(ICONS, key) || Object.hasOwn(MARKS, key)) return key as DoodleName
  return ALIASES[key] ?? 'sparkle'
}

/**
 * The doodle for a category by its name ("Grow Lab" → sprout, "Saturday
 * Market" → basket): the first word that is an icon's name, an alias or one
 * of TERM_WORDS (a plural read as its singular), else the sparkle.
 */
export function termIcon(label: unknown): DoodleName {
  if (typeof label !== 'string') return 'sparkle'
  for (const raw of label.toLowerCase().split(/[^a-z-]+/)) {
    for (const word of [raw, raw.replace(/s$/, '')]) {
      if (!word) continue
      if (Object.hasOwn(ICONS, word) || Object.hasOwn(MARKS, word)) return word as DoodleName
      const named = ALIASES[word] ?? TERM_WORDS[word]
      if (named) return named
    }
  }
  return 'sparkle'
}

/** Every doodle and marker as hidden <symbol>s, the page's one sprite. */
export function doodleSprite(): string {
  const symbols = [
    ...Object.entries({ ...MARKS, ...ICONS }).map(([name, d]) => `<symbol id="d-${name}" viewBox="0 0 48 48"><path d="${d}"/></symbol>`),
    ...Object.entries(MARKERS).map(
      ([name, m]) =>
        `<symbol id="m-${name}" viewBox="${m.viewBox}" preserveAspectRatio="none"><path pathLength="1" vector-effect="non-scaling-stroke" d="${m.d}"/></symbol>`,
    ),
  ]
  return `<svg class="np-sprite" width="0" height="0" aria-hidden="true" focusable="false">${symbols.join('')}</svg>`
}
