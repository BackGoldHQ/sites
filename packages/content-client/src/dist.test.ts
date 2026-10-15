import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { readFile, readdir, stat } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

// The published build (`pnpm build`) must stand alone: the vendored contract
// package (@backgold/contract, private to this workspace) and its runtime
// dependencies are bundled or absent, never imported, and only the Node-only
// entries may import node: modules. @givegold/shared, the platform package the
// contract is cut from, may not be imported either. Doc comments may name
// either package (the contract's do); an import or export of it may not. The guard reads dist/, so it skips (and says so) until a build exists;
// CI and prepublishOnly build first.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const BUILT = existsSync(`${DIST}index.js`)
const FORBIDDEN = ['@backgold/contract', '@givegold/shared', 'zod', 'markdown-it']
/** fs.js is the filesystem store; cli.js is the `backgold-content` command. */
const NODE_ONLY = new Set(['fs.js', 'cli.js'])
const INDEX_BUDGET_BYTES = 25 * 1024

/** Every module specifier a file imports or re-exports: `from '…'`, `import '…'`, `import('…')`, `require('…')`. */
function specifiers(text: string): string[] {
  const found: string[] = []
  const re = /(?:\bfrom|\bimport|\bimport\s*\(|\brequire\s*\()\s*(['"])([^'"\n]+)\1/g
  for (const match of text.matchAll(re)) found.push(match[2]!)
  return found
}

describe('dist', { skip: BUILT ? false : 'no dist/ — run `pnpm build` first' }, () => {
  it('imports no private package, no zod, no markdown-it, and node: only in the Node entries', async () => {
    const files = (await readdir(DIST)).filter((name) => name.endsWith('.js') || name.endsWith('.d.ts'))
    assert.ok(files.includes('index.js') && files.includes('index.d.ts') && files.includes('fs.js'))
    for (const name of files) {
      for (const spec of specifiers(await readFile(`${DIST}${name}`, 'utf8'))) {
        for (const word of FORBIDDEN) assert.ok(spec !== word && !spec.startsWith(`${word}/`), `${name} imports ${spec}`)
        // The build may print a builtin without its node: prefix (`crypto`, `fs/promises`).
        const builtin = spec.startsWith('node:') || builtinModules.includes(spec)
        if (!NODE_ONLY.has(name)) assert.ok(!builtin, `${name} imports ${spec}`)
      }
    }
  })

  it('declaration files hold declarations, not bundled JavaScript', async () => {
    for (const name of (await readdir(DIST)).filter((n) => n.endsWith('.d.ts'))) {
      const text = await readFile(`${DIST}${name}`, 'utf8')
      assert.ok(!/\brequire\(|\bexports\.|Object\.defineProperty\(exports/.test(text), `${name} carries JavaScript`)
    }
  })

  it('finds the imports it guards against', () => {
    assert.deepEqual(specifiers(`import { a } from '@backgold/contract/content-api';\nexport * from "zod"\nimport 'node:fs'\nawait import('markdown-it')`), [
      '@backgold/contract/content-api',
      'zod',
      'node:fs',
      'markdown-it',
    ])
    assert.deepEqual(specifiers('/** the api\'s own contract type, vendored as `@backgold/contract/content-api` */'), [])
  })

  it('ships no source maps (their sourcesContent would carry the private modules whole)', async () => {
    assert.deepEqual((await readdir(DIST)).filter((name) => name.endsWith('.map')), [])
  })

  it(`keeps dist/index.js under ${INDEX_BUDGET_BYTES / 1024} kB`, async () => {
    const { size } = await stat(`${DIST}index.js`)
    assert.ok(size < INDEX_BUDGET_BYTES, `dist/index.js is ${size} bytes`)
  })
})
