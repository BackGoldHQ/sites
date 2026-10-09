// A TeamGrid's rows as its layouts draw them, by the group each row arrives
// in: leadership (`exec`: photo, role, a short bio), staff (`staff`: name,
// role, department) and open roles (`open`: role, department, a line about
// it), with the section's "interested?" link.

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
  /** The section's "interested?" link, when it has one. */
  interest: Link | null
}

const person = (row: Row): Person => ({
  name: text(row.name),
  role: text(row.role),
  dept: text(row.dept),
  bio: text(row.bio),
  blurb: text(row.blurb),
  photo: safeSrc(row.image_url),
  link: linkOf(text(row.name) ?? text(row.role), row.link_url),
})

export function teamOf(section: Section): Team {
  const all = rows(section)
  const group = (name: string) => all.filter((row) => row.group === name).map(person)
  return {
    leaders: group('exec').filter((p) => p.name),
    staff: group('staff').filter((p) => p.name),
    open: group('open').filter((p) => p.role),
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
