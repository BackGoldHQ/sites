#!/usr/bin/env node
// The starter template (or another template under templates/) and the two
// packages it is built on, end to end on workerd: builds @givegold/shared,
// @backgold/content and @backgold/astro, packs the two public packages,
// installs them into a copy of the template outside the repository (so
// nothing resolves through the pnpm workspace), builds it, and runs it on
// `wrangler dev` against a fixture Content API served from
// CONTENT_API_EXAMPLES. Exits non-zero at the first failed check.
//
//   node scripts/starter-e2e.mjs          run, then delete the temp copy
//   node scripts/starter-e2e.mjs --template party
//                                         the same checks on templates/party
//                                         (default: templates/astro-starter);
//                                         combines with every flag below
//   node scripts/starter-e2e.mjs --keep   leave it (and print where it is)
//   node scripts/starter-e2e.mjs --serve  skip the checks: keep the fixture api
//                                         and the configured site running until
//                                         Ctrl-C, to look at it in a browser
//   node scripts/starter-e2e.mjs --lighthouse
//                                         also score home and an entry page with
//                                         Lighthouse (performance, accessibility,
//                                         SEO >= 95); needs Chrome at $CHROME_BIN
//
// Needs node >= 22.12, pnpm and npm. No dependencies beyond node's own.

import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { accessSync, constants as fsConstants, cpSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE_FLAG = process.argv.indexOf('--template')
const TEMPLATE_NAME = TEMPLATE_FLAG === -1 ? 'astro-starter' : process.argv[TEMPLATE_FLAG + 1]
if (!TEMPLATE_NAME || !/^[a-z0-9][a-z0-9-]*$/.test(TEMPLATE_NAME)) {
  process.stderr.write('--template takes the name of a directory under templates/, for example --template party\n')
  process.exit(2)
}
const TEMPLATE = join(ROOT, 'templates', TEMPLATE_NAME)
// The party template draws what its boards need from the Content API (live
// counts, event types, news search, seats, the roster's levels); only it is
// checked for those drawings.
const PARTY = TEMPLATE_NAME === 'party'
const SERVE = process.argv.includes('--serve')
const KEEP = SERVE || process.argv.includes('--keep')
const LIGHTHOUSE = process.argv.includes('--lighthouse')
const LIGHTHOUSE_VERSION = '13.5.0'
const LIGHTHOUSE_MIN = 95

// Shaped like the keys BackGold mints; they open nothing.
const SITE_KEY = 'bg_site_pk_e2etestpublishable0000'
const SECRET_KEY = 'bg_site_sk_e2etestsecret00000000000'
const WEBHOOK_SECRET = 'whsec_e2etestsigningsecret0000000000'
const PREVIEW_TOKEN = 'tok_e2e_draft'
// Appended to PATH for the build; the built Worker must not contain it. Astro
// inlines an environment variable into any server module that reads the
// whole `import.meta.env` and mentions the variable's name (PATH is in
// SETUP_PATH), so a build-time secret could end up in the bundle.
const BUILD_CANARY = `bg-build-env-canary-${process.pid}`
// The example's Top banner item ends on a fixed day; the fixture moves its
// `until` a month past the run so the item is always still current.
const BANNER_UNTIL = new Date(Date.now() + 30 * 86400000).toISOString()

const children = new Set()
const servers = new Set()
let work

function log(message) {
  process.stdout.write(`${message}\n`)
}

class CheckFailed extends Error {}

function check(condition, message) {
  if (!condition) throw new CheckFailed(message)
  log(`  ok  ${message}`)
}

function run(command, args, cwd, extraEnv = {}) {
  log(`$ ${command} ${args.join(' ')}   (in ${cwd})`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
}

/**
 * A child run while this process must keep answering: the fixture Content API
 * is an http server in this same process, so a synchronous spawn would stop it
 * from answering the Worker until the child exits. Output is collected and
 * printed whole when the child fails.
 */
function runAsync(command, args, cwd) {
  log(`$ ${command} ${args.join(' ')}   (in ${cwd})`)
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, detached: true })
    children.add(child)
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('error', (error) => {
      children.delete(child)
      reject(error)
    })
    child.on('close', (code) => {
      children.delete(child)
      if (code === 0) resolveRun(output)
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}\n${output.trimEnd()}`))
    })
  })
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

// ── 1. Build and pack ────────────────────────────────────────────────────────

function buildAndPack(packDir) {
  run('pnpm', ['--filter', '@givegold/shared', 'build'], ROOT)
  run('pnpm', ['--filter', '@backgold/content', 'build'], ROOT)
  run('pnpm', ['--filter', '@backgold/astro', 'build'], ROOT)
  run('pnpm', ['pack', '--pack-destination', packDir], join(ROOT, 'packages/content-client'))
  run('pnpm', ['pack', '--pack-destination', packDir], join(ROOT, 'packages/astro-backgold'))
  const files = readdirSync(packDir)
  const content = files.find((f) => /^backgold-content-.*\.tgz$/.test(f))
  const astro = files.find((f) => /^backgold-astro-.*\.tgz$/.test(f))
  if (!content || !astro) throw new Error(`pnpm pack wrote ${files.join(', ')}`)
  return { content: join(packDir, content), astro: join(packDir, astro) }
}

// ── 2. The template, installed from the tarballs ─────────────────────────────

function installTemplate(siteDir, tarballs) {
  cpSync(TEMPLATE, siteDir, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|dist|\.astro|\.wrangler)([\\/]|$)/.test(src) && !/[\\/]\.dev\.vars$/.test(src),
  })
  const pkgPath = join(siteDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const content = `file:${tarballs.content}`
  const astro = `file:${tarballs.astro}`
  pkg.dependencies['@backgold/content'] = content
  pkg.dependencies['@backgold/astro'] = astro
  // @backgold/astro depends on @backgold/content ^0.2.0; the override makes
  // that the tarball too, never the copy on npm.
  pkg.overrides = { '@backgold/content': content }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], siteDir)
  run('npm', ['run', 'build'], siteDir, { PATH: `${process.env.PATH}${delimiter}/${BUILD_CANARY}` })
  run('npm', ['run', 'check'], siteDir)
}

/** Every file under `dir`, recursively. */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesUnder(join(dir, d.name)) : [join(dir, d.name)]))
}

// ── 3. The fixture Content API ───────────────────────────────────────────────

// ── The kitchen sink: one block of every type, through the api's own projection ──

/**
 * A Puck document with one block of every non-chrome type in
 * CONTENT_API_BLOCKS, its props as the hosted builder writes them
 * (packages/site/src/puck.config.tsx defaults and fields) and, for data
 * blocks, as the api's bake fills them (packages/api/src/routes/landing-pages-ssr.ts).
 */
function kitchenSinkDocument() {
  const asset = (name) => `/api/lp-assets/ks/${name}`
  const block = (type, props) => ({ type, props: { id: `${type}-ks`, ...props } })
  return {
    content: [
      block('Hero', {
        headline: 'Every block on one page',
        subheadline: 'A test page that carries one section of each kind.',
        layout: 'split',
        imageUrl: asset('hero.webp'),
        ctaText: 'Chip in',
        donateHref: '/donate',
        // The capture on: the bake gives the hero the served page's id, and
        // the projection frames its form as the section's embed.
        showSignup: true,
        signupButtonText: 'Count me in',
        pageId: 'lp_ks',
      }),
      block('About', {
        heading: 'About the committee',
        body: 'Neighbors who read the budget line by line.\n\nWe meet on the first Tuesday of each month.',
        photoUrl: asset('about.webp'),
        photoSide: 'left',
      }),
      block('Issues', {
        kicker: 'Platform',
        heading: 'What we will do',
        lead: 'Three promises with numbers attached.',
        style: 'cards',
        columns: '3',
        items: [
          { title: 'Freeze the levy', body: 'No increase for four years.', icon: 'shield' },
          { title: 'Open the books', body: 'Every check online within a week.', icon: 'book' },
          { title: 'Classrooms first', body: 'Administration grows no faster than enrollment.', icon: 'school' },
        ],
        ctas: [
          { label: 'Read the plan', href: '/plan', style: 'primary' },
          { label: 'Ask a question', href: 'https://example.org/ask', style: 'outline' },
        ],
      }),
      block('StatCards', {
        heading: 'By the numbers',
        tiles: [
          { label: 'Doors knocked', value: '4,210', note: 'Since June', accent: true },
          { label: 'Volunteers', value: '312', note: '', accent: false },
          { label: 'Precincts covered', value: '58', note: 'Of 64', accent: false },
        ],
      }),
      block('Cta', {
        eyebrow: 'Join in',
        heading: 'Knock doors this Saturday',
        body: 'We meet at nine and finish by noon.',
        donateButtonText: 'Donate',
        donateHref: '/donate',
        volunteerButtonText: 'Volunteer',
        volunteerUrl: '/volunteer',
        layout: 'card',
      }),
      block('QuoteStrip', {
        heading: 'What neighbors say',
        items: [
          { quote: 'I finally know where the money goes.', attribution: 'A parent in Ward 3' },
          { quote: 'The meetings are short and useful.', attribution: 'A retired teacher' },
        ],
      }),
      block('Map', {
        geoId: 'tx-counties',
        heading: 'Where we are organized',
        litLabel: 'Organized',
        darkLabel: 'Help us start',
        rows: 'Alder County, lit\nBirch County, lit, https://example.org/birch\n# a comment line\nCedar County, dark',
        charterCtaText: 'Start a chapter',
        charterCtaHref: '/charter',
        organizerText: 'Talk to an organizer',
        organizerHref: 'mailto:organize@example.org',
      }),
      block('MovementMap', {
        kicker: 'Mapped',
        heading: 'Cameras on our streets',
        badgeNoun: 'cameras',
        datasetPreset: 'alpr',
        categoryProperty: 'category',
        uncategorizedLabel: 'Unattributed',
        sourceLabel: 'OpenStreetMap',
        sourceHref: 'https://www.openstreetmap.org',
        statTiles: [
          { label: 'Cameras mapped', value: 'auto:total', note: '' },
          { label: 'Counties with cameras', value: '17', note: 'From public records' },
        ],
      }),
      block('VideoEmbed', {
        url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        caption: 'The levy in two minutes',
        orientation: 'landscape',
      }),
      block('PdfEmbed', { pdfUrl: asset('budget.pdf'), title: 'The budget we propose', caption: 'Twelve pages, every line explained.', height: 'medium' }),
      // Baked: lastKnownRaisedCents from the campaign, goalCents as authored.
      block('Progress', { campaignId: 'cmp_1', lastKnownRaisedCents: 1840000, goalCents: 5000000 }),
      // Baked from the campaign's election date: zone-less local wall clock.
      block('Countdown', { heading: 'Until election day', source: 'election', deadline: '2026-11-03T20:00' }),
      block('Leaderboard', { campaignId: 'cmp_1', heading: 'Top supporters', limit: 10 }),
      block('SocialFeed', { campaignId: 'cmp_1', heading: 'From our feed', maxPosts: 5 }),
      block('MovementTicker', {
        heading: 'The movement so far',
        kinds: 'both',
        showTotal: true,
        statTiles: [
          { value: 'auto:contributions', label: 'Gifts this month' },
          { value: '1,950', label: 'Signatures delivered' },
        ],
        orgSlug: 'pine-valley',
      }),
      block('EventsList', {
        heading: 'Upcoming events',
        max: 6,
        actions: 'buttons',
        events: [
          { id: 'evt_1', title: 'Budget night', startsAt: '2026-10-15T23:00:00.000Z', endsAt: '2026-10-16T01:00:00.000Z', location: 'Main Street Library', type: 'meeting', timezone: 'America/Chicago', href: 'https://events.example.org/budget-night?via=page&via_page=lp_ks' },
          { id: 'evt_2', title: 'Saturday canvass', startsAt: '2026-10-17T14:00:00.000Z', location: 'Riverside Park', timezone: 'America/Chicago', href: 'https://events.example.org/saturday-canvass?via=page&via_page=lp_ks' },
          { id: 'evt_3', title: 'Online phone bank', startsAt: '2026-10-20T00:00:00.000Z', isVirtual: true, timezone: 'America/Chicago', registrationClosed: true, href: 'https://events.example.org/phone-bank?via=page&via_page=lp_ks' },
          // Standard time, then a zone Intl does not know (shown in UTC).
          { id: 'evt_4', title: 'Winter potluck', startsAt: '2027-01-14T00:30:00.000Z', location: 'Grange Hall', timezone: 'America/Chicago', href: 'https://events.example.org/winter-potluck?via=page&via_page=lp_ks' },
          { id: 'evt_5', title: 'Mars mixer', startsAt: '2026-10-22T23:00:00.000Z', isVirtual: true, timezone: 'Mars/Olympus', href: 'https://events.example.org/mars-mixer?via=page&via_page=lp_ks' },
        ],
      }),
      block('Blog', { heading: 'Latest posts', kindFilter: 'all', maxItems: 3, orgSlug: 'pine-valley', siteId: 'cd_8f2a' }),
      block('Collection', {
        heading: 'Endorsements so far',
        type: 'endorsement',
        layout: 'cards',
        term: '',
        limit: 6,
        orgSlug: 'pine-valley',
        siteId: 'cd_8f2a',
        pluralLabel: 'Endorsements',
        moreHref: '/endorsements',
        entries: [
          { slug: 'maple-hollow-neighbors', title: 'Maple Hollow Neighbors Council', summary: 'A neighborhood council backs the levy freeze.', hero_url: asset('maple.webp'), publish_at: '2026-09-25T10:00:00.000Z', href: '/endorsements/maple-hollow-neighbors', terms: [{ label: 'Neighborhoods' }], authors: [{ name: 'Robin Ash', role_label: 'Written by' }] },
          { slug: 'quarry-road-association', title: 'Quarry Road Association', summary: 'Homeowners sign on.', hero_url: null, publish_at: '2026-09-18T10:00:00.000Z', href: '/endorsements/quarry-road-association', terms: [], authors: [] },
        ],
      }),
      block('ContentPost', { contentSlug: 'levy-explained', heading: 'Featured post', showTitle: true, showDate: true, postTitle: 'The levy, explained', postKind: 'article', postDate: '2026-09-29T12:00:00.000Z', postHtml: '<p>Every dollar…</p>' }),
      block('PlatformPlanks', {
        heading: 'Our platform',
        sections: [
          { title: 'Taxes', planks: [{ headline: 'Freeze the levy', plain: 'No increase for four years.', full: 'The district levy stays at its current rate through 2030.' }, { headline: 'Publish every check', plain: 'Spending online within a week.' }] },
          { title: 'Schools', planks: [{ headline: 'Classrooms first', plain: 'Administration grows no faster than enrollment.' }] },
        ],
      }),
      block('CandidateRoster', {
        heading: 'Candidates we back',
        showFilters: false,
        entries: [
          { name: 'Jordan Vale', office: 'School Board', region: 'District 3', status: 'On the ballot', webUrl: 'https://example.org/vale', photoUrl: asset('vale.webp') },
          { name: 'Casey Reed', office: 'County Commission', region: 'Precinct 2', status: 'Running' },
        ],
      }),
      block('TeamGrid', {
        heading: 'The team',
        showOpenRoles: true,
        interestUrl: '/volunteer',
        interestButtonText: 'Tell us you are interested',
        teamOpenRolesIntro: 'We are looking for help with these.',
        pageId: 'lp_ks',
        exec: [
          { name: 'Avery Lin', role: 'Chair', bio: 'Reads every budget line twice.', photoUrl: 'https://api.backgold.com/api/media-files/med_avery' },
          { name: 'Morgan Price', role: 'Treasurer', linkUrl: 'https://example.org/morgan' },
        ],
        staff: [{ name: 'Sam Ortiz', role: 'Organizer', dept: 'Field' }],
        open: [{ role: 'Data volunteer', dept: 'Research', blurb: 'Help us post the checks.', linkUrl: '/volunteer' }],
      }),
      // Compliance: each frames what BackGold serves, or carries only its heading.
      block('Donate', { heading: 'Chip in', presetAmounts: '10,25,50', donationFormId: 'df_general' }),
      block('FormBlock', { heading: 'Get updates', subtext: 'One email a week.', buttonText: 'Sign up', pageId: 'lp_ks', fields: [{ label: 'Email', type: 'email', required: true }] }),
      block('PollBlock', { heading: 'Which issue matters most?', pageId: 'lp_ks', questions: [{ prompt: 'Pick one', options: 'Taxes, Schools, Roads', allowMultiple: false }] }),
      block('Petition', { petitionSlug: 'freeze-the-levy', heading: 'Sign the petition', header: 'none', volunteerAsk: 'off', orgSlug: 'pine-valley' }),
      block('Store', { heading: 'Gear', maxProducts: 6 }),
      block('Event', { eventSlug: 'budget-night', heading: 'Come to budget night', showDescription: true, eventName: 'Budget night', startsAt: '2026-10-15T23:00:00.000Z' }),
      block('Calendar', { heading: 'Calendar', opensOn: 'month', actions: 'link', orgSlug: 'pine-valley', pageId: 'lp_ks', events: [] }),
      block('SignupCapture', { heading: 'Stay in touch', subtext: 'News once a week.', buttonText: 'Join', pageId: 'lp_ks' }),
      block('SocialFrame', { heading: 'Add a frame to your photo', family: 'ring', collectContact: 'optional' }),
      block('Advocacy', { heading: 'Call your legislators', setSlug: 'levy-bills', level: 'state', buttonText: 'Find mine', orgSlug: 'pine-valley' }),
    ],
  }
}

/** The kitchen sink's sections, made by the api's own projection from the built @givegold/shared. */
async function kitchenSink() {
  const shared = await import(pathToFileURL(join(ROOT, 'packages/shared/dist/content-api.js')).href)
  const origins = { apiOrigin: 'https://api.backgold.com', donateOrigin: 'https://secure.backgold.com' }
  const doc = kitchenSinkDocument()
  const sections = shared.projectDocument(doc, {
    ...origins,
    siteUrl: 'https://pinevalleyliberty.org',
    orgHostUrl: 'https://pine-valley.backgold.com',
    orgSlug: 'pine-valley',
    embedUrls: shared.contentApiEmbedUrls(origins),
  })
  return { blocks: shared.CONTENT_API_BLOCKS, areaBlocks: shared.CONTENT_API_AREA_BLOCKS, doc, sections }
}


async function loadExamples() {
  const mod = await import(pathToFileURL(join(ROOT, 'packages/shared/dist/content-api-examples.js')).href)
  return structuredClone(mod.CONTENT_API_EXAMPLES)
}

/** The shared example's EventsList section, by type: its position in `sectionsExample` is not a contract. */
function exampleEventsList(ex) {
  const section = ex.SectionsResponse.sections.find((s) => s.type === 'EventsList')
  if (!section?.data?.items) throw new Error('the shared SectionsResponse example has no EventsList section with data rows')
  return section
}

function fixtureData(ex, kitchenSections) {
  const legal = ex.SiteResponse.legal
  const site = ex.SiteResponse.site
  const hero = ex.PageResponse.sections[0]
  const donate = ex.PageResponse.sections[1]
  const homeAreas = structuredClone(ex.PageResponse.areas)
  homeAreas.top_banner[0].until = BANNER_UNTIL
  // An entry's areas: the example's (its dated Top banner moved like home's)
  // with one undated item in the Sidebar.
  const entryAreas = structuredClone(ex.EntryResponse.areas)
  entryAreas.top_banner[0].until = BANNER_UNTIL
  entryAreas.sidebar = [
    {
      key: 'read-the-budget',
      label: 'Read the budget',
      from: null,
      until: null,
      sections: [
        {
          id: 'Cta-entry-rail',
          type: 'Cta',
          band: 'panel',
          bleed: 'full',
          variant: null,
          copy: { heading: 'Read the whole budget' },
          media: {},
          links: [{ label: 'Open it', target: { kind: 'page', slug: 'budget' }, url: '/budget' }],
          options: {},
        },
      ],
    },
  ]
  // The Issues page has one undated item in its Sidebar, and nothing else.
  const issuesAreas = {
    top_banner: [],
    sidebar: [
      {
        key: 'saturday-walk',
        label: 'Saturday walk',
        from: null,
        until: null,
        sections: [
          {
            id: 'Cta-rail',
            type: 'Cta',
            band: 'panel',
            bleed: 'full',
            variant: null,
            copy: { heading: 'Walk with us Saturday' },
            media: {},
            links: [{ label: 'Sign up', target: { kind: 'page', slug: 'volunteer' }, url: '/volunteer' }],
            options: {},
          },
        ],
      },
    ],
    above_footer: [],
  }

  const types = [
    // As GET /types reports them: post at `blog`, the newsletter at its own base.
    { key: 'post', singular_label: 'Post', plural_label: 'Posts', routable: true, url_base: 'blog', built_in: true, fields: [] },
    { key: 'newsletter', singular_label: 'Newsletter', plural_label: 'Newsletters', routable: true, url_base: 'newsletters', built_in: true, fields: [{ key: 'issue', label: 'Issue', kind: 'short_text', required: false }] },
    {
      ...ex.TypesResponse.types[0],
      fields: [
        ...ex.TypesResponse.types[0].fields,
        { key: 'endorsed_on', label: 'Endorsed on', kind: 'date', required: false },
        { key: 'website', label: 'Website', kind: 'link', required: false },
        { key: 'statement', label: 'Statement', kind: 'pdf', required: false },
        { key: 'notes', label: 'Notes', kind: 'rich_text', required: false },
        { key: 'topics', label: 'Topics', kind: 'choices', required: false, choices: ['Taxes', 'Schools', 'Transparency'] },
        { key: 'renewing', label: 'Renewing', kind: 'boolean', required: false },
      ],
    },
  ]

  const post = ex.EntryResponse.entry
  const secondPost = {
    ...post,
    id: 'ci_7d2',
    slug: 'open-books',
    title: 'Open books, line by line',
    summary: 'Every check the district writes, posted the week it clears.',
    url: '/blog/open-books',
    hero: null,
    publish_at: '2026-09-20T15:00:00.000Z',
    updated_at: '2026-09-20T15:00:00.000Z',
    terms: [],
    body: { markdown: 'The ledger goes online every Friday.\n\n- Checks over $500\n- Contracts and bids' },
    fields: {},
  }
  const endorsement = {
    id: 'ci_e01',
    slug: 'maple-hollow-neighbors',
    type: 'endorsement',
    title: 'Maple Hollow Neighbors Council',
    summary: 'A neighborhood council backs the levy freeze.',
    url: '/endorsements/maple-hollow-neighbors',
    hero: null,
    media_url: null,
    publish_at: '2026-09-25T10:00:00.000Z',
    updated_at: '2026-09-25T10:00:00.000Z',
    terms: [],
    authors: [],
    body: { markdown: 'The council voted to endorse at its September meeting.' },
    fields: {
      quote: 'Our families feel every levy increase.\n\nA freeze gives them room to breathe.',
      tier: 'Gold',
      endorsed_on: '2026-09-24',
      website: 'https://example.org/maple-hollow',
      statement: { url: 'https://example.org/maple-hollow/statement.pdf', file_name: 'Endorsement statement.pdf', size_bytes: 184320 },
      notes: '<p>Read at the <strong>September</strong> meeting. <a href="javascript:alert(1)">bad link</a></p><script>alert(1)</script>',
      topics: ['Taxes', 'Transparency'],
      renewing: false,
    },
  }
  // A second, older endorsement; the fixture answers the type one entry a
  // page (pageSize), so its list has an Older page to walk to.
  const quarryRoad = {
    ...endorsement,
    id: 'ci_e02',
    slug: 'quarry-road-association',
    title: 'Quarry Road Association',
    summary: 'Homeowners sign on.',
    url: '/endorsements/quarry-road-association',
    publish_at: '2026-09-18T10:00:00.000Z',
    updated_at: '2026-09-18T10:00:00.000Z',
    body: { markdown: 'The association signed on in September.' },
    fields: { quote: 'We are in.' },
  }
  const issue = {
    ...post,
    id: 'ci_n01',
    slug: 'october-letter',
    type: 'newsletter',
    title: 'The October letter',
    summary: 'What the board did this month.',
    url: '/newsletters/october-letter',
    hero: null,
    publish_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-01T09:00:00.000Z',
    terms: [],
    body: { markdown: 'The board met twice in October.' },
    fields: { issue: 'No. 12' },
  }
  const { body: _b1, fields: _f1, ...postSummary } = post
  const { body: _b2, fields: _f2, ...secondSummary } = secondPost
  const { body: _b3, fields: _f3, ...endorsementSummary } = endorsement
  const { body: _b4, fields: _f4, ...quarryRoadSummary } = quarryRoad
  const { body: _b5, fields: _f5, ...issueSummary } = issue

  const homeSections = (headline) => [
    { ...hero, band: 'plain', copy: { ...hero.copy, headline } },
    {
      id: 'About-1',
      type: 'About',
      band: 'plain',
      bleed: 'full',
      variant: 'right',
      copy: { heading: 'Who we are', body: 'Neighbors who read the budget.\n\nWe meet monthly at the library and post every number we cite.' },
      media: {},
      links: [],
    },
    {
      id: 'StatCards-1',
      type: 'StatCards',
      band: 'tint',
      bleed: 'full',
      variant: null,
      copy: { heading: 'The levy in numbers' },
      media: {},
      links: [],
      data: {
        source: 'stats',
        items: [
          { label: 'Raised since 2019', value: '38%', note: 'District levy, per household', accent: true },
          { label: 'Checks posted', value: '1,204', note: null, accent: false },
          { label: 'Live total', value: 'auto:total', note: null, accent: false },
        ],
      },
    },
    { ...donate },
    {
      id: 'QuoteStrip-1',
      type: 'QuoteStrip',
      band: 'plain',
      bleed: 'full',
      variant: null,
      copy: { heading: 'What neighbors say' },
      media: {},
      links: [],
      data: { source: 'quotes', items: [{ quote: 'I finally know where my money goes.', attribution: 'A Pine Valley parent' }] },
    },
    {
      id: 'Cta-1',
      type: 'Cta',
      band: 'contrast',
      bleed: 'contained',
      variant: null,
      copy: { eyebrow: 'Get involved', heading: 'Freeze the levy this fall', body: 'Knock doors with us on Saturdays.' },
      media: {},
      links: [
        { label: 'Donate', target: { kind: 'surface', surface: 'donate', path: '/donate' }, url: 'https://pine-valley.backgold.com/donate' },
        { label: 'Volunteer', target: { kind: 'page', slug: 'volunteer' }, url: '/volunteer' },
      ],
    },
    { id: 'Blog-1', type: 'Blog', band: 'plain', bleed: 'full', variant: null, copy: { heading: 'From the blog' }, media: {}, links: [], data: { source: 'blog', items: [] } },
  ]

  const issuesSections = [
    {
      id: 'Issues-1',
      type: 'Issues',
      band: 'panel',
      bleed: 'full',
      variant: 'cards',
      copy: { kicker: 'Our platform', heading: 'Three things we will do', lead: 'Plain promises, each with a number attached.' },
      media: {},
      links: [{ label: 'Read the full plan', target: { kind: 'page', slug: 'plan' }, url: '/plan' }],
      data: {
        source: 'issues',
        items: [
          { title: 'Freeze the levy', body: 'No increase for four years.', icon: null },
          { title: 'Open the books', body: 'Every check online within a week.', icon: null },
          { title: 'Fund classrooms first', body: 'Administration grows no faster than enrollment.', icon: null },
        ],
      },
    },
    {
      id: 'Progress-1',
      type: 'Progress',
      band: 'panel',
      bleed: 'full',
      variant: null,
      copy: {},
      media: {},
      links: [],
      data: { source: 'progress', items: [{ raised_cents: 1240000, goal_cents: 2500000 }] },
    },
    {
      id: 'Countdown-1',
      type: 'Countdown',
      band: 'contrast',
      bleed: 'full',
      variant: null,
      copy: { heading: 'Until the vote' },
      media: {},
      links: [],
      data: { source: 'countdown', items: [{ deadline: '2026-11-03T20:00:00-06:00' }] },
    },
    {
      id: 'EventsList-1',
      type: 'EventsList',
      band: 'plain',
      bleed: 'full',
      variant: null,
      copy: { heading: 'Come to a meeting' },
      media: {},
      links: [],
      // Every EventsList row carries whether the event sells tickets.
      data: { ...exampleEventsList(ex).data, items: exampleEventsList(ex).data.items.map((row) => ({ sells_tickets: false, tickets_url: null, ...row })) },
      embed: { iframe: 'https://api.backgold.com/embed/events/pine-valley', script: 'https://secure.backgold.com/embed.js' },
    },
    {
      id: 'TeamGrid-1',
      type: 'TeamGrid',
      band: 'wash',
      bleed: 'full',
      variant: null,
      copy: { heading: 'The team', teamOpenRolesIntro: 'We are looking for help with these.' },
      media: {},
      links: [{ label: 'Tell us you are interested', target: { kind: 'page', slug: 'volunteer' }, url: '/volunteer' }],
      data: {
        source: 'team',
        items: [
          { group: 'exec', name: 'Avery Lin', role: 'Chair', bio: 'Reads every budget line twice.', image_url: null, link_url: null },
          { group: 'staff', name: 'Sam Ortiz', role: 'Organizer', dept: 'Field', image_url: null, link_url: null },
          { group: 'open', role: 'Data volunteer', dept: 'Research', blurb: 'Help us post the checks.', link_url: null },
        ],
      },
    },
    { id: 'Leaderboard-1', type: 'Leaderboard', band: 'panel', bleed: 'full', variant: null, copy: { heading: 'Top chapters' }, media: {}, links: [], data: { source: 'leaderboard', items: [] } },
  ]

  // ── The party boards' data (A1, A3, A4, A6, A7) ──
  // Upcoming events as GET /events and the EventsList rows carry them: one
  // that sells tickets, one whose registration has closed, two types with
  // more than one event between them.
  const eventRow = (row) => ({ ends_at: null, timezone: 'America/Denver', location: null, is_virtual: false, registration_closed: false, sells_tickets: false, tickets_url: null, ...row })
  const upcoming = [
    eventRow({ id: 'evt_w1', title: 'Harlow County candidate forum', starts_at: '2026-10-14T19:00:00.000Z', location: 'Harlow Civic Hall', type: 'meeting', url: 'https://events.example.org/candidate-forum' }),
    eventRow({ id: 'evt_w2', title: 'Door-knock Saturday in Alder County', starts_at: '2026-10-18T09:00:00.000Z', location: 'Alder Grange Hall', type: 'volunteer', url: 'https://events.example.org/door-knock' }),
    eventRow({
      id: 'evt_w3',
      title: 'Get-out-the-vote dinner',
      starts_at: '2026-11-01T18:30:00.000Z',
      location: 'Fenwick Union Depot',
      type: 'fundraiser',
      url: 'https://events.example.org/gotv-dinner',
      sells_tickets: true,
      tickets_url: 'https://events.example.org/gotv-dinner/tickets',
    }),
    eventRow({ id: 'evt_w4', title: 'New member night', starts_at: '2026-12-03T19:30:00.000Z', is_virtual: true, type: 'volunteer', registration_closed: true, url: 'https://events.example.org/new-member-night' }),
  ]
  const eventTypes = [
    { key: 'meeting', label: 'Meetings', upcoming: 1 },
    { key: 'volunteer', label: 'Volunteer', upcoming: 2 },
    { key: 'fundraiser', label: 'Fundraisers', upcoming: 1 },
    // A type with no upcoming event: no tab, and its address is a 404.
    { key: 'rally', label: 'Rallies', upcoming: 0 },
  ]
  // GET /events/live: a count, a count with seats left, a zero, and evt_w2 left out.
  const live = { evt_w1: { going: 142, seats_left: null }, evt_w3: { going: 88, seats_left: 12 }, evt_w4: { going: 0, seats_left: null } }
  const eventsSections = [
    {
      id: 'EventsList-agenda',
      type: 'EventsList',
      band: 'plain',
      bleed: 'full',
      variant: 'agenda',
      copy: { heading: 'Upcoming events', eventsEmptyCta: 'Tell us and we will put it here.' },
      media: {},
      links: [],
      // A cap over the api's limit of 50: the typed read asks for 50.
      options: { max: 80, actions: 'buttons' },
      data: { source: 'events', items: upcoming },
    },
    {
      id: 'EventsList-cards',
      type: 'EventsList',
      band: 'tint',
      bleed: 'full',
      variant: 'cards',
      copy: { heading: 'Coming up' },
      media: {},
      links: [],
      options: { max: 3, actions: 'buttons' },
      data: { source: 'events', items: [upcoming[0], upcoming[2]] },
    },
  ]
  // TeamGrid rows by seat: two bodies (the officers' first, sharing a term),
  // a vacant seat whose url is its open role, and one staff member.
  const seat = (row) => ({ since: null, term_ends: null, is_officer: false, photo_url: null, bio: null, link: null, url: null, ...row })
  const team = [
    seat({ body: 'Officers', body_key: 'officers', seat: 'Chair', name: 'Rowan Achterberg', since: '2023-04-15', term_ends: '2027-04-30', is_officer: true, bio: 'Osgood County' }),
    seat({
      body: 'Officers',
      body_key: 'officers',
      seat: 'Treasurer',
      name: 'Idris Valcourt',
      since: '2021-04-17',
      term_ends: '2027-04-30',
      is_officer: true,
      photo_url: 'https://api.backgold.com/api/media-files/med_idris',
      bio: 'Brannock County',
      link: 'https://example.org/idris',
    }),
    seat({ body: 'At-large members', body_key: 'at-large', seat: 'At-large', name: 'Tobias Wrenfield', since: '2024-04-20', term_ends: '2027-04-30', bio: 'Marrow County' }),
    seat({ body: 'At-large members', body_key: 'at-large', seat: 'At-large', name: null, term_ends: '2029-04-30', url: '/open-roles/at-large-seat' }),
    seat({ body: 'Staff', body_key: 'staff', seat: 'Organizer', name: 'Sam Ortiz' }),
  ]
  // CandidateRoster rows: eleven (more than ten, so the ballot draws its
  // controls) across five levels, issues on some, one donate address.
  const candidate = (row) => ({ issues: [], status: null, donate_url: null, web_url: null, image_url: null, ...row })
  const candidates = [
    candidate({ name: 'Halvard Brisco', office: 'Governor', level: 'State', region: 'Statewide', issues: ['Taxes', 'Open books'], status: 'On the ballot', donate_url: 'https://secure.backgold.com/donate/brisco', web_url: 'https://example.org/brisco' }),
    candidate({ name: 'Noor Ellingsworth', office: 'State Senate', level: 'State', region: 'District 12 · Alder, Brannock', issues: ['Schools'], web_url: 'https://example.org/noor' }),
    candidate({ name: 'Gideon Marchetti', office: 'State Senate', level: 'State', region: 'District 4 · Tull' }),
    candidate({ name: 'Ada Kestrel', office: 'U.S. House', level: 'Federal', region: 'District 2' }),
    candidate({ name: 'Simone Varga-Holt', office: 'Harlow County Commission', level: 'County', region: 'Harlow County' }),
    candidate({ name: 'Corwin Bale', office: 'Harlow County Commission', level: 'County', region: 'Precinct 3' }),
    candidate({ name: 'Mara Lindqvist', office: 'County Clerk', level: 'County', region: 'Brannock County' }),
    candidate({ name: 'Pell Okafor', office: 'Harlow City Council', level: 'Local', region: 'Ward 2' }),
    candidate({ name: 'Rhea Tamsin', office: 'Harlow City Council', level: 'Local', region: 'Ward 5' }),
    candidate({ name: 'Wes Ondrak', office: 'Alder School Board', level: 'School board', region: 'Seat 1' }),
    candidate({ name: 'June Halloran', office: 'Alder School Board', level: 'School board', region: 'Seat 4' }),
  ]
  const leadershipSections = [
    {
      id: 'TeamGrid-board',
      type: 'TeamGrid',
      band: 'plain',
      bleed: 'full',
      variant: 'board',
      copy: { heading: 'Our state committee' },
      media: {},
      links: [{ label: 'Tell us you are interested', target: { kind: 'page', slug: 'volunteer' }, url: '/volunteer' }],
      data: { source: 'team', items: team },
    },
    {
      id: 'CandidateRoster-ballot',
      type: 'CandidateRoster',
      band: 'tint',
      bleed: 'full',
      variant: 'ballot',
      copy: { heading: 'Our candidates, office by office' },
      media: {},
      links: [],
      data: { source: 'candidates', items: candidates },
    },
  ]
  const boardPage = (id, slug, title, sections) => ({
    page: { ...ex.PageResponse.page, id, slug, title, url: `/${slug}`, is_home: false, meta: { title: null, description: null, image_url: null } },
    sections,
    areas: { top_banner: [], sidebar: [], above_footer: [] },
    legal,
  })

  return {
    legal,
    site,
    types,
    events: { upcoming, types: eventTypes, live },
    menus: {
      primary: {
        ...ex.MenuResponse,
        items: [
          ...ex.MenuResponse.items,
          { id: 'nav_5', label: 'Endorsements', kind: 'page', target: { kind: 'page' }, url: '/endorsements', external: false, children: [] },
          { id: 'nav_6', label: 'Blog', kind: 'page', target: { kind: 'page' }, url: '/blog', external: false, children: [] },
        ],
      },
      footer: {
        menu: { key: 'footer' },
        items: [{ id: 'nav_f1', label: 'Privacy', kind: 'page', target: { kind: 'page', slug: 'privacy' }, url: '/privacy', external: false, children: [] }],
      },
    },
    pages: [
      ...ex.PagesResponse.pages,
      { id: 'lp_issues', slug: 'issues', title: 'Issues', url: '/issues', is_home: false, published_at: '2026-09-30T14:00:00.000Z', updated_at: '2026-10-01T09:12:00.000Z' },
      { id: 'lp_ks', slug: 'kitchen-sink', title: 'Kitchen sink', url: '/kitchen-sink', is_home: false, published_at: '2026-10-01T14:00:00.000Z', updated_at: '2026-10-01T14:00:00.000Z' },
      { id: 'lp_events', slug: 'events', title: 'Events', url: '/events', is_home: false, published_at: '2026-10-02T14:00:00.000Z', updated_at: '2026-10-02T14:00:00.000Z' },
      { id: 'lp_leadership', slug: 'leadership', title: 'Leadership', url: '/leadership', is_home: false, published_at: '2026-10-02T14:00:00.000Z', updated_at: '2026-10-02T14:00:00.000Z' },
    ],
    page: (slug, headline) =>
      slug === 'home'
        ? { ...ex.PageResponse, sections: homeSections(headline), areas: homeAreas }
        : slug === 'issues'
          ? {
              page: { ...ex.PageResponse.page, id: 'lp_issues', slug: 'issues', title: 'Issues', url: '/issues', is_home: false, meta: { title: null, description: 'What we will do.', image_url: null } },
              sections: issuesSections,
              areas: issuesAreas,
              legal,
            }
          : slug === 'kitchen-sink'
            ? {
                page: { ...ex.PageResponse.page, id: 'lp_ks', slug: 'kitchen-sink', title: 'Kitchen sink', url: '/kitchen-sink', is_home: false, meta: { title: null, description: null, image_url: null } },
                sections: kitchenSections,
                legal,
              }
            : slug === 'events'
              ? boardPage('lp_events', 'events', 'Events', eventsSections)
              : slug === 'leadership'
                ? boardPage('lp_leadership', 'leadership', 'Leadership', leadershipSections)
                : null,
    entryAreas,
    entries: { post: [postSummary, secondSummary], endorsement: [endorsementSummary, quarryRoadSummary], newsletter: [issueSummary] },
    pageSize: { endorsement: 1 },
    entry: { post: { [post.slug]: post, [secondPost.slug]: secondPost }, endorsement: { [endorsement.slug]: endorsement, [quarryRoad.slug]: quarryRoad }, newsletter: { [issue.slug]: issue } },
    terms: { tag: ex.TermsResponse },
    authors: ex.AuthorsResponse,
    author: { [ex.AuthorResponse.author.slug]: ex.AuthorResponse },
    redirects: ex.RedirectsResponse,
    sitemap: {
      urls: [
        ...ex.SitemapResponse.urls,
        { url: 'https://pinevalleyliberty.org/issues', kind: 'page', updated_at: '2026-10-01T09:12:00.000Z' },
        { url: 'https://pinevalleyliberty.org/endorsements', kind: 'type_index', updated_at: '2026-09-25T10:00:00.000Z' },
        { url: 'https://pinevalleyliberty.org/endorsements/maple-hollow-neighbors', kind: 'entry', updated_at: '2026-09-25T10:00:00.000Z' },
      ],
    },
    sections: { 'town-halls': ex.SectionsResponse },
  }
}

const UPLOADS = /https:\/\/api\.backgold\.com\/api\/(?:media-files|lp-assets|content-pages)\//g

/** A stand-in for an uploaded image: a logo mark for the logo, a landscape for anything else. */
function placeholderImage(path) {
  if (path.includes('med_logo')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="56" viewBox="0 0 200 56"><rect width="56" height="56" rx="10" fill="#1b3a5c"/><path d="M14 40 L28 14 L42 40 Z" fill="#f4efe6"/><text x="66" y="35" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#1b3a5c">Pine Valley</text></svg>'
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd9e3"/><stop offset="1" stop-color="#f4efe6"/></linearGradient></defs><rect width="1200" height="800" fill="url(#s)"/><path d="M0 560 L260 330 L430 470 L640 250 L900 520 L1200 360 L1200 800 L0 800 Z" fill="#1b3a5c" opacity=".85"/><path d="M0 660 L300 520 L620 640 L900 560 L1200 650 L1200 800 L0 800 Z" fill="#2f5a3a"/></svg>'
}

function startFixture(examples, kitchenSections) {
  const data = fixtureData(examples, kitchenSections)
  const state = { version: 184, headline: 'Keep more of what you earn.', requests: new Map(), seen: [], total: 0, origin: '' }
  const MOUNT = '/api/content/v1'
  // The Content API answers every origin itself (a browser on the site reads
  // GET /events/live with the publishable key), as the api's contentApiCors does.
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, If-None-Match, Content-Type',
    'Access-Control-Expose-Headers': 'ETag, X-Content-Version',
    'Access-Control-Max-Age': '86400',
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture')
    const path = url.pathname.startsWith(MOUNT) ? url.pathname.slice(MOUNT.length) : null
    state.total++
    state.requests.set(url.pathname, (state.requests.get(url.pathname) ?? 0) + 1)
    const etag = `"v${state.version}"`
    const headers = { 'Content-Type': 'application/json', 'X-Content-Version': String(state.version), ETag: etag, ...CORS }
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { ...headers, ...extra })
      // Uploaded files in the examples live on api.backgold.com; the fixture serves stand-ins.
      res.end(body === undefined ? undefined : JSON.stringify(body).replace(UPLOADS, `${state.origin}/media/`))
    }
    // --serve: after editing and rebuilding the copy, POST here and then to the
    // Worker's /api/backgold/revalidate so the edge cache moves to a new version.
    if (url.pathname === '/__bump' && req.method === 'POST') {
      state.version++
      res.writeHead(204)
      return res.end()
    }
    if (url.pathname.startsWith('/media/')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' })
      return res.end(placeholderImage(url.pathname))
    }
    const auth = req.headers.authorization ?? ''
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (path === null) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }))
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      return res.end()
    }
    state.seen.push({ path, search: url.search, key })
    if (key !== SITE_KEY && key !== SECRET_KEY) return send(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' })

    const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
    const missing = () => send(404, { error: 'Not found', code: 'NOT_FOUND' })

    // GET /events/live?ids=: the counts, outside the content version.
    if (parts[0] === 'events' && parts[1] === 'live' && parts.length === 2) {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      if (ids.length === 0 || ids.length > 50) return send(400, { error: 'ids names 1 to 50 events', code: 'BAD_IDS' })
      const events = ids.filter((id) => Object.hasOwn(data.events.live, id)).map((id) => ({ id, ...data.events.live[id] }))
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30', ...CORS })
      return res.end(JSON.stringify({ events }))
    }

    if (parts[0] === 'preview') {
      if (key !== SECRET_KEY) return send(403, { error: 'Preview needs a secret site key', code: 'SECRET_KEY_REQUIRED' })
      if (parts[1] !== PREVIEW_TOKEN) return send(400, { error: 'Bad preview token', code: 'BAD_PREVIEW_TOKEN' })
      const draft = data.page('home', 'A draft headline, not yet published')
      return send(200, draft, { 'Cache-Control': 'private, no-store' })
    }
    if (req.headers['if-none-match'] === etag) return send(304)

    let body
    switch (parts[0]) {
      case 'site':
        body = { site: data.site, legal: data.legal, version: state.version }
        break
      case 'menus':
        body = data.menus[parts[1]]
        break
      case 'pages':
        body = parts[1] === undefined ? { pages: data.pages } : data.page(parts[1], state.headline)
        break
      case 'sections':
        body = data.sections[parts[1]]
        break
      case 'types':
        body = { types: data.types }
        break
      case 'entries': {
        const list = data.entries[parts[1]]
        if (!list) break
        if (parts[2] !== undefined) {
          const entry = data.entry[parts[1]]?.[parts[2]]
          body = entry ? { entry, areas: data.entryAreas } : undefined
          break
        }
        // ?q= (2 to 80 characters): title and summary, at most 20, no later page.
        const q = url.searchParams.get('q')
        if (q !== null) {
          if (Array.from(q).length < 2 || Array.from(q).length > 80) return send(400, { error: 'q is 2 to 80 characters', code: 'BAD_QUERY' })
          const needle = q.toLowerCase()
          const found = list
            .filter((e) => `${e.title} ${e.summary ?? ''}`.toLowerCase().includes(needle))
            .sort((a, b) => (`${a.publish_at}|${a.id}` < `${b.publish_at}|${b.id}` ? 1 : -1))
          body = { entries: found.slice(0, 20), next_cursor: null }
          break
        }
        // Newest first by (publish_at, id), keyset-paged as the api pages:
        // the cursor is base64url of `<publish_at>|<id>` of the last entry shown.
        const term = url.searchParams.get('term')
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), data.pageSize[parts[1]] ?? Infinity)
        const rawCursor = url.searchParams.get('cursor')
        const after = rawCursor ? /^([^|]+)\|([^|]+)$/.exec(Buffer.from(rawCursor, 'base64url').toString('utf8')) : null
        if (rawCursor && (!after || Number.isNaN(Date.parse(after[1])))) return send(400, { error: 'cursor is not one this API returned', code: 'BAD_CURSOR' })
        const key = (e) => `${e.publish_at}|${e.id}`
        const matching = list
          .filter((e) => !term || e.terms.some((t) => t.slug === term))
          .sort((a, b) => (key(a) < key(b) ? 1 : -1))
          .filter((e) => !after || key(e) < `${after[1]}|${after[2]}`)
        const shown = matching.slice(0, limit)
        const last = shown[shown.length - 1]
        body = { entries: shown, next_cursor: matching.length > limit ? Buffer.from(key(last)).toString('base64url') : null }
        break
      }
      case 'events': {
        // GET /events?type=&cursor=&limit=: upcoming, soonest first; every
        // type with its count, whatever the filter. The cursor is base64url
        // of the offset of the next row. A limit outside 1 to 50 is 400
        // BAD_LIMIT and a type key outside the known types is 400 BAD_TYPE, as
        // the api answers.
        if (parts.length !== 1) break
        const rawLimit = url.searchParams.get('limit')
        const limit = rawLimit === null ? 20 : Number(rawLimit)
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
          return send(400, { error: 'limit must be a whole number from 1 to 50', code: 'BAD_LIMIT' })
        }
        const type = url.searchParams.get('type')
        if (type && !data.events.types.some((t) => t.key === type)) {
          return send(400, { error: `type must be one of ${data.events.types.map((t) => t.key).join(', ')}`, code: 'BAD_TYPE' })
        }
        const offset = Number(Buffer.from(url.searchParams.get('cursor') ?? '', 'base64url').toString('utf8')) || 0
        const matching = data.events.upcoming.filter((e) => !type || e.type === type).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
        const shown = matching.slice(offset, offset + limit)
        body = {
          events: shown,
          types: data.events.types,
          next_cursor: offset + limit < matching.length ? Buffer.from(String(offset + limit)).toString('base64url') : null,
        }
        break
      }
      case 'terms':
        body = data.terms[parts[1]]
        break
      case 'authors':
        body = parts[1] === undefined ? data.authors : data.author[parts[1]]
        break
      case 'redirects':
        body = data.redirects
        break
      case 'sitemap':
        body = data.sitemap
        break
    }
    return body === undefined ? missing() : send(200, body)
  })

  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      servers.add(server)
      state.origin = `http://127.0.0.1:${server.address().port}`
      resolveServer({
        data,
        origin: `http://127.0.0.1:${server.address().port}`,
        port: server.address().port,
        state,
        count: () => state.total,
        bump(headline) {
          state.version++
          state.headline = headline
          return state.version
        },
      })
    })
  })
}

// ── 4. The built Worker on wrangler dev ──────────────────────────────────────

async function startWorker(siteDir, { vars, logFile }) {
  const port = await freePort()
  const inspector = await freePort()
  const args = ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', join(siteDir, '.wrangler-e2e'), '--show-interactive-dev-session=false']
  const values = typeof vars === 'function' ? vars(`http://127.0.0.1:${port}`) : vars
  for (const [name, value] of Object.entries(values)) args.push('--var', `${name}:${value}`)
  const out = openSync(logFile, 'a')
  const child = spawn('npx', args, { cwd: siteDir, stdio: ['ignore', out, out], detached: true, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } })
  children.add(child)
  const origin = `http://127.0.0.1:${port}`
  log(`wrangler dev: ${origin} (inspector ${inspector}, log ${logFile})`)
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited with ${child.exitCode}; see ${logFile}`)
    try {
      const res = await fetch(`${origin}/robots.txt`)
      await res.arrayBuffer()
      return { origin, child }
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`wrangler dev did not answer on ${origin} within 90 s; see ${logFile}`)
}

function killTree(child) {
  if (!children.has(child)) return Promise.resolve()
  children.delete(child)
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise((done) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {}
      done()
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      done()
    })
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      clearTimeout(timer)
      done()
    }
  })
}

// ── 5. The checks ────────────────────────────────────────────────────────────

const get = (origin, path, init) => fetch(`${origin}${path}`, { redirect: 'manual', ...init })

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0])
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
}

/** A minimal well-formedness check: every tag opened is closed in order. */
function wellFormedXml(xml) {
  const body = xml.replace(/<\?xml[\s\S]*?\?>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  const stack = []
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m
    if (selfClosing) continue
    if (closing) {
      if (stack.pop() !== name) return false
    } else stack.push(name)
  }
  const stripped = body.replace(/<[^>]*>/g, '')
  return stack.length === 0 && !/[<>]/.test(stripped) && !/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(stripped)
}

function assertNoSecrets(body, where) {
  check(!body.includes(SECRET_KEY) && !body.includes(WEBHOOK_SECRET), `${where}: no secret key or webhook secret in the body`)
}

function signedWebhook(origin, version, secret) {
  const body = JSON.stringify({
    id: `evt_e2e_${version}`,
    type: 'content.published',
    created_at: new Date().toISOString(),
    data: { site_domain_id: 'cd_8f2a', content_version: version },
  })
  const t = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return get(origin, '/api/backgold/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-BackGold-Signature': `t=${t},v1=${v1}`, 'X-BackGold-Delivery': `dlv_e2e_${version}` },
    body,
  })
}

async function checkConfigured(origin, fixture, disclaimer) {
  log('\nConfigured site')
  let res = await get(origin, '/')
  let html = await res.text()
  check(res.status === 200, `GET / is 200 (got ${res.status})`)
  check(tags(html, 'h1').length === 1, `home has exactly one <h1> (found ${tags(html, 'h1').length})`)
  check(html.includes(disclaimer), 'home shows the disclaimer')
  check(/<link rel="canonical" href="[^"]+"/.test(html), 'home has a canonical link')
  const ld = jsonLdBlocks(html)
  check(ld.length > 0 && ld.every((b) => Array.isArray(JSON.parse(b)) || typeof JSON.parse(b) === 'object'), `home JSON-LD parses (${ld.length} block)`)
  check(/<iframe\b[^>]*data-bg-embed[^>]*src="https:\/\/secure\.backgold\.com\/embed\/d\/df_general"/.test(html), "the Donate section is BackGold's embed iframe")
  check(!html.includes('auto:total'), 'a live (auto:) stat is not printed')
  check(
    html.includes('The levy, explained') && !html.includes('The October letter'),
    "home's Blog section lists the posts and leaves the newsletter out, as /blog does",
  )
  assertNoSecrets(html, 'home')

  const banner = fixture.data.page('home', '').areas.top_banner[0]
  const bannerTag = /<aside\b[^>]*data-bg-area="top_banner"[^>]*>/.exec(html)?.[0] ?? ''
  check(bannerTag !== '', 'home draws its Top banner area item (data-bg-area="top_banner")')
  check(
    bannerTag.includes(`data-until="${banner.until}"`) && /\shidden(?=[\s>=])/.test(bannerTag),
    'the dated Top banner item carries its data-until and starts hidden',
  )
  check(html.includes(banner.sections[0].copy.headline) && html.includes(banner.sections[0].copy.pitch), "the Top banner's TakeoverBanner shows its headline and pitch")
  check(!html.includes('data-bg-section') && !html.includes('name="backgold-preview"'), 'published home carries no section markers and no preview meta')
  check(html.indexOf('data-bg-area="top_banner"') < html.indexOf('<main'), 'the Top banner sits above the main column')
  check(html.indexOf('data-bg-area="above_footer"') > html.indexOf('</main>') && html.indexOf('data-bg-area="above_footer"') < html.indexOf('<footer'), 'Above the footer sits between the main column and the footer')
  const windowScripts = html.split('[data-bg-area-item][data-from]').length - 1
  check(windowScripts === 1, `the areas' window script is on the page once (found ${windowScripts})`)
  check(/<a\b[^>]*data-bg-donate[^>]*>Donate<\/a>/.test(html), 'home (it takes donations) shows the Donate header button')
  check(!/<nav\b[^>]*>(?:(?!<\/nav>)[\s\S])*>Donate<\/a>/.test(html), 'the header button is not also a menu link')
  check(!html.includes('href="/issues"'), "home leaves out Issues (Shows on: only the Issues page)")
  check(!html.includes('href="/#volunteer"'), 'home leaves out Volunteer (Shows on: every page except home)')
  check(!html.includes('layout-rail') && !html.includes('layout-split'), 'home, with nothing in its Sidebar, is one column with no rail markup')

  res = await get(origin, '/blog/levy-explained')
  html = await res.text()
  check(res.status === 200 && /<h1[^>]*>The levy, explained<\/h1>/.test(html), 'an entry page renders its title as the <h1>')
  check(/<time datetime="2026-09-29T12:00:00.000Z">/.test(html), 'the entry date is a <time datetime>')
  check(html.includes(disclaimer), 'the entry page shows the disclaimer')
  check(!html.includes('data-bg-donate'), 'an entry page (no BackGold page) shows no Donate header button')
  check(html.includes('href="/#volunteer"') && !html.includes('href="/issues"'), 'an entry page shows Volunteer and leaves out Issues')
  check(!html.includes('data-bg-section') && !html.includes('name="backgold-preview"'), 'a published entry carries no section markers and no preview meta')
  // An entry loads no script but JSON-LD, the areas' one window script because
  // its areas hold a dated item, and the frames' one resize script because an
  // area's sign-up is framed by its reusable section.
  const areaItems = Object.values(fixture.data.entryAreas).flat()
  const dated = areaItems.some((item) => item.from !== null || item.until !== null)
  const framed = areaItems.some((item) => item.sections.some((section) => section.embed?.iframe))
  const scripts = tags(html, 'script').filter((s) => !/type="application\/ld\+json"/.test(s))
  const entryWindowScripts = html.split('[data-bg-area-item][data-from]').length - 1
  const entryResizeScripts = html.split("data.type !== 'givegold:resize'").length - 1
  check(
    scripts.length === entryWindowScripts + entryResizeScripts &&
      entryWindowScripts === (dated ? 1 : 0) &&
      entryResizeScripts === (framed ? 1 : 0),
    `an entry loads only JSON-LD${dated ? ", the areas' window script once" : ''}${framed ? " and the frames' resize script once" : ''} (${scripts.length} other script tag(s))`,
  )
  const entryRail = /<div class="layout-rail">\s*<aside\b[^>]*>/.exec(html)?.[0] ?? ''
  check(
    entryRail.includes('data-bg-area="sidebar"') && html.includes(fixture.data.entryAreas.sidebar[0].sections[0].copy.heading) && /class="layout layout-split"/.test(html),
    "an entry page draws its Sidebar item from the EntryResponse's areas beside the article",
  )
  assertNoSecrets(html, 'entry')

  res = await get(origin, '/endorsements')
  html = await res.text()
  check(res.status === 200 && /<h1[^>]*>Endorsements<\/h1>/.test(html) && html.includes('Maple Hollow Neighbors Council'), 'a custom type index lists its entries')
  const pagerOn = (page) => /<nav class="pager"[^>]*>([\s\S]*?)<\/nav>/.exec(page)?.[1] ?? ''
  const olderHref = /<a href="([^"]*)"[^>]*>Older<\/a>/.exec(pagerOn(html))?.[1]?.replace(/&amp;/g, '&') ?? ''
  check(
    /^\/endorsements\?cursor=[A-Za-z0-9_-]+$/.test(olderHref) && !pagerOn(html).includes('>Newest<') && !html.includes('Quarry Road Association'),
    `the first page of a list (one entry a page in the fixture) links Older at ?cursor= and has no Newest link (${olderHref})`,
  )
  res = await get(origin, olderHref)
  html = await res.text()
  check(
    res.status === 200 && html.includes('Quarry Road Association') && !html.includes('Maple Hollow Neighbors Council'),
    `Older reads the next page of the list from the api (got ${res.status})`,
  )
  check(
    /<a href="\/endorsements"[^>]*>Newest<\/a>/.test(pagerOn(html)) && !pagerOn(html).includes('>Older<'),
    'the last page links Newest back to the bare path and has no Older link',
  )
  res = await get(origin, '/endorsements?cursor=not-a-cursor')
  html = await res.text()
  check(
    res.status === 200 && html.includes('Maple Hollow Neighbors Council') && !pagerOn(html).includes('>Newest<'),
    `a cursor the api would not accept shows the first page (got ${res.status})`,
  )
  // The newsletter is a built-in that reports its own base: its own list,
  // entries and feed at /newsletters, and never in the /blog merge.
  res = await get(origin, '/newsletters')
  html = await res.text()
  check(res.status === 200 && /<h1[^>]*>Newsletters<\/h1>/.test(html) && html.includes('The October letter'), 'the newsletter (url_base newsletters) lists its entries at /newsletters')
  res = await get(origin, '/newsletters/october-letter')
  html = await res.text()
  check(res.status === 200 && /<h1[^>]*>The October letter<\/h1>/.test(html) && html.includes('No. 12'), 'a newsletter entry renders at its own address, /newsletters/<slug>')
  res = await get(origin, '/blog')
  html = await res.text()
  check(res.status === 200 && html.includes('The levy, explained') && !html.includes('The October letter'), '/blog lists the posts and leaves the newsletter out')
  res = await get(origin, '/blog/october-letter')
  check(res.status === 404, `a newsletter entry is not under /blog (got ${res.status})`)
  res = await get(origin, '/newsletters/feed.xml')
  const newsletterFeed = await res.text()
  check(
    res.status === 200 && wellFormedXml(newsletterFeed) && newsletterFeed.includes('/newsletters/october-letter'),
    "the newsletter's feed is Atom at /newsletters/feed.xml with its entry",
  )

  res = await get(origin, '/endorsements/maple-hollow-neighbors')
  html = await res.text()
  check(res.status === 200 && html.includes('Endorsement statement.pdf') && html.includes('<dt>Topics</dt>'), 'a custom-type entry renders its fields by kind')
  check(!html.includes('javascript:') && !html.includes('<script>alert'), 'rich text fields are sanitized')

  res = await get(origin, '/sitemap.xml')
  const sitemap = await res.text()
  check(res.status === 200 && sitemap.includes('<urlset') && wellFormedXml(sitemap), '/sitemap.xml is a well-formed urlset')
  check(sitemap.includes('/endorsements/maple-hollow-neighbors'), 'the sitemap lists the custom-type entry')
  res = await get(origin, '/robots.txt')
  const robots = await res.text()
  check(res.status === 200 && ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'].every((b) => robots.includes(`User-agent: ${b}`)), '/robots.txt names the AI crawler groups')
  check(/^Sitemap: /m.test(robots), '/robots.txt points at the sitemap')
  res = await get(origin, '/llms.txt')
  const llms = await res.text()
  check(res.status === 200 && llms.startsWith('# Pine Valley for Liberty'), '/llms.txt starts with the site name')
  res = await get(origin, '/feed.xml')
  const feed = await res.text()
  check(res.status === 200 && (res.headers.get('content-type') ?? '').includes('atom') && wellFormedXml(feed) && feed.includes('<feed'), '/feed.xml is a well-formed Atom feed')
  check(feed.includes('/blog/levy-explained') && !feed.includes('/newsletters/october-letter'), "/feed.xml carries the blog built-ins' entries and not the newsletter's")
  res = await get(origin, '/endorsements/feed.xml')
  const typeFeed = await res.text()
  check(res.status === 200 && (res.headers.get('content-type') ?? '').includes('application/atom+xml') && wellFormedXml(typeFeed), "a custom type's feed is Atom from the catch-all")

  res = await get(origin, '/old-issues')
  check(res.status === 301 && res.headers.get('location') === '/issues', `a redirect answers 301 to /issues (got ${res.status} ${res.headers.get('location')})`)
  res = await get(origin, '/2022-slate')
  check(res.status === 410, `a rule with no destination answers 410 (got ${res.status})`)

  res = await get(origin, '/no-such-page')
  html = await res.text()
  check(res.status === 404 && html.includes('Page not found') && html.includes(disclaimer), 'an unknown path is a 404 with the disclaimer')
  check(tags(html, 'h1').length === 1, 'the 404 has one <h1>')

  res = await get(origin, '/preview')
  html = await res.text()
  check(res.status === 400, `/preview without a token is 400 (got ${res.status})`)
  check(/no-store/.test(res.headers.get('cache-control') ?? '') && !res.headers.has('x-backgold-cache'), '/preview is no-store and never goes through the edge cache')
  res = await get(origin, `/preview?bg_preview=${PREVIEW_TOKEN}&path=/`)
  html = await res.text()
  check(res.status === 200 && html.includes('Preview, not published') && html.includes('A draft headline'), 'a valid preview renders the draft under the preview bar')
  check(/<meta name="robots" content="noindex"/.test(html) && /no-store/.test(res.headers.get('cache-control') ?? ''), 'the preview is noindex and no-store')
  check(html.includes('<meta name="backgold-preview" content="sections">'), 'the preview carries <meta name="backgold-preview" content="sections">')
  const draft = fixture.data.page('home', '')
  const draftIds = [...draft.sections, ...Object.values(draft.areas).flat().flatMap((item) => item.sections)].map((s) => s.id)
  const markers = [...html.matchAll(/<span\b[^>]*data-bg-section[^>]*>/g)].map((m) => /id="([^"]*)"/.exec(m[0])?.[1])
  check(
    markers.length === draftIds.length && draftIds.every((id) => markers.includes(`bg-section-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`)),
    `the preview has one data-bg-section marker per section of the draft, areas included (${markers.length} for ${draftIds.length})`,
  )
  check(/data-bg-donate/.test(html), 'a draft page that takes donations shows the Donate header button')
  assertNoSecrets(html, 'preview')

  res = await get(origin, '/issues')
  html = await res.text()
  check(res.status === 200 && /<h1[^>]*>Issues<\/h1>/.test(html), 'a page without a leading Hero shows its title as the <h1>')
  check(/<a href="\/issues"[^>]*aria-current="page"[^>]*>Issues<\/a>/.test(html), 'the Issues page shows its Issues link (Shows on: only this page), marked current')
  check(!html.includes('data-bg-section') && !html.includes('name="backgold-preview"'), 'a published page carries no section markers and no preview meta')
  const rail = /<div class="layout-rail">\s*<aside\b[^>]*>/.exec(html)?.[0] ?? ''
  check(
    rail.includes('data-bg-area="sidebar"') && /class="[^"]*\brail\b/.test(rail) && !/\shidden(?=[\s>=])/.test(rail) && html.includes('Walk with us Saturday'),
    "the Issues page's undated Sidebar item is a .rail beside the main column, shown",
  )
  check(html.indexOf('layout-main') < html.indexOf('data-bg-area="sidebar"'), 'the Sidebar comes after the main column in the HTML')
  check(!html.includes('[data-bg-area-item][data-from]'), 'a page whose areas carry no dates has no window script')
  check(html.includes('Avery Lin') && html.includes('Come to a meeting') && !html.includes('Top chapters'), 'data sections render their rows; an empty Leaderboard renders nothing')

  log('\nCaching')
  await get(origin, '/').then((r) => r.text())
  const before = fixture.count()
  res = await get(origin, '/')
  html = await res.text()
  check(res.status === 200 && fixture.count() === before, `a second read of home makes zero Content API requests (X-Backgold-Cache: ${res.headers.get('x-backgold-cache')})`)

  // A list page keys the edge cache by its cursor; any other query, and a
  // cursor the api would not accept, share the bare path's entry.
  await get(origin, olderHref).then((r) => r.text())
  const beforePages = fixture.count()
  res = await get(origin, `${olderHref}&utm_source=newsletter`)
  html = await res.text()
  check(
    res.headers.get('x-backgold-cache') === 'HIT' && fixture.count() === beforePages && html.includes('Quarry Road Association'),
    `the Older page is its own edge-cache entry, served again with another query beside the cursor (X-Backgold-Cache: ${res.headers.get('x-backgold-cache')})`,
  )
  await get(origin, '/endorsements').then((r) => r.text())
  for (const path of ['/endorsements?utm_source=newsletter', '/endorsements?cursor=not-a-cursor']) {
    res = await get(origin, path)
    html = await res.text()
    check(
      res.headers.get('x-backgold-cache') === 'HIT' && html.includes('Maple Hollow Neighbors Council') && !html.includes('Quarry Road Association'),
      `${path} is served the bare list's cached first page (X-Backgold-Cache: ${res.headers.get('x-backgold-cache')})`,
    )
  }

  const bad = await get(origin, '/api/backgold/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-BackGold-Signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
    body: JSON.stringify({ id: 'evt_bad', type: 'content.published', created_at: new Date().toISOString(), data: { site_domain_id: 'cd_8f2a', content_version: 999 } }),
  })
  assertNoSecrets(await bad.text(), 'bad webhook answer')
  check(bad.status === 401, `a badly signed webhook is 401 (got ${bad.status})`)
  const afterBad = fixture.count()
  html = await get(origin, '/').then((r) => r.text())
  check(fixture.count() === afterBad && html.includes('Keep more of what you earn.'), 'the bad webhook changed nothing')

  const version = fixture.bump('Freeze the levy, post every check.')
  const good = await signedWebhook(origin, version, WEBHOOK_SECRET)
  check(good.status === 204, `a correctly signed webhook with version ${version} is 204 (got ${good.status})`)
  const afterGood = fixture.count()
  res = await get(origin, '/')
  html = await res.text()
  check(fixture.count() > afterGood, `the next home read fetches fresh (${fixture.count() - afterGood} Content API request(s))`)
  check(html.includes('Freeze the levy, post every check.'), 'the next home read shows the new content')
  assertNoSecrets(html, 'home after the webhook')

  // Astro answers a POST with no Content-Type (or a form type) from no origin with 403, so revalidate is sent as JSON.
  const revalidate = (bearer) =>
    get(origin, '/api/backgold/revalidate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` } })
  res = await revalidate('not-the-secret')
  check(res.status === 401, `revalidate with the wrong bearer is 401 (got ${res.status})`)
  res = await revalidate(WEBHOOK_SECRET)
  check(res.status === 204, `revalidate with the webhook secret is 204 (got ${res.status})`)
  const afterRevalidate = fixture.count()
  await get(origin, '/').then((r) => r.text())
  check(fixture.count() > afterRevalidate, 'after revalidate the next read asks BackGold for the version again')
}

async function checkSetup(origin) {
  log('\nUnconfigured site')
  const res = await get(origin, '/')
  const html = await res.text()
  check(res.status === 200 && html.includes('BACKGOLD_SITE_KEY'), 'with no site key the setup page renders and names BACKGOLD_SITE_KEY')
  check(/no-store/.test(res.headers.get('cache-control') ?? ''), 'the setup page is never cached')
  assertNoSecrets(html, 'setup page')
}

/** A GET with its own Host header (fetch will not send one). */
function getWithHost(origin, path, host) {
  const { hostname, port } = new URL(origin)
  return new Promise((resolveGet, reject) => {
    const req = httpRequest({ hostname, port, path, method: 'GET', headers: { Host: host } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolveGet({ status: res.statusCode, cache: res.headers['x-backgold-cache'], body }))
    })
    req.on('error', reject)
    req.end()
  })
}

// ── Build id and Lighthouse ──────────────────────────────────────────────────

/** The build id @backgold/astro's integration baked into the built Worker (its options module). */
function builtId(siteDir) {
  for (const file of filesUnder(join(siteDir, 'dist/server'))) {
    const id = /["']?buildId["']?\s*:\s*["']([^"']*)["']/.exec(readFileSync(file, 'utf8'))?.[1]
    if (id !== undefined) return id
  }
  throw new Error('No buildId in the built Worker')
}

/** The Chrome Lighthouse drives, or a failure that says why there is none. */
function chromeForLighthouse() {
  const chrome = process.env.CHROME_BIN
  if (!chrome) throw new CheckFailed('--lighthouse needs Chrome: set CHROME_BIN to a Chrome or Chromium executable (the starter-template CI image sets it)')
  try {
    accessSync(chrome, fsConstants.X_OK)
  } catch {
    throw new CheckFailed(`--lighthouse needs Chrome: CHROME_BIN=${chrome} is not an executable file`)
  }
  return chrome
}

/**
 * Runs after the configured checks, against the same Worker, as it is left:
 * the webhook moved the content version to 185 and revalidate made the Worker
 * re-read it, so home is cached under that version (the last check read it)
 * and the entry page is not: it renders cold, reading the fixture api while
 * Lighthouse loads it. Nothing is warmed first; a cold entry page must score.
 */
async function checkLighthouse(origin, chrome, fixture) {
  log(`\nLighthouse ${LIGHTHOUSE_VERSION} (each category must be at least ${LIGHTHOUSE_MIN})`)
  for (const path of ['/', '/blog/levy-explained']) {
    const report = join(work, `lighthouse${path.replace(/\W+/g, '-')}.json`)
    const before = fixture.count()
    await runAsync(
      'npx',
      [
        '--yes',
        `lighthouse@${LIGHTHOUSE_VERSION}`,
        `${origin}${path}`,
        `--chrome-path=${chrome}`,
        '--chrome-flags=--headless=new --no-sandbox',
        '--only-categories=performance,accessibility,seo',
        '--output=json',
        `--output-path=${report}`,
        '--quiet',
      ],
      work,
    )
    log(`  the fixture api answered ${fixture.count() - before} request(s) while Lighthouse loaded ${path}`)
    const { categories } = JSON.parse(readFileSync(report, 'utf8'))
    const scores = ['performance', 'accessibility', 'seo'].map((name) => [name, Math.round((categories[name]?.score ?? 0) * 100)])
    log(`  ${path}: ${scores.map(([name, score]) => `${name} ${score}`).join(', ')}`)
    for (const [name, score] of scores) check(score >= LIGHTHOUSE_MIN, `${path} ${name} is ${score} (at least ${LIGHTHOUSE_MIN})`)
  }
}


// ── The kitchen sink, checked section by section ─────────────────────────────

const decode = (html) =>
  html
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** Each `data-type` section of a page and its markup, in page order. */
function sectionsOf(html) {
  const main = html.slice(html.indexOf('<main'), html.lastIndexOf('</main>'))
  const starts = [...main.matchAll(/<section\b[^>]*\bdata-type="([^"]+)"/g)]
  return starts.map((m, i) => ({ type: m[1], html: main.slice(m.index, starts[i + 1]?.index ?? main.length) }))
}

/**
 * The kitchen sink's events as the EventsList shows them: in each event's own
 * zone with its short name, daylight and standard time alike, so a UTC
 * evening lands on the zone's day; a zone Intl rejects falls back to UTC.
 */
const EVENT_WHEN = {
  evt_1: 'Thursday, October 15, 2026 at 6:00 PM CDT',
  evt_2: 'Saturday, October 17, 2026 at 9:00 AM CDT',
  evt_3: 'Monday, October 19, 2026 at 7:00 PM CDT',
  evt_4: 'Wednesday, January 13, 2027 at 6:30 PM CST',
  evt_5: 'Thursday, October 22, 2026 at 11:00 PM UTC',
}

/** The text a data section must show for each of its rows, by block type. */
const literal = (value) => typeof value === 'string' && value !== '' && !value.startsWith('auto:')
const ROW_TEXT = {
  Issues: (i) => [i.title],
  StatCards: (i) => (literal(i.value) ? [i.value, i.label] : []),
  QuoteStrip: (i) => [i.quote],
  Map: (i) => [i.region],
  MovementMap: (i) => (literal(i.value) ? [i.value, i.label] : []),
  MovementTicker: (i) => (literal(i.value) ? [i.value, i.label] : []),
  EventsList: (i) => [i.title, EVENT_WHEN[i.id]],
  Collection: (i) => [i.title],
  ContentPost: (i) => [i.title],
  PlatformPlanks: (i) => [i.title, ...(i.planks ?? []).map((p) => p.headline)],
  CandidateRoster: (i) => [i.name],
  TeamGrid: (i) => [i.name ?? i.role],
  Progress: (i) => [`$${Math.round(i.raised_cents / 100).toLocaleString('en-US')}`],
  Countdown: () => [],
  Leaderboard: () => [],
  SocialFeed: () => [],
  Blog: () => [],
}
/**
 * Data blocks whose rows the Content API never carries (their live rows stay
 * in BackGold); the starter renders nothing for them rather than an empty shell.
 */
const ALWAYS_EMPTY = ['Leaderboard', 'SocialFeed']

async function checkKitchenSink(origin, kitchen, disclaimer) {
  log('\nKitchen sink: one section of every type, made by the api projection')
  const res = await get(origin, '/kitchen-sink')
  const html = await res.text()
  check(res.status === 200, `GET /kitchen-sink is 200 (got ${res.status})`)
  check(tags(html, 'h1').length === 1, `it has exactly one <h1> (found ${tags(html, 'h1').length})`)
  check(html.includes(disclaimer), 'it shows the disclaimer')

  const rendered = sectionsOf(html)
  const types = Object.entries(kitchen.blocks).filter(([, spec]) => spec.role !== 'chrome')
  const failures = []
  for (const [type, spec] of types) {
    const section = kitchen.sections.find((s) => s.type === type)
    if (!section) {
      failures.push(`${type}: the projection made no section`)
      continue
    }
    const found = rendered.filter((r) => r.type === type)
    if (ALWAYS_EMPTY.includes(type)) {
      if (found.length !== 0 || section.data?.items.length !== 0) failures.push(`${type}: expected no rows and no section`)
      continue
    }
    if (found.length !== 1) {
      failures.push(`${type}: ${found.length} sections rendered`)
      continue
    }
    const markup = found[0].html
    const text = decode(markup.replace(/<script\b[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ')
    const bad = /\b(undefined|null|NaN)\b|\[object Object\]/.exec(text) ?? /="(undefined|null|NaN|\[object Object\])"/.exec(markup)
    if (bad) failures.push(`${type}: renders the literal ${JSON.stringify(bad[0])}`)
    const heading = section.copy.heading ?? section.copy.title ?? section.copy.headline
    if (heading && !text.includes(heading)) failures.push(`${type}: heading ${JSON.stringify(heading)} missing`)

    if (spec.role === 'compliance') {
      const frames = tags(markup, 'iframe')
      const own = /<(form|input|button|select|textarea)\b/.exec(markup)
      if (own) failures.push(`${type}: renders a <${own[1]}> of its own`)
      if (section.embed?.iframe) {
        const src = section.embed.iframe.replace(/&/g, '&amp;')
        if (frames.length !== 1 || !frames[0].includes(`src="${src}"`)) failures.push(`${type}: expected one iframe of ${section.embed.iframe}, found ${frames.length}`)
      } else if (section.embed?.mount) {
        const mount = Object.entries(section.embed.mount).every(([name, value]) => markup.includes(value === '' ? ` ${name}` : `${name}="${value}"`))
        if (frames.length !== 0 || !mount || !markup.includes(`src="${section.embed.script}"`)) failures.push(`${type}: expected its mount container and script`)
      } else if (frames.length !== 0) {
        failures.push(`${type}: has no embed but renders an iframe`)
      }
      continue
    }

    // A Hero with its capture on frames BackGold's form below its words.
    if (type === 'Hero') {
      const frames = tags(markup, 'iframe')
      const want = section.embed?.iframe ? 1 : 0
      if (frames.length !== want || (want && !frames[0].includes(`src="${section.embed.iframe}"`))) {
        failures.push(`Hero: expected ${want} iframe(s)${want ? ` of ${section.embed.iframe}` : ''}, found ${frames.length}`)
      }
      if (!want) failures.push('Hero: the kitchen sink hero has its capture on, so it must carry an embed')
    }

    const rowText = ROW_TEXT[type]
    if (section.data && !rowText) {
      failures.push(`${type}: a data block with no row rule in starter-e2e.mjs ROW_TEXT`)
      continue
    }
    for (const item of section.data?.items ?? []) {
      for (const want of rowText(item)) if (want && !text.includes(want)) failures.push(`${type}: row text ${JSON.stringify(want)} missing`)
    }
  }
  check(failures.length === 0, `every non-chrome block type renders as its projection says (${types.length} types)${failures.length ? `:\n      ${failures.join('\n      ')}` : ''}`)
  check(rendered.length === types.length - ALWAYS_EMPTY.length, `no section renders twice or unasked (${rendered.length} sections)`)
}

// ── The party boards' data drawings ──────────────────────────────────────────

/** The markup of the page's section of `type` that contains `marker`. */
function sectionWith(html, type, marker) {
  return sectionsOf(html).find((s) => s.type === type && s.html.includes(marker))?.html ?? ''
}

/** Text with tags dropped and entities decoded, whitespace collapsed. */
const plain = (html) => decode(html.replace(/<script\b[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

/**
 * Runs the page's live-counts script as a browser would after load, against
 * a stand-in document holding the page's `data-bg-live` slots, with the real
 * fetch (so it reads the fixture api). Returns each slot's id and text.
 */
async function runLiveScript(html) {
  const tag = /<script\b([^>]*\bdata-bg-live-api="[^"]*"[^>]*)>([\s\S]*?)<\/script>/.exec(html)
  if (!tag) throw new CheckFailed('the page has no live-counts script')
  const attributes = Object.fromEntries([...tag[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]))
  const slots = [...html.matchAll(/\bdata-bg-live="([^"]*)"/g)].map((m) => {
    const id = decode(m[1])
    return { id, textContent: '', getAttribute: (name) => (name === 'data-bg-live' ? id : null) }
  })
  const reads = []
  const document = {
    readyState: 'complete',
    currentScript: { getAttribute: (name) => attributes[name] ?? null },
    querySelectorAll: (selector) => (selector === '[data-bg-live]' ? slots : []),
    addEventListener: () => {},
  }
  runInNewContext(tag[2], {
    document,
    fetch: (...args) => {
      const read = fetch(...args)
      reads.push(read)
      return read
    },
    encodeURIComponent,
    isFinite,
  })
  await Promise.allSettled(reads)
  await new Promise((r) => setTimeout(r, 100))
  return { attributes, slots, reads: reads.length }
}

// Renders LiveCounts.astro alone with Astro's container through the copy's own
// astro and vite (no astro.config, so no adapter), with a first-party
// locals.backgold, and prints the markup as one JSON line.
const FIRST_PARTY_PROBE = `import { createServer } from 'vite'
import { getViteConfig } from 'astro/config'
const config = await getViteConfig({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false } }, { configFile: false, logLevel: 'silent' })({ command: 'serve', mode: 'test' })
const server = await createServer({ ...config, configFile: false })
try {
  const { experimental_AstroContainer } = await server.ssrLoadModule('astro/container')
  const { default: LiveCounts } = await server.ssrLoadModule('/src/components/sections/EventsList/LiveCounts.astro')
  const container = await experimental_AstroContainer.create()
  const html = await container.renderToString(LiveCounts, { locals: { backgold: { firstParty: true } } })
  console.log('PROBE ' + JSON.stringify(html))
} finally {
  await server.close()
}
`

/**
 * First-party live counts, unit-level (the fixture api cannot answer on the
 * site's own origin): the script a first-party site writes asks the
 * same-origin path and carries no key, and run as a browser would it sends
 * no Authorization header.
 */
async function checkFirstPartyLive(siteDir) {
  log('\nFirst-party live counts (LiveCounts rendered alone, first-party locals)')
  const probe = join(siteDir, 'live-first-party-probe.mjs')
  writeFileSync(probe, FIRST_PARTY_PROBE)
  const result = spawnSync('node', [probe], { cwd: siteDir, encoding: 'utf8', env: process.env })
  rmSync(probe, { force: true })
  const line = (result.stdout ?? '').split('\n').find((l) => l.startsWith('PROBE '))
  if (result.status !== 0 || !line) throw new Error(`the first-party probe exited with ${result.status}\n${result.stdout}${result.stderr}`)
  const html = JSON.parse(line.slice(6))
  const tag = /<script\b([^>]*\bdata-bg-live-api="[^"]*"[^>]*)>([\s\S]*?)<\/script>/.exec(html)
  check(tag !== null && /\bdata-bg-live-api="\/api\/content\/v1\/events\/live"/.test(tag[1]), 'first-party, the script asks the same-origin path /api/content/v1/events/live')
  check(!/data-bg-live-key/.test(tag[1]), 'and carries no key attribute')
  const slot = { textContent: '', getAttribute: (name) => (name === 'data-bg-live' ? 'evt_w1' : null) }
  const asked = []
  runInNewContext(tag[2], {
    document: {
      readyState: 'complete',
      currentScript: { getAttribute: (name) => (name === 'data-bg-live-api' ? '/api/content/v1/events/live' : null) },
      querySelectorAll: () => [slot],
      addEventListener: () => {},
    },
    fetch: (url, init) => {
      asked.push({ url, headers: init?.headers ?? {} })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [{ id: 'evt_w1', going: 3, seats_left: null }] }) })
    },
    encodeURIComponent,
    isFinite,
  })
  await new Promise((r) => setTimeout(r, 50))
  check(
    asked.length === 1 && asked[0].url === '/api/content/v1/events/live?ids=evt_w1' && !Object.keys(asked[0].headers).some((h) => h.toLowerCase() === 'authorization') && slot.textContent === '3 going',
    `run as a browser would, it asks /api/content/v1/events/live?ids=evt_w1 with no Authorization header and fills the slot (${JSON.stringify(asked)}, "${slot.textContent}")`,
  )
}

async function checkPartyBoards(origin, fixture) {
  log('\nParty boards: live counts, tickets, event types, news search, roster, seats')
  const liveReads = () => fixture.state.seen.filter((s) => s.path === '/events/live')

  // A6: the events page.
  const beforeLive = liveReads().length
  let res = await get(origin, '/events')
  let html = await res.text()
  check(res.status === 200 && tags(html, 'h1').length === 1, `GET /events is 200 with one <h1> (got ${res.status})`)
  check(liveReads().length === beforeLive, 'rendering /events reads no live counts on the server')
  const agenda = sectionWith(html, 'EventsList', 'class="agenda"')
  const cards = sectionWith(html, 'EventsList', 'class="ev-cards"')
  check(agenda !== '' && cards !== '', 'the events page draws its Agenda and its Cards sections')
  const slotIds = (markup) => [...markup.matchAll(/<(?:span|p)\b[^>]*\bdata-bg-live="([^"]+)"[^>]*><\/(?:span|p)>/g)].map((m) => m[1])
  const upcomingIds = fixture.data.events.upcoming.map((e) => e.id)
  check(
    JSON.stringify(slotIds(agenda)) === JSON.stringify(upcomingIds) && JSON.stringify(slotIds(cards)) === JSON.stringify(['evt_w1', 'evt_w3']),
    `each agenda row and card has an empty data-bg-live slot named by its event id (${slotIds(agenda).join(', ')} / ${slotIds(cards).join(', ')})`,
  )
  const liveScripts = html.split('data-bg-live-api=').length - 1
  check(liveScripts === 1, `the live-counts script is on the page once for two event sections (found ${liveScripts})`)
  const ran = await runLiveScript(html)
  check(
    ran.attributes['data-bg-live-api'] === `${fixture.origin}/api/content/v1/events/live` && ran.attributes['data-bg-live-key'] === SITE_KEY,
    "the script reads the api's /events/live with the publishable key",
  )
  const read = liveReads().at(-1)
  check(
    ran.reads === 1 && read && read.key === SITE_KEY && decodeURIComponent(read.search) === `?ids=${upcomingIds.join(',')}`,
    `run as a browser would, it asks once for every id on the page (${read ? decodeURIComponent(read.search) : 'no read'})`,
  )
  const filled = Object.fromEntries(upcomingIds.map((id) => [id, ran.slots.filter((s) => s.id === id).map((s) => s.textContent)]))
  check(
    filled.evt_w1.every((t) => t === '142 going') &&
      filled.evt_w3.every((t) => t === '88 going · 12 seats left') &&
      filled.evt_w2.every((t) => t === '') &&
      filled.evt_w4.every((t) => t === '') &&
      filled.evt_w1.length === 2 &&
      filled.evt_w3.length === 2,
    `it fills each slot: "142 going", "88 going · 12 seats left", and nothing for an event left out or with no one going (${JSON.stringify(filled)})`,
  )
  const actions = (markup) => [...markup.matchAll(/<a class="button" href="([^"]*)"[^>]*>([^<]*)<span class="visually-hidden"[^>]*>: ([^<]*)<\/span>/g)].map((m) => [decode(m[3]), m[2], decode(m[1])])
  const agendaActions = Object.fromEntries(actions(agenda).map(([title, label, href]) => [title, `${label} ${href}`]))
  check(
    agendaActions['Get-out-the-vote dinner'] === 'Get tickets https://events.example.org/gotv-dinner/tickets' &&
      agendaActions['Harlow County candidate forum'] === 'RSVP https://events.example.org/candidate-forum' &&
      agendaActions['New member night'] === 'Details https://events.example.org/new-member-night',
    `the agenda's buttons: Get tickets to the tickets address, RSVP, Details once registration closed (${JSON.stringify(agendaActions)})`,
  )
  check(
    actions(cards).some(([title, label, href]) => title === 'Get-out-the-vote dinner' && label === 'Get tickets' && href === 'https://events.example.org/gotv-dinner/tickets'),
    'the cards draw Get tickets on the event that sells tickets',
  )
  const tabsOf = (markup) => [...(/<nav class="agenda-tabs[^"]*"[^>]*>([\s\S]*?)<\/nav>/.exec(markup)?.[1] ?? '').matchAll(/<a href="([^"]*)"([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ href: m[1], current: /aria-current="page"/.test(m[2]), label: decode(m[3]) }))
  let tabs = tabsOf(agenda)
  check(
    JSON.stringify(tabs.map((t) => `${t.label} ${t.href}`)) === JSON.stringify(['All /events', 'Meetings /events/meeting', 'Volunteer /events/volunteer', 'Fundraisers /events/fundraiser']) && tabs[0].current && tabs.filter((t) => t.current).length === 1,
    `the agenda's type tabs: All (current), then each type with an upcoming event; no tab for Rallies (${tabs.map((t) => t.label).join(', ')})`,
  )
  check(!cards.includes('agenda-tabs'), 'the Cards section draws no tabs')

  res = await get(origin, '/events/volunteer')
  html = await res.text()
  const typedAgenda = sectionWith(html, 'EventsList', 'class="agenda"')
  tabs = tabsOf(typedAgenda)
  check(
    res.status === 200 &&
      plain(typedAgenda).includes('Door-knock Saturday in Alder County') &&
      plain(typedAgenda).includes('New member night') &&
      !plain(typedAgenda).includes('Harlow County candidate forum') &&
      !plain(typedAgenda).includes('Get-out-the-vote dinner'),
    `/events/volunteer draws the agenda with the volunteer events from GET /events?type=volunteer (got ${res.status})`,
  )
  check(tabs.find((t) => t.current)?.label === 'Volunteer', 'and marks the Volunteer tab current')
  check(plain(sectionWith(html, 'EventsList', 'class="ev-cards"')).includes('Harlow County candidate forum'), 'the Cards section there keeps its baked rows')
  check(/<link rel="canonical" href="[^"]*\/events\/volunteer"/.test(html) && tags(html, 'h1').length === 1, '/events/volunteer is its own canonical address, with one <h1>')
  check(
    fixture.state.seen.some((s) => s.path === '/events' && new URLSearchParams(s.search).get('type') === 'volunteer' && new URLSearchParams(s.search).get('limit') === '50'),
    "it read GET /events?type=volunteer with limit=50, the agenda's cap of 80 held to the api's maximum (the api answers 400 BAD_LIMIT above 50)",
  )
  for (const path of ['/events/rally', '/events/no-such-type']) {
    res = await get(origin, path)
    await res.text()
    check(res.status === 404, `${path} (no upcoming event, or no such type) is a 404 (got ${res.status})`)
  }

  // A4: the news list's search.
  const searchForm = (page) => /<form class="list-search"[^>]*>([\s\S]*?)<\/form>/.exec(page)
  res = await get(origin, '/blog?q=the')
  html = await res.text()
  let text = plain(html)
  check(
    res.status === 200 && text.includes('2 results for ‘the’') && html.includes('The levy, explained') && html.includes('Open books, line by line'),
    `/blog?q=the lists the two posts that match, under "2 results for ‘the’" (got ${res.status})`,
  )
  check(!/<nav class="pager"/.test(html) && /no-store/.test(res.headers.get('cache-control') ?? ''), 'a search has no pager and is never stored')
  check(/<input\b[^>]*name="q"[^>]*value="the"/.test(searchForm(html)?.[0] ?? '') && /<nav class="list-filter"/.test(html), 'the box keeps the search, and the filter chips stay')
  check(fixture.state.seen.some((s) => s.path === '/entries/post' && new URLSearchParams(s.search).get('q') === 'the'), 'it read GET /entries/post?q=the')
  res = await get(origin, '/blog?q=zz')
  html = await res.text()
  check(res.status === 200 && plain(html).includes('Nothing matches ‘zz’.') && !html.includes('post-rows'), `/blog?q=zz says "Nothing matches ‘zz’." (got ${res.status})`)
  const searchesBefore = fixture.state.seen.filter((s) => new URLSearchParams(s.search).has('q')).length
  for (const path of ['/blog?q=x', `/blog?q=${'a'.repeat(81)}`]) {
    res = await get(origin, path)
    html = await res.text()
    check(res.status === 200 && html.includes('Open books, line by line') && !/results? for|Nothing matches/.test(plain(html)), `${path.slice(0, 24)}… (under 2 or over 80 characters) shows the list and asks the api nothing`)
  }
  check(fixture.state.seen.filter((s) => new URLSearchParams(s.search).has('q')).length === searchesBefore, 'a search out of range never reaches the api')
  res = await get(origin, '/blog')
  html = await res.text()
  const form = searchForm(html)?.[0] ?? ''
  check(
    res.headers.get('x-backgold-cache') === 'MISS' && /role="search"/.test(form) && /action="\/blog"/.test(form) && /method="get"/.test(form) && /name="q"/.test(form) && !/value=/.test(form) && plain(form).includes('Search news'),
    `/blog draws the "Search news" box (a GET form to /blog with q), and no search was stored under its address (X-Backgold-Cache: ${res.headers.get('x-backgold-cache')})`,
  )
  check(!/results? for|Nothing matches/.test(plain(html)), 'the bare list shows no search sentence')
  res = await get(origin, '/endorsements')
  check(!/class="list-search"/.test(await res.text()), 'a list other than News has no search box')

  // A3: the leadership page.
  res = await get(origin, '/leadership')
  html = await res.text()
  check(res.status === 200 && tags(html, 'h1').length === 1, `GET /leadership is 200 with one <h1> (got ${res.status})`)
  const roster = sectionWith(html, 'CandidateRoster', 'data-ballot')
  const levelTabs = [...roster.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*data-ballot-level="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({ pressed: m[1] === 'true', level: decode(m[2]), label: plain(m[3]) }))
  check(
    JSON.stringify(levelTabs.map((t) => t.label)) === JSON.stringify(['All 11', 'Federal 1', 'State 3', 'County 3', 'Local 2', 'School board 2']) && levelTabs[0].pressed && levelTabs.filter((t) => t.pressed).length === 1,
    `the ballot's tabs: All first, then each level present in ballot order with its count (${levelTabs.map((t) => t.label).join(', ')})`,
  )
  check(
    /<div class="ballot-controls"[^>]*\bhidden\b/.test(roster) && /<input\b[^>]*placeholder="Find a candidate or county"/.test(roster) && roster.split('<script').length - 1 === 1,
    'the search box and tabs are drawn hidden for the section script to show (no route), with one script',
  )
  const levelsOn = [...roster.matchAll(/<li class="ballot-cand" data-level="([^"]*)" data-find="([^"]*)"/g)].map((m) => [decode(m[1]), decode(m[2])])
  check(levelsOn.length === 11 && levelsOn.every(([level]) => level !== '') && levelsOn.some(([, find]) => find === 'noor ellingsworth state senate district 12 · alder, brannock'), 'each candidate carries its level and its name, office and place for the filter')
  const donates = [...roster.matchAll(/<a class="button" href="([^"]*)"[^>]*>Donate<span class="visually-hidden"[^>]*> to ([^<]*)<\/span>/g)].map((m) => [decode(m[2]), decode(m[1])])
  check(
    JSON.stringify(donates) === JSON.stringify([['Halvard Brisco', 'https://secure.backgold.com/donate/brisco']]),
    `Donate is drawn only for the candidate with a donate address (${JSON.stringify(donates)})`,
  )
  check(/<ul class="ballot-issues"[^>]*>\s*<li[^>]*>Taxes<\/li>\s*<li[^>]*>Open books<\/li>\s*<\/ul>/.test(roster), "a candidate's issues are chips")
  const team = sectionWith(html, 'TeamGrid', 'seat-group')
  const groups = [...team.matchAll(/<h3 class="seat-group-name"[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => plain(m[1]))
  check(
    JSON.stringify(groups) === JSON.stringify(['Officers 2 seats · term ends April 2027', 'At-large members 2 seats', 'Staff 1 seat']),
    `the team board groups seats by body, officers first and Staff last, a shared term beside the count (${groups.join(' | ')})`,
  )
  const teamText = plain(team)
  check(
    teamText.includes('Chair Rowan Achterberg since 2023 Osgood County') && teamText.includes('At-large Tobias Wrenfield since 2024 · term ends April 2027 Marrow County'),
    'a held seat shows its role, the holder, "since 2023" (and its own term when the body does not share one) and the bio',
  )
  check(
    teamText.includes('At-large · open seat This seat is open Any member in good standing can stand for it at convention. term ends April 2029') &&
      /<a class="button" href="\/open-roles\/at-large-seat"[^>]*>Ask about running/.test(team),
    "the vacant seat is an invitation with Ask about running to its open role's page",
  )
  check(/<a href="https:\/\/example\.org\/idris"[^>]*>Idris Valcourt<\/a>/.test(team) && teamText.includes('Organizer Sam Ortiz'), "a holder's name links to their link; staff are drawn under Staff")
}

/**
 * Every non-chrome, non-compliance block type has a component of its own in
 * the template. A block the api projects only inside an area (areaBlocks)
 * counts with its area role.
 */
function checkSectionsMap(chromeBlocks, areaBlocks) {
  const blocks = { ...chromeBlocks, ...areaBlocks }
  const source = readFileSync(join(TEMPLATE, 'src/components/sections/index.ts'), 'utf8')
  const body = /export const sections = \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
  const keys = new Set([...body.matchAll(/^\s*([A-Za-z]+)\s*(?::|,)/gm)].map((m) => m[1]))
  const missing = Object.entries(blocks)
    .filter(([type, spec]) => spec.role !== 'chrome' && spec.role !== 'compliance' && !keys.has(type))
    .map(([type]) => type)
  const extra = [...keys].filter((key) => !(key in blocks) || ['chrome', 'compliance'].includes(blocks[key].role))
  check(missing.length === 0, `the template has a section component for every presentational and data block${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`)
  check(extra.length === 0, `and none for a chrome or compliance block, or a type BackGold does not have${extra.length ? ` (${extra.join(', ')})` : ''}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Before the long build: --lighthouse without a Chrome fails now, never skips.
  const chrome = LIGHTHOUSE ? chromeForLighthouse() : null
  work = mkdtempSync(join(tmpdir(), 'backgold-starter-e2e-'))
  log(`Working directory: ${work} (templates/${TEMPLATE_NAME})`)
  const packDir = join(work, 'pack')
  const siteDir = join(work, 'site')
  mkdirSync(packDir)
  const tarballs = buildAndPack(packDir)
  installTemplate(siteDir, tarballs)

  log('\nBuild output')
  const firstBuild = builtId(siteDir)
  check(/^[0-9a-f]{12}$/.test(firstBuild), `the build carries a 12-hex build id (${firstBuild})`)
  const leaked = filesUnder(join(siteDir, 'dist')).filter((f) => readFileSync(f, 'utf8').includes(BUILD_CANARY))
  check(leaked.length === 0, `the build machine's environment is not in the built Worker${leaked.length ? ` (found in ${leaked.join(', ')})` : ''}`)

  if (PARTY) await checkFirstPartyLive(siteDir)

  const examples = await loadExamples()
  const disclaimer = examples.SiteResponse.legal.disclaimer
  const kitchen = await kitchenSink()
  checkSectionsMap(kitchen.blocks, kitchen.areaBlocks)
  const fixture = await startFixture(examples, kitchen.sections)
  log(`Fixture Content API: ${fixture.origin}`)
  writeFileSync(join(siteDir, '.dev.vars'), `BACKGOLD_SECRET_KEY=${SECRET_KEY}\nBACKGOLD_WEBHOOK_SECRET=${WEBHOOK_SECRET}\n`)

  // SITE_URL is the Worker's own address, so canonicals point at the page Lighthouse reads.
  const configuredVars = (origin) => ({ BACKGOLD_SITE_KEY: SITE_KEY, BACKGOLD_API_ORIGIN: fixture.origin, SITE_URL: origin })
  const configured = await startWorker(siteDir, { vars: configuredVars, logFile: join(work, 'wrangler-configured.log') })
  if (SERVE) {
    log(`\nServing ${configured.origin} (fixture api ${fixture.origin}). Ctrl-C to stop.`)
    log(`After rebuilding ${siteDir}: curl -X POST ${fixture.origin}/__bump && curl -X POST -H 'Authorization: Bearer ${WEBHOOK_SECRET}' ${configured.origin}/api/backgold/revalidate`)
    await new Promise(() => {})
  }
  try {
    await checkConfigured(configured.origin, fixture, disclaimer)
    await checkKitchenSink(configured.origin, kitchen, disclaimer)
    if (PARTY) await checkPartyBoards(configured.origin, fixture)
    if (chrome) await checkLighthouse(configured.origin, chrome, fixture)
  } finally {
    await killTree(configured.child)
  }

  const unconfigured = await startWorker(siteDir, { vars: { BACKGOLD_API_ORIGIN: fixture.origin }, logFile: join(work, 'wrangler-setup.log') })
  try {
    await checkSetup(unconfigured.origin)
  } finally {
    await killTree(unconfigured.child)
  }
  // A code deploy: the same template built again, served over the same edge
  // cache at the same content version, must not serve the first build's pages.
  log('\nA second build')
  run('npm', ['run', 'build'], siteDir)
  const secondBuild = builtId(siteDir)
  check(/^[0-9a-f]{12}$/.test(secondBuild) && secondBuild !== firstBuild, `a second build carries a different build id (${firstBuild} then ${secondBuild})`)
  // No SITE_URL this time: each Host the site is asked under must get its own cached pages.
  const redeployed = await startWorker(siteDir, {
    vars: { BACKGOLD_SITE_KEY: SITE_KEY, BACKGOLD_API_ORIGIN: fixture.origin },
    logFile: join(work, 'wrangler-redeployed.log'),
  })
  try {
    let res = await get(redeployed.origin, '/')
    await res.text()
    check(res.status === 200 && res.headers.get('x-backgold-cache') === 'MISS', `the redeployed Worker renders home afresh (X-Backgold-Cache: ${res.headers.get('x-backgold-cache')})`)
    res = await get(redeployed.origin, '/')
    await res.text()
    check(res.headers.get('x-backgold-cache') === 'HIT', 'and caches its own render (HIT on the next read)')

    const canonical = (html) => /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1]
    const forged = await getWithHost(redeployed.origin, '/endorsements', 'attacker.example')
    const plain = await get(redeployed.origin, '/endorsements')
    const plainHtml = await plain.text()
    check(
      !canonical(plainHtml)?.includes('attacker.example') && plain.headers.get('x-backgold-cache') === 'MISS',
      `without SITE_URL a page rendered for another Host is not served to this one (forged Host: ${forged.cache}, ${canonical(forged.body)}; then ${plain.headers.get('x-backgold-cache')}, ${canonical(plainHtml)})`,
    )
  } finally {
    await killTree(redeployed.child)
  }

  const workerLog = ['configured', 'setup', 'redeployed'].map((name) => readFileSync(join(work, `wrangler-${name}.log`), 'utf8')).join('')
  check(!workerLog.includes(SECRET_KEY) && !workerLog.includes(WEBHOOK_SECRET), 'no secret reached the Worker log')
  log('\nAll checks passed.')
}

async function cleanup() {
  await Promise.all([...children].map(killTree))
  for (const server of servers) server.close()
  servers.clear()
  if (!work) return
  if (KEEP) log(`Kept: ${work}`)
  else rmSync(work, { recursive: true, force: true })
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    cleanup().finally(() => process.exit(130))
  })
}

try {
  await main()
} catch (error) {
  process.exitCode = 1
  if (error instanceof CheckFailed) log(`\nFAILED: ${error.message}`)
  else log(`\nERROR: ${error instanceof Error ? error.stack : String(error)}`)
  if (work) log(`Logs: ${work}/wrangler-*.log${KEEP ? '' : ' (rerun with --keep to look at them)'}`)
} finally {
  await cleanup()
}
