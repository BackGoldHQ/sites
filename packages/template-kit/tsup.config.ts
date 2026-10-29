import { defineConfig } from 'tsup'

// The kit ships as source (src/), compiled by each template's Vite, except
// the contract slice: src/contract/*.ts re-export what the kit and the
// templates use of `@backgold/contract`, the Content API contract vendored
// from the platform (vendor/backgold-contract), a private workspace package.
// It is BUNDLED here (noExternal for the JS, dts.resolve for the
// declarations), the way @backgold/content bundles its slice, so the
// published tarball has no dependency on it; zod, which the manifest schema
// is written in, stays an import (a dependency of the kit). The declaration
// bundler resolves the contract's subpaths through tsconfig.build.json's
// `paths`, not the package's exports map, which it does not read.
export default defineConfig({
  entry: {
    'contract/content-api': 'src/contract/content-api.ts',
    'contract/content-api-examples': 'src/contract/content-api-examples.ts',
    'contract/site-templates': 'src/contract/site-templates.ts',
  },
  format: ['esm'],
  tsconfig: 'tsconfig.build.json',
  dts: { resolve: ['@backgold/contract/content-api', '@backgold/contract/content-api-examples', '@backgold/contract/site-templates'] },
  noExternal: ['@backgold/contract', /^@backgold\/contract\//],
  external: ['zod'],
  target: 'es2022',
  platform: 'neutral',
  // No source maps: a map's sourcesContent would carry every contract module
  // the bundle touches in full. The output is unminified.
  sourcemap: false,
  clean: true,
  treeshake: true,
})
