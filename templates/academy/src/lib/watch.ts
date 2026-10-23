// The Watch list's groups (src/components/entries/Watch.astro): the videos
// by their `series` term, Conversations, then Training clips, then Live
// sessions (the terms' keys `conversations`, `training`, `live`), then any
// other series the organization adds, in its own order; a video with no
// series term is a training clip. Each group is headed by its term's label
// and holds its videos newest first.

import type { Entry, TermsResponse } from '@backgold/content'

/** The taxonomy the videos are grouped by. */
export const SERIES = 'series'

/** The series in the order the list draws them; the one a video with no series joins. */
const ORDER = ['conversations', 'training', 'live']
const UNFILED = 'training'
/** What the unfiled group is called when the organization has no `training` term to name it. */
const UNFILED_LABEL = 'Training clips'

export interface WatchGroup {
  /** The series term's slug. */
  key: string
  label: string
  /** Every video in the group, newest first. */
  entries: Entry[]
  /** Whether the organization has this term, so its own list exists at `<list>/series/<key>`. */
  listed: boolean
}

const newestFirst = (a: Entry, b: Entry) => ((a.publish_at ?? '') !== (b.publish_at ?? '') ? ((a.publish_at ?? '') < (b.publish_at ?? '') ? 1 : -1) : a.id < b.id ? 1 : -1)

/** A live session: a video in the `live` series. */
export const isLive = (entry: Entry): boolean => entry.terms.some((t) => t.taxonomy === SERIES && t.slug === 'live')

/** Whether any of the videos carries a series term: without one there is nothing to group by. */
export const seriesFiled = (entries: Entry[]): boolean => entries.some((e) => e.terms.some((t) => t.taxonomy === SERIES))

/** The videos in their groups, empty groups left out. `terms` is GET /terms/series, or null when the organization has no such taxonomy. */
export function groupsOf(entries: Entry[], terms: TermsResponse | null): WatchGroup[] {
  const known = new Map((terms?.terms ?? []).map((t) => [t.slug, t]))
  const groups = new Map<string, WatchGroup>()
  for (const entry of entries) {
    const term = entry.terms.find((t) => t.taxonomy === SERIES)
    const key = term?.slug ?? UNFILED
    const group = groups.get(key) ?? { key, label: known.get(key)?.label ?? UNFILED_LABEL, entries: [], listed: known.has(key) }
    // A term GET /terms/series did not list is named by the label its videos carry.
    if (term && !known.has(key)) group.label = term.label
    group.entries.push(entry)
    groups.set(key, group)
  }
  const rank = (key: string) => {
    const at = ORDER.indexOf(key)
    return at === -1 ? ORDER.length + (known.get(key)?.position ?? 0) : at
  }
  return [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label)).map((g) => ({ ...g, entries: g.entries.sort(newestFirst) }))
}
