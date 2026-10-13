// The geography a Map section draws: BackGold's geometry for the section's
// set of places, at the section's `media.geoUrl` (`/lp-runtime/<hash>.json`
// on the api, where <hash> is the file's SHA-256). It is already projected
// to SVG coordinates:
//
//   { width, height, paths: { key: d }, centroids: { key: [x, y] },
//     labels?: { key: label }, underlay?: [key] }
//
// A county set keys each place on its name; a district set keys on a code
// and names each place in `labels`. `underlay` lists places drawn first,
// beneath the rest, because they overlap others by design.
//
// The address names the file's hash, so its bytes never change. It is read
// once and kept: in this isolate's memory, and in the BACKGOLD_CACHE KV
// namespace (when the Worker has one) under `geo:<hash>` for thirty days, so
// another isolate reads KV instead of BackGold. A relative address is read
// from BACKGOLD_API_ORIGIN, where the api serves `/lp-runtime`. Anything that
// is not such a file is never read, and a read that fails or takes longer
// than GEO_TIMEOUT_MS is not kept: the section draws without its map and the
// next render asks again.

import { apiOrigin, workerVars } from './env'

export interface Geo {
  width: number
  height: number
  /** Place key → SVG path `d`, in `0 0 width height`. */
  paths: Record<string, string>
  /** Place key → its centre, in the same space. */
  centroids: Record<string, [number, number]>
  /** Place key → the name to show, for a set keyed on codes. */
  labels: Record<string, string>
  /** Place keys drawn first, beneath every other place. */
  underlay: string[]
}

const GEO_PATH = /^\/lp-runtime\/([0-9a-f]{64})\.json$/
/** Only path commands and numbers: what BackGold's geometry is made of. */
const PATH_DATA = /^[MmLlHhVvZz0-9eE.,+\-\s]+$/
const GEO_TIMEOUT_MS = 4000
const KV_TTL_SECONDS = 30 * 86400
/** The most geometries an isolate keeps; past it the oldest is dropped. */
const MAX_HELD = 8

interface KvText {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

const held = new Map<string, Promise<Geo | null>>()

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** The geometry in `payload`, or null when it is not one. */
function parseGeo(payload: unknown): Geo | null {
  if (!isRecord(payload) || !isRecord(payload.paths)) return null
  const { width, height } = payload
  if (typeof width !== 'number' || typeof height !== 'number' || !(width > 0) || !(height > 0)) return null
  const paths: Record<string, string> = {}
  for (const [key, d] of Object.entries(payload.paths)) if (typeof d === 'string' && d !== '' && PATH_DATA.test(d)) paths[key] = d
  if (Object.keys(paths).length === 0) return null
  const centroids: Record<string, [number, number]> = {}
  for (const [key, c] of Object.entries(isRecord(payload.centroids) ? payload.centroids : {})) {
    if (Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) centroids[key] = [c[0], c[1]]
  }
  const labels: Record<string, string> = {}
  for (const [key, label] of Object.entries(isRecord(payload.labels) ? payload.labels : {})) if (typeof label === 'string' && label.trim() !== '') labels[key] = label
  const underlay = Array.isArray(payload.underlay) ? payload.underlay.filter((key): key is string => typeof key === 'string' && key in paths) : []
  return { width, height, paths, centroids, labels, underlay }
}

function kvOf(env: Record<string, unknown>): KvText | null {
  const kv = env.BACKGOLD_CACHE as Partial<KvText> | undefined
  return kv && typeof kv.get === 'function' && typeof kv.put === 'function' ? (kv as KvText) : null
}

/** The geometry file's address and hash, when `geoUrl` names one; relative addresses on `origin`. */
function geoFile(geoUrl: string, origin: string | null): { url: string; hash: string } | null {
  let url: URL
  try {
    url = geoUrl.startsWith('/') && !geoUrl.startsWith('//') ? new URL(`${origin ?? ''}${geoUrl}`) : new URL(geoUrl)
  } catch {
    return null
  }
  const hash = GEO_PATH.exec(url.pathname)?.[1]
  if (!hash || (url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash || url.username || url.password) return null
  return { url: url.href, hash }
}

async function read(file: { url: string; hash: string }, kv: KvText | null, defer: (task: Promise<unknown>) => void): Promise<Geo | null> {
  const key = `geo:${file.hash}`
  const stored = kv ? await kv.get(key, 'text').catch(() => null) : null
  if (stored) {
    try {
      const geo = parseGeo(JSON.parse(stored))
      if (geo) return geo
    } catch {
      // A value that is not the geometry is read again from BackGold.
    }
  }
  const res = await fetch(file.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(GEO_TIMEOUT_MS) })
  if (!res.ok) return null
  const text = await res.text()
  const geo = parseGeo(JSON.parse(text))
  if (geo && kv) defer(kv.put(key, text, { expirationTtl: KV_TTL_SECONDS }).catch(() => undefined))
  return geo
}

/**
 * The geometry at a section's `geoUrl`, or null (no address, not a geometry
 * file, or the read failed). The KV write runs after the response, through
 * the request's `waitUntil` (`locals.cfContext`) where it has one, so the
 * page never waits for it.
 */
export async function loadGeo(geoUrl: string | null, locals: object): Promise<Geo | null> {
  if (!geoUrl) return null
  const env = await workerVars()
  const file = geoFile(geoUrl, apiOrigin(env))
  if (!file) return null
  let pending = held.get(file.hash)
  if (!pending) {
    const cf = (locals as { cfContext?: { waitUntil(task: Promise<unknown>): void } }).cfContext
    const defer = (task: Promise<unknown>) => (cf ? cf.waitUntil(task) : void task)
    pending = read(file, kvOf(env), defer).catch(() => null)
    held.set(file.hash, pending)
    while (held.size > MAX_HELD) held.delete(held.keys().next().value!)
  }
  const geo = await pending
  if (!geo && held.get(file.hash) === pending) held.delete(file.hash)
  return geo
}
