import { defineConfig } from 'tsup'

// Three entries, one published package. `@givegold/shared` is a private
// workspace package: its contract types and the few helpers the client uses
// are BUNDLED here (noExternal + dts.resolve), so the published tarball has
// no dependency on it — a test fails if dist/*.d.ts mentions it.
export default defineConfig({
  entry: { index: 'src/index.ts', fs: 'src/fs.ts', codegen: 'src/codegen.ts' },
  format: ['esm'],
  dts: { resolve: ['@givegold/shared', '@givegold/shared/content-api'] },
  noExternal: ['@givegold/shared', '@givegold/shared/content-api'],
  target: 'es2022',
  platform: 'neutral',
  sourcemap: true,
  clean: true,
  treeshake: true,
})
