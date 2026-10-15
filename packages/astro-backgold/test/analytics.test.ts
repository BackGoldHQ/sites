import { CONTENT_API_EXAMPLES } from '@backgold/contract/content-api-examples'
import { describe, expect, it } from 'vitest'
import { analyticsOf } from '../src/server/analytics.js'
import { backgoldFor } from '../src/server/context.js'
import { API_ORIGIN, PK, fakeContext } from './fixtures.js'

const block = {
  provider: 'posthog',
  key: 'phc_testProjectToken0001',
  ingest: 'https://api.backgold.com/ingest',
  group: { organization: 'org_7f3' },
  site_domain_id: 'cd_8f2a',
  environment: 'production',
}

describe('analyticsOf', () => {
  it('takes a well-formed block off the /site answer', () => {
    expect(analyticsOf({ analytics: block })).toEqual(block)
    expect(analyticsOf({ analytics: { ...block, ingest: 'http://localhost:8787/ingest' } })?.ingest).toBe('http://localhost:8787/ingest')
  })

  it('is undefined when the block is absent or malformed', () => {
    expect(analyticsOf(CONTENT_API_EXAMPLES.SiteResponse)).toBeUndefined()
    expect(analyticsOf(null)).toBeUndefined()
    for (const bad of [
      { ...block, provider: 'other' },
      { ...block, key: 'phc_x"</script>' },
      { ...block, ingest: 'http://api.backgold.com/ingest' },
      { ...block, ingest: 'javascript:alert(1)' },
      { ...block, group: {} },
      { ...block, site_domain_id: 7 },
      { ...block, environment: '' },
    ]) {
      expect(analyticsOf({ analytics: bad }), JSON.stringify(bad)).toBeUndefined()
    }
  })
})

describe('locals.backgold.analytics', () => {
  const siteApi = (body: unknown) =>
    (async () => Response.json(body, { headers: { 'X-Content-Version': '184', ETag: '"v184"' } })) as unknown as typeof fetch

  it('carries the block from the /site answer, and is absent without it', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = siteApi({ ...(CONTENT_API_EXAMPLES.SiteResponse as object), analytics: block })
      const on = await backgoldFor({ BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: `${API_ORIGIN}/on` }, fakeContext('/'))
      expect(on.setup === null && on.analytics).toEqual(block)

      globalThis.fetch = siteApi(CONTENT_API_EXAMPLES.SiteResponse)
      const off = await backgoldFor({ BACKGOLD_SITE_KEY: PK, BACKGOLD_API_ORIGIN: `${API_ORIGIN}/off` }, fakeContext('/'))
      expect(off.setup === null && 'analytics' in off).toBe(false)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
