// POST /api/backgold/webhook — BackGold's content events (docs/WEBHOOKS.md).
// The only thing an event changes here is the content version the client
// trusts; every cached read and every edge-cached page is keyed by it. The
// isolate that receives the event moves at once (and writes the version to
// BACKGOLD_CACHE); every other warm isolate keeps its version in memory until
// its own re-check with BackGold, at most 60 seconds later.

import { parseContentEvent, verifyBackgoldWebhook } from '@backgold/content'
import type { BackgoldContent } from '@backgold/content'
import { errorResponse, noContent, siteNotConfigured } from './respond.js'

/** BackGold's verifier window, seconds either side of now. */
const TOLERANCE_SECONDS = 300

export interface WebhookDeps {
  /** The isolate's client; null while the site key is not configured. */
  client: BackgoldContent | null
  /** This site's id (`/site` `site.id`): an event for another site of the same organization is ignored. */
  siteId: string | null
  /** `BACKGOLD_WEBHOOK_SECRET`. */
  secret: string | undefined
  /** `BACKGOLD_REBUILD_HOOK_URL`. */
  rebuildHookUrl?: string | undefined
  /** Keeps the rebuild POST alive after the response (`cfContext.waitUntil`); without it the POST is awaited. */
  waitUntil?: (promise: Promise<unknown>) => void
  /** Default `globalThis.fetch`; used only for the rebuild hook. */
  fetch?: typeof fetch
  /** Default `console.warn`. Receives the reason and the delivery id, never a secret, key or hook URL. */
  log?: (message: string) => void
  /** Unix seconds; tests pass their own. */
  now?: number
}

/** Why a signature failed, for the log line only; the response says nothing more than 401. */
function rejectionReason(signature: string | null, now: number): string {
  if (!signature) return 'no X-BackGold-Signature header'
  const t = /(?:^|,)\s*t=(\d{1,15})\s*(?:,|$)/.exec(signature)?.[1]
  if (t === undefined) return 'malformed signature header'
  return Math.abs(now - Number(t)) > TOLERANCE_SECONDS ? 'timestamp outside the 5-minute window' : 'signature does not match'
}

export async function handleWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const log = deps.log ?? ((message: string) => console.warn(message))
  const delivery = request.headers.get('X-BackGold-Delivery') ?? 'unknown'
  if (!deps.secret) {
    log(`backgold webhook: delivery ${delivery} refused, BACKGOLD_WEBHOOK_SECRET is not set`)
    return errorResponse(503, 'WEBHOOK_NOT_CONFIGURED', 'BACKGOLD_WEBHOOK_SECRET is not set on this Worker.')
  }
  if (!deps.client) return siteNotConfigured()

  const now = deps.now ?? Math.floor(Date.now() / 1000)
  const rawBody = await request.text()
  const signature = request.headers.get('X-BackGold-Signature')
  const valid = await verifyBackgoldWebhook({ rawBody, signature, secret: deps.secret, toleranceSeconds: TOLERANCE_SECONDS, now })
  if (!valid) {
    log(`backgold webhook: delivery ${delivery} rejected, ${rejectionReason(signature, now)}`)
    return errorResponse(401, 'BAD_SIGNATURE', 'The signature is missing, invalid or expired.')
  }

  const event = parseContentEvent(rawBody)
  if (!event) {
    log(`backgold webhook: delivery ${delivery} ignored, not a content event`)
    return noContent()
  }
  if (deps.siteId !== null && event.data.site_domain_id !== deps.siteId) {
    log(`backgold webhook: delivery ${delivery} ignored, it is for another site`)
    return noContent()
  }

  await deps.client.setVersion(event.data.content_version)

  if (deps.rebuildHookUrl) {
    const doFetch = deps.fetch ?? globalThis.fetch
    const rebuild = doFetch(deps.rebuildHookUrl, { method: 'POST' }).then(
      (res) => {
        if (!res.ok) log(`backgold webhook: delivery ${delivery}, rebuild hook answered ${res.status}`)
      },
      (error: unknown) => log(`backgold webhook: delivery ${delivery}, rebuild hook failed: ${error instanceof Error ? error.name : 'error'}`),
    )
    if (deps.waitUntil) deps.waitUntil(rebuild)
    else await rebuild
  }
  return noContent()
}
