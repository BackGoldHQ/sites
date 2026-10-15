// A client over the fixture api with some answers replaced, for the SEO
// outputs: `routes` maps a Content API path (query included when the test
// cares) to the body it answers, and everything else falls through to the
// shared examples.

import { createClient, memoryCache } from '@backgold/content'
import type { BackgoldContent, ContentTypeSummary, Entry, EntryDetail } from '@backgold/content'
import { CONTENT_API_EXAMPLES } from '@backgold/contract/content-api-examples'
import { API_ORIGIN, PK, fakeApi } from './fixtures.js'

export const SITE_URL = 'https://pinevalleyliberty.org'

export const entryDetail = CONTENT_API_EXAMPLES.EntryResponse as { entry: EntryDetail }
export const typesExample = CONTENT_API_EXAMPLES.TypesResponse as { types: ContentTypeSummary[] }

/** A routable built-in type; post, podcast and video list together (`index: 'blog'`). */
export function builtIn(key: string, plural: string, url_base: string | null = null): ContentTypeSummary {
  const index = ['post', 'podcast', 'video'].includes(key) ? 'blog' : null
  return { key, singular_label: plural.slice(0, -1), plural_label: plural, routable: true, url_base, built_in: true, index, fields: [] }
}

/** A list entry from the example, with the given changes. */
export function entryOf(changes: Partial<Entry>): Entry {
  const { body: _body, fields: _fields, ...summary } = entryDetail.entry
  return { ...summary, ...changes }
}

export function client(routes: Record<string, unknown> = {}): { bg: BackgoldContent; calls: URL[] } {
  const api = fakeApi()
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const path = url.pathname.replace(/^\/api\/content\/v1/, '')
    const body = routes[`${path}${url.search}`] ?? routes[path]
    if (body !== undefined) {
      api.calls.push(url)
      return Response.json(body, { headers: { 'X-Content-Version': String(api.version) } })
    }
    return api.fetch(input, init)
  }) as typeof globalThis.fetch
  return { bg: createClient({ key: PK, apiOrigin: API_ORIGIN, cache: memoryCache(), fetch }), calls: api.calls }
}
