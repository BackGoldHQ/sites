import type { BackgoldApiErrorShape } from './contract.js'

/**
 * A non-2xx answer the client did not turn into `null`, carrying the api's
 * `{ error, code }` and the HTTP status. `code` is `HTTP_<status>` when the
 * body was not that shape. The client also raises it locally, before any
 * request, for a preview read with a publishable key (403
 * `SECRET_KEY_REQUIRED`, the api's own answer to that read).
 */
export class BackgoldApiError extends Error implements BackgoldApiErrorShape {
  override readonly name = 'BackgoldApiError' as const
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Thrown by `createClient` for a secret key (`bg_site_sk_…`) in a runtime that has a `document`. */
export class SecretKeyInBrowserError extends Error {
  override readonly name = 'SecretKeyInBrowserError' as const

  constructor() {
    super(
      'A secret site key (bg_site_sk_…) reads drafts and must stay on your server. ' +
        'Use the publishable key (bg_site_pk_…) in browser code.',
    )
  }
}
