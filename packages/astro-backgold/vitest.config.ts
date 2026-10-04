/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { getViteConfig } from 'astro/config'
import { resolveOptions } from './src/options.js'

// Astro's Vite config compiles the shipped `.astro` components for the
// container API tests. The options module is the integration's defaults (build id `test`), and
// the components' import of the built dist/render.js is the source here, so
// those tests need no build.
const OPTIONS_MODULE = 'virtual:backgold/options'

export default getViteConfig(
  {
    plugins: [
      {
        name: 'backgold:options',
        resolveId: (id: string) => (id === OPTIONS_MODULE ? `\0${OPTIONS_MODULE}` : undefined),
        load: (id: string) => (id === `\0${OPTIONS_MODULE}` ? `export default ${JSON.stringify({ ...resolveOptions(), buildId: 'test' })}` : undefined),
      },
    ],
    resolve: {
      alias: [{ find: /^\.\.\/dist\/render\.js$/, replacement: fileURLToPath(new URL('./src/server/render.ts', import.meta.url)) }],
    },
    test: {
      include: ['test/**/*.test.ts'],
      environment: 'node',
    },
  },
  { logLevel: 'error' },
)
