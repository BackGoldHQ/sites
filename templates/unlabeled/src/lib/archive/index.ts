// The archive's index: every entry of the six archive types, read through
// the site's Content API client at request time and kept in KV
// (`BACKGOLD_CACHE`) under the site's content version, as every other read
// is. A publish in BackGold moves the version, so the next request builds a
// new index and nothing older is read again; nothing rebuilds it before.
//
//   KV key   bg-archive:<site id>:v<content version>:f<ARCHIVE_FORMAT>
//   value    ArchiveData as JSON (the documents the search is built from)
//
// A build lists each type 50 entries a page with `include=fields`, which
// carries each entry's fields, and keeps them as listed: one read per 50
// entries. A listed entry the api sends without fields (an api that predates
// `include`), and every entry of a type whose entries carry a prose body the
// list does not send (BODY_KINDS: her records requests' responses), is read
// on its own, eight at a time. Each of those reads is itself cached by the
// client under the same version, so a later entry page costs nothing new. The build
// writes KV once, the whole document set under one key. Within one isolate
// the parsed index is held in memory per key and concurrent requests share
// one build; two isolates that both miss on a new version each build it
// (the second write is the same value), which costs reads, never
// correctness, so no lock is kept.

import type { BackgoldContent, ContentTypeSummary, Entry, EntryDetail } from '@backgold/content'
import { workerVars } from '@backgold/template-kit/lib/env'
import { ARCHIVE_KINDS, type ArchiveKindKey } from './kinds'
import { httpUrl, list, toDoc, type ArchiveDoc } from './record'

/** Bumped when ArchiveDoc's shape changes, so a deploy never reads an index an older build wrote. */
export const ARCHIVE_FORMAT = 3

/** How long a built index may live in KV; a version bump retires it sooner. */
const INDEX_TTL_SECONDS = 7 * 24 * 60 * 60

/** Entry details read at once while building. */
const DETAIL_CONCURRENCY = 8

/** The kinds whose entries carry a prose body, which a list never sends: each is read on its own. */
const BODY_KINDS: readonly ArchiveKindKey[] = ['information_request']

export interface ArchiveType {
  key: ArchiveKindKey
  singular: string
  plural: string
  /** The type's address (`decisions`), else the kind's default. */
  base: string
  /** True when the organization has the type. */
  present: boolean
}

export interface ArchiveData {
  format: number
  version: number
  builtAt: string
  types: ArchiveType[]
  docs: ArchiveDoc[]
}

interface KvNamespace {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

const isKv = (value: unknown): value is KvNamespace =>
  typeof value === 'object' && value !== null && typeof (value as KvNamespace).get === 'function' && typeof (value as KvNamespace).put === 'function'

/** The KV key the index lives under. */
export const archiveKey = (siteId: string, version: number): string => `bg-archive:${siteId}:v${version}:f${ARCHIVE_FORMAT}`

/** What the archive reads from the request's BackGold state. */
export interface ArchiveSource {
  client: BackgoldContent
  siteId: string
  version: number
}

/**
 * The archive types in the door's order, each where the organization keeps
 * it. Their labels are the archive's own (kinds.ts), whatever the
 * organization calls the type in BackGold: her information_request type is
 * "Information requests" there and "Records requests" on every archive
 * chip, rail, crumb and head.
 */
export function archiveTypes(types: ContentTypeSummary[]): ArchiveType[] {
  return ARCHIVE_KINDS.map((kind) => {
    const found = types.find((t) => t.key === kind.key)
    return {
      key: kind.key,
      singular: kind.singular,
      plural: kind.plural,
      base: found?.url_base ?? kind.base,
      present: found !== undefined,
    }
  })
}

/** `fn` over `items`, at most `limit` at once, results in order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * A decision's original is the first source document it cites, on
 * BoardBook: its row and its citation carry "Open original" to it.
 */
function linkOriginals(docs: ArchiveDoc[]): void {
  const boardbook = new Map(docs.filter((d) => d.kind === 'source_document').map((d) => [d.slug, httpUrl(d.fields.boardbook_link)]))
  for (const doc of docs) {
    if (doc.kind !== 'board_decision') continue
    const href = list(doc.fields.source_documents).map((slug) => boardbook.get(slug)).find((h) => h)
    if (href) doc.links.unshift({ label: 'Open original', href, external: true })
  }
}

/** Reads every entry of the archive types and keeps each as an ArchiveDoc. */
export async function buildArchive(client: BackgoldContent, version: number): Promise<ArchiveData> {
  const { types: all } = await client.types()
  const types = archiveTypes(all)
  const docs: ArchiveDoc[] = []
  for (const type of types.filter((t) => t.present)) {
    const unread: string[] = []
    const fromList = !BODY_KINDS.includes(type.key)
    for await (const entry of client.allEntries(type.key, { limit: 50, include: 'fields' })) {
      const { fields } = entry as Entry & { fields?: unknown }
      if (fromList && fields && typeof fields === 'object') docs.push(toDoc(type.key, { ...entry, fields, body: { markdown: '' } } as EntryDetail, type.base))
      else unread.push(entry.slug)
    }
    const details = await pool(unread, DETAIL_CONCURRENCY, (slug) => client.entry(type.key, slug))
    for (const answer of details) if (answer) docs.push(toDoc(type.key, answer.entry as EntryDetail, type.base))
  }
  linkOriginals(docs)
  return { format: ARCHIVE_FORMAT, version, builtAt: new Date().toISOString(), types, docs }
}

const held = new Map<string, Promise<ArchiveData>>()
/** The most indexes an isolate holds (a dispatched Worker serves many sites). */
const MAX_HELD = 4

/** The KV namespace, when the Worker has one. */
async function cacheKv(): Promise<KvNamespace | null> {
  const env = await workerVars()
  return isKv(env.BACKGOLD_CACHE) ? env.BACKGOLD_CACHE : null
}

function parse(raw: string | null): ArchiveData | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as ArchiveData
    return data.format === ARCHIVE_FORMAT && Array.isArray(data.docs) ? data : null
  } catch {
    return null
  }
}

/**
 * The archive for this request's site and content version: from memory,
 * else from KV, else built and written to KV. A KV that cannot be read or
 * written only costs a rebuild.
 */
export function loadArchive(source: ArchiveSource): Promise<ArchiveData> {
  const key = archiveKey(source.siteId, source.version)
  const kept = held.get(key)
  if (kept) return kept
  const loading = (async () => {
    const kv = await cacheKv()
    const stored = kv ? parse(await kv.get(key, 'text').catch(() => null)) : null
    if (stored) return stored
    const built = await buildArchive(source.client, source.version)
    if (kv) await kv.put(key, JSON.stringify(built), { expirationTtl: INDEX_TTL_SECONDS }).catch(() => undefined)
    return built
  })()
  held.set(key, loading)
  loading.catch(() => held.delete(key))
  while (held.size > MAX_HELD) held.delete(held.keys().next().value!)
  return loading
}

/** The request's archive source from `Astro.locals.backgold`; null while the site is being set up. */
export function sourceOf(locals: App.Locals): ArchiveSource | null {
  const bg = locals.backgold
  if (bg.setup !== null) return null
  return { client: bg.client, siteId: bg.siteId, version: bg.version }
}

/**
 * The archive and this entry's document in it, for an entry layout: the
 * index's copy when it holds the entry (it always does under one content
 * version), else the entry read on its own.
 */
export async function archiveFor(locals: App.Locals, kind: ArchiveKindKey, entry: EntryDetail, base: string): Promise<{ data: ArchiveData | null; doc: ArchiveDoc }> {
  const source = sourceOf(locals)
  const data = source ? await loadArchive(source) : null
  const doc = data?.docs.find((d) => d.id === entry.id) ?? toDoc(kind, entry, base)
  return { data, doc }
}

/** Where a type's records are browsed: the money and pay views for buckets and pay records, else the type's own list. */
export const browsePath = (type: ArchiveType): string =>
  type.key === 'data_bucket' ? '/archive/money' : type.key === 'pay_record' ? '/archive/pay' : `/${type.base}`
