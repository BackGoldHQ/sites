// `backgold` — the command bin/backgold.js runs: deploys a site built on
// @backgold/astro to BackGold hosting and manages its deploys, previews and
// secrets through the api's deploy routes; `eject` writes a project of the
// customer's own from a BackGold template (eject.ts). Each step prints a
// short line to stderr; the answer goes to stdout (`--json`: the api's `data`). No message
// it prints ever carries the deploy token.
//
// Exit codes: 0 done, 1 failed, 2 usage (or a limit the build is over),
// 3 no token, a refused one, or an organization without custom sites.
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { HttpError, apiCall, checkOrigin, redact, request } from './api.js'
import { parseArgs, type FlagKind, type Parsed } from './args.js'
import { bucketForm, bundleZip, completionJwt } from './bundle.js'
import { CollectError, collectSite, type Asset } from './collect.js'
import { EjectError, TEMPLATES_PACKAGE, ejectTemplate, localSource, registrySource } from './eject.js'
import { nodeIo, type Io } from './io.js'
import { templateManifestProblems } from './manifest.js'
import { LIMITS, RESERVED_SECRET_MESSAGE, SECRET_NAME, formatBytes, reservedVarName } from './limits.js'
import { DEFAULT_API, PROJECT_FILE, kitVersion, readProjectFile, writeProjectFile, type ProjectFile } from './project.js'

const GLOBAL_HELP = `Options for every command:
  --project <dir>   The site's directory (default: the current one)
  --api <origin>    The BackGold api (default: backgold.json's "api", else ${DEFAULT_API})
  --token <token>   A deploy token (default: $BACKGOLD_DEPLOY_TOKEN; prefer the variable:
                    a command line is visible to other processes)
  --json            Print the api's answer as JSON on stdout
`

export const USAGE = `Usage: backgold <command> [options]

Deploys an Astro site built on @backgold/astro to BackGold hosting.

Commands:
  eject --from <key> [dir]  Make a project of your own from a BackGold template
  link                      Check a deploy token and write backgold.json for its site
  whoami                    Show the site and scopes the deploy token opens
  deploy                    Build, upload and deploy the site
  deploys                   List the site's deploys
  promote <deploy>          Make a deploy the live site
  rollback [deploy]         Make the deploy before the live one live again
  previews                  List the preview names; --delete <name> removes one
  secrets list|set|delete   The site's secrets

The deploy token comes from the site's Developer page in BackGold and opens
that one site. Keep it in BACKGOLD_DEPLOY_TOKEN.

Run backgold <command> --help for a command's options.

${GLOBAL_HELP}`

interface Command {
  usage: string
  flags: Record<string, FlagKind>
  positionals: number
  /** Needs `site` from backgold.json. */
  site: boolean
  /** Runs without a deploy token (and uses one when it is given). */
  tokenOptional?: boolean
  handler: (ctx: Ctx) => Promise<number>
}

interface Ctx {
  io: Io
  args: Parsed
  project: string
  api: string
  token: string
  site: string
  file: ProjectFile | null
  json: boolean
}

interface Deploy {
  id: string
  status: string
  live: boolean
  aliases: string[]
  created_at: string
  created_by: { user_id: string | null; token_id: string | null; name: string | null } | null
  git_sha: string | null
  error: string | null
  preview_url: string | null
  /** On a promote's answer: the `https://<verified domain>` the live deploy serves on, null without one (missing from an older api). */
  served_on?: string | null
}

interface DeployList {
  deploys: Deploy[]
  live_deploy_id: string | null
  aliases: Preview[]
  /** The `https://<verified domain>` the live deploy serves on, null without one (missing from an older api). */
  served_on?: string | null
}

interface Preview {
  name: string
  deploy_id: string
  updated_at: string
  /** The address the preview serves at, null while BackGold has no preview host (missing from an older api). */
  url?: string | null
}

interface Me {
  org_id: string
  site_id: string
  site_name: string | null
  domain: string | null
  scopes: string[]
  api_origin: string
}

interface CreateAnswer {
  deploy: Deploy
  bundle: { path: string; max_bytes: number }
  assets: { jwt: string; buckets: string[][]; upload_url: string }
}

const TOKEN_PATTERN = /^bg_deploy_[A-Za-z0-9]+$/
/** The api's codes for a deploy token it will not take: unknown, revoked or expired (401), or missing a scope (403). */
const TOKEN_CODES = new Set(['INVALID_TOKEN', 'SCOPE'])
const POLL_MS = 2000
const POLL_LIMIT_MS = 10 * 60 * 1000

class Exit extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message)
  }
}

const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : '')
const sitePath = (ctx: Ctx, rest = '') => `${ctx.api}/api/orgs/domains/${encodeURIComponent(ctx.site)}/deploys${rest}`
const meUrl = (api: string) => `${api}/api/site-deploys/me`

function step(ctx: { io: Io }, text: string) {
  ctx.io.stderr(`${redact(text)}\n`)
}

function answer(ctx: Ctx, data: unknown, text: string) {
  ctx.io.stdout(ctx.json ? `${JSON.stringify(data, null, 2)}\n` : `${redact(text)}\n`)
}

/** Columns padded to their widest cell. */
function table(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)))
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]!))).join('  ').trimEnd()
  return [line(header), ...rows.map(line)].join('\n')
}

const when = (iso: string | null | undefined) => (iso ? iso.replace('T', ' ').slice(0, 16) : '')

/** A full deploy id from a whole id or a unique prefix of one; an id the list lacks goes to the api as given. */
function resolveDeployId(given: string, deploys: readonly Deploy[]): string {
  if (deploys.some((d) => d.id === given)) return given
  const matches = deploys.filter((d) => d.id.startsWith(given))
  if (matches.length === 1) return matches[0]!.id
  if (matches.length > 1) throw new Exit(`${given} matches ${matches.length} deploys; give more of the id`, 2)
  return given
}

/** The /me answer, with a `_draft-<id>` placeholder an older api gives for a site with no domain read as none. */
async function readMe(ctx: Ctx): Promise<Me> {
  const me = await apiCall<Me>(ctx.io.fetch, meUrl(ctx.api), { bearer: ctx.token })
  return me.domain?.startsWith('_draft-') ? { ...me, domain: null } : me
}

/** Where a live deploy can be reached, or that nobody can reach it yet. */
function liveSentence(id: string, servedOn: string | null | undefined): string {
  return servedOn
    ? `Deploy ${id} is live at ${servedOn}.`
    : `Deploy ${id} is live, but this site has no domain yet, so nobody can reach it. Connect one on the site's Domain page in BackGold.`
}

/** A preview's address, or what it points at while it has none. */
function previewSentence(p: Pick<Preview, 'name' | 'deploy_id' | 'url'>): string {
  return p.url ? `Preview ${p.name}: ${p.url}` : `Preview ${p.name} points at ${p.deploy_id}; previews have no address on this BackGold yet.`
}

/** The site's name and domain; a site with no name shows its domain, else its id. */
function siteLabel(me: Me): string {
  if (!me.site_name) return me.domain ?? me.site_id
  return `${me.site_name}${me.domain ? ` (${me.domain})` : ''}`
}

// ── Commands ────────────────────────────────────────────────────────────────

async function link(ctx: Ctx): Promise<number> {
  step(ctx, `Checking the deploy token with ${ctx.api}`)
  const me = await readMe(ctx)
  await writeProjectFile(ctx.project, ctx.file, me.site_id, ctx.api)
  step(ctx, `Wrote ${PROJECT_FILE} (site ${me.site_id})`)
  if (!ctx.io.env.BACKGOLD_DEPLOY_TOKEN) step(ctx, 'To deploy, keep the token in BACKGOLD_DEPLOY_TOKEN (your shell, or a CI secret).')
  answer(ctx, me, `Linked to ${siteLabel(me)}`)
  return 0
}

async function whoami(ctx: Ctx): Promise<number> {
  const me = await readMe(ctx)
  if (ctx.file?.site && ctx.file.site !== me.site_id) {
    step(ctx, `warning: ${PROJECT_FILE} names site ${ctx.file.site}, and this token opens site ${me.site_id}`)
  }
  answer(
    ctx,
    me,
    [siteLabel(me), `site    ${me.site_id}`, `scopes  ${me.scopes.join(', ') || 'none'}`, `api     ${ctx.api}`].join('\n'),
  )
  return 0
}

async function deploys(ctx: Ctx): Promise<number> {
  const list = await apiCall<DeployList>(ctx.io.fetch, sitePath(ctx), { bearer: ctx.token })
  const rows = list.deploys.map((d) => [
    short(d.id),
    d.status,
    d.id === list.live_deploy_id || d.live ? 'live' : '',
    d.aliases.join(','),
    when(d.created_at),
    d.created_by?.name ?? '',
    d.git_sha ? d.git_sha.slice(0, 7) : '',
  ])
  answer(ctx, list, rows.length ? table(['ID', 'STATUS', 'LIVE', 'ALIASES', 'CREATED', 'BY', 'COMMIT'], rows) : 'No deploys yet.')
  return 0
}

async function promoteTo(ctx: Ctx, id: string): Promise<Deploy> {
  step(ctx, `Promoting deploy ${short(id)}`)
  return apiCall<Deploy>(ctx.io.fetch, sitePath(ctx, `/${encodeURIComponent(id)}/promote`), { method: 'POST', bearer: ctx.token, json: {} })
}

async function promote(ctx: Ctx): Promise<number> {
  const given = ctx.args.positionals[0]
  if (!given) throw new Exit('promote needs a deploy id (backgold deploys lists them)', 2)
  const list = await apiCall<DeployList>(ctx.io.fetch, sitePath(ctx), { bearer: ctx.token })
  const deploy = await promoteTo(ctx, resolveDeployId(given, list.deploys))
  answer(ctx, deploy, liveSentence(deploy.id, deploy.served_on ?? list.served_on))
  return 0
}

async function rollback(ctx: Ctx): Promise<number> {
  const list = await apiCall<DeployList>(ctx.io.fetch, sitePath(ctx), { bearer: ctx.token })
  const live = list.live_deploy_id
  let target: string
  const given = ctx.args.positionals[0]
  if (given) {
    target = resolveDeployId(given, list.deploys)
  } else {
    if (!live) throw new Exit('nothing is live on this site, so there is nothing to roll back from', 1)
    const liveDeploy = list.deploys.find((d) => d.id === live)
    const earlier = list.deploys
      .filter((d) => d.status === 'ready' && d.id !== live && (!liveDeploy || d.created_at < liveDeploy.created_at))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    if (!earlier.length) throw new Exit(`there is no ready deploy older than the live one (${short(live)}) to roll back to`, 1)
    target = earlier[0]!.id
  }
  const deploy = await promoteTo(ctx, target)
  const from = live && live !== deploy.id ? `Rolled back from deploy ${short(live)}.\n` : ''
  answer(ctx, deploy, `${from}${liveSentence(deploy.id, deploy.served_on ?? list.served_on)}`)
  return 0
}

async function previews(ctx: Ctx): Promise<number> {
  const name = ctx.args.flags['--delete']
  if (typeof name === 'string') {
    step(ctx, `Deleting the preview ${name}`)
    await apiCall<null>(ctx.io.fetch, sitePath(ctx, `/previews/${encodeURIComponent(name)}`), { method: 'DELETE', bearer: ctx.token })
    answer(ctx, null, `Deleted the preview ${name}.`)
    return 0
  }
  const list = await apiCall<Preview[]>(ctx.io.fetch, sitePath(ctx, '/previews'), { bearer: ctx.token })
  answer(ctx, list, list.length ? list.map(previewSentence).join('\n') : 'No previews.')
  return 0
}

function secretName(ctx: Ctx, verb: string): string {
  const name = ctx.args.positionals[1]
  if (!name) throw new Exit(`secrets ${verb} needs a NAME`, 2)
  if (reservedVarName(name)) throw new Exit(RESERVED_SECRET_MESSAGE, 2)
  if (!SECRET_NAME.test(name)) throw new Exit('a secret name is upper-case letters, digits and _, starting with a letter, at most 64', 2)
  return name
}

async function secrets(ctx: Ctx): Promise<number> {
  const verb = ctx.args.positionals[0]
  if (verb === 'list') {
    if (ctx.args.positionals.length > 1) throw new Exit(`unexpected argument ${ctx.args.positionals[1]}`, 2)
    const list = await apiCall<{ name: string; updated_at: string }[]>(ctx.io.fetch, sitePath(ctx, '/secrets'), { bearer: ctx.token })
    const rows = list.map((s) => [s.name, when(s.updated_at)])
    answer(ctx, list, rows.length ? table(['NAME', 'UPDATED'], rows) : 'No secrets.')
    return 0
  }
  if (verb === 'set') {
    const name = secretName(ctx, 'set')
    let value: string
    if (ctx.io.interactive) {
      value = await ctx.io.promptSecret(`Value for ${name} (not shown): `).catch(() => {
        throw new Exit('cancelled', 1)
      })
    } else {
      // Piped: one trailing newline is the shell's, not the value's.
      value = (await ctx.io.readStdin()).replace(/\r?\n$/, '')
    }
    if (!value) throw new Exit(`no value for ${name}: type it at the prompt, or pipe it in`, 2)
    if (Buffer.byteLength(value, 'utf8') > LIMITS.SECRET_MAX_BYTES) throw new Exit(`the value for ${name} is over the ${formatBytes(LIMITS.SECRET_MAX_BYTES)} limit`, 2)
    await apiCall<null>(ctx.io.fetch, sitePath(ctx, `/secrets/${encodeURIComponent(name)}`), { method: 'PUT', bearer: ctx.token, json: { value } })
    answer(ctx, null, `Set ${name}. A live site gets it on its next deploy.`)
    return 0
  }
  if (verb === 'delete') {
    const name = secretName(ctx, 'delete')
    await apiCall<null>(ctx.io.fetch, sitePath(ctx, `/secrets/${encodeURIComponent(name)}`), { method: 'DELETE', bearer: ctx.token })
    answer(ctx, null, `Deleted ${name}. A live site keeps it until its next deploy.`)
    return 0
  }
  throw new Exit(verb ? `unknown secrets command ${verb}` : 'secrets needs list, set or delete', 2)
}

function checkUploadUrl(value: unknown): string {
  if (typeof value === 'string') {
    try {
      const url = new URL(value)
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.href
    } catch {
      // falls through
    }
  }
  throw new Exit('the api answered with no usable assets upload address', 1)
}

async function gitInfo(ctx: Ctx): Promise<{ git_ref?: string; git_sha?: string }> {
  const sha = await ctx.io.git(['rev-parse', 'HEAD'], ctx.project)
  if (!sha) return {}
  const branch = await ctx.io.git(['rev-parse', '--abbrev-ref', 'HEAD'], ctx.project)
  // A CI checkout is detached; its branch is in the environment.
  const env = ctx.io.env
  const ref = (branch && branch !== 'HEAD' ? branch : null) ?? env.CI_COMMIT_REF_NAME ?? env.GITHUB_HEAD_REF ?? env.GITHUB_REF_NAME
  return { ...(ref ? { git_ref: ref } : {}), git_sha: sha }
}

async function deploy(ctx: Ctx): Promise<number> {
  const flags = ctx.args.flags
  const promoteFlag = flags['--promote'] === true
  const preview = typeof flags['--preview'] === 'string' ? flags['--preview'] : undefined
  if (flags['--no-build'] === true && typeof flags['--build-command'] === 'string') throw new Exit('--no-build and --build-command do not go together', 2)

  if (flags['--no-build'] !== true) {
    const command = typeof flags['--build-command'] === 'string' ? flags['--build-command'] : 'npm run build'
    step(ctx, `Building: ${command}`)
    // The build never sees the deploy token: a build can inline environment
    // variables into the Worker it writes.
    const env = { ...ctx.io.env }
    delete env.BACKGOLD_DEPLOY_TOKEN
    const code = await ctx.io.run(command, ctx.project, env)
    if (code !== 0) throw new Exit(`the build failed (${command} exited with ${code})`, 1)
  }

  let site
  try {
    site = await collectSite(ctx.project)
  } catch (err) {
    if (err instanceof CollectError) throw new Exit(err.message, err.code)
    throw err
  }
  step(
    ctx,
    `Found the Worker in ${site.config.replace(/\/[^/]+$/, '')} (${site.modules.length} modules, ${formatBytes(site.modulesBytes)}) and ${site.assets.size} assets (${formatBytes(site.assetsBytes)})`,
  )
  for (const warning of site.warnings) step(ctx, `warning: ${warning}`)

  let templateManifest: unknown
  const templateText = await readFile(join(ctx.project, 'template.json'), 'utf8').catch(() => null)
  if (templateText !== null) {
    try {
      templateManifest = JSON.parse(templateText)
    } catch {
      throw new Exit('template.json is not valid JSON', 1)
    }
    if (Buffer.byteLength(JSON.stringify(templateManifest), 'utf8') > LIMITS.TEMPLATE_MANIFEST_MAX_BYTES) {
      throw new Exit(`template.json is over BackGold hosting's ${formatBytes(LIMITS.TEMPLATE_MANIFEST_MAX_BYTES)} limit`, 2)
    }
    const problems = templateManifestProblems(templateManifest)
    if (problems) throw new Exit(`template.json is not a template manifest BackGold can read:\n${problems}`, 2)
  }
  const kit = await kitVersion(ctx.project)
  const manifest = {
    main_module: site.mainModule,
    compatibility_date: site.compatibilityDate,
    compatibility_flags: site.compatibilityFlags,
    modules: site.modules.map((m) => ({ name: m.name, type: m.type, bytes: m.bytes })),
    ...(kit ? { kit_version: kit } : {}),
    ...(await gitInfo(ctx)),
    ...(templateManifest !== undefined ? { template_manifest: templateManifest } : {}),
    ...(Object.keys(site.assetsConfig).length ? { assets_config: site.assetsConfig } : {}),
    ...(Object.keys(site.vars).length ? { vars: site.vars } : {}),
  }
  const assets: Record<string, { hash: string; size: number }> = {}
  const byHash = new Map<string, Asset>()
  for (const [path, asset] of site.assets) {
    assets[path] = { hash: asset.hash, size: asset.size }
    byHash.set(asset.hash, asset)
  }

  const created = await apiCall<CreateAnswer>(ctx.io.fetch, sitePath(ctx), {
    method: 'POST',
    bearer: ctx.token,
    json: { idempotency_key: ctx.io.randomId(), source: ctx.io.env.CI ? 'ci' : 'cli', manifest, assets },
  })
  const id = created.deploy.id
  step(ctx, `Created deploy ${short(id)}`)

  const buckets = created.assets.buckets
  const answers: unknown[] = []
  if (buckets.length) {
    const uploadUrl = checkUploadUrl(created.assets.upload_url)
    const files = buckets.reduce((n, b) => n + b.length, 0)
    step(ctx, `Uploading ${files} of ${site.assets.size} assets in ${buckets.length} ${buckets.length === 1 ? 'batch' : 'batches'}`)
    for (const bucket of buckets) {
      const form = await bucketForm(bucket, byHash)
      answers.push((await request(ctx.io.fetch, uploadUrl, { method: 'POST', bearer: created.assets.jwt, body: form })).body)
    }
  } else {
    step(ctx, 'Every asset is already uploaded')
  }
  const assetsJwt = completionJwt(created.assets.jwt, answers)
  if (!assetsJwt) throw new Exit('the assets upload finished without a completion token', 1)

  const zip = await bundleZip(site.modules, manifest)
  if (zip.length > created.bundle.max_bytes) {
    throw new Exit(`the Worker bundle is ${formatBytes(zip.length)} zipped, over BackGold hosting's ${formatBytes(created.bundle.max_bytes)} limit`, 2)
  }
  await apiCall<Deploy>(ctx.io.fetch, new URL(created.bundle.path, ctx.api).href, {
    method: 'PUT',
    bearer: ctx.token,
    body: zip,
    contentType: 'application/zip',
  })
  step(ctx, `Uploaded the Worker bundle (${formatBytes(zip.length)})`)

  await apiCall<Deploy>(ctx.io.fetch, sitePath(ctx, `/${encodeURIComponent(id)}/finish`), {
    method: 'POST',
    bearer: ctx.token,
    json: { assets_jwt: assetsJwt, promote: promoteFlag, ...(preview ? { preview } : {}) },
  })
  step(ctx, `Deploying ${short(id)}${promoteFlag ? ' and making it live' : ''}${preview ? ` as the preview ${preview}` : ''}`)

  const started = ctx.io.now()
  for (;;) {
    const current = await apiCall<Deploy>(ctx.io.fetch, sitePath(ctx, `/${encodeURIComponent(id)}`), { bearer: ctx.token })
    if (current.status === 'ready') {
      // Where the site is served and the preview's address are on the site's lists, not on the deploy.
      const list = current.live ? await apiCall<DeployList>(ctx.io.fetch, sitePath(ctx), { bearer: ctx.token }) : null
      const lines = [list ? liveSentence(id, list.served_on) : `Deploy ${id} is ready. It is not live: backgold promote ${short(id)} makes it live.`]
      if (preview) {
        const aliases = list?.aliases ?? (await apiCall<Preview[]>(ctx.io.fetch, sitePath(ctx, '/previews'), { bearer: ctx.token }))
        lines.push(previewSentence(aliases.find((a) => a.name === preview) ?? { name: preview, deploy_id: id }))
      } else if (current.preview_url) lines.push(`Preview: ${current.preview_url}`)
      answer(ctx, current, lines.join('\n'))
      return 0
    }
    if (current.status === 'failed' || current.status === 'deleted') {
      if (ctx.json) ctx.io.stdout(`${JSON.stringify(current, null, 2)}\n`)
      throw new Exit(`deploy ${id} failed:\n${current.error ?? `(status ${current.status}, no error given)`}`, 1)
    }
    if (ctx.io.now() - started >= POLL_LIMIT_MS) {
      throw new Exit(`deploy ${id} was still ${current.status} after 10 minutes; backgold deploys shows where it got to`, 1)
    }
    await ctx.io.sleep(POLL_MS)
  }
}

async function eject(ctx: Ctx): Promise<number> {
  const key = ctx.args.flags['--from']
  if (typeof key !== 'string') throw new Exit('eject needs --from <key>, the template to start from', 2)
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(key)) throw new Exit(`--from ${key} is not a template key`, 2)
  const given = ctx.args.positionals[0] ?? `${key}-site`
  const dir = resolve(ctx.io.cwd, given)
  const sourceFlag = ctx.args.flags['--source']
  // The new project's api is --api's, never a backgold.json the command was run beside.
  const api = typeof ctx.args.flags['--api'] === 'string' ? ctx.api : DEFAULT_API
  let ejected
  try {
    step(ctx, typeof sourceFlag === 'string' ? `Reading the templates from ${sourceFlag}` : `Fetching the newest ${TEMPLATES_PACKAGE}`)
    const source = typeof sourceFlag === 'string' ? await localSource(resolve(ctx.io.cwd, sourceFlag)) : await registrySource(ctx.io.fetch, ctx.io.env)
    ejected = await ejectTemplate(source, key, dir, api, new Date(ctx.io.now()).toISOString().slice(0, 10))
  } catch (err) {
    if (err instanceof EjectError) throw new Exit(err.message, err.code)
    throw err
  }
  const { stamp } = ejected
  step(ctx, `Wrote the ${key} template into ${given} (${ejected.files} files; ${TEMPLATES_PACKAGE} ${stamp.templates}, @backgold/template-kit ${stamp.kit})`)
  const next = [`cd ${given}`, 'npm install']
  if (ctx.token) {
    const code = await link({ ...ctx, api, project: ejected.dir, file: await readProjectFile(ejected.dir) })
    if (code !== 0) return code
  } else {
    next.push('npx backgold link')
  }
  next.push('npx backgold deploy --promote')
  if (!ctx.json) ctx.io.stdout(`Next:\n${next.map((line) => `  ${line}`).join('\n')}\n`)
  else if (!ctx.token) ctx.io.stdout(`${JSON.stringify({ dir: ejected.dir, ejected: stamp }, null, 2)}\n`)
  return 0
}

const COMMANDS: Record<string, Command> = {
  eject: {
    usage: `Usage: backgold eject --from <key> [dir] [--source <path>]

Makes a project of your own from one of BackGold's templates, in [dir]
(default: ./<key>-site), which must be new or empty: the template's source
from the newest ${TEMPLATES_PACKAGE} on npm, its template.json kept, its
@backgold packages pinned to the versions that publish was built with,
no scripts or settings for a Cloudflare account of your own, wrangler.jsonc
without BackGold's template deploys or the BACKGOLD_* vars BackGold hosting
sets, and backgold.json, whose
"ejected" records where it came from. With a deploy token it then runs link
in [dir]; without one it prints link as a next step. Its first
deploy --promote makes the site a custom site.

  --from <key>      The template: party, academy, ... (the keys the publish lists)
  --source <path>   Read the templates from a ${TEMPLATES_PACKAGE} tarball (.tgz) or
                    unpacked directory instead of npm
`,
    flags: { '--from': 'value', '--source': 'value' },
    positionals: 1,
    site: false,
    tokenOptional: true,
    handler: eject,
  },
  link: {
    usage: `Usage: backgold link [--token <token>] [--api <origin>] [--project <dir>]

Checks a deploy token with the api and writes backgold.json with the site it
opens and the api's origin. Without --token or $BACKGOLD_DEPLOY_TOKEN, asks for
the token (it is not shown as you type). The token itself is not written.
`,
    flags: {},
    positionals: 0,
    site: false,
    handler: link,
  },
  whoami: {
    usage: `Usage: backgold whoami

Shows the site, domain and scopes the deploy token opens.
`,
    flags: {},
    positionals: 0,
    site: false,
    handler: whoami,
  },
  deploy: {
    usage: `Usage: backgold deploy [--promote] [--preview <name>] [--no-build] [--build-command <cmd>]

Builds the site, uploads it and waits until the deploy is ready.

  --promote               Make it the live site once it is ready
  --preview <name>        Point the preview <name> at it (a branch name, say)
  --no-build              Deploy what dist/ already holds
  --build-command <cmd>   Build with <cmd> instead of npm run build
`,
    flags: { '--promote': 'boolean', '--preview': 'value', '--no-build': 'boolean', '--build-command': 'value' },
    positionals: 0,
    site: true,
    handler: deploy,
  },
  deploys: {
    usage: `Usage: backgold deploys

Lists the site's deploys, newest first, and which one is live.
`,
    flags: {},
    positionals: 0,
    site: true,
    handler: deploys,
  },
  promote: {
    usage: `Usage: backgold promote <deploy>

Makes a ready deploy the live site. <deploy> is its id, or the start of it
that backgold deploys shows.
`,
    flags: {},
    positionals: 1,
    site: true,
    handler: promote,
  },
  rollback: {
    usage: `Usage: backgold rollback [<deploy>]

Makes the newest ready deploy older than the live one live again, or the
deploy given.
`,
    flags: {},
    positionals: 1,
    site: true,
    handler: rollback,
  },
  previews: {
    usage: `Usage: backgold previews [--delete <name>]

Lists the site's previews: each one's address, or the deploy it points at
while previews have no address.

  --delete <name>   Remove the preview <name>
`,
    flags: { '--delete': 'value' },
    positionals: 0,
    site: true,
    handler: previews,
  },
  secrets: {
    usage: `Usage: backgold secrets list
       backgold secrets set <NAME>
       backgold secrets delete <NAME>

The site's secrets: values its Worker reads, kept encrypted by BackGold and
never shown again. set asks for the value (not shown as you type), or reads it
from stdin when it is piped in. A change reaches a live site on its next deploy.
BACKGOLD_* names, ENVIRONMENT and ASSETS are reserved.
`,
    flags: {},
    positionals: 2,
    site: true,
    handler: secrets,
  },
}

function usageError(problem: string, usage: string): number {
  throw new Exit(`${problem}\n\n${usage}`, 2)
}

async function dispatch(argv: readonly string[], io: Io): Promise<number> {
  const [name, ...rest] = argv
  if (name === undefined) return usageError('missing command', USAGE)
  if (name === '--help' || name === '-h' || name === 'help') {
    io.stdout(USAGE)
    return 0
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined
  if (!command) return usageError(`unknown command ${name}`, USAGE)
  const usage = `${command.usage}\n${GLOBAL_HELP}`
  if (rest.includes('--help') || rest.includes('-h')) {
    io.stdout(usage)
    return 0
  }
  const args = parseArgs(rest, command.flags, command.positionals)
  if (typeof args === 'string') return usageError(args, usage)

  const project = resolve(io.cwd, typeof args.flags['--project'] === 'string' ? args.flags['--project'] : '.')
  let file: ProjectFile | null
  try {
    file = await readProjectFile(project)
  } catch (err) {
    throw new Exit(`could not read ${join(project, PROJECT_FILE)}: ${err instanceof Error ? err.message : String(err)}`, 2)
  }

  const apiGiven = typeof args.flags['--api'] === 'string' ? args.flags['--api'] : null
  const apiRaw = apiGiven ?? (typeof file?.api === 'string' && file.api ? file.api : DEFAULT_API)
  const api = checkOrigin(apiRaw)
  if (!api) {
    const where = apiGiven ? '--api' : `${PROJECT_FILE}'s "api"`
    return usageError(`${where} must be an https origin (http only for localhost), with no path`, usage)
  }

  const site = typeof file?.site === 'string' ? file.site : ''
  if (command.site && !site) {
    throw new Exit(
      file ? `${PROJECT_FILE} in ${project} names no site: run backgold link` : `no ${PROJECT_FILE} in ${project}: run backgold link first (or pass --project)`,
      2,
    )
  }

  let token = typeof args.flags['--token'] === 'string' ? args.flags['--token'] : (io.env.BACKGOLD_DEPLOY_TOKEN ?? '')
  if (!token && name === 'link' && io.interactive) {
    token = (
      await io.promptSecret('Deploy token (from the site\'s Developer page in BackGold; not shown): ').catch(() => {
        throw new Exit('cancelled', 1)
      })
    ).trim()
  }
  if (!token && !command.tokenOptional) throw new Exit('no deploy token: set BACKGOLD_DEPLOY_TOKEN to a token from the site\'s Developer page in BackGold', 3)
  if (token && !TOKEN_PATTERN.test(token)) throw new Exit('the token must be a deploy token: bg_deploy_ followed by letters and digits', 3)

  return command.handler({ io, args, project, api, token, site, file, json: args.flags['--json'] === true })
}

/** The CLI without the process: the exit code, with everything it touches injectable. */
export async function run(argv: readonly string[], io: Partial<Io> = {}): Promise<number> {
  const full: Io = { ...nodeIo, ...io }
  try {
    return await dispatch(argv, full)
  } catch (err) {
    if (err instanceof Exit) {
      full.stderr(`backgold: ${redact(err.message)}\n`)
      return err.code
    }
    if (err instanceof HttpError && err.code === 'NOT_ENTITLED') {
      full.stderr(`backgold: this organization does not have custom sites on BackGold yet, so it cannot deploy or promote a site.\n`)
      return err.exitCode
    }
    if (err instanceof HttpError) {
      const tokenRefused = err.status === 401 || (err.code !== null && TOKEN_CODES.has(err.code))
      const hint = tokenRefused ? '\nThe deploy token was refused: check BACKGOLD_DEPLOY_TOKEN, or make a new one on the site\'s Developer page.' : ''
      // Any other 403 is the api's own refusal, never the token's.
      const message = err.status === 403 && !tokenRefused && !err.apiError ? 'the api refused this request (HTTP 403)' : err.message
      full.stderr(`backgold: ${redact(message)}${hint}\n`)
      return err.exitCode
    }
    full.stderr(`backgold: ${redact(err instanceof Error ? err.message : String(err))}\n`)
    return 1
  }
}

/** Run the CLI and exit the process with its code. */
export async function main(argv: string[]): Promise<void> {
  const code = await run(argv)
  process.exitCode = code
}
