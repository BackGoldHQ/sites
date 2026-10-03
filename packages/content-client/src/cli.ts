// `backgold-content` — the command bin/backgold-content.js runs. One command,
// `types`: fetch `GET /api/content/v1/types` with a site key and write the
// `generateTypes` augmentation to a file. Node only; never part of the
// `index` bundle. No message it prints ever carries a site key.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { ContentTypeSummary } from '@givegold/shared/content-api'
import { generateTypes } from './codegen.js'
import { DEFAULT_API_ORIGIN, SITE_KEY_PATTERN, contentApiBase } from './request.js'

export const USAGE = `Usage: backgold-content types --out <file> [--key <site key>] [--api-origin <origin>] [--module <name>] [--generated-at <YYYY-MM-DD>]

Writes TypeScript types for your site's content types, read from
GET /api/content/v1/types, so entry(type, slug) returns typed fields.

  --out <file>                The .ts file to write (its folder is created)
  --key <site key>            bg_site_pk_... or bg_site_sk_... (default: $BACKGOLD_SITE_KEY;
                              prefer the variable: argv is visible to other processes)
  --api-origin <origin>       Default ${DEFAULT_API_ORIGIN}; a path is kept
  --module <name>             The module the file augments (default: @backgold/content)
  --generated-at <YYYY-MM-DD> The date in the header (default: today); the same types
                              and the same date give the same bytes
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

const FLAGS = {
  '--out': 'out',
  '--key': 'key',
  '--api-origin': 'apiOrigin',
  '--module': 'moduleName',
  '--generated-at': 'generatedAt',
} as const
type FlagName = (typeof FLAGS)[keyof typeof FLAGS]

/** Anything shaped like a site key, in any message the CLI prints. */
const KEY_LIKE = /bg_site_(?:pk|sk)_\S*/g
const redact = (text: string) => text.replace(KEY_LIKE, 'bg_site_…')

async function writeCreatingFolder(path: string, text: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true })
  await writeFile(path, text, 'utf8')
}

function usage(problem: string): CliResult {
  return { code: 2, stdout: '', stderr: `backgold-content: ${redact(problem)}\n\n${USAGE}` }
}

function failure(message: string): CliResult {
  return { code: 1, stdout: '', stderr: `backgold-content: ${redact(message)}\n` }
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Why one field of `/types` is not the contract's shape; null when it is. */
function badField(field: unknown): string | null {
  if (!isRecord(field)) return 'is not an object'
  for (const name of ['key', 'label', 'kind'] as const) {
    if (typeof field[name] !== 'string') return `has no string ${name}`
  }
  if (typeof field.required !== 'boolean') return 'has no boolean required'
  const choices = field.choices
  if (choices !== undefined && !(Array.isArray(choices) && choices.every((c) => typeof c === 'string'))) {
    return 'has choices that are not a list of strings'
  }
  return null
}

/** The type list when `body` is `{ types: [...] }` in the contract's shape, else the reason it is not. */
function typeList(body: unknown): ContentTypeSummary[] | string {
  if (!isRecord(body) || !Array.isArray(body.types)) return 'did not answer with { types: [...] }'
  for (const [i, type] of body.types.entries()) {
    if (!isRecord(type) || typeof type.key !== 'string') return `answered a type (#${i + 1}) with no string key`
    if (!Array.isArray(type.fields)) return `answered type ${JSON.stringify(type.key)} with no fields list`
    for (const [j, field] of type.fields.entries()) {
      const problem = badField(field)
      if (problem) return `answered type ${JSON.stringify(type.key)} with a field (#${j + 1}) that ${problem}`
    }
  }
  return body.types as ContentTypeSummary[]
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
  if (!SITE_KEY_PATTERN.test(key)) {
    return usage('the key must be a site key: bg_site_pk_... or bg_site_sk_... followed by letters and digits')
  }
  if (flags.generatedAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(flags.generatedAt)) {
    return usage('--generated-at must be a date as YYYY-MM-DD')
  }

  let base: string
  try {
    base = contentApiBase(flags.apiOrigin ?? DEFAULT_API_ORIGIN).base
  } catch {
    return usage('--api-origin must be an http(s) URL with no query or fragment')
  }

  const url = `${base}/types`
  let res: Response
  try {
    // A redirect is never followed: the key goes to the api origin and nowhere else.
    res = await doFetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, redirect: 'manual' })
  } catch (err) {
    return failure(`could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) return failure(await apiFailure(res))
  const types = typeList(await res.json().catch(() => null))
  if (typeof types === 'string') return failure(`${url} ${types}`)

  const text = generateTypes(types, {
    ...(flags.moduleName ? { moduleName: flags.moduleName } : {}),
    ...(flags.generatedAt ? { generatedAt: flags.generatedAt } : {}),
  })
  try {
    await write(flags.out, text)
  } catch (err) {
    return failure(`could not write ${flags.out}: ${err instanceof Error ? err.message : String(err)}`)
  }
  const n = types.length
  return { code: 0, stdout: redact(`Wrote ${n} ${n === 1 ? 'type' : 'types'} to ${flags.out}\n`), stderr: '' }
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
