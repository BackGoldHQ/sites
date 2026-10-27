// Reads a built site: the Worker config the Cloudflare adapter wrote under
// dist/, the Worker's modules beside it and the static assets it names.
// Nothing here talks to the network.
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  SITE_DEPLOY_LIMITS as LIMITS,
  SITE_DEPLOY_VAR_NAME_PATTERN,
  isDeployModulePath,
  isReservedDeploySecretName,
} from '@backgold/contract/site-deploys'
import { formatBytes } from './bytes.js'
import { ignoreMatcher } from './ignore.js'

export type ModuleType = 'esm' | 'commonjs' | 'text' | 'data' | 'wasm'

export interface WorkerModule {
  /** The module's path relative to the Worker's directory, `/`-separated: its name in the upload. */
  name: string
  type: ModuleType
  bytes: number
  file: string
}

export interface Asset {
  /** sha256 of the bytes and the extension, first 32 hex. */
  hash: string
  size: number
  file: string
}

export interface AssetsConfig {
  headers?: string
  redirects?: string
}

export interface BuiltSite {
  /** The Worker config, relative to the project. */
  config: string
  mainModule: string
  compatibilityDate: string
  compatibilityFlags: string[]
  modules: WorkerModule[]
  modulesBytes: number
  /** Keyed by the asset's path under the assets directory, with a leading `/`. */
  assets: Map<string, Asset>
  assetsBytes: number
  /** The text of the assets directory's `_headers` and `_redirects`, which are not uploaded as files. */
  assetsConfig: AssetsConfig
  /** The config's `vars` the deployed Worker keeps as plain text. */
  vars: Record<string, string>
  /** What the build carries that BackGold hosting does not use. */
  warnings: string[]
}

/** Why a build cannot be deployed. `code` 2 is a limit the build is over. */
export class CollectError extends Error {
  constructor(
    message: string,
    readonly code: 1 | 2,
  ) {
    super(message)
  }
}

const toPosix = (path: string) => path.split(sep).join('/')

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}

/** Every file under `dir`, as absolute paths, in a stable order. */
async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await filesUnder(path)))
    else if (entry.isFile()) out.push(path)
  }
  return out
}

/** Every `wrangler.json` under `dir`, dot-directories and node_modules left out. */
async function configsUnder(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await configsUnder(path)))
    else if (entry.isFile() && entry.name === 'wrangler.json') out.push(path)
  }
  return out
}

/**
 * The Worker config the build wrote: the one wrangler's redirect file
 * (`.wrangler/deploy/config.json`) names when it points into dist/, else
 * the single `wrangler.json` under dist/.
 */
export async function findWorkerConfig(projectDir: string): Promise<string> {
  const dist = join(projectDir, 'dist')
  if (!(await exists(dist))) {
    throw new CollectError(`${dist} does not exist: build the site first (drop --no-build, or run your build)`, 1)
  }
  const redirect = join(projectDir, '.wrangler', 'deploy', 'config.json')
  const pointer = await readFile(redirect, 'utf8')
    .then((text) => JSON.parse(text) as { configPath?: unknown })
    .catch(() => null)
  if (typeof pointer?.configPath === 'string') {
    const target = resolve(dirname(redirect), pointer.configPath)
    if (isInside(dist, target) && (await exists(target))) return target
  }
  const found = await configsUnder(dist)
  if (found.length === 1) return found[0]!
  if (!found.length) {
    throw new CollectError(
      `no wrangler.json under ${dist}: the site must build with the Cloudflare adapter (@astrojs/cloudflare), which writes one beside the Worker`,
      1,
    )
  }
  throw new CollectError(`more than one wrangler.json under ${dist} (${found.map((f) => relative(projectDir, f)).join(', ')}); clean dist/ and build again`, 1)
}

function moduleType(name: string): ModuleType {
  switch (extname(name).toLowerCase()) {
    case '.mjs':
    case '.js':
      return 'esm'
    case '.cjs':
      return 'commonjs'
    case '.wasm':
      return 'wasm'
    case '.txt':
    case '.html':
      return 'text'
    default:
      return 'data'
  }
}

export async function hashAsset(file: string): Promise<Asset> {
  const bytes = await readFile(file)
  const hash = createHash('sha256').update(bytes).update(extname(file).slice(1)).digest('hex').slice(0, 32)
  return { hash, size: bytes.length, file }
}

interface WorkerConfig {
  main?: unknown
  compatibility_date?: unknown
  compatibility_flags?: unknown
  assets?: { directory?: unknown }
  vars?: unknown
  [key: string]: unknown
}

const BINDING_LISTS = [
  'kv_namespaces',
  'd1_databases',
  'r2_buckets',
  'queues.producers',
  'queues.consumers',
  'durable_objects.bindings',
  'services',
  'vectorize',
  'hyperdrive',
  'analytics_engine_datasets',
  'dispatch_namespaces',
  'workflows',
  'secrets_store_secrets',
  'mtls_certificates',
  'send_email',
  'routes',
  'triggers.crons',
] as const

/** BackGold hosting gives the Worker its own bindings; what the built config names beyond them is dropped. */
function droppedBindings(config: WorkerConfig): string[] {
  const dropped: string[] = []
  for (const path of BINDING_LISTS) {
    const value = path.split('.').reduce<unknown>((v, key) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined), config)
    if (!Array.isArray(value)) continue
    // The kit's BACKGOLD_CACHE KV goes without a warning: BackGold binds none,
    // and the kit then caches in the isolate's memory.
    const named = value.filter((b) => !(path === 'kv_namespaces' && (b as { binding?: unknown })?.binding === 'BACKGOLD_CACHE'))
    if (named.length) dropped.push(path)
  }
  for (const key of ['ai', 'browser', 'images', 'placement'] as const) {
    if (config[key] && typeof config[key] === 'object' && Object.keys(config[key] as object).length) dropped.push(key)
  }
  return dropped
}

/** The config's `vars` the Worker keeps: string values, reserved names left out with a warning. */
function workerVars(config: WorkerConfig, configName: string, warnings: string[]): Record<string, string> {
  const vars: Record<string, string> = {}
  const given = config.vars
  if (!given || typeof given !== 'object' || Array.isArray(given)) return vars
  const reserved: string[] = []
  const badName: string[] = []
  const notText: string[] = []
  for (const [name, value] of Object.entries(given)) {
    if (isReservedDeploySecretName(name)) reserved.push(name)
    else if (!SITE_DEPLOY_VAR_NAME_PATTERN.test(name)) badName.push(name)
    else if (typeof value !== 'string') notText.push(name)
    else {
      if (Buffer.byteLength(value, 'utf8') > LIMITS.VAR_MAX_BYTES) {
        throw new CollectError(`${configName}'s var ${name} is over the ${formatBytes(LIMITS.VAR_MAX_BYTES)} limit per value`, 2)
      }
      vars[name] = value
    }
  }
  if (Object.keys(vars).length > LIMITS.VARS_MAX) {
    throw new CollectError(`${configName} has ${Object.keys(vars).length} vars, over the limit of ${LIMITS.VARS_MAX}`, 2)
  }
  if (reserved.length) warnings.push(`${configName}'s vars ${reserved.join(', ')} are left out: BackGold sets BACKGOLD_*, ENVIRONMENT and ASSETS itself`)
  if (badName.length) {
    warnings.push(`${configName}'s vars ${badName.join(', ')} are left out: a var's name is letters, digits and _, not starting with a digit, at most 64`)
  }
  if (notText.length) warnings.push(`${configName}'s vars ${notText.join(', ')} are left out: only text values are kept`)
  return vars
}

/** The modules, assets and settings of the site built in `projectDir`, checked against BackGold's limits. */
export async function collectSite(projectDir: string): Promise<BuiltSite> {
  const configFile = await findWorkerConfig(projectDir)
  const workerDir = dirname(configFile)
  let config: WorkerConfig
  try {
    config = JSON.parse(await readFile(configFile, 'utf8')) as WorkerConfig
  } catch (err) {
    throw new CollectError(`could not read ${configFile}: ${err instanceof Error ? err.message : String(err)}`, 1)
  }
  const configName = toPosix(relative(projectDir, configFile))
  if (typeof config.main !== 'string' || !config.main) throw new CollectError(`${configName} names no main module`, 1)
  if (typeof config.compatibility_date !== 'string') throw new CollectError(`${configName} names no compatibility_date`, 1)
  const flags = Array.isArray(config.compatibility_flags) ? config.compatibility_flags.map(String) : []
  const allowed: readonly string[] = LIMITS.COMPAT_FLAGS_ALLOWED
  const refused = flags.filter((f) => !allowed.includes(f))
  if (refused.length) {
    throw new CollectError(
      `${configName} sets compatibility flag${refused.length === 1 ? '' : 's'} ${refused.join(', ')}; BackGold hosting allows only ${allowed.join(' and ')}`,
      2,
    )
  }

  const mainFile = resolve(workerDir, config.main)
  if (!isInside(workerDir, mainFile)) throw new CollectError(`${configName}'s main (${config.main}) is outside ${toPosix(relative(projectDir, workerDir))}/`, 1)
  const mainModule = toPosix(relative(workerDir, mainFile))

  const assetsDirSetting = config.assets?.directory
  const assetsDir = typeof assetsDirSetting === 'string' ? resolve(workerDir, assetsDirSetting) : null

  const modules: WorkerModule[] = []
  for (const file of await filesUnder(workerDir)) {
    const name = toPosix(relative(workerDir, file))
    // Source maps are not modules; a dot-path is local state (.dev.vars, .prerender/).
    if (name.endsWith('.map') || name.split('/').some((part) => part.startsWith('.'))) continue
    // The config is read here, never uploaded: it carries the builder's own paths.
    if (file === configFile) continue
    if (assetsDir && isInside(assetsDir, file)) continue
    modules.push({ name, type: moduleType(name), bytes: (await stat(file)).size, file })
  }
  if (!modules.some((m) => m.name === mainModule)) throw new CollectError(`${configName}'s main module ${mainModule} was not found`, 1)
  const misnamed = modules.find((m) => !isDeployModulePath(m.name))
  if (misnamed) {
    throw new CollectError(
      `the Worker module ${misnamed.name} has a name BackGold hosting cannot take: letters, digits and ._@+- in each path segment, at most 256 characters, and not manifest.json or metadata`,
      2,
    )
  }
  if (modules.length > LIMITS.MODULES_MAX) {
    throw new CollectError(`the Worker has ${modules.length} modules, over BackGold hosting's limit of ${LIMITS.MODULES_MAX}`, 2)
  }
  const modulesBytes = modules.reduce((n, m) => n + m.bytes, 0)
  if (modulesBytes > LIMITS.BUNDLE_MAX_BYTES) {
    throw new CollectError(
      `the Worker's modules come to ${formatBytes(modulesBytes)}, over BackGold hosting's ${formatBytes(LIMITS.BUNDLE_MAX_BYTES)} Worker limit`,
      2,
    )
  }

  const warnings: string[] = []
  const dropped = droppedBindings(config)
  if (dropped.length) {
    warnings.push(`${configName} names ${dropped.join(', ')}; BackGold hosting gives the Worker its own bindings and leaves these out`)
  }
  const vars = workerVars(config, configName, warnings)

  const assets = new Map<string, Asset>()
  let assetsBytes = 0
  const assetsConfig: AssetsConfig = {}
  if (assetsDir && (await exists(assetsDir))) {
    const ignoreFile = await readFile(join(assetsDir, '.assetsignore'), 'utf8').catch(() => '')
    // wrangler's own rules: these three are never uploaded as files; _headers
    // and _redirects travel as text in the manifest's assets_config.
    const ignored = ignoreMatcher(['/.assetsignore', '/_headers', '/_redirects', ...ignoreFile.split('\n')])
    for (const [file, key] of [
      ['_headers', 'headers'],
      ['_redirects', 'redirects'],
    ] as const) {
      const text = await readFile(join(assetsDir, file)).catch(() => null)
      if (text === null) continue
      if (text.length > LIMITS.ASSETS_CONFIG_MAX_BYTES) {
        throw new CollectError(
          `${toPosix(relative(projectDir, join(assetsDir, file)))} is ${formatBytes(text.length)}, over the ${formatBytes(LIMITS.ASSETS_CONFIG_MAX_BYTES)} limit`,
          2,
        )
      }
      assetsConfig[key] = text.toString('utf8')
    }
    for (const file of await filesUnder(assetsDir)) {
      if (isInside(workerDir, file)) continue
      const path = toPosix(relative(assetsDir, file))
      if (ignored(path)) continue
      if (path.length + 1 > LIMITS.ASSET_PATH_MAX_CHARS) {
        throw new CollectError(`the asset /${path.slice(0, 80)}… has a path over BackGold hosting's ${LIMITS.ASSET_PATH_MAX_CHARS}-character limit`, 2)
      }
      const asset = await hashAsset(file)
      if (asset.size > LIMITS.ASSET_FILE_MAX_BYTES) {
        throw new CollectError(`the asset /${path} is ${formatBytes(asset.size)}, over the ${formatBytes(LIMITS.ASSET_FILE_MAX_BYTES)} limit per file`, 2)
      }
      assets.set(`/${path}`, asset)
      assetsBytes += asset.size
      if (assets.size > LIMITS.ASSET_FILES_MAX) {
        throw new CollectError(`the site has more than ${LIMITS.ASSET_FILES_MAX.toLocaleString('en-US')} asset files, BackGold hosting's limit`, 2)
      }
    }
    if (assetsBytes > LIMITS.ASSETS_MAX_BYTES) {
      throw new CollectError(`the assets come to ${formatBytes(assetsBytes)}, over the ${formatBytes(LIMITS.ASSETS_MAX_BYTES)} limit per deploy`, 2)
    }
  }

  return {
    config: configName,
    mainModule,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: flags,
    modules,
    modulesBytes,
    assets,
    assetsBytes,
    assetsConfig,
    vars,
    warnings,
  }
}
