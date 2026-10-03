// Verifying and reading the content events BackGold POSTs to a partner's
// webhook endpoint (docs/WEBHOOKS.md, docs/developers/headless-content-api.md
// §8). The signing scheme is the api's own (packages/api/src/lib/webhooks.ts
// signWebhookPayload): `X-BackGold-Signature: t=<unix seconds>,v1=<hex>`, the
// hex being HMAC-SHA256 over `${t}.${rawBody}` keyed with the endpoint secret.

import type { ContentWebhookEvent } from '@givegold/shared'
import type { ContentEvent, ContentEventType, ParseContentEvent, VerifyBackgoldWebhook } from './contract.js'
import { hmacSha256Hex } from './hash.js'

/** What BackGold's own verifier allows: five minutes. */
const DEFAULT_TOLERANCE_SECONDS = 300

/**
 * The five content events. The api's list is CONTENT_WEBHOOK_EVENTS in
 * @givegold/shared constants, which this bundle cannot import at runtime
 * (the shared index pulls in zod); the two checks below fail the build if
 * this list and the api's, or the contract's union, ever differ.
 */
const CONTENT_EVENT_TYPES = [
  'site.published',
  'content.published',
  'content.unpublished',
  'menu.updated',
  'redirects.updated',
] as const satisfies readonly ContentEventType[]
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const sameAsApi: Exact<(typeof CONTENT_EVENT_TYPES)[number], ContentWebhookEvent> = true
const sameAsContract: Exact<(typeof CONTENT_EVENT_TYPES)[number], ContentEventType> = true
void sameAsApi
void sameAsContract

const encoder = new TextEncoder()

/** Equal-length strings compared without an early exit. */
function constantTimeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!
  return diff === 0
}

/**
 * True when `signature` is BackGold's signature of `rawBody` under `secret`
 * and its timestamp is within `toleranceSeconds` of `now`, in either
 * direction. The first `t=` and the first `v1=` part are the ones read, as
 * the api's verifier reads them. False for anything malformed — a missing or
 * non-numeric `t`, a `v1` that is not 64 lowercase hex characters, an empty
 * secret, a negative tolerance. Never throws.
 */
export const verifyBackgoldWebhook: VerifyBackgoldWebhook = async (input) => {
  try {
    const { rawBody, signature, secret } = input
    if (typeof rawBody !== 'string' || typeof signature !== 'string' || typeof secret !== 'string' || secret === '') return false
    const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
    const now = input.now ?? Math.floor(Date.now() / 1000)
    if (!Number.isFinite(tolerance) || tolerance < 0 || !Number.isFinite(now)) return false

    const parts = signature.split(',').map((part) => part.trim())
    const t = parts.find((part) => part.startsWith('t='))?.slice(2)
    const v1 = parts.find((part) => part.startsWith('v1='))?.slice(3)
    if (!t || !v1 || !/^\d{1,15}$/.test(t) || !/^[0-9a-f]{64}$/.test(v1)) return false

    const timestamp = Number(t)
    if (now - timestamp > tolerance || timestamp - now > tolerance) return false

    return constantTimeEqual(v1, await hmacSha256Hex(secret, `${t}.${rawBody}`))
  } catch {
    return false
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The event when `rawBody` is one of the five content events in the house
 * envelope `{ id, type, created_at, data }` with `data.site_domain_id` and a
 * non-negative integer `data.content_version`; null for any other event, malformed JSON or
 * a missing field. Only the documented fields are copied. Never throws.
 */
export const parseContentEvent: ParseContentEvent = (rawBody) => {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (!isRecord(parsed) || !isRecord(parsed.data)) return null
  const { id, type, created_at: createdAt, data } = parsed
  if (typeof id !== 'string' || typeof createdAt !== 'string') return null
  if (typeof type !== 'string' || !(CONTENT_EVENT_TYPES as readonly string[]).includes(type)) return null
  const siteDomainId = data.site_domain_id
  const version = data.content_version
  if (typeof siteDomainId !== 'string' || typeof version !== 'number' || !Number.isInteger(version) || version < 0) return null

  const event: ContentEvent = {
    id,
    type: type as ContentEventType,
    created_at: createdAt,
    data: { site_domain_id: siteDomainId, content_version: version },
  }
  if (typeof data.page_id === 'string') event.data.page_id = data.page_id
  if (typeof data.content_item_id === 'string') event.data.content_item_id = data.content_item_id
  if (typeof data.menu_key === 'string') event.data.menu_key = data.menu_key
  return event
}
