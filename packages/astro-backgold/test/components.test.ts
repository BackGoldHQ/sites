import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { CONTENT_API_EXAMPLES } from '@backgold/contract/content-api-examples'
import type { MenuResponse, PageResponse, Section as SectionData, SectionEmbed } from '@backgold/content'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import Analytics from '../components/Analytics.astro'
import DefaultSection from '../components/DefaultSection.astro'
import Disclaimer from '../components/Disclaimer.astro'
import Embed from '../components/Embed.astro'
import Menu from '../components/Menu.astro'
import PreviewBar from '../components/PreviewBar.astro'
import Section from '../components/Section.astro'
import type { BackgoldLocals } from '../src/server/context.js'
import HeroBold from './components/HeroBold.astro'
import HeroOverride from './components/HeroOverride.astro'
import TwoEmbeds from './components/TwoEmbeds.astro'

let container: AstroContainer
beforeAll(async () => {
  container = await AstroContainer.create()
})

const page = CONTENT_API_EXAMPLES.PageResponse as PageResponse
const hero = page.sections[0]!
const donate = page.sections[1]!
const donateEmbed = donate.embed!

const section = (over: Partial<SectionData>): SectionData => ({
  id: 'S-1',
  type: 'Mystery',
  band: 'plain',
  bleed: 'full',
  variant: null,
  copy: {},
  media: {},
  links: [],
  ...over,
})

/** The markup without Astro's dev-only source attributes. */
const render = async (...args: Parameters<AstroContainer['renderToString']>) =>
  (await container.renderToString(...args)).replace(/ data-astro-source-(file|loc)="[^"]*"/g, '')

const scripts = (html: string) => html.match(/<script\b/g)?.length ?? 0

describe('Section', () => {
  it('renders the site’s component for the type', async () => {
    const html = await render(Section, { props: { section: hero, components: { Hero: HeroOverride } } })
    expect(html).toContain('data-override="hero"')
    expect(html).not.toContain('bg-section')
  })

  it('falls back to DefaultSection for a type the site has no component for', async () => {
    const html = await render(Section, { props: { section: donate, components: { Hero: HeroOverride } } })
    expect(html).toContain('data-type="Donate"')
    expect(html).toContain('<iframe')
  })

  it('tries <type>:<variant> first and passes the variant on', async () => {
    const components = { Hero: HeroOverride, 'Hero:bold': HeroBold }
    expect(await render(Section, { props: { section: hero, components, variant: 'bold' } })).toContain('data-override="hero-bold" data-variant="bold"')
    expect(await render(Section, { props: { section: hero, components, variant: 'quiet' } })).toContain('data-override="hero" data-variant="quiet"')
    expect(await render(Section, { props: { section: hero, components } })).toContain('data-override="hero"')
  })

  it('never takes a component from the object’s prototype', async () => {
    const html = await render(Section, { props: { section: section({ type: 'constructor' }), components: {} } })
    expect(html).toContain('data-type="constructor"')
  })
})

describe('DefaultSection', () => {
  it('marks the section by type, band and bleed', async () => {
    const html = await render(DefaultSection, { props: { section: hero } })
    expect(html).toMatch(/<section class="bg-section bg-band-contrast bg-bleed-full" data-type="Hero" data-band="contrast" data-bleed="full"/)
    expect(html).toMatch(/<h2[^>]*>Keep more of what you earn\.<\/h2>/)
    expect(html).not.toContain('data-copy="headline"')
    expect(html).toContain('Keep more of what you earn.')
    expect(html).toMatch(/<img src="https:\/\/api\.backgold\.com\/api\/lp-assets\/a1\/hero\.webp" alt loading="lazy"/)
    expect(html).toMatch(/<a href="\/get-involved"[^>]*>Get involved<\/a>/)
  })

  it('uses heading, then title, as an h2 and never emits an h1', async () => {
    expect(await render(DefaultSection, { props: { section: section({ copy: { heading: 'H', title: 'T' } }) } })).toMatch(/<h2[^>]*>H<\/h2>.*<p data-copy="title"[^>]*>T<\/p>/s)
    expect(await render(DefaultSection, { props: { section: section({ copy: { title: 'T' } }) } })).toMatch(/<h2[^>]*>T<\/h2>/)
    const html = await render(DefaultSection, { props: { section: section({ copy: { heading: '<h1>Big</h1>', body: '<p>a</p><h1>x</h1>' } }) } })
    expect(html).not.toMatch(/<h1/)
  })

  it('escapes plain copy and sanitizes rich copy', async () => {
    const html = await render(DefaultSection, {
      props: {
        section: section({
          copy: {
            heading: '<img src=x onerror=alert(1)>',
            lead: '<script>alert(1)</script>\n\nsecond paragraph',
            body: '<p>Rich <strong>bold</strong> <a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)></p>',
          },
        }),
      },
    })
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(html).toMatch(/<p data-copy="lead"[^>]*>second paragraph<\/p>/)
    expect(html).toMatch(/<div class="bg-copy" data-copy="body"[^>]*><p>Rich <strong>bold<\/strong> bad<\/p><\/div>/)
    expect(html).not.toMatch(/<script|<img[^>]*onerror|href="javascript:/i)
  })

  it('renders media by kind and refuses unsafe addresses', async () => {
    const html = await render(DefaultSection, {
      props: {
        section: section({
          media: {
            photoUrl: { url: '/api/media-files/m1', alt: 'The candidate' },
            pdfUrl: { url: 'https://example.org/platform.pdf' },
            videoUrl: { url: 'https://www.youtube.com/watch?v=abc' },
            imageUrl: { url: 'javascript:alert(1)' },
            other: { url: 'data:image/png;base64,AAAA' },
          },
        }),
      },
    })
    expect(html).toMatch(/<img src="\/api\/media-files\/m1" alt="The candidate" loading="lazy" data-media="photoUrl"/)
    expect(html).toMatch(/<a href="https:\/\/example\.org\/platform\.pdf"[^>]*>Open the PDF<\/a>/)
    expect(html).toMatch(/<a href="https:\/\/www\.youtube\.com\/watch\?v=abc"[^>]*>Watch the video<\/a>/)
    expect(html).not.toMatch(/javascript:|data:image/)
  })

  it('marks absolute links noopener and opens nothing in a new tab', async () => {
    const html = await render(DefaultSection, {
      props: {
        section: section({
          links: [
            { label: 'Chapter', target: { kind: 'external', url: 'https://chapter.example.org' }, url: 'https://chapter.example.org' },
            { label: 'Volunteer', target: { kind: 'section', anchor: 'volunteer' }, url: '#volunteer' },
            { label: 'Bad', target: { kind: 'external', url: 'javascript:alert(1)' }, url: 'javascript:alert(1)' },
          ],
        }),
      },
    })
    expect(html).toMatch(/<a href="https:\/\/chapter\.example\.org" rel="noopener"[^>]*>Chapter<\/a>/)
    expect(html).toMatch(/<a href="#volunteer" data-astro-cid-[a-z0-9]+>Volunteer<\/a>/)
    expect(html).not.toContain('Bad')
    expect(html).not.toContain('target=')
  })

  it('lists data rows without knowing the source', async () => {
    const html = await render(DefaultSection, {
      props: {
        section: section({
          type: 'EventsList',
          data: {
            source: 'events',
            items: [
              { id: 'evt_2k9', title: 'Town hall', starts_at: '2026-10-08T19:00:00-05:00', location: 'Library', url: 'https://example.backgold.com/events/town-hall' },
              { name: 'A volunteer', role: 'Treasurer', image_url: '/api/media-files/m2', link_url: 'javascript:alert(1)' },
              { label: 'Members', value: '1,200' },
              { nothing: 'to show' },
              'A plain row',
            ],
          },
        }),
      },
    })
    expect(html).toContain('data-source="events"')
    expect(html).toMatch(/<a href="https:\/\/example\.backgold\.com\/events\/town-hall" rel="noopener"[^>]*>Town hall<\/a>/)
    expect(html).toMatch(/<time datetime="2026-10-08T19:00:00-05:00"[^>]*>October 8, 2026<\/time>/)
    expect(html).toMatch(/<strong[^>]*>A volunteer<\/strong>/)
    expect(html).toMatch(/<img src="\/api\/media-files\/m2" alt=""/)
    expect(html).toMatch(/<strong[^>]*>Members<\/strong><p[^>]*>1,200<\/p>/)
    expect(html).toContain('A plain row')
    expect(html.match(/<li/g)).toHaveLength(4)
    expect(html).not.toContain('javascript:')
  })

  it('renders an embed through Embed, titled by the heading', async () => {
    const html = await render(DefaultSection, { props: { section: donate } })
    expect(html).toMatch(/<iframe data-bg-embed class="bg-embed" src="https:\/\/secure\.backgold\.com\/embed\/d\/df_general" title="Fund the fight for lower taxes" loading="lazy" allow="payment"/)
  })
})

describe('Embed', () => {
  it('renders the frame lazily, titled, unsandboxed, with one sizing script', async () => {
    const html = await render(Embed, { props: { embed: donateEmbed } })
    expect(html).toMatch(/<iframe data-bg-embed class="bg-embed" src="https:\/\/secure\.backgold\.com\/embed\/d\/df_general" title="Embedded form" loading="lazy" allow="payment"/)
    expect(html).not.toContain('sandbox')
    expect(html).not.toContain('referrerpolicy')
    expect(html).not.toContain('embed.js')
    expect(scripts(html)).toBe(1)
    expect(html).toContain("data.type !== 'givegold:resize'")
    expect(html).toContain('event.source !== frame.contentWindow')
    expect(html).toContain('event.origin !== origin')
  })

  it('renders one sizing script for two embeds on a page', async () => {
    const html = await render(TwoEmbeds, { props: { embeds: [donateEmbed, { ...donateEmbed, iframe: 'https://secure.backgold.com/embed/p/org/petition' }] } })
    expect(html.match(/<iframe/g)).toHaveLength(2)
    expect(scripts(html)).toBe(1)
  })

  it('refuses a frame that is not https', async () => {
    for (const iframe of ['http://secure.backgold.com/embed/d/df_general', 'javascript:alert(1)', '//secure.backgold.com/embed/d/x', '/embed/d/x']) {
      const html = await render(Embed, { props: { embed: { ...donateEmbed, iframe } } })
      expect(html.trim(), iframe).not.toMatch(/<iframe|<script/)
    }
  })

  it('allows a local http api', async () => {
    const html = await render(Embed, { props: { embed: { ...donateEmbed, iframe: 'http://localhost:8787/f/lp_1/FormBlock-1' } } })
    expect(html).toContain('src="http://localhost:8787/f/lp_1/FormBlock-1"')
  })

  it('mounts a script-only module and loads its script once per page', async () => {
    const advocacy: SectionEmbed = {
      iframe: null,
      script: 'https://api.backgold.com/api/advocacy-pages/embed.js',
      mount: { 'data-bg-advocacy': '', 'data-org': 'pine-valley', 'data-set': 'call-your-rep', onclick: 'alert(1)', 'data-x"': 'y' },
    }
    const html = await render(TwoEmbeds, { props: { embeds: [advocacy, advocacy] } })
    expect(html.match(/<div class="bg-embed-mount" data-bg-advocacy data-org="pine-valley" data-set="call-your-rep"/g)).toHaveLength(2)
    expect(html.match(/<script src="https:\/\/api\.backgold\.com\/api\/advocacy-pages\/embed\.js" async><\/script>/g)).toHaveLength(1)
    expect(scripts(html)).toBe(1)
    expect(html).not.toContain('onclick')
  })

  it('refuses a script-only module whose script is not https', async () => {
    const html = await render(Embed, { props: { embed: { iframe: null, script: 'http://evil.example/x.js', mount: { 'data-org': 'o' } } } })
    expect(html.trim()).toBe('')
  })
})

describe('Menu', () => {
  const menu = CONTENT_API_EXAMPLES.MenuResponse as MenuResponse

  it('nests groups, marks the current page and leaves tabs alone', async () => {
    const html = await render(Menu, { props: { items: menu.items, label: 'Primary' }, request: new Request('https://pinevalleyliberty.org/issues/') })
    expect(html).toMatch(/<nav aria-label="Primary"/)
    expect(html).toMatch(/<a href="\/issues" aria-current="page">Issues<\/a>/)
    expect(html).toMatch(/<span>Get involved<\/span><ul><li><a href="\/#volunteer">Volunteer<\/a><\/li><li><a href="https:\/\/chapter\.example\.org" rel="noopener">Our chapter<\/a><\/li><\/ul>/)
    expect(html).not.toContain('target=')
    expect(html.match(/aria-current/g)).toHaveLength(1)
  })

  it('marks nothing on another page and keeps the label of an unsafe item', async () => {
    const items = [{ ...menu.items[0]!, label: 'Bad', url: 'javascript:alert(1)' }]
    const html = await render(Menu, { props: { items, label: 'Footer' }, request: new Request('https://pinevalleyliberty.org/') })
    expect(html).toMatch(/<span>Bad<\/span>/)
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('aria-current')
  })
})

describe('Disclaimer', () => {
  it('renders the line verbatim, as text', async () => {
    const html = await render(Disclaimer, { props: { legal: { disclaimer: 'Paid for by <b>Pine Valley</b> & friends', required: true } } })
    expect(html).toBe('<p data-backgold-disclaimer>Paid for by &lt;b&gt;Pine Valley&lt;/b&gt; &amp; friends</p>')
  })

  it('renders nothing when there is none, and warns once naming the site', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const html = await render(Disclaimer, { props: { legal: { disclaimer: null, required: true } }, locals: { backgold: { site: { id: 'cd_8f2a' } } as never } })
      expect(html.trim()).toBe('')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]![0]).toBe(
        '@backgold/astro: site cd_8f2a has no disclaimer set in BackGold, so this page shows no "Paid for by" line. Set one for the organization in BackGold.',
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('does not warn when the line is there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      await render(Disclaimer, { props: { legal: { disclaimer: 'Paid for by Pine Valley', required: true } } })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('PreviewBar', () => {
  it('says the page is a draft', async () => {
    expect(await render(PreviewBar)).toMatch(/<div data-backgold-preview-bar role="status" class="bg-preview-bar"[^>]*>Draft · not published<\/div>/)
  })
})

describe('Analytics', () => {
  const site = CONTENT_API_EXAMPLES.SiteResponse as { site: never; legal: never }
  const ready = (analytics?: unknown): BackgoldLocals =>
    ({ client: {}, site: site.site, legal: site.legal, version: 184, siteUrl: 'https://pinevalleyliberty.org', variant: '', visitorId: 'v-0123456789abcdef', setup: null, ...(analytics ? { analytics } : {}) }) as unknown as BackgoldLocals
  const block = {
    provider: 'posthog' as const,
    key: 'phc_testProjectToken0001',
    ingest: 'https://api.backgold.com/ingest',
    group: { organization: 'org_7f3' },
    site_domain_id: 'cd_8f2a',
    environment: 'production',
  }

  it('renders nothing without the block', async () => {
    expect((await render(Analytics, { locals: { backgold: ready() } })).trim()).toBe('')
    expect((await render(Analytics, { locals: { backgold: { ...ready(), setup: { missing: ['BACKGOLD_SITE_KEY'] } } as never } })).trim()).toBe('')
  })

  it('renders nothing on the preview page, block or not', async () => {
    for (const url of ['https://pinevalleyliberty.org/preview?bg_preview=tok_1&path=/', 'https://pinevalleyliberty.org/preview/x']) {
      const html = await render(Analytics, { locals: { backgold: ready(block) }, request: new Request(url) })
      expect(html.trim()).toBe('')
    }
  })

  it('carries the settings in one JSON attribute and nothing else', async () => {
    const html = await render(Analytics, { locals: { backgold: ready(block) } })
    const payload = /data-backgold-analytics="([^"]*)"/.exec(html)?.[1]
    expect(payload).toBeDefined()
    const settings = JSON.parse(payload!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    expect(settings).toEqual({
      key: 'phc_testProjectToken0001',
      ingest: 'https://api.backgold.com/ingest',
      organization: 'org_7f3',
      site_domain_id: 'cd_8f2a',
      environment: 'production',
      cookie: 'bg_vid',
    })
    expect(html.split('phc_testProjectToken0001')).toHaveLength(2)
    expect(html).not.toContain('v-0123456789abcdef')
    expect(html).not.toMatch(/<script[^>]*>[^<]*phc_/)
  })
})
