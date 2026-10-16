// The entry a request is drawing, for the sections in its areas: a Blog
// section in an entry's sidebar ("More from the campaign", board C11) lists
// the newest posts but the one being read. The route marks it on the
// request's `Astro.locals` (one object per request, the same in every
// component it renders); a page, a list or an event marks nothing.

const reading = new WeakMap<object, string>()

/** Mark `entryId` as the entry this request draws. */
export function markReading(locals: object, entryId: string): void {
  reading.set(locals, entryId)
}

/** The id of the entry this request draws; null on any other route. */
export function readingOf(locals: object): string | null {
  return reading.get(locals) ?? null
}
