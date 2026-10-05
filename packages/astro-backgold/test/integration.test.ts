import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AstroIntegration } from 'astro'
import { describe, expect, it, vi } from 'vitest'
import { backgold } from '../src/integration.js'

type Setup = NonNullable<AstroIntegration['hooks']['astro:config:setup']>
type Plugin = { resolveId: (id: string) => string | undefined; load: (id: string) => string | undefined }

function run(integration: AstroIntegration, command: 'dev' | 'build' = 'dev') {
  const injectRoute = vi.fn()
  const addMiddleware = vi.fn()
  const updateConfig = vi.fn()
  const setup = integration.hooks['astro:config:setup'] as Setup
  void setup({ command, injectRoute, addMiddleware, updateConfig } as unknown as Parameters<Setup>[0])
  const patterns = injectRoute.mock.calls.map(([route]) => (route as { pattern: string }).pattern)
  const plugin = (updateConfig.mock.calls[0]![0] as { vite: { plugins: Plugin[] } }).vite.plugins[0]!
  const options = JSON.parse(plugin.load(plugin.resolveId('virtual:backgold/options')!)!.replace(/^export default /, ''))
  return { injectRoute, addMiddleware, patterns, options }
}

describe('backgold()', () => {
  it('injects every route but /preview (the site’s own page), and the middleware first', () => {
    const { injectRoute, addMiddleware, patterns } = run(backgold())
    expect(patterns).toEqual([
      '/api/backgold/webhook',
      '/api/backgold/revalidate',
      '/sitemap.xml',
      '/robots.txt',
      '/llms.txt',
      '/llms-full.txt',
      '/feed.xml',
    ])
    for (const [route] of injectRoute.mock.calls) expect(route).toMatchObject({ prerender: false })
    expect(addMiddleware).toHaveBeenCalledWith({ entrypoint: expect.any(URL), order: 'pre' })
  })

  it('turns each text route off by its option', () => {
    const { patterns } = run(backgold({ sitemap: false, robots: false, llms: false, feeds: false }))
    expect(patterns).toEqual(['/api/backgold/webhook', '/api/backgold/revalidate'])
  })

  it('serves the resolved options to the routes through the virtual module', () => {
    expect(run(backgold()).options).toEqual({
      sitemap: true,
      robots: true,
      llms: true,
      feeds: true,
      aiCrawlers: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'],
      buildId: 'dev',
    })
    expect(run(backgold({ aiCrawlers: [], sitemap: false })).options).toMatchObject({ aiCrawlers: [], sitemap: false })
  })

  it('mints a URL-safe build id for each astro build, and nothing machine-specific', () => {
    const first = run(backgold(), 'build').options.buildId as string
    const second = run(backgold(), 'build').options.buildId as string
    expect(first).toMatch(/^[0-9a-f]{12}$/)
    expect(second).toMatch(/^[0-9a-f]{12}$/)
    expect(first).not.toBe(second)
    expect(encodeURIComponent(first)).toBe(first)
  })

  it('refuses a crawler name that would add a robots.txt directive', () => {
    expect(() => backgold({ aiCrawlers: ['GPTBot\nDisallow: /'] })).toThrow(TypeError)
    expect(() => backgold({ aiCrawlers: ['Bad Bot'] })).toThrow(TypeError)
  })

  it('injects the Astro.locals.backgold types', () => {
    const injectTypes = vi.fn()
    const done = backgold().hooks['astro:config:done'] as (o: unknown) => void
    done({ injectTypes, config: { build: { server: new URL('file:///site/dist/server/') } } })
    expect(injectTypes).toHaveBeenCalledWith({ filename: 'types.d.ts', content: '/// <reference types="@backgold/astro" />\n' })
  })

  it('after a build, gives the Worker config’s previews block the site key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'backgold-astro-'))
    const file = join(dir, 'wrangler.json')
    writeFileSync(file, JSON.stringify({ name: 'site', vars: { BACKGOLD_SITE_KEY: 'bg_site_pk_abc' }, previews: {} }))
    const integration = backgold()
    const done = integration.hooks['astro:config:done'] as (o: unknown) => void
    done({ injectTypes: vi.fn(), config: { build: { server: pathToFileURL(`${dir}/`) } } })
    await (integration.hooks['astro:build:done'] as () => Promise<void>)()
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      name: 'site',
      vars: { BACKGOLD_SITE_KEY: 'bg_site_pk_abc' },
      previews: { vars: { BACKGOLD_SITE_KEY: 'bg_site_pk_abc' } },
    })
  })
})
