#!/usr/bin/env node
// Refreshes vendor/backgold-contract/ from a BackGold platform checkout: runs
// the platform's `pnpm --filter @givegold/shared build:contract` there, empties
// vendor/backgold-contract/ except its package.json, README.md and the
// node_modules pnpm installs there, copies every file of the checkout's
// packages/shared/dist-contract/ in, and writes CONTRACT.json naming the
// platform commit, its branch and the date.
//
//   node scripts/contract-pull.mjs <platform checkout>
//   node scripts/contract-pull.mjs --help    this usage, exit 0
//
// Refuses a checkout with uncommitted changes under packages/shared, so the
// snapshot always names a real commit. Needs node and pnpm; the checkout needs
// its dependencies installed. No dependencies beyond node's own.

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR = join(ROOT, 'vendor', 'backgold-contract')
/** The vendored package's own files and its installed dependencies, kept across pulls. */
const KEEP = new Set(['package.json', 'README.md', 'node_modules'])

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

/** A git command's trimmed stdout in the checkout, or null when it fails. */
function git(checkout, args) {
  const result = spawnSync('git', ['-C', checkout, ...args], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

const USAGE = 'Usage: node scripts/contract-pull.mjs <platform checkout>'
const arg = process.argv[2]
if (arg === '--help' || arg === '-h') {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}
if (!arg) fail(USAGE)
const platform = resolve(arg)
const shared = join(platform, 'packages', 'shared')

if (git(platform, ['rev-parse', '--is-inside-work-tree']) !== 'true') fail(`${platform} is not a git checkout.`)
if (!existsSync(join(shared, 'tsup.contract.config.ts'))) fail(`${platform} has no packages/shared/tsup.contract.config.ts, so it is not a platform checkout with the contract build.`)
const dirty = git(platform, ['status', '--porcelain', '--', 'packages/shared'])
if (dirty === null) fail(`git status failed in ${platform}.`)
if (dirty !== '') fail(`${platform} has uncommitted changes under packages/shared; commit or discard them so the snapshot names a real commit.`)

const sha = git(platform, ['rev-parse', 'HEAD'])
const branch = git(platform, ['branch', '--show-current'])
if (!sha) fail(`git rev-parse HEAD failed in ${platform}.`)

process.stdout.write(`$ pnpm --filter @givegold/shared build:contract   (in ${platform})\n`)
const build = spawnSync('pnpm', ['--filter', '@givegold/shared', 'build:contract'], { cwd: platform, stdio: 'inherit' })
if (build.status !== 0) fail(`pnpm --filter @givegold/shared build:contract exited with ${build.status}.`)

const out = join(shared, 'dist-contract')
if (!existsSync(out)) fail(`The build wrote no ${out}.`)

const removed = []
for (const name of readdirSync(VENDOR)) {
  if (KEEP.has(name)) continue
  rmSync(join(VENDOR, name), { recursive: true, force: true })
  removed.push(name)
}

const copied = []
for (const name of readdirSync(out)) {
  const from = join(out, name)
  if (!statSync(from).isFile()) fail(`${from} is not a file; the contract build writes files only.`)
  copyFileSync(from, join(VENDOR, name))
  copied.push(name)
}

const contract = { platform: sha, branch: branch ?? '', pulled: new Date().toISOString() }
writeFileSync(join(VENDOR, 'CONTRACT.json'), `${JSON.stringify(contract, null, 2)}\n`)

process.stdout.write(
  [
    `Removed ${removed.length} file(s) from vendor/backgold-contract/.`,
    `Copied ${copied.length} file(s) from ${out}: ${copied.join(', ')}.`,
    `Wrote vendor/backgold-contract/CONTRACT.json: platform ${sha}${branch ? ` (${branch})` : ''}, pulled ${contract.pulled}.`,
    '',
  ].join('\n'),
)
