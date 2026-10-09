import { createClient, memoryCache } from '@backgold/content'
import type { Areas, ContentTypeSummary, EntriesResponse, Entry, EntryResponse } from '@backgold/content'
import { encodeEntryCursor } from '@givegold/shared/content-api'
import { CONTENT_API_EXAMPLES } from '@givegold/shared/content-api-examples'
import { describe, expect, it } from 'vitest'
import { pagerOf } from '../src/server/render.js'
import { resolveRoute, type Resolved } from '../src/server/resolve.js'
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

// As GET /types reports them: post, podcast and video at `blog`, the newsletter at its own base.
const TYPES = [
  type('post', { built_in: true, url_base: 'blog' }),
  type('podcast', { built_in: true, url_base: 'blog' }),
  type('plank', { built_in: true, routable: false, url_base: null }),
  type('endorsement', { url_base: 'endorsements' }),
  type('note', { routable: false, url_base: null }),
  type('video', { built_in: true, url_base: 'blog' }),
  type('newsletter', { built_in: true, url_base: 'newsletters' }),
]
const NEWSLETTER = TYPES[6]!

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
/** Cursors as the api writes them: the second page of endorsements, its third, and one the api refuses. */
const PAGE_2 = encodeEntryCursor({ publish_at: '2026-09-01T00:00:00.000Z', id: 'ci_e1' })
const PAGE_3 = encodeEntryCursor({ publish_at: '2026-08-01T00:00:00.000Z', id: 'ci_e3' })
const REFUSED = encodeEntryCursor({ publish_at: '2026-07-01T00:00:00.000Z', id: 'ci_refused' })
const older = entry({ id: 'ci_e3', slug: 'clerk', type: 'endorsement', title: 'The clerk', url: '/endorsements/clerk', terms: [{ taxonomy: 'tag', slug: 'taxes', label: 'Taxes' }] })
const clip = entry({ id: 'ci_v1', slug: 'clip-one', type: 'video', title: 'Clip one', publish_at: '2026-09-28T12:00:00.000Z', terms: [] })
const issue = entry({
  id: 'ci_n1',
  slug: 'october',
  type: 'newsletter',
  title: 'October',
  url: '/newsletters/october',
  publish_at: '2026-10-01T12:00:00.000Z',
  terms: [{ taxonomy: 'tag', slug: 'taxes', label: 'Taxes' }],
})
const elsewhere = entry({ id: 'ci_e2', slug: 'mayor', type: 'endorsement', url: '/endorsements/mayor', terms: [{ taxonomy: 'category', slug: 'taxes', label: 'Taxes' }] })
/** Areas that name where they came from, so a test can tell which response's areas a route carries. */
const areasFrom = (from: string): Areas => ({ sidebar: [{ key: from, label: from, from: null, until: null, sections: [] }], top_banner: [] })
const detail = (e: Entry): EntryResponse => ({ entry: { ...e, body: { markdown: '' }, fields: {} }, areas: areasFrom(`entry:${e.slug}`) })

function api() {
  const calls: string[] = []
  const routes: Record<string, unknown> = {
    '/site': CONTENT_API_EXAMPLES.SiteResponse,
    '/pages': { pages: [...(CONTENT_API_EXAMPLES.PagesResponse as { pages: unknown[] }).pages, { id: 'lp_issues', slug: 'issues', title: 'Issues', url: '/issues', is_home: false, published_at: null, updated_at: '2026-10-01T00:00:00.000Z' }] },
    '/pages/home': CONTENT_API_EXAMPLES.PageResponse,
    '/pages/issues': { ...(CONTENT_API_EXAMPLES.PageResponse as object), page: { ...(CONTENT_API_EXAMPLES.PageResponse as { page: object }).page, slug: 'issues', url: '/issues', is_home: false } },
    '/types': { types: TYPES },
    '/entries/post?limit=50': { entries: [post], next_cursor: 'cursor-post', areas: areasFrom('list:post') },
    '/entries/podcast?limit=50': { entries: [episode], next_cursor: null, areas: areasFrom('list:podcast') },
    '/entries/video?limit=50': { entries: [clip], next_cursor: null, areas: areasFrom('list:video') },
    '/entries/video?limit=50&term=taxes': { entries: [], next_cursor: null, areas: areasFrom('list:video') },
    '/entries/video/clip-one': detail(clip),
    '/entries/newsletter?limit=50': { entries: [issue], next_cursor: PAGE_2, areas: areasFrom('list:newsletter') },
    [`/entries/newsletter?cursor=${PAGE_2}&limit=50`]: { entries: [], next_cursor: null, areas: areasFrom('list:newsletter') },
    '/entries/newsletter?limit=50&term=taxes': { entries: [issue], next_cursor: null, areas: areasFrom('list:newsletter') },
    '/entries/newsletter/october': detail(issue),
    '/entries/endorsement?limit=50': { entries: [endorsement], next_cursor: 'cursor-endorsement', areas: areasFrom('list:endorsement') },
    [`/entries/endorsement?cursor=${PAGE_2}&limit=50`]: { entries: [older], next_cursor: PAGE_3, areas: areasFrom('list:endorsement') },
    [`/entries/endorsement?cursor=${PAGE_2}&limit=50&term=taxes`]: { entries: [older], next_cursor: null, areas: areasFrom('list:endorsement') },
    '/entries/endorsement?limit=50&term=taxes': { entries: [endorsement, elsewhere], next_cursor: null, areas: areasFrom('list:endorsement') },
    '/entries/post?limit=50&term=taxes': { entries: [post], next_cursor: null, areas: areasFrom('list:post') },
    '/entries/podcast?limit=50&term=taxes': { entries: [], next_cursor: null, areas: areasFrom('list:podcast') },
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
    if (url.searchParams.get('cursor') === REFUSED) return Response.json({ error: 'cursor is not one this API returned', code: 'BAD_CURSOR' }, { status: 400, headers })
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
    expect(resolved).toEqual({ kind: 'index', type: 'blog', entries: [episode, post, clip], cursor: null, next_cursor: null, areas: areasFrom('list:post') })
  })

  it('keeps podcast and video merged under /blog: they report `blog`, so /podcast and /videos are nothing', async () => {
    const { client, calls } = api()
    expect(await resolveRoute(client, '/blog/clip-one')).toMatchObject({ kind: 'entry', type: TYPES[5], entry: { slug: 'clip-one' } })
    expect(await resolveRoute(client, '/blog/feed.xml')).toEqual({ kind: 'feed', type: 'blog' })
    for (const path of ['/podcast', '/videos', '/podcast/episode-one', '/videos/feed.xml']) expect(await resolveRoute(client, path), path).toEqual({ kind: 'not_found' })
    expect(calls.filter((c) => c.startsWith('/entries/newsletter'))).toEqual([])
  })

  it('leaves the newsletter, which reports a base of its own, out of /blog', async () => {
    const { client, calls } = api()
    const blog = await resolveRoute(client, '/blog')
    expect(blog).toMatchObject({ kind: 'index', type: 'blog' })
    expect((blog as { entries: Entry[] }).entries).not.toContainEqual(issue)
    expect(await resolveRoute(client, '/blog/october')).toEqual({ kind: 'not_found' })
    expect(calls.filter((c) => c.startsWith('/entries/newsletter'))).toEqual([])
  })

  it('resolves the newsletter at /newsletters: its list, paged, its entries, its terms and its feed', async () => {
    const { client } = api()
    expect(await resolveRoute(client, '/newsletters')).toEqual({
      kind: 'index',
      type: NEWSLETTER,
      entries: [issue],
      cursor: null,
      next_cursor: PAGE_2,
      areas: areasFrom('list:newsletter'),
    })
    expect(await resolveRoute(client, `/newsletters?cursor=${PAGE_2}`)).toMatchObject({ kind: 'index', type: NEWSLETTER, entries: [], cursor: PAGE_2, next_cursor: null })
    expect(await resolveRoute(client, '/newsletters/october')).toMatchObject({ kind: 'entry', type: NEWSLETTER, entry: { slug: 'october' }, areas: areasFrom('entry:october') })
    expect(await resolveRoute(client, '/newsletters/tag/taxes')).toMatchObject({ kind: 'term', type: NEWSLETTER, entries: [issue], cursor: null, next_cursor: null })
    expect(await resolveRoute(client, '/newsletters/feed.xml')).toEqual({ kind: 'feed', type: NEWSLETTER })
  })

  it('resolves a custom type index at its url_base, first page with its cursor', async () => {
    const { client, calls } = api()
    const resolved = await resolveRoute(client, '/endorsements')
    expect(resolved).toEqual({ kind: 'index', type: TYPES[3], entries: [endorsement], cursor: null, next_cursor: 'cursor-endorsement', areas: areasFrom('list:endorsement') })
    expect(calls.sort()).toEqual(['/entries/endorsement?limit=50', '/pages', '/types'])
  })

  it('resolves an entry under /blog from whichever built-in type has it', async () => {
    const { client } = api()
    expect(await resolveRoute(client, '/blog/levy-explained')).toMatchObject({ kind: 'entry', type: TYPES[0], entry: { slug: 'levy-explained' } })
    expect(await resolveRoute(client, '/blog/episode-one/')).toMatchObject({ kind: 'entry', type: TYPES[1], entry: { slug: 'episode-one' } })
  })

  it('carries the entry response’s areas on an entry', async () => {
    const { client } = api()
    expect(await resolveRoute(client, '/blog/episode-one')).toMatchObject({ kind: 'entry', areas: areasFrom('entry:episode-one') })
    expect(await resolveRoute(client, '/endorsements/sheriff')).toMatchObject({ kind: 'entry', areas: areasFrom('entry:sheriff') })
  })

  it('carries no areas on an author', async () => {
    const { client } = api()
    expect(await resolveRoute(client, '/authors/dana-k')).not.toHaveProperty('areas')
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
      cursor: null,
      next_cursor: null,
      areas: areasFrom('list:endorsement'),
    })
    expect(await resolveRoute(client, '/blog/tag/taxes')).toMatchObject({ kind: 'term', type: 'blog', entries: [post], areas: areasFrom('list:post') })
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

describe('resolveRoute, a page of a list', () => {
  it('reads one type’s list at the ?cursor= it is asked for, from a path with its query or the URL', async () => {
    for (const location of [`/endorsements?cursor=${PAGE_2}`, new URL(`https://pinevalleyliberty.org/endorsements?utm_source=x&cursor=${PAGE_2}`)]) {
      const { client, calls } = api()
      expect(await resolveRoute(client, location)).toEqual({
        kind: 'index',
        type: TYPES[3],
        entries: [older],
        cursor: PAGE_2,
        next_cursor: PAGE_3,
        areas: areasFrom('list:endorsement'),
      })
      expect(calls.filter((c) => c.startsWith('/entries'))).toEqual([`/entries/endorsement?cursor=${PAGE_2}&limit=50`])
    }
  })

  it('reads a term at its cursor, still keeping only the term’s entries', async () => {
    const { client } = api()
    expect(await resolveRoute(client, `/endorsements/tag/taxes?cursor=${PAGE_2}`)).toMatchObject({
      kind: 'term',
      entries: [older],
      cursor: PAGE_2,
      next_cursor: null,
    })
  })

  it('reads the first page for a cursor the api would not accept, never asking with it', async () => {
    const junk = ['garbage!', 'x'.repeat(600), btoa('no-bar').replace(/=+$/, ''), btoa('not a date|ci_1').replace(/=+$/, ''), '']
    for (const cursor of junk) {
      const { client, calls } = api()
      expect(await resolveRoute(client, `/endorsements?cursor=${encodeURIComponent(cursor)}`), cursor).toMatchObject({
        kind: 'index',
        entries: [endorsement],
        cursor: null,
        next_cursor: 'cursor-endorsement',
      })
      expect(calls.filter((c) => c.includes('cursor='))).toEqual([])
    }
  })

  it('reads the first page when the api refuses the cursor', async () => {
    const { client } = api()
    expect(await resolveRoute(client, `/endorsements?cursor=${REFUSED}`)).toMatchObject({ kind: 'index', entries: [endorsement], cursor: null, next_cursor: 'cursor-endorsement' })
  })

  it('reads no cursor on /blog when more than one built-in type is merged there', async () => {
    const { client, calls } = api()
    expect(await resolveRoute(client, `/blog?cursor=${PAGE_2}`)).toMatchObject({ kind: 'index', type: 'blog', entries: [episode, post, clip], cursor: null, next_cursor: null })
    expect(calls.filter((c) => c.includes('cursor='))).toEqual([])
  })
})

describe('pagerOf', () => {
  const index = (cursor: string | null, next_cursor: string | null): Resolved => ({ kind: 'index', type: TYPES[3]!, entries: [], cursor, next_cursor, areas: {} })

  it('links the first page on to the next, and has no way back', () => {
    expect(pagerOf(index(null, PAGE_2), '/endorsements')).toEqual({ newest: null, older: `/endorsements?cursor=${PAGE_2}` })
  })

  it('links a later page back to the first and on to the next', () => {
    expect(pagerOf(index(PAGE_2, PAGE_3), '/endorsements')).toEqual({ newest: '/endorsements', older: `/endorsements?cursor=${PAGE_3}` })
    expect(pagerOf(index(PAGE_3, null), `/endorsements?cursor=${PAGE_3}`)).toEqual({ newest: '/endorsements', older: null })
  })

  it('draws a term’s pager on the term’s path', async () => {
    const { client } = api()
    const resolved = await resolveRoute(client, `/endorsements/tag/taxes?cursor=${PAGE_2}`)
    expect(pagerOf(resolved, '/endorsements/tag/taxes')).toEqual({ newest: '/endorsements/tag/taxes', older: null })
  })

  it('has no links for a list with one page, or for anything that is not a list', () => {
    expect(pagerOf(index(null, null), '/endorsements')).toEqual({ newest: null, older: null })
    expect(pagerOf({ kind: 'not_found' }, '/nowhere')).toEqual({ newest: null, older: null })
    expect(pagerOf({ kind: 'feed', type: 'blog' }, '/blog/feed.xml')).toEqual({ newest: null, older: null })
  })
})
