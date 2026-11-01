import { defineConfig } from 'tsup'

// Four entries, one published package (`cli` is the command the bin runs).
// `@backgold/contract` is the Content API contract vendored from the platform
// (vendor/backgold-contract), a private workspace package: its contract types
// and the few helpers the client uses are BUNDLED here (noExternal for the
// JS, dts.resolve for the declarations), so the published tarball has no
// dependency on it — a test fails if dist imports it. The declaration
// bundler resolves the contract's `./content-api` subpath through tsconfig
// `paths`, not the package's exports map, which it does not read.
export default defineConfig({
  entry: { index: 'src/index.ts', fs: 'src/fs.ts', codegen: 'src/codegen.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  // Only the contract modules are resolved into the declarations; every
  // other package a declaration names stays an import.
  dts: { resolve: ['@backgold/contract/content-api', '@backgold/contract/content-api-examples', '@backgold/contract/api-operations'] },
  noExternal: ['@backgold/contract', /^@backgold\/contract\//],
  target: 'es2022',
  platform: 'neutral',
  // Keep `node:` on the fs and cli entries' imports: Workers (nodejs_compat),
  // Deno and Bun resolve the prefixed form. A neutral build would otherwise
  // try to bundle them, so they are external.
  removeNodeProtocol: false,
  external: [/^node:/],
  // No source maps: a map's sourcesContent would carry every shared module the
  // bundle touches in full, private code included. The output is unminified.
  sourcemap: false,
  clean: true,
  treeshake: true,
})
