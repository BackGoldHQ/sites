import { createClient, memoryCache } from '@backgold/content'
import type { ContentTypeSummary, EntriesResponse, Entry, EntryResponse } from '@backgold/content'
import { CONTENT_API_EXAMPLES } from '@givegold/shared/content-api-examples'
import { describe, expect, it } from 'vitest'
import { resolveRoute } from '../src/server/resolve.js'
import { API_ORIGIN, PK } from './fixtures.js'

const type = (key: string, over: Partial<ContentTypeSummary>): ContentTypeSummary => ({
  key,
  singular_label: key,
  plural_label: `${key}s`,
  routable: true,
  url_base: key,
  built_in: false,
  fields: [],
  ...over,
})

const TYPES = [
  type('post', { built_in: true, url_base: 'blog' }),
  type('podcast', { built_in: true, url_base: 'podcast' }),
  type('plank', { built_in: true, routable: false, url_base: null }),
  type('endorsement', { url_base: 'endorsements' }),
  type('note', { routable: false, url_base: null }),
]

const base = (CONTENT_API_EXAMPLES.EntriesResponse as EntriesResponse).entries[0]!
const entry = (over: Partial<Entry>): Entry => ({ ...base, ...over })
const post = entry({})
const episode = entry({ id: 'ci_9a0', slug: 'episode-one', type: 'podcast', title: 'Episode one', publish_at: '2026-09-30T12:00:00.000Z', terms: [] })
const endorsement = entry({
  id: 'ci_e1',
  slug: 'sheriff',
  type: 'endorsement',
  title: 'The sheriff',
  url: '/endorsements/sheriff',
  terms: [
    { taxonomy: 'tag', slug: 'taxes', label: 'Taxes' },
  ],
})
const elsewhere = entry({ id: 'ci_e2', slug: 'mayor', type: 'endorsement', url: '/endorsements/mayor', terms: [{ taxonomy: 'category', slug: 'taxes', label: 'Taxes' }] })
const detail = (e: Entry): EntryResponse => ({ entry: { ...e, body: { markdown: '' }, fields: {} }, areas: {} })

function api() {
  const calls: string[] = []
  const routes: Record<string, unknown> = {
    '/site': CONTENT_API_EXAMPLES.SiteResponse,
    '/pages': { pages: [...(CONTENT_API_EXAMPLES.PagesResponse as { pages: unknown[] }).pages, { id: 'lp_issues', slug: 'issues', title: 'Issues', url: '/issues', is_home: false, published_at: null, updated_at: '2026-10-01T00:00:00.000Z' }] },
    '/pages/home': CONTENT_API_EXAMPLES.PageResponse,
    '/pages/issues': { ...(CONTENT_API_EXAMPLES.PageResponse as object), page: { ...(CONTENT_API_EXAMPLES.PageResponse as { page: object }).page, slug: 'issues', url: '/issues', is_home: false } },
    '/types': { types: TYPES },
    '/entries/post?limit=50': { entries: [post], next_cursor: 'cursor-post' },
    '/entries/podcast?limit=50': { entries: [episode], next_cursor: null },
    '/entries/endorsement?limit=50': { entries: [endorsement], next_cursor: 'cursor-endorsement' },
    '/entries/endorsement?limit=50&term=taxes': { entries: [endorsement, elsewhere], next_cursor: null },
    '/entries/post?limit=50&term=taxes': { entries: [post], next_cursor: null },
    '/entries/podcast?limit=50&term=taxes': { entries: [], next_cursor: null },
    '/entries/post/levy-explained': detail(post),
    '/entries/podcast/episode-one': detail(episode),
    '/entries/endorsement/sheriff': detail(endorsement),
    '/terms/tag': CONTENT_API_EXAMPLES.TermsResponse,
    '/authors/dana-k': CONTENT_API_EXAMPLES.AuthorResponse,
  }
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const path = url.pathname.replace(/^\/api\/content\/v1/, '')
    const key = `${path}${url.search}`
    if (path !== '/site') calls.push(key)
    const headers = { 'X-Content-Version': '184', ETag: '"v184"' }
    const body = routes[key]
    if (body === undefined) return Response.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers })
    return Response.json(body, { headers })
  }) as typeof globalThis.fetch
  return { client: createClient({ key: PK, apiOrigin: API_ORIGIN, cache: memoryCache(), fetch }), calls }
}

describe('resolveRoute', () => {
  it('resolves / to the home page with one read', async () => {
    const { client, calls } = api()
    const resolved = await resolveRoute(client, '/')
    expect(resolved).toMatchObject({ kind: 'page', page: { page: { slug: 'home' } } })
    expect(calls).toEqual(['/pages/home'])
  })

  it('resolves a page by its listed url, with or without a trailing slash', async () => {
    for (const path of ['/issues', '/issues/', '/issues//']) {
      const { client, calls } = api()
      expect(await resolveRoute(client, path)).toMatchObject({ kind: 'page', page: { page: { slug: 'issues' } } })
      expect(calls.sort()).toEqual(['/pages', '/pages/issues', '/types'])
    }
  })

  it('resolves /blog to the built-in types merged, newest first', async () => {
    const { client } = api()
    const resolved = await resolveRoute(client, '/blog')
    expect(resolved).toEqual({ kind: 'index', type: 'blog', entries: [episode, post], next_cursor: null })
  })

  it('resolves a custom type index at its url_base, first page with its cursor', async () => {
    const { client, calls } = api()
    const resolved = await resolveRoute(client, '/endorsements')
    expect(resolved).toEqual({ kind: 'index', type: TYPES[3], entries: [endorsement], next_cursor: 'cursor-endorsement' })
    expect(calls.sort()).toEqual(['/entries/endorsement?limit=50', '/pages', '/types'])
  })

  it('resolves an entry under /blog from whichever built-in type has it', async () => {
    const { client } = api()
    expect(await resolveRoute(client, '/blog/levy-explained')).toMatchObject({ kind: 'entry', type: TYPES[0], entry: { slug: 'levy-explained' } })
    expect(await resolveRoute(client, '/blog/episode-one/')).toMatchObject({ kind: 'entry', type: TYPES[1], entry: { slug: 'episode-one' } })
  })

  it('resolves a custom type entry with one read past the directory', async () => {
    const { client, calls } = api()
    expect(await resolveRoute(client, '/endorsements/sheriff')).toMatchObject({ kind: 'entry', type: TYPES[3], entry: { slug: 'sheriff' } })
    expect(calls.sort()).toEqual(['/entries/endorsement/sheriff', '/pages', '/types'])
  })

  it('resolves an author, alone (the api lists no entries by author)', async () => {
    const { client } = api()
    expect(await resolveRoute(client, '/authors/dana-k')).toEqual({
      kind: 'author',
      author: (CONTENT_API_EXAMPLES.AuthorResponse as { author: unknown }).author,
      entries: [],
    })
    expect(await resolveRoute(client, '/authors/nobody')).toEqual({ kind: 'not_found' })
    expect(await resolveRoute(client, '/authors')).toEqual({ kind: 'not_found' })
  })

  it('resolves a term index, keeping only entries carrying the term in that taxonomy', async () => {
    const { client } = api()
    const resolved = await resolveRoute(client, '/endorsements/tag/taxes')
    expect(resolved).toEqual({
      kind: 'term',
      type: TYPES[3],
      taxonomy: { key: 'tag', label: 'Tags', hierarchical: false },
      term: { id: 'term_1', slug: 'taxes', label: 'Taxes', parent_id: null, position: 0 },
      entries: [endorsement],
    })
    expect(await resolveRoute(client, '/blog/tag/taxes')).toMatchObject({ kind: 'term', type: 'blog', entries: [post] })
  })

  it('answers not_found for an unknown taxonomy or term without listing entries', async () => {
    const { client, calls } = api()
    expect(await resolveRoute(client, '/endorsements/topic/taxes')).toEqual({ kind: 'not_found' })
    expect(await resolveRoute(client, '/endorsements/tag/schools')).toEqual({ kind: 'not_found' })
    expect(calls.filter((c) => c.startsWith('/entries'))).toEqual([])
  })

  it('resolves a type’s feed path with no read past the directory', async () => {
    const { client, calls } = api()
    expect(await resolveRoute(client, '/blog/feed.xml')).toEqual({ kind: 'feed', type: 'blog' })
    expect(await resolveRoute(client, '/endorsements/feed.xml')).toEqual({ kind: 'feed', type: TYPES[3] })
    expect(calls.sort()).toEqual(['/pages', '/types'])
  })

  it('answers not_found for unknown paths, unroutable types and paths too deep', async () => {
    const { client } = api()
    for (const path of ['/nowhere', '/blog/missing', '/note', '/plank', '/podcast', '/endorsements/tag/taxes/more', '/endorsements/missing']) {
      expect(await resolveRoute(client, path), path).toEqual({ kind: 'not_found' })
    }
  })

  it('never throws on a malformed path, and reads nothing for one', async () => {
    const { client, calls } = api()
    for (const path of ['/blog/%E0%A4%A', '/%', '/blog/%2Fetc', '/blog/..', '/blog/%2e%2e', '//evil.example', '/blog//levy-explained', 'blog', '', '/a%00b', '/a%5Cb']) {
      expect(await resolveRoute(client, path), path).toEqual({ kind: 'not_found' })
    }
    expect(calls).toEqual([])
  })

  it('decodes an escaped segment before asking', async () => {
    const { client } = api()
    expect(await resolveRoute(client, '/endorsements/%73heriff')).toMatchObject({ kind: 'entry', entry: { slug: 'sheriff' } })
  })
})
