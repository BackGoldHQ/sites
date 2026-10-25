// The api's SITE_DEPLOY_LIMITS and name rules (packages/shared/src/site-deploys.ts
// in the platform repository), checked here first so a build the api would
// refuse stops before anything is uploaded. The api checks them again.
export const LIMITS = {
  /** The Worker's modules, unzipped, and the zip of them, each. */
  BUNDLE_MAX_BYTES: 10 * 1024 * 1024,
  MODULES_MAX: 500,
  ASSET_FILES_MAX: 20_000,
  ASSET_FILE_MAX_BYTES: 25 * 1024 * 1024,
  ASSETS_MAX_BYTES: 250 * 1024 * 1024,
  /** One static asset's path, in characters. */
  ASSET_PATH_MAX_CHARS: 1024,
  /** Each of _headers and _redirects. */
  ASSETS_CONFIG_MAX_BYTES: 64 * 1024,
  VARS_MAX: 64,
  VAR_MAX_BYTES: 5 * 1024,
  SECRET_MAX_BYTES: 5 * 1024,
  /** template.json, as JSON. */
  TEMPLATE_MANIFEST_MAX_BYTES: 256 * 1024,
  COMPAT_FLAGS_ALLOWED: ['nodejs_compat', 'global_fetch_strictly_public'],
} as const

/** A var's name, as the Worker reads it from `env`. */
export const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

/** A secret's name: upper case, starting with a letter. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/

/** The names BackGold binds on every deploy besides its BACKGOLD_* ones. */
const INJECTED = ['ENVIRONMENT', 'ASSETS']

/** Names BackGold sets on every deploy; a secret or a var may not take one. */
export function reservedVarName(name: string): boolean {
  return name.startsWith('BACKGOLD_') || INJECTED.includes(name)
}

export const RESERVED_SECRET_MESSAGE = 'BACKGOLD_* names, ENVIRONMENT and ASSETS are reserved: BackGold sets them on every deploy'

/**
 * A module name the api takes: `/`-separated segments of letters, digits and
 * `._@+-`, none `.` or `..`, at most 256 characters, and neither
 * `manifest.json` (the bundle's own copy of the manifest) nor `metadata` in
 * any case (the script upload's metadata part).
 */
export function deployModulePath(name: string): boolean {
  if (name.length === 0 || name.length > 256 || name === 'manifest.json' || name.toLowerCase() === 'metadata') return false
  return name.split('/').every((segment) => /^[A-Za-z0-9._@+-]+$/.test(segment) && segment !== '.' && segment !== '..')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
