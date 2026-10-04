/** `{ error, code }`, the api's error shape, never stored by any cache. */
export function errorResponse(status: number, code: string, error: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

/** A route that needs the site key while it is missing or malformed. */
export const siteNotConfigured = (): Response =>
  errorResponse(503, 'SITE_NOT_CONFIGURED', 'BACKGOLD_SITE_KEY is not set on this Worker.')

/** A 204 that no cache keeps. */
export const noContent = (): Response => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

const encoder = new TextEncoder()

/** Equal strings, compared as SHA-256 digests so neither content nor length shows in the timing. */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const p = new Uint8Array(x)
  const q = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < p.length; i++) diff |= p[i]! ^ q[i]!
  return diff === 0
}
