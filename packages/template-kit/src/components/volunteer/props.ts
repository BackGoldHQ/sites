// What the volunteer layouts are given, by src/routes/volunteer.astro and
// src/routes/volunteer-shift.astro. A template registers its own as
// 'volunteer:list' and 'volunteer:detail' in its `entries`
// (components/entries/index.ts volunteerLayoutFor).

import type { ShiftRow } from '../../lib/shifts'
import type { Link } from '../../lib/section'

export interface VolunteerListProps {
  /** Every open shift, soonest first; empty when there is none, or the api serves no feed. */
  shifts: ShiftRow[]
  /** The organization's site name, for the page's words and its empty state. */
  siteName: string
}

export interface VolunteerDetailProps {
  shift: ShiftRow
  /** The public event the shift belongs to, by its title, on this site; null for a standalone shift. */
  partOf: Link | null
  siteName: string
}
