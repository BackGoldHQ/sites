// `@backgold/content/fs` — the filesystem cache store for a Node build step.
// Its own entry, and the only module of the package that imports node:, so
// the main bundle runs anywhere.

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CacheStore } from './contract.js'

/** A file this store wrote: the SHA-256 of its key, in hex, then `.json`. */
const STORE_FILE = /^[0-9a-f]{64}\.json$/

interface StoredFile {
  /** Unix milliseconds after which the value reads as absent; null = never. */
  expires_at: number | null
  value: string
}

/**
 * One file per key under `dir` (created on the first write), named by the
 * SHA-256 of the key, holding the value and its expiry. A write goes to a
 * temporary file renamed into place, so parallel build workers never read a
 * half-written value. An expired or unreadable file reads as absent.
 * `clear()` removes the files this store's naming rule matches and leaves
 * anything else in `dir` alone.
 */
export function fsCache(dir: string): CacheStore {
  const fileOf = (key: string) => join(dir, `${createHash('sha256').update(key, 'utf8').digest('hex')}.json`)
  return {
    async get(key) {
      const file = fileOf(key)
      let stored: StoredFile
      try {
        stored = JSON.parse(await readFile(file, 'utf8')) as StoredFile
      } catch {
        return null
      }
      if (typeof stored?.value !== 'string') return null
      if (typeof stored.expires_at === 'number' && stored.expires_at <= Date.now()) {
        await rm(file, { force: true })
        return null
      }
      return stored.value
    },
    async set(key, value, ttlSeconds) {
      await mkdir(dir, { recursive: true })
      const file = fileOf(key)
      const stored: StoredFile = { expires_at: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null, value }
      const tmp = `${file}.${randomUUID()}.tmp`
      await writeFile(tmp, JSON.stringify(stored), 'utf8')
      await rename(tmp, file)
    },
    async delete(key) {
      await rm(fileOf(key), { force: true })
    },
    async clear() {
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        return
      }
      await Promise.all(names.filter((name) => STORE_FILE.test(name)).map((name) => rm(join(dir, name), { force: true })))
    },
  }
}
