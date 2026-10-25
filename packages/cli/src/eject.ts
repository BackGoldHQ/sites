// `backgold eject`: a project of the customer's own from one of BackGold's
// templates. The templates' source comes from the npm package
// @backgold/templates (its newest version on the registry, or a tarball or
// unpacked directory given with --source): `templates/<key>/` per template and
// `templates.json`, which names the template keys and the exact
// @backgold/template-kit, @backgold/astro, @backgold/content and @backgold/cli
// versions that publish was built with, and its commit when it had one.
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { gunzipSync } from 'fflate'
import { request } from './api.js'

export const TEMPLATES_PACKAGE = '@backgold/templates'
const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

export class EjectError extends Error {
  constructor(
    message: string,
    readonly code: 1 | 2,
  ) {
    super(message)
  }
}

export interface TemplatesIndex {
  versions: Record<string, string>
  commit?: string
  templates: { key: string; name?: string; audience?: string }[]
}

/** The templates' source: its files by path (relative to the package root, `/`-separated) and the version it was published as. */
export interface TemplatesSource {
  version: string
  files: Map<string, Uint8Array>
}

/** The files of a gzipped npm tarball, by path with the `package/` prefix taken off. */
function untar(gz: Uint8Array): Map<string, Uint8Array> {
  let tar: Uint8Array
  try {
    tar = gunzipSync(gz)
  } catch {
    throw new EjectError(`the ${TEMPLATES_PACKAGE} tarball is not gzip`, 1)
  }
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replace(/\0.*$/s, '')
  const files = new Map<string, Uint8Array>()
  let longName: string | null = null
  for (let at = 0; at + 512 <= tar.length; ) {
    const header = tar.subarray(at, at + 512)
    if (header.every((b) => b === 0)) break
    const size = Number.parseInt(text(header.subarray(124, 136)).trim() || '0', 8)
    const type = String.fromCharCode(header[156] ?? 0)
    const prefix = text(header.subarray(345, 500))
    const name = longName ?? (prefix ? `${prefix}/${text(header.subarray(0, 100))}` : text(header.subarray(0, 100)))
    const body = tar.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    longName = null
    if (type === 'x') {
      // A pax header: `<len> path=<name>\n` records for the next entry.
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(body))?.[1]
      if (path) longName = path
      continue
    }
    if (type === 'L') {
      longName = text(body)
      continue
    }
    if (type !== '0' && type !== '\0') continue
    const path = name.replace(/^[^/]+\//, '')
    if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new EjectError(`the ${TEMPLATES_PACKAGE} tarball holds a path outside the package: ${name}`, 1)
    files.set(path, body)
  }
  return files
}

async function filesOfDirectory(root: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) files.set(relative(root, path).split(sep).join('/'), await readFile(path))
    }
  }
  await walk(root)
  return files
}

function versionOf(files: Map<string, Uint8Array>): string {
  const pkg = files.get('package.json')
  const version = pkg ? (JSON.parse(new TextDecoder().decode(pkg)) as { version?: unknown }).version : undefined
  return typeof version === 'string' ? version : 'unknown'
}

/** The source from --source: an npm tarball (.tgz) or an unpacked package directory. */
export async function localSource(path: string): Promise<TemplatesSource> {
  const info = await stat(path).catch(() => null)
  if (!info) throw new EjectError(`--source ${path} does not exist`, 2)
  const files = info.isDirectory() ? await filesOfDirectory(path) : untar(new Uint8Array(await readFile(path)))
  return { version: versionOf(files), files }
}

/** The newest @backgold/templates on the registry (`npm_config_registry`, else npm's), its tarball checked against the registry's integrity. */
export async function registrySource(doFetch: typeof fetch, env: Record<string, string | undefined>): Promise<TemplatesSource> {
  const registry = (env.npm_config_registry || DEFAULT_REGISTRY).replace(/\/+$/, '')
  const { body } = await request(doFetch, `${registry}/${TEMPLATES_PACKAGE.replace('/', '%2f')}/latest`)
  const meta = body as { version?: unknown; dist?: { tarball?: unknown; integrity?: unknown } } | null
  const tarball = meta?.dist?.tarball
  const integrity = meta?.dist?.integrity
  if (typeof meta?.version !== 'string' || typeof tarball !== 'string' || typeof integrity !== 'string' || !integrity.startsWith('sha512-')) {
    throw new EjectError(`${registry} answered for ${TEMPLATES_PACKAGE} without a version, a tarball and a sha512 integrity`, 1)
  }
  let res: Response
  try {
    res = await doFetch(tarball, { redirect: 'follow' })
  } catch (err) {
    throw new EjectError(`could not download ${tarball}: ${err instanceof Error ? err.message : String(err)}`, 1)
  }
  if (!res.ok) throw new EjectError(`${new URL(tarball).origin} answered HTTP ${res.status} for the ${TEMPLATES_PACKAGE} tarball`, 1)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) {
    throw new EjectError(`the ${TEMPLATES_PACKAGE}@${meta.version} tarball does not match the registry's integrity`, 1)
  }
  return { version: meta.version, files: untar(bytes) }
}

/** templates.json, checked for what eject reads of it. */
function templatesIndex(source: TemplatesSource): TemplatesIndex {
  const raw = source.files.get('templates.json')
  let index: Partial<TemplatesIndex> | null = null
  try {
    index = raw ? (JSON.parse(new TextDecoder().decode(raw)) as Partial<TemplatesIndex>) : null
  } catch {
    // falls through
  }
  if (!index || !Array.isArray(index.templates) || !index.versions || typeof index.versions !== 'object') {
    throw new EjectError(`${TEMPLATES_PACKAGE} ${source.version} has no readable templates.json`, 1)
  }
  return index as TemplatesIndex
}

/** The text with its // and /* *\/ comments and trailing commas taken out, strings kept as they are. */
function stripJsonc(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 1
    } else {
      out += ch
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/** The template's wrangler.jsonc for a project of its own: everything but `env`, which held BackGold's deploys of the template. */
function customerWrangler(text: string, key: string): string {
  let config: Record<string, unknown>
  try {
    config = JSON.parse(stripJsonc(text)) as Record<string, unknown>
  } catch {
    throw new EjectError(`the ${key} template's wrangler.jsonc does not parse`, 1)
  }
  delete config.env
  const header = [
    "// The Worker that serves the site on `wrangler dev` (npm run preview) and",
    "// on Cloudflare (npm run deploy). `backgold deploy` (npm run",
    "// deploy:backgold) uploads the build to BackGold hosting instead, reading",
    "// the build's own copy of this file. `backgold eject` wrote it from the",
    `// ${key} template's, without the \`env\` block of BackGold's template deploys.`,
    '// Secrets are never kept here: `npx wrangler secret put <NAME>` for',
    "// Cloudflare, `npx backgold secrets set <NAME>` for BackGold hosting.",
  ].join('\n')
  return `${header}\n${JSON.stringify(config, null, 2)}\n`
}

/** A package name from the project's directory name. */
function packageName(dir: string, key: string): string {
  const name = basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[-]+$/g, '')
  return name || `${key}-site`
}

/** package.json with its name and the exact @backgold/* versions of the publish. */
function customerPackage(text: string, dir: string, key: string, index: TemplatesIndex): string {
  const pkg = JSON.parse(text) as Record<string, unknown>
  pkg.name = packageName(dir, key)
  for (const field of ['dependencies', 'devDependencies']) {
    const deps = pkg[field] as Record<string, string> | undefined
    if (!deps) continue
    for (const [name, range] of Object.entries(deps)) {
      if (!range.startsWith('workspace:')) continue
      const version = index.versions[name]
      if (!version) throw new EjectError(`the ${key} template names ${name}@${range}, which the publish's templates.json gives no version for`, 1)
      deps[name] = version
    }
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}

/** The README with the eject section after its title. */
function customerReadme(text: string, section: string): string {
  const title = /^# .*\n/.exec(text)
  return title ? `${title[0]}\n${section}\n${text.slice(title[0].length).replace(/^\n+/, '')}` : `${section}\n${text}`
}

export interface Ejected {
  dir: string
  files: number
  stamp: { from: string; templates: string; kit: string; commit?: string; date: string }
}

/**
 * Writes the template `key` of `source` into `dir`, which must be missing or
 * empty: its files as published, then package.json pinned, wrangler.jsonc
 * without BackGold's template deploys, backgold.json with `api` and the
 * `ejected` stamp (and no site: `link` writes it), _gitignore as .gitignore,
 * and the README's eject section.
 */
export async function ejectTemplate(source: TemplatesSource, key: string, dir: string, api: string, today: string): Promise<Ejected> {
  const index = templatesIndex(source)
  const keys = index.templates.map((t) => t.key)
  if (!keys.includes(key)) {
    throw new EjectError(`there is no ${key} template in ${TEMPLATES_PACKAGE} ${source.version}; it has ${keys.join(', ') || 'none'}`, 2)
  }
  const existing = await readdir(dir).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return []
    throw new EjectError(`${dir} is not a directory eject can write into (${err.code ?? err.message})`, 2)
  })
  if (existing.length) throw new EjectError(`${dir} is not empty; eject writes only into a new or empty directory`, 2)

  const prefix = `templates/${key}/`
  const files = [...source.files].filter(([path]) => path.startsWith(prefix)).map(([path, bytes]) => [path.slice(prefix.length), bytes] as const)
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  const kit = index.versions['@backgold/template-kit']
  if (!kit) throw new EjectError(`${TEMPLATES_PACKAGE} ${source.version}'s templates.json names no @backgold/template-kit version`, 1)
  const stamp = { from: key, templates: source.version, kit, ...(index.commit ? { commit: index.commit } : {}), date: today }
  const section = [
    `## Ejected from the ${key} template`,
    '',
    `This site was ejected from the ${key} template on ${today}; pushes to BackGold's templates no longer change it.`,
    `It was made from ${TEMPLATES_PACKAGE} ${source.version} (@backgold/template-kit ${kit}${index.commit ? `, commit ${index.commit.slice(0, 12)}` : ''}),`,
    `and BackGold's live \`template-${key}\` Worker may be ahead of that publish until the next one.`,
    "`backgold.json`'s `ejected` records the same.",
    '',
  ].join('\n')

  if (!files.some(([path]) => path === 'package.json')) throw new EjectError(`the ${key} template in ${TEMPLATES_PACKAGE} ${source.version} has no package.json`, 1)
  const root = resolve(dir)
  let written = 0
  for (const [path, bytes] of files) {
    let out: string | Uint8Array = bytes
    let target = path
    if (path === 'package.json') out = customerPackage(decode(bytes), dir, key, index)
    else if (path === 'wrangler.jsonc') out = customerWrangler(decode(bytes), key)
    else if (path === 'README.md') out = customerReadme(decode(bytes), section)
    else if (path === 'backgold.json') continue
    else if (path === '_gitignore') target = '.gitignore'
    const full = resolve(root, target)
    if (!full.startsWith(root + sep)) throw new EjectError(`the ${key} template holds a path outside it: ${path}`, 1)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, out)
    written++
  }
  if (!files.some(([path]) => path === 'README.md')) {
    const name = index.templates.find((t) => t.key === key)?.name ?? key
    await writeFile(join(root, 'README.md'), `# ${name}\n\n${section}`, 'utf8')
    written++
  }
  await writeFile(join(root, 'backgold.json'), `${JSON.stringify({ site: '', api, ejected: stamp }, null, 2)}\n`, 'utf8')
  return { dir: root, files: written + 1, stamp }
}
