// HTTP to the api and to Cloudflare's assets upload. A request that fails
// before any answer (a network error) is sent once more; an answer, 4xx or
// 5xx, is never retried. Redirects are never followed, so the token goes to
// the origin it was meant for and nowhere else.

/** Anything shaped like a deploy token, in any message the CLI prints. */
const TOKEN_LIKE = /bg_deploy_\S*/g
export const redact = (text: string) => text.replace(TOKEN_LIKE, 'bg_deploy_…')

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
    /** The answer's own `error` sentence, when it had one. */
    readonly apiError: string | null = null,
  ) {
    super(message)
  }
  /** 3 for a refused token, or an organization without custom sites (402 NOT_ENTITLED); else 1. */
  get exitCode(): 1 | 3 {
    return this.status === 401 || this.status === 403 || (this.status === 402 && this.code === 'NOT_ENTITLED') ? 3 : 1
  }
}

export interface RequestOptions {
  method?: string
  bearer?: string
  json?: unknown
  body?: BodyInit
  contentType?: string
}

/** `{ error, code }` (or just the status) for a non-2xx answer. */
async function failure(url: string, res: Response): Promise<HttpError> {
  const body = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown; errors?: unknown } | null
  let error = typeof body?.error === 'string' ? body.error : null
  // Cloudflare's own envelope: { errors: [{ code, message }] }.
  if (!error && Array.isArray(body?.errors)) {
    error = body.errors.map((e: { message?: unknown }) => (typeof e?.message === 'string' ? e.message : '')).filter(Boolean).join('; ') || null
  }
  const code = typeof body?.code === 'string' ? body.code : null
  const status = `HTTP ${res.status}`
  const message = error && code ? `${error} (${code}, ${status})` : error ? `${error} (${status})` : `${new URL(url).origin} answered ${status}`
  return new HttpError(redact(message), res.status, code, error && redact(error))
}

export async function request(doFetch: typeof fetch, url: string, options: RequestOptions = {}): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`
  let body = options.body
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  } else if (options.contentType) {
    headers['Content-Type'] = options.contentType
  } else if (body === undefined && (options.method ?? 'GET') !== 'GET') {
    // A bodyless DELETE says JSON too, so the api's CSRF filter never reads it as a form post.
    headers['Content-Type'] = 'application/json'
  }
  const init: RequestInit = { method: options.method ?? 'GET', headers, redirect: 'manual', ...(body !== undefined ? { body } : {}) }
  let res: Response
  try {
    res = await doFetch(url, init)
  } catch {
    try {
      res = await doFetch(url, init)
    } catch (err) {
      const reason = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err)
      throw new HttpError(redact(`could not reach ${new URL(url).origin}: ${reason}`), null, null)
    }
  }
  if (res.status < 200 || res.status >= 300) throw await failure(url, res)
  if (res.status === 204) return { status: 204, body: null }
  const parsed = await res.json().catch(() => undefined)
  if (parsed === undefined) throw new HttpError(`${new URL(url).origin} answered HTTP ${res.status} with no JSON`, res.status, null)
  return { status: res.status, body: parsed }
}

/** The api's `{ data }` envelope; `null` for a 204. */
export async function apiCall<T>(doFetch: typeof fetch, url: string, options: RequestOptions = {}): Promise<T> {
  const { body } = await request(doFetch, url, options)
  if (body === null) return null as T
  if (typeof body !== 'object' || !('data' in body)) throw new HttpError(`${new URL(url).origin} did not answer with { data }`, null, null)
  return (body as { data: T }).data
}

/** An http(s) origin the token may be sent to: https anywhere, http only to this machine. */
export function checkOrigin(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username || url.password) return null
  return url.origin
}
