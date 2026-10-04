// Every Content API read this package makes is bounded: a read that has not
// answered in API_TIMEOUT_MS is aborted, and the request it belongs to ends
// with apiUnavailable() instead of waiting on the api for as long as the
// platform allows.

/** How long one Content API read may take. */
export const API_TIMEOUT_MS = 10_000

const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)

/** `base` with every call aborted after `ms`; a caller's own signal still aborts it too. */
export function withTimeout(base: typeof fetch = defaultFetch, ms: number = API_TIMEOUT_MS): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    return base(input, { ...init, signal })
  }
}

/** A read `withTimeout` aborted. */
export function isApiTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'TimeoutError'
}

/**
 * What a visitor gets when a read timed out before the page started: a 504
 * that names nothing internal and that no cache keeps.
 */
export function apiUnavailable(): Response {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Try again in a moment</title><p>This page could not be loaded just now. Please try again in a moment.</p></html>',
    { status: 504, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '30' } },
  )
}
