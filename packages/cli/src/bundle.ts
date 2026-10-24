// The two things `deploy` sends besides JSON: the asset buckets, straight
// to Cloudflare's assets upload, and the Worker bundle, a zip for the api.
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { strToU8, zipSync, type Zippable } from 'fflate'
import type { Asset, WorkerModule } from './collect.js'

const CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  css: 'text/css',
  csv: 'text/csv',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  map: 'application/json',
  mjs: 'text/javascript',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  otf: 'font/otf',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  txt: 'text/plain',
  wasm: 'application/wasm',
  webm: 'video/webm',
  webmanifest: 'application/manifest+json',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xml: 'application/xml',
}

/** The type Cloudflare serves an asset with; `application/null` asks it to send none. */
export function contentType(file: string): string {
  return CONTENT_TYPES[extname(file).slice(1).toLowerCase()] ?? 'application/null'
}

/** One bucket as Cloudflare's assets upload takes it (`?base64=true`): a part per hash holding the file's bytes in base64. */
export async function bucketForm(hashes: readonly string[], byHash: ReadonlyMap<string, Asset>): Promise<FormData> {
  const form = new FormData()
  for (const hash of hashes) {
    const asset = byHash.get(hash)
    if (!asset) throw new Error(`the api asked for an asset this build does not have (${hash})`)
    const bytes = await readFile(asset.file)
    form.append(hash, new File([bytes.toString('base64')], hash, { type: contentType(asset.file) }), hash)
  }
  return form
}

/** The completion token: the last bucket answer that carries `result.jwt`; with no buckets, the session token itself. */
export function completionJwt(sessionJwt: string, answers: readonly unknown[]): string | null {
  if (!answers.length) return sessionJwt
  for (let i = answers.length - 1; i >= 0; i--) {
    const jwt = (answers[i] as { result?: { jwt?: unknown } } | null)?.result?.jwt
    if (typeof jwt === 'string' && jwt) return jwt
  }
  return null
}

/** The Worker bundle: every module at its name, and `manifest.json`, the manifest sent on create. */
export async function bundleZip(modules: readonly WorkerModule[], manifest: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const files: Zippable = {}
  for (const m of modules) {
    if (m.name === 'manifest.json') throw new Error('the Worker has a module named manifest.json, the name the bundle keeps for its manifest')
    files[m.name] = new Uint8Array(await readFile(m.file))
  }
  files['manifest.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`)
  return zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>
}
