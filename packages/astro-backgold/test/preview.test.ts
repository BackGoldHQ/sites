import { CONTENT_API_EXAMPLES } from '@backgold/contract/content-api-examples'
import { describe, expect, it } from 'vitest'
import { PREVIEW_HEADERS, handlePreview, loadPreview } from '../src/server/preview.js'
import { API_ORIGIN, PK, SITE_ID, SK, fakeApi } from './fixtures.js'

const link = (query: string) => new Request(`https://pinevalleyliberty.org/preview?${query}`)

describe('handlePreview', () => {
  it('answers 503 in the Developer page’s words with no secret key', async () => {
    const api = fakeApi()
    const result = await handlePreview(link('bg_preview=tok_good&path=%2F'), { secretKey: undefined, apiOrigin: API_ORIGIN, fetch: api.fetch })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(503)
    expect(await result.response.json()).toEqual({
      error: 'No secret keys yet. A server that renders previews or reads drafts needs one; a browser never does.',
      code: 'PREVIEW_NOT_CONFIGURED',
    })
    expect(result.response.headers.get('Cache-Control')).toContain('no-store')
    expect(api.calls).toHaveLength(0)
  })

  it('answers 503 when BackGold says the key is not a secret key', async () => {
    const result = await handlePreview(link('bg_preview=tok_good'), { secretKey: 'bg_site_sk_revoked_or_odd', apiOrigin: API_ORIGIN, fetch: async () => Response.json({ error: 'Preview needs a secret site key', code: 'SECRET_KEY_REQUIRED' }, { status: 403 }) })
    expect(result.ok ? 200 : result.response.status).toBe(503)
  })

  it('treats a publishable key in BACKGOLD_SECRET_KEY as not configured', async () => {
    const result = await handlePreview(link('bg_preview=tok_good'), { secretKey: PK, apiOrigin: API_ORIGIN, fetch: fakeApi().fetch })
    expect(result.ok ? 200 : result.response.status).toBe(503)
  })

  it('answers 400 BAD_PREVIEW_TOKEN for a bad or missing token', async () => {
    for (const query of ['bg_preview=tok_forged&path=%2F', 'path=%2F']) {
      const result = await handlePreview(link(query), { secretKey: SK, apiOrigin: API_ORIGIN, fetch: fakeApi().fetch })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.response.status).toBe(400)
      expect((await result.response.json()).code).toBe('BAD_PREVIEW_TOKEN')
      expect(result.response.headers.get('X-Robots-Tag')).toContain('noindex')
    }
  })

  it('answers 400 for an empty, `.` or `..` token without asking the api', async () => {
    const api = fakeApi()
    for (const query of ['bg_preview=', 'bg_preview=.', 'bg_preview=..', 'bg_preview=..&path=%2F']) {
      const result = await handlePreview(link(query), { secretKey: SK, apiOrigin: API_ORIGIN, fetch: api.fetch })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.response.status).toBe(400)
      expect((await result.response.json()).code).toBe('BAD_PREVIEW_TOKEN')
      for (const [name, value] of Object.entries(PREVIEW_HEADERS)) expect(result.response.headers.get(name)).toBe(value)
    }
    expect(api.calls).toHaveLength(0)
  })

  it('answers 502 for a network error and 504 for a timeout, with the preview headers and nothing internal', async () => {
    const cases: Array<[typeof fetch, number]> = [
      [async () => Promise.reject(new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.7:443')), 502],
      [async () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), 504],
      [async () => new Response('upstream exploded', { status: 500 }), 502],
    ]
    for (const [fetch, status] of cases) {
      const result = await handlePreview(link('bg_preview=tok_good'), { secretKey: SK, apiOrigin: API_ORIGIN, fetch })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.response.status).toBe(status)
      for (const [name, value] of Object.entries(PREVIEW_HEADERS)) expect(result.response.headers.get(name)).toBe(value)
      const body = await result.response.text()
      expect(JSON.parse(body).code).toBe('PREVIEW_UNAVAILABLE')
      for (const secret of ['ECONNREFUSED', '10.0.0.7', 'exploded', SK, API_ORIGIN]) expect(body).not.toContain(secret)
    }
  })

  it('answers 404 for a token naming a page that is gone', async () => {
    const result = await handlePreview(link('bg_preview=tok_gone'), { secretKey: SK, apiOrigin: API_ORIGIN, fetch: fakeApi().fetch })
    expect(result.ok ? 200 : result.response.status).toBe(404)
  })

  it('returns the draft and its path, read with the secret key from the configured api only', async () => {
    const api = fakeApi()
    const result = await handlePreview(link('bg_preview=tok_good&path=%2Fissues'), { secretKey: SK, apiOrigin: API_ORIGIN, fetch: api.fetch })
    expect(result).toEqual({ ok: true, preview: CONTENT_API_EXAMPLES.PageResponse, path: '/issues' })
    expect(api.calls.map((u) => u.origin)).toEqual([API_ORIGIN])
  })

  it('falls back to / for an unsafe path', async () => {
    const result = await handlePreview(link('bg_preview=tok_good&path=%2F%2Fevil.example'), { secretKey: SK, apiOrigin: API_ORIGIN, fetch: fakeApi().fetch })
    expect(result.ok && result.path).toBe('/')
  })

  it('is never cached: every read goes to the api', async () => {
    const api = fakeApi()
    for (let i = 0; i < 3; i++) {
      await handlePreview(link('bg_preview=tok_good'), { secretKey: SK, apiOrigin: API_ORIGIN, fetch: api.fetch })
    }
    expect(api.calls.filter((u) => u.pathname.endsWith('/preview/tok_good'))).toHaveLength(3)
  })
})

describe('handlePreview in first-party mode', () => {
  it('reads the draft through the binding as the site, with no secret key', async () => {
    const api = fakeApi()
    const result = await handlePreview(link('bg_preview=tok_good&path=%2Fissues'), {
      secretKey: undefined,
      apiOrigin: API_ORIGIN,
      firstParty: { siteId: SITE_ID, fetch: api.fetch },
    })
    expect(result).toEqual({ ok: true, preview: CONTENT_API_EXAMPLES.PageResponse, path: '/issues' })
    expect(api.headers).toHaveLength(1)
    expect(api.headers[0]!.get('X-BackGold-Site')).toBe(SITE_ID)
    expect(api.headers[0]!.has('Authorization')).toBe(false)
  })

  it('takes precedence over a secret key and the public fetch', async () => {
    const binding = fakeApi()
    const pub = fakeApi()
    const result = await handlePreview(link('bg_preview=tok_good'), { secretKey: SK, apiOrigin: API_ORIGIN, fetch: pub.fetch, firstParty: { siteId: SITE_ID, fetch: binding.fetch } })
    expect(result.ok).toBe(true)
    expect(pub.calls).toHaveLength(0)
    expect(binding.headers[0]!.has('Authorization')).toBe(false)
  })

  it('never answers the key-mode 503: an api refusal is a 502', async () => {
    // The fake api refuses a first-party read for a site it does not know as SECRET_KEY_REQUIRED.
    const result = await handlePreview(link('bg_preview=tok_good'), { secretKey: undefined, apiOrigin: API_ORIGIN, firstParty: { siteId: 'site_unknown', fetch: fakeApi().fetch } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(502)
    expect((await result.response.json()).code).toBe('PREVIEW_UNAVAILABLE')
    for (const [name, value] of Object.entries(PREVIEW_HEADERS)) expect(result.response.headers.get(name)).toBe(value)
  })

  it('answers the same errors', async () => {
    const result = await handlePreview(link('bg_preview=tok_forged'), { secretKey: undefined, apiOrigin: API_ORIGIN, firstParty: { siteId: SITE_ID, fetch: fakeApi().fetch } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    for (const [name, value] of Object.entries(PREVIEW_HEADERS)) expect(result.response.headers.get(name)).toBe(value)
  })
})

describe('loadPreview', () => {
  it('reads the Worker’s own environment: none here, so 503 in the Developer page’s words', async () => {
    const result = await loadPreview(link('bg_preview=tok_good&path=%2F'))
    expect(result.ok ? 200 : result.response.status).toBe(503)
    if (result.ok) return
    expect((await result.response.json()).code).toBe('PREVIEW_NOT_CONFIGURED')
  })
})
