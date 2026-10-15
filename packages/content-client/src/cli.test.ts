import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { typesExample } from '@backgold/contract/content-api-examples'
import { run, USAGE } from './cli.js'
import { generateTypes } from './codegen.js'

const KEY = 'bg_site_pk_test123'

interface Call {
  url: string
  headers: Record<string, string>
}

/** A fetch that answers every request with `status` and `body`, recording what it was asked. */
function fakeFetch(status: number, body: unknown): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { fetch: fn as typeof fetch, calls }
}

const noFetch = (async () => {
  throw new Error('fetch must not be called')
}) as typeof fetch

const noWrite = async () => {
  throw new Error('nothing may be written')
}

async function usageCase(argv: string[], env: Record<string, string> = {}, problem: RegExp) {
  const r = await run(argv, { fetch: noFetch, env, writeFile: noWrite })
  assert.equal(r.code, 2, `exit code for ${argv.join(' ')}`)
  assert.equal(r.stdout, '')
  assert.match(r.stderr, problem)
  assert.ok(r.stderr.endsWith(USAGE), 'usage follows the problem')
}

test('cli: usage errors exit 2 without fetching or writing', async () => {
  await usageCase([], {}, /missing command/)
  await usageCase(['typez', '--out', 'x.ts'], { BACKGOLD_SITE_KEY: KEY }, /unknown command typez/)
  await usageCase(['types'], { BACKGOLD_SITE_KEY: KEY }, /--out is required/)
  await usageCase(['types', '--out', 'x.ts'], {}, /site key is required/)
  await usageCase(['types', '--out', 'x.ts', '--verbose'], { BACKGOLD_SITE_KEY: KEY }, /unknown argument --verbose/)
  await usageCase(['types', '--out', 'x.ts', 'extra'], { BACKGOLD_SITE_KEY: KEY }, /unknown argument extra/)
  await usageCase(['types', '--out'], { BACKGOLD_SITE_KEY: KEY }, /--out needs a value/)
  await usageCase(['types', '--out', '--key', KEY], {}, /--out needs a value/)
  await usageCase(['types', '--out', 'x.ts', '--key', 'bg_live_abc'], {}, /must be a site key/)
  await usageCase(['types', '--out', 'x.ts', '--key', KEY, '--api-origin', 'ftp://x'], {}, /--api-origin/)
  await usageCase(['types', '--out', 'x.ts', '--key', KEY, '--api-origin', 'not a url'], {}, /--api-origin/)
})

test('cli: --help prints usage on stdout and exits 0', async () => {
  const r = await run(['--help'], { fetch: noFetch, env: {}, writeFile: noWrite })
  assert.deepEqual(r, { code: 0, stdout: USAGE, stderr: '' })
})

test("cli: a 401 prints the api's error and code and exits 1", async () => {
  const { fetch, calls } = fakeFetch(401, { error: 'Invalid site key', code: 'INVALID_SITE_KEY' })
  const r = await run(['types', '--out', 'x.ts', '--key', KEY], { fetch, env: {}, writeFile: noWrite })
  assert.equal(r.code, 1)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, 'backgold-content: Invalid site key (INVALID_SITE_KEY, HTTP 401)\n')
  assert.equal(calls.length, 1)
})

test('cli: a non-JSON failure prints the status', async () => {
  const { fetch } = fakeFetch(502, '<html>bad gateway</html>')
  const r = await run(['types', '--out', 'x.ts', '--key', KEY], { fetch, env: {}, writeFile: noWrite })
  assert.equal(r.code, 1)
  assert.equal(r.stderr, 'backgold-content: the api answered HTTP 502\n')
})

test('cli: a network error exits 1 with the message', async () => {
  const offline = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch
  const r = await run(['types', '--out', 'x.ts', '--key', KEY], { fetch: offline, env: {}, writeFile: noWrite })
  assert.equal(r.code, 1)
  assert.equal(r.stderr, 'backgold-content: could not reach https://api.backgold.com/api/content/v1/types: fetch failed\n')
})

test('cli: a 200 that is not a type list exits 1', async () => {
  const { fetch } = fakeFetch(200, { page: {} })
  const r = await run(['types', '--out', 'x.ts', '--key', KEY], { fetch, env: {}, writeFile: noWrite })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /did not answer with \{ types: \[\.\.\.\] \}/)
})

test('cli: success writes the file (creating its folder) and prints the count', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'backgold-content-cli-'))
  try {
    const out = join(dir, 'nested', 'deeper', 'backgold-types.ts')
    const { fetch, calls } = fakeFetch(200, typesExample)
    const r = await run(['types', `--out=${out}`, '--api-origin', 'https://api.example.test/', '--module', 'my-content'], {
      fetch,
      env: { BACKGOLD_SITE_KEY: KEY },
    })
    assert.deepEqual(r, { code: 0, stdout: `Wrote 1 type to ${out}\n`, stderr: '' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.url, 'https://api.example.test/api/content/v1/types')
    assert.equal(calls[0]!.headers.authorization, `Bearer ${KEY}`)
    assert.equal(calls[0]!.headers.accept, 'application/json')
    assert.equal(await readFile(out, 'utf8'), generateTypes(typesExample.types, { moduleName: 'my-content' }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('cli: --key wins over BACKGOLD_SITE_KEY and the count is plural', async () => {
  const written: string[] = []
  const { fetch, calls } = fakeFetch(200, { types: [...typesExample.types, ...typesExample.types] })
  const r = await run(['types', '--out', 'out.ts', '--key', 'bg_site_sk_flag'], {
    fetch,
    env: { BACKGOLD_SITE_KEY: KEY },
    writeFile: async (path) => void written.push(path),
  })
  assert.deepEqual(r, { code: 0, stdout: 'Wrote 2 types to out.ts\n', stderr: '' })
  assert.deepEqual(written, ['out.ts'])
  assert.equal(calls[0]!.headers.authorization, 'Bearer bg_site_sk_flag')
})

test('cli: no message ever prints a site key', async () => {
  const SECRET = 'bg_site_sk_SECRET123'
  const cases: Array<[string[], Record<string, string>]> = [
    [['types', '--out', 'x.ts', SECRET], {}],
    [[SECRET, '--out', 'x.ts'], {}],
    [['types', '--out', 'x.ts', `${SECRET}=1`], {}],
    [['types', '--out', 'x.ts', '--key', `${SECRET}\n`], {}],
    [['types', '--out', 'x.ts', '--key', 'bg_site_sk_SECRET-123'], {}],
    [['types', '--out', 'x.ts'], { BACKGOLD_SITE_KEY: 'bg_site_sk_SECRET 123' }],
  ]
  for (const [argv, env] of cases) {
    const r = await run(argv, { fetch: noFetch, env, writeFile: noWrite })
    assert.equal(r.code, 2, argv.join(' '))
    assert.ok(!r.stderr.includes('SECRET'), `${argv.join(' ')} → ${r.stderr.split('\n')[0]}`)
  }
  const { fetch } = fakeFetch(200, typesExample)
  const failed = await run(['types', '--out', `/nowhere/${SECRET}.ts`, '--key', KEY], {
    fetch,
    env: {},
    writeFile: async (path) => {
      throw new Error(`EACCES: ${path}`)
    },
  })
  assert.equal(failed.code, 1)
  assert.ok(!failed.stderr.includes('SECRET'), failed.stderr)
})

test('cli: never follows a redirect and keeps a path in --api-origin', async () => {
  const inits: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    inits.push({ url: String(input), init })
    return Response.json(typesExample)
  }) as typeof globalThis.fetch
  const r = await run(['types', '--out', 'x.ts', '--api-origin', 'https://proxy.example.test/base/'], {
    fetch,
    env: { BACKGOLD_SITE_KEY: KEY },
    writeFile: async () => undefined,
  })
  assert.equal(r.code, 0)
  assert.equal(inits[0]!.url, 'https://proxy.example.test/base/api/content/v1/types')
  assert.equal(inits[0]!.init?.redirect, 'manual')
})

test('cli: a /types answer that is not the contract shape exits 1 with a message', async () => {
  const field = { key: 'quote', label: 'Quote', kind: 'long_text', required: true }
  const bad: unknown[] = [
    { types: [null] },
    { types: [{ key: 7, fields: [] }] },
    { types: [{ key: 'x' }] },
    { types: [{ key: 'x', fields: [{ ...field, key: 1 }] }] },
    { types: [{ key: 'x', fields: [{ ...field, label: null }] }] },
    { types: [{ key: 'x', fields: [{ ...field, kind: undefined }] }] },
    { types: [{ key: 'x', fields: [{ ...field, required: 'yes' }] }] },
    { types: [{ key: 'x', fields: [{ ...field, choices: 'Gold' }] }] },
    { types: [{ key: 'x', fields: [{ ...field, choices: ['Gold', 2] }] }] },
  ]
  for (const body of bad) {
    const { fetch } = fakeFetch(200, body)
    const r = await run(['types', '--out', 'x.ts', '--key', KEY], { fetch, env: {}, writeFile: noWrite })
    assert.equal(r.code, 1, JSON.stringify(body))
    assert.match(r.stderr, /^backgold-content: https:\/\/api\.backgold\.com\/api\/content\/v1\/types (did not answer|answered)/)
    assert.ok(!r.stderr.includes('    at '), 'no stack trace')
  }
})

test('cli: --generated-at reaches the header, and only as YYYY-MM-DD', async () => {
  let text = ''
  const { fetch } = fakeFetch(200, typesExample)
  const r = await run(['types', '--out', 'x.ts', '--key', KEY, '--generated-at', '2026-01-02'], {
    fetch,
    env: {},
    writeFile: async (_path, t) => void (text = t),
  })
  assert.equal(r.code, 0)
  assert.equal(text, generateTypes(typesExample.types, { generatedAt: '2026-01-02' }))
  await usageCase(['types', '--out', 'x.ts', '--key', KEY, '--generated-at', 'today'], {}, /--generated-at must be a date/)
})
