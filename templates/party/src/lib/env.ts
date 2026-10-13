// The Worker's vars and bindings: the `env` export of the Workers runtime
// module `cloudflare:workers`, imported on first use so a module that reads
// it still loads where that module does not exist (there, `{}`).

let loaded: Promise<Record<string, unknown>> | undefined

/** The Worker's `env`; `{}` where `cloudflare:workers` cannot be imported. */
export function workerVars(): Promise<Record<string, unknown>> {
  loaded ??= import('cloudflare:workers').then(
    (mod) => mod.env as Record<string, unknown>,
    () => ({}),
  )
  return loaded
}

/** A string var, trimmed; '' for anything else. */
export const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const DEFAULT_API_ORIGIN = 'https://api.backgold.com'

/**
 * Where BackGold's api lives: `BACKGOLD_API_ORIGIN`, else
 * `https://api.backgold.com`, without a trailing slash. Null when the var is
 * not an http(s) URL, or carries a query or a fragment.
 */
export function apiOrigin(env: Record<string, unknown>): string | null {
  const origin = (trimmed(env.BACKGOLD_API_ORIGIN) || DEFAULT_API_ORIGIN).replace(/\/+$/, '')
  try {
    const url = new URL(origin)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.search && !url.hash ? origin : null
  } catch {
    return null
  }
}
