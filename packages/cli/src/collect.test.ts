import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CollectError, collectSite, findWorkerConfig, hashAsset } from './collect.js'
import { ignoreMatcher } from './ignore.js'
import { FIXTURE_SITE } from './testing/fixture-api.js'

async function copyFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'backgold-cli-collect-'))
  await cp(FIXTURE_SITE, dir, { recursive: true })
  return dir
}

async function withCopy(fn: (dir: string) => Promise<void>) {
  const dir = await copyFixture()
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function editConfig(dir: string, edit: (config: Record<string, unknown>) => void) {
  const file = join(dir, 'dist/server/wrangler.json')
  const config = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  edit(config)
  await writeFile(file, JSON.stringify(config))
}

async function refusal(dir: string): Promise<CollectError> {
  try {
    await collectSite(dir)
  } catch (err) {
    assert.ok(err instanceof CollectError, String(err))
    return err
  }
  assert.fail('collectSite should have refused')
}

test('collect: the fixture build gives its modules, typed by extension, with main first found', async () => {
  const site = await collectSite(FIXTURE_SITE)
  assert.equal(site.config, 'dist/server/wrangler.json')
  assert.equal(site.mainModule, 'entry.mjs')
  assert.equal(site.compatibilityDate, '2026-10-04')
  assert.deepEqual(site.compatibilityFlags, ['nodejs_compat', 'global_fetch_strictly_public'])
  assert.deepEqual(
    site.modules.map((m) => [m.name, m.type]),
    [
      ['chunks/blob.bin', 'data'],
      ['chunks/legacy.cjs', 'commonjs'],
      ['chunks/page.mjs', 'esm'],
      ['chunks/tiny.wasm', 'wasm'],
      ['chunks/words.txt', 'text'],
      ['entry.mjs', 'esm'],
    ],
    'no source map, no dot-path, not the config itself',
  )
  assert.equal(site.modulesBytes, site.modules.reduce((n, m) => n + m.bytes, 0))
})

test('collect: assets leave out the ignore file, _headers, _redirects and what .assetsignore names', async () => {
  const site = await collectSite(FIXTURE_SITE)
  assert.deepEqual([...site.assets.keys()].sort(), ['/_astro/app.js', '/_astro/site.css', '/copy.txt', '/robots.txt'])
  assert.equal(site.assetsBytes, [...site.assets.values()].reduce((n, a) => n + a.size, 0))
  assert.deepEqual(site.assetsConfig, {
    headers: '/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n',
    redirects: '/old /new 301\n',
  })
})

test('collect: vars keep text values and drop reserved names and the rest with warnings', async () => {
  const site = await collectSite(FIXTURE_SITE)
  assert.deepEqual(site.vars, { SITE_URL: 'https://fixture.example.org' })
  assert.equal(site.warnings.length, 2, site.warnings.join('\n'))
  assert.match(site.warnings[0]!, /BACKGOLD_SITE_KEY are left out/)
  assert.match(site.warnings[1]!, /RETRIES are left out: only text values/)
})

test('collect: an asset hash is sha256 of the bytes and the extension, 32 hex', async () => {
  const file = join(FIXTURE_SITE, 'dist/client/_astro/site.css')
  const bytes = await readFile(file)
  const expected = createHash('sha256').update(bytes).update('css').digest('hex').slice(0, 32)
  assert.deepEqual(await hashAsset(file), { hash: expected, size: bytes.length, file })
  const site = await collectSite(FIXTURE_SITE)
  // copy.txt holds the same bytes as site.css; the extension keeps them apart.
  assert.notEqual(site.assets.get('/copy.txt')!.hash, site.assets.get('/_astro/site.css')!.hash)
  for (const asset of site.assets.values()) assert.match(asset.hash, /^[0-9a-f]{32}$/)
})

test('collect: the config is found from the redirect, else as the one wrangler.json under dist/', async () => {
  await withCopy(async (dir) => {
    assert.equal(await findWorkerConfig(dir), join(dir, 'dist/server/wrangler.json'))
    await rm(join(dir, '.wrangler'), { recursive: true })
    assert.equal(await findWorkerConfig(dir), join(dir, 'dist/server/wrangler.json'), 'dot-directories are not searched')
    await writeFile(join(dir, 'dist/client/wrangler.json'), '{}')
    await assert.rejects(findWorkerConfig(dir), /more than one wrangler\.json/)
    await rm(join(dir, 'dist'), { recursive: true })
    await assert.rejects(findWorkerConfig(dir), /does not exist: build the site first/)
  })
})

test('collect: a compatibility flag outside the two allowed is refused with exit 2', async () => {
  await withCopy(async (dir) => {
    await editConfig(dir, (c) => (c.compatibility_flags = ['nodejs_compat', 'experimental']))
    const err = await refusal(dir)
    assert.equal(err.code, 2)
    assert.match(err.message, /experimental; BackGold hosting allows only nodejs_compat and global_fetch_strictly_public/)
  })
})

test('collect: modules over 10 MiB are refused with exit 2', async () => {
  await withCopy(async (dir) => {
    await writeFile(join(dir, 'dist/server/chunks/huge.bin'), Buffer.alloc(10 * 1024 * 1024 + 1))
    const err = await refusal(dir)
    assert.equal(err.code, 2)
    assert.match(err.message, /over BackGold hosting's 10\.0 MiB Worker limit/)
  })
})

test('collect: a module named metadata or manifest.json is refused with exit 2', async () => {
  for (const name of ['metadata', 'manifest.json']) {
    await withCopy(async (dir) => {
      await writeFile(join(dir, 'dist/server', name), 'x')
      const err = await refusal(dir)
      assert.equal(err.code, 2)
      assert.match(err.message, new RegExp(`the Worker module ${name.replace('.', '\\.')} has a name BackGold hosting cannot take`))
    })
  }
})

test('collect: ASSETS and a var name the Worker cannot read are left out with warnings', async () => {
  await withCopy(async (dir) => {
    await editConfig(dir, (c) => (c.vars = { SITE_URL: 'https://fixture.example.org', ASSETS: 'x', 'bad-name': 'y' }))
    const site = await collectSite(dir)
    assert.deepEqual(site.vars, { SITE_URL: 'https://fixture.example.org' })
    assert.match(site.warnings.join('\n'), /vars ASSETS are left out: BackGold sets BACKGOLD_\*, ENVIRONMENT and ASSETS itself/)
    assert.match(site.warnings.join('\n'), /vars bad-name are left out: a var's name is letters/)
  })
})

test('collect: an asset over 25 MiB is refused with exit 2', async () => {
  await withCopy(async (dir) => {
    await writeFile(join(dir, 'dist/client/video.mp4'), Buffer.alloc(25 * 1024 * 1024 + 1))
    const err = await refusal(dir)
    assert.equal(err.code, 2)
    assert.match(err.message, /\/video\.mp4 is 25\.0 MiB, over the 25\.0 MiB limit per file/)
  })
})

test('collect: a _headers file over 64 KiB is refused with exit 2', async () => {
  await withCopy(async (dir) => {
    await writeFile(join(dir, 'dist/client/_headers'), 'x'.repeat(64 * 1024 + 1))
    const err = await refusal(dir)
    assert.equal(err.code, 2)
    assert.match(err.message, /_headers is 64\.0 KiB, over the 64\.0 KiB limit/)
  })
})

test('collect: too many vars, or one too long, is refused with exit 2', async () => {
  await withCopy(async (dir) => {
    await editConfig(dir, (c) => (c.vars = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`V${i}`, 'x']))))
    const err = await refusal(dir)
    assert.equal(err.code, 2)
    assert.match(err.message, /65 vars, over the limit of 64/)
    await editConfig(dir, (c) => (c.vars = { LONG: 'x'.repeat(5 * 1024 + 1) }))
    assert.match((await refusal(dir)).message, /var LONG is over the 5\.0 KiB limit/)
  })
})

test('collect: bindings BackGold does not carry are named in a warning; BACKGOLD_CACHE is not', async () => {
  await withCopy(async (dir) => {
    await editConfig(dir, (c) => {
      c.vars = {}
      c.d1_databases = [{ binding: 'DB' }]
      c.triggers = { crons: ['0 * * * *'] }
    })
    const site = await collectSite(dir)
    assert.deepEqual(site.warnings, [
      'dist/server/wrangler.json names d1_databases, triggers.crons; BackGold hosting gives the Worker its own bindings and leaves these out',
    ])
  })
})

test('collect: a main module outside the Worker directory, or missing, is refused', async () => {
  await withCopy(async (dir) => {
    await editConfig(dir, (c) => (c.main = '../client/_astro/app.js'))
    assert.match((await refusal(dir)).message, /main \(\.\.\/client\/_astro\/app\.js\) is outside dist\/server\//)
    await editConfig(dir, (c) => (c.main = 'missing.mjs'))
    assert.match((await refusal(dir)).message, /main module missing\.mjs was not found/)
  })
})

test('ignore: gitignore rules as .assetsignore uses them', () => {
  const ignored = ignoreMatcher(['# comment', '', 'wrangler.json', '/top.txt', 'private/', '*.log', 'docs/**/draft-?.md', '!keep.log'])
  assert.equal(ignored('wrangler.json'), true)
  assert.equal(ignored('nested/wrangler.json'), true, 'a bare name matches at any depth')
  assert.equal(ignored('top.txt'), true)
  assert.equal(ignored('nested/top.txt'), false, 'a leading / anchors')
  assert.equal(ignored('private/a/b.txt'), true)
  assert.equal(ignored('private'), false, 'a trailing / matches directories only')
  assert.equal(ignored('x/debug.log'), true)
  assert.equal(ignored('keep.log'), false, 'a later ! wins')
  assert.equal(ignored('docs/a/b/draft-1.md'), true)
  assert.equal(ignored('docs/draft-1.md'), true)
  assert.equal(ignored('docs/draft-10.md'), false)
  assert.equal(ignored('index.html'), false)
})
