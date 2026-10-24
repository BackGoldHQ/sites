import { defineConfig } from 'tsup'

// `cli` is what the bin runs; `collect` and `bundle` are the build-output
// reader and the zip on their own, for scripts/cli-e2e.mjs. fflate stays a
// dependency, not bundled.
export default defineConfig({
  entry: { cli: 'src/cli.ts', collect: 'src/collect.ts', bundle: 'src/bundle.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: false,
  clean: true,
  treeshake: true,
})
