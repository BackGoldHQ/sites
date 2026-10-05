import { defineConfig } from 'tsup'

// One ESM build with shared chunks, so the module-scope client is one module
// whichever entry (middleware, an injected route, `/server`) loads it first.
// The injected routes are entries of their own: the integration points
// Astro at them by file URL; the shipped components import `render`.
// `@backgold/content`, `astro` and the other dependencies stay imports;
// `cloudflare:workers` and the options module exist only at runtime.
// `node:` stays on the integration's one Node import (it runs in `astro build`).
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    middleware: 'src/middleware.ts',
    render: 'src/server/render.ts',
    'routes/webhook': 'src/routes/webhook.ts',
    'routes/revalidate': 'src/routes/revalidate.ts',
    'routes/sitemap': 'src/routes/sitemap.ts',
    'routes/robots': 'src/routes/robots.ts',
    'routes/llms': 'src/routes/llms.ts',
    'routes/llms-full': 'src/routes/llms-full.ts',
    'routes/feed': 'src/routes/feed.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts', server: 'src/server.ts', middleware: 'src/middleware.ts' } },
  external: ['astro', /^astro\//, '@backgold/content', 'cloudflare:workers', 'virtual:backgold/options', 'node:fs/promises'],
  removeNodeProtocol: false,
  target: 'es2022',
  platform: 'neutral',
  splitting: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
})
