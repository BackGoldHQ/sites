// What the door and the entry pages draw from the index: the meetings with
// their documents and decision counts, the latest records, the term counts,
// and a record's neighbours.

import type { ArchiveDoc } from './record'
import { httpUrl, list } from './record'
import type { ArchiveKindKey } from './kinds'

export interface MeetingMark {
  doc: ArchiveDoc
  agenda: boolean
  minutes: boolean
  resolutions: boolean
  decisions: number
}

/** The meetings, oldest first, each with its A / M / R marks and the decisions that reference it. */
export function meetingMarks(docs: ArchiveDoc[]): MeetingMark[] {
  const decisions = new Map<string, number>()
  for (const d of docs) if (d.kind === 'board_decision' && d.meeting) decisions.set(d.meeting, (decisions.get(d.meeting) ?? 0) + 1)
  return docs
    .filter((d) => d.kind === 'board_meeting' && d.date)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .map((doc) => ({
      doc,
      agenda: httpUrl(doc.fields.agenda_link) !== null,
      minutes: httpUrl(doc.fields.minutes_link) !== null,
      resolutions: httpUrl(doc.fields.resolutions_link) !== null,
      decisions: decisions.get(doc.slug) ?? 0,
    }))
}

const newest = (a: ArchiveDoc, b: ArchiveDoc) => (b.date ?? '').localeCompare(a.date ?? '') || (b.publishAt ?? '').localeCompare(a.publishAt ?? '')

/**
 * The door's latest records (designer's call, board U2): the three newest
 * records requests beside the decisions from the newest meeting that has
 * any, up to ten in all.
 */
export function latestRecords(docs: ArchiveDoc[], marks: MeetingMark[]): { requests: ArchiveDoc[]; meeting: MeetingMark | null; decisions: ArchiveDoc[] } {
  const requests = docs.filter((d) => d.kind === 'information_request').sort(newest).slice(0, 3)
  const meeting = [...marks].reverse().find((m) => m.decisions > 0) ?? null
  const decisions = meeting ? docs.filter((d) => d.kind === 'board_decision' && d.meeting === meeting.doc.slug).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 10 - requests.length) : []
  return { requests, meeting, decisions }
}

/** How many records carry each value, most first. */
export function countBy(values: Array<string | null | undefined>): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Records of a kind, newest first. */
export const ofKind = (docs: ArchiveDoc[], kind: ArchiveKindKey): ArchiveDoc[] => docs.filter((d) => d.kind === kind).sort(newest)

/** The record before and after this one in its category, by date (oldest first). */
export function neighbours(docs: ArchiveDoc[], doc: ArchiveDoc): { previous: ArchiveDoc | null; next: ArchiveDoc | null; index: number; count: number } {
  const line = docs
    .filter((d) => d.kind === doc.kind && d.category === doc.category)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.slug.localeCompare(b.slug))
  const i = line.findIndex((d) => d.id === doc.id)
  return { previous: i > 0 ? line[i - 1]! : null, next: i >= 0 && i < line.length - 1 ? line[i + 1]! : null, index: i, count: line.length }
}

/** The decisions a bucket's basis names. */
export const basisOf = (bucket: ArchiveDoc, docs: ArchiveDoc[]): ArchiveDoc[] => {
  const slugs = list(bucket.fields.basis_decisions)
  return docs.filter((d) => d.kind === 'board_decision' && slugs.includes(d.slug))
}

/** The buckets whose basis names this decision. */
export const bucketsCiting = (decision: ArchiveDoc, docs: ArchiveDoc[]): ArchiveDoc[] =>
  docs.filter((d) => d.kind === 'data_bucket' && list(d.fields.basis_decisions).includes(decision.slug))

const STOP = new Set(['the', 'and', 'for', 'of', 'with', 'to', 'a', 'an', 'in', 'on', 'at', 'by', 'from', 'approve', 'approval'])
const wordsOf = (title: string) => new Set(title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/s$/, '')))

/**
 * Decisions at the same meeting, filed under another category, whose
 * titles share at least half their words with this one's: the archive's
 * habit of filing one agenda item twice (GOV-D01 and FAC-D08).
 */
export function filedTwice(decision: ArchiveDoc, docs: ArchiveDoc[]): ArchiveDoc[] {
  if (!decision.meeting) return []
  const mine = wordsOf(decision.title)
  return docs.filter((d) => {
    if (d.kind !== 'board_decision' || d.id === decision.id || d.meeting !== decision.meeting || d.category === decision.category) return false
    const theirs = wordsOf(d.title)
    const shared = [...mine].filter((w) => theirs.has(w)).length
    return shared / new Set([...mine, ...theirs]).size >= 0.5
  })
}

/** The names a vote's "Yeas:" list gives (and its Nays and Abstain), or null when it has none. */
export function tallyOf(detail: string | null): { yeas: string[]; nays: string; abstain: string } | null {
  if (!detail) return null
  const yeas = /Yeas:\s*([^;)]+)/i.exec(detail)?.[1]
  if (!yeas) return null
  return {
    yeas: yeas.split(',').map((n) => n.trim()).filter(Boolean),
    nays: /Nays:\s*([^;)]+)/i.exec(detail)?.[1]?.trim() ?? '—',
    abstain: /Abstain:\s*([^;)]+)/i.exec(detail)?.[1]?.trim() ?? '—',
  }
}
