// GET /preview — BackGold's "Preview on your site" link and the Developer
// page's test preview: `?bg_preview=<token>&path=<path>`. The page is the
// site's own (so a draft renders in its layout); it calls `loadPreview`.
// The draft is read with the secret key, or in first-party mode as the site
// through the `BACKGOLD_API` binding, by a client made for this request
// alone (its store is a fresh memory map, and the client never stores a
// preview read anyway).
// Every answer, draft or error, carries PREVIEW_HEADERS (private, no-store;
// noindex): a token that is not one (empty, `.`, `..`) is a 400, a read that
// timed out a 504, and anything else that goes wrong reading the draft (the
// network, an api error) a 502 that names nothing internal.

import { BackgoldApiError, createClient, memoryCache, previewFromRequest } from '@backgold/content'
import type { PreviewResponse } from '@backgold/content'
import { DEFAULT_API_ORIGIN, firstPartyOf, text, workerEnv } from './env.js'
import { errorResponse } from './respond.js'
import { isApiTimeout, withTimeout } from './timeout.js'

/** The headers every preview answer carries. */
export const PREVIEW_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } as const

/** The Developer page's own sentence for a server without a secret key (site-developer-panel.gts). */
const NO_SECRET_KEY =
  'No secret keys yet. A server that renders previews or reads drafts needs one; a browser never does.'

export interface PreviewDeps {
  /** `BACKGOLD_SECRET_KEY`. */
  secretKey: string | undefined
  /** `BACKGOLD_API_ORIGIN`, already defaulted. */
  apiOrigin: string
  /** Default `globalThis.fetch`. */
  fetch?: typeof fetch
  /**
   * First-party mode: the site id and the `BACKGOLD_API` binding's fetch.
   * When given the draft is read through it, and `secretKey` and `fetch` are not used.
   */
  firstParty?: { siteId: string; fetch: typeof fetch }
}

export type PreviewResult =
  | { ok: true; preview: PreviewResponse; path: string }
  | { ok: false; response: Response }

const fail = (status: number, code: string, error: string): PreviewResult => ({
  ok: false,
  response: errorResponse(status, code, error, PREVIEW_HEADERS),
})

/** The draft a preview link names, or the response to send instead. */
export async function handlePreview(request: Request, deps: PreviewDeps): Promise<PreviewResult> {
  const notConfigured = fail(503, 'PREVIEW_NOT_CONFIGURED', NO_SECRET_KEY)
  if (!deps.firstParty && !deps.secretKey) return notConfigured
  const asked = previewFromRequest(request.url)
  if (!asked) return fail(400, 'BAD_PREVIEW_TOKEN', 'This preview link has no bg_preview token.')
  // `.` and `..` would name a path outside /preview/; the client refuses them, and no token BackGold mints is one.
  if (asked.token === '.' || asked.token === '..') return fail(400, 'BAD_PREVIEW_TOKEN', 'This preview link is not valid or has expired.')

  let client
  try {
    const cache = memoryCache({ max: 1 })
    client = deps.firstParty
      ? createClient({ firstParty: { siteId: deps.firstParty.siteId }, apiOrigin: deps.apiOrigin, cache, fetch: withTimeout(deps.firstParty.fetch) })
      : createClient({ key: deps.secretKey, apiOrigin: deps.apiOrigin, cache, fetch: withTimeout(deps.fetch) })
  } catch {
    return notConfigured
  }
  try {
    const preview = await client.preview(asked.token)
    if (!preview) return fail(404, 'NOT_FOUND', 'This preview names a page this site no longer has.')
    return { ok: true, preview, path: asked.path }
  } catch (error) {
    if (error instanceof BackgoldApiError && error.code === 'BAD_PREVIEW_TOKEN') {
      return fail(400, 'BAD_PREVIEW_TOKEN', 'This preview link is not valid or has expired.')
    }
    if (error instanceof BackgoldApiError && error.code === 'SECRET_KEY_REQUIRED') return notConfigured
    if (isApiTimeout(error)) return fail(504, 'PREVIEW_UNAVAILABLE', 'BackGold did not answer in time. Try the preview again.')
    return fail(502, 'PREVIEW_UNAVAILABLE', 'BackGold could not be reached for this preview. Try again.')
  }
}

/**
 * `handlePreview` with the Worker's own environment: `BACKGOLD_SECRET_KEY`,
 * or in first-party mode `BACKGOLD_SITE_ID` and the `BACKGOLD_API` binding,
 * and `BACKGOLD_API_ORIGIN`. What a site's `/preview` page calls.
 */
export async function loadPreview(request: Request): Promise<PreviewResult> {
  const env = await workerEnv()
  const firstParty = firstPartyOf(env)
  return handlePreview(request, {
    secretKey: text(env.BACKGOLD_SECRET_KEY),
    apiOrigin: text(env.BACKGOLD_API_ORIGIN) ?? DEFAULT_API_ORIGIN,
    ...(firstParty ? { firstParty: { siteId: firstParty.siteId, fetch: (input, init) => firstParty.binding.fetch(input, init) } } : {}),
  })
}
