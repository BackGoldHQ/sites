import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { gzipSync, strFromU8, unzipSync } from 'fflate'
import { USAGE, run } from './cli.js'
import { collectSite } from './collect.js'
import type { Io } from './io.js'
import { COMPLETION_JWT, FIXTURE_SITE, SESSION_JWT, SITE, TOKEN, makeDeploy, startFixture, type Fixture } from './testing/fixture-api.js'

let fx: Fixture
let project: string
const dirs: string[] = []

before(async () => {
  fx = await startFixture()
})
after(async () => {
  await fx.close()
  for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

/** A fresh copy of the fixture site, linked to the fixture api, with @backgold/astro "installed". */
beforeEach(async () => {
  Object.assign(fx, {
    deploys: [],
    live: null,
    known: new Set(),
    bucketSize: 2,
    bundleMaxBytes: 10 * 1024 * 1024,
    entitled: true,
    siteMode: 'hosted',
    outcome: { status: 'ready' },
    pollsBeforeSettled: 1,
    log: [],
    createBodies: [],
    finishBodies: [],
    uploadAuth: [],
    meDomain: 'fixture.example.org',
    servedOn: 'https://fixture.example.org',
    previewHost: null,
    refuse: null,
  })
  fx.aliases.clear()
  fx.secrets.clear()
  fx.bundles.clear()
  fx.uploaded.clear()
  fx.dropOnce.clear()
  project = await mkdtemp(join(tmpdir(), 'backgold-cli-test-'))
  dirs.push(project)
  await cp(FIXTURE_SITE, project, { recursive: true })
  await writeFile(join(project, 'backgold.json'), JSON.stringify({ site: SITE, api: fx.origin }))
  await mkdir(join(project, 'node_modules/@backgold/astro'), { recursive: true })
  await writeFile(join(project, 'node_modules/@backgold/astro/package.json'), JSON.stringify({ name: '@backgold/astro', version: '0.9.1' }))
})

interface Result {
  code: number
  stdout: string
  stderr: string
  builds: { command: string; cwd: string; env: Record<string, string | undefined> }[]
  prompts: string[]
}

async function cli(argv: string[], io: Partial<Io> & { buildCode?: number } = {}): Promise<Result> {
  const out: Result = { code: -1, stdout: '', stderr: '', builds: [], prompts: [] }
  let clock = 0
  const { buildCode, ...rest } = io
  out.code = await run(argv, {
    fetch: globalThis.fetch,
    env: { BACKGOLD_DEPLOY_TOKEN: TOKEN },
    cwd: project,
    stdout: (t) => (out.stdout += t),
    stderr: (t) => (out.stderr += t),
    interactive: false,
    promptSecret: async (q) => {
      out.prompts.push(q)
      throw new Error('no prompt expected')
    },
    readStdin: async () => {
      throw new Error('no stdin expected')
    },
    run: async (command, cwd, env) => {
      out.builds.push({ command, cwd, env })
      return buildCode ?? 0
    },
    git: async (args) => (args.includes('--abbrev-ref') ? 'feature/hero' : 'abcdef1234567890abcdef1234567890abcdef12'),
    sleep: async () => {},
    now: () => (clock += 1000),
    randomId: () => 'run-key-1',
    ...rest,
  })
  assert.ok(!out.stdout.includes(TOKEN) && !out.stderr.includes(TOKEN), 'the token is never printed')
  return out
}

const sitePath = (rest = '') => `/api/orgs/domains/${SITE}/deploys${rest}`

// ── Usage and exit codes ────────────────────────────────────────────────────

test('usage: --help prints the usage on stdout; a command --help prints its own', async () => {
  const r = await cli(['--help'])
  assert.deepEqual([r.code, r.stdout, r.stderr], [0, USAGE, ''])
  const d = await cli(['deploy', '--help'])
  assert.equal(d.code, 0)
  assert.match(d.stdout, /^Usage: backgold deploy \[--promote\]/)
  assert.match(d.stdout, /--build-command <cmd>/)
  assert.match(d.stdout, /--token <token>/, 'the global options follow')
})

test('usage: every usage problem exits 2 without a request', async () => {
  const cases: [string[], RegExp][] = [
    [[], /missing command/],
    [['deplyo'], /unknown command deplyo/],
    [['deploy', '--prod'], /unknown flag --prod/],
    [['deploy', '--promote=yes'], /--promote takes no value/],
    [['deploy', '--preview'], /--preview needs a value/],
    [['deploy', 'extra'], /unexpected argument extra/],
    [['deploy', '--no-build', '--build-command', 'make'], /--no-build and --build-command do not go together/],
    [['deploys', '--api', 'http://api.example.org'], /--api must be an https origin/],
    [['deploys', '--api', 'https://api.example.org/v1'], /--api must be an https origin/],
    [['promote'], /promote needs a deploy id/],
    [['promote', 'a', 'b'], /unexpected argument b/],
    [['secrets'], /secrets needs list, set or delete/],
    [['secrets', 'rotate'], /unknown secrets command rotate/],
    [['secrets', 'set'], /secrets set needs a NAME/],
    [['secrets', 'set', 'BACKGOLD_SITE_KEY'], /BACKGOLD_\* names, ENVIRONMENT and ASSETS are reserved: BackGold sets them on every deploy/],
    [['secrets', 'delete', 'ENVIRONMENT'], /reserved/],
    [['secrets', 'set', 'ASSETS'], /reserved/],
    [['secrets', 'set', 'widget_id'], /a secret name is upper-case letters, digits and _, starting with a letter/],
    [['secrets', 'set', '9LIVES'], /letters, digits and _/],
  ]
  for (const [argv, problem] of cases) {
    const r = await cli(argv)
    assert.equal(r.code, 2, `exit code for ${argv.join(' ')}: ${r.stderr}`)
    assert.equal(r.stdout, '')
    assert.match(r.stderr, problem, argv.join(' '))
  }
  assert.deepEqual(fx.log, [])
})

test('usage: no backgold.json, or one with no site, is a usage error naming link', async () => {
  await rm(join(project, 'backgold.json'))
  const r = await cli(['deploys'])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /no backgold\.json in .*: run backgold link first/)
  await writeFile(join(project, 'backgold.json'), JSON.stringify({ site: '', api: fx.origin }))
  assert.match((await cli(['deploys'])).stderr, /names no site: run backgold link/)
  assert.deepEqual(fx.log, [])
})

test('auth: no token, a malformed one, or a refused one exits 3', async () => {
  const none = await cli(['deploys'], { env: {} })
  assert.equal(none.code, 3)
  assert.match(none.stderr, /no deploy token: set BACKGOLD_DEPLOY_TOKEN/)
  const bad = await cli(['deploys', '--token', 'bg_site_sk_abc'])
  assert.equal(bad.code, 3)
  assert.match(bad.stderr, /must be a deploy token/)
  assert.deepEqual(fx.log, [])
  const refused = await cli(['deploys', '--token', 'bg_deploy_wrongwrongwrong'])
  assert.equal(refused.code, 3)
  assert.match(refused.stderr, /Invalid or expired deploy token \(INVALID_TOKEN, HTTP 401\)/)
  assert.match(refused.stderr, /The deploy token was refused/)
  assert.ok(!refused.stderr.includes('wrongwrongwrong'), 'a token in a message is redacted')
})

test('auth: a 403 blames the token only for a token code; any other prints the api\'s own refusal, exit 3 either way', async () => {
  const hint = /The deploy token was refused/
  fx.refuse = { status: 403, body: { error: 'This deploy token lacks the promote scope.', code: 'SCOPE' } }
  const scope = await cli(['deploys'])
  assert.equal(scope.code, 3)
  assert.match(scope.stderr, /This deploy token lacks the promote scope\. \(SCOPE, HTTP 403\)/)
  assert.match(scope.stderr, hint)
  fx.refuse = { status: 403, body: { error: 'Writes from this origin are refused', code: 'CSRF' } }
  const own = await cli(['deploys'])
  assert.equal(own.code, 3)
  assert.equal(own.stderr, 'backgold: Writes from this origin are refused (CSRF, HTTP 403)\n')
  fx.refuse = { status: 403 }
  const bare = await cli(['deploys'])
  assert.equal(bare.code, 3)
  assert.equal(bare.stderr, 'backgold: the api refused this request (HTTP 403)\n')
})

test('api: every write says application/json, so a bodyless DELETE is never read as a form post', async () => {
  history()
  fx.secrets.set('WIDGET_ID', { value: 'w', updated_at: '2026-10-23T10:00:00Z' })
  let types: (string | null)[] = []
  const recording: typeof fetch = (input, init) => {
    if (init?.method && init.method !== 'GET') types.push(new Headers(init.headers).get('content-type'))
    return globalThis.fetch(input, init)
  }
  const preview = await cli(['previews', '--delete', 'main'], { fetch: recording })
  assert.equal(preview.code, 0, preview.stderr)
  const secret = await cli(['secrets', 'delete', 'WIDGET_ID'], { fetch: recording })
  assert.equal(secret.code, 0, secret.stderr)
  assert.deepEqual(types, ['application/json', 'application/json'])
  types = []
  const raw = await fetch(`${fx.origin}${sitePath('/previews/none')}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } })
  assert.equal(raw.status, 403, 'the fixture refuses a bodyless DELETE without one, as the api\'s csrf() does')
})

test('auth: an organization without custom sites exits 3 with a plain sentence, on deploy and on promote', async () => {
  fx.entitled = false
  const d = await cli(['deploy', '--no-build'])
  assert.equal(d.code, 3)
  assert.equal(d.stderr.split('\n').filter((l) => l.startsWith('backgold:')).join('\n'), 'backgold: this organization does not have custom sites on BackGold yet, so it cannot deploy or promote a site.')
  assert.ok(!d.stderr.includes('token was refused'))
  assert.ok(!fx.log.some((l) => l.endsWith('/bundle')), 'nothing is uploaded')
  history()
  const p = await cli(['promote', 'dddd5555'])
  assert.equal(p.code, 3)
  assert.match(p.stderr, /this organization does not have custom sites on BackGold yet/)
  assert.equal(fx.live, 'cccc4444000000000000000000000004')
})

test('deploy: a headless site is refused with the api\'s sentence and exit 1', async () => {
  fx.siteMode = 'headless'
  const r = await cli(['deploy', '--no-build'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /This site is built elsewhere and takes no deploy \(SITE_MODE, HTTP 409\)/)
  assert.ok(!fx.log.some((l) => l.endsWith('/bundle')))
})

test('api: an unreachable api exits 1 after one retry', async () => {
  const r = await cli(['deploys', '--api', 'http://127.0.0.1:1'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /could not reach http:\/\/127\.0\.0\.1:1/)
})

// ── link and whoami ─────────────────────────────────────────────────────────

test('link: checks the token and writes backgold.json, keeping other keys', async () => {
  await writeFile(join(project, 'backgold.json'), JSON.stringify({ note: 'kept' }))
  const r = await cli(['link', '--api', fx.origin])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout, 'Linked to Fixture Party (fixture.example.org)\n')
  assert.match(r.stderr, /Checking the deploy token with http:\/\/127\.0\.0\.1/)
  assert.deepEqual(JSON.parse(await readFile(join(project, 'backgold.json'), 'utf8')), { note: 'kept', site: SITE, api: fx.origin })
  assert.deepEqual(fx.log, ['GET /api/site-deploys/me'])
})

test('link and whoami: a _draft-<id> placeholder domain from an older api reads as none', async () => {
  fx.meDomain = '_draft-0123abcd'
  const l = await cli(['link'])
  assert.equal(l.stdout, 'Linked to Fixture Party\n')
  const w = await cli(['whoami'])
  assert.match(w.stdout, /^Fixture Party\nsite /)
  assert.equal(JSON.parse((await cli(['whoami', '--json'])).stdout).domain, null)
})

test('link: on a terminal with no token it asks for one; --json prints the answer', async () => {
  await rm(join(project, 'backgold.json'))
  const prompts: string[] = []
  const r = await cli(['link', '--api', fx.origin, '--json'], {
    env: {},
    interactive: true,
    promptSecret: async (q) => {
      prompts.push(q)
      return `${TOKEN}\n`
    },
  })
  assert.equal(r.code, 0, r.stderr)
  assert.equal(prompts.length, 1)
  assert.match(prompts[0]!, /Deploy token/)
  assert.equal(JSON.parse(r.stdout).site_id, SITE)
  assert.match(r.stderr, /keep the token in BACKGOLD_DEPLOY_TOKEN/)
  const written = await readFile(join(project, 'backgold.json'), 'utf8')
  assert.ok(!written.includes('bg_deploy_'), 'the token is never written')
})

test('whoami: the site, scopes and api; warns when backgold.json names another site', async () => {
  const r = await cli(['whoami'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout, `Fixture Party (fixture.example.org)\nsite    ${SITE}\nscopes  deploy, promote\napi     ${fx.origin}\n`)
  await writeFile(join(project, 'backgold.json'), JSON.stringify({ site: 'other', api: fx.origin }))
  assert.match((await cli(['whoami'])).stderr, /names site other, and this token opens site/)
})

test('any command: the token going anywhere but api.backgold.com is said first; a local api is not', async () => {
  const seen: string[] = []
  const elsewhere: typeof fetch = async (input) => {
    seen.push(String(input))
    return new Response(JSON.stringify({ data: { org_id: 'org', site_id: SITE, site_name: 'Elsewhere', domain: null, scopes: [], api_origin: 'https://elsewhere.example' } }), { headers: { 'Content-Type': 'application/json' } })
  }
  await writeFile(join(project, 'backgold.json'), JSON.stringify({ site: SITE, api: 'https://elsewhere.example' }))
  const file = await cli(['whoami'], { fetch: elsewhere })
  assert.equal(file.code, 0, file.stderr)
  assert.match(file.stderr, /^warning: the deploy token goes to https:\/\/elsewhere\.example \(backgold\.json's "api"\), not https:\/\/api\.backgold\.com\n/)
  assert.deepEqual(seen, ['https://elsewhere.example/api/site-deploys/me'])
  const flag = await cli(['whoami', '--api', 'https://elsewhere.example'], { fetch: elsewhere })
  assert.match(flag.stderr, /goes to https:\/\/elsewhere\.example \(--api\)/)
  await writeFile(join(project, 'backgold.json'), JSON.stringify({ site: SITE, api: fx.origin }))
  const local = await cli(['whoami'])
  assert.equal(local.code, 0, local.stderr)
  assert.ok(!local.stderr.includes('warning'), `a local api says nothing: ${local.stderr}`)
})

// ── deploy ──────────────────────────────────────────────────────────────────

test('deploy: builds, uploads the missing assets, the bundle, finishes and waits until ready and live', async () => {
  const site = await collectSite(project)
  const known = site.assets.get('/robots.txt')!.hash
  fx.known.add(known)
  const r = await cli(['deploy', '--promote', '--preview', 'feature-hero'])
  assert.equal(r.code, 0, r.stderr)
  const id = fx.deploys[0]!.id

  assert.deepEqual(r.builds.map((b) => [b.command, b.cwd]), [['npm run build', project]])
  assert.equal(r.builds[0]!.env.BACKGOLD_DEPLOY_TOKEN, undefined, 'the build never sees the token')

  assert.equal(fx.createBodies.length, 1)
  const body = fx.createBodies[0]! as { idempotency_key: string; source: string; manifest: Record<string, unknown>; assets: Record<string, unknown> }
  assert.equal(body.idempotency_key, 'run-key-1')
  assert.equal(body.source, 'cli')
  assert.deepEqual(body.manifest, {
    main_module: 'entry.mjs',
    compatibility_date: '2026-10-04',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    modules: site.modules.map((m) => ({ name: m.name, type: m.type, bytes: m.bytes })),
    kit_version: '0.9.1',
    git_ref: 'feature/hero',
    git_sha: 'abcdef1234567890abcdef1234567890abcdef12',
    template_manifest: JSON.parse(await readFile(join(FIXTURE_SITE, 'template.json'), 'utf8')),
    assets_config: site.assetsConfig,
    vars: { SITE_URL: 'https://fixture.example.org' },
  })
  assert.deepEqual(body.assets, Object.fromEntries([...site.assets].map(([path, a]) => [path, { hash: a.hash, size: a.size }])))

  // Three missing assets in buckets of two: two uploads with the session token.
  assert.deepEqual(fx.uploadAuth, [`Bearer ${SESSION_JWT}`, `Bearer ${SESSION_JWT}`])
  assert.ok(!fx.uploaded.has(known), 'an asset Cloudflare has is not uploaded')
  for (const asset of site.assets.values()) {
    if (asset.hash === known) continue
    assert.deepEqual(fx.uploaded.get(asset.hash)?.bytes, await readFile(asset.file))
  }

  const zip = unzipSync(new Uint8Array(fx.bundles.get(id)!))
  assert.deepEqual(Object.keys(zip).sort(), [...site.modules.map((m) => m.name), 'manifest.json'].sort())
  assert.deepEqual(JSON.parse(strFromU8(zip['manifest.json']!)), body.manifest)

  assert.deepEqual(fx.finishBodies, [{ assets_jwt: COMPLETION_JWT, promote: true, preview: 'feature-hero' }])
  assert.equal(fx.live, id)
  assert.equal(r.stdout, `Deploy ${id} is live at https://fixture.example.org.\nPreview feature-hero points at ${id}; previews have no address on this BackGold yet.\n`)
  assert.match(r.stderr, /Building: npm run build/)
  assert.match(r.stderr, /Found the Worker in dist\/server \(6 modules, .*\) and 4 assets/)
  assert.match(r.stderr, /warning: dist\/server\/wrangler\.json's vars BACKGOLD_SITE_KEY are left out/)
  assert.match(r.stderr, /Uploading 3 of 4 assets in 2 batches/)
  assert.match(r.stderr, /Uploaded the Worker bundle/)
  assert.ok(fx.log.indexOf(`PUT ${sitePath(`/${id}/bundle`)}`) < fx.log.indexOf(`POST ${sitePath(`/${id}/finish`)}`))
})

test('deploy: with every asset uploaded already, the session token completes it; --no-build skips the build', async () => {
  for (const a of (await collectSite(project)).assets.values()) fx.known.add(a.hash)
  const r = await cli(['deploy', '--no-build'], { env: { BACKGOLD_DEPLOY_TOKEN: TOKEN, CI: 'true' } })
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(r.builds, [])
  assert.deepEqual(fx.uploadAuth, [])
  assert.deepEqual(fx.finishBodies, [{ assets_jwt: SESSION_JWT, promote: false }])
  assert.equal((fx.createBodies[0] as { source: string }).source, 'ci')
  const id = fx.deploys[0]!.id
  assert.equal(r.stdout, `Deploy ${id} is ready. It is not live: backgold promote ${id.slice(0, 8)} makes it live.\n`)
  assert.equal(fx.live, null)
  assert.match(r.stderr, /Every asset is already uploaded/)
})

test('deploy: --build-command runs instead of npm run build; a failed build sends nothing', async () => {
  const r = await cli(['deploy', '--build-command', 'make site'], { buildCode: 3 })
  assert.equal(r.code, 1)
  assert.deepEqual(r.builds.map((b) => b.command), ['make site'])
  assert.match(r.stderr, /the build failed \(make site exited with 3\)/)
  assert.deepEqual(fx.log, [])
})

test('deploy: a failed deploy exits 1 with the error verbatim; --json still prints it', async () => {
  fx.outcome = { status: 'failed', error: 'Uncaught SyntaxError: Unexpected token at entry.mjs:1' }
  const r = await cli(['deploy', '--no-build', '--json'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /deploy dep\d{29} failed:\nUncaught SyntaxError: Unexpected token at entry\.mjs:1\n$/)
  assert.equal(JSON.parse(r.stdout).status, 'failed')
})

test('deploy: --json prints the ready deploy', async () => {
  const r = await cli(['deploy', '--no-build', '--json'])
  assert.equal(r.code, 0, r.stderr)
  const data = JSON.parse(r.stdout) as { id: string; status: string }
  assert.equal(data.status, 'ready')
  assert.equal(data.id, fx.deploys[0]!.id)
})

test('deploy: polls every 2 s and gives up after 10 minutes', async () => {
  fx.pollsBeforeSettled = 1_000_000
  const sleeps: number[] = []
  let clock = 0
  const r = await cli(['deploy', '--no-build'], {
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    now: () => (clock += 30_000),
  })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /was still deploying after 10 minutes/)
  assert.ok(sleeps.length > 5 && sleeps.every((ms) => ms === 2000))
})

test('deploy: a dropped connection is retried once with the same idempotency key', async () => {
  fx.dropOnce.add(`POST ${sitePath()}`)
  const r = await cli(['deploy', '--no-build'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(fx.log.filter((l) => l === `POST ${sitePath()}`).length, 2)
  assert.equal(fx.deploys.length, 1)
  assert.deepEqual(fx.createBodies.map((b) => b.idempotency_key), ['run-key-1'])
})

test('deploy: a bundle over the api\'s max_bytes is refused with exit 2 before it is sent', async () => {
  fx.bundleMaxBytes = 100
  const r = await cli(['deploy', '--no-build'])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /the Worker bundle is .* zipped, over BackGold hosting's 100 B limit/)
  assert.ok(!fx.log.some((l) => l.endsWith('/bundle')))
})

test('deploy: a limit the build is over exits 2 before the api is called', async () => {
  const config = join(project, 'dist/server/wrangler.json')
  const parsed = JSON.parse(await readFile(config, 'utf8')) as Record<string, unknown>
  await writeFile(config, JSON.stringify({ ...parsed, compatibility_flags: ['nodejs_als'] }))
  const r = await cli(['deploy', '--no-build'])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /allows only nodejs_compat and global_fetch_strictly_public/)
  assert.deepEqual(fx.log, [])
})

// ── deploys, promote, rollback ─────────────────────────────────────────────

function history() {
  fx.deploys = [
    makeDeploy('aaaa1111000000000000000000000001', { created_at: '2026-10-20T10:00:00.000Z', git_sha: '1111111aaaa' }),
    makeDeploy('bbbb2222000000000000000000000002', { created_at: '2026-10-21T10:00:00.000Z', status: 'failed', error: 'boom' }),
    makeDeploy('bbbb3333000000000000000000000003', { created_at: '2026-10-22T10:00:00.000Z', created_by: { user_id: 'u1', token_id: null, name: 'Pat Doe' } }),
    makeDeploy('cccc4444000000000000000000000004', { created_at: '2026-10-23T09:00:00.000Z' }),
    makeDeploy('dddd5555000000000000000000000005', { created_at: '2026-10-23T10:00:00.000Z' }),
  ]
  fx.live = 'cccc4444000000000000000000000004'
  fx.aliases.set('main', { deploy_id: 'dddd5555000000000000000000000005', updated_at: '2026-10-23T10:00:00.000Z' })
}

test('deploys: a table of the kept deploys, the live one marked', async () => {
  history()
  const r = await cli(['deploys'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(
    r.stdout,
    [
      'ID        STATUS  LIVE  ALIASES  CREATED           BY        COMMIT',
      'dddd5555  ready         main     2026-10-23 10:00  CI token',
      'cccc4444  ready   live           2026-10-23 09:00  CI token',
      'bbbb3333  ready                  2026-10-22 10:00  Pat Doe',
      'bbbb2222  failed                 2026-10-21 10:00  CI token',
      'aaaa1111  ready                  2026-10-20 10:00  CI token  1111111',
      '',
    ].join('\n'),
  )
  const json = JSON.parse((await cli(['deploys', '--json'])).stdout) as { live_deploy_id: string }
  assert.equal(json.live_deploy_id, 'cccc4444000000000000000000000004')
  fx.deploys = []
  assert.equal((await cli(['deploys'])).stdout, 'No deploys yet.\n')
})

test('promote: by a unique prefix; an ambiguous one is a usage error; a refusal exits 1 once', async () => {
  history()
  const r = await cli(['promote', 'dddd'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout, 'Deploy dddd5555000000000000000000000005 is live at https://fixture.example.org.\n')
  assert.equal(fx.live, 'dddd5555000000000000000000000005')
  const noDomain = "is live, but this site has no domain yet, so nobody can reach it. Connect one on the site's Domain page in BackGold.\n"
  fx.servedOn = null
  assert.equal((await cli(['promote', 'cccc'])).stdout, `Deploy cccc4444000000000000000000000004 ${noDomain}`)
  fx.servedOn = undefined
  assert.equal((await cli(['promote', 'dddd'])).stdout, `Deploy dddd5555000000000000000000000005 ${noDomain}`, 'an older api without served_on reads as no domain')
  const ambiguous = await cli(['promote', 'bbbb'])
  assert.equal(ambiguous.code, 2)
  assert.match(ambiguous.stderr, /bbbb matches 2 deploys/)
  fx.log = []
  const notReady = await cli(['promote', 'bbbb2222'])
  assert.equal(notReady.code, 1)
  assert.match(notReady.stderr, /The deploy is not ready \(DEPLOY_NOT_READY, HTTP 409\)/)
  assert.equal(fx.log.filter((l) => l.endsWith('/promote')).length, 1, 'a 4xx is never retried')
})

test('rollback: the newest ready deploy older than the live one, skipping failed and newer ones', async () => {
  history()
  fx.live = 'dddd5555000000000000000000000005'
  fx.deploys.find((d) => d.id.startsWith('cccc'))!.status = 'failed'
  const r = await cli(['rollback'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout, 'Rolled back from deploy dddd5555.\nDeploy bbbb3333000000000000000000000003 is live at https://fixture.example.org.\n')
  assert.equal(fx.live, 'bbbb3333000000000000000000000003')
  const given = await cli(['rollback', 'aaaa1111'])
  assert.equal(given.code, 0, given.stderr)
  assert.equal(fx.live, 'aaaa1111000000000000000000000001')
})

test('rollback: refuses when nothing is older, or nothing is live', async () => {
  history()
  fx.live = 'aaaa1111000000000000000000000001'
  const oldest = await cli(['rollback'])
  assert.equal(oldest.code, 1)
  assert.match(oldest.stderr, /no ready deploy older than the live one \(aaaa1111\) to roll back to/)
  fx.live = null
  const none = await cli(['rollback'])
  assert.equal(none.code, 1)
  assert.match(none.stderr, /nothing is live on this site/)
  assert.ok(!fx.log.some((l) => l.endsWith('/promote')))
})

// ── previews and secrets ────────────────────────────────────────────────────

test('previews: lists the names; --delete removes one', async () => {
  history()
  const r = await cli(['previews'])
  assert.equal(r.stdout, 'Preview main points at dddd5555000000000000000000000005; previews have no address on this BackGold yet.\n')
  fx.previewHost = 'preview.example.org'
  assert.equal((await cli(['previews'])).stdout, 'Preview main: https://main.preview.example.org\n')
  const d = await cli(['previews', '--delete', 'main'])
  assert.equal(d.code, 0, d.stderr)
  assert.equal(d.stdout, 'Deleted the preview main.\n')
  assert.equal(fx.aliases.size, 0)
  assert.equal((await cli(['previews'])).stdout, 'No previews.\n')
  assert.equal((await cli(['previews', '--delete', 'main'])).code, 1)
})

test('secrets: set from stdin (one trailing newline dropped), from a hidden prompt, list and delete', async () => {
  const piped = await cli(['secrets', 'set', 'WIDGET_ID'], { readStdin: async () => 'w-123\n' })
  assert.equal(piped.code, 0, piped.stderr)
  assert.equal(piped.stdout, 'Set WIDGET_ID. A live site gets it on its next deploy.\n')
  assert.equal(fx.secrets.get('WIDGET_ID')?.value, 'w-123')

  const prompts: string[] = []
  const typed = await cli(['secrets', 'set', 'API_SECRET'], {
    interactive: true,
    promptSecret: async (q) => {
      prompts.push(q)
      return 'typed value'
    },
  })
  assert.equal(typed.code, 0, typed.stderr)
  assert.deepEqual(prompts, ['Value for API_SECRET (not shown): '])
  assert.ok(!typed.stdout.includes('typed value') && !typed.stderr.includes('typed value'), 'the value is never printed')
  assert.equal(fx.secrets.get('API_SECRET')?.value, 'typed value')

  const list = await cli(['secrets', 'list'])
  assert.match(list.stdout, /^NAME {8}UPDATED\nWIDGET_ID {3}\d{4}-\d{2}-\d{2} \d{2}:\d{2}\nAPI_SECRET {2}\d{4}/)
  assert.ok(!list.stdout.includes('w-123'))

  const del = await cli(['secrets', 'delete', 'WIDGET_ID'])
  assert.equal(del.code, 0, del.stderr)
  assert.equal(fx.secrets.has('WIDGET_ID'), false)
  const empty = await cli(['secrets', 'set', 'EMPTY'], { readStdin: async () => '\n' })
  assert.equal(empty.code, 2)
  assert.match(empty.stderr, /no value for EMPTY/)
})

// ── template.json ───────────────────────────────────────────────────────────

test('deploy: a template.json the manifest schema refuses exits 2 with the schema\'s problems and sends nothing', async () => {
  const manifest = JSON.parse(await readFile(join(project, 'template.json'), 'utf8')) as Record<string, unknown>
  await writeFile(join(project, 'template.json'), JSON.stringify({ ...manifest, version: 0, chrome: { header: [], footer: ['compact'], takeoverBanner: false, legalLine: true } }))
  const r = await cli(['deploy', '--no-build'])
  assert.equal(r.code, 2, r.stderr)
  assert.match(r.stderr, /template\.json is not a template manifest BackGold can read:\nversion: .*\nchrome\.header: /)
  assert.deepEqual(fx.createBodies, [])
})

test('deploy: a template.json with any audience, or none, is uploaded as written', async () => {
  const manifest = JSON.parse(await readFile(join(project, 'template.json'), 'utf8')) as Record<string, unknown>
  await writeFile(join(project, 'template.json'), JSON.stringify({ ...manifest, audience: 'hidden' }))
  const r = await cli(['deploy', '--no-build'])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual((fx.createBodies[0] as { manifest: { template_manifest: unknown } }).manifest.template_manifest, { ...manifest, audience: 'hidden' })
})

// ── eject ───────────────────────────────────────────────────────────────────

/** packages/cli/test-fixtures/templates: an unpacked @backgold/templates 9.9.9 with the templates `fixture` and `other`. */
const FIXTURE_TEMPLATES = resolve(FIXTURE_SITE, '../templates')

/** Every file under `dir`, by `/`-separated path. */
async function tree(dir: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(join(d, e.name))
      else out.push(relative(dir, join(d, e.name)).split(sep).join('/'))
    }
  }
  await walk(dir)
  return out.sort()
}

/** The fixture templates as npm packs them: a gzipped ustar with every path under package/. */
async function fixtureTarball(): Promise<Uint8Array> {
  const blocks: Uint8Array[] = []
  for (const path of await tree(FIXTURE_TEMPLATES)) {
    const body = await readFile(join(FIXTURE_TEMPLATES, path))
    const header = new Uint8Array(512)
    const put = (text: string, at: number) => header.set(new TextEncoder().encode(text), at)
    put(`package/${path}`, 0)
    put('0000644\0', 100)
    put(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    put('00000000000\0', 136)
    put('        ', 148)
    put('0', 156)
    put('ustar\x0000', 257)
    const sum = header.reduce((n, b) => n + b, 0)
    put(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, body, new Uint8Array((512 - (body.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const tar = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const b of blocks) {
    tar.set(b, at)
    at += b.length
  }
  return gzipSync(tar)
}

test('eject: writes the template from --source into a new directory, pinned and stamped, and prints link as a next step without a token', async () => {
  const r = await cli(['eject', '--from', 'fixture', 'my-site', '--source', FIXTURE_TEMPLATES], { env: {}, now: () => Date.parse('2026-10-25T12:00:00Z') })
  assert.equal(r.code, 0, r.stderr)
  const dir = join(project, 'my-site')
  assert.deepEqual(await tree(dir), ['.gitignore', 'README.md', 'backgold.json', 'package.json', 'src/template.ts', 'template.json', 'wrangler.jsonc'])
  assert.equal(await readFile(join(dir, 'template.json'), 'utf8'), await readFile(join(FIXTURE_TEMPLATES, 'templates/fixture/template.json'), 'utf8'), 'template.json travels as published')
  assert.equal(await readFile(join(dir, '.gitignore'), 'utf8'), 'dist/\nnode_modules/\n')
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'my-site')
  assert.deepEqual(pkg.dependencies, { '@backgold/astro': '0.8.2', '@backgold/content': '0.8.0', '@backgold/template-kit': '0.7.1', astro: '^7.3.5' })
  assert.deepEqual(pkg.devDependencies, { '@backgold/cli': '0.3.0', wrangler: '^4.149.0' })
  assert.deepEqual(pkg.scripts, { dev: 'astro dev', build: 'astro build', 'deploy:backgold': 'backgold deploy --promote', check: 'astro check' }, 'no wrangler deploy or wrangler dev script')
  assert.equal('cloudflare' in pkg, false, 'no Deploy to Cloudflare bindings')
  const wrangler = await readFile(join(dir, 'wrangler.jsonc'), 'utf8')
  assert.match(wrangler, /^\/\/ The Worker that serves the site on `npm run dev` and on BackGold hosting/)
  assert.ok(!/npm run (deploy|preview)(?![:\w])|wrangler secret/.test(wrangler), 'the header points at no self-hosting')
  const config = JSON.parse(wrangler.replace(/^\/\/.*\n/gm, ''))
  assert.deepEqual(config, {
    name: 'backgold-fixture',
    main: '@astrojs/cloudflare/entrypoints/server',
    compatibility_date: '2026-10-04',
    vars: { SITE_URL: '' },
    kv_namespaces: [{ binding: 'BACKGOLD_CACHE' }],
  })
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'backgold.json'), 'utf8')), {
    site: '',
    api: 'https://api.backgold.com',
    ejected: { from: 'fixture', templates: '9.9.9', kit: '0.7.1', commit: '0123456789abcdef0123456789abcdef01234567', date: '2026-10-25' },
  })
  const readme = await readFile(join(dir, 'README.md'), 'utf8')
  assert.match(readme, /^# The fixture template\n\n## Ejected from the fixture template\n\nThis site was ejected from the fixture template on 2026-10-25; pushes to BackGold's templates no longer change it\.\n/)
  assert.match(readme, /@backgold\/templates 9\.9\.9 \(@backgold\/template-kit 0\.7\.1, commit 0123456789ab\)/)
  assert.match(readme, /live `template-fixture` Worker may be ahead of that publish until the next one/)
  assert.match(readme, /It deploys to BackGold hosting with `npm run deploy:backgold`\./)
  assert.match(readme, /\nHow to run it\.\n$/)
  assert.equal(r.stdout, 'Next:\n  cd my-site\n  npm install\n  npx backgold link\n  npx backgold deploy --promote\n')
  assert.match(r.stderr, /Wrote the fixture template into my-site \(7 files; @backgold\/templates 9\.9\.9, @backgold\/template-kit 0\.7\.1\)/)
  assert.deepEqual(fx.log, [], 'no token, no request')
})

test('eject: with a token it runs link in the new directory, keeping the stamp; the default directory is ./<key>-site', async () => {
  const r = await cli(['eject', '--from', 'fixture', '--source', FIXTURE_TEMPLATES, '--api', fx.origin])
  assert.equal(r.code, 0, r.stderr)
  const file = JSON.parse(await readFile(join(project, 'fixture-site', 'backgold.json'), 'utf8'))
  assert.equal(file.site, SITE)
  assert.equal(file.api, fx.origin)
  assert.equal(file.ejected.from, 'fixture')
  assert.deepEqual(fx.log, ['GET /api/site-deploys/me'])
  assert.equal(r.stdout, 'Linked to Fixture Party (fixture.example.org)\nNext:\n  cd fixture-site\n  npm install\n  npx backgold deploy --promote\n')
})

test('eject: refuses a non-empty directory, an unknown key and a missing --from with exit 2', async () => {
  await mkdir(join(project, 'taken'))
  await writeFile(join(project, 'taken', 'notes.txt'), 'mine')
  const taken = await cli(['eject', '--from', 'fixture', 'taken', '--source', FIXTURE_TEMPLATES], { env: {} })
  assert.equal(taken.code, 2)
  assert.match(taken.stderr, /taken is not empty; eject writes only into a new or empty directory/)
  assert.deepEqual(await readdir(join(project, 'taken')), ['notes.txt'])
  const unknown = await cli(['eject', '--from', 'party', '--source', FIXTURE_TEMPLATES], { env: {} })
  assert.equal(unknown.code, 2)
  assert.match(unknown.stderr, /there is no party template in @backgold\/templates 9\.9\.9; it has fixture, other/)
  const missing = await cli(['eject', 'somewhere'], { env: {} })
  assert.equal(missing.code, 2)
  assert.match(missing.stderr, /eject needs --from <key>/)
})

test('eject: fetches the newest @backgold/templates from the registry and checks its integrity', async () => {
  const tarball = await fixtureTarball()
  let integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
  const paths: string[] = []
  const registry = createServer((req, res) => {
    paths.push(req.url ?? '')
    const origin = `http://127.0.0.1:${(registry.address() as AddressInfo).port}`
    if (req.url === '/@backgold%2ftemplates/latest') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ name: '@backgold/templates', version: '9.9.9', dist: { tarball: `${origin}/t.tgz`, integrity } }))
    }
    if (req.url === '/t.tgz') return res.end(tarball)
    res.writeHead(404).end()
  })
  await new Promise<void>((done) => registry.listen(0, '127.0.0.1', done))
  try {
    const env = { npm_config_registry: `http://127.0.0.1:${(registry.address() as AddressInfo).port}/` }
    const r = await cli(['eject', '--from', 'fixture', 'from-npm'], { env })
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(paths, ['/@backgold%2ftemplates/latest', '/t.tgz'])
    assert.deepEqual(await tree(join(project, 'from-npm')), ['.gitignore', 'README.md', 'backgold.json', 'package.json', 'src/template.ts', 'template.json', 'wrangler.jsonc'])
    assert.equal(JSON.parse(await readFile(join(project, 'from-npm', 'backgold.json'), 'utf8')).ejected.templates, '9.9.9')

    integrity = `sha512-${createHash('sha512').update('something else').digest('base64')}`
    const bad = await cli(['eject', '--from', 'fixture', 'tampered'], { env })
    assert.equal(bad.code, 1)
    assert.match(bad.stderr, /the @backgold\/templates@9\.9\.9 tarball does not match the registry's integrity/)
    assert.equal(await readdir(join(project, 'tampered')).catch(() => null), null, 'nothing is written')
  } finally {
    await new Promise((done) => registry.close(done))
  }
})
