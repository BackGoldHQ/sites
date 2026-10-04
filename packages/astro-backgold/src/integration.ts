import type { AstroIntegration } from 'astro'
import { DEV_BUILD_ID, mintBuildId, resolveOptions, type BackgoldOptions, type RuntimeBackgoldOptions } from './options.js'

const PACKAGE = '@backgold/astro'
/** How the options and the build id reach the middleware and the injected routes at runtime. */
const OPTIONS_MODULE = 'virtual:backgold/options'
const RESOLVED_OPTIONS_MODULE = `\0${OPTIONS_MODULE}`

/** Files beside this module once built (dist/). */
const route = (file: string) => new URL(file, import.meta.url)

/**
 * The BackGold integration: the middleware (setup check, `bg_vid`, redirects,
 * edge cache) and the routes — webhook, revalidate, and the text routes each
 * option can turn off. `/preview` is the site's own page (`loadPreview`).
 */
export function backgold(options: BackgoldOptions = {}): AstroIntegration {
  const resolved = resolveOptions(options)
  return {
    name: PACKAGE,
    hooks: {
      'astro:config:setup': ({ command, injectRoute, addMiddleware, updateConfig }) => {
        const runtime: RuntimeBackgoldOptions = { ...resolved, buildId: command === 'build' ? mintBuildId() : DEV_BUILD_ID }
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'backgold:options',
                resolveId: (id: string) => (id === OPTIONS_MODULE ? RESOLVED_OPTIONS_MODULE : undefined),
                load: (id: string) => (id === RESOLVED_OPTIONS_MODULE ? `export default ${JSON.stringify(runtime)}` : undefined),
              },
            ],
            // Processed as source, never pre-bundled: the middleware and the routes
            // import the virtual module, and one copy of the module-scope client per isolate.
            optimizeDeps: { exclude: [PACKAGE] },
            ssr: { noExternal: [PACKAGE] },
          },
        })
        addMiddleware({ entrypoint: route('./middleware.js'), order: 'pre' })

        injectRoute({ pattern: '/api/backgold/webhook', entrypoint: route('./routes/webhook.js'), prerender: false })
        injectRoute({ pattern: '/api/backgold/revalidate', entrypoint: route('./routes/revalidate.js'), prerender: false })
        if (resolved.sitemap) injectRoute({ pattern: '/sitemap.xml', entrypoint: route('./routes/sitemap.js'), prerender: false })
        if (resolved.robots) injectRoute({ pattern: '/robots.txt', entrypoint: route('./routes/robots.js'), prerender: false })
        if (resolved.llms) {
          injectRoute({ pattern: '/llms.txt', entrypoint: route('./routes/llms.js'), prerender: false })
          injectRoute({ pattern: '/llms-full.txt', entrypoint: route('./routes/llms-full.js'), prerender: false })
        }
        if (resolved.feeds) injectRoute({ pattern: '/feed.xml', entrypoint: route('./routes/feed.js'), prerender: false })
      },
      'astro:config:done': ({ injectTypes }) => {
        injectTypes({ filename: 'types.d.ts', content: `/// <reference types="${PACKAGE}" />\n` })
      },
    },
  }
}
