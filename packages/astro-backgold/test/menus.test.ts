import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { CONTENT_API_EXAMPLES } from '@backgold/contract/content-api-examples'
import type { MenuItem, MenuResponse, MenuShowsOn } from '@backgold/content'
import { beforeAll, describe, expect, it } from 'vitest'
import Menu from '../components/Menu.astro'
import MenuButton from '../components/MenuButton.astro'
import { headerButtonOf, menuOf, type MenuNode, type MenuPage } from '../src/server/render.js'

let container: AstroContainer
beforeAll(async () => {
  container = await AstroContainer.create()
})

const render = async (...args: Parameters<AstroContainer['renderToString']>) =>
  (await container.renderToString(...args)).replace(/ data-astro-source-(file|loc)="[^"]*"/g, '')

const menu = CONTENT_API_EXAMPLES.MenuResponse as MenuResponse
const at = (path: string) => new Request(`https://pinevalleyliberty.org${path}`)

const HOME: MenuPage = { id: 'lp_home', takes_donations: true }
const ISSUES: MenuPage = { id: 'lp_issues', takes_donations: false }

const link = (label: string, shows_on: MenuShowsOn, over: Partial<MenuItem> = {}): MenuItem => ({
  id: `nav_${label}`,
  label,
  kind: 'page',
  target: { kind: 'page', page_id: 'lp_x', slug: label },
  url: `/${label}`,
  external: false,
  header_button: false,
  shows_on,
  children: [],
  ...over,
})
const group = (label: string, children: MenuItem[]): MenuItem => ({
  ...link(label, { rule: 'every_page' }),
  kind: 'group',
  target: { kind: 'group' },
  url: null,
  children,
})

const labels = (nodes: MenuNode[]): unknown[] => nodes.map((n) => (n.children.length > 0 ? [n.label, labels(n.children)] : n.label))

describe('menuOf', () => {
  const only = link('only', { rule: 'only_pages', pages: [{ id: 'lp_issues', url: '/issues' }] })
  const except = link('except', { rule: 'except_pages', pages: [{ id: 'lp_issues', url: '/issues' }] })
  const donations = link('donations', { rule: 'donation_pages' })
  const every = link('every', { rule: 'every_page' })
  const items = [every, only, except, donations]

  it('applies each rule on a page it names and one it does not', () => {
    expect(labels(menuOf(items, '/issues', ISSUES))).toEqual(['every', 'only'])
    expect(labels(menuOf(items, '/', HOME))).toEqual(['every', 'except', 'donations'])
  })

  it('on a route with no page: only_pages and donation_pages hide, every_page and except_pages show', () => {
    expect(labels(menuOf(items, '/blog', null))).toEqual(['every', 'except'])
  })

  it('applies no rule without a page (the 0.1 behaviour)', () => {
    expect(labels(menuOf(items, '/'))).toEqual(['every', 'only', 'except', 'donations'])
  })

  it('keeps a group with the children that show, and drops one whose children all hide', () => {
    const nav = [group('mixed', [only, every]), group('pages', [only, donations]), group('empty', [])]
    expect(labels(menuOf(nav, '/', HOME))).toEqual([['mixed', ['every']], ['pages', ['donations']]])
    expect(labels(menuOf(nav, '/issues', ISSUES))).toEqual([['mixed', ['only', 'every']], ['pages', ['only']]])
    expect(labels(menuOf(nav, '/blog', null))).toEqual([['mixed', ['every']]])
    expect(labels(menuOf(nav, '/'))).toEqual([['mixed', ['only', 'every']], ['pages', ['only', 'donations']], 'empty'])
  })

  it('leaves the header button out of the links whenever a page is given', () => {
    const button = link('give', { rule: 'every_page' }, { header_button: true, kind: 'donate' })
    expect(labels(menuOf([every, button], '/', HOME))).toEqual(['every'])
    expect(labels(menuOf([every, button], '/', null))).toEqual(['every'])
    expect(labels(menuOf([every, button], '/'))).toEqual(['every', 'give'])
  })

  it('carries each item’s kind', () => {
    expect(menuOf(menu.items, '/').map((n) => n.kind)).toEqual(['page', 'group', 'donate'])
  })

  it('reads the example menu the way the api means it', () => {
    expect(labels(menuOf(menu.items, '/', HOME))).toEqual([['Get involved', ['Our chapter']]])
    expect(labels(menuOf(menu.items, '/issues', ISSUES))).toEqual(['Issues', ['Get involved', ['Volunteer', 'Our chapter']]])
    expect(labels(menuOf(menu.items, '/blog', null))).toEqual([['Get involved', ['Volunteer', 'Our chapter']]])
  })
})

describe('headerButtonOf', () => {
  it('answers Donate on a donation page, nothing on a plain page or an index', () => {
    expect(headerButtonOf(menu.items, '/', HOME)).toMatchObject({ label: 'Donate', kind: 'donate', href: 'https://pine-valley.backgold.com/donate', rel: 'noopener' })
    expect(headerButtonOf(menu.items, '/issues', ISSUES)).toBeNull()
    expect(headerButtonOf(menu.items, '/blog', null)).toBeNull()
  })

  it('answers the button on every page without a page', () => {
    expect(headerButtonOf(menu.items, '/issues')?.label).toBe('Donate')
  })

  it('answers null with no button, a button with no address or an unsafe one', () => {
    const plain = menu.items.filter((i) => !i.header_button)
    expect(headerButtonOf(plain, '/', HOME)).toBeNull()
    const donate = menu.items.find((i) => i.header_button)!
    expect(headerButtonOf([{ ...donate, url: null }], '/', HOME)).toBeNull()
    expect(headerButtonOf([{ ...donate, url: 'javascript:alert(1)' }], '/', HOME)).toBeNull()
  })
})

describe('Menu with a page', () => {
  it('applies the Shows on rules and leaves the header button to MenuButton', async () => {
    const home = await render(Menu, { props: { items: menu.items, label: 'Primary', page: HOME }, request: at('/') })
    expect(home).not.toContain('Issues')
    expect(home).not.toContain('Volunteer')
    expect(home).toMatch(/<span>Get involved<\/span><ul><li><a href="https:\/\/chapter\.example\.org" rel="noopener">Our chapter<\/a><\/li><\/ul>/)
    expect(home).not.toContain('Donate')

    const issues = await render(Menu, { props: { items: menu.items, label: 'Primary', page: ISSUES }, request: at('/issues') })
    expect(issues).toMatch(/<a href="\/issues" aria-current="page">Issues<\/a>/)
    expect(issues).toContain('Volunteer')
    expect(issues).not.toContain('Donate')
  })

  it('draws every link without a page, the header button among them', async () => {
    const html = await render(Menu, { props: { items: menu.items, label: 'Primary' }, request: at('/') })
    for (const label of ['Issues', 'Volunteer', 'Our chapter', 'Donate']) expect(html).toContain(label)
  })
})

describe('MenuButton', () => {
  it('draws Donate on a page that takes donations, with data-bg-donate', async () => {
    const html = await render(MenuButton, { props: { items: menu.items, page: HOME, class: 'btn' }, request: at('/') })
    expect(html).toBe('<a class="bg-menu-button btn" href="https://pine-valley.backgold.com/donate" rel="noopener" data-bg-button data-bg-donate>Donate</a>')
  })

  it('draws nothing on a page that does not take donations, or on a route with no page', async () => {
    for (const page of [ISSUES, null]) {
      expect((await render(MenuButton, { props: { items: menu.items, page }, request: at('/issues') })).trim()).toBe('')
    }
  })

  it('draws the button without a page, and nothing when the menu has none', async () => {
    expect(await render(MenuButton, { props: { items: menu.items }, request: at('/') })).toContain('data-bg-button')
    expect((await render(MenuButton, { props: { items: menu.items.filter((i) => !i.header_button) }, request: at('/') })).trim()).toBe('')
  })

  it('marks the button as the current page on the page it links to, and only there', async () => {
    const items = [link('x', { rule: 'every_page' }, { label: 'Join', url: '/join', header_button: true })]
    expect(await render(MenuButton, { props: { items, page: null }, request: at('/join/') })).toBe('<a class="bg-menu-button" href="/join" aria-current="page" data-bg-button>Join</a>')
    expect(await render(MenuButton, { props: { items, page: null }, request: at('/joint') })).not.toContain('aria-current')
  })

  it('carries no data-bg-donate on another kind, and escapes the label', async () => {
    const items = [link('x', { rule: 'every_page' }, { label: '<b>Join</b>', url: '/join', header_button: true })]
    expect(await render(MenuButton, { props: { items, page: null }, request: at('/') })).toBe('<a class="bg-menu-button" href="/join" data-bg-button>&lt;b&gt;Join&lt;/b&gt;</a>')
  })
})
