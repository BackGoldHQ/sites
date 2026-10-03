// `backgold-content` — the command bin/backgold-content.js runs. One command,
// `types`: fetch `GET /api/content/v1/types` with a site key and write the
// `generateTypes` augmentation to a file. Node only; never part of the
// `index` bundle.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { ContentTypeSummary } from '@givegold/shared/content-api'
import { generateTypes } from './codegen.js'

const DEFAULT_API_ORIGIN = 'https://api.backgold.com'
const SITE_KEY_PREFIXES = ['bg_site_pk_', 'bg_site_sk_']

export const USAGE = `Usage: backgold-content types --out <file> [--key <site key>] [--api-origin <origin>] [--module <name>]

Writes TypeScript types for your site's content types, read from
GET /api/content/v1/types, so entry(type, slug) returns typed fields.

  --out <file>           The .ts file to write (its folder is created)
  --key <site key>       bg_site_pk_... or bg_site_sk_... (default: $BACKGOLD_SITE_KEY)
  --api-origin <origin>  Default ${DEFAULT_API_ORIGIN}
  --module <name>        The module the file augments (default: @backgold/content)
`

export interface CliIo {
  fetch: typeof fetch
  env: Record<string, string | undefined>
  /** Write `text` to `path`, creating its folder. */
  writeFile(path: string, text: string): Promise<void>
}

export interface CliResult {
  code: number
  stdout: string
  stderr: string
}

const FLAGS = { '--out': 'out', '--key': 'key', '--api-origin': 'apiOrigin', '--module': 'moduleName' } as const
type FlagName = (typeof FLAGS)[keyof typeof FLAGS]

async function writeCreatingFolder(path: string, text: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(path, text, 'utf8')
}

function usage(problem: string): CliResult {
  return { code: 2, stdout: '', stderr: `backgold-content: ${problem}\n\n${USAGE}` }
}

function failure(message: string): CliResult {
  return { code: 1, stdout: '', stderr: `backgold-content: ${message}\n` }
}

/** `--name value` and `--name=value` pairs after the command; a string is the usage problem. */
function parseFlags(args: readonly string[]): Partial<Record<FlagName, string>> | string {
  const flags: Partial<Record<FlagName, string>> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    const eq = arg.indexOf('=')
    const name = eq > 0 ? arg.slice(0, eq) : arg
    if (!Object.hasOwn(FLAGS, name)) return `unknown argument ${arg}`
    const value = eq > 0 ? arg.slice(eq + 1) : args[++i]
    if (value === undefined || value === '' || (eq < 0 && value.startsWith('--'))) return `${name} needs a value`
    flags[FLAGS[name as keyof typeof FLAGS]] = value
  }
  return flags
}

function isTypeList(body: unknown): body is { types: ContentTypeSummary[] } {
  return typeof body === 'object' && body !== null && Array.isArray((body as { types?: unknown }).types)
}

/** The api's `{ error, code }` (or just the status) for a non-2xx answer. */
async function apiFailure(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown } | null
  const error = typeof body?.error === 'string' ? body.error : null
  const code = typeof body?.code === 'string' ? body.code : null
  if (error && code) return `${error} (${code}, HTTP ${res.status})`
  if (error || code) return `${error ?? code} (HTTP ${res.status})`
  return `the api answered HTTP ${res.status}`
}

/** The CLI without the process: exit code and output, with fetch, env and the file writer injectable. */
export async function run(argv: readonly string[], io: Partial<CliIo> = {}): Promise<CliResult> {
  const doFetch = io.fetch ?? globalThis.fetch
  const env = io.env ?? process.env
  const write = io.writeFile ?? writeCreatingFolder

  const [command, ...rest] = argv
  if (command === '--help' || command === '-h' || command === 'help') return { code: 0, stdout: USAGE, stderr: '' }
  if (command === undefined) return usage('missing command')
  if (command !== 'types') return usage(`unknown command ${command}`)
  if (rest.includes('--help') || rest.includes('-h')) return { code: 0, stdout: USAGE, stderr: '' }

  const flags = parseFlags(rest)
  if (typeof flags === 'string') return usage(flags)
  if (!flags.out) return usage('--out is required')
  const key = flags.key ?? env.BACKGOLD_SITE_KEY
  if (!key) return usage('a site key is required: --key or BACKGOLD_SITE_KEY')
  if (!SITE_KEY_PREFIXES.some((p) => key.startsWith(p))) return usage('the key must be a site key (bg_site_pk_... or bg_site_sk_...)')

  let origin: string
  try {
    const url = new URL(flags.apiOrigin ?? DEFAULT_API_ORIGIN)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return usage('--api-origin must be an http(s) URL')
    origin = url.origin
  } catch {
    return usage('--api-origin must be an http(s) URL')
  }

  const url = `${origin}/api/content/v1/types`
  let res: Response
  try {
    res = await doFetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } })
  } catch (err) {
    return failure(`could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) return failure(await apiFailure(res))
  const body = (await res.json().catch(() => null)) as unknown
  if (!isTypeList(body)) return failure(`${url} did not answer with { types: [...] }`)

  const text = generateTypes(body.types, flags.moduleName ? { moduleName: flags.moduleName } : {})
  try {
    await write(flags.out, text)
  } catch (err) {
    return failure(`could not write ${flags.out}: ${err instanceof Error ? err.message : String(err)}`)
  }
  const n = body.types.length
  return { code: 0, stdout: `Wrote ${n} ${n === 1 ? 'type' : 'types'} to ${flags.out}\n`, stderr: '' }
}

function writeOut(stream: NodeJS.WriteStream, text: string): Promise<void> {
  if (!text) return Promise.resolve()
  return new Promise((done) => stream.write(text, () => done()))
}

/** Run the CLI and exit the process with its code. */
export async function main(argv: string[]): Promise<void> {
  const result = await run(argv)
  await writeOut(process.stdout, result.stdout)
  await writeOut(process.stderr, result.stderr)
  process.exit(result.code)
}
