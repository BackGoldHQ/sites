#!/usr/bin/env node
// A stand-in Content API for `astro dev` on this template, serving the BISD
// archive as BackGold will once the import has run: the five archive types
// and her information_request type, their entries, terms and the site,
// read from the normalized data in the platform repository
// (docs/design/unlabeled-site-2026-10/ref).
//
//   node scripts/archive-fixture.mjs --data <ref dir> [--port 4390] [--empty]
//
// then point the template at it in templates/unlabeled/.dev.vars:
//
//   BACKGOLD_SITE_KEY=bg_site_pk_archivefixture0000
//   BACKGOLD_API_ORIGIN=http://127.0.0.1:4390
//
// Answers only GET under /api/content/v1, with the content version on
// every answer, 50 entries a page and `?q=` over titles and summaries as
// the api does. Field values are the normalized file's; reference fields
// are `{ kind: 'entry', label, slug }`, as the api writes them. `--empty`
// serves an organization with none of the archive's types, to see the
// archive's pages degrade.

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { siteExample } from '@backgold/contract/content-api-examples'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}
const dataDir = arg('--data')
if (!dataDir) {
  process.stderr.write('--data names the folder holding archive-normalized.json and existing-information-requests.json\n')
  process.exit(2)
}
const port = Number(arg('--port', '4390'))
const VERSION = Number(arg('--version', '500'))
const SITE_KEY = 'bg_site_pk_archivefixture0000'
const EMPTY = process.argv.includes('--empty')

const normalized = JSON.parse(readFileSync(join(dataDir, 'archive-normalized.json'), 'utf8'))
const requests = JSON.parse(readFileSync(join(dataDir, 'existing-information-requests.json'), 'utf8'))

const slugify = (label) => label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Her information_request type, as brief §4.2 lists its fields.
const informationRequest = {
  key: 'information_request',
  singular_label: 'Records request',
  plural_label: 'Records requests',
  routable: true,
  url_base: 'records',
  fields: [
    { key: 'requested_from', label: 'Requested from', kind: 'short_text' },
    { key: 'status', label: 'Status', kind: 'choice', choices: ['Waiting on a response', 'Fulfilled', 'Denied'] },
    { key: 'requested_on', label: 'Requested on', kind: 'date' },
    { key: 'responded_on', label: 'Responded on', kind: 'date' },
    { key: 'what_we_asked_for', label: 'What we asked for', kind: 'long_text' },
    { key: 'request_email', label: 'Request email', kind: 'image' },
    { key: 'what_came_back', label: 'What came back', kind: 'long_text' },
    { key: 'records_provided', label: 'Records provided', kind: 'long_text' },
    { key: 'response_document', label: 'Response document', kind: 'pdf' },
  ],
}

const types = (EMPTY ? [] : [...normalized.content_types.types, informationRequest]).map((t) => ({
  key: t.key,
  singular_label: t.singular_label,
  plural_label: t.plural_label,
  routable: true,
  url_base: t.url_base,
  built_in: false,
  index: null,
  fields: t.fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind, required: Boolean(f.required), ...(f.choices ? { choices: f.choices } : {}) })),
}))
const typeOf = new Map(types.map((t) => [t.key, t]))
const taxonomies = new Map(normalized.content_types.taxonomies.map((t) => [t.key, t]))
const term = (taxonomy, label) => ({ taxonomy, slug: slugify(label), label })

const meetingTitle = new Map(normalized.board_meeting.map((m) => [m.slug, m.title]))
const ref = (slug) => (slug ? { kind: 'entry', label: meetingTitle.get(slug) ?? slug, slug } : null)

/** Every entry, as the api's detail answers it, newest first per type. */
const details = new Map()
let n = 0
const add = (typeKey, raw, { fields, terms = [], publishAt = null, summary = raw.summary ?? null }) => {
  const type = typeOf.get(typeKey)
  const keys = type.fields.map((f) => f.key)
  const kept = Object.fromEntries(keys.map((k) => [k, fields[k] ?? null]))
  for (const f of type.fields) if (f.kind === 'reference') kept[f.key] = ref(kept[f.key])
  const entry = {
    id: `ci_fx${String(++n).padStart(4, '0')}`,
    slug: raw.slug,
    type: typeKey,
    title: raw.title,
    summary,
    url: `/${type.url_base}/${encodeURIComponent(raw.slug)}`,
    hero: null,
    media_url: null,
    publish_at: publishAt,
    updated_at: publishAt ?? '2026-10-20T00:00:00.000Z',
    terms,
    authors: [],
    access: 'public',
    locked: false,
    lock: null,
    duration_seconds: null,
    renditions: null,
    body: { markdown: '' },
    fields: kept,
  }
  if (!details.has(typeKey)) details.set(typeKey, [])
  details.get(typeKey).push(entry)
}
const at = (day) => (day ? `${day}T17:00:00.000Z` : null)

if (!EMPTY) {
for (const m of normalized.board_meeting) add('board_meeting', m, { fields: m, publishAt: at(m.meeting_date), summary: null })
for (const d of normalized.board_decision) {
  add('board_decision', d, {
    fields: d.fields,
    terms: [term('decision_category', d.category), ...d.campuses.map((c) => term('campus', c))],
    publishAt: at(d.fields.decided_on),
  })
}
for (const b of normalized.data_bucket) add('data_bucket', b, { fields: b.fields, terms: b.campuses.map((c) => term('campus', c)), publishAt: at('2026-09-19') })
for (const p of normalized.pay_record) add('pay_record', p, { fields: p.fields, terms: [term('district_office', p.office)], publishAt: at('2026-09-19') })
for (const s of normalized.source_document) add('source_document', s, { fields: s, publishAt: at(s.meeting ?? '2026-09-19') })
for (const r of requests) {
  // The reference copy holds the pdf's media id; the api answers a pdf field as its file.
  const fields = { ...r.data, response_document: r.data.response_document ? { url: `http://127.0.0.1:${port}/media/${r.data.response_document}.pdf`, file_name: `${r.slug}.pdf`, size_bytes: null } : null }
  add('information_request', r, { fields, publishAt: r.publish_at })
}
}
for (const list of details.values()) list.sort((a, b) => (b.publish_at ?? '').localeCompare(a.publish_at ?? '') || (a.id < b.id ? 1 : -1))

const listed = ({ body: _b, fields: _f, ...rest }) => rest
const emptyAreas = {}
const site = { ...siteExample.site, id: 'site_unlabeled_fixture', name: 'Unlabeled', domain: 'unlabeledtexas.com', mode: 'headless' }
const pages = [
  { id: 'lp_home', slug: 'home', title: 'Home', url: '/', is_home: true, published_at: '2026-09-30T14:00:00.000Z', updated_at: '2026-10-01T09:12:00.000Z', takes_donations: false },
  { id: 'lp_flock', slug: 'flock-blockers', title: 'Flock Blockers', url: '/flock-blockers', is_home: false, published_at: '2026-09-30T14:00:00.000Z', updated_at: '2026-10-01T09:12:00.000Z', takes_donations: false },
]
const menuLink = (id, label, url) => ({ id, label, kind: 'external', target: { kind: 'external', url }, url, external: false, header_button: false, shows_on: { rule: 'every_page' }, children: [] })
const menuItems = [menuLink('nav_home', 'Home', '/'), menuLink('nav_archive', 'Archive', '/archive'), menuLink('nav_records', 'Records', '/records')]

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture')
  const headers = { 'Content-Type': 'application/json', 'X-Content-Version': String(VERSION), ETag: `"v${VERSION}"`, 'Access-Control-Allow-Origin': '*' }
  const send = (status, body) => {
    res.writeHead(status, headers)
    res.end(JSON.stringify(body))
  }
  if (url.pathname.startsWith('/media/')) {
    res.writeHead(200, { 'Content-Type': 'application/pdf' })
    return res.end('%PDF-1.4\n% fixture stand-in\n')
  }
  if (!url.pathname.startsWith('/api/content/v1/')) return send(404, { error: 'Not found', code: 'NOT_FOUND' })
  if ((req.headers.authorization ?? '') !== `Bearer ${SITE_KEY}`) return send(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' })
  if (req.headers['if-none-match'] === `"v${VERSION}"`) {
    res.writeHead(304, headers)
    return res.end()
  }
  const parts = url.pathname.slice('/api/content/v1/'.length).split('/').filter(Boolean).map(decodeURIComponent)
  const missing = () => send(404, { error: 'Not found', code: 'NOT_FOUND' })
  switch (parts[0]) {
    case 'site':
      return send(200, { site, legal: { disclaimer: 'Contributions or gifts to Unlabeled are not deductible as charitable contributions for federal income tax purposes.', required: true }, version: VERSION, org_name: 'Unlabeled' })
    case 'menus':
      return send(200, { menu: { key: parts[1] }, items: parts[1] === 'primary' ? menuItems : [] })
    case 'pages':
      if (parts[1] === undefined) return send(200, { pages })
      // Home holds the archive's door (StatCards' `archive` layout, src/archive.ts).
      if (parts[1] === 'home') {
        const door = { id: 'StatCards-1', type: 'StatCards', band: 'plain', bleed: 'full', variant: 'archive', copy: {}, media: {}, links: [], options: {} }
        return send(200, { page: { ...pages[0], meta: { title: 'Unlabeled', description: null, image_url: null } }, sections: [door], areas: emptyAreas })
      }
      return missing()
    case 'types':
      return send(200, { types })
    case 'redirects':
      return send(200, { redirects: [] })
    case 'areas':
      return send(200, { areas: emptyAreas })
    case 'authors':
      return send(200, { authors: [] })
    case 'sitemap':
      return send(200, { urls: [] })
    case 'terms': {
      const tax = taxonomies.get(parts[1])
      if (!tax) return missing()
      return send(200, { taxonomy: { key: tax.key, label: tax.label, hierarchical: false }, terms: tax.terms.map((label, i) => ({ id: `term_${tax.key}_${i}`, slug: slugify(label), label, parent_id: null, position: i })) })
    }
    case 'entries': {
      const list = details.get(parts[1])
      if (!list) return missing()
      if (parts[2] !== undefined) {
        const entry = list.find((e) => e.slug === parts[2])
        return entry ? send(200, { entry, areas: emptyAreas }) : missing()
      }
      let rows = list
      const termSlug = url.searchParams.get('term')
      if (termSlug) rows = rows.filter((e) => e.terms.some((t) => t.slug === termSlug))
      const q = url.searchParams.get('q')?.trim().toLowerCase()
      if (q) rows = rows.filter((e) => `${e.title} ${e.summary ?? ''}`.toLowerCase().includes(q)).slice(0, 20)
      const limit = Math.min(50, Number(url.searchParams.get('limit') ?? (q ? 20 : 20)))
      const start = Number(url.searchParams.get('cursor') ?? 0) || 0
      const page = q ? rows : rows.slice(start, start + limit)
      const next = !q && start + limit < rows.length ? String(start + limit) : null
      return send(200, { entries: page.map(listed), next_cursor: next, areas: emptyAreas })
    }
    default:
      return missing()
  }
})
server.listen(port, '127.0.0.1', () => {
  const counts = [...details].map(([k, v]) => `${k} ${v.length}`).join(', ')
  process.stdout.write(`archive fixture on http://127.0.0.1:${port} (version ${VERSION}): ${counts}\n`)
})
