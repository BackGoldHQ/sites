// The api's SITE_DEPLOY_LIMITS (packages/shared/src/site-deploys.ts in the
// platform repository), checked here first so an oversize build stops
// before anything is uploaded. The api checks them again.
export const LIMITS = {
  MODULES_MAX_BYTES: 10 * 1024 * 1024,
  ASSET_FILES_MAX: 20_000,
  ASSET_FILE_MAX_BYTES: 25 * 1024 * 1024,
  ASSETS_MAX_BYTES: 250 * 1024 * 1024,
  /** Each of _headers and _redirects. */
  ASSETS_CONFIG_MAX_BYTES: 64 * 1024,
  VARS_MAX: 64,
  VAR_MAX_BYTES: 5 * 1024,
  COMPAT_FLAGS_ALLOWED: ['nodejs_compat', 'global_fetch_strictly_public'],
} as const

/** Names BackGold sets on every deploy; a secret or a var may not take one. */
export function reservedVarName(name: string): boolean {
  return name.startsWith('BACKGOLD_') || name === 'ENVIRONMENT'
}

export const RESERVED_SECRET_MESSAGE = 'BACKGOLD_* names and ENVIRONMENT are reserved: BackGold sets them on every deploy'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
