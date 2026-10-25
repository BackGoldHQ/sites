import { defineConfig } from 'tsup'

// `cli` is what the bin runs; `collect` and `bundle` are the build-output
// reader and the zip on their own, for scripts/cli-e2e.mjs. fflate stays a
// dependency, not bundled. The template manifest schema `deploy` checks
// template.json with comes from `@backgold/contract`, the Content API
// contract vendored from the platform (vendor/backgold-contract), a private
// workspace package: it and zod, which the schema is written in, are BUNDLED
// (noExternal), so the published tarball depends on neither.
export default defineConfig({
  entry: { cli: 'src/cli.ts', collect: 'src/collect.ts', bundle: 'src/bundle.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  noExternal: ['@backgold/contract', /^@backgold\/contract\//, 'zod', /^zod\//],
  sourcemap: false,
  clean: true,
  treeshake: true,
})
