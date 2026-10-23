// The organization's YouTube stream as one request reads it: the client's
// `live()` (GET /live, held 60 s by the client, never under the content
// version), asked at most once per request and shared by everything the
// request draws. A failed read is nothing live: a page never fails because the
// stream could not be read.
//
// The edge cache keys a page on it too (liveVariant, in the middleware): a
// page drawn while a stream is live or upcoming is stored apart from the one
// drawn while nothing is, so a template that draws the stream (the kit's
// Watch Live item and /live page) changes within the client's minute,
// whatever the content version.

import type { LiveStream } from '@backgold/content'
import type { BackgoldReady } from './context.js'

const reads = new WeakMap<BackgoldReady, Promise<LiveStream | null>>()

/** The request's live stream, read once; null when nothing is live or upcoming, or the read failed. */
export function liveStreamOf(bg: BackgoldReady): Promise<LiveStream | null> {
  let read = reads.get(bg)
  if (!read) {
    read = bg.client.live().catch(() => null)
    reads.set(bg, read)
  }
  return read
}

/** FNV-1a over the text, as 8 hex. */
function shortHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * The stream's part of the edge-cache key: empty while nothing is live or
 * upcoming, else `<status>.<8 hex>` of everything a page can draw from it, so
 * a new stream, a stream going live, a retitled stream or a moved start is a
 * new entry.
 */
export function liveVariant(stream: LiveStream | null): string {
  if (!stream) return ''
  const drawn = [stream.video_id, stream.title, stream.url, stream.embed_url, stream.thumbnail_url, stream.scheduled_start_at, stream.started_at, stream.channel_title]
  return `${stream.status}.${shortHash(JSON.stringify(drawn))}`
}
