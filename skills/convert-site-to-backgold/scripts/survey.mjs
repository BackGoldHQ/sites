#!/usr/bin/env node
// Surveys a site's source before it is converted to a BackGold custom site:
// what it is built with, the addresses it answers, the forms it has, what
// runs on a server, the cookies and caches it uses, the services it calls,
// the settings it reads, and where its facts (phone numbers, emails, prices)
// are typed. It reads files and prints Markdown; it changes nothing and runs
// nothing from the site.
//
//   node survey.mjs [directory]        (default: the current directory)
//
// It is a starting list, not the whole truth: read the files it points at.
// A pattern it does not know (a route made in code, a form built by a
// library) will not show, so open the site as well.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`usage: node survey.mjs [directory]\n${root} is not a directory`)
  process.exit(2)
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.astro', '.svelte-kit', '.wrangler', '.vercel', '.netlify', '.cache', 'coverage', 'vendor'])
const CODE = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.astro', '.vue', '.svelte', '.html', '.htm', '.md', '.mdx', '.njk', '.liquid', '.hbs', '.ejs', '.php'])
const MAX_BYTES = 600_000

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || (entry.name.startsWith('.') && entry.name !== '.github')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (entry.isFile()) out.push(path)
  }
  return out
}

const files = walk(root)
const rel = (file) => relative(root, file).split(sep).join('/')
const read = (file) => {
  try {
    return statSync(file).size > MAX_BYTES ? '' : readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}
const sources = files.filter((f) => CODE.has(extname(f))).map((f) => ({ path: rel(f), text: read(f) }))
const has = (name) => existsSync(join(root, name))
const json = (name) => {
  try {
    return JSON.parse(readFileSync(join(root, name), 'utf8'))
  } catch {
    return null
  }
}

// ── What it is built with ───────────────────────────────────────────────────

const pkg = json('package.json')
const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
const builtWith = []
for (const [name, label] of [
  ['astro', 'Astro'],
  ['next', 'Next.js'],
  ['nuxt', 'Nuxt'],
  ['gatsby', 'Gatsby'],
  ['@remix-run/react', 'Remix'],
  ['@sveltejs/kit', 'SvelteKit'],
  ['@11ty/eleventy', 'Eleventy'],
  ['vite', 'Vite'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['express', 'Express'],
  ['hono', 'Hono'],
  ['wrangler', 'Cloudflare Workers (wrangler)'],
  ['tailwindcss', 'Tailwind CSS'],
  ['gsap', 'GSAP'],
]) {
  if (deps[name]) builtWith.push(`${label} ${deps[name]}`)
}
if (has('hugo.toml') || has('config.toml')) builtWith.push('Hugo (a config .toml)')
if (has('_config.yml')) builtWith.push('Jekyll (_config.yml)')
if (!pkg && sources.some((s) => s.path.endsWith('.html'))) builtWith.push('plain HTML')
const already = ['@backgold/astro', '@backgold/content', '@backgold/cli'].filter((name) => deps[name])

// ── Addresses ────────────────────────────────────────────────────────────────

const PAGE_EXT = /\.(astro|tsx|jsx|ts|js|vue|svelte|md|mdx|html|htm|njk|liquid|php)$/
function addressOf(path) {
  let m
  if ((m = /^(?:src\/)?app\/(.*?)\/?page\.(?:tsx|jsx|ts|js|mdx)$/.exec(path))) return `/${m[1]}`.replace(/\/\([^)]*\)/g, '').replace(/\/$/, '') || '/'
  if ((m = /^(?:src\/)?pages\/(.+)$/.exec(path)) && PAGE_EXT.test(m[1])) {
    if (/^(_|api\/)/.test(m[1])) return null
    return `/${m[1].replace(PAGE_EXT, '')}`.replace(/\/index$/, '') || '/'
  }
  if ((m = /^(?:src\/)?routes\/(.*?)\/?\+page\.svelte$/.exec(path))) return `/${m[1]}` || '/'
  if ((m = /^(?:public\/|static\/|src\/|site\/|www\/)?(.+)\.html?$/.exec(path)) && !/^(src\/)?(components|layouts|partials|includes|_includes)\//.test(path)) {
    return `/${m[1]}`.replace(/\/index$/, '').replace(/^\/index$/, '/') || '/'
  }
  return null
}
const addresses = new Map()
for (const { path } of sources) {
  const address = addressOf(path)
  if (address && !addresses.has(address)) addresses.set(address, path)
}

// ── What runs on a server ────────────────────────────────────────────────────

const serverRoutes = sources
  .map((s) => s.path)
  .filter((p) => /(^|\/)(pages\/api\/|app\/api\/.*route\.|functions\/|api\/[^/]+\.(js|ts|mjs)$|netlify\/functions\/)/.test(p) || /(^|\/)(server|worker|_worker)\.(js|ts|mjs)$/.test(p) || /^worker\//.test(p))
const endpoints = sources.filter((s) => /^src\/pages\/.*\.(ts|js)$/.test(s.path) && !/pages\/api\//.test(s.path)).map((s) => s.path)

// ── Patterns in the source ───────────────────────────────────────────────────

function grep(pattern, { limit = 12, show = (m) => m[0] } = {}) {
  const hits = []
  for (const { path, text } of sources) {
    // A README describes the site; it is not the site.
    if (/(^|\/)(README|CHANGELOG|LICENSE|CONTRIBUTING)[^/]*$/i.test(path)) continue
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = pattern.exec(lines[i])
      if (m) hits.push({ where: `${path}:${i + 1}`, what: String(show(m)).trim().slice(0, 110) })
    }
  }
  return { total: hits.length, hits: hits.slice(0, limit) }
}
const unique = (values) => [...new Set(values)].sort()
const all = (pattern, pick = 1) => unique(sources.flatMap(({ text }) => [...text.matchAll(pattern)].map((m) => m[pick])))

const forms = grep(/<form\b[^>]*>/i)
const posts = grep(/fetch\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*\{[^}]*method:\s*['"](?:POST|PUT|PATCH)/i, { show: (m) => `POST ${m[1]}` })
const cookies = grep(/document\.cookie|cookies\(\)|Astro\.cookies|req\.cookies|res\.cookie\(|['"]Set-Cookie['"]|getCookie|setCookie/)
const caches = grep(/caches\.default|caches\.open|\.kv\b|KVNamespace|env\.[A-Z_]*(?:KV|CACHE|DB|BUCKET|QUEUE)\b|D1Database|R2Bucket/)
const apiCalls = grep(/['"`]\/api\/[^'"`\s)]*/, { show: (m) => m[0].slice(1) })
const outside = all(/fetch\(\s*[`'"]https?:\/\/([^/`'"\s]+)/g)
const frames = all(/<iframe[^>]+src=["'](https?:\/\/[^/"']+)/gi)
const scripts = all(/<script[^>]+src=["'](https?:\/\/[^/"']+)/gi)
const envNames = unique([
  ...all(/process\.env\.([A-Z][A-Z0-9_]+)/g),
  ...all(/import\.meta\.env\.([A-Z][A-Z0-9_]+)/g),
  ...all(/\benv\.([A-Z][A-Z0-9_]{2,})/g),
]).filter((name) => !['NODE_ENV', 'DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL'].includes(name))

// Facts typed into the source: what should move into BackGold.
const phones = grep(/(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/)
const emails = grep(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)
const prices = grep(/\$\s?\d[\d,]*(?:\.\d{2})?\b/)
const telLinks = grep(/(?:tel|sms):\+?[\d-]{7,}/)
const pricedData = grep(/\b(?:price|cost|rate|amount|fee)\w*['"]?\s*[:=]\s*['"]?\$?\d/i)

const dataFiles = files
  .map(rel)
  .filter((p) => /(^|\/)(data|content|_data|collections|posts|blog)\//.test(p) && /\.(json|ya?ml|md|mdx|ts|js|csv)$/.test(p))
const byDir = new Map()
for (const p of dataFiles) {
  const dir = p.split('/').slice(0, -1).join('/')
  byDir.set(dir, (byDir.get(dir) ?? 0) + 1)
}

const redirects = ['_redirects', 'public/_redirects', 'vercel.json', 'netlify.toml', 'next.config.js', 'next.config.mjs', 'next.config.ts', 'firebase.json']
  .filter(has)
  .filter((name) => /redirect/i.test(read(join(root, name))) || name.endsWith('_redirects'))

// ── Report ───────────────────────────────────────────────────────────────────

const out = []
const section = (title) => out.push('', `## ${title}`, '')
const list = (rows, none = 'None found.') => out.push(...(rows.length ? rows.map((r) => `- ${r}`) : [none]))
const hitsOf = ({ total, hits }, none) => {
  list(hits.map((h) => `\`${h.where}\` ${h.what}`), none)
  if (total > hits.length) out.push(`- … and ${total - hits.length} more`)
}

out.push(`# Survey of ${basename(root)}`, '', `${files.length} files read under ${root}.`)

section('Built with')
list(builtWith, 'Nothing recognized: read package.json and the build scripts.')
if (already.length) out.push('', `Already depends on ${already.join(', ')}: this may be a BackGold site, or a headless one to move onto BackGold hosting.`)
if (pkg?.scripts) out.push('', 'Scripts: ' + Object.entries(pkg.scripts).map(([k, v]) => `\`${k}\` (${String(v).slice(0, 60)})`).join(', '))

section(`Addresses (${addresses.size})`)
out.push('Each becomes a BackGold page, an entry of a content type, a post, or a route of the site’s own. A file with `[brackets]` is one address per item of some data.', '')
list([...addresses].sort(([a], [b]) => a.localeCompare(b)).map(([address, path]) => `\`${address}\` — ${path}`), 'None found by file name: the routes are made in code. Open the site.')

section('Runs on a server')
out.push('BackGold keeps `/api` (and `/privacy`, `/sms-terms`, `/health`, `/ingest`, `/webhooks`, `/.well-known`) on every site it hosts. A form’s endpoint goes away (a Form section replaces it); anything else moves to an address outside `/api`.', '')
list([...serverRoutes, ...endpoints].map((p) => `\`${p}\``))
if (apiCalls.total) {
  out.push('', 'Calls to `/api/…` from the pages:')
  hitsOf(apiCalls)
}

section(`Forms (${forms.total + posts.total})`)
out.push('Each becomes a Form section in BackGold with the same fields. List each form’s fields and where it sends them.', '')
hitsOf(forms, 'No `<form>` found.')
if (posts.total) hitsOf(posts)

section('Cookies')
out.push('No cookie reaches a BackGold custom site’s server code, and none it sets reaches the visitor. A preference kept by script in the browser still works; a sign-in, or a page that changes on the server by cookie, cannot be carried over.', '')
hitsOf(cookies)

section('Caches, databases and other bindings')
out.push('BackGold hosting gives the site no KV, D1, R2, queue or `caches.default`.', '')
hitsOf(caches)

section('Services it calls or embeds')
list([...outside.map((h) => `fetches ${h}`), ...frames.map((h) => `frames ${h}`), ...scripts.map((h) => `loads a script from ${h}`)])

section('Settings it reads')
out.push('Secrets for forms, mail and spam checks go away with those routes. A value the site still needs is a text `var` in wrangler.jsonc, or `backgold secrets set NAME`.', '')
list(envNames.map((n) => `\`${n}\``))

section('Facts typed into the source')
out.push('Anything the owner might change belongs in BackGold. These are where to look; the same fact is often typed in many files.', '')
out.push(`Phone numbers: ${phones.total}`)
hitsOf(phones, '')
out.push('', `Email addresses: ${emails.total}`)
hitsOf(emails, '')
out.push('', `\`tel:\` and \`sms:\` links with the number typed in: ${telLinks.total}`)
hitsOf(telLinks, '')
out.push('', `Prices: ${prices.total}`)
hitsOf(prices, '')
out.push('', `Prices kept as numbers in data: ${pricedData.total}`)
hitsOf(pricedData, '')

section('Data and content files')
out.push('A folder of like files is usually a content type (or posts).', '')
list([...byDir].sort(([, a], [, b]) => b - a).map(([dir, n]) => `\`${dir}/\` — ${n} file${n === 1 ? '' : 's'}`))

section('Redirects')
out.push('Carry them into the site’s redirects in BackGold.', '')
list(redirects.map((r) => `\`${r}\``))

console.log(out.join('\n'))
