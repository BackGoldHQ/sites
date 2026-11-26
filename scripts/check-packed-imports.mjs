#!/usr/bin/env node
// Checks a packed package against the @backgold packages npm will install
// beside it: every name it imports from one of them must be a name the
// version npm serves for its range exports.
//
// `pnpm pack` writes each `workspace:^` range as `^<the workspace's version>`,
// and the publish workflow checks that npm has a version in that range. Neither
// says the published version holds what this build imports: the workspace's
// copy can be ahead of npm under the same version number. @backgold/astro
// 0.4.2 shipped that way (2026-10-29): it was packed while the workspace's
// @backgold/content still said 0.4.0 but already exported names npm's 0.4.0
// did not, so it depended on `^0.4.0` and failed on a fresh install with "does
// not provide an export named VISITOR_PROGRESS_PATH". This check reads the
// packed files and the installed dependency, and fails that publish.
//
//   node scripts/check-packed-imports.mjs <tarball.tgz>
//   node scripts/check-packed-imports.mjs <unpacked package dir> --modules <node_modules dir>
//
// With a tarball it is unpacked, and each @backgold dependency, peer
// dependency and optional dependency is installed from npm at the packed range
// (no install scripts), as a project that adds the package would get it. With
// `--modules` nothing is installed: the dependencies are read from that
// node_modules directory (the tests use this).
//
// Read statically, nothing from the packages is run: the imports are the
// `import { … } from` and `export { … } from` statements of the packed `.js`,
// `.mjs` and `.astro` files, and a dependency's exports are those of the file
// its package.json `exports` names for the import, following `export * from`.
// A namespace import (`import * as x`) names nothing and is not checked.
//
// Exit 0: every imported name is exported. 1: one is not, or a dependency or
// one of its files could not be read. 2: usage.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCOPE = '@backgold/'
const SCANNED = new Set(['.js', '.mjs', '.astro'])

/** `a, b as c, type T, default as d` → the names asked of the other module: a, b, default. */
function importedOf(list) {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^type\s/.test(part))
    .map((part) => part.split(/\s+as\s+/)[0].trim())
    .filter(Boolean)
}

/** `a, b as c, default as d` → the names the module gives: a, c, d. */
function exportedOf(list) {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^type\s/.test(part))
    .map((part) => (part.split(/\s+as\s+/)[1] ?? part).trim())
    .filter(Boolean)
}

/**
 * The names a source file imports from each module, by specifier. Covers
 * `import d from`, `import { a } from`, `import d, { a } from` and
 * `export { a } from`, minified or not; a whole-statement `import type` and a
 * namespace import name nothing.
 */
export function importsOf(source) {
  const found = new Map()
  const add = (specifier, names) => {
    if (!found.has(specifier)) found.set(specifier, new Set())
    for (const name of names) found.get(specifier).add(name)
  }
  const braces = /\b(import|export)\s*(type\s+)?(?:([\w$]+)\s*,\s*)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\5/g
  for (const m of source.matchAll(braces)) {
    if (m[2]) continue
    add(m[6], [...(m[3] ? ['default'] : []), ...importedOf(m[4])])
  }
  const defaults = /\bimport\s+(?!type\s)([\w$]+)\s*from\s*(['"])([^'"]+)\2/g
  for (const m of source.matchAll(defaults)) add(m[3], ['default'])
  return found
}

/** The file a package's `exports` (or `module` / `main`) names for a subpath, for an `import`. */
export function entryOf(packageDir, subpath) {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  const key = subpath ? `./${subpath}` : '.'
  const pick = (target) => {
    if (typeof target === 'string') return target
    if (Array.isArray(target)) return target.map(pick).find(Boolean) ?? null
    if (target && typeof target === 'object') {
      for (const condition of ['import', 'module', 'default']) {
        const got = pick(target[condition])
        if (got) return got
      }
    }
    return null
  }
  const { exports } = manifest
  let target = null
  if (typeof exports === 'string' || Array.isArray(exports)) target = key === '.' ? pick(exports) : null
  else if (exports && typeof exports === 'object') {
    const conditions = !Object.keys(exports).some((k) => k.startsWith('.'))
    target = conditions ? (key === '.' ? pick(exports) : null) : pick(exports[key])
  } else target = key === '.' ? (manifest.module ?? manifest.main ?? 'index.js') : key
  return target ? resolve(packageDir, target) : null
}

/** The names a module file exports, following its relative `export * from`. */
export function exportsOf(file, seen = new Set()) {
  if (seen.has(file)) return new Set()
  seen.add(file)
  const source = readFileSync(file, 'utf8')
  const names = new Set()
  for (const m of source.matchAll(/\bexport\s*\{([^}]*)\}/g)) for (const name of exportedOf(m[1])) names.add(name)
  for (const m of source.matchAll(/\bexport\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([\w$]+)/g)) names.add(m[1])
  if (/\bexport\s+default\b/.test(source)) names.add('default')
  for (const m of source.matchAll(/\bexport\s*\*\s*from\s*(['"])(\.[^'"]+)\1/g)) {
    for (const name of exportsOf(resolve(dirname(file), m[2]), seen)) if (name !== 'default') names.add(name)
  }
  for (const m of source.matchAll(/\bexport\s*\*\s*as\s+([\w$]+)\s*from/g)) names.add(m[1])
  return names
}

function filesUnder(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(path))
    else if (entry.isFile() && SCANNED.has(extname(entry.name)) && !entry.name.endsWith('.d.ts')) out.push(path)
  }
  return out
}

/** `@backgold/astro/server` → ['@backgold/astro', 'server']. */
function split(specifier) {
  const [scope, name, ...rest] = specifier.split('/')
  return [`${scope}/${name}`, rest.join('/')]
}

/**
 * Every imported name a dependency does not export, and every dependency or
 * entry that could not be read. `modulesDir` is the node_modules the
 * dependencies are installed in.
 */
export function checkPackage(packageDir, modulesDir) {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  const ranges = { ...manifest.optionalDependencies, ...manifest.peerDependencies, ...manifest.dependencies }
  const wanted = new Map()
  for (const file of filesUnder(packageDir)) {
    for (const [specifier, names] of importsOf(readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith(SCOPE) || !(split(specifier)[0] in ranges)) continue
      if (!wanted.has(specifier)) wanted.set(specifier, new Map())
      for (const name of names) if (!wanted.get(specifier).has(name)) wanted.get(specifier).set(name, file.slice(packageDir.length + 1))
    }
  }
  const problems = []
  const checked = []
  for (const [specifier, names] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
    const [name, subpath] = split(specifier)
    const dir = join(modulesDir, name)
    if (!existsSync(join(dir, 'package.json'))) {
      problems.push(`${name}@${ranges[name]} is not installed in ${modulesDir}`)
      continue
    }
    const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
    const entry = entryOf(dir, subpath)
    if (!entry || !existsSync(entry) || !statSync(entry).isFile()) {
      problems.push(`${name}@${version} has no file for the import '${specifier}'`)
      continue
    }
    const given = exportsOf(entry)
    const missing = [...names].filter(([wantedName]) => !given.has(wantedName))
    for (const [wantedName, file] of missing) {
      problems.push(
        `${manifest.name} imports ${wantedName} from '${specifier}' (${file}), which ${name}@${version}, the version npm installs for ${ranges[name]}, does not export`,
      )
    }
    if (missing.length === 0) checked.push(`${specifier}: ${names.size} name${names.size === 1 ? '' : 's'} against ${name}@${version}`)
  }
  return { name: manifest.name, version: manifest.version, ranges, checked, problems }
}

function usage() {
  console.error('usage: node scripts/check-packed-imports.mjs <tarball.tgz | package dir> [--modules <node_modules dir>]')
  process.exit(2)
}

function main(argv) {
  const at = argv.indexOf('--modules')
  const modulesArg = at >= 0 ? argv[at + 1] : null
  const [input] = at >= 0 ? argv.filter((_, i) => i !== at && i !== at + 1) : argv
  if (!input || (at >= 0 && !modulesArg) || !existsSync(input)) usage()

  let packageDir = resolve(input)
  if (statSync(packageDir).isFile()) {
    const unpacked = mkdtempSync(join(tmpdir(), 'packed-'))
    execFileSync('tar', ['-xzf', packageDir, '-C', unpacked])
    packageDir = join(unpacked, 'package')
  }

  let modulesDir = modulesArg ? resolve(modulesArg) : null
  if (!modulesDir) {
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    const ranges = { ...manifest.optionalDependencies, ...manifest.peerDependencies, ...manifest.dependencies }
    const specs = Object.entries(ranges)
      .filter(([name]) => name.startsWith(SCOPE))
      .map(([name, range]) => `${name}@${range}`)
    const project = mkdtempSync(join(tmpdir(), 'consumer-'))
    modulesDir = join(project, 'node_modules')
    if (specs.length > 0) {
      console.log(`Installing from npm, as a project that adds ${manifest.name} would: ${specs.join(' ')}`)
      // --legacy-peer-deps: only these packages are wanted, not their own peers (astro and its tree).
      try {
        execFileSync('npm', ['install', '--prefix', project, '--ignore-scripts', '--no-audit', '--no-fund', '--no-save', '--legacy-peer-deps', ...specs], {
          stdio: ['ignore', 'ignore', 'pipe'],
          encoding: 'utf8',
        })
      } catch (error) {
        const said = String(error.stderr ?? '').split('\n').filter((line) => /npm (error|ERR!)/.test(line)).slice(0, 4).join('\n')
        console.error(`FAIL: npm could not install ${specs.join(' ')}. A range npm has no version for means that package is published first.\n${said}`)
        process.exit(1)
      }
    }
  }

  const result = checkPackage(packageDir, modulesDir)
  for (const line of result.checked) console.log(`ok   ${line}`)
  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(`FAIL: ${problem}`)
    console.error(
      `\n${result.name}@${result.version} would not load in a project that installs it from npm. Bump the dependency's version in its package.json, publish it, then publish this package: \`pnpm pack\` then writes the new version into the range.`,
    )
    process.exit(1)
  }
  console.log(`${result.name}@${result.version}: every name it imports from an ${SCOPE}* package is one npm's copy exports.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
