#!/usr/bin/env node
// `backgold deploy --no-build`'s first step against a real build: builds
// @backgold/content, @backgold/astro and @backgold/cli, builds the public
// starter (templates/astro-starter) in place once with the Cloudflare
// adapter, then reads that build with the CLI's own collector (the code
// `deploy` runs before it calls the api) and checks that the Worker config,
// the main module, the modules and at least one static asset are found
// within BackGold hosting's limits, and that the bundle zips. No network:
// nothing is uploaded. Exits non-zero at the first failed check.
//
//   node scripts/cli-e2e.mjs
//
// Needs node >= 22.12 and pnpm.

import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STARTER = join(ROOT, 'templates/astro-starter')

function run(command, args, cwd) {
  process.stdout.write(`$ ${command} ${args.join(' ')}   (in ${cwd})\n`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
}

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  process.stdout.write(`  ok  ${message}\n`)
}

async function main() {
  run('pnpm', ['--filter', '@backgold/content', 'build'], ROOT)
  run('pnpm', ['--filter', '@backgold/astro', 'build'], ROOT)
  run('pnpm', ['--filter', '@backgold/cli', 'build'], ROOT)
  run('pnpm', ['--filter', 'backgold-starter', 'build'], ROOT)

  const cli = join(ROOT, 'packages/cli/dist')
  const { collectSite } = await import(pathToFileURL(join(cli, 'collect.js')).href)

  process.stdout.write('\nThe starter build, as backgold deploy reads it\n')
  const site = await collectSite(STARTER)
  check(site.config === 'dist/server/wrangler.json', `the Worker config is the adapter's ${site.config}`)
  check(site.mainModule.length > 0 && site.modules.some((m) => m.name === site.mainModule), `the main module ${site.mainModule} is among the modules`)
  check(site.modules.find((m) => m.name === site.mainModule)?.type === 'esm', 'the main module is an ES module')
  check(site.modules.every((m) => !m.name.endsWith('.map') && m.name !== 'wrangler.json'), 'no source map and not the config among the modules')
  check(site.modules.length > 1, `the Worker's chunks are modules too (${site.modules.length})`)
  check(/^\d{4}-\d{2}-\d{2}$/.test(site.compatibilityDate), `a compatibility date (${site.compatibilityDate})`)
  check(site.compatibilityFlags.includes('nodejs_compat'), `the flags (${site.compatibilityFlags.join(', ')})`)
  const assets = [...site.assets.keys()]
  check(assets.some((a) => a.startsWith('/_astro/')), `at least one static asset under /_astro/ (${assets.length} in all)`)
  check([...site.assets.values()].every((a) => /^[0-9a-f]{32}$/.test(a.hash)), 'every asset has a 32-hex hash')
  check(!assets.some((a) => ['/_headers', '/.assetsignore', '/wrangler.json', '/.dev.vars'].includes(a)), 'the adapter\'s _headers and .assetsignore are not uploaded as files')
  check(typeof site.assetsConfig.headers === 'string', 'its _headers travels in assets_config')
  check(!Object.keys(site.vars).some((name) => name.startsWith('BACKGOLD_')), `no BACKGOLD_* var is sent (${Object.keys(site.vars).join(', ') || 'none'})`)

  const { bundleZip } = await import(pathToFileURL(join(cli, 'bundle.js')).href)
  const zip = await bundleZip(site.modules, { main_module: site.mainModule })
  check(zip.length > 0 && zip.length < 10 * 1024 * 1024, `the bundle zips under 10 MiB (${zip.length} bytes)`)
  process.stdout.write('\nThe CLI reads the starter build.\n')
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
