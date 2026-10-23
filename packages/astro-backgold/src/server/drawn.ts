// What a request drew: the BackGold page or entry the route resolved its own
// address to, named in a response header so BackGold's dispatch can count the
// view (and strip the header) without reading the HTML. The middleware runs
// the render inside an AsyncLocalStorage store; `resolveRoute` writes the
// first answer for the request's own path into it, since the page calls
// `resolveRoute` with the client and never hands over its locals. The header
// goes on the response before the edge cache stores it, so a hit carries the
// stored copy's.
//
// `node:async_hooks` is imported when the first request runs; where the
// runtime has none (a Worker with neither the `nodejs_compat` nor the
// `nodejs_als` flag) nothing is recorded and the page renders without the
// header.

import type { AsyncLocalStorage } from 'node:async_hooks'
import type { Resolved } from './resolve.js'

export const DRAWN_PAGE_HEADER = 'X-BackGold-Page'
export const DRAWN_ENTRY_HEADER = 'X-BackGold-Entry'

export type Drawn = { page: string } | { entry: string } | null

export interface DrawnRecord {
  /** The request's path, as `resolveRoute` reads one. */
  pathname: string
  /** Undefined until `resolveRoute` resolves the request's own path; null when that drew no page or entry. */
  drawn?: Drawn
}

let storage: AsyncLocalStorage<DrawnRecord> | null | undefined
let loading: Promise<AsyncLocalStorage<DrawnRecord> | null> | undefined

/** The store the render runs in; null where the runtime has no AsyncLocalStorage. */
function drawnStorage(): Promise<AsyncLocalStorage<DrawnRecord> | null> {
  if (storage !== undefined) return Promise.resolve(storage)
  loading ??= import('node:async_hooks').then(
    ({ AsyncLocalStorage }) => (storage = new AsyncLocalStorage<DrawnRecord>()),
    () => (storage = null),
  )
  return loading
}

/** `render()` run with `record` as the store `resolveRoute` writes into. */
export async function withDrawnRecord<T>(record: DrawnRecord, render: () => Promise<T>): Promise<T> {
  const store = await drawnStorage()
  return store ? store.run(record, render) : render()
}

/** What a resolution draws: a page's id, an entry's or a lesson's (a video entry) id, else null. */
function drawnOf(resolved: Resolved): Drawn {
  if (resolved.kind === 'page') return { page: resolved.page.page.id }
  if (resolved.kind === 'entry') return { entry: resolved.entry.id }
  if (resolved.kind === 'lesson') return { entry: resolved.lesson.lesson.id }
  return null
}

/**
 * Records `resolved` as what the request drew when `samePath` says it answers
 * the request's own path and nothing was recorded yet: a later call (a list's
 * first page read beside a later one, a section's list) never changes it.
 */
export function recordDrawn(resolved: Resolved, samePath: (requestPath: string) => boolean): void {
  const record = storage?.getStore()
  if (!record || record.drawn !== undefined || !samePath(record.pathname)) return
  record.drawn = drawnOf(resolved)
}

/**
 * Records `resolved` as what the request drew in place of a resolution of its
 * own path that drew nothing (the template kit's `/events/<type>`, the events
 * page drawn where the path resolved to `not_found`). A page or an entry
 * already recorded stays.
 */
export function drawnInstead(resolved: Resolved): void {
  const record = storage?.getStore()
  if (!record || record.drawn) return
  record.drawn = drawnOf(resolved)
}

/** The header naming what `record` drew, for a 200 HTML render; empty for anything else. */
export function drawnHeaders(record: DrawnRecord, response: Response): Record<string, string> {
  const drawn = record.drawn
  if (!drawn || response.status !== 200 || !/^text\/html\b/i.test(response.headers.get('Content-Type') ?? '')) return {}
  return 'page' in drawn ? { [DRAWN_PAGE_HEADER]: drawn.page } : { [DRAWN_ENTRY_HEADER]: drawn.entry }
}
