import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { CONTENT_API_EXAMPLES } from '@backgold/contract/content-api-examples'
import type { AreaItem, Areas, PageResponse, Section as SectionData } from '@backgold/content'
import { beforeAll, describe, expect, it } from 'vitest'
import Area from '../components/Area.astro'
import Section from '../components/Section.astro'
import HeroBold from './components/HeroBold.astro'
import HeroOverride from './components/HeroOverride.astro'
import TwoAreas from './components/TwoAreas.astro'

let container: AstroContainer
beforeAll(async () => {
  container = await AstroContainer.create()
})

const page = CONTENT_API_EXAMPLES.PageResponse as PageResponse
const hero = page.sections[0]!
const donate = page.sections[1]!

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

describe('Section markers', () => {
  const previewUrl = 'https://pinevalleyliberty.org/preview?bg_preview=tok_good&path=%2F'

  it('puts an empty marker before the section on the preview page only', async () => {
    const preview = await render(Section, { props: { section: donate }, request: new Request(previewUrl) })
    expect(preview).toMatch(/^<span id="bg-section-Donate-1" data-bg-section hidden><\/span><section/)
    for (const url of ['https://pinevalleyliberty.org/', 'https://pinevalleyliberty.org/previews', 'https://pinevalleyliberty.org/issues?bg_preview=x']) {
      const html = await render(Section, { props: { section: donate }, request: new Request(url) })
      expect(html, url).not.toContain('data-bg-section')
      expect(html, url).not.toContain('bg-section-Donate-1')
    }
    expect(await render(Section, { props: { section: donate } })).not.toContain('data-bg-section')
  })

  it('marks a site component’s section too, under /preview/ as well', async () => {
    const html = await render(Section, { props: { section: hero, components: { Hero: HeroOverride } }, request: new Request('https://pinevalleyliberty.org/preview/x') })
    expect(html).toMatch(/^<span id="bg-section-Hero-1" data-bg-section hidden><\/span><div data-override="hero"/)
  })

  it('writes the id with every character outside [A-Za-z0-9_-] as -', async () => {
    const html = await render(Section, { props: { section: section({ id: 'a b"<x>/é.1_Z-' }) }, request: new Request(previewUrl) })
    expect(html).toContain('<span id="bg-section-a-b--x----1_Z-" data-bg-section hidden></span>')
  })
})

describe('Section variants', () => {
  it('tries the explicit variant, then the stored layout, then the type', async () => {
    // hero's stored variant is `split`.
    const all = { Hero: HeroOverride, 'Hero:bold': HeroBold, 'Hero:split': HeroBold }
    expect(await render(Section, { props: { section: hero, components: all, variant: 'bold' } })).toContain('data-override="hero-bold" data-variant="bold"')
    expect(await render(Section, { props: { section: hero, components: all } })).toContain('data-override="hero-bold" data-variant="split"')
    expect(await render(Section, { props: { section: hero, components: { Hero: HeroOverride } } })).toContain('data-override="hero" data-variant="split"')
    expect(await render(Section, { props: { section: hero, components: { Hero: HeroOverride, 'Hero:split': HeroBold }, variant: 'quiet' } })).toContain(
      'data-override="hero" data-variant="quiet"',
    )
    expect(await render(Section, { props: { section: hero, components: {} } })).toContain('data-type="Hero"')
  })

  it('passes no variant when there is none', async () => {
    const html = await render(Section, { props: { section: { ...hero, variant: null }, components: { Hero: HeroOverride, 'Hero:split': HeroBold } } })
    expect(html).toContain('data-override="hero"')
    expect(html).not.toContain('data-variant')
  })
})

describe('Area', () => {
  const areas = page.areas as Areas
  const banner = areas.top_banner![0]!
  const item = (over: Partial<AreaItem>): AreaItem => ({ ...banner, from: null, until: null, ...over })
  const PAST = '2001-01-01T00:00:00.000Z'
  const FUTURE = '2999-01-01T00:00:00.000Z'

  it('renders nothing for an empty or unknown area', async () => {
    for (const name of ['sidebar', 'nowhere', 'constructor']) expect((await render(Area, { props: { name, areas } })).trim(), name).toBe('')
    expect((await render(Area, { props: { name: 'top_banner', areas: undefined } })).trim()).toBe('')
  })

  it('shows an undated item as it is, labelled, with no script', async () => {
    const html = await render(Area, { props: { name: 'top_banner', areas: { top_banner: [item({})] }, class: 'rail' } })
    expect(html).toMatch(/<aside class="bg-area bg-area-top_banner rail" data-bg-area="top_banner" data-bg-area-item="levy-vote-countdown" aria-label="Levy vote countdown"[^>]*>/)
    expect(html).not.toMatch(/<aside[^>]*\shidden/)
    expect(html).not.toMatch(/data-from|data-until/)
    expect(scripts(html)).toBe(0)
  })

  it('hides a dated item, its moments on the aside, and adds the script', async () => {
    const html = await render(Area, { props: { name: 'top_banner', areas: { top_banner: [item({ from: PAST, until: FUTURE })] } } })
    expect(html).toMatch(new RegExp(`<aside [^>]*data-from="${PAST}" data-until="${FUTURE}" hidden[ >]`))
    expect(scripts(html)).toBe(1)
    expect(html).toContain("querySelectorAll('[data-bg-area-item][data-from], [data-bg-area-item][data-until]')")
  })

  it('keeps an item whose from is ahead and drops one whose until has passed', async () => {
    const html = await render(Area, {
      props: { name: 'top_banner', areas: { top_banner: [item({ key: 'soon', from: FUTURE }), item({ key: 'gone', until: PAST }), item({ key: 'bad', until: 'not a date' })] } },
    })
    expect(html).toMatch(/<aside [^>]*data-bg-area-item="soon"[^>]*hidden/)
    expect(html).not.toContain('data-bg-area-item="gone"')
    expect(html).toContain('data-bg-area-item="bad"')
  })

  it('treats a malformed moment as unset: not hidden, no script', async () => {
    const html = await render(Area, { props: { name: 'top_banner', areas: { top_banner: [item({ from: 'soon' })] } } })
    expect(html).toContain('data-bg-area-item="levy-vote-countdown"')
    expect(html).not.toMatch(/<aside[^>]*\shidden/)
    expect(scripts(html)).toBe(0)
  })

  it('writes the script once for two dated areas on one page', async () => {
    const html = await render(TwoAreas, { props: { areas: { top_banner: [item({ until: FUTURE })], above_footer: [item({ key: 'later', from: FUTURE })] } } })
    expect(html.match(/<aside/g)).toHaveLength(2)
    expect(scripts(html)).toBe(1)
  })

  it('renders the sections through the components it is given, else DefaultSection with the headline as heading', async () => {
    const withOverride = await render(Area, { props: { name: 'top_banner', areas: { top_banner: [item({})] }, components: { TakeoverBanner: HeroOverride } } })
    expect(withOverride).toContain('<div data-override="hero">Vote no on the levy Nov 3</div>')
    const plain = await render(Area, { props: { name: 'top_banner', areas: { top_banner: [item({})] } } })
    expect(plain).toMatch(/<h2[^>]*>Vote no on the levy Nov 3<\/h2>/)
    expect(plain).toMatch(/<p data-copy="pitch"[^>]*>Polls open at 7\. Find yours in a minute\.<\/p>/)
  })

  it('keeps the label and the moments inside their quoted attributes, and out of the script', async () => {
    const label = '"><script>alert(1)</script>'
    const html = await render(Area, { props: { name: 'top_banner', areas: { top_banner: [item({ label, from: PAST, until: '"><img onerror=x>' })] } } })
    // Astro escapes `&` and `"` in an attribute value, so nothing can close the quotes.
    expect(html).toContain('aria-label="&quot;><script>alert(1)</script>"')
    expect(html).toContain('data-until="&quot;><img onerror=x>"')
    const script = html.slice(html.lastIndexOf('<script>'))
    expect(script).toContain('querySelectorAll')
    expect(script).not.toContain('alert')
    expect(script).not.toContain('onerror')
  })
})
