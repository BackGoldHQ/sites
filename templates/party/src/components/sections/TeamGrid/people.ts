// A TeamGrid's rows as its layouts draw them. Rows arrive in one of two
// shapes:
//
// - by seat: each a seat on one of the party's bodies (`body`, `body_key`,
//   `seat`, the holder's `name` (null for a vacant seat), `since`,
//   `term_ends`, `is_officer`, and from the holder's team entry `photo_url`,
//   `bio`, `link`; `url` is the site's own page for the holder, or for a
//   vacant seat its open role), grouped by body in BackGold's order with the
//   officers' body first and the staff who hold no seat last, under `Staff`;
// - by group: leadership (`exec`: photo, role, a short bio), staff (`staff`:
//   name, role, department) and open roles (`open`: role, department, a line
//   about it).
//
// `teamOf` reads both into the three groups (a seat's name is its role, a
// vacant seat is an open role in its body), so every layout draws either;
// `bodiesOf` keeps the seats in their bodies for the Board layout.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { links, linkOf, rows, type Link, type Row } from '../../../lib/section'
import { text } from '../../../lib/format'

interface Person {
  name: string | null
  role: string | null
  dept: string | null
  bio: string | null
  blurb: string | null
  photo: string | null
  link: Link | null
}

interface Team {
  leaders: Person[]
  staff: Person[]
  open: Person[]
  /** The open roles that arrive in the `open` group, without a seat. */
  openRoles: Person[]
  /** The section's "interested?" link, when it has one. */
  interest: Link | null
}

export interface Seat {
  /** The seat's name ("Chair", "At-large"), or null. */
  seat: string | null
  /** The holder, or null for a vacant seat. */
  name: string | null
  /** The year the holder took the seat ("2023"), or null. */
  since: string | null
  /** The month the term ends ("April 2027"), or null. */
  termEnds: string | null
  officer: boolean
  photo: string | null
  bio: string | null
  /** The holder's page (the site's own, else their link), or for a vacant seat its open role's page. */
  link: Link | null
}

export interface Body {
  key: string
  name: string
  seats: Seat[]
}

const isSeatRow = (row: Row) => typeof row.body === 'string' && row.body.trim() !== ''

const person = (row: Row): Person => ({
  name: text(row.name),
  role: text(row.role),
  dept: text(row.dept),
  bio: text(row.bio),
  blurb: text(row.blurb),
  photo: safeSrc(row.image_url),
  link: linkOf(text(row.name) ?? text(row.role), row.link_url),
})

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })

/** "2023" from a date or a year; null for anything else. */
function yearOf(value: unknown): string | null {
  return /^(\d{4})(?:-|$)/.exec(text(value) ?? '')?.[1] ?? null
}

/** "April 2027" from a date ("2027-04-30", "2027-04"), "2027" from a bare year; null for anything else. */
function monthOf(value: unknown): string | null {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(text(value) ?? '')
  if (!m) return null
  const month = m[2] ? Number(m[2]) : null
  if (month === null) return m[1]!
  if (month < 1 || month > 12) return null
  return `${MONTH.format(Date.UTC(2000, month - 1, 1))} ${m[1]}`
}

function seatOf(row: Row): Seat {
  const name = text(row.name)
  const label = name ?? text(row.seat) ?? 'Open seat'
  return {
    seat: text(row.seat),
    name,
    since: name ? yearOf(row.since) : null,
    termEnds: monthOf(row.term_ends),
    officer: row.is_officer === true,
    photo: name ? safeSrc(row.photo_url) : null,
    bio: name ? text(row.bio) : null,
    link: linkOf(label, row.url) ?? (name ? linkOf(label, row.link) : null),
  }
}

/**
 * The seat rows by body, in the order they arrive, the officers' body moved
 * first and Staff kept last; empty when the rows are not by seat.
 */
export function bodiesOf(section: Section): Body[] {
  const bodies: Body[] = []
  for (const row of rows(section).filter(isSeatRow)) {
    const name = (row.body as string).trim()
    const key = text(row.body_key) ?? name
    let body = bodies.find((b) => b.key === key)
    if (!body) {
      body = { key, name, seats: [] }
      bodies.push(body)
    }
    body.seats.push(seatOf(row))
  }
  const rank = (b: Body) => (b.seats.some((s) => s.officer) ? 0 : b.name === 'Staff' ? 2 : 1)
  return bodies.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i).map(({ b }) => b)
}

/** The term every seat in a body ends with, when they all share one; null otherwise. */
export function sharedTerm(body: Body): string | null {
  const terms = new Set(body.seats.map((s) => s.termEnds))
  return terms.size === 1 ? [...terms][0]! : null
}

export function teamOf(section: Section): Team {
  const all = rows(section)
  const group = (name: string) => all.filter((row) => row.group === name).map(person)
  const seated = bodiesOf(section).flatMap((body) =>
    body.seats.map((s) => ({
      staff: body.name === 'Staff',
      person: {
        name: s.name,
        role: s.seat,
        dept: s.name ? null : body.name,
        bio: s.bio,
        blurb: null,
        photo: s.photo,
        link: s.link,
      },
    })),
  )
  const openRoles = group('open').filter((p) => p.role)
  return {
    leaders: [...group('exec'), ...seated.filter((s) => s.person.name && !s.staff).map((s) => s.person)].filter((p) => p.name),
    staff: [...group('staff'), ...seated.filter((s) => s.person.name && s.staff).map((s) => s.person)].filter((p) => p.name),
    open: [...openRoles, ...seated.filter((s) => !s.person.name).map((s) => ({ ...s.person, role: s.person.role ?? 'Open seat' }))],
    openRoles,
    interest: links(section)[0] ?? null,
  }
}

/** "RA" in place of a photo that has not been uploaded. */
export function initials(name: string | null): string {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}
