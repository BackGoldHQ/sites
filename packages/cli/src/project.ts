// backgold.json, the project's link to its BackGold site: `{ site, api }`.
// It holds nothing secret and is committed.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const PROJECT_FILE = 'backgold.json'
export const DEFAULT_API = 'https://api.backgold.com'

export interface ProjectFile {
  site?: string
  api?: string
  [key: string]: unknown
}

/** The parsed file, null when there is none; throws on a file that is not a JSON object. */
export async function readProjectFile(projectDir: string): Promise<ProjectFile | null> {
  let text: string
  try {
    text = await readFile(join(projectDir, PROJECT_FILE), 'utf8')
  } catch {
    return null
  }
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${PROJECT_FILE} is not a JSON object`)
  return parsed as ProjectFile
}

/** Writes `site` and `api`, keeping any other keys the file has. */
export async function writeProjectFile(projectDir: string, existing: ProjectFile | null, site: string, api: string): Promise<void> {
  const next = { ...(existing ?? {}), site, api }
  await writeFile(join(projectDir, PROJECT_FILE), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

/** The installed `@backgold/astro` version, looked up the way Node resolves packages from the project. */
export async function kitVersion(projectDir: string): Promise<string | null> {
  let dir = projectDir
  for (;;) {
    const version = await readFile(join(dir, 'node_modules', '@backgold', 'astro', 'package.json'), 'utf8')
      .then((text) => (JSON.parse(text) as { version?: unknown }).version)
      .catch(() => undefined)
    if (typeof version === 'string') return version
    const parent = join(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
}
