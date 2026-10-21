// The view-transition name a record's title carries on its result row and
// on its own page's heading, so a navigation between them moves the title
// from the one place to the other (src/styles/template.css § 6). A short
// hash of the record's address: a valid identifier, one per record.
export function recordTransition(path: string): string {
  let h = 5381
  for (const c of path) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0
  return `rec-${h.toString(36)}`
}
