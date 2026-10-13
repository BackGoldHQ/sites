// Where a visitor's browser reads an event's live counts: the Content API's
// `GET /events/live?ids=`, which answers `{ events: [{ id, going, seats_left }] }`
// outside the content version (`Cache-Control: public, max-age=30`). The page
// around the counts is cached under the content version, so the counts are
// never part of it: a few lines of script fetch them after the page loads.
//
// Which address the browser asks, by how the site reads BackGold:
//
// - First-party (`locals.backgold.firstParty`: `BACKGOLD_SITE_ID` with the
//   `BACKGOLD_API` binding, or BackGold's shared template Worker): the site's
//   host is the api's own, and the api answers `/api/content/v1/events/live`
//   there for that host's site with no key, so the browser asks that
//   same-origin path and sends no Authorization header.
// - With a site key: the browser sends the publishable key
//   (`BACKGOLD_SITE_KEY`, which only reads what the public site already
//   shows) to `<BACKGOLD_API_ORIGIN>/api/content/v1/events/live`, as any
//   partner's browser code may. Without a publishable key, or with an api
//   origin that is not an http(s) URL, there is nothing to ask and no counts
//   are drawn.

import { apiOrigin, trimmed, workerVars } from './env'

const PUBLISHABLE_KEY = /^bg_site_pk_[A-Za-z0-9]+$/
const LIVE_PATH = '/api/content/v1/events/live'

export interface LiveSource {
  /** The same-origin path (first-party), else `<api origin>/api/content/v1/events/live`. */
  url: string
  /** The publishable key the browser sends; null first-party, where none is sent. */
  key: string | null
}

/** The live route for this site (see above); null when a key-mode site has nothing to ask with. */
export async function liveSource(firstParty: boolean): Promise<LiveSource | null> {
  if (firstParty) return { url: LIVE_PATH, key: null }
  const env = await workerVars()
  const key = trimmed(env.BACKGOLD_SITE_KEY)
  if (!PUBLISHABLE_KEY.test(key)) return null
  const origin = apiOrigin(env)
  return origin ? { url: `${origin}${LIVE_PATH}`, key } : null
}

const emitted = new WeakSet<Request>()

/** True the first time it is asked during one render, so a page carries one copy of the live script. */
export function firstLiveScript(request: Request): boolean {
  if (emitted.has(request)) return false
  emitted.add(request)
  return true
}
