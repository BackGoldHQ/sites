// node --test scripts/check-packed-imports.test.mjs
//
// The publish workflow's check that a packed package imports only names npm's
// copies of its @backgold dependencies export. Each test writes a packed
// package and the node_modules it would be installed beside into a temp
// directory; nothing is read from npm.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkPackage, entryOf, exportsOf, importsOf } from './check-packed-imports.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-packed-imports.mjs')

function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  }
}

/** A packed kit that depends on the client, and the client as npm would install it. */
function fixture({ kit, client, clientVersion = '0.4.0' }) {
  const root = mkdtempSync(join(tmpdir(), 'packed-imports-'))
  write(join(root, 'package'), {
    'package.json': { name: '@backgold/kit', version: '0.4.2', type: 'module', dependencies: { '@backgold/client': '^0.4.0', marked: '^18.0.0' } },
    ...kit,
  })
  write(join(root, 'node_modules/@backgold/client'), {
    'package.json': { name: '@backgold/client', version: clientVersion, type: 'module', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } },
    ...client,
  })
  return { packageDir: join(root, 'package'), modulesDir: join(root, 'node_modules') }
}

test('importsOf reads named, default, aliased, re-exported and minified imports', () => {
  const found = importsOf(`
    import { a, b as c } from '@backgold/client'
    import d, { e } from "@backgold/client/server"
    import f from '@backgold/client/plain'
    export { g as h } from '@backgold/client'
    import{i as j,k}from"@backgold/client";
    import * as all from '@backgold/client/ns'
    import type { T } from '@backgold/client/types'
    import { type U, l } from '@backgold/client/mixed'
    import { other } from 'marked'
  `)
  assert.deepEqual([...found.get('@backgold/client')].sort(), ['a', 'b', 'g', 'i', 'k'])
  assert.deepEqual([...found.get('@backgold/client/server')].sort(), ['default', 'e'])
  assert.deepEqual([...found.get('@backgold/client/plain')], ['default'])
  assert.deepEqual([...found.get('@backgold/client/mixed')], ['l'])
  assert.equal(found.has('@backgold/client/ns'), false)
  assert.equal(found.has('@backgold/client/types'), false)
  assert.deepEqual([...found.get('marked')], ['other'])
})

test('exportsOf reads lists, declarations, the default and `export * from`', () => {
  const root = mkdtempSync(join(tmpdir(), 'packed-exports-'))
  write(root, {
    'index.js': `
      const a = 1, b = 2
      export { a, b as c }
      export function d() {}
      export const e = 1
      export class F {}
      export default a
      export * from './more.js'
      export * as ns from './more.js'
      export { default as Menu } from './Menu.astro'
    `,
    'more.js': `export const g = 1; export default 2`,
  })
  assert.deepEqual([...exportsOf(join(root, 'index.js'))].sort(), ['F', 'Menu', 'a', 'c', 'd', 'default', 'e', 'g', 'ns'])
})

test('entryOf follows `exports`: a string, conditions, a subpath, and none', () => {
  const root = mkdtempSync(join(tmpdir(), 'packed-entry-'))
  write(join(root, 'a'), { 'package.json': { name: 'a', exports: { '.': { types: './d.ts', import: './dist/index.js' }, './server': './dist/server.js' } } })
  write(join(root, 'b'), { 'package.json': { name: 'b', exports: { import: './esm.js', default: './cjs.js' } } })
  write(join(root, 'c'), { 'package.json': { name: 'c', main: './main.js' } })
  assert.equal(entryOf(join(root, 'a'), ''), join(root, 'a/dist/index.js'))
  assert.equal(entryOf(join(root, 'a'), 'server'), join(root, 'a/dist/server.js'))
  assert.equal(entryOf(join(root, 'a'), 'missing'), null)
  assert.equal(entryOf(join(root, 'b'), ''), join(root, 'b/esm.js'))
  assert.equal(entryOf(join(root, 'c'), ''), join(root, 'c/main.js'))
})

test('a build that imports only what the installed dependency exports passes', () => {
  const { packageDir, modulesDir } = fixture({
    kit: { 'dist/index.js': `import { createClient, COOKIE } from '@backgold/client'\nexport const x = createClient` },
    client: { 'dist/index.js': `export { createClient } from './chunk.js'\nexport const COOKIE = 'c'`, 'dist/chunk.js': `export function createClient() {}` },
  })
  const result = checkPackage(packageDir, modulesDir)
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.checked, ['@backgold/client: 2 names against @backgold/client@0.4.0'])
})

test('a build ahead of the published dependency fails, naming the import, the file and the version', () => {
  // The 0.4.2 release: the kit imports a name the workspace's client had and npm's 0.4.0 did not.
  const { packageDir, modulesDir } = fixture({
    kit: {
      'dist/index.js': `import{createClient as c,VISITOR_PROGRESS_PATH as p}from"@backgold/client";export{c,p}`,
      'components/Menu.astro': `---\nimport { menuOf } from '@backgold/client'\n---\n<nav></nav>`,
      'dist/index.d.ts': `import { NotInJs } from '@backgold/client'`,
    },
    client: { 'dist/index.js': `export function createClient() {}` },
  })
  const { problems } = checkPackage(packageDir, modulesDir)
  assert.equal(problems.length, 2)
  assert.match(problems[0], /@backgold\/kit imports menuOf from '@backgold\/client' \(components\/Menu\.astro\), which @backgold\/client@0\.4\.0, the version npm installs for \^0\.4\.0, does not export/)
  assert.match(problems[1], /imports VISITOR_PROGRESS_PATH from '@backgold\/client' \(dist\/index\.js\)/)
})

test('a dependency that is not installed, or has no file for the import, fails', () => {
  const { packageDir, modulesDir } = fixture({
    kit: { 'dist/index.js': `import { a } from '@backgold/client/server'` },
    client: { 'dist/index.js': `export const a = 1` },
  })
  assert.match(checkPackage(packageDir, modulesDir).problems[0], /@backgold\/client@0\.4\.0 has no file for the import '@backgold\/client\/server'/)
  assert.match(checkPackage(packageDir, join(modulesDir, 'nowhere')).problems[0], /@backgold\/client@\^0\.4\.0 is not installed/)
})

test('an import from a package the manifest does not depend on is not this check\'s', () => {
  const { packageDir, modulesDir } = fixture({
    kit: { 'dist/index.js': `import { x } from '@backgold/contract'\nimport { marked } from 'marked'` },
    client: { 'dist/index.js': `export const a = 1` },
  })
  assert.deepEqual(checkPackage(packageDir, modulesDir), { name: '@backgold/kit', version: '0.4.2', ranges: { '@backgold/client': '^0.4.0', marked: '^18.0.0' }, checked: [], problems: [] })
})

test('the command reads a tarball, exits 1 on a missing name and 0 on none, 2 on no input', () => {
  const bad = fixture({ kit: { 'dist/index.js': `import { gone } from '@backgold/client'` }, client: { 'dist/index.js': `export const here = 1` } })
  const tarball = join(dirname(bad.packageDir), 'kit.tgz')
  execFileSync('tar', ['-czf', tarball, '-C', dirname(bad.packageDir), 'package'])
  const failed = spawnSync(process.execPath, [SCRIPT, tarball, '--modules', bad.modulesDir], { encoding: 'utf8' })
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /FAIL: @backgold\/kit imports gone from '@backgold\/client'/)
  assert.match(failed.stderr, /Bump the dependency's version/)

  const good = fixture({ kit: { 'dist/index.js': `import { here } from '@backgold/client'` }, client: { 'dist/index.js': `export const here = 1` } })
  const passed = spawnSync(process.execPath, [SCRIPT, good.packageDir, '--modules', good.modulesDir], { encoding: 'utf8' })
  assert.equal(passed.status, 0)
  assert.match(passed.stdout, /ok {3}@backgold\/client: 1 name against @backgold\/client@0\.4\.0/)

  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2)
})
