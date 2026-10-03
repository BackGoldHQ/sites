// What the client and the `backgold-content` CLI agree on about a request:
// the shape of a site key and where the Content API lives under an origin.

export const DEFAULT_API_ORIGIN = 'https://api.backgold.com'
export const CONTENT_API_PREFIX = '/api/content/v1'

/**
 * A site key as the api mints it: the publishable or secret prefix, then
 * base62 (packages/api/src/lib/site-api-keys.ts mintSiteKey). Nothing else
 * reaches an Authorization header, so a stray control character can never
 * make `Headers` throw with the key in its message.
 */
export const SITE_KEY_PATTERN = /^bg_site_(pk|sk)_[A-Za-z0-9]+$/

/**
 * The Content API base under `raw` (trailing slashes dropped, a path kept:
 * `https://proxy.example/base` → `https://proxy.example/base/api/content/v1`)
 * and its origin, which every request must stay on. Throws a TypeError for
 * anything that is not an http(s) URL without query or fragment.
 */
export function contentApiBase(raw: string): { base: string; origin: string } {
  const trimmed = raw.replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new TypeError(`apiOrigin is not a URL: ${JSON.stringify(raw)}`)
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash) {
    throw new TypeError(`apiOrigin must be an http(s) URL with no query or fragment: ${JSON.stringify(raw)}`)
  }
  return { base: trimmed + CONTENT_API_PREFIX, origin: url.origin }
}
