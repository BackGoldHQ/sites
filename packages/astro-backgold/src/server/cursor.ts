// The `?cursor=` a list page is asked for. The api's entry-list cursor is
// base64url of `<publish_at>|<id>` (decodeEntryCursor in the api's contract
// module); a value that is not one it would accept is no cursor at all, so it
// never reaches the api, never enters an edge-cache key, and the list shows
// its first page.

/** The query parameter a list page reads. */
export const CURSOR_PARAM = 'cursor'

/** The api refuses a longer cursor. */
const CURSOR_MAX = 512

function base64UrlText(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  try {
    const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** The value when it is a cursor the api would accept, else null. */
export function validCursor(value: string | null | undefined): string | null {
  if (!value || value.length > CURSOR_MAX) return null
  const text = base64UrlText(value)
  if (text === null) return null
  const bar = text.indexOf('|')
  if (bar <= 0) return null
  const id = text.slice(bar + 1)
  if (!id || id.includes('|') || Number.isNaN(Date.parse(text.slice(0, bar)))) return null
  return value
}
