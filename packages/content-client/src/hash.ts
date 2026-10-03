// Web Crypto helpers shared by the client, the stores and the webhook
// verifier. Every runtime the package supports (Node 20+, Workers, Deno, Bun,
// browsers) has `crypto.subtle` on the global.

const encoder = new TextEncoder()

/** Lowercase hex of a digest or signature. */
export function toHex(buf: ArrayBuffer): string {
  let out = ''
  for (const b of new Uint8Array(buf)) out += b.toString(16).padStart(2, '0')
  return out
}

/** SHA-256 of a UTF-8 string, as 64 lowercase hex characters. */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

/** HMAC-SHA256 of `message` keyed with `secret` (both UTF-8), as lowercase hex. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}
