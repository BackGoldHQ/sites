import { existsSync } from 'node:fs'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { CONTENT_API_EXAMPLES } from '@givegold/shared/content-api-examples'
import type { SiteResponse } from '@backgold/content'
import { describe, expect, it } from 'vitest'
import type { BackgoldLocals } from '../src/server/context.js'
import { SITE_URL } from './seo-api.js'

// <Seo> imports the built server entry, as the shipped component does.
// Skips (and says so) until `pnpm build` has run; CI builds first.
const BUILT = existsSync(new URL('../dist/server.js', import.meta.url))
const site = (CONTENT_API_EXAMPLES.SiteResponse as SiteResponse).site

const ready = (): BackgoldLocals =>
  ({ client: null, site, legal: { disclaimer: null, required: true }, version: 1, siteUrl: SITE_URL, variant: '', visitorId: null, setup: null }) as unknown as BackgoldLocals

async function render(props: Record<string, unknown>, backgold: BackgoldLocals = ready(), url?: string): Promise<string> {
  const { default: Seo } = await import('../components/Seo.astro')
  const container = await AstroContainer.create()
  return container.renderToString(Seo, { props, locals: { backgold }, ...(url ? { request: new Request(url) } : {}) })
}

describe.skipIf(!BUILT)('<Seo> (container API; needs `pnpm build`)', () => {
  it('canonicalizes on SITE_URL without the query and falls back to /site', async () => {
    const html = await render({ canonicalPath: '/issues?utm_source=x#top' })
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/issues">`)
    expect(html).toContain(`<meta property="og:url" content="${SITE_URL}/issues">`)
    expect(html).toContain('<title>Pine Valley for Liberty</title>')
    expect(html).toContain('<meta name="description" content="Lower taxes, open books, school choice.">')
    expect(html).toContain('<meta property="og:site_name" content="Pine Valley for Liberty">')
    expect(html).toContain('<meta property="og:type" content="website">')
    expect(html).toContain(`<link rel="alternate" type="application/atom+xml" title="Pine Valley for Liberty" href="${SITE_URL}/feed.xml">`)
    expect(html).toContain('<link rel="icon" href="https://api.backgold.com/api/media-files/med_logo">')
    expect(html).not.toContain('name="robots"')
  })

  it('has no og:image and a summary card without an image, and drops an unsafe one', async () => {
    for (const image of [undefined, 'javascript:alert(1)', 'data:image/png;base64,AAAA']) {
      const html = await render({ canonicalPath: '/', image })
      expect(html).not.toContain('og:image')
      expect(html).toContain('<meta name="twitter:card" content="summary">')
    }
  })

  it('makes a site-relative image absolute and uses the large card', async () => {
    const html = await render({ canonicalPath: '/', image: '/img/hero.webp', title: 'Issues', noindex: true })
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/img/hero.webp">`)
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(html).toContain('<meta name="robots" content="noindex">')
    expect(html).toContain('<title>Issues</title>')
  })

  it('writes JSON-LD that cannot close its script element', async () => {
    const html = await render({ canonicalPath: '/', jsonLd: [{ '@type': 'BlogPosting', headline: '</script><script>alert(1)</script>' }] })
    expect(html).toContain('<script type="application/ld+json">{"@type":"BlogPosting","headline":"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"}</script>')
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain('<meta property="og:type" content="article">')
  })

  it('tells the BackGold editor about the section markers on the preview page only', async () => {
    const meta = '<meta name="backgold-preview" content="sections">'
    expect(await render({ canonicalPath: '/' }, ready(), `${SITE_URL}/preview?bg_preview=tok_good&path=%2F`)).toContain(meta)
    expect(await render({ canonicalPath: '/' }, ready(), `${SITE_URL}/preview/x`)).toContain(meta)
    for (const url of [`${SITE_URL}/`, `${SITE_URL}/previews`, `${SITE_URL}/issues?bg_preview=tok_good`]) {
      expect(await render({ canonicalPath: '/' }, ready(), url), url).not.toContain('backgold-preview')
    }
    expect(await render({ canonicalPath: '/' })).not.toContain('backgold-preview')
  })

  it('renders the canonical alone while the site is in setup', async () => {
    const setup = { client: null, site: null, legal: null, version: null, siteUrl: SITE_URL, variant: '', visitorId: null, setup: { missing: ['BACKGOLD_SITE_KEY'] } } as BackgoldLocals
    const html = await render({ canonicalPath: '/' }, setup)
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/">`)
    expect(html).not.toContain('<title>')
    expect(html).not.toContain('atom+xml')
  })
})
