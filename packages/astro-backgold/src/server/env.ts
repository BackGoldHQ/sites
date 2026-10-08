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
   * The site's id (a var), set only on a site Worker inside BackGold's
   * namespace: with it the site is first-party and reads through `BACKGOLD_API`.
   */
  BACKGOLD_SITE_ID?: string
  /** First-party mode's service binding to the api's `FirstParty` entrypoint. */
  BACKGOLD_API?: { fetch: typeof fetch }
  /** The api origin (a var). Default `https://api.backgold.com`. */
  BACKGOLD_API_ORIGIN?: string
  /** The site's public origin (a var), for canonicals, the sitemap and feeds. Default: the request's origin. */
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

/**
 * First-party mode's site id and the binding's fetch, when `BACKGOLD_SITE_ID`
 * is set and `BACKGOLD_API` is a binding; undefined otherwise.
 */
export function firstPartyOf(env: BackgoldEnv): { siteId: string; binding: { fetch: typeof fetch } } | undefined {
  const siteId = text(env.BACKGOLD_SITE_ID)
  const binding = serviceBinding(env.BACKGOLD_API)
  return siteId !== undefined && binding ? { siteId, binding } : undefined
}

/** A KV binding when `value` has the three methods the store calls. */
export function kvBinding(value: unknown): KvLike | undefined {
  const kv = value as Partial<KvLike> | null | undefined
  return kv && typeof kv.get === 'function' && typeof kv.put === 'function' && typeof kv.delete === 'function'
    ? (kv as KvLike)
    : undefined
}
