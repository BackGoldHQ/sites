#!/usr/bin/env node
// Writes what @backgold/templates publishes: a copy of each template under
// the repository's templates/ that has a template.json, as templates/<key>/
// here (build output, node_modules, the Cloudflare state and local secrets
// left out; its .gitignore as _gitignore, since npm drops a .gitignore from a
// tarball), and templates.json: the keys, the exact @backgold/* versions the
// workspace has now (the versions a project ejected from this publish pins)
// and the commit it was built from when the tree is clean.
//
// Before writing, it checks each template is one an ejected project can
// install: template.json's key is its directory, every @backgold/* dependency
// is one of the four published packages and the only `workspace:` ranges are
// theirs, and no relative import in its source reaches outside its directory.
//
//   node build.mjs           check, then write templates/ and templates.json
//   node build.mjs --check   check only
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const TEMPLATES = join(ROOT, 'templates')
const CHECK_ONLY = process.argv.includes('--check')

/** The published packages a template may name, and where each lives in the workspace. */
const PACKAGES = {
  '@backgold/template-kit': 'packages/template-kit',
  '@backgold/astro': 'packages/astro-backgold',
  '@backgold/content': 'packages/content-client',
  '@backgold/cli': 'packages/cli',
}

const LEFT_OUT = /[\\/](node_modules|dist|\.astro|\.wrangler)([\\/]|$)|[\\/]\.dev\.vars(\..*)?$/
const SOURCE_FILE = /\.(ts|mts|js|mjs|astro)$/
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]*)['"]/g

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name)
    if (LEFT_OUT.test(path)) return []
    return d.isDirectory() ? filesUnder(path) : [path]
  })
}

/** What keeps templates/<dir> from installing outside the workspace, one line each. */
function problemsOf(dir) {
  const base = join(TEMPLATES, dir)
  const problems = []
  const manifest = readJson(join(base, 'template.json'))
  if (manifest.key !== dir) problems.push(`template.json's key is ${JSON.stringify(manifest.key)}, not ${dir}`)
  const pkg = readJson(join(base, 'package.json'))
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      const published = Object.hasOwn(PACKAGES, name)
      if (name.startsWith('@backgold/') && !published) problems.push(`${field} names ${name}, which is not published`)
      else if (String(range).startsWith('workspace:') && !published) problems.push(`${field} names ${name}@${range}, which resolves only in the workspace`)
    }
  }
  for (const file of filesUnder(base).filter((f) => SOURCE_FILE.test(f))) {
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const target = resolve(dirname(file), specifier)
      if (target !== base && !target.startsWith(base + sep)) problems.push(`${relative(base, file)} imports ${specifier}, outside the template`)
    }
  }
  return { manifest, problems }
}

/** The commit the templates come from: CI's, else HEAD when nothing under templates/ or packages/ is uncommitted. */
function sourceCommit() {
  if (/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '')) return process.env.GITHUB_SHA
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'templates', 'packages'], { cwd: ROOT, encoding: 'utf8' })
    if (dirty.trim()) return undefined
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

const keys = readdirSync(TEMPLATES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(TEMPLATES, d.name, 'template.json')))
  .map((d) => d.name)
  .sort()

const index = []
let failed = false
for (const key of keys) {
  const { manifest, problems } = problemsOf(key)
  if (problems.length) {
    failed = true
    process.stderr.write(`templates/${key}:\n${problems.map((p) => `  ${p}\n`).join('')}`)
  }
  index.push({ key, name: manifest.name, audience: manifest.audience })
}
if (failed) {
  process.stderr.write('A template above cannot be installed outside the workspace; fix each line.\n')
  process.exit(1)
}
process.stdout.write(`${keys.length} templates install outside the workspace: ${keys.join(', ')}\n`)
if (CHECK_ONLY) process.exit(0)

const out = join(HERE, 'templates')
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
for (const key of keys) {
  const target = join(out, key)
  cpSync(join(TEMPLATES, key), target, { recursive: true, filter: (src) => !LEFT_OUT.test(src) })
  if (existsSync(join(target, '.gitignore'))) renameSync(join(target, '.gitignore'), join(target, '_gitignore'))
}
const versions = Object.fromEntries(Object.entries(PACKAGES).map(([name, dir]) => [name, readJson(join(ROOT, dir, 'package.json')).version]))
const commit = sourceCommit()
writeFileSync(join(HERE, 'templates.json'), `${JSON.stringify({ versions, ...(commit ? { commit } : {}), templates: index }, null, 2)}\n`)
process.stdout.write(`Wrote templates/ and templates.json (${Object.entries(versions).map(([n, v]) => `${n} ${v}`).join(', ')}${commit ? `; commit ${commit.slice(0, 12)}` : ''})\n`)
