import { defineConfig } from 'vitest/config'

// The archive's pure modules (src/lib/archive): the query grammar, the
// records, the index build and the search, run under Node.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
