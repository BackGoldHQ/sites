import type { PreviewFromRequest } from './contract.js'

/** Resolves a relative preview-route URL (`/api/bg-preview?…`); nothing is fetched from it. */
const RELATIVE_BASE = 'https://preview.invalid'

/**
 * A path the partner can route without leaving its own site: path-absolute
 * (`/`), not protocol-relative (`//host`), no backslash (some routers read it
 * as `/`), and no `..` segment, literal or percent-encoded.
 */
function isSafePath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return false
  return !path.split('/').some((segment) => {
    if (segment === '..') return true
    try {
      return decodeURIComponent(segment) === '..'
    } catch {
      return true
    }
  })
}

/**
 * Reads what BackGold's "Preview on your site" link carries:
 * `?bg_preview=<token>&path=<path>`. Null when there is no token; the path is
 * `/` when it is absent or unsafe (the Developer page's test preview sends no
 * path).
 */
export const previewFromRequest: PreviewFromRequest = (url) => {
  let parsed: URL
  try {
    parsed = typeof url === 'string' ? new URL(url, RELATIVE_BASE) : url
  } catch {
    return null
  }
  const token = parsed.searchParams.get('bg_preview')
  if (!token) return null
  const path = parsed.searchParams.get('path')
  return { token, path: path !== null && isSafePath(path) ? path : '/' }
}
