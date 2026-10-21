// The archive's text extractions (an agenda's, a document's readable text),
// read from where the record's link points and kept in KV under the site's
// content version, as the index is. The text is the archive's copy, shown
// exactly as made.

import { workerVars } from '@backgold/template-kit/lib/env'

const TEXT_TTL_SECONDS = 7 * 24 * 60 * 60
/** The largest text kept (KV takes 25 MiB; an agenda runs about 300 KB). */
const MAX_TEXT_BYTES = 4 * 1024 * 1024
const TIMEOUT_MS = 8000

interface KvLike {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The plain text at `url` (an http(s) address that answers text/plain), or
 * null when it cannot be read just now: the page says so and links to it.
 */
export async function readableText(url: string, scope: { siteId: string; version: number }): Promise<string | null> {
  if (!/^https?:\/\//.test(url)) return null
  const env = await workerVars()
  const kv = env.BACKGOLD_CACHE as KvLike | undefined
  const key = `bg-archive-text:${scope.siteId}:v${scope.version}:${await hash(url)}`
  const kept = kv && typeof kv.get === 'function' ? await kv.get(key, 'text').catch(() => null) : null
  if (kept !== null && kept !== undefined) return kept
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'text/plain' } })
    if (!res.ok || !(res.headers.get('Content-Type') ?? 'text/plain').startsWith('text/')) return null
    const text = await res.text()
    if (text.length > MAX_TEXT_BYTES) return null
    if (kv && typeof kv.put === 'function') await kv.put(key, text, { expirationTtl: TEXT_TTL_SECONDS }).catch(() => undefined)
    return text
  } catch {
    return null
  }
}
