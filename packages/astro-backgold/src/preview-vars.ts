import { readFile, writeFile } from 'node:fs/promises'

/**
 * The vars a Cloudflare preview deployment (a pull request's or a branch's
 * address) needs to show the site. A preview reads only the `previews` block
 * of the Worker's config, never the top-level `vars`, so without these every
 * preview shows the setup page. `SITE_URL` is left out: a preview's canonical
 * origin is the address it is opened on.
 */
const PREVIEW_VARS = ['BACKGOLD_SITE_KEY', 'BACKGOLD_API_ORIGIN'] as const

interface WorkerConfig {
  vars?: Record<string, unknown>
  previews?: { vars?: Record<string, unknown>; [key: string]: unknown }
  [key: string]: unknown
}

const filled = (value: unknown) => typeof value === 'string' && value.trim() !== ''

/** `config` with each missing preview var copied from the top-level `vars`; null when nothing changes. */
export function withPreviewVars(config: WorkerConfig): WorkerConfig | null {
  const previewVars = { ...config.previews?.vars }
  let changed = false
  for (const name of PREVIEW_VARS) {
    if (filled(previewVars[name]) || !filled(config.vars?.[name])) continue
    previewVars[name] = config.vars![name]
    changed = true
  }
  return changed ? { ...config, previews: { ...config.previews, vars: previewVars } } : null
}

/** Applies `withPreviewVars` to the Worker config the Cloudflare adapter wrote for the build, when there is one. */
export async function fillPreviewVars(configFile: URL): Promise<void> {
  let raw: string
  try {
    raw = await readFile(configFile, 'utf8')
  } catch {
    return
  }
  const next = withPreviewVars(JSON.parse(raw) as WorkerConfig)
  if (next) await writeFile(configFile, JSON.stringify(next))
}
