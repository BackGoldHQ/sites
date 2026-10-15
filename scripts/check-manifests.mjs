#!/usr/bin/env node
// Every template's manifest against the Content API contract: each
// templates/<dir>/template.json must parse with siteTemplateManifestSchema
// from the vendored contract slice, and a manifest that names a `key` must
// name its own directory. The platform keeps a copy of each manifest and
// validates it with the same schema, so a manifest that passes here is one
// the platform's composer can read. A template directory without a
// template.json is skipped and says so. Run by the `manifests` CI job.
//
//   node scripts/check-manifests.mjs
//   CONTRACT_DIR=<dir> node scripts/check-manifests.mjs
//                     read the schema from <dir>/site-templates.js instead of
//                     vendor/backgold-contract (a path relative to the
//                     repository root, or absolute), for example a platform
//                     checkout's packages/shared/dist-contract
//
// Exit codes: 0 every manifest passed; 1 a manifest failed, or the contract
// slice or its zod could not be loaded.
//
// No dependencies beyond node's own; the slice's own import of zod resolves
// through the workspace install (pnpm install at the repository root).

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT_DIR = process.env.CONTRACT_DIR || 'vendor/backgold-contract'
const contractDir = isAbsolute(CONTRACT_DIR) ? CONTRACT_DIR : join(ROOT, CONTRACT_DIR)
const schemaModule = join(contractDir, 'site-templates.js')

function fail(message) {
  process.stderr.write(`FAIL: ${message}\n`)
  process.exit(1)
}

if (!existsSync(schemaModule)) {
  fail(
    `the Content API contract slice is not at ${schemaModule}, so there is no schema to check the manifests against. ` +
      'Pull it into vendor/backgold-contract from a platform checkout, or point CONTRACT_DIR at a directory holding site-templates.js.',
  )
}

let siteTemplateManifestSchema
try {
  ;({ siteTemplateManifestSchema } = await import(pathToFileURL(schemaModule).href))
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND') {
    fail(`${schemaModule} could not load a module it imports (${error.message}); run \`pnpm install\` at the repository root first.`)
  }
  throw error
}
if (!siteTemplateManifestSchema || typeof siteTemplateManifestSchema.safeParse !== 'function') {
  fail(`${schemaModule} does not export siteTemplateManifestSchema.`)
}

const templatesDir = join(ROOT, 'templates')
const dirs = readdirSync(templatesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

const shownSchema = relative(ROOT, schemaModule)
process.stdout.write(`Schema: ${shownSchema.startsWith('..') ? schemaModule : shownSchema}\n`)
let failed = 0
let checked = 0
for (const dir of dirs) {
  const path = join(templatesDir, dir, 'template.json')
  const shown = relative(ROOT, path)
  if (!existsSync(path)) {
    process.stdout.write(`  templates/${dir}: no template.json, skipped\n`)
    continue
  }
  checked++
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    failed++
    process.stdout.write(`  ${shown}: FAIL, not JSON (${error.message})\n`)
    continue
  }
  const problems = []
  const result = siteTemplateManifestSchema.safeParse(manifest)
  if (!result.success) {
    for (const issue of result.error.issues) {
      problems.push(`${issue.path.length ? issue.path.join('.') : '(manifest)'}: ${issue.message}`)
    }
  }
  if (manifest && typeof manifest === 'object' && 'key' in manifest && manifest.key !== dir) {
    problems.push(`key: is ${JSON.stringify(manifest.key)}, but the manifest is in templates/${dir}; a manifest's key names its own directory`)
  }
  if (problems.length) {
    failed++
    process.stdout.write(`  ${shown}: FAIL\n${problems.map((p) => `      ${p}\n`).join('')}`)
  } else {
    process.stdout.write(`  ${shown}: ok\n`)
  }
}

if (failed) fail(`${failed} of ${checked} template manifest${checked === 1 ? '' : 's'} failed; fix each line above.`)
process.stdout.write(`${checked} template manifest${checked === 1 ? '' : 's'} passed.\n`)
