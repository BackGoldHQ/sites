import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The published build stands alone: the private workspace package never
// reaches dist/ or the shipped components, and the only bare imports are the
// declared dependencies, the peer, the two runtime-only modules, and the
// integration's Node file access (index.js only: it runs in `astro build`,
// never in the Worker). Skips
// (and says so) until `pnpm build` has run; CI builds first.
const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DIST = `${ROOT}dist/`
const BUILT = existsSync(`${DIST}index.js`)
const ALLOWED_BARE = [
  /^@backgold\/content$/,
  /^astro(\/|$)/,
  /^marked$/,
  /^parse5$/,
  /^posthog-js$/,
  /^cloudflare:workers$/,
  /^virtual:backgold\/options$/,
]

async function files(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}${entry.name}`
    if (entry.isDirectory()) out.push(...(await files(`${path}/`)))
    else out.push(path)
  }
  return out
}

function specifiers(text: string): string[] {
  const found: string[] = []
  const re = /(?:\bfrom|\bimport|\bimport\s*\(|\brequire\s*\()\s*(['"])([^'"\n]+)\1/g
  for (const match of text.matchAll(re)) found.push(match[2]!)
  return found
}

describe.skipIf(!BUILT)('dist', () => {
  it('imports no private package and only the declared bare modules', async () => {
    const shipped = [...(await files(DIST)), ...(await files(`${ROOT}components/`))]
    expect(shipped.some((f) => f.endsWith('/dist/server.js'))).toBe(true)
    for (const file of shipped) {
      for (const spec of specifiers(await readFile(file, 'utf8'))) {
        expect(spec.startsWith('@givegold/'), `${file} imports ${spec}`).toBe(false)
        const allowed = ALLOWED_BARE.some((re) => re.test(spec)) || (file === `${DIST}index.js` && spec === 'node:fs/promises')
        if (!spec.startsWith('.')) expect(allowed, `${file} imports ${spec}`).toBe(true)
      }
    }
  })

  it('ships every injected route the integration points at', async () => {
    for (const name of ['webhook', 'revalidate', 'sitemap', 'robots', 'llms', 'llms-full', 'feed']) {
      expect(existsSync(`${DIST}routes/${name}.js`), name).toBe(true)
    }
    expect(existsSync(`${DIST}render.js`), 'the components’ render module').toBe(true)
  })

  it('ships no source maps', async () => {
    expect((await files(DIST)).filter((f) => f.endsWith('.map'))).toEqual([])
  })

  it('finds the imports it guards against', () => {
    expect(specifiers(`import a from '@givegold/shared'\nawait import('cloudflare:workers')`)).toEqual(['@givegold/shared', 'cloudflare:workers'])
  })
})
