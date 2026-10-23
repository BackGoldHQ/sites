// The newsletter's issues numbered from the oldest (U-cat's Collection · list
// specimen, "Issue 01" the first one sent), for the issue list, the issue
// page (src/components/newsletter/) and a Collection · list of issues
// (src/components/sections/Collection/list.astro). Every issue of the type is
// read (the Content API lists them newest first, and the reads are cached by
// content version), ordered by when each was published, the oldest first,
// and given its place, by its id and by its slug. Empty when the type has no
// issue or a read fails: the pages then draw no numbers.
import type { BackgoldContent } from '@backgold/content'

export interface IssueNumbers {
  byId: Map<string, number>
  bySlug: Map<string, number>
}

export async function issueNumbers(client: BackgoldContent, type: string): Promise<IssueNumbers> {
  const issues: Array<{ id: string; slug: string; at: number }> = []
  try {
    for await (const entry of client.allEntries(type)) issues.push({ id: entry.id, slug: entry.slug, at: entry.publish_at ? Date.parse(entry.publish_at) || 0 : 0 })
  } catch {
    return { byId: new Map(), bySlug: new Map() }
  }
  // Newest first as listed: reversed, then a stable sort by date keeps the
  // list's own order for two issues published at the same moment.
  const oldestFirst = issues.reverse().sort((a, b) => a.at - b.at)
  return {
    byId: new Map(oldestFirst.map((issue, i) => [issue.id, i + 1])),
    bySlug: new Map(oldestFirst.map((issue, i) => [issue.slug, i + 1])),
  }
}

/** "Issue 07": the number set in two digits at least. */
export const issueLabel = (n: number) => `Issue ${String(n).padStart(2, '0')}`
