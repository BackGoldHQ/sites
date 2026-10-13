// loadPreview on a template's shared Worker: the Worker's `env` (from
// `cloudflare:workers`) has the BACKGOLD_API binding and no BACKGOLD_SITE_ID,
// and the request's X-BackGold-Site names the site. The env object is one
// mutable value the mock hands out, so each test sets its own names on it.

import { CONTENT_API_EXAMPLES } from '@givegold/shared/content-api-examples'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PREVIEW_HEADERS, loadPreview } from '../src/server/preview.js'
import { API_ORIGIN, OTHER_SITE_ID, SITE_ID, fakeApi, type FakeApi } from './fixtures.js'

const worker = vi.hoisted(() => ({ env: {} as Record<string, unknown> }))
vi.mock('cloudflare:workers', () => worker)

let api: FakeApi

beforeEach(() => {
  api = fakeApi()
  for (const name of Object.keys(worker.env)) delete worker.env[name]
  Object.assign(worker.env, { BACKGOLD_API: { fetch: api.fetch }, BACKGOLD_API_ORIGIN: API_ORIGIN })
})

const asSite = (siteId: string, query: string) =>
  new Request(`https://pinevalleyliberty.org/preview?${query}`, { headers: { 'X-BackGold-Site': siteId } })

describe('loadPreview in the dispatched form', () => {
  it('reads the draft through the binding as the site the request names', async () => {
    for (const siteId of [SITE_ID, OTHER_SITE_ID]) {
      const result = await loadPreview(asSite(siteId, 'bg_preview=tok_good&path=%2Fissues'))
      expect(result).toEqual({ ok: true, preview: CONTENT_API_EXAMPLES.PageResponse, path: '/issues' })
      expect(api.headers.at(-1)!.get('X-BackGold-Site')).toBe(siteId)
      expect(api.headers.at(-1)!.has('Authorization')).toBe(false)
    }
  })

  it('needs no secret key: there is none here, and the draft renders', async () => {
    expect(worker.env.BACKGOLD_SECRET_KEY).toBeUndefined()
    const result = await loadPreview(asSite(SITE_ID, 'bg_preview=tok_good&path=%2F'))
    expect(result.ok).toBe(true)
  })

  it('answers a request naming no site with No site and the preview headers, never the 503', async () => {
    for (const request of [new Request('https://pinevalleyliberty.org/preview?bg_preview=tok_good'), asSite('not a site!', 'bg_preview=tok_good')]) {
      const result = await loadPreview(request)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.response.status).toBe(404)
      expect(await result.response.text()).toBe('No site.')
      for (const [name, value] of Object.entries(PREVIEW_HEADERS)) expect(result.response.headers.get(name)).toBe(value)
    }
    expect(api.calls).toHaveLength(0)
  })

  it('keeps the 400 for a bad or expired token', async () => {
    const result = await loadPreview(asSite(SITE_ID, 'bg_preview=tok_forged'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    expect((await result.response.json()).code).toBe('BAD_PREVIEW_TOKEN')
    for (const [name, value] of Object.entries(PREVIEW_HEADERS)) expect(result.response.headers.get(name)).toBe(value)
  })

  it('lets BACKGOLD_SITE_ID win over the header', async () => {
    worker.env.BACKGOLD_SITE_ID = SITE_ID
    const result = await loadPreview(asSite(OTHER_SITE_ID, 'bg_preview=tok_good'))
    expect(result.ok).toBe(true)
    expect(api.headers.map((h) => h.get('X-BackGold-Site'))).toEqual([SITE_ID])
  })
})
