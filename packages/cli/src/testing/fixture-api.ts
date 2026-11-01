// An in-process stand-in for the api's deploy routes and Cloudflare's
// assets upload, on node:http, for the CLI's tests. It keeps its state in
// memory and records what it was sent.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The hand-made build the tests deploy: packages/cli/test-fixtures/site. */
export const FIXTURE_SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures/site')

export const SITE = 'site0123456789abcdef0123456789ab'
export const TOKEN = 'bg_deploy_fixtureToken0123456789abcdefgh'
export const SESSION_JWT = 'session-jwt'
export const COMPLETION_JWT = 'completion-jwt'

export interface FixtureDeploy {
  id: string
  site_domain_id: string
  status: string
  script_name: string
  bytes: number | null
  asset_count: number | null
  asset_bytes: number | null
  compatibility_date: string | null
  kit_version: string | null
  git_ref: string | null
  git_sha: string | null
  source: string
  created_by: { user_id: string | null; token_id: string | null; name: string | null }
  created_at: string
  ready_at: string | null
  promoted_at: string | null
  error: string | null
  live: boolean
  aliases: string[]
  preview_url: string | null
}

export interface Fixture {
  origin: string
  close(): Promise<void>
  deploys: FixtureDeploy[]
  live: string | null
  aliases: Map<string, { deploy_id: string; updated_at: string }>
  secrets: Map<string, { value: string; updated_at: string }>
  /** Asset hashes Cloudflare already holds: never put in a bucket. */
  known: Set<string>
  bucketSize: number
  bundleMaxBytes: number
  /** False: the organization has no custom sites, and create, finish and promote answer 402 NOT_ENTITLED. */
  entitled: boolean
  /** The site's mode; 'headless' makes create and finish answer 409 SITE_MODE. */
  siteMode: string
  /** What a finished deploy becomes, and its error when it fails. */
  outcome: { status: 'ready' | 'failed'; error?: string }
  /** GETs of a deploying deploy before it settles. */
  pollsBeforeSettled: number
  /** Paths whose first request has its connection dropped. */
  dropOnce: Set<string>
  /** Every request, as `METHOD path`. */
  log: string[]
  createBodies: Record<string, unknown>[]
  finishBodies: Record<string, unknown>[]
  bundles: Map<string, Buffer>
  /** Uploaded asset bytes by hash, decoded from base64. */
  uploaded: Map<string, { bytes: Buffer; type: string }>
  /** The Authorization header of each request to the assets upload. */
  uploadAuth: string[]
  /** `/me`'s domain: a placeholder `_draft-<id>` stands in for an older api's answer on a site with no domain. */
  meDomain: string | null
  /** The `served_on` promote and the deploy list answer; undefined leaves the field out, as an older api does. */
  servedOn: string | null | undefined
  /** The host previews serve on (`https://<name>.<host>`); null while previews have no address. */
  previewHost: string | null
  /** An answer every api request gets once its token passes (a 403 the token is not the cause of, say). */
  refuse: { status: number; body?: unknown } | null
}

const now = () => new Date().toISOString()

export function makeDeploy(id: string, fields: Partial<FixtureDeploy> = {}): FixtureDeploy {
  return {
    id,
    site_domain_id: SITE,
    status: 'ready',
    script_name: `site-${SITE}-${id}`,
    bytes: 100,
    asset_count: 1,
    asset_bytes: 10,
    compatibility_date: '2026-10-04',
    kit_version: null,
    git_ref: null,
    git_sha: null,
    source: 'cli',
    created_by: { user_id: null, token_id: 'tok1', name: 'CI token' },
    created_at: now(),
    ready_at: now(),
    promoted_at: null,
    error: null,
    live: false,
    aliases: [],
    preview_url: null,
    ...fields,
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end()
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}

export async function startFixture(): Promise<Fixture> {
  const idempotency = new Map<string, string>()
  const pending = new Map<string, number>()
  let nextId = 1

  const fx: Fixture = {
    origin: '',
    close: async () => {},
    deploys: [],
    live: null,
    aliases: new Map(),
    secrets: new Map(),
    known: new Set(),
    bucketSize: 2,
    bundleMaxBytes: 10 * 1024 * 1024,
    entitled: true,
    siteMode: 'hosted',
    outcome: { status: 'ready' },
    pollsBeforeSettled: 1,
    dropOnce: new Set(),
    log: [],
    createBodies: [],
    finishBodies: [],
    bundles: new Map(),
    uploaded: new Map(),
    uploadAuth: [],
    meDomain: 'fixture.example.org',
    servedOn: 'https://fixture.example.org',
    previewHost: null,
    refuse: null,
  }

  const served = () => (fx.servedOn === undefined ? {} : { served_on: fx.servedOn })
  const aliasView = (name: string, a: { deploy_id: string; updated_at: string }) => ({ name, ...a, url: fx.previewHost ? `https://${name}.${fx.previewHost}` : null })

  const view = (d: FixtureDeploy): FixtureDeploy => ({
    ...d,
    live: d.id === fx.live,
    aliases: [...fx.aliases].filter(([, a]) => a.deploy_id === d.id).map(([name]) => name),
  })

  async function cloudflare(req: IncomingMessage, res: ServerResponse) {
    fx.uploadAuth.push(String(req.headers.authorization))
    if (req.headers.authorization !== `Bearer ${SESSION_JWT}`) return send(res, 401, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] })
    const body = await readBody(req)
    const form = await new Response(new Uint8Array(body), { headers: { 'Content-Type': String(req.headers['content-type']) } }).formData()
    for (const [hash, value] of form.entries()) {
      const file = value as File
      fx.uploaded.set(hash, { bytes: Buffer.from(await file.text(), 'base64'), type: file.type })
    }
    // Cloudflare answers the upload that completes the session with the completion token.
    const wanted = fx.createBodies.at(-1)?.assets as Record<string, { hash: string }> | undefined
    const done = Object.values(wanted ?? {}).every((a) => fx.known.has(a.hash) || fx.uploaded.has(a.hash))
    return send(res, done ? 201 : 202, { success: true, errors: [], messages: [], result: done ? { jwt: COMPLETION_JWT } : {} })
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'Invalid or expired deploy token', code: 'INVALID_TOKEN' })
    if (fx.refuse) return send(res, fx.refuse.status, fx.refuse.body)
    const method = req.method ?? 'GET'
    // Hono's csrf(): a write whose content type is a form's, or none (read as text/plain), from no allowed origin is refused.
    const type = String(req.headers['content-type'] ?? 'text/plain')
    if (method !== 'GET' && /^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)\b/i.test(type)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden')
      return
    }
    if (path === '/api/site-deploys/me' && method === 'GET') {
      return send(res, 200, {
        data: { org_id: 'org1', site_id: SITE, site_name: 'Fixture Party', domain: fx.meDomain, scopes: ['deploy', 'promote'], api_origin: fx.origin },
      })
    }
    const m = /^\/api\/orgs\/domains\/([^/]+)\/deploys(\/.*)?$/.exec(path)
    if (!m) return send(res, 404, { error: 'Not found', code: 'NOT_FOUND' })
    if (m[1] !== SITE) return send(res, 404, { error: 'Site not found', code: 'NOT_FOUND' })
    const rest = m[2] ?? ''
    const body = method === 'GET' || method === 'DELETE' ? Buffer.alloc(0) : await readBody(req)
    const json = () => JSON.parse(body.toString('utf8') || '{}') as Record<string, unknown>
    const creates = rest === '' && method === 'POST'
    const finishes = /^\/[^/]+\/finish$/.test(rest) && method === 'POST'
    const promotes = /^\/[^/]+\/promote$/.test(rest) && method === 'POST'
    if ((creates || finishes || promotes) && !fx.entitled) {
      return send(res, 402, { error: 'Custom sites are not part of this plan', code: 'NOT_ENTITLED' })
    }
    if ((creates || finishes) && fx.siteMode === 'headless') {
      return send(res, 409, { error: 'This site is built elsewhere and takes no deploy', code: 'SITE_MODE' })
    }

    if (rest === '' && method === 'GET') {
      const deploys = [...fx.deploys].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map(view)
      const aliases = [...fx.aliases].map(([name, a]) => aliasView(name, a))
      return send(res, 200, { data: { deploys, live_deploy_id: fx.live, aliases, ...served() } })
    }
    if (rest === '' && method === 'POST') {
      const input = json()
      fx.createBodies.push(input)
      const key = typeof input.idempotency_key === 'string' ? input.idempotency_key : null
      const repeat = key ? idempotency.get(key) : undefined
      let deploy = repeat ? fx.deploys.find((d) => d.id === repeat) : undefined
      if (!deploy) {
        const manifest = input.manifest as Record<string, unknown>
        deploy = makeDeploy(`dep${String(nextId++).padStart(29, '0')}`, {
          status: 'uploading',
          source: String(input.source),
          git_ref: (manifest.git_ref as string) ?? null,
          git_sha: (manifest.git_sha as string) ?? null,
          kit_version: (manifest.kit_version as string) ?? null,
          ready_at: null,
        })
        fx.deploys.push(deploy)
        if (key) idempotency.set(key, deploy.id)
      }
      const hashes = [...new Set(Object.values(input.assets as Record<string, { hash: string }>).map((a) => a.hash))].filter((h) => !fx.known.has(h))
      const buckets: string[][] = []
      for (let i = 0; i < hashes.length; i += fx.bucketSize) buckets.push(hashes.slice(i, i + fx.bucketSize))
      return send(res, repeat ? 200 : 201, {
        data: {
          deploy: view(deploy),
          bundle: { path: `/api/orgs/domains/${SITE}/deploys/${deploy.id}/bundle`, max_bytes: fx.bundleMaxBytes },
          assets: { jwt: SESSION_JWT, buckets, upload_url: `${fx.origin}/cf/accounts/acct/workers/assets/upload?base64=true` },
        },
      })
    }
    if (rest === '/previews' && method === 'GET') {
      return send(res, 200, { data: [...fx.aliases].map(([name, a]) => aliasView(name, a)) })
    }
    const preview = /^\/previews\/([^/]+)$/.exec(rest)
    if (preview && method === 'DELETE') {
      const name = decodeURIComponent(preview[1]!)
      if (!fx.aliases.delete(name)) return send(res, 404, { error: 'No such preview', code: 'NOT_FOUND' })
      return send(res, 204)
    }
    if (rest === '/secrets' && method === 'GET') {
      return send(res, 200, { data: [...fx.secrets].map(([name, s]) => ({ name, updated_at: s.updated_at })) })
    }
    const secret = /^\/secrets\/([^/]+)$/.exec(rest)
    if (secret) {
      const name = decodeURIComponent(secret[1]!)
      if (method === 'PUT') {
        if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) {
          return send(res, 400, { error: 'A secret name is upper-case letters, digits and underscores, starting with a letter (at most 64).', code: 'BAD_NAME' })
        }
        if (name.startsWith('BACKGOLD_') || name === 'ENVIRONMENT' || name === 'ASSETS') {
          return send(res, 400, { error: 'BACKGOLD_ names and ENVIRONMENT are set by BackGold.', code: 'RESERVED_NAME' })
        }
        fx.secrets.set(name, { value: String(json().value), updated_at: now() })
        return send(res, 204)
      }
      if (method === 'DELETE') {
        if (!fx.secrets.delete(name)) return send(res, 404, { error: 'No such secret', code: 'NOT_FOUND' })
        return send(res, 204)
      }
    }
    const one = /^\/([^/]+)(\/bundle|\/finish|\/promote)?$/.exec(rest)
    const deploy = one ? fx.deploys.find((d) => d.id === one[1]) : undefined
    if (!one || !deploy) return send(res, 404, { error: 'Deploy not found', code: 'NOT_FOUND' })
    const action = one[2] ?? ''
    if (action === '/bundle' && method === 'PUT') {
      if (req.headers['content-type'] !== 'application/zip') return send(res, 400, { error: 'The bundle must be application/zip', code: 'BAD_BUNDLE' })
      fx.bundles.set(deploy.id, body)
      deploy.status = 'uploaded'
      return send(res, 200, { data: view(deploy) })
    }
    if (action === '/finish' && method === 'POST') {
      const input = json()
      fx.finishBodies.push(input)
      if (input.assets_jwt !== COMPLETION_JWT && input.assets_jwt !== SESSION_JWT) return send(res, 400, { error: 'Bad assets token', code: 'BAD_ASSETS_JWT' })
      deploy.status = 'deploying'
      pending.set(deploy.id, fx.pollsBeforeSettled)
      return send(res, 202, { data: view(deploy) })
    }
    if (action === '/promote' && method === 'POST') {
      if (deploy.status !== 'ready') return send(res, 409, { error: 'The deploy is not ready', code: 'DEPLOY_NOT_READY' })
      fx.live = deploy.id
      deploy.promoted_at = now()
      return send(res, 200, { data: { ...view(deploy), ...served() } })
    }
    if (action === '' && method === 'GET') {
      const left = pending.get(deploy.id)
      if (left !== undefined) {
        if (left > 0) pending.set(deploy.id, left - 1)
        else {
          pending.delete(deploy.id)
          deploy.status = fx.outcome.status
          deploy.error = fx.outcome.error ?? null
          if (deploy.status === 'ready') {
            deploy.ready_at = now()
            const finish = fx.finishBodies.at(-1)
            if (finish?.promote === true) fx.live = deploy.id
            if (typeof finish?.preview === 'string') fx.aliases.set(finish.preview, { deploy_id: deploy.id, updated_at: now() })
          }
        }
      }
      return send(res, 200, { data: view(deploy) })
    }
    return send(res, 405, { error: 'Method not allowed', code: 'METHOD' })
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture')
    const key = `${req.method} ${url.pathname}`
    fx.log.push(key)
    if (fx.dropOnce.delete(key)) {
      req.socket.destroy()
      return
    }
    const handle = url.pathname.startsWith('/cf/') ? cloudflare(req, res) : api(req, res, url.pathname)
    handle.catch((err: unknown) => send(res, 500, { error: String(err), code: 'FIXTURE' }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  fx.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  fx.close = () =>
    new Promise((done) => {
      server.closeAllConnections()
      server.close(() => done())
    })
  return fx
}
