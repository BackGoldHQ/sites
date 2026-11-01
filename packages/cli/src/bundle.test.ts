import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import { bucketForm, bundleZip, completionJwt, contentType } from './bundle.js'
import { collectSite } from './collect.js'
import { FIXTURE_SITE } from './testing/fixture-api.js'

test('bundle: the completion token is the last bucket answer carrying one; no buckets means the session token', () => {
  assert.equal(completionJwt('session', []), 'session')
  assert.equal(completionJwt('session', [{ result: {} }, { result: { jwt: 'done' } }]), 'done')
  assert.equal(completionJwt('session', [{ result: { jwt: 'early' } }, { result: {} }]), 'early', 'one carried earlier still counts')
  assert.equal(completionJwt('session', [{ result: {} }, { success: true }]), null)
  assert.equal(completionJwt('session', [null]), null)
})

test('bundle: a bucket is one base64 part per hash, named by the hash, typed by the file', async () => {
  const site = await collectSite(FIXTURE_SITE)
  const byHash = new Map([...site.assets.values()].map((a) => [a.hash, a]))
  const css = site.assets.get('/_astro/site.css')!
  const js = site.assets.get('/_astro/app.js')!
  const form = await bucketForm([css.hash, js.hash], byHash)
  const parts = [...form.entries()]
  assert.deepEqual(
    parts.map(([name]) => name),
    [css.hash, js.hash],
  )
  const cssPart = parts[0]![1] as File
  assert.equal(cssPart.name, css.hash)
  assert.equal(cssPart.type, 'text/css')
  assert.equal(Buffer.from(await cssPart.text(), 'base64').toString('utf8'), await readFile(css.file, 'utf8'))
  assert.equal((parts[1]![1] as File).type, 'text/javascript')
  await assert.rejects(bucketForm(['f'.repeat(32)], byHash), /an asset this build does not have/)
})

test('bundle: content types, and application/null for an unknown extension', () => {
  assert.equal(contentType('a/b.SVG'), 'image/svg+xml')
  assert.equal(contentType('a/b.woff2'), 'font/woff2')
  assert.equal(contentType('a/b.unknown'), 'application/null')
  assert.equal(contentType('a/README'), 'application/null')
})

test('bundle: the zip holds every module at its name and manifest.json', async () => {
  const site = await collectSite(FIXTURE_SITE)
  const manifest = { main_module: site.mainModule, modules: site.modules.map((m) => ({ name: m.name, type: m.type, bytes: m.bytes })) }
  const files = unzipSync(await bundleZip(site.modules, manifest))
  assert.deepEqual(Object.keys(files).sort(), [...site.modules.map((m) => m.name), 'manifest.json'].sort())
  for (const m of site.modules) assert.deepEqual(Buffer.from(files[m.name]!), await readFile(m.file), m.name)
  assert.deepEqual(JSON.parse(strFromU8(files['manifest.json']!)), manifest)
  await assert.rejects(bundleZip([{ ...site.modules[0]!, name: 'manifest.json' }], manifest), /module named manifest\.json/)
})
