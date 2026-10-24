// The Worker's environment as this package reads it. Astro 7 on
// @astrojs/cloudflare 14 has no `locals.runtime.env`; vars, secrets and
// bindings are the `env` export of the `cloudflare:workers` module. It is
// imported lazily so `@backgold/astro/server` still loads where that module
// does not exist (Node tests, tooling); there the environment is empty.

import type { KvLike } from '@backgold/content'

/** Every name the package reads. There is no analytics variable: its switch lives in BackGold. */
export interface BackgoldEnv {
  /** Publishable site key, `bg_site_pk_…` (a var). Not read in first-party mode. */
  BACKGOLD_SITE_KEY?: string
  /**
   * The site's id (a var), set only on a single-site Worker inside BackGold's
   * namespace: with it the site is first-party and reads through `BACKGOLD_API`.
   * A template's shared Worker leaves it unset and the api names each
   * request's site in `X-BackGold-Site` (the dispatched form).
   */
  BACKGOLD_SITE_ID?: string
  /**
   * A custom site's token (a secret BackGold sets on the site's Worker; the
   * site never configures it): every first-party read sends it as
   * `X-BackGold-Site-Token`, which the api's `FirstPartyCustom` entrypoint
   * requires. Template Workers have none and send none.
   */
  BACKGOLD_SITE_TOKEN?: string
  /** First-party mode's service binding to the api's `FirstParty` entrypoint (a custom site's: `FirstPartyCustom`). */
  BACKGOLD_API?: { fetch: typeof fetch }
  /** The api origin (a var). Default `https://api.backgold.com`. */
  BACKGOLD_API_ORIGIN?: string
  /**
   * The site's public origin (a var), for canonicals, the sitemap and feeds.
   * Default, and always in the dispatched form: the request's origin.
   */
  SITE_URL?: string
  /** A KV namespace for the client's reads and content version. Default: memory, per isolate. */
  BACKGOLD_CACHE?: KvLike
  /** Secret site key, `bg_site_sk_…`: only `loadPreview` (the site's `/preview` page) reads it. */
  BACKGOLD_SECRET_KEY?: string
  /** The webhook endpoint's signing secret, `whsec_…`; also the revalidate bearer. */
  BACKGOLD_WEBHOOK_SECRET?: string
  /** A URL POSTed after each verified content event (a static build's trigger). */
  BACKGOLD_REBUILD_HOOK_URL?: string
}

export const DEFAULT_API_ORIGIN = 'https://api.backgold.com'

let loaded: Promise<BackgoldEnv> | undefined

/** The Worker's `env`; `{}` where `cloudflare:workers` cannot be imported. */
export function workerEnv(): Promise<BackgoldEnv> {
  loaded ??= import('cloudflare:workers').then(
    (mod) => mod.env as BackgoldEnv,
    () => ({}),
  )
  return loaded
}

/** `locals.cfContext.waitUntil` (@astrojs/cloudflare's ExecutionContext), when the runtime has one. */
export function waitUntilOf(locals: object): ((promise: Promise<unknown>) => void) | undefined {
  const cfContext = (locals as { cfContext?: { waitUntil(promise: Promise<unknown>): void } }).cfContext
  return cfContext ? (promise) => cfContext.waitUntil(promise) : undefined
}

/** A string var, trimmed; undefined when absent or blank. */
export function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** A service binding when `value` has a `fetch` function. */
export function serviceBinding(value: unknown): { fetch: typeof fetch } | undefined {
  const binding = value as { fetch?: unknown } | null | undefined
  return binding && typeof binding.fetch === 'function' ? (binding as { fetch: typeof fetch }) : undefined
}

/** The request header the api names a dispatched site's id in (the api's `SITE_HEADER`). */
const SITE_HEADER = 'X-BackGold-Site'

/** The request header a custom site's Worker proves its site in, from `BACKGOLD_SITE_TOKEN`. */
const SITE_TOKEN_HEADER = 'X-BackGold-Site-Token'

/** A site id as `@backgold/content` accepts it for first-party reads. */
export const SITE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The dispatched form of first-party mode: `BACKGOLD_API` is a binding and
 * `BACKGOLD_SITE_ID` is not set, so the Worker is a template's shared Worker
 * in BackGold's namespace and the api names each request's site in
 * `X-BackGold-Site`. A namespace Worker is reachable only through that
 * dispatch, and the api overwrites the header, so it is trusted here.
 */
export function isDispatched(env: BackgoldEnv): boolean {
  return text(env.BACKGOLD_SITE_ID) === undefined && serviceBinding(env.BACKGOLD_API) !== undefined
}

/** The dispatched site's id from the request header; null when it is missing or not a site id. */
function dispatchedSiteOf(headers: Headers | undefined): string | null {
  const value = headers?.get(SITE_HEADER)
  return value != null && SITE_ID_PATTERN.test(value) ? value : null
}

/** A request to the dispatched form that names no site: it answers `noSite()`. */
export function namesNoSite(env: BackgoldEnv, headers: Headers | undefined): boolean {
  return isDispatched(env) && dispatchedSiteOf(headers) === null
}

/**
 * First-party mode's site id, the binding, and `BACKGOLD_SITE_TOKEN` when it
 * is set: the site is `BACKGOLD_SITE_ID` when it is set (a single-site
 * Worker), else in the dispatched form the request's `X-BackGold-Site`;
 * undefined without the binding, and in the dispatched form without a
 * well-formed header. A key-mode site (no binding) never reads the header.
 * The token comes from the environment only, never from the request.
 */
export function firstPartyOf(
  env: BackgoldEnv,
  headers?: Headers,
): { siteId: string; binding: { fetch: typeof fetch }; token: string | undefined } | undefined {
  const binding = serviceBinding(env.BACKGOLD_API)
  if (!binding) return undefined
  const token = text(env.BACKGOLD_SITE_TOKEN)
  const configured = text(env.BACKGOLD_SITE_ID)
  if (configured !== undefined) return { siteId: configured, binding, token }
  const siteId = dispatchedSiteOf(headers)
  return siteId === null ? undefined : { siteId, binding, token }
}

/**
 * The binding's fetch for first-party reads: with a token, each call also
 * carries `X-BackGold-Site-Token`; without one, the binding's fetch as it is.
 */
export function firstPartyFetch(firstParty: { binding: { fetch: typeof fetch }; token: string | undefined }): typeof fetch {
  const { binding, token } = firstParty
  if (token === undefined) return (input, init) => binding.fetch(input, init)
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(SITE_TOKEN_HEADER, token)
    return binding.fetch(input, { ...init, headers })
  }
}

/** A KV binding when `value` has the three methods the store calls. */
export function kvBinding(value: unknown): KvLike | undefined {
  const kv = value as Partial<KvLike> | null | undefined
  return kv && typeof kv.get === 'function' && typeof kv.put === 'function' && typeof kv.delete === 'function'
    ? (kv as KvLike)
    : undefined
}
