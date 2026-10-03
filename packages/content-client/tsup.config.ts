import { defineConfig } from 'tsup'

// Four entries, one published package (`cli` is the command the bin runs).
// `@givegold/shared` is a private workspace package: its contract types and
// the few helpers the client uses are BUNDLED here (noExternal for the JS,
// dts.resolve for the declarations), so the published tarball has no
// dependency on it — a test fails if dist imports it. The declaration
// bundler resolves shared's `./content-api` subpath through tsconfig
// `paths`, not the package's exports map, which it does not read.
export default defineConfig({
  entry: { index: 'src/index.ts', fs: 'src/fs.ts', codegen: 'src/codegen.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  // Only the contract module is resolved into the declarations; resolving
  // everything would drag zod's source in through shared's main index.
  dts: { resolve: ['@givegold/shared/content-api', '@givegold/shared/content-api-examples'] },
  noExternal: ['@givegold/shared', '@givegold/shared/content-api'],
  target: 'es2022',
  platform: 'neutral',
  sourcemap: true,
  clean: true,
  treeshake: true,
})
