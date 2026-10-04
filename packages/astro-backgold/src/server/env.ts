// The Worker's environment as this package reads it. Astro 7 on
// @astrojs/cloudflare 14 has no `locals.runtime.env`; vars, secrets and
// bindings are the `env` export of the `cloudflare:workers` module. It is
// imported lazily so `@backgold/astro/server` still loads where that module
// does not exist (Node tests, tooling); there the environment is empty.

import type { KvLike } from '@backgold/content'

/** Every name the package reads. There is no analytics variable: its switch lives in BackGold. */
export interface BackgoldEnv {
  /** Publishable site key, `bg_site_pk_…` (a var). */
  BACKGOLD_SITE_KEY?: string
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

/** A KV binding when `value` has the three methods the store calls. */
export function kvBinding(value: unknown): KvLike | undefined {
  const kv = value as Partial<KvLike> | null | undefined
  return kv && typeof kv.get === 'function' && typeof kv.put === 'function' && typeof kv.delete === 'function'
    ? (kv as KvLike)
    : undefined
}
