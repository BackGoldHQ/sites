#!/usr/bin/env node
// The starter template (or another template under templates/) and the
// packages it is built on, end to end on workerd: builds @backgold/content
// and @backgold/astro, packs them (and the workspace packages a template on
// the kit also names: @backgold/template-kit and the vendored contract,
// @backgold/contract), installs them with npm into a copy of the template
// outside the repository (its package.json pointed at the tarballs, so
// nothing resolves through the pnpm workspace or from npm's copies of the
// packages), checks that npm put workerd's binary for this platform there
// (installing once more when it did not), builds it, and runs it on
// `wrangler dev` against a fixture Content API served from
// CONTENT_API_EXAMPLES in the vendored contract (vendor/backgold-contract):
// first an organization that kept the legacy blog address (`/blog`), then one
// at `/news` with a page there, the news list's intro. Exits non-zero at the
// first failed check.
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
//   node scripts/starter-e2e.mjs --serve --news
//                                         the same, the organization at /news
//                                         with its list's intro (newsBaseData);
//                                         --template candidate serves at /news
//                                         without it
//   node scripts/starter-e2e.mjs --lighthouse
//                                         also score home and an entry page with
//                                         Lighthouse (performance, accessibility,
//                                         SEO >= 95); needs Chrome at $CHROME_BIN
//
// --template party needs Chrome at $CHROME_BIN too: the party template's look
// (the header button's contrast, the accent, the faces, light and dark) is
// read in a headless Chrome, driven over the DevTools protocol. So does
// --template petition-drive: its starter page (dark first, the anchors, no
// money, light after the switch) is read the same way.
// --template candidate, for its own layouts' look (its block, near the end).
//   node scripts/starter-e2e.mjs --template candidate
//                                         the candidate template's checks, its
//                                         starter pages at /candidate-<slug>
// --template nonprofit serves its starter pages at /nonprofit-<slug> and
// checks its own layouts and its middleware in the HTML (its block, near
// the end); with --serve, at their own addresses.
// --template academy also runs the template first-party, as BackGold serves
// it (its block, near the end): the Worker reads the fixture through a
// service binding to a stand-in api Worker, a visitor signs in through the
// portal's return leg, and the classroom, a course, a lesson's player and
// the locked lessons' doors are read signed out and signed in, in Chrome at
// 1440 and 375, light and dark.
//   node scripts/starter-e2e.mjs --template academy --shots <dir>
//                                         also writes a full-page PNG of each
//                                         page it reads in Chrome to <dir>
//
// Needs node >= 22.12, pnpm and npm. No dependencies beyond node's own.

import { spawn, spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { accessSync, constants as fsConstants, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
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
// A template on the kit (@backgold/template-kit: a src/template.ts) draws
// what the kit draws (BackGold's modules framed in the site's look, the light
// and dark switch, the kit's lists, entries and 404) and is checked for it;
// the public starter is not on the kit.
const ON_KIT = existsSync(join(TEMPLATE, 'src/template.ts'))
// The face a kit template's module frames are asked for: its config's
// `frameFont`, else the kit's Public Sans.
const FRAME_FONT = (ON_KIT && /\bframeFont:\s*'([a-z-]+)'/.exec(readFileSync(join(TEMPLATE, 'src/template.ts'), 'utf8'))?.[1]) || 'public-sans'
// The corners those frames are asked for: its config's `frameRadius`, else the kit's 12.
const FRAME_RADIUS = (ON_KIT && /\bframeRadius:\s*(\d+)/.exec(readFileSync(join(TEMPLATE, 'src/template.ts'), 'utf8'))?.[1]) || '12'
// ── petition-drive (begin) ──
const PETITION_DRIVE = TEMPLATE_NAME === 'petition-drive'
// ── petition-drive (end) ──
// ── unlabeled (begin) ──
const UNLABELED = TEMPLATE_NAME === 'unlabeled'
// ── unlabeled (end) ──
const SERVE = process.argv.includes('--serve')
// --serve: the organization at /news (newsBaseData), always on the candidate template.
const SERVE_NEWS = SERVE && (process.argv.includes('--news') || TEMPLATE_NAME === 'candidate')
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
function runAsync(command, args, cwd, extraEnv = {}) {
  log(`$ ${command} ${args.join(' ')}   (in ${cwd})`)
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv }, detached: true })
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
  run('pnpm', ['--filter', '@backgold/content', 'build'], ROOT)
  run('pnpm', ['--filter', '@backgold/astro', 'build'], ROOT)
  run('pnpm', ['pack', '--pack-destination', packDir], join(ROOT, 'packages/content-client'))
  run('pnpm', ['pack', '--pack-destination', packDir], join(ROOT, 'packages/astro-backgold'))
  run('pnpm', ['pack', '--pack-destination', packDir], join(ROOT, 'packages/template-kit'))
  run('pnpm', ['pack', '--pack-destination', packDir], join(ROOT, 'vendor/backgold-contract'))
  const files = readdirSync(packDir)
  const tarball = (pattern) => {
    const file = files.find((f) => pattern.test(f))
    if (!file) throw new Error(`pnpm pack wrote ${files.join(', ')}`)
    return join(packDir, file)
  }
  return {
    content: tarball(/^backgold-content-.*\.tgz$/),
    astro: tarball(/^backgold-astro-.*\.tgz$/),
    kit: tarball(/^backgold-template-kit-.*\.tgz$/),
    contract: tarball(/^backgold-contract-.*\.tgz$/),
  }
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
  // A template on the kit names the kit and the contract (which its
  // src/template.ts parses template.json with); neither is on npm.
  if (pkg.dependencies['@backgold/template-kit']) pkg.dependencies['@backgold/template-kit'] = `file:${tarballs.kit}`
  if (pkg.dependencies['@backgold/contract']) pkg.dependencies['@backgold/contract'] = `file:${tarballs.contract}`
  // @backgold/astro depends on @backgold/content, and the kit names both as
  // peers; the overrides make every one of them the tarball, never the copy
  // on npm.
  pkg.overrides = { '@backgold/content': content, '@backgold/astro': astro }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  const install = ['install', '--no-audit', '--no-fund', '--loglevel=error']
  run('npm', install, siteDir)
  let missing = missingWorkerdBinaries(siteDir)
  if (missing.length) {
    log(`npm install left out ${missing.join(', ')} (workerd's binary for ${process.platform} ${process.arch}, an optional dependency npm skips when its download fails); installing again`)
    run('npm', install, siteDir)
    missing = missingWorkerdBinaries(siteDir)
    if (missing.length) {
      throw new Error(`npm install did not install ${missing.join(', ')}, workerd's binary for ${process.platform} ${process.arch}, in two tries; the template cannot build or run without it.`)
    }
  }
  run('npm', ['run', 'build'], siteDir, { PATH: `${process.env.PATH}${delimiter}/${BUILD_CANARY}` })
  run('npm', ['run', 'check'], siteDir)
}

/**
 * workerd's binary is a per-platform package (`@cloudflare/workerd-linux-64`,
 * `@cloudflare/workerd-linux-arm64`, ...) that npm installs as an optional
 * dependency of `workerd`. npm skips an optional dependency whose download
 * fails and still exits 0; the build then stops with workerd's own "could not
 * be found". Returns the platform package each copy of workerd under
 * `siteDir/node_modules` names in its optionalDependencies for this platform
 * and cannot resolve, once per name.
 */
function missingWorkerdBinaries(siteDir) {
  const workerdDirs = packageDirs(join(siteDir, 'node_modules'), 'workerd')
  if (!workerdDirs.length) throw new Error(`npm install put no workerd under ${join(siteDir, 'node_modules')}; wrangler and the Cloudflare adapter need it.`)
  const wanted = `@cloudflare/workerd-${process.platform}-${process.arch === 'x64' ? '64' : process.arch}`
  const missing = new Set()
  for (const dir of workerdDirs) {
    const optional = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).optionalDependencies ?? {}
    if (!(wanted in optional)) throw new Error(`workerd at ${dir} has no binary package for ${process.platform} ${process.arch} (its optionalDependencies name ${Object.keys(optional).join(', ')}).`)
    try {
      createRequire(join(dir, 'package.json')).resolve(`${wanted}/package.json`)
    } catch {
      missing.add(wanted)
    }
  }
  return [...missing]
}

/** Every unscoped package directory named `name` under `nodeModules`, nested node_modules included. */
function packageDirs(nodeModules, name) {
  let entries
  try {
    entries = readdirSync(nodeModules, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((d) => {
    if (!d.isDirectory() || d.name.startsWith('.')) return []
    const dirs = d.name.startsWith('@')
      ? readdirSync(join(nodeModules, d.name), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => join(nodeModules, d.name, e.name))
      : [join(nodeModules, d.name)]
    const own = d.name === name && existsSync(join(nodeModules, d.name, 'package.json')) ? [join(nodeModules, d.name)] : []
    return [...own, ...dirs.flatMap((dir) => packageDirs(join(dir, 'node_modules'), name))]
  })
}

/** Every file under `dir`, recursively. */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesUnder(join(dir, d.name)) : [join(dir, d.name)]))
}

// ── 3. The fixture Content API ───────────────────────────────────────────────

// ── The kitchen sink: one block of every type, through the api's own projection ──

/** The kitchen sink's membership program's benefits, on every one of its rows. */
/**
 * The fixture's one course as GET /courses/:slug answers a reader with no
 * visitor: its first lesson free, the second for anyone signed in, the third
 * for members. The kitchen sink's Course and Lesson sections pin it.
 */
const ACADEMY_ORG = 'Pine Valley for Liberty'
const ACADEMY_COURSE = (() => {
  const lesson = (position, slug, title, duration_seconds, access, lock) => ({
    id: `les_${slug}`, slug, title, summary: null, url: `/courses/reading-the-budget/${slug}`, hero: null, duration_seconds, position,
    access, locked: lock !== null, lock, completed: false, position_seconds: null,
  })
  const org_name = ACADEMY_ORG
  return {
    id: 'crs_budget', slug: 'reading-the-budget', title: 'Reading the Budget', summary: 'Three short lessons on the county budget, line by line.',
    url: '/courses/reading-the-budget', hero: null, publish_at: '2026-09-01T12:00:00.000Z', updated_at: '2026-09-02T12:00:00.000Z',
    access: 'signed_in', locked: true, lock: { reason: 'signed_in', tag_label: null, org_name }, lesson_count: 3, total_seconds: 1140, progress: null,
    body: { markdown: '' },
    lessons: [
      lesson(1, 'where-the-money-goes', 'Where the money goes', 300, 'public', null),
      lesson(2, 'the-levy-line', 'The levy line', 420, 'signed_in', { reason: 'signed_in', tag_label: null, org_name }),
      lesson(3, 'asking-at-the-hearing', 'Asking at the hearing', 420, 'members', { reason: 'members', tag_label: null, org_name }),
    ],
  }
})()

/** The fixture's second course, every lesson for members: the Classroom's members card and a course no visitor here can open. */
const ACADEMY_MEMBERS_COURSE = (() => {
  const lock = { reason: 'members', tag_label: null, org_name: ACADEMY_ORG }
  const lesson = (position, slug, title, duration_seconds) => ({
    id: `les_${slug}`, slug, title, summary: null, url: `/courses/chapter-officers/${slug}`, hero: null, duration_seconds, position,
    access: 'members', locked: true, lock, completed: false, position_seconds: null,
  })
  return {
    id: 'crs_officers', slug: 'chapter-officers', title: 'Chapter Officers', summary: 'How a chapter elects officers and plans its year.',
    url: '/courses/chapter-officers', hero: null, publish_at: '2026-09-03T12:00:00.000Z', updated_at: '2026-09-04T12:00:00.000Z',
    access: 'members', locked: true, lock, lesson_count: 2, total_seconds: 780, progress: null,
    body: { markdown: '' },
    lessons: [lesson(1, 'the-officers', 'The officers', 360), lesson(2, 'a-budget-for-the-year', 'A budget for the year', 420)],
  }
})()

const ACADEMY_COURSES = [ACADEMY_COURSE, ACADEMY_MEMBERS_COURSE]

/** The visitor the fixture's portal hands back (`ACADEMY_CODE`), and their token: signed in with their email, not a member. */
const ACADEMY_CODE = 'e2e-handoff-code'
const ACADEMY_TOKEN = 'visitor:e2e-visitor-token'
const ACADEMY_VISITOR = { first_name: 'Robin', email: 'robin@example.org', member: false }
/** When the visitor finished the budget course's first lesson: three days before the run, a weekday the course head names. */
const ACADEMY_FINISHED_AT = new Date(Date.now() - 3 * 86400000).toISOString()
/** A post kept for people signed in (0547): the teaser without the visitor's token, the body with it. */
const GATED_SLUG = 'members-briefing'
const GATED_BODY = 'The briefing for people who signed in: where the levy money lands, line by line.'
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** A playable lesson's file: an upload the fixture serves a stand-in for. */
const lessonMedia = (slug) => `https://api.backgold.com/api/media-files/med_${slug}.mp4`
/** Its 720p and 1080p copies, the same address with `?size=`. */
const lessonRenditions = (slug) => ({ '720': `${lessonMedia(slug)}?size=720`, '1080': `${lessonMedia(slug)}?size=1080` })

/**
 * A course as the api answers it to `visitor` (null: the public reader).
 * Signed in, the visitor opens every public and signed-in lesson, has
 * finished the budget course's first lesson (and any lesson the fixture was
 * told of since, `done`), and stops at the members lessons; their place is
 * the course's `progress`.
 */
function courseFor(course, visitor, done = new Set()) {
  const open = (l) => l.access === 'public' || (visitor !== null && l.access === 'signed_in')
  const lessons = course.lessons.map((l) => {
    const completed = visitor !== null && open(l) && (l.slug === 'where-the-money-goes' || done.has(`${course.slug}/${l.slug}`))
    return {
      ...l,
      locked: !open(l),
      lock: open(l) ? null : l.lock,
      completed,
      completed_at: completed ? ACADEMY_FINISHED_AT : null,
      position_seconds: visitor !== null && l.slug === 'the-levy-line' && !completed ? 72 : null,
    }
  })
  const courseOpen = course.access === 'public' || (visitor !== null && course.access === 'signed_in')
  if (!visitor) return { ...course, lessons }
  const openable = lessons.filter((l) => !l.locked)
  const left = openable.filter((l) => !l.completed)
  return {
    ...course,
    locked: !courseOpen,
    lock: courseOpen ? null : course.lock,
    lessons,
    progress: {
      completed: lessons.filter((l) => l.completed).length,
      total: lessons.length,
      openable: openable.length,
      seconds_left: left.length ? left.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0) : null,
      next_lesson_slug: left[0]?.slug ?? null,
    },
  }
}

/** A course's row in GET /courses: the course without its body and lessons. */
function courseSummary(course) {
  const { body, lessons, ...summary } = course
  return summary
}

/** The fixture's courses as a Classroom section's baked rows carry them (public, no progress). */
const classroomRows = () =>
  ACADEMY_COURSES.map((c) => ({ slug: c.slug, title: c.title, summary: c.summary, url: c.url, hero_url: null, lesson_count: c.lesson_count, total_seconds: c.total_seconds, access: c.access, locked: c.locked }))

const MEMBER_BENEFITS = ['A vote at the county convention', 'The members’ letter each month', 'First pick of volunteer shifts']

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
        // The rotating layout's words (sections batch 3); split draws none.
        words: [{ title: 'Fewer excuses.' }, { title: 'Lower taxes.' }, { title: 'Open books.' }],
      }),
      block('About', {
        heading: 'About the committee',
        body: 'Neighbors who read the budget line by line.\n\nWe meet on the first Tuesday of each month.',
        photoUrl: asset('about.webp'),
        photoSide: 'left',
        // The portrait and books layouts' (the services sections): a pull
        // quote, the one button, and credentials, books and milestones.
        quote: 'Read the budget before you vote on it. Every line.',
        quoteSource: 'The committee’s first rule',
        buttonLabel: 'Meet the committee',
        buttonHref: '/about',
        items: [
          { kind: 'credential', label: 'Certified public accountant', detail: 'Three of our five members', year: '' },
          { kind: 'book', label: 'Reading a County Budget', detail: 'Pine Valley Press', year: '2025', href: 'https://example.org/books/county-budget', imageUrl: asset('budget-cover.webp') },
          { kind: 'milestone', label: 'First line-by-line audit published', detail: 'Pine County', year: '2022' },
          { kind: 'milestone', label: 'Levy freeze on the ballot', detail: 'Proposition A', year: '2026' },
        ],
      }),
      block('Issues', {
        kicker: 'Platform',
        heading: 'What we will do',
        lead: 'Three promises with numbers attached.',
        style: 'cards',
        columns: '3',
        items: [
          // A picture, a chip and what each step includes: the rows and checklist layouts' (the services sections).
          { title: 'Freeze the levy', body: 'No increase for four years.', icon: 'shield', imageUrl: asset('levy.webp'), note: 'Year one', includes: ['A ballot measure', 'A four-year cap'] },
          { title: 'Open the books', body: 'Every check online within a week.', icon: 'book', note: 'Year one', includes: ['A searchable ledger', 'Weekly updates'] },
          { title: 'Classrooms first', body: 'Administration grows no faster than enrollment.', icon: 'school', note: 'Year two', includes: [] },
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
        // Each quote's role line and logo: the logos, carousel and wall layouts' (the services sections).
        items: [
          { quote: 'I finally know where the money goes.', attribution: 'A parent in Ward 3', role: 'Pine Valley PTA', logoUrl: asset('pta-logo.svg') },
          { quote: 'The meetings are short and useful.', attribution: 'A retired teacher', role: '', logoUrl: '' },
          { quote: 'They posted the checks before anyone asked.', attribution: 'The Pine Valley Ledger', role: 'Editorial board', logoUrl: asset('ledger-logo.svg') },
          { quote: 'Our shop pays less to renew than it did in 2019.', attribution: 'A bakery owner', role: 'Main Street Merchants', logoUrl: asset('merchants-logo.svg') },
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
      // The political sections (CONTRACT §2, added 2026-10-13), each on its default layout.
      block('QuickDonate', {
        kicker: 'Chip in',
        heading: 'Keep the levy frozen',
        body: 'Every dollar goes to mail, yard signs and the fall canvass.',
        amounts: '10,25,50,100,250',
        defaultAmount: 25,
        monthly: true,
        monthlyLabel: 'Make it monthly',
        buttonLabel: 'Donate',
        donateHref: '/donate',
        note: 'Contributions are not tax deductible.',
        imageUrl: asset('canvass.webp'),
        layout: 'grid',
        // The ladder layout's rungs (sections batch 3); grid draws the amounts.
        ladder: [
          { amount: 25, impact: '50 doors knocked' },
          { amount: 100, impact: 'A precinct’s mail' },
          { amount: 250, impact: 'A canvass Saturday' },
        ],
      }),
      block('VoterTools', {
        kicker: 'November 3',
        heading: 'Make your vote count',
        body: 'Three things to check before election day.',
        registerLabel: 'Check your registration',
        registerHref: 'https://vote.example.gov/registration',
        pollingLabel: 'Find your polling place',
        pollingHref: 'https://vote.example.gov/polling-places',
        idNote: 'Bring a photo ID',
        earlyVoting: 'Early voting runs October 19 to October 30 at the county annex.',
        electionDay: 'Polls are open 7 a.m. to 7 p.m. on November 3.',
        datesHeading: 'Key dates',
        dates: [
          { label: 'Last day to register', date: '2026-10-05', note: 'Postmarked by this day' },
          { label: 'Early voting begins', date: '2026-10-19', note: '' },
          { label: 'Mail ballot request deadline', date: '2026-10-23', note: 'Received, not postmarked' },
          { label: 'Election day', date: '2026-11-03', note: 'Polls 7 a.m. to 7 p.m.' },
        ],
      }),
      block('SampleBallot', {
        kicker: 'Take it to the polls',
        heading: 'Our slate for November',
        body: 'Every race on the Pine County ballot where we endorse, and where we stand on the measures.',
        printLabel: 'Print this slate',
        endorsedLabel: 'Endorsed',
        measuresHeading: 'Ballot measures',
        note: 'There is no straight-ticket box: vote each race.',
        rows: [
          { kind: 'race', office: 'County Judge', name: 'Dana Whitfield', party: 'Liberty', region: 'Pine County', summary: 'Twelve years on the appraisal board.', href: '/candidates/dana-whitfield', imageUrl: asset('whitfield.webp'), endorsed: true },
          { kind: 'race', office: 'School Board, Place 3', name: 'Marcus Okafor', party: 'Nonpartisan', region: 'Pine Valley ISD', summary: 'Parent of three; wants the budget online.', endorsed: true },
          { kind: 'race', office: 'Justice of the Peace, Precinct 2', name: 'Elena Brandt', party: 'Liberty', region: 'Precinct 2', endorsed: true },
          { kind: 'measure', office: 'Proposition A: Library bonds', position: 'no', summary: 'A forty-year bond for one building.', region: 'Pine County' },
          { kind: 'measure', office: 'Proposition B: Open checkbook', position: 'yes', summary: 'Every county payment posted within a week.', href: '/issues', region: 'Pine County' },
          { kind: 'measure', office: 'Proposition C: Fire district merger', position: 'neutral', summary: 'Our members are split, so we take no position.', region: 'Pine County' },
        ],
      }),
      block('Scorecard', {
        kicker: 'The record',
        heading: 'How the commission voted',
        body: 'Five votes that decided what you pay.',
        sourceNote: 'Sources link to the official roll-call votes.',
        promiseLabel: 'What they promised',
        promise: 'No new taxes without a vote of the people.',
        promiseSource: 'Commissioner Hale, campaign forum, 2024',
        didLabel: 'What they did',
        did: 'Voted for the levy increase',
        didDetail: 'Order 24-117 raised the levy without a ballot measure.',
        rows: [
          { bill: 'Order 24-117', issue: 'Property tax', vote: 'yea', position: 'disagrees', date: '2024-09-10', href: 'https://records.example.gov/orders/24-117' },
          { bill: 'Order 25-031', issue: 'Open records', vote: 'nay', position: 'disagrees', date: '2025-02-18', href: 'https://records.example.gov/orders/25-031' },
          { bill: 'Order 25-088', issue: 'Spending cap', vote: 'yea', position: 'agrees', date: '2025-06-03', href: 'https://records.example.gov/orders/25-088' },
          { bill: 'Order 26-012', issue: 'Road bonds', vote: 'absent', date: '2026-01-21', href: 'https://records.example.gov/orders/26-012' },
        ],
      }),
      block('Faq', {
        kicker: 'Questions',
        heading: 'What people ask us',
        body: 'Short answers to the questions we hear at the door.',
        firstOpen: true,
        contactHeading: 'Still have a question?',
        contactLabel: 'Ask our team',
        contactHref: '/contact',
        items: [
          { question: 'Who can join?', answer: 'Anyone who lives in Pine County and agrees with the platform.', topic: 'Joining' },
          { question: 'Do I have to pay dues?', answer: 'No. Members who give help pay for mail and signs, but a vote at the convention is free.', topic: 'Joining' },
          { question: 'Where does the money go?', answer: 'Printing, postage and the fall canvass. We post every expense each quarter.', topic: 'Money' },
          { question: 'Can I volunteer one Saturday?', answer: 'Yes. Most volunteers knock doors one morning a month.', topic: 'Volunteering' },
        ],
      }),
      block('Comparison', {
        kicker: 'The choice',
        heading: 'Where we stand',
        body: 'Three issues on this year’s ballot, side by side.',
        usLabel: 'Pine Valley for Liberty',
        themLabel: 'The incumbents',
        them2Label: 'The challengers',
        leftLabel: 'More freedom',
        rightLabel: 'More government',
        rows: [
          { issue: 'Property tax', us: 'Freeze the levy for four years', them: 'Raise it with appraisals', them2: 'Cap increases at 5%', usAt: 15, themAt: 75, them2At: 55 },
          { issue: 'County spending', us: 'Post every check online', them: 'Annual summary only', them2: 'Quarterly reports', usAt: 20, themAt: 65, them2At: 60 },
          { issue: 'Schools', us: 'Classrooms before administration', them: 'A new central office', them2: 'Study it first', usAt: 30, themAt: 70, them2At: 35 },
        ],
      }),
      block('Stories', {
        kicker: 'Stories',
        heading: 'Neighbors we have stood with',
        body: 'What changed when people showed up.',
        label: 'Featured story',
        title: 'The bakery that stayed open',
        summary: 'A permit fee would have closed Rosa Delgado’s bakery. Forty neighbors came to the hearing.',
        status: 'Fee repealed',
        outcome: 'Two hundred shops pay nothing to renew',
        imageUrl: asset('bakery.webp'),
        readLabel: 'Read the full story',
        readHref: '/stories/bakery',
        watchLabel: 'Watch the story',
        watchHref: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        items: [
          { label: '2024', title: 'Permit fee repealed', body: 'Forty neighbors at the hearing; the fee is gone.', status: 'Won', tone: 'won', href: '/stories/bakery' },
          { label: '2025', title: 'Open checkbook', body: 'The county now posts payments, a month late.', status: 'In progress', tone: 'progress' },
          { label: '2026', title: 'Library bond', body: 'On the ballot as Proposition A.', status: 'On the ballot', tone: 'none' },
        ],
      }),
      // Sections batch 3 (CONTRACT §2, added 2026-10-14), each on its default layout.
      block('ShareKit', {
        kicker: 'Spread the word',
        heading: 'Share the levy facts',
        body: 'Copy a post, or share it from your phone. Every post links to the plan.',
        copyLabel: 'Copy',
        shareLabel: 'Share',
        layout: 'cards',
        items: [
          { network: 'X', text: 'The Pine Valley levy went up three years running. Freeze it: pinevalleyliberty.org/levy', href: 'https://x.com/intent/post?text=Freeze%20the%20Pine%20Valley%20levy&url=https%3A%2F%2Fpinevalleyliberty.org%2Flevy', imageUrl: asset('share-x.webp') },
          { network: 'Facebook', text: 'Our county posts its checks a month late. We want them online within a week. Read the plan and pass it on.', href: 'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fpinevalleyliberty.org%2Fplan', imageUrl: asset('share-facebook.webp') },
          { network: 'Text a friend', text: 'Coming to budget night Thursday? Main Street Library, 6 p.m. Bring a neighbor.', href: 'https://pinevalleyliberty.org/events', imageUrl: '' },
        ],
      }),
      block('Financials', {
        kicker: 'Open books',
        heading: 'Where the money went',
        body: 'Every dollar we raised last year, as our annual report states it.',
        year: '2025',
        sourceNote: 'From our 2025 annual report',
        reportLabel: 'Read the full report',
        reportHref: asset('annual-report.pdf'),
        layout: 'bars',
        rows: [
          { category: 'Candidates and field', share: 62, amount: '$412,000', note: 'Doors, mail and filing fees' },
          { category: 'Mail and digital', share: 21, amount: '$139,000', note: '' },
          { category: 'Staff', share: 11, amount: '$73,000', note: '' },
          { category: 'Overhead', share: 6, amount: '$40,000', note: '' },
        ],
      }),
      // The services sections (CONTRACT §2, added 2026-10-14), each on its
      // default layout, in the voice of a consulting firm, a training program
      // and a show.
      block('Services', {
        kicker: 'Ridgeline Strategies',
        heading: 'What we do for campaigns',
        body: 'Three ways to work with us, priced the way we bill them.',
        featuredLabel: 'Where most campaigns start',
        startingLabel: 'Starting at',
        note: 'Every engagement starts with a free thirty-minute call.',
        layout: 'packages',
        items: [
          { name: 'District audit', summary: 'We read your district before you spend a dollar in it.', price: '$2,500', term: 'One time, two weeks', includes: ['Voter file review', 'Turnout model', 'A written plan'], href: '/contact', buttonLabel: 'Book the audit', featured: false, icon: 'scale' },
          { name: 'Full campaign', summary: 'Strategy, mail and digital from filing day to election night.', price: '$4,500/mo', term: '3-month minimum', includes: ['Voter file review', 'Turnout model', 'A written plan', 'Mail program', 'Weekly call'], href: '/contact', buttonLabel: 'Talk to us', featured: true, icon: 'briefcase' },
          { name: 'Digital only', summary: 'Ads that find your voters, reported every week.', price: '15% of spend', term: 'Month to month', includes: ['Ad buys', 'Weekly report'], href: '/contact', buttonLabel: 'Talk to us', featured: false, icon: 'globe' },
        ],
      }),
      block('CaseStudies', {
        kicker: 'Results',
        heading: 'Races we helped win',
        body: 'The challenge, what we did, and what came of it.',
        readLabel: 'Read the case study',
        readHref: '/work',
        beforeLabel: 'Before',
        afterLabel: 'After',
        note: 'Results shown are the clients’ own figures.',
        imageUrl: asset('open-seat.webp'),
        layout: 'featured',
        items: [
          { title: 'An open seat, won by 900 votes', tag: 'State House · 2024', challenge: 'A first-time candidate nobody had heard of.', approach: 'Doors in the eleven precincts that decide the district, and mail that followed the doors.', result: 'Won the seat by 900 votes.', metric: '$412k', metricLabel: 'raised', metric2: '38,000', metric2Label: 'doors knocked', metric3: '61%', metric3Label: 'name recognition in October', before: '$38k', after: '$412k', href: '/work/open-seat', imageUrl: asset('open-seat.webp') },
          { title: 'A levy defeated', tag: 'Ballot measure · 2025', challenge: 'A well-funded yes campaign.', approach: 'One message, three mailers, two hundred volunteers.', result: 'Proposition A failed by eight points.', metric: '8 pts', metricLabel: 'margin', before: 'Down 12 in June', after: 'Won by 8 in November', href: '/work/levy' },
          { title: 'A county party rebuilt', tag: 'Party building · 2023', challenge: 'Four precinct chairs in a county of sixty precincts.', approach: 'A chair recruitment drive and monthly trainings.', result: 'Forty-one precincts with a chair.', metric: '41', metricLabel: 'precinct chairs', before: '4 chairs', after: '41 chairs' },
        ],
      }),
      block('Resources', {
        kicker: 'Liberty Leadership Lab',
        heading: 'Free guides for first-time candidates',
        body: 'Download what you need. A few ask for your email first.',
        openLabel: 'Free',
        gatedLabel: 'Email to unlock',
        buttonLabel: 'Get the playbook',
        buttonHref: '/playbook',
        layout: 'library',
        items: [
          { title: 'The first-run playbook', kind: 'Guide', detail: 'PDF · 18 pp', summary: 'Filing deadlines and fees\nYour first budget\nYour first hundred volunteers', href: '/playbook', imageUrl: asset('playbook.webp'), gated: true },
          { title: 'Walk list template', kind: 'Template', detail: 'Spreadsheet', summary: 'A sheet to plan a Saturday of doors.', href: asset('walk-list.xlsx'), gated: false },
          { title: 'Filing day checklist', kind: 'Checklist', detail: 'PDF · 2 pp', summary: 'Everything to bring to the clerk.', href: asset('filing-checklist.pdf'), gated: false },
          { title: 'Your first fundraising call', kind: 'Video', detail: '12 min', summary: 'A real call, start to finish.', href: '/videos/first-call', gated: true },
        ],
      }),
      block('Pathways', {
        kicker: 'Liberty Leadership Lab',
        heading: 'Which path fits you?',
        body: 'Pick the one that sounds like your week, and start with its first program.',
        programsLabel: 'See programs',
        quizHeading: 'Find your pathway',
        resultLabel: 'Your recommended pathway',
        startLabel: 'Start this pathway',
        layout: 'doors',
        items: [
          { title: 'Candidate', summary: 'You are exploring a run, have declared, or are already on the ballot.', outcome: 'Leave with: a message, a plan and the habits to reach election day', icon: 'ballot', href: '/paths/candidate', programs: ['Deciding to run · 45 min', 'Filing and fees · 30 min', 'Candidate Training Day · Full day · Austin'], fits: ['I am thinking about running', 'I want to knock doors as the candidate', 'I need to raise my first dollar'] },
          { title: 'Campaign Staff', summary: 'You run the operation: field, finance, comms.', outcome: 'A field plan and the skills to manage volunteers and money', icon: 'clipboard', href: '/paths/staff', programs: ['Managing volunteers · 45 min', 'Walk lists that work · 30 min'], fits: ['I manage volunteers', 'I want to run a campaign for someone else', 'I keep the calendar'] },
          { title: 'Organizer', summary: 'You move people around a cause or a local fight.', outcome: 'A growth plan that turns attention into commitment', icon: 'megaphone', href: '/paths/organizer', programs: ['From petition to coalition · 40 min', 'One-on-ones · 25 min'], fits: ['I organize people around an issue', 'I want to lead a local coalition', 'I want more people to show up'] },
          { title: 'Civic Leader', summary: 'You serve on a board, a commission or a party body.', outcome: 'Run meetings, hold a position and get decisions made', icon: 'building', href: '/paths/civic', programs: ['Robert’s Rules in an hour · 60 min', 'Reading a budget · 50 min'], fits: ['I sit on a board or commission', 'I want to serve on a board', 'I chair our county party'] },
          { title: 'Career Readiness', summary: 'You want a resume, an interview and a voice that works at work.', outcome: 'A finished resume and a 90-day plan', icon: 'briefcase', href: '/paths/career', programs: ['The one-page resume · 30 min', 'Interview practice · Live · Online'], fits: ['I want a job in politics or policy', 'I want to speak up at work', 'I am looking for my next role'] },
        ],
      }),
      block('Portfolio', {
        kicker: 'Ridgeline Strategies',
        heading: 'Our work',
        body: 'Mail, video and brands for campaigns that won.',
        clientLabel: 'Client',
        layout: 'grid',
        items: [
          { title: 'The open seat mailers', kind: 'Mail', client: 'A State House campaign', year: '2024', summary: 'Five pieces that followed the doors.', role: 'Strategy and design', result: 'Won by 900 votes', imageUrl: asset('mailer.webp'), href: '/work/mailers', images: [asset('mailer-2.webp'), asset('mailer-3.webp')] },
          { title: 'Vote no on A', kind: 'Video', client: 'A ballot committee', year: '2025', summary: 'A thirty-second spot shot in one afternoon.', role: 'Script and edit', result: '1.2 million views', imageUrl: asset('spot.webp'), images: [] },
          { title: 'A county party, rebranded', kind: 'Brand', client: 'A county party', year: '2023', summary: 'A mark, a palette and a yard sign.', role: 'Identity', result: 'Forty-one precinct chairs', imageUrl: asset('brand.webp'), images: [asset('brand-sign.webp')] },
        ],
      }),
      block('MediaKit', {
        kicker: 'Free Market Hour',
        heading: 'Jordan Ellery',
        role: 'Host of Free Market Hour',
        shortBio: 'Jordan hosts Free Market Hour, a weekly show about the economics of everyday life.',
        longBio: 'Jordan hosts Free Market Hour, a weekly show about the economics of everyday life.\n\nBefore the show, Jordan taught economics at a community college for ten years.',
        facts: 'Weekly since 2021 · 240 episodes · Based in Pine Valley',
        talksHeading: 'Signature talks',
        bookLabel: 'Check availability',
        bookHref: '/book',
        contactHeading: 'Media inquiries',
        contactLine: 'press@freemarkethour.example',
        kitLabel: 'Download the press kit',
        kitHref: asset('press-kit.zip'),
        imageUrl: asset('headshot.webp'),
        layout: 'kit',
        items: [
          { title: 'Headshot', kind: 'asset', detail: 'JPG · 2 MB', href: asset('headshot.jpg'), imageUrl: asset('headshot.webp') },
          { title: 'Show logo', kind: 'asset', detail: 'PNG and SVG', href: asset('show-logo.zip') },
          { title: 'Why prices are signals', kind: 'talk', detail: '45 min keynote' },
          { title: 'Pine Valley Business Forum', kind: 'appearance', outlet: 'Pine Valley Chamber', date: '2026-04-12' },
          { title: 'The host who reads the budget', kind: 'mention', outlet: 'The Pine Valley Ledger', date: '2026-03-14', href: 'https://example.org/ledger/ellery' },
        ],
      }),
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
          // Each pinned location is the map layout's pin (sections batch 3); the online events have none.
          { id: 'evt_1', title: 'Budget night', startsAt: '2026-10-15T23:00:00.000Z', endsAt: '2026-10-16T01:00:00.000Z', location: 'Main Street Library', type: 'meeting', timezone: 'America/Chicago', href: 'https://events.example.org/budget-night?via=page&via_page=lp_ks', lat: 32.7791, lng: -96.8003 },
          { id: 'evt_2', title: 'Saturday canvass', startsAt: '2026-10-17T14:00:00.000Z', location: 'Riverside Park', timezone: 'America/Chicago', href: 'https://events.example.org/saturday-canvass?via=page&via_page=lp_ks', lat: 32.7628, lng: -96.8241 },
          { id: 'evt_3', title: 'Online phone bank', startsAt: '2026-10-20T00:00:00.000Z', isVirtual: true, timezone: 'America/Chicago', registrationClosed: true, href: 'https://events.example.org/phone-bank?via=page&via_page=lp_ks' },
          // Standard time, then a zone Intl does not know (shown in UTC).
          { id: 'evt_4', title: 'Winter potluck', startsAt: '2027-01-14T00:30:00.000Z', location: 'Grange Hall', timezone: 'America/Chicago', href: 'https://events.example.org/winter-potluck?via=page&via_page=lp_ks', lat: 32.8113, lng: -96.7695 },
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
          // Two first terms between them, so the library and shelves layouts have groups to draw.
          { slug: 'main-street-merchants', title: 'Main Street Merchants', summary: 'Forty shops back the open checkbook.', hero_url: asset('merchants.webp'), publish_at: '2026-09-12T10:00:00.000Z', href: '/endorsements/main-street-merchants', terms: [{ label: 'Businesses' }, { label: 'Downtown' }], authors: [] },
          { slug: 'cedar-park-neighbors', title: 'Cedar Park Neighbors', summary: 'The north side signs on.', hero_url: null, publish_at: '2026-09-05T10:00:00.000Z', href: '/endorsements/cedar-park-neighbors', terms: [{ label: 'Neighborhoods' }], authors: [] },
        ],
      }),
      // Baked: the piece's words, and (for the player and theater layouts) its
      // media and hero; the links and their heading are authored.
      block('ContentPost', {
        contentSlug: 'levy-explained',
        heading: 'Featured post',
        showTitle: true,
        showDate: true,
        notesLabel: 'Notes',
        linksHeading: 'In this series',
        links: [
          { label: 'Part two: the school levy', href: '/blog/school-levy' },
          { label: 'The budget we propose (PDF)', href: asset('budget.pdf') },
        ],
        postTitle: 'The levy, explained',
        postKind: 'vlog',
        postDate: '2026-09-29T12:00:00.000Z',
        postHtml: '<p>Every dollar…</p>',
        postMediaUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        postMediaKind: 'video',
        postImageUrl: 'https://api.backgold.com/api/content-pages/pine-valley/hero/ci_levy?v=1',
      }),
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
          { name: 'Jordan Vale', office: 'School Board', region: 'District 3', status: 'On the ballot', webUrl: 'https://example.org/vale', photoUrl: asset('vale.webp'), endorsed: true },
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
      // Baked from the org's membership program: one row per offer its join
      // page sells, here a tiered program's three tiers.
      block('Membership', {
        kicker: 'Membership',
        heading: 'Become a member',
        body: 'Members vote at the convention and choose our candidates.',
        joinLabel: 'Join',
        joinHref: '/join',
        benefitsHeading: 'What members get',
        note: 'Cancel a monthly membership any time.',
        paths: [
          { model: 'tiered', name: 'Neighbor', monthly_cents: 2500, annual_cents: 2500, lifetime_cents: null, onetime_cents: null, symbolic: false, benefits: MEMBER_BENEFITS },
          { model: 'tiered', name: 'Spirit of ’71', monthly_cents: 1971, annual_cents: 1971, lifetime_cents: null, onetime_cents: null, symbolic: true, benefits: MEMBER_BENEFITS },
          { model: 'tiered', name: 'Founder', monthly_cents: null, annual_cents: null, lifetime_cents: 50000, onetime_cents: null, symbolic: false, benefits: MEMBER_BENEFITS },
        ],
      }),
      // Baked from the org's booking module: one row per active meeting type.
      block('Booking', {
        kicker: 'Ridgeline Strategies',
        heading: 'Book a call',
        body: 'Pick the conversation you need. Times are on the next page.',
        pickLabel: 'Pick a time',
        layout: 'cards',
        types: [
          { name: 'Intro call', slug: 'intro-call', description: 'Fifteen minutes on your race and whether we fit.', duration_minutes: 15, location_kind: 'video_link', price_cents: 0, url: 'https://app.backgold.com/book/pine-valley/intro-call' },
          { name: 'Strategy session', slug: 'strategy-session', description: 'An hour with a strategist and your district map.', duration_minutes: 60, location_kind: 'in_person', price_cents: 25000, url: 'https://app.backgold.com/book/pine-valley/strategy-session' },
          { name: 'Check-in', slug: 'check-in', description: null, duration_minutes: 30, location_kind: 'phone', price_cents: null, url: 'https://app.backgold.com/book/pine-valley/check-in' },
        ],
      }),
      // The academy (sections batch 4): the classroom baked from the org's
      // courses; the course and the lesson pinned to the fixture's course,
      // which the sections read from GET /courses (ACADEMY_COURSE).
      block('Classroom', {
        kicker: 'The classroom',
        heading: 'Two courses, at your own pace',
        layout: 'grid',
        courses: [
          { slug: 'reading-the-budget', title: 'Reading the Budget', summary: 'Three short lessons on the county budget, line by line.', url: '/courses/reading-the-budget', hero_url: asset('budget-cover.webp'), lesson_count: 3, total_seconds: 1140, access: 'signed_in', locked: true },
          { slug: 'chapter-officers', title: 'Chapter Officers', summary: 'How a chapter elects officers and plans its year.', url: '/courses/chapter-officers', hero_url: null, lesson_count: 5, total_seconds: null, access: 'members', locked: true },
        ],
      }),
      block('Course', { courseSlug: ACADEMY_COURSE.slug, layout: 'syllabus' }),
      block('Lesson', { courseSlug: ACADEMY_COURSE.slug, layout: 'player' }),
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

/**
 * The fixture organization moved to the blog base `news`, as an organization
 * made since the address became its own is: /types reports the blog types at
 * `news`, every post address and the menu's link to the list are under
 * `/news`, and a published page sits at `/news` (on the party template, the
 * starter's News page) with a Hero and a call to action, the list's intro.
 * On a template on the kit its home's Blog section is the List layout, so the
 * section draws "All news".
 */
function newsBaseData(data, ex) {
  const move = (value) => JSON.parse(JSON.stringify(value).replaceAll('/blog/', '/news/').replaceAll('/blog"', '/news"'))
  const intro = {
    page: { ...ex.PageResponse.page, id: 'lp_news', slug: 'news', title: 'News', url: '/news', is_home: false, meta: { title: null, description: null, image_url: null } },
    sections: [
      {
        id: 'Hero-news', type: 'Hero', band: 'plain', bleed: 'full', variant: 'statement',
        copy: { kicker: 'News', headline: 'From the party', subheadline: 'Announcements and the occasional argument.' },
        media: {}, links: [], options: {},
      },
      {
        id: 'Cta-news', type: 'Cta', band: 'panel', bleed: 'full', variant: null,
        copy: { heading: 'Hear it from us first' },
        media: {}, links: [{ label: 'Volunteer', target: { kind: 'page', slug: 'volunteer' }, url: '/volunteer' }], options: {},
      },
    ],
    areas: { top_banner: [], sidebar: [], above_footer: [] },
    legal: data.legal,
  }
  const page = data.page
  return {
    ...data,
    types: data.types.map((t) => (t.index === 'blog' ? { ...t, url_base: 'news' } : t)),
    menus: move(data.menus),
    pages: [...data.pages.filter((p) => p.slug !== 'news'), { id: 'lp_news', slug: 'news', title: 'News', url: '/news', is_home: false, published_at: '2026-10-13T14:00:00.000Z', updated_at: '2026-10-13T14:00:00.000Z' }],
    page: (slug, headline) => {
      if (slug === 'news') return intro
      const found = page(slug, headline)
      if (slug !== 'home' || !ON_KIT) return found
      return { ...found, sections: found.sections.map((sec) => (sec.type === 'Blog' ? { ...sec, variant: 'list' } : sec)) }
    },
    entries: move(data.entries),
    entry: move(data.entry),
    sitemap: move(data.sitemap),
  }
}

/** The kitchen sink's sections, made by the api's own projection from the vendored contract (vendor/backgold-contract). */
async function kitchenSink() {
  const shared = await import(pathToFileURL(join(ROOT, 'vendor/backgold-contract/content-api.js')).href)
  const origins = { apiOrigin: 'https://api.backgold.com', donateOrigin: 'https://secure.backgold.com' }
  const doc = kitchenSinkDocument()
  const sections = shared.projectDocument(doc, {
    ...origins,
    siteUrl: 'https://pinevalleyliberty.org',
    orgHostUrl: 'https://pine-valley.backgold.com',
    orgSlug: 'pine-valley',
    embedUrls: shared.contentApiEmbedUrls(origins),
  })
  return {
    blocks: shared.CONTENT_API_BLOCKS,
    areaBlocks: shared.CONTENT_API_AREA_BLOCKS,
    // Drawn by a template on the kit. The public starter has no component for
    // them and falls through to DefaultSection.
    templateSections: new Set(shared.TEMPLATE_SECTION_TYPES),
    doc,
    sections,
  }
}


async function loadExamples() {
  const mod = await import(pathToFileURL(join(ROOT, 'vendor/backgold-contract/content-api-examples.js')).href)
  return structuredClone(mod.CONTENT_API_EXAMPLES)
}

/** The shared example's EventsList section, by type: its position in `sectionsExample` is not a contract. */
function exampleEventsList(ex) {
  const section = ex.SectionsResponse.sections.find((s) => s.type === 'EventsList')
  if (!section?.data?.items) throw new Error('the shared SectionsResponse example has no EventsList section with data rows')
  return section
}

/** The month (and day) `date` falls in in Denver, the calendar rows' zone. */
function calendarMonthOf(date) {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'America/Denver' }).formatToParts(date)
  const part = (type) => Number(parts.find((p) => p.type === type).value)
  return { year: part('year'), monthIndex: part('month') - 1, day: part('day') }
}

function fixtureData(ex, kitchenSections) {
  const legal = ex.SiteResponse.legal
  // The example site stores the contract's footer (columns); a site on the
  // party template stores nothing, so its chrome is the template's own
  // firsts (the giving footer), which the party checks below expect.
  const site = PARTY
    ? { ...ex.SiteResponse.site, chrome: { header: { layout: 'bar' }, footer: { ...ex.SiteResponse.site.chrome.footer, layout: 'giving' } } }
    : ex.SiteResponse.site
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
    // As GET /types reports them: post listed with the blog types
    // (`index: 'blog'`) at the organization's blog base, `blog` here; the
    // newsletter at its own base.
    { key: 'post', singular_label: 'Post', plural_label: 'Posts', routable: true, url_base: 'blog', built_in: true, index: 'blog', fields: [] },
    { key: 'newsletter', singular_label: 'Newsletter', plural_label: 'Newsletters', routable: true, url_base: 'newsletters', built_in: true, index: null, fields: [{ key: 'issue', label: 'Issue', kind: 'short_text', required: false }] },
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
    renditions: null,
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
  // The calendar's month (GET /events?from=&to=): rows of their own, placed in
  // the month it is now in Denver (the rows' zone), so the agenda's checks
  // keep their rows. evt_c2 starts on the 28th in UTC and the 27th in Denver;
  // evt_c3 starts on the next month's 1st in UTC and this month's last day
  // in Denver; evt_c4 is next month's.
  const calendarMonth = calendarMonthOf(new Date())
  const utc = (monthOffset, day, hour) => new Date(Date.UTC(calendarMonth.year, calendarMonth.monthIndex + monthOffset, day, hour)).toISOString()
  const calendar = [
    eventRow({ id: 'evt_c1', title: 'Chapter supper', starts_at: utc(0, 1, 18), type: 'meeting', location: 'Fenwick Grange', url: 'https://events.example.org/chapter-supper' }),
    eventRow({ id: 'evt_c2', title: 'Phone bank night', starts_at: utc(0, 28, 2), type: 'volunteer', url: 'https://events.example.org/phone-bank-night' }),
    eventRow({ id: 'evt_c3', title: 'Month-end mixer', starts_at: utc(1, 1, 3), type: 'meeting', url: 'https://events.example.org/month-end-mixer' }),
    eventRow({ id: 'evt_c4', title: 'Next-month canvass', starts_at: utc(1, 15, 18), type: 'volunteer', url: 'https://events.example.org/next-month-canvass' }),
  ]
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
    {
      // Its baked rows name the zone the calendar reads today in; it draws
      // the month from the window read.
      id: 'EventsList-calendar',
      type: 'EventsList',
      band: 'plain',
      bleed: 'full',
      variant: 'calendar',
      copy: { heading: 'On the calendar', eventsEmptyCta: 'Tell us and we will put it here.' },
      media: {},
      links: [],
      options: { max: 1 },
      data: { source: 'events', items: [calendar[0]] },
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
  // Board A1's home sections, in the party template's layouts: the cover
  // hero (kicker, a caption), the ribbon, the compact roster (the eleven
  // candidates above, four shown by level), the photo call to action; its
  // Top banner holds a Call to action · Strip and Above the footer an email
  // sign-up with its framed form (the kitchen sink's, projected).
  const a1Sections = [
    {
      id: 'Hero-a1',
      type: 'Hero',
      band: 'plain',
      bleed: 'full',
      variant: 'cover',
      copy: { kicker: 'Westmark Liberty Party', headline: 'More freedom. Fewer excuses.', subheadline: "Westmark's third party, in all 58 counties.", caption: 'Photo: county chapter chairs, Harlow, last spring' },
      media: { imageUrl: { url: 'https://api.backgold.com/api/lp-assets/a1/hero.webp' } },
      links: [
        { label: 'Join the party', target: { kind: 'surface', surface: 'join', path: '/join' }, url: '/join' },
        { label: 'Meet our candidates', target: { kind: 'page', slug: 'leadership' }, url: '/leadership' },
      ],
      options: {},
    },
    {
      id: 'StatCards-a1',
      type: 'StatCards',
      band: 'contrast',
      bleed: 'contained',
      variant: 'ribbon',
      copy: { heading: '' },
      media: {},
      links: [],
      options: {},
      data: { source: 'stats', items: [{ label: 'county chapters, and counting', value: '41', note: null, accent: false }, { label: 'registered members', value: '12,480', note: null, accent: false }] },
    },
    {
      id: 'CandidateRoster-a1',
      type: 'CandidateRoster',
      band: 'plain',
      bleed: 'full',
      variant: 'compact',
      copy: { kicker: 'On your ballot November 3', heading: 'Our candidates', allLabel: 'All 11 candidates' },
      media: {},
      links: [{ label: 'All 11 candidates', target: { kind: 'page', slug: 'leadership' }, url: '/leadership' }],
      options: {},
      data: { source: 'candidates', items: candidates },
    },
    {
      id: 'Cta-a1',
      type: 'Cta',
      band: 'contrast',
      bleed: 'contained',
      variant: 'photo',
      copy: { eyebrow: 'Take part', heading: 'Westmark does not need another party that asks permission.', caption: 'Photo: new member night, Osgood County' },
      media: { photoUrl: { url: 'https://api.backgold.com/api/lp-assets/a1/cta.webp' } },
      links: [{ label: 'Become a member', target: { kind: 'surface', surface: 'join', path: '/join' }, url: '/join' }],
      options: {},
    },
  ]
  const signup = kitchenSections.find((section) => section.type === 'SignupCapture')
  if (!signup?.embed) throw new Error('the kitchen sink has no SignupCapture with an embed')
  const a1Areas = {
    top_banner: [
      {
        key: 'convention-notice',
        label: 'Convention notice',
        from: null,
        until: null,
        sections: [
          {
            id: 'Cta-strip',
            type: 'Cta',
            band: 'contrast',
            bleed: 'full',
            variant: 'strip',
            copy: { heading: 'State convention', body: 'Harlow Civic Hall · April 10 and 11', donateButtonText: 'Register as a delegate', volunteerButtonText: '' },
            media: {},
            links: [{ label: 'Register as a delegate', target: { kind: 'page', slug: 'convention' }, url: '/convention' }],
            options: {},
          },
        ],
      },
    ],
    sidebar: [],
    above_footer: [
      {
        key: 'join-the-newsletter',
        label: 'Join the newsletter',
        from: null,
        until: null,
        sections: [
          {
            ...signup,
            id: 'SignupCapture-a1',
            band: 'tint',
            copy: {
              kicker: 'The party letter',
              heading: 'One email a week. What happened, what is next, where to show up.',
              lede: 'Where the chapters met, what passed, and the next night to come along.',
            },
          },
        ],
      },
    ],
  }
  // The coverage page (party only): Map sections drawn from their geometry.
  // Texas's counties as a party site draws them (twenty rows, eight lit,
  // five with a link, one starting, eleven dark, and the section's charter
  // and organizer links); the four made-up places in the directory layout (a
  // relative geoUrl, read from the api origin), framed on one place, and at
  // a geometry address the api does not have (the tiles).
  const geo = geoFixtures()
  const geoUrl = (hash) => ({ url: `https://api.backgold.com/lp-runtime/${hash}.json` })
  const regionRow = (region, status, url = null) => ({ region, status, url, is_new: false })
  const texasRows = [
    regionRow('Travis', 'lit', 'https://example.org/travis'),
    regionRow('Hays', 'lit', 'https://example.org/hays'),
    regionRow('Williamson', 'lit'),
    regionRow('Bexar', 'lit', 'https://example.org/bexar'),
    regionRow('Harris', 'lit', 'https://example.org/harris'),
    regionRow('Dallas', 'lit'),
    regionRow('Tarrant', 'lit', 'https://example.org/tarrant'),
    regionRow('Collin', 'lit'),
    regionRow('Denton', 'starting'),
    ...['El Paso', 'Lubbock', 'Midland', 'Brazos', 'McLennan', 'Bell', 'Nueces', 'Cameron', 'Hidalgo', 'Webb', 'Galveston'].map((name) => regionRow(name, 'dark')),
  ]
  const fourRows = [regionRow('alder', 'lit', 'https://example.org/alder'), regionRow('Birch', 'lit'), regionRow('Cedar', 'starting'), regionRow('Dunmore', 'dark')]
  const chapterLinks = [
    { label: 'Start a chapter', target: { kind: 'page', slug: 'contact' }, url: '/contact' },
    { label: 'Talk to an organizer', target: { kind: 'page', slug: 'organize' }, url: '/organize' },
  ]
  const mapSection = (id, variant, copy, media, options, items, links = []) => ({
    id,
    type: 'Map',
    band: 'plain',
    bleed: 'full',
    variant,
    copy,
    media: { geoUrl: media },
    links,
    options,
    data: { source: 'regions', items },
  })
  const coverageSections = [
    mapSection(
      'Map-texas',
      'map',
      {
        kicker: 'Near you',
        heading: 'Find your county chapter',
        litLabel: 'Chapter meets monthly',
        darkLabel: 'No chapter yet',
        startingLabel: 'Getting started',
        charterCtaText: 'Start a chapter',
        organizerText: 'Talk to an organizer',
      },
      geoUrl(geo.texas.hash),
      { geoId: 'tx-counties', regionTotal: 254, regionNoun: 'county' },
      texasRows,
      chapterLinks,
    ),
    mapSection(
      'Map-four',
      'directory',
      { kicker: 'Chapters', heading: 'Four places', charterCtaText: 'Start a chapter', organizerText: 'Talk to an organizer' },
      { url: `/lp-runtime/${geo.four.hash}.json` },
      {},
      fourRows,
      chapterLinks,
    ),
    mapSection('Map-framed', 'map', { heading: 'One place, framed' }, geoUrl(geo.four.hash), { focusRegion: 'cedar', regionNoun: 'county' }, fourRows),
    mapSection('Map-unread', 'map', { heading: 'A map BackGold cannot find' }, geoUrl('0'.repeat(64)), {}, fourRows),
  ]
  // A published page whose BackGold modules have nothing to frame (an
  // organization with no donation form, no petition picked): the api sends
  // each with its words and no embed.
  const unwired = (id, type, variant, copy) => ({ id, type, band: 'plain', bleed: 'full', variant, copy, media: {}, links: [], options: {} })
  const unwiredSections = [
    unwired('Donate-unwired', 'Donate', 'story', { heading: 'Give to the party', storyHeadline: 'Every county, every ballot.', storyBody: 'Members fund this party.' }),
    unwired('FormBlock-unwired', 'FormBlock', null, { heading: 'Send us a note' }),
    unwired('Petition-unwired', 'Petition', null, { heading: 'Sign the ballot petition' }),
    unwired('SignupCapture-unwired', 'SignupCapture', 'band', { heading: 'Get the weekly letter' }),
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
    orgName: ex.SiteResponse.org_name,
    types,
    geo,
    events: { upcoming, calendar, types: eventTypes, live },
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
      { id: 'lp_a1', slug: 'a1-home', title: 'A1 home', url: '/a1-home', is_home: false, published_at: '2026-10-02T14:00:00.000Z', updated_at: '2026-10-02T14:00:00.000Z' },
      // The party template's starter page `news`. On this organization, still
      // at /blog, it is a page of its own; at /news it is the list's intro
      // (newsBaseData).
      ...(PARTY ? [{ id: 'lp_news', slug: 'news', title: 'News', url: '/news', is_home: false, published_at: '2026-10-02T14:00:00.000Z', updated_at: '2026-10-02T14:00:00.000Z' }] : []),
      ...(PARTY ? [{ id: 'lp_coverage', slug: 'coverage', title: 'Coverage', url: '/coverage', is_home: false, published_at: '2026-10-13T14:00:00.000Z', updated_at: '2026-10-13T14:00:00.000Z' }] : []),
      ...(PARTY ? [{ id: 'lp_unwired', slug: 'unwired', title: 'Unwired', url: '/unwired', is_home: false, published_at: '2026-10-13T14:00:00.000Z', updated_at: '2026-10-13T14:00:00.000Z' }] : []),
    ],
    page: (slug, headline) =>
      slug === 'home'
        ? { ...ex.PageResponse, sections: homeSections(headline), areas: homeAreas }
        : slug === 'news' && PARTY
          ? boardPage('lp_news', 'news', 'News', [
              {
                id: 'Hero-news', type: 'Hero', band: 'plain', bleed: 'full', variant: 'statement',
                copy: { kicker: 'News', headline: 'From the party', subheadline: 'Announcements and the occasional argument.' },
                media: {}, links: [], options: {},
              },
            ])
        : slug === 'coverage' && PARTY
          ? boardPage('lp_coverage', 'coverage', 'Coverage', coverageSections)
        : slug === 'unwired' && PARTY
          ? boardPage('lp_unwired', 'unwired', 'Unwired', unwiredSections)
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
                : slug === 'a1-home'
                  ? { ...boardPage('lp_a1', 'a1-home', 'A1 home', a1Sections), areas: a1Areas }
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
// Geometry files in the fixture's sections live on api.backgold.com too; the fixture serves them itself.
const GEO_FILES = /https:\/\/api\.backgold\.com\/lp-runtime\//g

/** A stand-in for an uploaded image: a logo mark for the logo, a landscape for anything else. */
// ── The Map section's geometry, served at /lp-runtime/<sha-256>.json as the api serves it ──

/**
 * Geometry files the fixture serves, by the SHA-256 of their bytes (the
 * api's content address): a set of four made-up places (a large one, two
 * middling ones and a small one, so a framed map has somewhere to zoom) and
 * BackGold's Texas counties, the real set a party site draws.
 */
function geoFixtures() {
  const file = (json) => ({ json, hash: createHash('sha256').update(json).digest('hex') })
  const four = file(
    JSON.stringify({
      width: 600,
      height: 400,
      paths: {
        Alder: 'M0,0 L400,0 L400,400 L0,400 Z',
        Birch: 'M400,0 L600,0 L600,200 L400,200 Z',
        Cedar: 'M400,200 L460,200 L460,260 L400,260 Z',
        Dunmore: 'M460,200 L600,200 L600,400 L460,400 Z',
      },
      centroids: { Alder: [200, 200], Birch: [500, 100], Cedar: [430, 230], Dunmore: [530, 300] },
    }),
  )
  const texas = file(JSON.stringify(JSON.parse(readFileSync(join(ROOT, 'scripts/fixtures/tx-counties.json'), 'utf8'))))
  return { four, texas, byHash: new Map([four, texas].map((f) => [f.hash, f.json])) }
}

function placeholderImage(path) {
  if (path.includes('med_logo')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="56" viewBox="0 0 200 56"><rect width="56" height="56" rx="10" fill="#1b3a5c"/><path d="M14 40 L28 14 L42 40 Z" fill="#f4efe6"/><text x="66" y="35" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#1b3a5c">Pine Valley</text></svg>'
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd9e3"/><stop offset="1" stop-color="#f4efe6"/></linearGradient></defs><rect width="1200" height="800" fill="url(#s)"/><path d="M0 560 L260 330 L430 470 L640 250 L900 520 L1200 360 L1200 800 L0 800 Z" fill="#1b3a5c" opacity=".85"/><path d="M0 660 L300 520 L620 640 L900 560 L1200 650 L1200 800 L0 800 Z" fill="#2f5a3a"/></svg>'
}

/** The fixture Content API; `blogBase` 'news' serves the organization at /news (newsBaseData). */
/**
 * The draft a valid preview link reads, as the api sends it: the home page
 * with its headline as the draft has it, plus a form and a petition the draft
 * added. Like the api's preview read (lib/content-api/context.ts
 * previewContext), the frames that show what the draft holds carry the token
 * (`?bg_preview=`): the form addressed by the page, and the sign-up framed by
 * its reusable section; the donate frame is addressed by its form and carries
 * none. The petition names no petition yet, so it has no embed.
 */
function previewDraft(page) {
  const tokened = (iframe) => `${iframe}${iframe.includes('?') ? '&' : '?'}bg_preview=${PREVIEW_TOKEN}`
  const areas = Object.fromEntries(
    Object.entries(page.areas).map(([key, items]) => [
      key,
      items.map((item) => ({
        ...item,
        sections: item.sections.map((sec) =>
          sec.embed?.iframe?.includes('/embed/signup/section/') ? { ...sec, embed: { ...sec.embed, iframe: tokened(sec.embed.iframe) } } : sec,
        ),
      })),
    ]),
  )
  return {
    ...page,
    sections: [
      ...page.sections,
      {
        id: 'FormBlock-draft', type: 'FormBlock', band: 'plain', bleed: 'full', variant: null,
        copy: { heading: 'Tell us where you stand' }, media: {}, links: [], options: {},
        embed: { iframe: tokened(`https://api.backgold.com/f/${page.page.id}/FormBlock-draft`), script: 'https://secure.backgold.com/embed.js' },
      },
      {
        id: 'Petition-draft', type: 'Petition', band: 'plain', bleed: 'full', variant: null,
        copy: { heading: 'Put every party on the ballot' }, media: {}, links: [], options: {},
      },
    ],
    areas,
  }
}

function startFixture(examples, kitchenSections, blogBase = 'blog', { academy = false } = {}) {
  const plain = fixtureData(examples, kitchenSections)
  const based = blogBase === 'news' ? newsBaseData(plain, examples) : plain
  // `academy`: the organization is an academy on the academy template's starter (withAcademy).
  const data = academy ? withAcademy(based, examples) : withNonprofit(withCandidate(based, examples), examples)
  // `progress`: what the lesson pages saved, as the api took it; `done`, the lessons it marked finished.
  const state = { version: 184, headline: 'Keep more of what you earn.', requests: new Map(), seen: [], total: 0, origin: '', progress: [], done: new Set() }
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

  // A POST's body is read whole before it is answered (the visitor's code, a lesson's progress).
  const server = createServer((req, res) => {
    if (req.method !== 'POST') return answer(req, res, '')
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => answer(req, res, raw))
  })
  const answer = (req, res, rawBody) => {
    const url = new URL(req.url, 'http://fixture')
    const path = url.pathname.startsWith(MOUNT) ? url.pathname.slice(MOUNT.length) : null
    state.total++
    state.requests.set(url.pathname, (state.requests.get(url.pathname) ?? 0) + 1)
    const etag = `"v${state.version}"`
    const headers = { 'Content-Type': 'application/json', 'X-Content-Version': String(state.version), ETag: etag, ...CORS }
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { ...headers, ...extra })
      // Uploaded files in the examples live on api.backgold.com; the fixture serves stand-ins.
      res.end(body === undefined ? undefined : JSON.stringify(body).replace(UPLOADS, `${state.origin}/media/`).replace(GEO_FILES, `${state.origin}/lp-runtime/`))
    }
    // --serve: after editing and rebuilding the copy, POST here and then to the
    // Worker's /api/backgold/revalidate so the edge cache moves to a new version.
    if (url.pathname === '/__bump' && req.method === 'POST') {
      state.version++
      res.writeHead(204)
      return res.end()
    }
    if (url.pathname.startsWith('/media/') && url.pathname.endsWith('.mp4')) {
      // A lesson's file or one of its copies (`?size=`): no video to play here, so nothing at all.
      res.writeHead(204, { 'Cache-Control': 'no-store' })
      return res.end()
    }
    if (url.pathname.startsWith('/media/')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' })
      return res.end(placeholderImage(url.pathname))
    }
    // A geometry file by its hash, immutable as the api serves it; any other hash is a 404.
    const geoHash = /^\/lp-runtime\/([0-9a-f]{64})\.json$/.exec(url.pathname)?.[1]
    if (geoHash) {
      const json = data.geo.byHash.get(geoHash)
      res.writeHead(json ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': json ? 'public, max-age=31536000, immutable' : 'no-store' })
      return res.end(json ?? JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }))
    }
    const auth = req.headers.authorization ?? ''
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    // ── petition-drive (begin) ──
    if ((PETITION_DRIVE || UNLABELED) && url.pathname.startsWith('/embed/petition/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(petitionStubFrame(url.search))
    }
    // ── petition-drive (end) ──
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

    // The visitor (0547): the X-BackGold-Visitor header names them; an answer for one is private.
    const visitorHeader = req.headers['x-backgold-visitor']
    const visitor = visitorHeader === ACADEMY_TOKEN ? ACADEMY_VISITOR : null
    const PRIVATE = { 'Cache-Control': 'private, no-store' }
    const firstParty = req.headers['x-backgold-site'] !== undefined
    const jsonBody = () => {
      try {
        return JSON.parse(rawBody || '{}')
      } catch {
        return {}
      }
    }
    if (parts[0] === 'visitor') {
      if (parts[1] === 'exchange' && parts.length === 2 && req.method === 'POST') {
        // As the api: a first-party request (the stand-in api Worker forwards
        // X-BackGold-Site) or a secret key; a key request carrying a header
        // only a browser sends (Origin, Sec-Fetch-Site, Sec-Fetch-Dest) is
        // refused before the code is read. Sec-Fetch-Mode alone passes:
        // Node's fetch adds it to every request.
        if (!firstParty) {
          if (key !== SECRET_KEY) return send(403, { error: "Redeem a sign-in code with the site's secret key", code: 'SECRET_KEY_REQUIRED' }, PRIVATE)
          if (req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined || req.headers['sec-fetch-dest'] !== undefined) {
            return send(403, { error: 'Redeem the code from your server, never from a browser', code: 'SERVER_ONLY' }, PRIVATE)
          }
        }
        return jsonBody().code === ACADEMY_CODE
          ? send(200, { token: ACADEMY_TOKEN, expires_at: new Date(Date.now() + 3600000).toISOString(), visitor: ACADEMY_VISITOR }, PRIVATE)
          : send(400, { error: 'That sign-in link has expired', code: 'INVALID_CODE' }, PRIVATE)
      }
      if (parts.length === 1 && req.method === 'GET') return send(200, { visitor }, PRIVATE)
      if (parts.length === 1 && req.method === 'DELETE') {
        res.writeHead(204, { ...headers, ...PRIVATE })
        return res.end()
      }
      return missing()
    }
    if (parts[0] === 'courses' && parts[3] === 'progress' && parts.length === 4 && req.method === 'POST') {
      if (!visitor) return send(401, { error: 'Sign in to save your place.', code: 'VISITOR_REQUIRED' }, PRIVATE)
      const course = ACADEMY_COURSES.find((c) => c.slug === parts[1])
      if (!course || !course.lessons.some((l) => l.slug === parts[2])) return missing()
      const saved = jsonBody()
      state.progress.push({ course: parts[1], lesson: parts[2], ...saved })
      if (saved.completed === true) state.done.add(`${parts[1]}/${parts[2]}`)
      if (saved.completed === false) state.done.delete(`${parts[1]}/${parts[2]}`)
      const after = courseFor(course, visitor, state.done)
      const row = after.lessons.find((l) => l.slug === parts[2])
      return send(200, { progress: { completed: row.completed, completed_at: row.completed_at, position_seconds: saved.position_seconds ?? null }, course: after.progress }, PRIVATE)
    }

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
      const draft = previewDraft(data.page('home', 'A draft headline, not yet published'))
      return send(200, draft, { 'Cache-Control': 'private, no-store' })
    }
    if (req.headers['if-none-match'] === etag && !visitor) return send(304)

    let body
    switch (parts[0]) {
      case 'site':
        body = { site: data.site, legal: data.legal, version: state.version, org_name: data.orgName }
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
        if (parts[1] === 'post' && parts[2] === GATED_SLUG && parts.length === 3) {
          const base = Object.values(data.entry.post)[0]
          const lock = visitor ? null : { reason: 'signed_in', tag_label: null, org_name: data.orgName ?? 'Example Org' }
          const entry = { ...base, id: 'ci_gated', slug: GATED_SLUG, title: 'The members briefing', url: `/blog/${GATED_SLUG}`, access: 'signed_in', locked: !visitor, lock, media_url: null, body: { markdown: visitor ? GATED_BODY : '' }, fields: visitor ? base.fields : {} }
          if (visitor) Object.assign(headers, PRIVATE)
          body = { entry, areas: data.entryAreas }
          break
        }
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
      case 'courses': {
        // GET /courses, /courses/:slug and /courses/:slug/:lesson, as the
        // reader reads them: the visitor's own answer (courseFor) is private.
        if (visitor) Object.assign(headers, PRIVATE)
        if (parts.length === 1) {
          body = { courses: ACADEMY_COURSES.map((c) => courseSummary(courseFor(c, visitor, state.done))), next_cursor: null, areas: data.entryAreas }
          break
        }
        const found = ACADEMY_COURSES.find((c) => c.slug === parts[1])
        if (!found || parts.length > 3) break
        const course = courseFor(found, visitor, state.done)
        if (parts.length === 2) {
          body = { course, areas: data.entryAreas }
          break
        }
        const at = course.lessons.findIndex((l) => l.slug === parts[2])
        if (at === -1) break
        const row = course.lessons[at]
        const near = (l) => (l ? { slug: l.slug, title: l.title, url: l.url } : null)
        body = {
          lesson: {
            // The free lesson's copies are ready; an open signed-in lesson's are not yet, so it plays the original.
            id: row.id, slug: row.slug, type: 'video', title: row.title, summary: null, url: row.url, hero: null, media_url: row.locked ? null : lessonMedia(row.slug),
            renditions: !row.locked && row.access === 'public' ? lessonRenditions(row.slug) : null,
            publish_at: course.publish_at, updated_at: course.updated_at, terms: [], authors: [], access: row.access, locked: row.locked,
            lock: row.lock, duration_seconds: row.duration_seconds, body: { markdown: row.locked ? '' : 'Where each dollar of the levy lands.' }, fields: {},
          },
          course,
          previous: near(course.lessons[at - 1]),
          next: near(course.lessons[at + 1]),
          areas: data.entryAreas,
        }
        break
      }
      case 'events': {
        // GET /events/:slug: an upcoming row whose url ends in the slug, with
        // its page's words and BackGold's RSVP frame; any other slug is a 404.
        if (parts.length === 2) {
          const row = data.events.upcoming.find((e) => new URL(e.url).pathname.split('/').filter(Boolean).at(-1) === parts[1])
          body = row
            ? {
                event: {
                  ...row,
                  slug: parts[1],
                  description: '<p>Dinner with every candidate on the ballot.</p>',
                  venue: row.location,
                  address: null,
                  image_url: null,
                  lat: 39.5,
                  lng: -105.25,
                  directions_url: 'https://www.google.com/maps/dir/?api=1&destination=39.5%2C-105.25',
                  embed: { iframe: `https://secure.backgold.com/embed/e/pine-valley/${parts[1]}`, script: 'https://secure.backgold.com/embed.js' },
                },
                areas: { top_banner: [], sidebar: [], above_footer: [] },
              }
            : undefined
          break
        }
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
        // With from and to (YYYY-MM-DD, both, at most 42 days first to last,
        // else 400 BAD_RANGE): the calendar's rows starting on those UTC days.
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to')
        let rows = data.events.upcoming
        if (from !== null || to !== null) {
          const day = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? Date.parse(`${v}T00:00:00Z`) : null)
          const start = day(from)
          const end = day(to)
          if (start === null || end === null || end < start || (end - start) / 86400000 + 1 > 42) {
            return send(400, { error: 'from and to must be ISO dates together, at most 42 days', code: 'BAD_RANGE' })
          }
          const until = new Date(end + 86400000).toISOString()
          rows = data.events.calendar.filter((e) => e.starts_at >= from && e.starts_at < until)
        }
        const offset = Number(Buffer.from(url.searchParams.get('cursor') ?? '', 'base64url').toString('utf8')) || 0
        const matching = rows.filter((e) => !type || e.type === type).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
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
  }

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

/** The built Worker on `wrangler dev`; `persist` names its local KV's directory under the site (one per organization served). */
async function startWorker(siteDir, { vars, logFile, persist = '.wrangler-e2e', configs = [], port: chosen }) {
  const port = chosen ?? (await freePort())
  const inspector = await freePort()
  // `configs`: the Workers to run in one session, the site's first (the first-party run's site and its stand-in api).
  const args = ['wrangler', 'dev', ...configs.flatMap((c) => ['-c', c]), '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', join(siteDir, persist), '--show-interactive-dev-session=false']
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
  check(
    ON_KIT
      ? new RegExp(`<iframe\\b[^>]*data-bg-embed[^>]*src="https://secure\\.backgold\\.com/embed/d/df_general\\?layout=form&amp;look=[0-9a-f.]+&amp;look_dark=[0-9a-f.]+&amp;radius=${FRAME_RADIUS}&amp;font=${FRAME_FONT}"`).test(html)
      : /<iframe\b[^>]*data-bg-embed[^>]*src="https:\/\/secure\.backgold\.com\/embed\/d\/df_general"/.test(html),
    ON_KIT ? "the Donate section is BackGold's frame, asked to wear the site in its layout" : "the Donate section is BackGold's embed iframe",
  )
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
  // On every template and every footer layout (the party's giving footer
  // included), Above the footer sits above the footer, as board A1 draws it.
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
  // its areas hold a dated item, the frames' one resize script because an
  // area's sign-up is framed by its reusable section, and on a template on
  // the kit the light and dark switch's two (the head's kept choice, the
  // header button's).
  const areaItems = Object.values(fixture.data.entryAreas).flat()
  const dated = areaItems.some((item) => item.from !== null || item.until !== null)
  const framed = areaItems.some((item) => item.sections.some((section) => section.embed?.iframe))
  const scripts = tags(html, 'script').filter((s) => !/type="application\/ld\+json"/.test(s))
  const entryWindowScripts = html.split('[data-bg-area-item][data-from]').length - 1
  const entryResizeScripts = html.split("data.type !== 'givegold:resize'").length - 1
  const entryModeScripts = html.split("localStorage.getItem('gg-mode')").length - 1 + (html.split("querySelector('[data-mode-toggle]')").length - 1)
  check(
    scripts.length === entryWindowScripts + entryResizeScripts + entryModeScripts &&
      entryWindowScripts === (dated ? 1 : 0) &&
      entryResizeScripts === (framed ? 1 : 0) &&
      entryModeScripts === (ON_KIT ? 2 : 0),
    `an entry loads only JSON-LD${dated ? ", the areas' window script once" : ''}${framed ? " and the frames' resize script once" : ''}${ON_KIT ? ' and the light and dark switch\'s two' : ''} (${scripts.length} other script tag(s))`,
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
  check(res.status === 200 && html.includes('Draft · not published') && html.includes('A draft headline'), 'a valid preview renders the draft under the preview bar')
  check(/<meta name="robots" content="noindex"/.test(html) && /no-store/.test(res.headers.get('cache-control') ?? ''), 'the preview is noindex and no-store')
  check(html.includes('<meta name="backgold-preview" content="sections">'), 'the preview carries <meta name="backgold-preview" content="sections">')
  const draft = previewDraft(fixture.data.page('home', ''))
  const draftIds = [...draft.sections, ...Object.values(draft.areas).flat().flatMap((item) => item.sections)].map((s) => s.id)
  const markers = [...html.matchAll(/<span\b[^>]*data-bg-section[^>]*>/g)].map((m) => /id="([^"]*)"/.exec(m[0])?.[1])
  check(
    markers.length === draftIds.length && draftIds.every((id) => markers.includes(`bg-section-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`)),
    `the preview has one data-bg-section marker per section of the draft, areas included (${markers.length} for ${draftIds.length})`,
  )
  check(/data-bg-donate/.test(html), 'a draft page that takes donations shows the Donate header button')
  // The module frames that show the draft carry the preview link's token, as
  // the api addresses them; the donate frame, addressed by its form, carries none.
  const frameSrcs = tags(html, 'iframe').map((tag) => decode(/\bsrc="([^"]*)"/.exec(tag)?.[1] ?? ''))
  const formFrame = frameSrcs.find((src) => src.startsWith('https://api.backgold.com/f/'))
  const signupFrame = frameSrcs.find((src) => src.includes('/embed/signup/section/'))
  const donateFrame = frameSrcs.find((src) => src.includes('/embed/d/'))
  check(
    !!formFrame && new URL(formFrame).searchParams.get('bg_preview') === PREVIEW_TOKEN && !!signupFrame && new URL(signupFrame).searchParams.get('bg_preview') === PREVIEW_TOKEN,
    `the preview frames the draft's form and the area's sign-up with the token (${formFrame}, ${signupFrame})`,
  )
  check(!!donateFrame && !new URL(donateFrame).searchParams.has('bg_preview'), `the donate frame, addressed by its form, carries no token (${donateFrame})`)
  if (ON_KIT) {
    const petition = sectionWith(html, 'Petition', 'Put every party on the ballot')
    check(
      petition !== '' && petition.includes('This petition is not available right now.') && tags(petition, 'iframe').length === 0,
      'a draft section with nothing to frame draws its heading and says the module is not available',
    )
  }
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

  if (ON_KIT) {
    // Home draws a Donate frame, so it names the donate query names its frame
    // copies from the page's address: a request that carries one renders past
    // home's stored copy, its frame carries them and no other name from the
    // page's address, and it is never stored.
    const reads = (res.headers.get('x-backgold-reads-query') ?? '').split(',')
    check(
      ['amount', 'frequency', 'fund', 'email', 'ref', 'place', 'utm_source', 'utm_*'].every((name) => reads.includes(name)),
      `home, which draws a Donate frame, names the donate query names it reads (X-Backgold-Reads-Query: ${reads.join(',')})`,
    )
    const keyed = '/?amount=25&frequency=monthly&place=spring-mailer&utm_source=mailer&utm_id=fall&layout=wide&b=2'
    for (const read of ['first', 'second']) {
      res = await get(origin, keyed)
      html = await res.text()
      const frame = tags(html, 'iframe').find((t) => t.includes('/embed/d/df_general')) ?? ''
      const q = new URL(decode(/\ssrc="([^"]*)"/.exec(frame)?.[1] ?? 'about:blank')).searchParams
      check(
        res.headers.get('x-backgold-cache') === 'MISS' &&
          /no-store/.test(res.headers.get('cache-control') ?? '') &&
          q.get('amount') === '25' &&
          q.get('frequency') === 'monthly' &&
          q.get('place') === 'spring-mailer' &&
          q.get('utm_source') === 'mailer' &&
          q.get('utm_id') === 'fall' &&
          q.get('layout') === 'form' &&
          !q.has('b'),
        `the ${read} read of ${keyed} renders (not home's copy), no-store, its Donate frame carrying the page's donate names and nothing else (${q})`,
      )
    }
    res = await get(origin, '/?utm_source=mailer')
    html = await res.text()
    const bare = new URL(decode(/\ssrc="([^"]*)"/.exec(tags(html, 'iframe').find((t) => t.includes('/embed/d/df_general')) ?? '')?.[1] ?? 'about:blank')).searchParams
    check(res.headers.get('x-backgold-cache') === 'MISS' && bare.get('utm_source') === 'mailer' && !bare.has('amount'), `a mailer's utm_source alone reaches the frame too, and the bare home's stored copy was never overwritten (${bare})`)
    res = await get(origin, '/')
    html = await res.text()
    check(res.headers.get('x-backgold-cache') === 'HIT' && !/embed\/d\/df_general\?[^"]*amount=/.test(html), 'the bare home is still served from its stored copy, its frame with no amount')
  }

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

/**
 * An organization at the blog base `news` (newsBaseData), on both templates:
 * the list at /news with the intro page's sections above it, an entry at
 * /news/<slug> with its breadcrumb, the links to the list (the Blog section's,
 * the featured post's, the menu's), the feed, the sitemap, and nothing at
 * /blog.
 */
/**
 * The starter's /auth/ routes: a visitor signing in on a site that reads with
 * a key, through the portal's door and back, redeeming the code with the
 * secret key (BACKGOLD_SECRET_KEY, the one previews use), then a gated entry read signed out
 * and signed in, progress saved, and signed out.
 */
async function checkPartnerVisitor(origin, fixture) {
  log('\nVisitors signing in on a key-mode site (/auth/)')
  const exchange = (headers) =>
    fetch(`${fixture.origin}/api/content/v1/visitor/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ code: ACADEMY_CODE }) })
  let res = await exchange({ Authorization: `Bearer ${SITE_KEY}` })
  check(res.status === 403 && (await res.json()).code === 'SECRET_KEY_REQUIRED', `the fixture refuses a code with a publishable key (${res.status})`)
  res = await exchange({ Authorization: `Bearer ${SECRET_KEY}`, Origin: 'https://www.example.org' })
  check(res.status === 403 && (await res.json()).code === 'SERVER_ONLY', `and one sent with a browser's Origin (${res.status})`)
  res = await exchange({ Authorization: `Bearer ${SECRET_KEY}`, 'Sec-Fetch-Site': 'cross-site' })
  check(res.status === 403 && (await res.json()).code === 'SERVER_ONLY', `and one sent with Sec-Fetch-Site (${res.status})`)
  res = await exchange({ Authorization: `Bearer ${SECRET_KEY}` })
  check(res.status === 200 && (await res.json()).token === ACADEMY_TOKEN, `but takes one from Node's own fetch, whose Sec-Fetch-Mode alone passes (${res.status})`)

  res = await get(origin, `/auth/sign-in?${new URLSearchParams({ to: '/some-path', title: 'T' })}`)
  const door = new URL(res.headers.get('location') ?? '', 'https://portal.invalid')
  const back = new URL(door.searchParams.get('return') ?? '', 'https://return.invalid')
  check(
    res.status === 302 &&
      door.origin === 'https://giving.backgold.dev' &&
      door.pathname === '/site-signin' &&
      door.searchParams.get('site') === fixture.data.site.id &&
      door.searchParams.get('title') === 'T' &&
      back.origin === origin &&
      back.pathname === '/auth/visitor' &&
      back.searchParams.get('to') === '/some-path',
    `/auth/sign-in goes to the portal's door with the site, the title and return=<SITE_URL>/auth/visitor?to=<path> (${res.status}, ${door.href})`,
  )

  res = await get(origin, `/auth/visitor?code=${ACADEMY_CODE}&to=%2Fsome-path`)
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('bg_visitor=')) ?? ''
  check(
    res.status === 302 && res.headers.get('location') === '/some-path' && cookie.startsWith(`bg_visitor=${ACADEMY_TOKEN};`) && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie),
    `/auth/visitor redeems the code with the secret key, sets the HttpOnly cookie and goes on to the path (${res.status}, ${res.headers.get('location')}, ${cookie})`,
  )
  res = await get(origin, '/auth/visitor?code=not-the-code&to=%2Fsome-path')
  const expired = await res.text()
  check(res.status === 400 && expired.includes('That sign-in link has expired') && expired.includes('href="/auth/sign-in?to=%2Fsome-path"'), `a code the api will not redeem is the expired page, back to the door (${res.status})`)
  res = await get(origin, `/auth/visitor?code=${ACADEMY_CODE}&to=%2F%2Fevil.example`)
  await res.text()
  check(res.status === 302 && res.headers.get('location') === '/', `and \`to\` never names another host (${res.headers.get('location')})`)

  const gatedAt = `/blog/${GATED_SLUG}`
  res = await get(origin, gatedAt)
  let html = await res.text()
  const signInLink = `href="${`/auth/sign-in?${new URLSearchParams({ to: gatedAt, title: 'The members briefing' })}`.replace(/&/g, '&amp;')}"`
  check(res.status === 200 && html.includes('The members briefing') && !html.includes(GATED_BODY) && html.includes(signInLink), 'signed out, a gated entry is its teaser with a way to sign in')
  const signedInCookie = { Cookie: `bg_visitor=${ACADEMY_TOKEN}` }
  res = await get(origin, gatedAt, { headers: signedInCookie })
  html = await res.text()
  check(
    res.status === 200 && html.includes(GATED_BODY) && plain(html).includes('Signed in as Robin.') && /private|no-store/.test(res.headers.get('cache-control') ?? '') && res.headers.get('x-backgold-cache') !== 'HIT',
    `signed in (the cookie), it reads the body, names the visitor and is never cached (${res.headers.get('cache-control')})`,
  )

  const progress = (headers) =>
    get(origin, '/auth/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
      body: JSON.stringify({ course: 'reading-the-budget', lesson: 'the-levy-line', position_seconds: 72 }),
    })
  res = await progress(signedInCookie)
  const saved = await res.json()
  check(res.status === 200 && saved.progress?.position_seconds === 72 && typeof saved.course?.total === 'number', `POST /auth/progress with the cookie saves through the api and answers its JSON (${res.status}, ${JSON.stringify(saved)})`)
  check(fixture.state.progress.at(-1)?.lesson === 'the-levy-line', 'and the api was told')
  res = await progress({})
  check(res.status === 401 && (await res.json()).code === 'VISITOR_REQUIRED', `without the cookie, 401 (${res.status})`)
  res = await progress({ ...signedInCookie, Origin: 'https://evil.example' })
  check(res.status === 403, `from another site, 403 (${res.status})`)

  res = await get(origin, '/auth/sign-out?to=%2Fsome-path', { headers: signedInCookie })
  const cleared = res.headers.getSetCookie().find((c) => c.startsWith('bg_visitor=')) ?? ''
  check(res.status === 302 && res.headers.get('location') === '/some-path' && /(Max-Age=0|Expires=Thu, 01 Jan 1970)/i.test(cleared), `/auth/sign-out clears the cookie and goes on to the path (${res.status}, ${cleared})`)
}

async function checkNewsBase(origin, fixture) {
  log('\nAn organization at /news')
  let res = await get(origin, '/news')
  let html = await res.text()
  const h1s = tags(html, 'h1')
  const firstRow = html.indexOf('The levy, explained')
  check(
    res.status === 200 &&
      h1s.length === 1 &&
      plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '') === 'From the party' &&
      html.includes('Announcements and the occasional argument.') &&
      html.includes('Open books, line by line'),
    `/news lists the posts under the intro page's Hero, its headline the one <h1> (got ${res.status}, ${h1s.length} <h1>)`,
  )
  check(
    html.includes('Hear it from us first') && firstRow !== -1 && html.indexOf('From the party') < firstRow && html.indexOf('Hear it from us first') < firstRow,
    "the intro page's sections, its Hero then its call to action, are drawn above the list",
  )
  check(fixture.state.seen.some((s) => s.path === '/pages/news'), 'it read the intro page, GET /pages/news')
  const crumbs = jsonLdBlocks(html).map((b) => JSON.parse(b)).flat().find((t) => t['@type'] === 'BreadcrumbList')
  check(
    crumbs?.itemListElement?.[1]?.name === 'News' && crumbs.itemListElement[1].item === `${origin}/news`,
    `the list's breadcrumb is News at ${origin}/news (${JSON.stringify(crumbs?.itemListElement?.[1] ?? null)})`,
  )
  if (ON_KIT) {
    check(/<form class="list-search"[^>]*action="\/news"/.test(html), 'the "Search news" box sends ?q= to /news')
    res = await get(origin, '/news?q=levy')
    html = await res.text()
    check(res.status === 200 && plain(html).includes('1 result for ‘levy’') && html.includes('The levy, explained'), `/news?q=levy searches the posts (got ${res.status})`)
  }

  res = await get(origin, '/news/levy-explained')
  html = await res.text()
  check(res.status === 200 && /<h1[^>]*>The levy, explained<\/h1>/.test(html), `an entry renders at /news/<slug> (got ${res.status})`)
  const entryCrumbs = jsonLdBlocks(html).map((b) => JSON.parse(b)).flat().find((t) => t['@type'] === 'BreadcrumbList')
  check(
    entryCrumbs?.itemListElement?.[1]?.name === 'News' && entryCrumbs.itemListElement[1].item === `${origin}/news`,
    "the entry's breadcrumb goes back to News at /news",
  )
  // The nonprofit template names the list as the header menu does (the fixture's link to it says Blog).
  const crumbWord = NONPROFIT ? 'Blog' : 'News'
  if (ON_KIT) check(new RegExp(`<nav class="crumbs"[^>]*>\\s*<a href="/news"[^>]*>${crumbWord}</a>`).test(html), `the entry page links back to ${crumbWord} at /news`)

  res = await get(origin, '/')
  html = await res.text()
  check(
    res.status === 200 && (ON_KIT ? /<a href="\/news"[^>]*>All news<\/a>/ : /<a href="\/news"[^>]*>All posts<\/a>/).test(html) && !html.includes('href="/blog'),
    `home's Blog section links ${ON_KIT ? '"All news"' : '"All posts"'} to /news, and nothing on home points at /blog`,
  )
  res = await get(origin, '/kitchen-sink')
  html = await res.text()
  check(res.status === 200 && html.includes('href="/news/levy-explained"') && !html.includes('href="/blog'), 'the featured post (ContentPost) links /news/<slug>')

  for (const path of ['/blog', '/blog/levy-explained', '/blog/feed.xml']) {
    res = await get(origin, path)
    await res.text()
    check(res.status === 404, `${path} is a 404 on an organization at /news (got ${res.status})`)
  }
  if (ON_KIT) {
    res = await get(origin, '/no-such-page')
    html = await res.text()
    check(res.status === 404 && /<a class="button button-quiet" href="\/news"[^>]*>Read the news<\/a>/.test(html), 'the 404 offers Read the news at /news')
  }

  for (const path of ['/feed.xml', '/news/feed.xml']) {
    res = await get(origin, path)
    const feed = await res.text()
    check(
      res.status === 200 &&
        wellFormedXml(feed) &&
        feed.includes(`<link rel="self" type="application/atom+xml" href="${origin}/feed.xml"/>`) &&
        feed.includes(`<link rel="alternate" type="text/html" href="${origin}/news"/>`) &&
        feed.includes(`${origin}/news/levy-explained`),
      `${path} is the merged feed: its self link ${origin}/feed.xml, its page /news, its entries under /news (got ${res.status})`,
    )
  }
  res = await get(origin, '/sitemap.xml')
  const sitemap = await res.text()
  check(res.status === 200 && sitemap.includes(`${origin}/news/levy-explained`) && !sitemap.includes('/blog'), 'the sitemap lists the posts under /news')
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

/** The Chrome at CHROME_BIN, for what `why` names, or a failure that says why there is none. */
function chromeBin(why) {
  const chrome = process.env.CHROME_BIN
  if (!chrome) throw new CheckFailed(`${why} needs Chrome: set CHROME_BIN to a Chrome or Chromium executable (the starter-template CI image sets it)`)
  try {
    accessSync(chrome, fsConstants.X_OK)
  } catch {
    throw new CheckFailed(`${why} needs Chrome: CHROME_BIN=${chrome} is not an executable file`)
  }
  return chrome
}

/**
 * A headless Chrome driven over the DevTools protocol with node's own
 * WebSocket, every https request blocked so it reads only the Worker and the
 * fixture api. `open(url, scheme)` loads a page with the system's colour
 * scheme (`light` or `dark`) and reduced motion emulated;
 * `evaluate(expression)` is the expression's value there, awaited.
 */
async function headlessChrome(chrome) {
  const profile = mkdtempSync(join(work, 'chrome-'))
  const child = spawn(
    chrome,
    ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
  )
  children.add(child)
  try {
    const endpoint = await new Promise((resolveEndpoint, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error(`Chrome opened no DevTools port in 30 seconds\n${output}`)), 30000)
      child.stderr.on('data', (chunk) => {
        output += chunk
        const found = /DevTools listening on (ws:\/\/\S+)/.exec(output)
        if (found) {
          clearTimeout(timer)
          resolveEndpoint(found[1])
        }
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`Chrome exited with ${code}\n${output}`))
      })
    })
    const socket = new WebSocket(endpoint)
    await new Promise((opened, failed) => {
      socket.onopen = opened
      socket.onerror = () => failed(new Error(`could not connect to Chrome at ${endpoint}`))
    })
    let nextId = 1
    const pending = new Map()
    const waiting = []
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      if (message.id !== undefined && pending.has(message.id)) {
        const { done, failed } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) failed(new Error(`Chrome: ${message.error.message}`))
        else done(message.result)
        return
      }
      const waiter = waiting.find((w) => w.method === message.method && w.sessionId === message.sessionId)
      if (waiter) {
        waiting.splice(waiting.indexOf(waiter), 1)
        waiter.done(message.params)
      }
    }
    const send = (method, params = {}, sessionId) =>
      new Promise((done, failed) => {
        const id = nextId++
        pending.set(id, { done, failed })
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      })
    const next = (method, sessionId, seconds) =>
      new Promise((done, failed) => {
        const waiter = { method, sessionId, done }
        waiting.push(waiter)
        setTimeout(() => {
          if (!waiting.includes(waiter)) return
          waiting.splice(waiting.indexOf(waiter), 1)
          failed(new Error(`Chrome sent no ${method} in ${seconds} seconds`))
        }, seconds * 1000)
      })
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Network.enable', {}, sessionId)
    await send('Network.setBlockedURLs', { urls: ['https://*'] }, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
    return {
      /** The viewport's width in CSS pixels (phones below 768 emulate a mobile device). */
      async width(width) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, sessionId)
      },
      async open(url, scheme) {
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId)
        const loaded = next('Page.loadEventFired', sessionId, 60)
        await send('Page.navigate', { url }, sessionId)
        await loaded
      },
      /** The whole page as a PNG at `file`. */
      async shot(file) {
        const { cssContentSize } = await send('Page.getLayoutMetrics', {}, sessionId)
        const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } }, sessionId)
        writeFileSync(file, Buffer.from(data, 'base64'))
      },
      async clearCookies() {
        await send('Network.clearBrowserCookies', {}, sessionId)
      },
      async evaluate(expression) {
        const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
        if (exceptionDetails) throw new Error(`in the page: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`)
        return result.value
      },
      async close() {
        socket.close()
        await killTree(child)
      },
    }
  } catch (error) {
    await killTree(child)
    throw error
  }
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
  // On the candidate template, its starter home too (Hero · portrait, Countdown · tiles).
  for (const path of ['/', '/blog/levy-explained', ...(CANDIDATE ? ['/candidate-home'] : [])]) {
    const report = join(work, `lighthouse${path.replace(/\W+/g, '-')}.json`)
    const before = fixture.count()
    await runAsync(
      'npx',
      [
        '--yes',
        `lighthouse@${LIGHTHOUSE_VERSION}`,
        `${origin}${path}`,
        '--chrome-flags=--headless=new --no-sandbox',
        '--only-categories=performance,accessibility,seo',
        '--output=json',
        `--output-path=${report}`,
        '--quiet',
      ],
      work,
      // Lighthouse's launcher finds Chrome through CHROME_PATH (the CLI has no
      // chrome-path option); without it, it searches the system and fails on an
      // image whose Chromium is not on a standard path.
      { CHROME_PATH: chrome },
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
  VoterTools: (i) => [i.label],
  SampleBallot: (i) => [i.name ?? i.office],
  Scorecard: (i) => [i.bill ?? i.name],
  // The offer's name and the program's first benefit; prices are the template's own words over the *_cents columns.
  Membership: (i) => [i.name, ...(i.benefits ?? []).slice(0, 1)],
  Faq: (i) => [i.question],
  Comparison: (i) => [i.issue, i.us, i.them, i.them2],
  Stories: (i) => [i.title],
  // Sections batch 3: the Hero's words are its rotating layout's and the
  // ladder's rungs QuickDonate's ladder layout's; the defaults draw neither.
  Hero: () => [],
  QuickDonate: () => [],
  ShareKit: (i) => [i.network, i.text],
  Financials: (i) => [i.category, i.amount],
  // About's credential rows are its portrait and books layouts' words; the default draws none.
  About: () => [],
  Services: (i) => [i.name],
  CaseStudies: (i) => [i.title],
  Resources: (i) => [i.title],
  Pathways: (i) => [i.title],
  Portfolio: (i) => [i.title],
  // The kit layout lists the downloads; talks, appearances and mentions are the speaker and press layouts'.
  MediaKit: (i) => (i.kind === 'asset' ? [i.title] : []),
  Booking: (i) => [i.name],
  Classroom: (i) => [i.title],
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
        // A template on the kit asks the frame to wear the site: the same address with its layout and look appended.
        const placed = ON_KIT ? new RegExp(`src="${src.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\?layout=[a-z_]+&amp;look=[0-9a-f.]+&amp;look_dark=[0-9a-f.]+&amp;radius=${FRAME_RADIUS}&amp;font=${FRAME_FONT}"`) : null
        if (frames.length !== 1 || !(placed ? placed.test(frames[0]) : frames[0].includes(`src="${src}"`))) failures.push(`${type}: expected one iframe of ${section.embed.iframe}, found ${frames.length}`)
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
    // A kit template's components must show every column. The public
    // starter draws these through DefaultSection, which shows the heading
    // and the row fields it knows, not each column the kit's component draws.
    const plainFallback = !ON_KIT && kitchen.templateSections.has(type)
    if (section.data && !rowText && !plainFallback) {
      failures.push(`${type}: a data block with no row rule in starter-e2e.mjs ROW_TEXT`)
      continue
    }
    if (!plainFallback && rowText) {
      for (const item of section.data?.items ?? []) {
        for (const want of rowText(item)) if (want && !text.includes(want)) failures.push(`${type}: row text ${JSON.stringify(want)} missing`)
      }
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
    const data = {}
    return { id, textContent: '', data, getAttribute: (name) => (name === 'data-bg-live' ? id : (data[name] ?? null)), setAttribute: (name, value) => (data[name] = value) }
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

/**
 * Runs `body` as a module in the copy, where `server` is a vite server on the
 * copy's own astro and vite (no astro.config, so no adapter) that loads the
 * template's source, and returns what `body` prints as one `PROBE <json>` line.
 */
function probe(siteDir, name, body) {
  const file = join(siteDir, `${name}-probe.mjs`)
  writeFileSync(
    file,
    `import { createServer } from 'vite'
import { getViteConfig } from 'astro/config'
const config = await getViteConfig({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, ssr: { noExternal: ['@backgold/template-kit'] } }, { configFile: false, logLevel: 'silent' })({ command: 'serve', mode: 'test' })
const server = await createServer({ ...config, configFile: false })
try {
${body}
} finally {
  await server.close()
}
`,
  )
  const result = spawnSync('node', [file], { cwd: siteDir, encoding: 'utf8', env: process.env })
  rmSync(file, { force: true })
  const line = (result.stdout ?? '').split('\n').find((l) => l.startsWith('PROBE '))
  if (result.status !== 0 || !line) throw new Error(`the ${name} probe exited with ${result.status}\n${result.stdout}${result.stderr}`)
  return JSON.parse(line.slice(6))
}

// Renders LiveCounts.astro alone with Astro's container, with a first-party
// locals.backgold, and prints the markup.
const FIRST_PARTY_PROBE = `  const { experimental_AstroContainer } = await server.ssrLoadModule('astro/container')
  const { default: LiveCounts } = await server.ssrLoadModule('@backgold/template-kit/components/sections/EventsList/LiveCounts.astro')
  const container = await experimental_AstroContainer.create()
  const html = await container.renderToString(LiveCounts, { locals: { backgold: { firstParty: true } } })
  console.log('PROBE ' + JSON.stringify(html))`

/**
 * First-party live counts, unit-level (the fixture api cannot answer on the
 * site's own origin): the script a first-party site writes asks the
 * same-origin path and carries no key, and run as a browser would it sends
 * no Authorization header.
 */
async function checkFirstPartyLive(siteDir) {
  log('\nFirst-party live counts (LiveCounts rendered alone, first-party locals)')
  const html = probe(siteDir, 'live-first-party', FIRST_PARTY_PROBE)
  const tag = /<script\b([^>]*\bdata-bg-live-api="[^"]*"[^>]*)>([\s\S]*?)<\/script>/.exec(html)
  check(tag !== null && /\bdata-bg-live-api="\/api\/content\/v1\/events\/live"/.test(tag[1]), 'first-party, the script asks the same-origin path /api/content/v1/events/live')
  check(!/data-bg-live-key/.test(tag[1]), 'and carries no key attribute')
  const slot = { textContent: '', getAttribute: (name) => (name === 'data-bg-live' ? 'evt_w1' : null), setAttribute: () => {} }
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

/** The party template's own faces, as its src/template.ts gives them to the kit. */
const PARTY_FACES = {
  heading: 'Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,800;1,9..144,500',
  body: 'Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
}

/**
 * First-party faces, unit-level (the Worker under test reads with a site key):
 * the kit's src/lib/fonts.ts, given the party's own faces (PARTY_FACES, as
 * templates/party/src/template.ts names them), names each theme file by its same-origin path, as a hosted
 * page does, with nothing to preconnect; a system face downloads nothing; a
 * face it cannot read keeps the template's own face for that slot alone.
 */
function checkFirstPartyFonts(siteDir, theme) {
  log('\nFirst-party faces (the kit\'s src/lib/fonts.ts alone, with the party\'s faces)')
  const fonts = probe(
    siteDir,
    'fonts-first-party',
    `  const { siteFonts } = await server.ssrLoadModule('@backgold/template-kit/lib/fonts')
  const own = ${JSON.stringify(PARTY_FACES)}
  const theme = ${JSON.stringify(theme)}
  const system = { ...theme, fonts: { ...theme.fonts, heading: { family: 'Georgia', stack: "Georgia,'Times New Roman',Times,serif", source: 'system', files: [] } } }
  const unreadable = { ...theme, fonts: { ...theme.fonts, heading: { ...theme.fonts.heading, stack: '"Roboto Slab"}body{color:red' } } }
  console.log('PROBE ' + JSON.stringify({ theme: siteFonts(theme, true, own), system: siteFonts(system, true, own), unreadable: siteFonts(unreadable, true, own) }))`,
  )
  const sources = (css) => [...css.matchAll(/src:url\(([^)]+)\)/g)].map((m) => m[1])
  const paths = [theme.fonts.heading, theme.fonts.body].flatMap((face) => face.files.map((file) => new URL(file.url).pathname))
  check(
    JSON.stringify(sources(fonts.theme.css)) === JSON.stringify(paths) && paths.every((p) => /^\/lp-runtime\/[0-9a-f]{64}\.woff2$/.test(p)) && fonts.theme.preconnects.length === 0 && fonts.theme.stylesheet === null,
    `first-party, every theme file loads from the site's own host at /lp-runtime/<hash>.woff2, as on a hosted page, with nothing preconnected (${paths.length} files)`,
  )
  check(
    fonts.system.css.startsWith(`:root{--site-font-heading:Georgia,'Times New Roman',Times,serif;--site-font-body:${theme.fonts.body.stack}}`) &&
      !fonts.system.css.includes('"Georgia"') &&
      sources(fonts.system.css).length === theme.fonts.body.files.length,
    'a system face sets its stack and downloads nothing',
  )
  check(
    !fonts.unreadable.css.includes('Roboto Slab') && !fonts.unreadable.css.includes('}body') &&
      fonts.unreadable.stylesheet === 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,800;1,9..144,500&display=swap' &&
      fonts.unreadable.css.includes(`--site-font-body:${theme.fonts.body.stack}`),
    `a face it cannot read keeps the template's own for that slot alone (heading from ${fonts.unreadable.stylesheet}; body the theme's)`,
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
  check(liveScripts === 1, `the live-counts script is on the page once for three event sections (found ${liveScripts})`)
  const ran = await runLiveScript(html)
  check(
    ran.attributes['data-bg-live-api'] === `${fixture.origin}/api/content/v1/events/live` && ran.attributes['data-bg-live-key'] === SITE_KEY,
    "the script reads the api's /events/live with the publishable key",
  )
  const read = liveReads().at(-1)
  // The calendar's month adds its own events, after the agenda's and the cards'.
  const pageIds = [...upcomingIds, 'evt_c1', 'evt_c2', 'evt_c3']
  check(
    ran.reads === 1 && read && read.key === SITE_KEY && decodeURIComponent(read.search) === `?ids=${pageIds.join(',')}`,
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
  const numbers = Object.fromEntries(upcomingIds.map((id) => [id, ran.slots.find((s) => s.id === id)?.data ?? null]))
  check(
    JSON.stringify(numbers.evt_w1) === '{"data-going":"142"}' &&
      JSON.stringify(numbers.evt_w3) === '{"data-going":"88","data-capacity":"100"}' &&
      JSON.stringify(numbers.evt_w2) === '{}',
    `and writes the numbers on each slot it fills: data-going, and data-capacity where the event has seats (${JSON.stringify(numbers)})`,
  )
  const actions = (markup) => [...markup.matchAll(/<a class="button[^"]*" href="([^"]*)"[^>]*>\s*([^<]*?)\s*<span class="visually-hidden"[^>]*>: ([^<]*)<\/span>/g)].map((m) => [decode(m[3]), m[2], decode(m[1])])
  const agendaActions = Object.fromEntries(actions(agenda).map(([title, label, href]) => [title, `${label} ${href}`]))
  check(
    agendaActions['Get-out-the-vote dinner'] === 'Get tickets /events/gotv-dinner' &&
      agendaActions['Harlow County candidate forum'] === 'RSVP /events/candidate-forum' &&
      agendaActions['New member night'] === 'Details /events/new-member-night',
    `the agenda's buttons open each event's page on the site: Get tickets, RSVP, Details once registration closed (${JSON.stringify(agendaActions)})`,
  )
  check(
    actions(cards).some(([title, label, href]) => title === 'Get-out-the-vote dinner' && label === 'Get tickets' && href === '/events/gotv-dinner'),
    'the cards draw Get tickets on the event that sells tickets, to its page on the site',
  )
  const tabsOf = (markup) => [...(/<nav class="agenda-tabs[^"]*"[^>]*>([\s\S]*?)<\/nav>/.exec(markup)?.[1] ?? '').matchAll(/<a href="([^"]*)"([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ href: m[1], current: /aria-current="page"/.test(m[2]), label: decode(m[3]) }))
  let tabs = tabsOf(agenda)
  check(
    JSON.stringify(tabs.map((t) => `${t.label} ${t.href}`)) === JSON.stringify(['All /events', 'Meetings /events/meeting', 'Volunteer /events/volunteer', 'Fundraisers /events/fundraiser']) && tabs[0].current && tabs.filter((t) => t.current).length === 1,
    `the agenda's type tabs: All (current), then each type with an upcoming event; no tab for Rallies (${tabs.map((t) => t.label).join(', ')})`,
  )
  check(!cards.includes('agenda-tabs'), 'the Cards section draws no tabs')
  // The rows open their events (C5): the title is each row's one link, stretched over the row, the button its own link beside it.
  const rows = [...agenda.matchAll(/<li class="event-row"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1])
  const titleLinks = rows.map((row) => /class="event-title"[^>]*><a class="event-link" href="([^"]*)"[^>]*>([^<]*)<\/a>/.exec(row))
  check(
    rows.length === upcomingIds.length &&
      titleLinks.every((m) => m !== null) &&
      JSON.stringify(titleLinks.map((m) => m[1])) === JSON.stringify(['/events/candidate-forum', '/events/door-knock', '/events/gotv-dinner', '/events/new-member-night']) &&
      rows.every((row) => (row.match(/<a\b/g) ?? []).length === 2 && !/<a\b(?:(?!<\/a>).)*<a\b/s.test(row)),
    `with buttons, each agenda row's title still links to the event's page (the row's one stretched link) beside its button, no link inside another (${titleLinks.map((m) => m?.[1]).join(', ')})`,
  )
  // The line under the agenda (A6, C5): the rows' one zone by name, their times without it, and every event as one calendar file.
  const times = [...agenda.matchAll(/<p class="event-meta"[^>]*>\s*<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1])
  check(
    /<p class="fine events-calendar-line[^"]*"[^>]*>\s*Times are Mountain Time\. <a class="text-link[^"]*" href="\/events\.ics"[^>]*>Add every event to your calendar<\/a>/.test(agenda) &&
      times.length > 0 &&
      times.every((t) => /^\d{1,2}:\d{2} [AP]M$/.test(t)),
    `under the agenda: "Times are Mountain Time." and Add every event to your calendar (/events.ics); the rows' times leave the zone off (${times.join(', ')})`,
  )
  check(!cards.includes('events-calendar-line'), 'the Cards section draws no calendar line')
  const icsRes = await get(origin, '/events.ics')
  const allIcs = await icsRes.text()
  const vevents = allIcs.split('BEGIN:VEVENT').length - 1
  check(
    icsRes.status === 200 &&
      /^text\/calendar/.test(icsRes.headers.get('content-type') ?? '') &&
      /^BEGIN:VCALENDAR\r\n/.test(allIcs) &&
      /\r\nX-WR-CALNAME:[^\r]+ events\r\n/.test(allIcs) &&
      vevents === upcomingIds.length &&
      /DTSTART:20261101T183000Z\r\n[\s\S]*?SUMMARY:Get-out-the-vote dinner\r\n[\s\S]*?URL:[^\r]*\/events\/gotv-dinner\r\nEND:VEVENT/.test(allIcs),
    `/events.ics is every upcoming event as one calendar file, each linking to its page (got ${icsRes.status}, ${vevents} events)`,
  )

  // Ruling 32: the Calendar, a month at a time.
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const now = calendarMonthOf(new Date())
  const monthAt = (offset) => {
    const d = new Date(Date.UTC(now.year, now.monthIndex + offset, 1))
    return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth(), param: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
  }
  const [prevMonth, thisMonth, nextMonth] = [monthAt(-1), monthAt(0), monthAt(1)]
  const lastDay = new Date(Date.UTC(now.year, now.monthIndex + 1, 0)).getUTCDate()
  /** The grid's days of the month, each with the event pages its chips open. */
  const gridDays = (markup) =>
    [...markup.matchAll(/<td\b([^>]*\bclass="cal-day[^"]*"[^>]*)>([\s\S]*?)<\/td>/g)].map((m) => ({
      day: Number(/class="cal-dn"[^>]*>(\d+)</.exec(m[2])?.[1]),
      today: /aria-current="date"/.test(m[1]),
      links: [...m[2].matchAll(/<a class="cal-chip" href="([^"]*)"/g)].map((l) => decode(l[1])),
    }))
  const monthLinks = (markup) => [...(/<nav class="cal-nav"[^>]*>([\s\S]*?)<\/nav>/.exec(markup)?.[1] ?? '').matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)].map((m) => decode(m[1]))
  const phoneOf = (markup) => (markup.includes('class="cal-phone"') ? markup.slice(markup.indexOf('class="cal-phone"')) : '')
  const calendarReads = () => fixture.state.seen.filter((s) => s.path === '/events' && new URLSearchParams(s.search).has('from'))

  check(/\bno-store\b/.test(res.headers.get('cache-control') ?? ''), `a page with a calendar is never stored by the edge (Cache-Control: ${res.headers.get('cache-control')})`)
  const cal = sectionWith(html, 'EventsList', 'class="cal"')
  check(cal !== '' && /<table class="cal-grid"/.test(cal) && tags(cal, 'th').length === 7, 'the events page draws its Calendar: a month grid of seven weekday columns')
  check(plain(cal).includes(`${MONTH_NAMES[thisMonth.monthIndex]} ${thisMonth.year}`), `with no ?month= it shows this month, ${MONTH_NAMES[thisMonth.monthIndex]} ${thisMonth.year}`)
  let days = gridDays(cal)
  const byDay = Object.fromEntries(days.map((d) => [d.day, d]))
  check(
    days.length === lastDay && days.filter((d) => d.today).length === 1 && days.find((d) => d.today)?.day === now.day,
    `every day of the month is a cell, and today (the ${now.day}th) is marked aria-current="date"`,
  )
  check(
    JSON.stringify(byDay[1]?.links) === JSON.stringify(['/events/chapter-supper']) &&
      JSON.stringify(byDay[27]?.links) === JSON.stringify(['/events/phone-bank-night']) &&
      (byDay[28]?.links ?? []).length === 0 &&
      (byDay[lastDay]?.links ?? []).includes('/events/month-end-mixer') &&
      !cal.includes('next-month-canvass'),
    "each event is a chip in its day in the event's own zone (the 28th's 02:00 UTC is the 27th in Denver), linking to /events/<slug>; next month's events are not here",
  )
  check(
    JSON.stringify(monthLinks(cal)) === JSON.stringify([`/events?month=${prevMonth.param}`, `/events?month=${nextMonth.param}`]),
    `the month arrows are addresses on the page: ?month=${prevMonth.param} and ?month=${nextMonth.param}, and no "This month" on this month (${monthLinks(cal).join(', ')})`,
  )
  const phone = phoneOf(cal)
  check(
    phone !== '' &&
      JSON.stringify(slotIds(phone)) === JSON.stringify(['evt_c1', 'evt_c2', 'evt_c3']) &&
      [...phone.matchAll(/class="event-title"[^>]*><a class="event-link" href="([^"]*)"/g)].map((m) => m[1]).join(' ') === '/events/chapter-supper /events/phone-bank-night /events/month-end-mixer',
    "on a phone the same month is the agenda's rows, each with its live slot and its title linking to /events/<slug>",
  )
  check(
    calendarReads().some((s) => {
      const q = new URLSearchParams(s.search)
      return q.get('from') === new Date(Date.UTC(now.year, now.monthIndex, 0)).toISOString().slice(0, 10) && q.get('to') === new Date(Date.UTC(now.year, now.monthIndex + 1, 1)).toISOString().slice(0, 10) && !q.has('type')
    }),
    'it read the month from GET /events?from=&to=, a day either side of the month',
  )
  tabs = tabsOf(cal)
  check(tabs.map((t) => t.href).join(' ') === '/events /events/meeting /events/volunteer /events/fundraiser' && tabs[0].current, "the calendar draws the agenda's type tabs, All current")

  res = await get(origin, `/events?month=${nextMonth.param}`)
  html = await res.text()
  const nextCal = sectionWith(html, 'EventsList', 'class="cal"')
  days = gridDays(nextCal)
  check(
    res.status === 200 && /\bno-store\b/.test(res.headers.get('cache-control') ?? '') && plain(nextCal).includes(`${MONTH_NAMES[nextMonth.monthIndex]} ${nextMonth.year}`),
    `/events?month=${nextMonth.param} shows ${MONTH_NAMES[nextMonth.monthIndex]} ${nextMonth.year}, never stored under the bare address`,
  )
  check(
    days.every((d) => !d.today) && JSON.stringify(days.find((d) => d.day === 15)?.links) === JSON.stringify(['/events/next-month-canvass']) && !nextCal.includes('month-end-mixer'),
    "there next month's event is on its day, and no day is today",
  )
  check(
    monthLinks(nextCal).join(' ') === `/events?month=${thisMonth.param} /events /events?month=${monthAt(2).param}`,
    `its arrows go back to ${thisMonth.param}, home to "This month" at /events, and on (${monthLinks(nextCal).join(', ')})`,
  )
  check(
    tabsOf(nextCal).map((t) => t.href).join(' ') === `/events?month=${nextMonth.param} /events/meeting?month=${nextMonth.param} /events/volunteer?month=${nextMonth.param} /events/fundraiser?month=${nextMonth.param}`,
    'each type tab keeps the month in view',
  )
  res = await get(origin, '/events?month=1999-01')
  html = await res.text()
  check(
    res.status === 200 && plain(sectionWith(html, 'EventsList', 'class="cal"')).includes(`${MONTH_NAMES[thisMonth.monthIndex]} ${thisMonth.year}`),
    'a ?month= out of reach (or not a month) shows this month',
  )

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
  const typedCal = sectionWith(html, 'EventsList', 'class="cal"')
  check(
    typedCal.includes('/events/phone-bank-night') && !typedCal.includes('/events/chapter-supper') && tabsOf(typedCal).find((t) => t.current)?.label === 'Volunteer',
    "there the calendar's month is the volunteer events, its Volunteer tab current",
  )
  check(
    fixture.state.seen.some((s) => s.path === '/events' && new URLSearchParams(s.search).has('from') && new URLSearchParams(s.search).get('type') === 'volunteer'),
    'it read the month with GET /events?from=&to=&type=volunteer',
  )
  check(plain(sectionWith(html, 'EventsList', 'class="ev-cards"')).includes('Harlow County candidate forum'), 'the Cards section there keeps its baked rows')
  check(/<link rel="canonical" href="[^"]*\/events\/volunteer"/.test(html) && tags(html, 'h1').length === 1, '/events/volunteer is its own canonical address, with one <h1>')
  check(
    fixture.state.seen.some((s) => s.path === '/events' && new URLSearchParams(s.search).get('type') === 'volunteer' && new URLSearchParams(s.search).get('limit') === '50'),
    "it read GET /events?type=volunteer with limit=50, the agenda's cap of 80 held to the api's maximum (the api answers 400 BAD_LIMIT above 50)",
  )
  for (const path of ['/events/rally', '/events/no-such-type']) {
    res = await get(origin, path)
    await res.text()
    check(res.status === 404, `${path} (no upcoming event, or no such type, or no such event) is a 404 (got ${res.status})`)
  }

  // A7: one event's page on the site.
  res = await get(origin, '/events/gotv-dinner')
  html = await res.text()
  const main = html.slice(html.indexOf('<main'), html.lastIndexOf('</main>'))
  check(res.status === 200, `GET /events/gotv-dinner is 200 (got ${res.status})`)
  check(
    tags(html, 'h1').length === 1 && plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '') === 'Get-out-the-vote dinner' && /<title>Get-out-the-vote dinner · /.test(html),
    "the event's title is the page's one <h1> and leads its <title>",
  )
  check(
    /<nav class="crumbs"[^>]*>[\s\S]*?<a href="\/events"[^>]*>Events<\/a>[\s\S]*?November[\s\S]*?<\/nav>/.test(main),
    'a breadcrumb leads back to Events and names the month, in the event\'s own zone',
  )
  check(
    /<iframe[^>]*data-bg-embed[^>]*src="https:\/\/secure\.backgold\.com\/embed\/e\/pine-valley\/gotv-dinner\?layout=detail&amp;look=[0-9a-f.]+&amp;look_dark=[0-9a-f.]+&amp;radius=12&amp;font=public-sans"/.test(main) &&
      main.indexOf('data-bg-embed') > main.indexOf('</h1>') &&
      !/(Tickets|Form|Sign-up|Petition|Secure giving) by BackGold/.test(main),
    "BackGold's RSVP and tickets sit beside the event's facts, asked to wear the site (layout detail, its colours light and dark, radius, type), with no per-module credit (the footer's Powered by BackGold is the one)",
  )
  check(/<link rel="canonical" href="[^"]*\/events\/gotv-dinner"/.test(html), '/events/gotv-dinner is its own canonical address')
  check(
    /<a href="\/events\/gotv-dinner\.ics"[^>]*>Add to calendar<\/a>/.test(main) &&
      /<a href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=39\.5%2C-105\.25"[^>]*>Get directions<\/a>/.test(main),
    'the event page offers Add to calendar and Get directions',
  )
  check(/\d{1,2}:\d{2} [AP]M Mountain Time · <a href="\/events\/gotv-dinner\.ics"/.test(main) && !/\b[MC][DS]T\b/.test(plain(main)), "the event's time names its zone as a reader knows it, Mountain Time, not MDT (C6)")
  // C6's map: the kit's own, drawn in the browser; with scripts off, the place and a link to it on OpenStreetMap.
  const mapEl = /<div class="event-map"[^>]*>[\s\S]*?<\/a>\s*<\/div>\s*<\/div>/.exec(main)?.[0] ?? ''
  check(
    /<div class="event-map"[^>]*role="region"[^>]*aria-label="Map: Fenwick Union Depot"[^>]*data-event-map[^>]*data-lat="39\.5"[^>]*data-lng="-105\.25"/.test(mapEl) &&
      /<div class="event-map-fallback"[^>]*data-event-map-fallback[^>]*>[\s\S]*<p[^>]*>Fenwick Union Depot<\/p>\s*<a class="text-link[^"]*" href="https:\/\/www\.openstreetmap\.org\/\?mlat=39\.50000&amp;mlon=-105\.25000#map=17\/39\.50000\/-105\.25000"[^>]*>Open in OpenStreetMap<\/a>/.test(mapEl) &&
      !/openstreetmap\.org\/export\/embed/.test(html) &&
      !/<iframe class="event-map/.test(html),
    "the event page draws the kit's map of the venue, its no-script view the place and Open in OpenStreetMap; no OpenStreetMap frame",
  )
  const mapScript = [...html.matchAll(/<script\b[^>]*\bsrc="(\/_astro\/[^"]+)"/g)].map((m) => m[1]).find((src) => /EventMap/.test(src))
  const mapLoader = mapScript ? await (await get(origin, mapScript)).text() : ''
  check(
    mapLoader !== '' && /IntersectionObserver/.test(mapLoader) && /import\(/.test(mapLoader) && mapLoader.length < 4000,
    `the page loads a small map loader that imports MapLibre only near the screen (${mapScript ?? 'no script'}, ${mapLoader.length} bytes)`,
  )
  res = await get(origin, '/events/gotv-dinner.ics')
  const ics = await res.text()
  check(
    res.status === 200 &&
      /^text\/calendar/.test(res.headers.get('content-type') ?? '') &&
      /BEGIN:VEVENT\r\n[\s\S]*DTSTART:20261101T183000Z\r\n[\s\S]*SUMMARY:Get-out-the-vote dinner\r\n[\s\S]*URL:[^\r]*\/events\/gotv-dinner\r\nEND:VEVENT/.test(ics),
    `/events/gotv-dinner.ics is the event as a calendar file (got ${res.status})`,
  )
  res = await get(origin, '/events/no-such-event.ics')
  await res.text()
  check(res.status === 404, `a calendar file for no event is a 404 (got ${res.status})`)

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
  check(/<div class="list-bar">\s*<nav class="list-filter"[\s\S]*?<\/nav>\s*<form class="list-search"/.test(html), 'the search ends the filter row, beside the chips (A4)')
  res = await get(origin, '/endorsements')
  check(!/class="list-search"/.test(await res.text()), 'a list other than News has no search box')

  // A4 on an organization still at /blog: no page can sit at /blog, so its
  // list has no intro and carries its own name; the starter's `news` page is
  // a page of its own at /news (the intro on an organization at /news is
  // checkNewsBase's).
  res = await get(origin, '/blog')
  html = await res.text()
  check(
    res.status === 200 && tags(html, 'h1').length === 1 && plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '') === 'Blog' && !html.includes('From the party'),
    `the list at /blog has no intro and carries its name, Blog, as the one <h1> (got ${res.status})`,
  )
  res = await get(origin, '/news')
  html = await res.text()
  check(
    res.status === 200 && plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '') === 'From the party' && !html.includes('post-rows'),
    `on an organization at /blog, /news is the News page on its own, not a redirect (got ${res.status} ${res.headers.get('location') ?? ''})`,
  )

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
 * The Map section drawn from its geometry (/coverage), and its tiles where
 * there is none: on the kitchen sink (no geoUrl) and at an address the api
 * does not have.
 */
/** A published page whose modules have nothing to frame draws each one's words and says it is not available. */
async function checkPartyUnwired(origin) {
  log('\nParty modules with nothing to frame')
  const res = await get(origin, '/unwired')
  const html = await res.text()
  check(res.status === 200, `GET /unwired is 200 (got ${res.status})`)
  const cases = [
    ['Donate', 'Every county, every ballot.', 'Online donations are not available right now.'],
    ['FormBlock', 'Send us a note', 'This form is not available right now.'],
    ['Petition', 'Sign the ballot petition', 'This petition is not available right now.'],
    ['SignupCapture', 'Get the weekly letter', 'Signing up is not available right now.'],
  ]
  for (const [type, words, line] of cases) {
    const markup = sectionsOf(html).find((sec) => sec.type === type)?.html ?? ''
    check(
      markup.includes(words) && markup.includes(line) && /data-module-unavailable/.test(markup) && tags(markup, 'iframe').length === 0,
      `${type} with no embed draws its words and "${line}"`,
    )
  }
}

async function checkPartyMap(origin, fixture) {
  log('\nParty map: the Map section drawn from its geometry')
  const { four, texas } = fixture.data.geo
  const unreadHash = '0'.repeat(64)
  const geoReads = (hash) => fixture.state.requests.get(`/lp-runtime/${hash}.json`) ?? 0
  let res = await get(origin, '/coverage')
  let html = await res.text()
  check(res.status === 200, `GET /coverage is 200 (got ${res.status})`)
  const maps = sectionsOf(html).filter((s) => s.type === 'Map').map((s) => s.html)
  check(maps.length === 4, `it draws its four Map sections (found ${maps.length})`)
  const [tx, fourDirectory, framed, unread] = maps
  const svgOf = (markup) => /<svg\b[^>]*class="region-map-svg"[\s\S]*?<\/svg>/.exec(markup)?.[0] ?? ''
  const viewBox = (markup) => /<svg\b[^>]*\bviewBox="([^"]+)"/.exec(svgOf(markup))?.[1]
  // Each place's path, in drawing order: its classes, its tooltip, and the link around it.
  const places = (markup) =>
    [...svgOf(markup).matchAll(/(<a\b[^>]*>)?<path\b([^>]*)><title[^>]*>([^<]*)<\/title><\/path>/g)].map((m) => ({
      classes: (/\bclass="([^"]*)"/.exec(m[2])?.[1] ?? '').split(/\s+/),
      title: decode(m[3]),
      link: m[1] ? /\bhref="([^"]*)"/.exec(m[1])?.[1] : null,
      unfocusable: m[1] ? /\btabindex="-1"/.test(m[1]) : null,
    }))
  const lede = (markup) => plain(/<p class="lede"[^>]*>([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? '')
  const keyEntries = (markup) => [...(/<p class="key"[^>]*>([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? '').matchAll(/<\/i>([^<]*)<\/span>/g)].map((m) => decode(m[1]))
  const head = (markup) => plain(markup.slice(0, markup.indexOf('</h2>') + 5))
  // Solid buttons (the main call) and quiet ones, as [label, href].
  const buttons = (markup, kind) =>
    [...markup.matchAll(/<a class="([^"]*)" href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].filter((m) => m[1].split(' ').includes('button') && m[1].split(' ').includes('button-quiet') === (kind === 'quiet')).map((m) => [decode(m[3]), m[2]])

  const texasGeo = JSON.parse(texas.json)
  const txPlaces = places(tx)
  const with_ = (list, cls) => list.filter((p) => p.classes.includes(cls))
  check(
    viewBox(tx) === `0 0 ${texasGeo.width} ${texasGeo.height}` && txPlaces.length === Object.keys(texasGeo.paths).length,
    `Map · map with Texas's geometry draws an <svg> on the server, a path per county (${txPlaces.length} paths, viewBox ${viewBox(tx)})`,
  )
  check(
    with_(txPlaces, 'region-lit').length === 8 && with_(txPlaces, 'region-starting').length === 1 && with_(txPlaces, 'region-dark').length === txPlaces.length - 9,
    `each county is classed by its row: 8 lit, 1 starting, every other county dark, rows or none (${with_(txPlaces, 'region-lit').length}/${with_(txPlaces, 'region-starting').length}/${with_(txPlaces, 'region-dark').length})`,
  )
  const txLinks = txPlaces.filter((p) => p.link)
  check(
    txLinks.length === 5 && txLinks.every((p) => p.classes.includes('region-lit') && p.unfocusable) && txPlaces.find((p) => p.title === 'Travis · Chapter meets monthly')?.link === 'https://example.org/travis',
    `the five lit counties with a link open it, out of the tab order (${txLinks.map((p) => p.title).join(', ')})`,
  )
  check(head(tx) === 'Near you Find your county chapter' && /<p class="kicker"[^>]*>Near you<\/p>\s*<h2/.test(tx), `the kicker is drawn over the heading (${head(tx)})`)
  check(
    lede(tx) === '8 of 254 counties · Chapter meets monthly' && /<span class="coverage-count"[^>]*>8 of 254 counties<\/span>/.test(tx),
    `the coverage line is the count of lit rows against the set's total and noun, then the lit label as written (${lede(tx)})`,
  )
  check(
    JSON.stringify(keyEntries(tx)) === JSON.stringify(['Chapter meets monthly', 'Getting started', 'No chapter yet']) && /<div class="region-map region-map-large"[^>]*aria-hidden="true"/.test(tx),
    `the key has a starting entry when a row is starting, and the map and its key are hidden from screen readers (${keyEntries(tx).join(', ')})`,
  )
  const rowsListed = [...tx.matchAll(/<li class="place-row"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => plain(m[1]))
  const darkNames = fixture.data.page('coverage', fixture.state.headline).sections[0].data.items.filter((r) => r.status === 'dark').map((r) => r.region)
  const list = tx.slice(tx.indexOf('class="place-list"'))
  check(
    rowsListed.length === 9 &&
      rowsListed[0] === 'Travis Chapter meets monthly' &&
      rowsListed[8] === 'Denton Getting started' &&
      darkNames.every((name) => !plain(list).includes(name)) &&
      /<a href="https:\/\/example\.org\/travis" rel="noopener"[^>]*>Travis<\/a>/.test(list),
    `the directory under the map names only the lit and starting counties, a link where it has one (${rowsListed.length} rows: ${rowsListed.map((r) => r.split(' ')[0]).join(', ')})`,
  )
  const invite = plain(/<div class="place-invite"[^>]*>([\s\S]*?)<\/div>/.exec(tx)?.[1] ?? '')
  check(
    invite === '245 counties · No chapter yet Start a chapter' &&
      /<span class="place-invite-count"[^>]*>245 counties<\/span>/.test(tx) &&
      JSON.stringify(buttons(tx, 'solid')) === JSON.stringify([['Start a chapter', '/contact']]) &&
      JSON.stringify(buttons(tx, 'quiet')) === JSON.stringify([['Talk to an organizer', '/organize']]) &&
      !/class="tiles"/.test(tx),
    `the dark counties are one line, their count and the dark label, with the charter link its one button; the organizer link follows, quiet (${invite})`,
  )

  const fourPlaces = places(fourDirectory)
  check(
    viewBox(fourDirectory) === '0 0 600 400' &&
      fourPlaces.map((p) => p.title).join(' | ') === 'Alder · Organized | Birch · Organized | Cedar · Getting started | Dunmore · Still open' &&
      fourPlaces[0].link === 'https://example.org/alder' && fourPlaces[0].classes.includes('region-lit') &&
      fourPlaces[1].link === null && fourPlaces[1].classes.includes('region-lit') &&
      fourPlaces[2].classes.includes('region-starting') && fourPlaces[3].classes.includes('region-dark'),
    `Map · directory reads a relative geoUrl from the api and matches rows to places ignoring case: Alder lit and linked, Birch lit, Cedar starting, Dunmore dark (${fourPlaces.map((p) => `${p.title}${p.link ? ' -> ' + p.link : ''}`).join(', ')})`,
  )
  const cards = [...fourDirectory.matchAll(/<li class="(place[^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => `${plain(m[2])}${m[1].includes('place-open') ? ' (open)' : ''}`)
  check(
    head(fourDirectory) === 'Chapters Four places' && lede(fourDirectory) === '2 of 4 · Organized' && cards.join(' | ') === 'alder Organized | Birch Organized | Cedar Getting started | 1 place Still open Start a chapter (open)',
    `with no total or noun the line counts the rows; a card for each lit and starting place, then one dashed card for the dark ones, their count and the template's dark label when the section has none (${lede(fourDirectory)}; ${cards.join(' | ')})`,
  )
  check(
    /<a class="button button-small" href="\/contact"[^>]*>Start a chapter<\/a>/.test(fourDirectory) &&
      buttons(fourDirectory, 'solid').length === 1 &&
      JSON.stringify(buttons(fourDirectory, 'quiet')) === JSON.stringify([['Talk to an organizer', '/organize']]),
    "the dashed card carries the charter link as the section's one solid button; the organizer link follows, quiet",
  )

  const framedPlaces = places(framed)
  check(
    viewBox(framed) === '353.5 179 153 102' &&
      framedPlaces.at(-1)?.title === 'Cedar · Getting started' && framedPlaces.at(-1)?.classes.includes('region-focus') &&
      framedPlaces.slice(0, -1).every((p) => p.classes.includes('region-dim')),
    `focusRegion frames its place: the viewBox zooms to Cedar, drawn last, the others dimmed (viewBox ${viewBox(framed)})`,
  )
  check(lede(framed) === 'Cedar county · Getting started', `a framed map's line names its place and status (${lede(framed)})`)

  check(
    svgOf(unread) === '' && (unread.match(/<li class="tile-place/g) ?? []).length === 4 && lede(unread) === '2 of 4 · Organized',
    `a geoUrl the api cannot serve draws the tiles, as a section with no geoUrl does, under the same coverage line (${lede(unread)})`,
  )
  check(geoReads(texas.hash) === 1 && geoReads(four.hash) === 1 && geoReads(unreadHash) === 1, `each geometry was read once for the page, the four places' once for two sections (${geoReads(texas.hash)}, ${geoReads(four.hash)}, ${geoReads(unreadHash)})`)

  // A new content version (the webhook), so the page renders again.
  const version = fixture.bump(fixture.state.headline)
  const hook = await signedWebhook(origin, version, WEBHOOK_SECRET)
  res = await get(origin, '/coverage')
  html = await res.text()
  check(
    hook.status === 204 && res.status === 200 && res.headers.get('x-backgold-cache') === 'MISS' && geoReads(texas.hash) === 1 && geoReads(four.hash) === 1 && geoReads(unreadHash) === 2,
    `rendered again at a new content version, the page reads no geometry it has (kept by its hash) and asks again for the one that failed (${res.headers.get('x-backgold-cache')}; ${geoReads(texas.hash)}, ${geoReads(four.hash)}, ${geoReads(unreadHash)})`,
  )

  res = await get(origin, '/kitchen-sink')
  html = await res.text()
  const sink = sectionsOf(html).find((s) => s.type === 'Map')?.html ?? ''
  check(/<div class="strip"/.test(sink) && (sink.match(/<span class="strip-tile/g) ?? []).length === 3 && !/region-map/.test(sink), 'a Map section with no geoUrl draws its tile strip and no map, as before')
}

/**
 * Boards A1 and A13 (the party template's home and its chrome): the Top
 * banner above the header (a takeover on home, the announcement strip on the
 * A1 page), the cover hero's kicker, accent word
 * and caption, the compact roster's one row, the photo call to action's
 * caption, the email sign-up's band Above the footer (its kicker, heading
 * and lede beside the frame), and the footer's
 * social circles and bottom row.
 */
async function checkPartyChrome(origin) {
  log('\nParty chrome and home (boards A1, A13)')
  let res = await get(origin, '/')
  let html = await res.text()
  const header = html.indexOf('<header class="site-header"')
  check(header > 0 && html.indexOf('data-bg-area="top_banner"') < header, 'the Top banner area is drawn above the header')
  check(/<section class="bg-section[^"]*\btakeover\b/.test(html), "home's TakeoverBanner is drawn as the full-screen takeover")
  check(/<a class="brand[^"]*" href="\/"[^>]*>\s*<img src="[^"]*" alt="Pine Valley for Liberty" class="brand-logo"/.test(html), 'the header brand is the logo, linking home, when the site has one')
  check(/<a href="https:\/\/facebook\.com\/pinevalleyliberty"[^>]*aria-label="Facebook"[^>]*>Fb<\/a>/.test(html), 'a social link is a circle with its short name and its full name for screen readers')
  check(/<span class="footer-powered"[^>]*>Powered by BackGold<\/span>/.test(html), 'the bottom row ends with Powered by BackGold')
  check(/<summary[^>]*><span class="sheet-open"[^>]*>Menu<\/span><span class="sheet-close"[^>]*>Close<\/span><\/summary>/.test(html), 'the phone sheet opens from Menu and reads Close while open')
  check(
    /<button class="mode-toggle"[^>]*data-mode-toggle[^>]*aria-pressed="false"[^>]*hidden/.test(html) &&
      html.indexOf('data-mode-toggle') < html.indexOf('header-button'),
    'the header carries the light and dark switch before the header button, hidden until its script shows it',
  )
  check(
    /:root\[data-gg-mode="dark"\]\{color-scheme:dark;/.test(html) &&
      /@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-gg-mode="light"\]\)\{/.test(html) &&
      html.indexOf("localStorage.getItem('gg-mode')") < html.indexOf('</head>'),
    'the dark set follows the system unless the visitor chose light, a chosen dark wins, and the head applies a kept choice before paint',
  )

  res = await get(origin, '/a1-home')
  html = await res.text()
  check(res.status === 200 && tags(html, 'h1').length === 1, `the A1 page is 200 with one <h1> (got ${res.status})`)
  const strip = /<p class="strip"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''
  check(
    html.indexOf('class="strip"') < html.indexOf('<header class="site-header"') &&
      plain(strip) === 'State convention · Harlow Civic Hall · April 10 and 11 Register as a delegate' &&
      /<b[^>]*>State convention<\/b>/.test(strip) &&
      /<a href="\/convention"[^>]*>Register as a delegate<\/a>/.test(strip),
    `a Call to action · Strip in Top banner is the slim strip above the header: the bold title, " · " place and date, the link (${plain(strip)})`,
  )
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? ''
  check(/^More freedom\. Fewer <em[^>]*>excuses\.<\/em>$/.test(h1.trim()), `the cover headline's last word is the accent (${h1})`)
  const hero = sectionWith(html, 'Hero', 'cover-words')
  check(
    /<p class="kicker"[^>]*>Westmark Liberty Party<\/p>/.test(hero) && /<p class="cover-caption"[^>]*>Photo: county chapter chairs, Harlow, last spring<\/p>/.test(hero),
    'the cover draws its kicker and the photo caption',
  )
  check(/<a class="button[^"]*"[^>]*>Join the party<\/a><a class="button button-quiet"[^>]*>Meet our candidates<\/a>/.test(hero), 'the cover draws its main call and an outline beside it')
  const roster = sectionWith(html, 'CandidateRoster', 'compact')
  const names = [...roster.matchAll(/<h3 class="compact-name"[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => plain(m[1]))
  check(
    JSON.stringify(names) === JSON.stringify(['Ada Kestrel', 'Halvard Brisco', 'Noor Ellingsworth', 'Gideon Marchetti']),
    `the compact roster draws one row of four from the top of the ballot (${names.join(', ')})`,
  )
  check(/<p class="section-head-more"[^>]*><a href="\/leadership"[^>]*>All 11 candidates<\/a>/.test(roster) && /<p class="kicker"[^>]*>On your ballot November 3<\/p>/.test(roster), 'and its section head: the kicker and "All 11 candidates"')
  check(/<p class="cta-photo-caption"[^>]*>Photo: new member night, Osgood County<\/p>/.test(sectionWith(html, 'Cta', 'cta-photo')), "the photo call to action draws its photo's caption")
  const signup = /<aside\b[^>]*data-bg-area="above_footer"[^>]*>([\s\S]*?)<\/aside>/.exec(html)?.[1] ?? ''
  check(
    /class="bg-section[^"]*\bsignup-band\b/.test(signup) && /<h2[^>]*>One email a week\./.test(signup) && /<iframe\b[^>]*data-bg-embed/.test(signup),
    "an email sign-up Above the footer is A1's band: the heading beside BackGold's framed form",
  )
  const words = /<div class="signup-words"[^>]*>([\s\S]*?)<\/div>/.exec(signup)?.[1] ?? ''
  check(
    /^<p class="kicker"[^>]*>The party letter<\/p>\s*<h2[^>]*>One email a week\.[^<]*<\/h2>\s*<p class="lede"[^>]*>Where the chapters met, what passed, and the next night to come along\.<\/p>$/.test(words.trim()),
    `and C1's words beside it: the kicker in small capitals over the heading, the lede under it (${plain(words)})`,
  )
  res = await get(origin, '/kitchen-sink')
  const sinkSignup = sectionsOf(await res.text()).find((s) => s.type === 'SignupCapture')?.html ?? ''
  check(
    /<h2[^>]*>Stay in touch<\/h2>/.test(sinkSignup) && !/class="(kicker|lede)"/.test(sinkSignup),
    'a sign-up with only a heading draws no kicker and no lede',
  )
}

/** A bright accent on gray (Libertarian gold on the LNC's gray, a near-white page), the brand the header-label and dark-accent defects showed on. */
const BRIGHT_BRAND = { primary_color: '#56565a', secondary_color: '#f8f8f8', accent_color: '#fed000' }
/** The template's own faces, as the layout links them for a site with no saved theme. */
const OWN_FACES_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,800;1,9..144,500&family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap'

/**
 * Run in the page, once its faces have loaded: the header button's label and
 * fill colours and their WCAG contrast ratio, the colour of the first element
 * `kicker` selects, and the font-family of the <h1> and of the text.
 */
async function pageLook(kicker) {
  await document.fonts.ready
  const channels = (value) => {
    const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value)
    if (!m) throw new Error(`not an sRGB colour: ${value}`)
    return { rgb: [m[1], m[2], m[3]].map(Number), alpha: m[4] === undefined ? 1 : Number(m[4]) }
  }
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
  const button = document.querySelector('.site-header .header-button')
  let header = null
  if (button) {
    const style = getComputedStyle(button)
    const ink = channels(style.color)
    const fill = channels(style.backgroundColor)
    const [hi, lo] = [luminance(ink.rgb), luminance(fill.rgb)].sort((a, b) => b - a)
    header = { label: button.textContent.trim(), ink: hex(ink.rgb), fill: hex(fill.rgb), opaque: ink.alpha === 1 && fill.alpha === 1, ratio: (hi + 0.05) / (lo + 0.05) }
  }
  const accent = kicker ? document.querySelector(kicker) : null
  return {
    header,
    kicker: accent ? hex(channels(getComputedStyle(accent).color).rgb) : null,
    heading: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
  }
}

/** The fixture site in another brand and saved theme, published as a new content version the Worker hears of by the webhook. */
async function restyle(origin, fixture, { brand, theme }) {
  fixture.data.site.brand = brand
  fixture.data.site.theme = theme
  const version = fixture.bump(fixture.state.headline)
  const hook = await signedWebhook(origin, version, WEBHOOK_SECRET)
  if (hook.status !== 204) throw new Error(`the webhook for content version ${version} answered ${hook.status}`)
}

/**
 * The party template's look in a browser, light and dark, for two brands: the
 * fixture's (with its saved theme) and a bright accent on gray with no theme.
 * The header button's label reads on its fill at AA (the header's link colour
 * never reaches it); an accent that already reads stays itself; the faces are
 * the theme's, declared as a hosted page declares them, else the template's
 * own, linked as before. The fixture's brand and theme are put back after,
 * and home read once under them, as Lighthouse expects to find it.
 */
async function checkPartyLook(origin, fixture, chrome) {
  log('\nParty look: the header button, the accent, the faces (headless Chrome, light and dark)')
  const own = { brand: fixture.data.site.brand, theme: fixture.data.site.theme }
  const { heading, body } = own.theme.fonts
  // The fixture serves the example's api.backgold.com files at its own origin.
  const served = (url) => url.replace(/^https:\/\/api\.backgold\.com\//, `${fixture.origin}/`)
  const KICKER = '[data-type="CandidateRoster"] .kicker'
  /** The first family of a computed font-family, unquoted (the browser quotes only a name that needs it). */
  const face = (fontFamily) => fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
  const browser = await headlessChrome(chrome)
  try {
    let html = await (await get(origin, '/')).text()
    const rules = [...html.matchAll(/@font-face\{font-family:"([^"]+)";font-style:normal;font-weight:(\d+);font-display:swap;src:url\(([^)]+)\) format\('woff2'\)\}/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}`)
    const declared = [heading, body].flatMap((face) => face.files.map((file) => `${face.family}|${file.weight}|${served(file.url)}`))
    check(
      JSON.stringify(rules) === JSON.stringify(declared),
      `a site with a saved theme declares its faces as a hosted page does: an @font-face rule per weight, swapped in, from the api's /lp-runtime (${heading.family} ${heading.files.map((f) => f.weight).join('/')}, ${body.family} ${body.files.map((f) => f.weight).join('/')})`,
    )
    check(
      html.includes(`:root{--site-font-heading:${heading.stack};--site-font-body:${body.stack}}`) &&
        !html.includes('fonts.googleapis.com') &&
        new RegExp(`<link rel="preconnect" href="${fixture.origin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}" crossorigin`).test(html),
      "it sets the theme's stacks, links nothing from Google Fonts and preconnects to the api, where the files are",
    )
    // The header at a phone's width: the wordmark's column may shrink for the
    // controls, so each of its lines stays one line (cut with an ellipsis when
    // it must) instead of breaking letter by letter, and nothing scrolls sideways.
    // The fixture's brand has a logo, so the words are drawn with it taken away.
    await restyle(origin, fixture, { brand: { ...own.brand, logo_url: null }, theme: own.theme })
    await browser.width(375)
    await browser.open(`${origin}/`, 'light')
    const narrow = await browser.evaluate(
      `(() => {
        const one = (el) => !el || Math.round(el.getBoundingClientRect().height) <= Math.round(parseFloat(getComputedStyle(el).fontSize) * 1.6)
        const name = document.querySelector('.site-header .brand-name')
        return { name: one(name), rest: one(document.querySelector('.site-header .brand-rest')), text: name?.textContent ?? '', scroll: document.documentElement.scrollWidth }
      })()`,
    )
    check(narrow.text.length > 0 && narrow.name && narrow.rest, `at 375 the wordmark keeps each line on one line (${narrow.text})`)
    check(narrow.scroll <= 375, `at 375 the page does not scroll sideways (${narrow.scroll}px wide)`)
    await browser.width(1280)
    await restyle(origin, fixture, own)
    for (const scheme of ['light', 'dark']) {
      await browser.open(`${origin}/`, scheme)
      const home = await browser.evaluate(`(${pageLook})(null)`)
      check(
        home.header?.opaque && home.header.ratio >= 4.5,
        `fixture brand, ${scheme}: the header button's label reads on its fill (${home.header?.label}: ${home.header?.ink} on ${home.header?.fill}, ${home.header?.ratio.toFixed(2)}:1)`,
      )
      if (scheme === 'light') {
        check(face(home.heading) === heading.family && face(home.body) === body.family, `headings and text wear the theme's faces (${face(home.heading)}, ${face(home.body)})`)
        const asked = (face) => face.files.filter((file) => (fixture.state.requests.get(new URL(served(file.url)).pathname) ?? 0) > 0).map((file) => file.weight)
        check(asked(heading).length > 0 && asked(body).includes(400), `and the browser asked the api for their files (${heading.family} ${asked(heading).join('/')}, ${body.family} ${asked(body).join('/')})`)
        await browser.open(`${origin}/a1-home`, scheme)
        const a1 = await browser.evaluate(`(${pageLook})(${JSON.stringify(KICKER)})`)
        check(a1.kicker === own.brand.accent_color, `an accent that already reads on the page is the accent itself, not taken darker (the roster's kicker: ${a1.kicker})`)
      }
    }

    await restyle(origin, fixture, { brand: { ...own.brand, ...BRIGHT_BRAND }, theme: null })
    html = await (await get(origin, '/')).text()
    const stylesheet = /<link rel="stylesheet" href="([^"]+)" media="print" onload="this\.media='all'">/.exec(html)?.[1]
    check(
      decode(stylesheet ?? '') === OWN_FACES_STYLESHEET &&
        /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/.test(html) &&
        /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin(="")?>/.test(html) &&
        !/@font-face|--site-font-/.test(html),
      "a site with no saved theme keeps the template's own faces, linked as before: Fraunces and Public Sans from Google Fonts",
    )
    for (const scheme of ['light', 'dark']) {
      await browser.open(`${origin}/`, scheme)
      const home = await browser.evaluate(`(${pageLook})(null)`)
      check(
        home.header?.opaque && home.header.ratio >= 4.5,
        `bright accent ${BRIGHT_BRAND.accent_color} on gray, ${scheme}: the header button's label reads on its fill (${home.header?.label}: ${home.header?.ink} on ${home.header?.fill}, ${home.header?.ratio.toFixed(2)}:1)`,
      )
      if (scheme === 'light') check(face(home.heading) === 'Fraunces' && face(home.body) === 'Public Sans', `headings and text wear the template's faces (${face(home.heading)}, ${face(home.body)})`)
      if (scheme === 'dark') {
        check(home.header.fill === BRIGHT_BRAND.accent_color, `dark: the main call's fill is the accent itself, which already holds 3:1 on the page (${home.header.fill})`)
        await browser.open(`${origin}/a1-home`, scheme)
        const a1 = await browser.evaluate(`(${pageLook})(${JSON.stringify(KICKER)})`)
        check(a1.kicker === BRIGHT_BRAND.accent_color, `dark: an accent that already reads is the kicker's colour as it is, never lightened past it (${a1.kicker})`)
      }
    }
  } finally {
    await browser.close()
    await restyle(origin, fixture, own)
    await (await get(origin, '/')).text()
  }
}

/**
 * Every non-chrome block type has a component of its own in the template (the
 * starter: every non-chrome, non-compliance one, except TEMPLATE_SECTION_TYPES,
 * which a template on the kit draws and the starter leaves to DefaultSection).
 * A template on the kit draws the compliance modules for their frame (heading
 * and card around BackGold's own frame), all but SocialFrame, which has no
 * frame a site can place. A block the api projects only inside an area
 * (areaBlocks) counts with its area role.
 */
function checkSectionsMap(chromeBlocks, areaBlocks, templateSections) {
  const blocks = { ...chromeBlocks, ...areaBlocks }
  // A template on the kit draws the kit's sections map (its own layouts add keys of the form 'Type:layout', never a type).
  const own = join(TEMPLATE, 'src/components/sections/index.ts')
  const source = readFileSync(existsSync(own) ? own : join(ROOT, 'packages/template-kit/src/components/sections/index.ts'), 'utf8')
  const body = /export const sections = \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
  const keys = new Set([...body.matchAll(/^\s*([A-Za-z]+)\s*(?::|,)/gm)].map((m) => m[1]))
  const unframed = ['SocialFrame']
  const delegated = ON_KIT ? new Set() : templateSections
  const missing = Object.entries(blocks)
    .filter(([type, spec]) => spec.role !== 'chrome' && (ON_KIT || spec.role !== 'compliance') && !unframed.includes(type) && !delegated.has(type) && !keys.has(type))
    .map(([type]) => type)
  const extra = [...keys].filter(
    (key) => !(key in blocks) || blocks[key].role === 'chrome' || unframed.includes(key) || (!ON_KIT && blocks[key].role === 'compliance'),
  )
  check(missing.length === 0, `the template has a section component for every presentational, data and compliance block${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`)
  check(extra.length === 0, `and none for a chrome block, SocialFrame, or a type BackGold does not have${extra.length ? ` (${extra.join(', ')})` : ''}`)
}

// ── petition-drive (begin) ───────────────────────────────────────────────────

/**
 * The stand-in the fixture serves for BackGold's petition frame
 * (`/embed/petition/<page>/<block>`): the api's frame draws the live map
 * band and the sign sheet, which the fixture has no map or petition for, so
 * this page says what would be there, wears the look the site asked for
 * (`look`, `look_dark` and the parent's `backgold:mode`, as the api's frame
 * does) and reports its height.
 */
function petitionStubFrame(search) {
  const params = new URLSearchParams(search)
  const set = (value) => {
    const parts = (value ?? '').split('.')
    return parts.length === 11 && parts.every((p) => /^[0-9a-f]{6}$/i.test(p)) ? parts.map((p) => `#${p}`) : null
  }
  const vars = (c) => `--ink:${c[0]};--muted:${c[1]};--accent:${c[2]};--line:${c[10]}`
  const light = set(params.get('look')) ?? ['#16191f', '#5b6170', '#8a5a00', '#1f3a5f', '#1f3a5f', '#ffffff', '#1f3a5f', '#ffffff', '#ffffff', '#d9d4ca', '#b9b2a5']
  const dark = set(params.get('look_dark'))
  const css =
    `:root{color-scheme:light dark;${vars(light)}}` +
    (dark ? `@media (prefers-color-scheme:dark){:root:not([data-mode="light"]){${vars(dark)}}}:root[data-mode="dark"]{${vars(dark)}}` : '') +
    'html,body{margin:0;background:transparent;font:15px/1.5 system-ui,sans-serif;color:var(--ink)}' +
    '.stub{box-sizing:border-box;margin:4px;padding:28px;min-height:420px;display:grid;align-content:center;gap:8px;border:1.5px dashed var(--line);border-radius:13px}' +
    '.stub b{color:var(--accent);font:600 11px/1.2 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}.stub p{margin:0;color:var(--muted)}'
  const script =
    "addEventListener('message',function(e){var d=e.data;if(d&&d.type==='backgold:mode'&&(d.mode==='light'||d.mode==='dark'))document.documentElement.setAttribute('data-mode',d.mode)});" +
    "function h(){parent.postMessage({type:'givegold:resize',height:document.querySelector('.stub').offsetHeight+8},'*')}addEventListener('load',h);h()"
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Petition (fixture stand-in)</title><style>${css}</style></head>` +
    `<body><div class="stub" data-petition-stub data-layout="${params.get('layout') === 'map' ? 'map' : 'other'}"><b>BackGold's petition frame</b>` +
    '<h2 style="margin:0">The live map band and the sign sheet draw here</h2>' +
    '<p>The legend, the count badge, the asks, Addressed to, the form, its goal meter and the three stat tiles are the api&rsquo;s frame. This is the e2e fixture&rsquo;s stand-in: it has no map.</p>' +
    `</div><script>${script}</script></body></html>`
  )
}

/**
 * The petition drive's one starter page as the Content API sends it: the
 * template.json starter sections, the Petition framed (the fixture's
 * stand-in, above), three of the fixture's events in the events list, typed
 * figures on the ticker; and its menus as BackGold projects the starter's.
 */
function petitionDriveFixture(fixture) {
  const manifest = JSON.parse(readFileSync(join(TEMPLATE, 'template.json'), 'utf8'))
  const home = fixture.data.page('home', fixture.state.headline)
  // Three of the fixture's upcoming events (none of them a fundraiser): one with registration closed.
  const events = fixture.data.events.upcoming.filter((e) => e.type !== 'fundraiser')
  const sections = manifest.starter.pages[0].sections.map((s) => {
    const section = { id: s.id, type: s.type, band: s.band, bleed: s.bleed, variant: s.variant, copy: s.copy, media: s.media, links: s.links, options: s.options ?? {} }
    if (s.data) section.data = s.data
    if (s.type === 'Petition') {
      // The api sends the asks and tiles inside the frame, not as rows a site draws.
      delete section.data
      section.embed = { iframe: `${fixture.origin}/embed/petition/lp_home/${s.id}`, script: 'https://secure.backgold.com/embed.js' }
    }
    if (s.type === 'EventsList') section.data = { source: 'events', items: events.slice(0, 3) }
    if (s.type === 'MovementTicker') {
      section.data = { source: 'movement', items: [{ value: '1,204', label: 'neighbors signed' }, { value: '38', label: 'mapping walks' }, { value: 'auto:signatures', label: 'signatures (live)' }] }
    }
    return section
  })
  let n = 0
  const item = (m) => ({
    id: `nav_pd_${++n}`,
    label: m.label,
    kind: m.kind,
    target: { kind: m.kind, page_id: 'lp_home', slug: 'home', anchor: m.target.anchor },
    url: `/#${m.target.anchor}`,
    external: false,
    header_button: m.header_button,
    shows_on: { rule: 'every_page' },
    children: [],
  })
  return {
    page: { ...home, sections, areas: { top_banner: [], sidebar: [], above_footer: [] } },
    menus: {
      primary: { menu: { key: 'primary' }, items: manifest.starter.menus.primary.map(item) },
      footer: { menu: { key: 'footer' }, items: manifest.starter.menus.footer.map(item) },
    },
  }
}

// ── unlabeled (begin) ──
/**
 * Unlabeled's site as its starter seeds it, put on the fixture for --serve:
 * every starter page at its slug (home at `/`), its sections as the Content
 * API sends them (BackGold's frames as the fixture's stand-in frame, the
 * fixture's upcoming events in the events lists, no typed ticker rows: the
 * live feed is BackGold's), the early-voting strip in Top banner on every page
 * but Donate and the newsletter band Above the footer, the starter's menus,
 * and her brand: white, black and white, no saved theme (so the template's
 * own faces load), pinned dark, her six socials and her legal line.
 */
function unlabeledFixture(fixture) {
  const manifest = JSON.parse(readFileSync(join(TEMPLATE, 'template.json'), 'utf8'))
  const { starter } = manifest
  const own = fixture.data.page
  const events = fixture.data.events.upcoming.filter((e) => e.type !== 'fundraiser')
  const FRAMED = new Set(['Petition', 'FormBlock', 'PollBlock', 'Donate', 'SignupCapture', 'Event'])
  const fill = (pageId) => (s) => {
    const section = { ...structuredClone(s), options: s.options ?? {} }
    if (FRAMED.has(s.type)) {
      if (s.type === 'Petition') delete section.data
      section.embed = { iframe: `${fixture.origin}/embed/petition/${pageId}/${s.id}`, script: 'https://secure.backgold.com/embed.js' }
    }
    if (s.type === 'EventsList') section.data = { source: 'events', items: s.options?.max ? events.slice(0, s.options.max) : events }
    if (s.type === 'Progress') section.data = { source: 'progress', items: [] }
    if (s.type === 'Collection') section.data = { source: 'newsletter', items: [] }
    if (s.type === 'Hero' && s.variant === 'cover') section.media = { imageUrl: { url: `${fixture.origin}/media/forum-crowd.svg`, alt: s.copy.imageAlt ?? '' } }
    return section
  }
  const area = (key, pageId) => {
    const r = starter.sections.find((x) => x.key === key)
    return { key: r.key, label: r.label, from: null, until: null, sections: r.document.map(fill(pageId)) }
  }
  const pages = new Map(
    starter.pages.map((p) => {
      const slug = p.slug || 'home'
      const id = `lp_unlabeled_${slug.replaceAll('-', '_')}`
      const home = own('home', fixture.state.headline)
      return [
        slug,
        {
          ...home,
          page: { ...home.page, id, slug, title: p.title, url: slug === 'home' ? '/' : `/${slug}`, is_home: slug === 'home', takes_donations: slug === 'donate', meta: { title: null, description: null, image_url: null } },
          sections: p.sections.map(fill(id)),
          areas: { top_banner: slug === 'donate' ? [] : [area('early-voting', id)], sidebar: [], above_footer: [area('the-newsletter', id)] },
        },
      ]
    }),
  )
  fixture.data.page = (slug, headline) => pages.get(slug) ?? own(slug, headline)
  fixture.data.pages = [
    ...fixture.data.pages.filter((p) => !pages.has(p.slug)),
    ...[...pages.values()].map(({ page }) => ({ id: page.id, slug: page.slug, title: page.title, url: page.url, is_home: page.is_home, published_at: '2026-10-20T14:00:00.000Z', updated_at: '2026-10-20T14:00:00.000Z', takes_donations: page.takes_donations })),
  ]
  let n = 0
  const menuItem = (item) => ({
    id: `nav_u${++n}`,
    label: item.label,
    kind: item.kind,
    target: { kind: item.kind, ...(item.target.slug !== undefined ? { slug: item.target.slug || 'home' } : {}) },
    url:
      item.kind === 'page' ? (item.target.slug ? `/${item.target.slug}` : '/')
      : item.kind === 'donate' ? '/donate'
      : item.kind === 'external' ? item.target.url.replace('https://unlabeledtexas.com', '')
      : item.kind === 'content_list' ? '/records'
      : null,
    external: false,
    header_button: item.header_button,
    shows_on: item.shows_on,
    children: item.children.map(menuItem),
  })
  fixture.data.menus = {
    ...fixture.data.menus,
    primary: { menu: { key: 'primary' }, items: starter.menus.primary.map(menuItem) },
    footer: { menu: { key: 'footer' }, items: starter.menus.footer.map(menuItem) },
    utility: { menu: { key: 'utility' }, items: [] },
  }
  fixture.data.site = {
    ...fixture.data.site,
    name: 'Unlabeled',
    domain: 'unlabeledtexas.com',
    style: JSON.stringify({ appearance: 'dark', density: 'compact', radiusPx: 0 }),
    theme: null,
    brand: { ...fixture.data.site.brand, logo_url: null, primary_color: '#ffffff', secondary_color: '#000000', accent_color: '#ffffff' },
    seo: { ...fixture.data.site.seo, description: 'No red. No blue. Just Texans.' },
    social: ['instagram', 'youtube', 'linkedin', 'facebook', 'tiktok', 'discord'].map((platform) => ({ platform, url: `https://${platform}.com/unlabeledtexas` })),
  }
  fixture.data.legal = { disclaimer: 'Contributions or gifts to Unlabeled are not deductible as charitable contributions for federal income tax purposes.', required: true }
}
// ── unlabeled (end) ──

/**
 * The petition drive's starter page on the Worker, in a headless Chrome:
 * the order of its bands, the framed petition, no money anywhere, the header
 * button, the three anchors, dark on first open whatever the visitor's
 * system says, light after the switch and still readable, and no sideways
 * scroll on a phone. The fixture's home and menus are put back after, and
 * home read once under them, as Lighthouse expects to find it.
 */
async function checkPetitionDrive(origin, fixture, chrome) {
  log('\nPetition drive: the starter page (headless Chrome, dark first, light after the switch)')
  const own = { page: fixture.data.page, menus: fixture.data.menus }
  const drive = petitionDriveFixture(fixture)
  const publish = async () => {
    const version = fixture.bump(fixture.state.headline)
    const hook = await signedWebhook(origin, version, WEBHOOK_SECRET)
    if (hook.status !== 204) throw new Error(`the webhook for content version ${version} answered ${hook.status}`)
  }
  fixture.data.page = (slug, headline) => (slug === 'home' ? drive.page : own.page(slug, headline))
  fixture.data.menus = { ...own.menus, ...drive.menus }
  await publish()
  const browser = await headlessChrome(chrome)
  try {
    const res = await get(origin, '/')
    const html = await res.text()
    check(res.status === 200, `the drive's home renders (got ${res.status})`)
    const types = [...html.matchAll(/<section\b[^>]*data-type="([A-Za-z]+)"/g)].map((m) => m[1])
    check(
      types.join(' ') === 'Petition Issues EventsList MovementTicker Cta',
      `its bands run Petition, Issues, EventsList, MovementTicker, Cta (${types.join(', ')})`,
    )
    check(/<html lang="en" data-gg-opens="dark">/.test(html) && /<style>:root\{color-scheme:dark;/.test(html), 'the page opens in the dark set (data-gg-opens, the dark set on :root)')
    const frame = tags(html, 'iframe').find((t) => t.includes('/embed/petition/')) ?? ''
    check(
      /src="[^"]+\/embed\/petition\/lp_home\/Petition-home\?layout=map&amp;look=[0-9a-f.]+&amp;look_dark=[0-9a-f.]+&amp;radius=12&amp;font=inter"/.test(frame),
      "the Petition section frames BackGold's petition in its map layout, wearing the site's look in the drive's face (font=inter)",
    )
    check(/<section id="petition"[^>]*data-type="Petition"[^>]*data-band="plain"/.test(html), 'the Petition section is anchored at #petition, on the page (plain)')
    check(
      /<section id="get-involved"[^>]*data-type="Issues"/.test(html) && /<section id="events"[^>]*data-type="EventsList"/.test(html),
      'Get involved and the events are anchored at #get-involved and #events',
    )
    const button = /<a\b[^>]*class="[^"]*header-button[^"]*"[^>]*>[\s\S]*?<\/a>/.exec(html)?.[0] ?? ''
    check(/href="\/#petition"/.test(button) && />\s*Sign the petition\s*</.test(button), `the header button is Sign the petition, to #petition (${button.replace(/\s+/g, ' ').slice(0, 160)})`)
    const nav = /<nav class="header-bar-menu"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''
    check(['/#petition', '/#get-involved', '/#events'].every((href) => nav.includes(`href="${href}"`)), 'the header menu links The petition, Get involved and Events to their anchors')
    const visible = html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '')
    check(
      !/data-bg-donate|\/donate\b|>\s*Donate\s*<|chip in/i.test(visible) && !/donate-strip/.test(visible),
      'nothing on the page asks for money (no Donate link, button or strip)',
    )
    const steps = /<section\b[^>]*data-type="Issues"[\s\S]*?<\/section>/.exec(html)?.[0] ?? ''
    check((steps.match(/<li class="drive-step"/g) ?? []).length === 4 && /Step 01/.test(steps) && /<path d="M9\.663/.test(steps), 'Get involved draws four numbered steps, each with its icon')
    check(
      /<a class="button"[^>]*href="https:\/\/maps\.deflock\.org"/.test(steps) && (steps.match(/<a class="button button-quiet"/g) ?? []).length === 2,
      'and one filled action (the global map) beside two outlined ones',
    )
    check(!html.includes('auto:signatures') && html.includes('1,204'), "the ticker shows its typed figures and leaves the live one out")
    const eventsBand = /<section\b[^>]*data-type="EventsList"[\s\S]*?<\/section>/.exec(html)?.[0] ?? ''
    check(
      (eventsBand.match(/<li class="drive-event"/g) ?? []).length === 3 && />RSVP<span/.test(eventsBand) && />Details<span/.test(eventsBand),
      'Show up in person lists three events, each with its button to its page (RSVP, or Details once closed)',
    )

    for (const scheme of ['light', 'dark']) {
      await browser.width(1440)
      await browser.open(`${origin}/`, scheme)
      const look = await browser.evaluate(`(${driveLook})()`)
      check(look.mode === 'dark' && look.page < 0.06, `a visitor whose system is ${scheme} opens the page dark (data-gg-mode ${look.mode}, page luminance ${look.page.toFixed(3)})`)
      check(look.bands.length === 5 && look.bands.every((b) => b.ground < 0.06), `every band is dark, none a light slab (${look.bands.map((b) => `${b.type} ${b.ground.toFixed(3)}`).join(', ')})`)
      check(look.minRatio >= 4.5, `every heading, lede and step reads at AA on its band in the dark set (lowest ${look.minRatio.toFixed(2)}: ${look.worst})`)
      check(look.anchors.every((a) => a.found), `the three anchors reach their sections (${look.anchors.map((a) => `${a.href}${a.found ? '' : ' missing'}`).join(', ')})`)
    }
    await browser.evaluate(`document.querySelector('[data-mode-toggle]').click()`)
    const light = await browser.evaluate(`(${driveLook})()`)
    check(light.mode === 'light' && light.page > 0.5, `the switch turns it light (data-gg-mode ${light.mode}, page luminance ${light.page.toFixed(3)})`)
    check(light.minRatio >= 4.5, `and light mode still reads at AA (lowest ${light.minRatio.toFixed(2)}: ${light.worst})`)
    await browser.width(375)
    await browser.open(`${origin}/`, 'light')
    const phone = await browser.evaluate('({ scroll: document.documentElement.scrollWidth, width: innerWidth })')
    check(phone.scroll <= phone.width, `no sideways scroll at 375 (${phone.scroll} wide in ${phone.width})`)
  } finally {
    await browser.close()
    fixture.data.page = own.page
    fixture.data.menus = own.menus
    await publish()
    await (await get(origin, '/')).text()
  }
}

/** In the page: its mode, the page ground's luminance, the lowest text contrast on the starter's bands, and whether each header anchor has its target. */
async function driveLook() {
  await document.fonts.ready
  const channels = (value) => {
    const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value)
    return m ? { rgb: [m[1], m[2], m[3]].map(Number), alpha: m[4] === undefined ? 1 : Number(m[4]) } : null
  }
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  /** The first opaque ground behind `el`. */
  const ground = (el) => {
    for (let node = el; node; node = node.parentElement) {
      const c = channels(getComputedStyle(node).backgroundColor)
      if (c && c.alpha === 1) return c.rgb
    }
    return [255, 255, 255]
  }
  let minRatio = 21
  let worst = ''
  for (const el of document.querySelectorAll('main h2, main h3, main .kicker, main .lede p, main .drive-step-body p, main .drive-ticker-name, main .drive-event-meta, footer .disclaimer p')) {
    const ink = channels(getComputedStyle(el).color)
    if (!ink) continue
    const [hi, lo] = [luminance(ink.rgb), luminance(ground(el))].sort((a, b) => b - a)
    const ratio = (hi + 0.05) / (lo + 0.05)
    if (ratio < minRatio) {
      minRatio = ratio
      worst = `${el.tagName.toLowerCase()}.${el.className || ''} "${el.textContent.trim().slice(0, 40)}"`
    }
  }
  const anchors = [...document.querySelectorAll('.header-bar-menu a[href^="/#"]')].map((a) => {
    const id = a.getAttribute('href').slice(2)
    return { href: `#${id}`, found: !!document.getElementById(id) }
  })
  const bands = [...document.querySelectorAll('main section.bg-section')].map((el) => ({ type: el.dataset.type, ground: luminance(ground(el)) }))
  return { mode: document.documentElement.getAttribute('data-gg-mode'), page: luminance(ground(document.body)), minRatio, worst, anchors, bands }
}

// ── petition-drive (end) ─────────────────────────────────────────────────────

// ── The nonprofit template (--template nonprofit) ────────────────────────────
//
// Its starter pages (templates/nonprofit/template.json) as the fixture serves
// them, with what BackGold fills put in: volunteer shifts over the next three
// weeks with their live counts (spots taken and left), the team, the
// membership program's tiers, the shares of the Financials figures, the
// module frames, photos for the heroes and the closing call, and the
// reusable sections the starter's rules place (the newsletter band above the
// footer on every page but Donate; the drive banner and the sidebar card,
// which a site turns on, on home and Events). The checks read them at
// /nonprofit-<slug> (/nonprofit-home for home); --serve puts them at their
// own addresses with the starter's menus and the boards' brand (Kettle
// blue, Paper, Persimmon; NONPROFIT_BRAND, a JSON { primary_color,
// secondary_color, accent_color }, replaces it), so the site looks like a new
// nonprofit site (boards N1 to N12). Then the checks for the template's own
// layouts and its middleware, in the HTML.

const NONPROFIT = TEMPLATE_NAME === 'nonprofit'

/** The address a nonprofit starter page is served at: its own under --serve, else /nonprofit-<slug>. */
const nonprofitSlug = (slug) => (SERVE ? slug || 'home' : `nonprofit-${slug || 'home'}`)

/** A volunteer shift `days` from now at `hour` UTC, with its live counts. */
function nonprofitShifts() {
  const at = (days, hour) => {
    const d = new Date()
    d.setUTCHours(hour, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString()
  }
  const shift = (id, title, days, hour, location, going, seatsLeft, extra = {}) => ({
    row: { id, title, starts_at: at(days, hour), ends_at: null, timezone: 'America/Chicago', location, is_virtual: false, type: 'volunteer_shift', registration_closed: false, sells_tickets: false, tickets_url: null, url: `https://events.example.org/${id}`, ...extra },
    live: { going, seats_left: seatsLeft },
  })
  return [
    shift('evt_np1', 'Sort and pack for the Saturday market', 2, 14, 'The market lot', 6, 4),
    shift('evt_np2', 'Garden day', 3, 15, 'The community garden', 3, 5),
    shift('evt_np3', 'Homework club tutor', 4, 21, 'The branch library', 3, 1),
    shift('evt_np4', 'Tool library check-in desk', 9, 23, 'The tool library', 2, 0, { registration_closed: true }),
    shift('evt_np5', 'Sort and pack for the Saturday market', 16, 14, 'The market lot', 2, 8),
  ]
}

/** The membership program's three tiers, as BackGold bakes them. */
const NONPROFIT_MEMBERSHIP = ['Neighbor', 'Regular', 'Keeper'].map((name, i) => ({
  model: 'tiered', name, monthly_cents: null, annual_cents: [2500, 6000, 12000][i], lifetime_cents: null, onetime_cents: null, symbolic: false,
  benefits: ['The newsletter, first', 'A vote at the annual meeting', 'Our thanks, in person'],
}))

/** `data` with the nonprofit's starter pages added (only on --template nonprofit). */
function withNonprofit(data, ex) {
  if (!NONPROFIT) return data
  const { starter } = JSON.parse(readFileSync(join(TEMPLATE, 'template.json'), 'utf8'))
  const donateEmbed = ex.PageResponse.sections.find((s) => s.type === 'Donate').embed
  const signupEmbed = ex.PageResponse.areas.above_footer[0].sections[0].embed
  const shifts = nonprofitShifts()
  const photo = (name, alt) => ({ url: `https://api.backgold.com/api/media-files/med_${name}`, alt })
  const team = [
    { group: 'exec', name: 'Odessa Plume', role: 'Director', bio: 'Started the market with a folding table.', image_url: null, link_url: null },
    { group: 'staff', name: 'Tobias Wren', role: 'Volunteer coordinator', dept: 'Programs', image_url: null, link_url: null },
    { group: 'staff', name: 'Hester Quill', role: 'Garden lead', dept: 'Programs', image_url: null, link_url: null },
    { group: 'open', role: 'Board seat', dept: 'Board', blurb: 'One seat opens each spring. Tell us why you would like it.', link_url: '/contact' },
  ]
  const fill = (pageId) => (section) => {
    const s = { options: {}, ...structuredClone(section) }
    if (s.type === 'EventsList') {
      const rows = [...shifts.map((x) => x.row), ...(s.variant === 'agenda' ? data.events.upcoming : [])]
      s.data = { source: 'events', items: s.options.max ? rows.slice(0, s.options.max) : rows }
    }
    if (s.type === 'Hero' && (s.variant === 'overlap' || s.variant === 'split')) s.media = { photoUrl: photo('market', 'Volunteers at the Saturday market') }
    if (s.type === 'Hero' && s.copy.caption === undefined && s.variant === 'overlap') s.copy = { ...s.copy, caption: 'Photo: the Saturday market', imageAlt: 'Volunteers at the Saturday market' }
    if (s.type === 'Cta' && s.variant === 'photo') s.media = { photoUrl: photo('potluck', 'The fall potluck') }
    if (s.type === 'TeamGrid') s.data = { source: 'team', items: team }
    if (s.type === 'Financials') s.data = { ...s.data, items: s.data.items.map((row, i) => ({ ...row, share: [78, 14, 8][i] })) }
    if (s.type === 'Donate') s.embed = donateEmbed
    if (s.type === 'Membership') s.data = { source: 'membership', items: NONPROFIT_MEMBERSHIP }
    if (s.type === 'FormBlock') s.embed = { iframe: `https://api.backgold.com/f/${pageId}/${s.id}`, script: 'https://secure.backgold.com/embed.js' }
    if (s.type === 'SignupCapture') s.embed = { ...signupEmbed, iframe: signupEmbed.iframe.replace(/[^/]+$/, s.id) }
    return s
  }
  const reusable = (key, pageId) => {
    const r = starter.sections.find((x) => x.key === key)
    return { key: r.key, label: r.label, from: null, until: null, sections: r.document.map(fill(pageId)) }
  }
  const pages = starter.pages.map((p) => {
    const slug = nonprofitSlug(p.slug)
    const id = `lp_nonprofit_${p.slug || 'home'}`
    const url = slug === 'home' ? '/' : `/${slug}`
    return {
      summary: { id, slug, title: p.title, url, is_home: slug === 'home', published_at: '2026-10-20T14:00:00.000Z', updated_at: '2026-10-20T14:00:00.000Z', takes_donations: true },
      response: {
        page: { ...ex.PageResponse.page, id, slug, title: p.title, url, is_home: slug === 'home', takes_donations: true, meta: { title: null, description: null, image_url: null } },
        sections: p.sections.map(fill(id)),
        areas: {
          top_banner: p.slug === '' ? [reusable('drive-banner', id)] : [],
          sidebar: p.slug === 'events' ? [reusable('sidebar-card', id)] : [],
          above_footer: p.slug === 'donate' ? [] : [reusable('the-newsletter', id)],
        },
        legal: data.legal,
      },
    }
  })
  const bySlug = new Map(pages.map((p) => [p.summary.slug, p.response]))
  const out = {
    ...data,
    pages: [...data.pages.filter((p) => !bySlug.has(p.slug)), ...pages.map((p) => p.summary)],
    page: (slug, headline) => bySlug.get(slug) ?? data.page(slug, headline),
    events: { ...data.events, live: { ...data.events.live, ...Object.fromEntries(shifts.map((x) => [x.row.id, x.live])) } },
  }
  if (!SERVE) return out
  // --serve: the starter's menus, the newsletter band on the posts, and the boards' brand with no saved theme.
  let n = 0
  const menuItem = (item) => ({
    id: `nav_n${++n}`,
    label: item.label,
    kind: item.kind,
    target: { kind: item.kind, ...(item.target.slug !== undefined ? { slug: item.target.slug || 'home' } : {}) },
    url: item.kind === 'page' ? (item.target.slug ? `/${item.target.slug}` : '/') : item.kind === 'blog' ? `/${data.types.find((t) => t.key === 'post').url_base}` : item.kind === 'donate' ? '/donate' : null,
    external: false,
    header_button: item.header_button,
    shows_on: item.shows_on,
    children: item.children.map(menuItem),
  })
  const brand = { primary_color: '#2d4fd6', secondary_color: '#fff3d6', accent_color: '#ff6b4a', ...(process.env.NONPROFIT_BRAND ? JSON.parse(process.env.NONPROFIT_BRAND) : {}) }
  return {
    ...out,
    site: { ...out.site, name: 'Kettle Commons', brand: { ...out.site.brand, logo_url: null, ...brand }, theme: null },
    menus: {
      ...out.menus,
      primary: { menu: { key: 'primary' }, items: starter.menus.primary.map(menuItem) },
      footer: { menu: { key: 'footer' }, items: starter.menus.footer.map(menuItem) },
    },
    entryAreas: { top_banner: [], sidebar: [], above_footer: [reusable('the-newsletter', 'lp_nonprofit_news')] },
  }
}

/** The template's own layouts and its middleware, in the HTML of its starter pages. */
async function checkNonprofit(origin) {
  log('\nNonprofit: its own layouts (programs, shifts, cards, doors, split, team, form), the marked words and the sprite')
  const at = (slug) => `/${nonprofitSlug(slug)}`
  let res = await get(origin, at(''))
  let html = await res.text()
  check(res.status === 200 && html.split('class="np-sprite"').length === 2 && /<body[^>]*><svg class="np-sprite"/.test(html), 'home carries the doodle sprite once, right after <body>')
  check(
    /<h1[^>]*>Everyone eats\. Everyone <span class="np-mark"><span class="np-mark-word">helps<\/span><svg class="np-mark-u"/.test(html) && !/\*helps\*/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')),
    "the hero's starred word is marked, and its asterisks are gone from the page",
  )
  const shifts = sectionsOf(html).find((s) => s.type === 'EventsList')?.html ?? ''
  check(
    (shifts.match(/class="np-shift np-card"/g) ?? []).length === 3 && !shifts.includes('np-week-head') && (shifts.match(/class="np-live" data-bg-live="evt_np\d"/g) ?? []).length === 3 && shifts.includes('>RSVP<') && !shifts.includes('Sign up for this shift'),
    "home's EventsList · shifts draws its three rows in one run, each with its live slot and the events' own RSVP",
  )
  const programs = sectionsOf(html).find((s) => s.type === 'Issues')?.html ?? ''
  check((programs.match(/<use href="#d-(sprout|book|wrench)">/g) ?? []).length === 3 && (programs.match(/class="np-when"/g) ?? []).length === 3, "home's Issues · cards draws each row's icon as a doodle and its note")
  res = await get(origin, at('programs'))
  html = await res.text()
  const services = sectionsOf(html).find((s) => s.type === 'Services')?.html ?? ''
  check(
    /data-variant="programs"/.test(services) && (services.match(/class="np-program np-card"/g) ?? []).length === 4 && (services.match(/<dt>/g) ?? []).length === 12 && !/featured/.test(services),
    'Programs draws Services · programs: four cards, For / When / Where each, nothing featured',
  )
  const doors = sectionsOf(html).find((s) => s.type === 'Pathways')?.html ?? ''
  check((doors.match(/class="door door-linked"/g) ?? []).length === 3 && doors.includes('<use href="#d-heart">'), 'Pathways · doors draws three linked doors with their icons')
  res = await get(origin, at('get-involved'))
  html = await res.text()
  const weeks = sectionsOf(html).find((s) => s.type === 'EventsList')?.html ?? ''
  check(res.status === 200 && (weeks.match(/class="np-week-head"/g) ?? []).length >= 2 && /<span class="np-week-name">Week of [A-Z][a-z]{2} \d{1,2}<\/span><small>/.test(weeks), 'Get involved groups its shifts by week under "Week of …" with the dates')
  check(weeks.includes('>Details<') && weeks.includes('Registration closed'), 'a shift whose registration closed offers Details and says so')
  const form = sectionsOf(html).find((s) => s.type === 'FormBlock')?.html ?? ''
  check(/class="np-form-words"/.test(form) && /<h2>Tell us, and we’ll find you a <span class="np-mark">/.test(form) && /title="Tell us, and we’ll find you a spot"/.test(form), 'FormBlock · wide draws its intro column beside the form, the frame titled without the asterisks')
  res = await get(origin, at('about'))
  html = await res.text()
  const team = sectionsOf(html).find((s) => s.type === 'TeamGrid')?.html ?? ''
  check((team.match(/class="np-person np-card"/g) ?? []).length === 3 && (team.match(/np-person-initials/g) ?? []).length === 3 && (team.match(/class="np-open-role"/g) ?? []).length === 1, 'TeamGrid · grid draws the people as cards with their initials, and the open seat as an invitation')
  res = await get(origin, at('programs'))
  html = await res.text()
  check(/<p class="kicker">Programs<\/p>\s*<h1 class="split-headline"/.test(html.replace(/ data-astro-cid-[a-z0-9]+(="[^"]*")?/g, '')), 'Hero · split draws its kicker over the headline')
  res = await get(origin, at('donate'))
  html = await res.text()
  check(res.status === 200 && !html.includes('data-type="SignupCapture"'), 'Donate carries no newsletter band, by its rule')
  res = await get(origin, '/blog')
  html = await res.text()
  check(res.status === 200 && html.includes('class="np-post-lead"') && /class="np-lead-photo np-post-photo/.test(html) && /class="np-post-card np-card"/.test(html), "the post list is the template's own: the lead framed, the rest pen-outlined cards")
  const postHref = /<h2 class="np-post-lead-title"><a href="([^"]+)"/.exec(html)?.[1]
  res = await get(origin, postHref ?? '/blog/none')
  html = await res.text()
  check(res.status === 200 && html.includes('np-article') && /class="share np-share"/.test(html) && /<a class="button button-quiet button-small" href="mailto:/.test(html), "a post is the template's own article: Share as outline stickers")
  res = await get(origin, '/_backgold/frame.css')
  const frameCss = await res.text()
  check(
    res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('text/css') && res.headers.get('access-control-allow-origin') === '*' && frameCss.includes(':root[data-bg-look]'),
    "/_backgold/frame.css serves the frames' stylesheet to any origin",
  )
}

// ── The candidate template (--template candidate) ────────────────────────────
//
// Its starter pages (templates/candidate/template.json) as the fixture serves
// them, with what BackGold fills put in: the Countdown's deadline (26 days, 9
// hours and 41 minutes after the run starts, board C1's), the events, the
// module frames, a portrait, and the reusable sections the starter's rules
// place (Get the campaign letter above the footer, Campaign sidebar beside
// Events). The checks read them at /candidate-<slug> (/candidate-home for
// home), next to the organization the other checks read; --serve puts them
// at their own addresses instead, with the starter's menus, so the site looks
// like a new candidate site (boards C1 to C11). Then the look checks for the
// template's own layouts: Hero · portrait, Countdown · tiles and inline, and
// its QuoteStrip · wall, then what template.css and the starter add to the
// kit's (the heads' All events and All endorsements, the editorial quote, the
// sidebar's cards apart, Join's centred card), in a headless Chrome at 1440
// and 375, light and dark.

const CANDIDATE = TEMPLATE_NAME === 'candidate'
const CANDIDATE_DEADLINE = new Date(Date.now() + ((26 * 24 + 9) * 60 + 41) * 60000 + 30000).toISOString()

/** The candidate's membership program as BackGold bakes it: one plan, by the year. */
const CANDIDATE_MEMBERSHIP = { model: 'single', name: null, monthly_cents: null, annual_cents: 2500, lifetime_cents: null, onetime_cents: null, symbolic: false, benefits: ['Events before anyone else hears', 'A yard sign, if you want one'] }

/** The address a candidate starter page is served at: its own under --serve, else /candidate-<slug>. */
const candidateSlug = (slug) => (SERVE ? slug || 'home' : `candidate-${slug || 'home'}`)

/** `data` with the candidate's starter pages added (only on --template candidate). */
function withCandidate(data, ex) {
  if (!CANDIDATE) return data
  const starter = JSON.parse(readFileSync(join(TEMPLATE, 'template.json'), 'utf8')).starter
  const donateEmbed = ex.PageResponse.sections.find((s) => s.type === 'Donate').embed
  const signupEmbed = ex.PageResponse.areas.above_footer[0].sections[0].embed
  const portrait = { url: 'https://api.backgold.com/api/media-files/med_portrait', alt: 'The candidate on a door-knock' }
  const fill = (pageId) => (section) => {
    const s = { options: {}, ...structuredClone(section) }
    if (s.type === 'Countdown') s.data = { source: 'countdown', items: [{ deadline: CANDIDATE_DEADLINE }] }
    if (s.type === 'EventsList') s.data = { source: 'events', items: s.options.max ? data.events.upcoming.slice(0, s.options.max) : data.events.upcoming }
    if (s.type === 'Blog') s.data = { source: 'blog', items: [] }
    if (s.type === 'Hero' && (s.variant === 'portrait' || s.variant === 'split')) s.media = { photoUrl: portrait }
    // What an author adds to the starter's home, as board C1 has it: the Countdown's eyebrow, body line and link, the
    // portrait's caption and alt text; the sidebar's Countdown keeps its heading as the kicker and gains C5's link.
    if (s.id === 'Countdown-home') {
      s.copy = { ...s.copy, eyebrow: 'Election Day', body: 'Early voting runs October 19 to 31 at every county clerk’s office.', linkText: 'Find where to vote' }
      s.links = [{ label: 'Find where to vote', target: { kind: 'external' }, url: 'https://vote.example.gov/polling-places' }]
    }
    if (s.id === 'Countdown-campaign-sidebar') s.links = [{ label: 'Find where to vote', target: { kind: 'external' }, url: 'https://vote.example.gov/polling-places' }]
    if (s.id === 'Hero-home') s.copy = { ...s.copy, caption: 'Photo: the candidate at the county fair', imageAlt: 'The candidate at the county fair' }
    if (s.id === 'Hero-about') s.copy = { ...s.copy, caption: 'Photo: the candidate at home' }
    if (s.type === 'Donate') s.embed = donateEmbed
    if (s.type === 'Membership') s.data = { source: 'membership', items: [CANDIDATE_MEMBERSHIP] }
    if (s.type === 'FormBlock') s.embed = { iframe: `https://api.backgold.com/f/${pageId}/${s.id}`, script: 'https://secure.backgold.com/embed.js' }
    if (s.type === 'SignupCapture') s.embed = { ...signupEmbed, iframe: signupEmbed.iframe.replace(/[^/]+$/, s.id) }
    return s
  }
  const reusable = (key, pageId) => {
    const r = starter.sections.find((x) => x.key === key)
    return { key: r.key, label: r.label, from: null, until: null, sections: r.document.map(fill(pageId)) }
  }
  // Endorsements as board C4 groups them: the starter's wall, then two more walls on its ground, each a group under its heading.
  const wallOf = (id, heading, items) => ({ id, type: 'QuoteStrip', band: 'plain', bleed: 'full', variant: 'wall', copy: { heading }, media: {}, links: [], options: {}, data: { source: 'quotes', items } })
  const moreWalls = [
    wallOf('QuoteStrip-elected', 'Elected officials', ['A mayor', 'A county commissioner', 'A city council member', 'A school board chair'].map((attribution) => ({ attribution, role: 'Their office' }))),
    wallOf('QuoteStrip-neighbors', 'Neighbors', [
      { quote: 'A neighbor who said something can have it here.', attribution: 'A neighbor', role: 'Their town' },
      ...['A second neighbor', 'A third neighbor', 'A fourth neighbor', 'A fifth neighbor', 'A sixth neighbor'].map((attribution) => ({ attribution, role: 'Their town' })),
    ]),
  ]
  const withWalls = (sections) => sections.flatMap((s) => (s.type === 'QuoteStrip' && s.variant === 'wall' ? [s, ...moreWalls] : [s]))
  const pages = starter.pages.map((p) => {
    const slug = candidateSlug(p.slug)
    const id = `lp_candidate_${p.slug || 'home'}`
    return {
      summary: { id, slug, title: p.title, url: slug === 'home' ? '/' : `/${slug}`, is_home: slug === 'home', published_at: '2026-10-13T14:00:00.000Z', updated_at: '2026-10-13T14:00:00.000Z', takes_donations: true },
      response: {
        page: { ...ex.PageResponse.page, id, slug, title: p.title, url: slug === 'home' ? '/' : `/${slug}`, is_home: slug === 'home', takes_donations: true, meta: { title: null, description: null, image_url: null } },
        sections: withWalls(p.sections.map(fill(id))),
        areas: {
          top_banner: [],
          sidebar: p.slug === 'events' ? [reusable('campaign-sidebar', id)] : [],
          above_footer: [reusable('get-the-campaign-letter', id)],
        },
        legal: data.legal,
      },
    }
  })
  const bySlug = new Map(pages.map((p) => [p.summary.slug, p.response]))
  const page = data.page
  // C10 and C11's terms: the posts filed under categories the organization
  // orders by position, not by label, one post also under the featured Press
  // releases; and an entry's Sidebar ends with More from the campaign.
  const categories = {
    taxonomy: { key: 'category', label: 'Categories', hierarchical: false },
    terms: ['On the road', 'Schools', 'Endorsements', 'Press releases'].map((label, position) => ({
      id: `term_c${position}`, slug: label.toLowerCase().replaceAll(' ', '-'), label, parent_id: null, position,
    })),
  }
  const category = (slug) => ({ taxonomy: 'category', slug, label: categories.terms.find((t) => t.slug === slug).label })
  const filed = { 'levy-explained': [category('schools')], 'open-books': [category('endorsements'), category('press-releases')] }
  const file = (entry) => (filed[entry.slug] ? { ...entry, terms: [...entry.terms, ...filed[entry.slug]] } : entry)
  const out = {
    ...data,
    pages: [...data.pages.filter((p) => !bySlug.has(p.slug)), ...pages.map((p) => p.summary)],
    page: (slug, headline) => bySlug.get(slug) ?? page(slug, headline),
    entries: { ...data.entries, post: data.entries.post.map(file) },
    entry: { ...data.entry, post: Object.fromEntries(Object.entries(data.entry.post).map(([slug, entry]) => [slug, file(entry)])) },
    terms: { ...data.terms, category: categories },
    entryAreas: { ...data.entryAreas, sidebar: [...data.entryAreas.sidebar, reusable('more-from-the-campaign', 'lp_candidate_news')] },
  }
  if (!SERVE) return out
  // --serve: the starter's menus, the reusable sections on the posts, the
  // boards' brand with no saved theme, and no custom type at /endorsements
  // (the starter page is there).
  let n = 0
  const menuItem = (item) => ({
    id: `nav_c${++n}`,
    label: item.label,
    kind: item.kind,
    target: { kind: item.kind, ...(item.target.slug !== undefined ? { slug: item.target.slug || 'home' } : {}) },
    url: item.kind === 'page' ? (item.target.slug ? `/${item.target.slug}` : '/') : item.kind === 'blog' ? `/${data.types.find((t) => t.key === 'post').url_base}` : item.kind === 'donate' ? '/donate' : null,
    external: false,
    header_button: item.header_button,
    shows_on: item.shows_on,
    children: item.children.map(menuItem),
  })
  // The news list's intro as the seed writes one (C10): its Hero, the name and the subhead, and nothing else.
  const intro = {
    page: { ...ex.PageResponse.page, id: 'lp_news', slug: 'news', title: 'News', url: '/news', is_home: false, meta: { title: null, description: null, image_url: null } },
    sections: [
      {
        id: 'Hero-news', type: 'Hero', band: 'plain', bleed: 'full', variant: 'statement',
        copy: { headline: 'News', subheadline: 'Updates from Your campaign, newest first.' },
        media: {}, links: [], options: {},
      },
    ],
    areas: { top_banner: [], sidebar: [], above_footer: [] },
    legal: data.legal,
  }
  return {
    ...out,
    page: (slug, headline) => (slug === 'news' ? intro : out.page(slug, headline)),
    // The boards' brand (spruce, marigold, chalk) and no saved theme, so the template's own faces draw.
    site: { ...out.site, name: 'Your campaign', brand: { ...out.site.brand, logo_url: null, primary_color: '#123d38', secondary_color: '#f4f2ea', accent_color: '#f2b233' }, theme: null },
    types: out.types.filter((t) => t.url_base !== 'endorsements'),
    menus: {
      ...out.menus,
      primary: { menu: { key: 'primary' }, items: starter.menus.primary.map(menuItem) },
      footer: { menu: { key: 'footer' }, items: starter.menus.footer.map(menuItem) },
    },
    entryAreas: {
      top_banner: [],
      sidebar: [reusable('campaign-sidebar', 'lp_candidate_news'), reusable('more-from-the-campaign', 'lp_candidate_news')],
      above_footer: [reusable('get-the-campaign-letter', 'lp_candidate_news')],
    },
  }
}

/** The template's own layouts: present in the HTML, then in Chrome at 1440 and 375, light and dark. */
async function checkCandidateLook(origin, chrome, fixture) {
  log('\nCandidate: Hero · portrait, Countdown · tiles and inline, QuoteStrip · wall, and what template.css adds')
  const at = (slug) => `/${candidateSlug(slug)}`
  let res = await get(origin, at(''))
  let html = await res.text()
  const hero = sectionsOf(html).find((s) => s.type === 'Hero')?.html ?? ''
  check(
    res.status === 200 && /data-variant="portrait"/.test(hero) && /<h1 class="hp-name[^"]*"[^>]*>The candidate’s name<\/h1>/.test(hero) && /class="hp-office[^"]*"[^>]*>The office · The district</.test(hero) && /<img class="hp-portrait/.test(hero),
    'home opens on Hero · portrait: the office line, the name as the one <h1>, the portrait',
  )
  check(
    /<p class="photo-caption hp-caption[^"]*"[^>]*>Photo: the candidate at the county fair<\/p>/.test(hero) && /<img class="hp-portrait[^"]*"[^>]*alt="The candidate at the county fair"/.test(hero),
    "Hero · portrait draws the photo's caption as a chip and its alt text from the section (C1)",
  )
  const tiles = sectionsOf(html).find((s) => s.type === 'Countdown')?.html ?? ''
  check(
    /data-variant="tiles"/.test(tiles) && tiles.includes(`data-countdown-ends="${CANDIDATE_DEADLINE}"`) && /<dl class="ct-tiles[^"]*"[^>]*hidden/.test(tiles) && /<time datetime=/.test(tiles),
    'Countdown · tiles writes the deadline and the day, its tiles hidden until the browser counts them',
  )
  check(
    /<p class="kicker ct-eyebrow[^"]*"[^>]*>Election Day<\/p>\s*<h2 class="ct-heading[^"]*"[^>]*>Election Day\. Make your plan to vote\.<\/h2>/.test(tiles) &&
      /<p class="ct-body[^"]*"[^>]*>\s*Early voting runs October 19 to 31 at every county clerk’s office\. <a class="text-link[^"]*" href="https:\/\/vote\.example\.gov\/polling-places"[^>]*>Find where to vote<\/a>/.test(tiles),
    'Countdown · tiles draws the eyebrow over the heading and the body line with its link after it (C1)',
  )
  html = await (await get(origin, at('about'))).text()
  const split = sectionsOf(html).find((s) => s.type === 'Hero')?.html ?? ''
  // Astro writes an empty alt as a bare `alt`; the photo's own media alt is not the section's alt text.
  check(
    /<p class="photo-caption[^"]*"[^>]*>Photo: the candidate at home<\/p>/.test(split) && /<img class="split-image[^"]*"[^>]*\salt(?:="")?[\s>]/.test(split) && !/<img class="split-image[^>]*door-knock/.test(split),
    "Hero · split draws the photo's caption, and an empty alt where the section has no alt text",
  )
  res = await get(origin, at('events'))
  html = await res.text()
  const rail = html.slice(html.indexOf('data-bg-area="sidebar"'))
  check(res.status === 200 && /data-variant="inline"/.test(rail) && rail.includes('class="ci-left') && rail.includes('Two hours this Saturday?'), "Events' Sidebar carries Campaign sidebar: Countdown · inline, then the call to action")
  check(
    /<p class="kicker ci-heading[^"]*"[^>]*>Election Day<\/p>/.test(rail) && !rail.includes('class="ci-title') && /<p class="ci-body[^"]*"[^>]*>\s*<a class="text-link[^"]*"[^>]*>Find where to vote<\/a>/.test(rail),
    'Countdown · inline with no eyebrow sets its heading as the kicker, and draws its link under the day (C5)',
  )
  res = await get(origin, at('endorsements'))
  html = await res.text()
  const wall = sectionsOf(html).find((s) => s.type === 'QuoteStrip' && /data-variant="wall"/.test(s.html))?.html ?? ''
  check(
    res.status === 200 && (wall.match(/class="ew-card/g) ?? []).length === 4 && (wall.match(/ew-said/g) ?? []).length === 1 && wall.includes('class="ew-mark ew-initials'),
    'Endorsements draws QuoteStrip · wall as name cards, the one with words spanning two columns',
  )
  res = await get(origin, at('donate'))
  html = await res.text()
  check(res.status === 200 && /<a\b[^>]*data-bg-donate[^>]*>Donate<\/a>/.test(html) && sectionsOf(html).some((s) => s.type === 'Donate'), 'Donate carries the donation form and the header button (drawn as the current page by template.css)')
  // The comp walk's fixes: the section heads' links the boards draw (C1's All events, C2's All endorsements) and C8's Join card.
  const headLink = (sectionHtml, label) => new RegExp(`<p class="section-head-more"[^>]*>(?:(?!</p>).)*<a href="[^"]*"[^>]*>${label}</a>`, 's').test(sectionHtml)
  html = await (await get(origin, at(''))).text()
  check(headLink(sectionsOf(html).find((s) => s.type === 'EventsList')?.html ?? '', 'All events'), "home's EventsList · list carries All events in its head (C1)")
  html = await (await get(origin, at('about'))).text()
  check(headLink(sectionsOf(html).find((s) => s.type === 'QuoteStrip')?.html ?? '', 'All endorsements'), "Meet the candidate's QuoteStrip · row carries All endorsements in its head (C2)")
  res = await get(origin, at('join'))
  html = await res.text()
  const joinSections = sectionsOf(html)
  const joinLink = /<a\b[^>]*href="([^"]*)"[^>]*>\s*Join the team\s*<\/a>/.exec(joinSections[0]?.html ?? '')?.[1]
  check(
    res.status === 200 &&
      /<h1 class="visually-hidden">Join<\/h1>/.test(html) &&
      joinSections[0]?.type === 'Membership' &&
      /data-variant="card"/.test(joinSections[0].html) &&
      joinSections[0].html.includes('Put your name on the team.') &&
      joinLink === '/join' &&
      joinSections[1]?.type === 'Cta' &&
      /data-variant="card"/.test(joinSections[1].html),
    `Join opens with Membership · card (its Join the team to ${joinLink}), then Cta · card, the page's title kept as its <h1> for screen readers`,
  )
  // The kit layouts drawn to the C boards: C1's event rows and counted issue cards, C3's counted sections, C10's lead post.
  html = await (await get(origin, at(''))).text()
  const homeEvents = sectionsOf(html).find((s) => s.type === 'EventsList')?.html ?? ''
  check(
    (homeEvents.match(/<li class="event-row"/g) ?? []).length === 3 &&
      (homeEvents.match(/class="chip chip-wash"/g) ?? []).length === 3 &&
      (homeEvents.match(/class="button button-2 button-small"[^>]*>\s*(?:RSVP|Get tickets|Details)</g) ?? []).length === 3,
    "home's EventsList · list draws each event as a card with its day, its type as a chip and its button in the quieter solid style (C1)",
  )
  check((sectionsOf(html).find((s) => s.type === 'Issues')?.html.match(/<span class="issue-num"/g) ?? []).length === 3, "home's Issues · cards count their three cards in discs (C1)")
  html = await (await get(origin, at('issues'))).text()
  const longread = sectionsOf(html).find((s) => s.type === 'PlatformPlanks')?.html ?? ''
  check(/<a href="#platform-[^"]+"[^>]*>01 · /.test(longread) && /<span class="longread-num"[^>]*>01<\/span>/.test(longread), 'the platform counts its sections in the jump list and the headings, 01 up, with no numbers typed (C3)')
  html = await (await get(origin, '/blog')).text()
  check(/<article class="post-lead"/.test(html) && (html.match(/<li class="post-row"/g) ?? []).length === 1, 'the news list leads with its newest post and lists the rest as rows (C10)')
  // The comp walk's news and post fixes (C10, C11).
  const filterRow = /<nav class="list-filter"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? ''
  const chipLabels = [...filterRow.matchAll(/<li><a href="[^"]*"[^>]*>([^<]*)<\/a><\/li>/g)].map((m) => m[1])
  check(
    JSON.stringify(chipLabels) === JSON.stringify(['All', 'Schools', 'Endorsements']),
    `the filter's chips follow the categories' positions, not their labels, and leave the featured category out (${chipLabels.join(', ')})`,
  )
  check(
    /<\/ul>\s*<a class="list-featured" href="\/blog\/category\/press-releases"[^>]*>\s*Press releases\s*<svg/.test(filterRow),
    'the filter row ends with the link to the Press releases category (C10)',
  )
  const head = /<div class="list-head">([\s\S]*?)<nav class="list-filter"/.exec(html)?.[1] ?? ''
  check(/<h1>Blog<\/h1>/.test(head) && /<form class="list-search"/.test(head), "with no intro the list's head is its name, the one <h1>, with the search beside it")
  res = await get(origin, '/blog/category/press-releases')
  html = await res.text()
  check(res.status === 200 && /<a class="list-featured"[^>]*aria-current="page"/.test(html) && html.includes('Open books, line by line'), "on the Press releases list its link is marked as the current page")
  res = await get(origin, '/blog/levy-explained')
  html = await res.text()
  check(
    /<nav class="crumbs" aria-label="Breadcrumb">\s*<a href="\/blog">Blog<\/a><span class="crumbs-sep" aria-hidden="true">›<\/span><span>Schools<\/span><span class="visually-hidden" aria-current="page">The levy, explained<\/span>\s*<\/nav>/.test(html),
    "the post's breadcrumb is its list as a link, then its category, the post named as the current page (C11)",
  )
  check(
    /<ul class="entry-terms" role="list">\s*<li><a class="chip chip-wash" href="\/blog\/category\/schools">Schools<\/a><\/li><li><a class="chip" href="\/blog\/tag\/taxes">Taxes<\/a><\/li>\s*<\/ul>/.test(html) && !html.includes('class="kicker entry-terms'),
    "the post's terms are chips over its title, the category on the wash first, then the tag (C11)",
  )
  const byline = /<div class="byline">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''
  check(!plain(byline).includes('Written by') && /<a href="\/authors\/dana-k">Dana K\.<\/a>/.test(byline), 'the byline names the writer without "Written by" (C11)')
  const authorBox = /<div class="author-box">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? ''
  check(
    /<span class="author-box-avatar" aria-hidden="true">DK<\/span>/.test(authorBox) &&
      /<p class="kicker author-box-role">Written by<\/p>\s*<p class="author-box-name"><a href="\/authors\/dana-k">Dana K\.<\/a><\/p>/.test(authorBox) &&
      plain(authorBox).includes('Treasurer.'),
    'the author box: the initials disc, "Written by" as its kicker, the name as its heading, the bio (C11)',
  )
  const more = html.slice(html.indexOf('More from the campaign'))
  check(
    /class="blog-row[^"]*"/.test(more) && /<span class="blog-day-short"[^>]*>Sep 20<\/span>/.test(more) && !/class="post-(?:row|byline)/.test(more),
    "the Sidebar's More from the campaign draws its own rows, each with the short date (C11)",
  )

  // The C-board fix wave: endorsement groups, the donate story's ground and kicker, the events list's rows and line, the type tabs.
  html = await (await get(origin, at('endorsements'))).text()
  const walls = sectionsOf(html).filter((s) => s.type === 'QuoteStrip' && /data-variant="wall"/.test(s.html))
  check(
    walls.length === 3 && walls.map((w) => plain(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(w.html)?.[1] ?? '')).join(' | ') === 'Who stands with the candidate | Elected officials | Neighbors',
    'Endorsements draws each group as its own wall under its heading (C4)',
  )
  html = await (await get(origin, at('donate'))).text()
  const story = sectionsOf(html).find((s) => s.type === 'Donate')?.html ?? ''
  check(
    /data-band="tint"/.test(story) && /data-variant="story"/.test(story) && !/<p class="kicker/.test(story) && /<h2\b/.test(story),
    "Donate · story on the panel band sits on the tint, its form the raised card, with no kicker over the story's headline (C7)",
  )
  html = await (await get(origin, at('events'))).text()
  const agendaHtml = sectionsOf(html).find((s) => s.type === 'EventsList')?.html ?? ''
  check(
    /Times are Mountain Time\. <a class="text-link[^"]*" href="\/events\.ics"[^>]*>Add every event to your calendar<\/a>/.test(agendaHtml) &&
      (agendaHtml.match(/<a class="event-link" href="\/events\/[^"]+"/g) ?? []).length === fixture.data.events.upcoming.length,
    'the events list ends on "Times are Mountain Time." and Add every event to your calendar, and every row links to its event (C5)',
  )
  // One event type: no tabs ("All | Event" filters nothing).
  const types = fixture.data.events.types
  fixture.data.events.types = [{ key: 'blank', label: 'Event', upcoming: fixture.data.events.upcoming.length }]
  let version = fixture.bump(fixture.state.headline)
  let hook = await signedWebhook(origin, version, WEBHOOK_SECRET)
  res = await get(origin, '/events')
  html = await res.text()
  const oneType = sectionsOf(html).find((s) => s.type === 'EventsList' && /class="agenda"/.test(s.html))?.html ?? ''
  check(hook.status === 204 && res.status === 200 && oneType !== '' && !oneType.includes('agenda-tabs'), `with one event type the agenda draws no type tabs (got ${res.status})`)
  fixture.data.events.types = types
  version = fixture.bump(fixture.state.headline)
  hook = await signedWebhook(origin, version, WEBHOOK_SECRET)
  html = await (await get(origin, '/events')).text()
  check(hook.status === 204 && (sectionsOf(html).find((s) => /class="agenda"/.test(s.html))?.html ?? '').includes('agenda-tabs'), 'with more than one type the tabs are back')

  const css = (
    await Promise.all([...html.matchAll(/<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"/g)].map((m) => get(origin, m[1]).then((r) => r.text())))
  ).join('') + html
  check(
    /--font-display:\s*var\(--site-font-heading,\s*["']?Barlow Condensed/.test(css),
    "with no theme heading face the display face is the template's, Barlow Condensed (template.css sets --font-display)",
  )

  const browser = await headlessChrome(chrome)
  try {
    for (const width of [1440, 375]) {
      await browser.width(width)
      for (const scheme of ['light', 'dark']) {
        const where = `${width} ${scheme}`
        await browser.open(`${origin}${at('')}`, scheme)
        const home = await browser.evaluate(`(() => {
          const tiles = document.querySelector('.ct-tiles')
          const name = document.querySelector('.hp-name')
          const portrait = document.querySelector('.hp-portrait')
          const band = document.querySelector('[data-variant="portrait"]')
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            tiles: tiles && !tiles.hidden ? [...tiles.querySelectorAll('dd')].map((d) => d.textContent) : null,
            face: name ? getComputedStyle(name).fontFamily : '',
            floor: portrait && band ? Math.round(band.getBoundingClientRect().bottom - portrait.getBoundingClientRect().bottom) : null,
            beside: portrait && name ? portrait.getBoundingClientRect().left > name.getBoundingClientRect().left + 100 : null,
            mode: getComputedStyle(document.body).backgroundColor,
          }
        })()`)
        check(home.overflow <= 0, `${where}: home has no horizontal scroll (${home.overflow}px over)`)
        // The deadline is 26 days, 9 hours and 41 minutes after the run started; the minutes move with the run.
        check(home.tiles?.[0] === '26' && home.tiles[1] === '09' && /^[0-4]\d$/.test(home.tiles[2]), `${where}: the tiles count the days, hours and minutes left in the browser (${JSON.stringify(home.tiles)})`)
        check(home.face.startsWith('"Roboto Slab"'), `${where}: the name is set in the site's theme heading face, which wins over the template's (${home.face})`)
        check(home.floor !== null && home.floor <= 12, `${where}: the portrait stands on the band's floor, over the stripe (${home.floor}px)`)
        check(home.beside === (width >= 768), `${where}: the portrait is ${width >= 768 ? 'beside' : 'under'} the words`)
        await browser.open(`${origin}${at('events')}`, scheme)
        const events = await browser.evaluate(`({ overflow: document.documentElement.scrollWidth - window.innerWidth, left: document.querySelector('.ci-left')?.hidden === false ? document.querySelector('.ci-left').textContent : null })`)
        check(events.overflow <= 0 && events.left === '26 days', `${where}: Events has no horizontal scroll and Countdown · inline reads "26 days" (${events.overflow}px over, ${JSON.stringify(events.left)})`)
        const railStart = await browser.evaluate(`(() => {
          const hero = document.querySelector('main [data-type="Hero"]')
          const rail = document.querySelector('.layout-rail')
          const main = document.querySelector('.layout-main')
          if (!hero || !rail || !main) return null
          const [h, r, m] = [hero, rail, main].map((el) => el.getBoundingClientRect())
          return { underHero: r.top >= h.bottom - 1, beside: ${width} < 768 ? r.top >= m.bottom - 1 : Math.abs(r.top - m.top) <= 1 }
        })()`)
        check(railStart !== null && railStart.underHero && railStart.beside, `${where}: the Campaign sidebar starts under the hero, ${width >= 768 ? 'beside' : 'under'} the list (${JSON.stringify(railStart)})`)
        await browser.open(`${origin}${at('endorsements')}`, scheme)
        const endorse = await browser.evaluate(`(() => {
          const said = document.querySelector('.ew-said')
          const card = document.querySelector('.ew-card:not(.ew-said)')
          return { overflow: document.documentElement.scrollWidth - window.innerWidth, ratio: said && card ? said.getBoundingClientRect().width / card.getBoundingClientRect().width : null }
        })()`)
        const wide = width >= 640
        check(
          endorse.overflow <= 0 && endorse.ratio !== null && (wide ? endorse.ratio > 1.9 : Math.abs(endorse.ratio - 1) < 0.01),
          `${where}: Endorsements has no horizontal scroll and the quote card spans ${wide ? 'two columns' : 'the one column'} (${endorse.overflow}px over, ${endorse.ratio?.toFixed(2)}×)`,
        )
        await browser.open(`${origin}${at('donate')}`, scheme)
        const donate = await browser.evaluate(`(() => {
          const b = document.querySelector('.site-header .header-button[data-bg-donate]')
          return { overflow: document.documentElement.scrollWidth - window.innerWidth, fill: b ? getComputedStyle(b).backgroundColor : null }
        })()`)
        check(donate.overflow <= 0 && donate.fill === 'rgba(0, 0, 0, 0)', `${where}: on Donate the header button is an outline, the form's Donate the one gold affordance (${donate.fill})`)
        await browser.open(`${origin}/blog`, scheme)
        const news = await browser.evaluate(`(() => {
          const h1 = document.querySelector('.list-head h1')
          const words = document.querySelector('.list-head-words')
          const search = document.querySelector('.list-head .list-search')
          const filter = document.querySelector('.list-bar')
          if (!h1 || !words || !search || !filter) return null
          const w = words.getBoundingClientRect()
          const q = search.getBoundingClientRect()
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            size: parseFloat(getComputedStyle(h1).fontSize),
            caps: getComputedStyle(h1).textTransform,
            beside: q.left >= w.right - 1 && Math.abs(q.bottom - w.bottom) <= 2,
            under: q.top >= w.bottom - 1,
            searchWidth: Math.round(q.width),
            rule: getComputedStyle(filter).borderBottomWidth + ' ' + getComputedStyle(filter).borderBottomStyle,
          }
        })()`)
        check(
          news && news.overflow <= 0 && news.caps === 'uppercase' && Math.abs(news.size - (width >= 1440 ? 104 : 64)) <= 1 && (width >= 768 ? news.beside && news.searchWidth <= 270 : news.under) && news.rule === '2px solid',
          `${where}: the news list's name in capitals at C10's size, the search a pill ${width >= 768 ? 'beside it' : 'under it'}, a line under the filter (${JSON.stringify(news)})`,
        )
        await browser.open(`${origin}/blog/levy-explained`, scheme)
        const post = await browser.evaluate(`(() => {
          const box = document.querySelector('.author-box')
          const disc = box?.querySelector('.author-box-avatar')
          const meta = document.querySelector('.rail .blog-meta')
          const probe = document.createElement('i')
          probe.style.background = 'var(--band-tint)'
          document.body.append(probe)
          const tint = getComputedStyle(probe).backgroundColor
          probe.remove()
          const title = document.querySelector('.entry-header h1')
          const entry = document.querySelector('.layout-main .entry')
          const main = document.querySelector('.layout-main')
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            title: title ? Math.round(parseFloat(getComputedStyle(title).fontSize)) : null,
            start: entry && main ? Math.round(entry.getBoundingClientRect().left - main.getBoundingClientRect().left) : null,
            tinted: box ? getComputedStyle(box).backgroundColor === tint : false,
            disc: disc ? Math.round(disc.getBoundingClientRect().width) + ' ' + getComputedStyle(disc).backgroundImage.startsWith('linear-gradient') : null,
            meta: meta ? meta.innerText.trim() : null,
            metaLines: meta ? Math.round(meta.getBoundingClientRect().height / parseFloat(getComputedStyle(meta).lineHeight)) : null,
          }
        })()`)
        check(
          post.overflow <= 0 && post.title === (width >= 1440 ? 60 : 38) && post.start === 0 && post.tinted && post.disc === '56 true' && post.meta === 'Sep 20' && post.metaLines === 1,
          `${where}: the post's title at C11's size at the start of the main column, the author box on the tint with the large disc, and More from the campaign's rows read "Sep 20" on one line (${JSON.stringify(post)})`,
        )
        // The comp walk's fixes, measured.
        await browser.open(`${origin}${at('')}`, scheme)
        const stripe = await browser.evaluate(`(() => {
          const band = document.querySelector('.hero-portrait')
          const office = document.querySelector('.hp-office')
          const probe = document.createElement('i')
          probe.style.background = 'var(--bg-brand-accent)'
          document.body.append(probe)
          const accent = getComputedStyle(probe).backgroundColor
          probe.remove()
          return { accent, stripe: band ? getComputedStyle(band, '::after').backgroundColor : null, rule: office ? getComputedStyle(office, '::before').backgroundColor : null }
        })()`)
        check(stripe.stripe === stripe.accent && stripe.rule === stripe.accent, `${where}: Hero · portrait's stripe and office-line rule are the brand's accent (${stripe.stripe}, ${stripe.rule}; accent ${stripe.accent})`)
        await browser.open(`${origin}${at('endorsements')}`, scheme)
        const editorial = await browser.evaluate(`(() => { const p = document.querySelector('.single-quote blockquote p'); return p ? getComputedStyle(p).fontStyle + ' ' + getComputedStyle(p).fontWeight : null })()`)
        check(editorial === 'normal 700', `${where}: QuoteStrip · single sets the editorial upright and bold, template.css over the kit's italic (${editorial})`)
        await browser.open(`${origin}${at('events')}`, scheme)
        const railGap = await browser.evaluate(`(() => {
          const [a, b] = document.querySelectorAll('.rail .bg-section')
          return a && b ? Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom) : null
        })()`)
        check(railGap !== null && railGap >= 16, `${where}: the Campaign sidebar's Countdown and Cta stand apart (${railGap}px)`)
        // The C-board fix wave, measured.
        await browser.open(`${origin}${at('')}`, scheme)
        const name = await browser.evaluate(`(() => { const n = document.querySelector('.hp-name'); return n ? getComputedStyle(n).fontSize : null })()`)
        if (width < 768) check(name === '58px', `${where}: the portrait's name is set at C9's 58px on a phone (${name})`)
        const issues = await browser.evaluate(`(() => {
          const list = document.querySelector('.issue-cards')
          const cards = list ? [...list.children] : []
          if (!list || cards.length !== 3) return null
          return Math.round(list.getBoundingClientRect().right - cards[2].getBoundingClientRect().right)
        })()`)
        check(issues !== null && issues <= 1, `${where}: home's three issue cards fill their row, no empty track at the right (${issues}px left over)`)
        await browser.open(`${origin}${at('events')}`, scheme)
        const rows = await browser.evaluate(`(() => {
          const row = document.querySelector('.event-row')
          const day = row?.querySelector('.event-day')
          const button = row?.querySelector('.event-action .button')
          if (!row || !day || !button) return null
          const at = (el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('a') }
          const list = document.querySelector('.layout-main > .bg-section')
          const rail = document.querySelector('.layout-rail')
          return {
            day: at(day)?.className ?? null,
            button: at(button)?.className ?? null,
            buttonShare: button.getBoundingClientRect().width / row.getBoundingClientRect().width,
            listTop: list ? getComputedStyle(list).paddingTop : null,
            railTop: rail ? getComputedStyle(rail).paddingTop : null,
          }
        })()`)
        check(rows !== null && rows.day === 'event-link' && /\bbutton\b/.test(rows.button ?? ''), `${where}: a press anywhere on an event row opens the event, the button its own link above it (${JSON.stringify(rows)})`)
        check(width >= 640 ? rows.buttonShare < 0.3 : rows.buttonShare > 0.8, `${where}: the row's button is ${width >= 640 ? 'at the right' : 'the row\'s full width (C9)'} (${rows.buttonShare.toFixed(2)} of the row)`)
        check(rows.listTop === '0px' && (width < 768 || rows.railTop === '0px'), `${where}: under the Hero on its own ground the list ${width >= 768 ? 'and the rail start' : 'starts'} at the Hero's floor, no doubled gap (${rows.listTop}, ${rows.railTop})`)
        await browser.open(`${origin}/events/gotv-dinner`, scheme)
        const map = await browser.evaluate(`(() => {
          const map = document.querySelector('.event-map')
          const column = document.querySelector('.event-words')
          const fallback = document.querySelector('[data-event-map-fallback]')
          if (!map || !column || !fallback) return null
          return { share: map.getBoundingClientRect().width / column.getBoundingClientRect().width, fallback: !fallback.hidden && fallback.getBoundingClientRect().height > 0, overflow: document.documentElement.scrollWidth - window.innerWidth }
        })()`)
        check(map !== null && Math.abs(map.share - 1) < 0.01 && map.fallback && map.overflow <= 0, `${where}: the event's map is the main column's width (C6), and with no tiles to draw it shows the place and its OpenStreetMap link (${JSON.stringify(map)})`)
        await browser.open(`${origin}${at('endorsements')}`, scheme)
        const groups = await browser.evaluate(`(() => {
          const walls = [...document.querySelectorAll('[data-type="QuoteStrip"][data-variant="wall"]')]
          const width = (w) => w.querySelector('.ew-card:not(.ew-said)')?.getBoundingClientRect().width ?? null
          const disc = document.querySelector('.ew-initials')
          return { tops: walls.slice(1).map((w) => getComputedStyle(w).paddingTop), widths: walls.map((w) => Math.round(width(w))), disc: disc ? getComputedStyle(disc).backgroundImage : null }
        })()`)
        check(
          groups.tops.length === 2 && groups.tops.every((t) => t === '0px') && new Set(groups.widths).size === 1 && /linear-gradient/.test(groups.disc ?? ''),
          `${where}: the groups follow on one ground with no doubled gap, their cards one width, the initials on the brand's spruce-to-gold ground (${JSON.stringify(groups)})`,
        )
        await browser.open(`${origin}${at('about')}`, scheme)
        const stats = await browser.evaluate(`(() => {
          const band = document.querySelector('[data-type="StatCards"][data-bleed="contained"]')
          const list = band?.querySelector('.stat-list')
          const hero = document.querySelector('[data-type="Hero"] .bg-section-inner')
          if (!band || !list || !hero) return null
          return { list: Math.round(list.getBoundingClientRect().width), column: Math.round(hero.getBoundingClientRect().width), margin: getComputedStyle(band).marginTop }
        })()`)
        check(stats !== null && Math.abs(stats.list - stats.column) <= 1 && stats.margin === '0px', `${where}: a contained StatCards on the page's own ground is the column's width, no extra margin or inset (C2) (${JSON.stringify(stats)})`)
        await browser.open(`${origin}${at('join')}`, scheme)
        const join = await browser.evaluate(`(() => {
          const card = document.querySelector('.layout-main [data-type="Cta"][data-variant="card"] .cta-card-box')
          const title = document.querySelector('.page-header')
          const button = card?.querySelector('.actions .button')
          if (!card || !button) return null
          const c = card.getBoundingClientRect()
          const b = button.getBoundingClientRect()
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            align: getComputedStyle(card).textAlign,
            centred: Math.abs((c.left + c.right) / 2 - document.documentElement.clientWidth / 2) <= 1 && Math.abs((b.left + b.right) / 2 - (c.left + c.right) / 2) <= 1,
            titleShown: title ? title.getBoundingClientRect().height > 1 : false,
          }
        })()`)
        check(
          join && join.overflow <= 0 && join.align === 'center' && join.centred && !join.titleShown,
          `${where}: Join's Cta · card is one centred card, its button centred, with no title band over it (${JSON.stringify(join)})`,
        )
      }
    }
  } finally {
    await browser.close()
  }
}
/** At /news, with the intro page's Hero as the list's head (C10): its headline at the list's title size, the search beside its subhead. */
async function checkCandidateNewsIntro(origin, chrome) {
  log('\nCandidate: the news list under its intro (C10)')
  const res = await get(origin, '/news')
  const html = await res.text()
  const head = /<div class="list-head">([\s\S]*?)<nav class="list-filter"/.exec(html)?.[1] ?? ''
  check(
    res.status === 200 && /<h1 class="statement-headline[^"]*"[^>]*>From the party<\/h1>/.test(head) && head.includes('Announcements and the occasional argument.') && /<form class="list-search"[^>]*action="\/news"/.test(head),
    "the intro's Hero is the list's head, its headline the <h1> and its subhead under it, with the search",
  )
  check(head.indexOf('list-search') > head.indexOf('Announcements') && head.indexOf('Hear it from us first') > head.indexOf('list-search'), "the intro's other sections follow the head, before the filter")
  const browser = await headlessChrome(chrome)
  try {
    for (const width of [1440, 375]) {
      await browser.width(width)
      await browser.open(`${origin}/news`, 'light')
      const intro = await browser.evaluate(`(() => {
        const h1 = document.querySelector('.list-head h1')
        const lede = document.querySelector('.list-head .statement-lede')
        const search = document.querySelector('.list-head .list-search')
        if (!h1 || !lede || !search) return null
        const l = lede.getBoundingClientRect()
        const q = search.getBoundingClientRect()
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          size: parseFloat(getComputedStyle(h1).fontSize),
          caps: getComputedStyle(h1).textTransform,
          gap: Math.round(l.top - h1.getBoundingClientRect().bottom),
          beside: q.left >= l.right - 1 && Math.abs(q.bottom - l.bottom) <= 4,
          under: q.top >= l.bottom - 1,
        }
      })()`)
      check(
        intro && intro.overflow <= 0 && intro.caps === 'uppercase' && Math.abs(intro.size - (width >= 1440 ? 104 : 64)) <= 1 && intro.gap >= 12 && intro.gap <= 20 && (width >= 768 ? intro.beside : intro.under),
        `${width}: the intro's headline at the list's title size, the subhead under it, the search ${width >= 768 ? 'beside the subhead' : 'under it'} (${JSON.stringify(intro)})`,
      )
    }
  } finally {
    await browser.close()
  }
}
// ── end of the candidate template's block ────────────────────────────────────

// ── Main ─────────────────────────────────────────────────────────────────────

// ── The academy template (--template academy) ────────────────────────────────
//
// The academy as BackGold serves it: first-party, the site's Worker reading
// the Content API through its BACKGOLD_API service binding (here a stand-in
// api Worker that forwards to the fixture with the site key), so the visitor
// routes answer and the header offers Sign in (`visitorSignIn`). The
// fixture's organization is an academy on the template's starter
// (withAcademy): its pages at their own addresses, its menus, the course
// type at /courses with the fixture's two courses, and the letter above the
// footer. A visitor signs in through the portal's return leg
// (`/_backgold/visitor?code=`), and the checks read the classroom, the
// courses list, a course's syllabus, a lesson's player and the locked
// lessons' doors signed out and signed in, then save a lesson's progress
// through the page's form, then all of it in a headless Chrome at 1440 and
// 375, light and dark, with no sideways scroll.

const ACADEMY = TEMPLATE_NAME === 'academy'
const SHOTS_FLAG = process.argv.indexOf('--shots')
const SHOTS = SHOTS_FLAG === -1 ? null : resolve(process.argv[SHOTS_FLAG + 1] ?? '.')
const COURSE_TYPE = { key: 'course', singular_label: 'Course', plural_label: 'Courses', routable: true, url_base: 'courses', built_in: true, index: null, fields: [] }
/** The site id the first-party Worker is configured with. */
const ACADEMY_SITE_ID = 'site_e2e_academy'

/** `data` as an academy on the academy template's starter (the first-party run's fixture). */
function withAcademy(data, ex) {
  const manifest = JSON.parse(readFileSync(join(TEMPLATE, 'template.json'), 'utf8'))
  const { starter } = manifest
  const signupEmbed = ex.PageResponse.areas.above_footer[0].sections[0].embed
  const fill = (section) => {
    const s = { options: {}, ...structuredClone(section) }
    if (s.type === 'Classroom') s.data = { source: 'courses', items: classroomRows() }
    if (s.type === 'SignupCapture') s.embed = { ...signupEmbed, iframe: signupEmbed.iframe.replace(/[^/]+$/, s.id) }
    if (s.type === 'FormBlock') s.embed = { iframe: `https://api.backgold.com/f/lp_academy_contact/${s.id}`, script: 'https://secure.backgold.com/embed.js' }
    return s
  }
  const letter = starter.sections.find((r) => r.rules.some((rule) => rule.area_key === 'above_footer'))
  const areas = { top_banner: [], sidebar: [], above_footer: letter ? [{ key: letter.key, label: letter.label, from: null, until: null, sections: letter.document.map(fill) }] : [] }
  const pages = starter.pages.map((p) => {
    const slug = p.slug || 'home'
    const url = p.slug ? `/${p.slug}` : '/'
    const id = `lp_academy_${slug}`
    return {
      summary: { id, slug, title: p.title, url, is_home: slug === 'home', published_at: '2026-10-13T14:00:00.000Z', updated_at: '2026-10-13T14:00:00.000Z', takes_donations: false },
      response: {
        page: { ...ex.PageResponse.page, id, slug, title: p.title, url, is_home: slug === 'home', takes_donations: false, meta: { title: null, description: null, image_url: null } },
        sections: p.sections.map(fill),
        areas,
        legal: data.legal,
      },
    }
  })
  const bySlug = new Map(pages.map((p) => [p.summary.slug, p.response]))
  const types = [...data.types.filter((t) => t.key !== 'course'), COURSE_TYPE]
  let n = 0
  const menuItem = (item) => ({
    id: `nav_a${++n}`,
    label: item.label,
    kind: item.kind,
    target: { kind: item.kind, ...item.target },
    url:
      item.kind === 'page'
        ? item.target.slug ? `/${item.target.slug}` : '/'
        : item.kind === 'content_list'
          ? `/${types.find((t) => t.key === item.target.type_key)?.url_base ?? item.target.type_key}`
          : null,
    external: false,
    header_button: item.header_button,
    shows_on: item.shows_on,
    children: item.children.map(menuItem),
  })
  // A course's own page is its entry (GET /entries/course/:slug); the lessons are the course's.
  const courseEntry = (c) => ({
    id: c.id, slug: c.slug, type: 'course', title: c.title, summary: c.summary, url: c.url, hero: null, media_url: null, renditions: null,
    publish_at: c.publish_at, updated_at: c.updated_at, terms: [], authors: [], access: c.access, locked: false, lock: null, duration_seconds: null,
  })
  return {
    ...data,
    site: { ...data.site, name: 'Your Academy', chrome: { header: { layout: 'bar' }, footer: { ...data.site.chrome.footer, layout: 'columns', blurb: 'Short video courses for people who want to lead where they live.' } } },
    pages: pages.map((p) => p.summary),
    page: (slug) => bySlug.get(slug),
    types,
    entries: { ...data.entries, course: ACADEMY_COURSES.map(courseEntry) },
    entry: { ...data.entry, course: Object.fromEntries(ACADEMY_COURSES.map((c) => [c.slug, { ...courseEntry(c), body: { markdown: '' }, fields: {} }])) },
    entryAreas: areas,
    menus: {
      ...data.menus,
      primary: { menu: { key: 'primary' }, items: starter.menus.primary.map(menuItem) },
      footer: { menu: { key: 'footer' }, items: starter.menus.footer.map(menuItem) },
    },
  }
}

/**
 * The built academy on `wrangler dev`, first-party: a copy of the build's
 * deploy config with the BACKGOLD_API service binding to a stand-in api
 * Worker in the same session, which forwards each request to the fixture
 * with the site key. BACKGOLD_SITE_ID names the site; no site key is set.
 */
async function startFirstPartyWorker(siteDir, fixture) {
  const proxyDir = join(work, 'api-proxy')
  mkdirSync(proxyDir, { recursive: true })
  writeFileSync(
    join(proxyDir, 'index.mjs'),
    `export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const headers = new Headers(request.headers)
    headers.set('Authorization', 'Bearer ' + env.SITE_KEY)
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer()
    return fetch(new URL(url.pathname + url.search, env.FIXTURE_ORIGIN), { method: request.method, headers, body, redirect: 'manual' })
  },
}
`,
  )
  writeFileSync(
    join(proxyDir, 'wrangler.json'),
    JSON.stringify({ name: 'backgold-e2e-api', main: 'index.mjs', compatibility_date: '2026-10-04', vars: { FIXTURE_ORIGIN: fixture.origin, SITE_KEY } }, null, 2),
  )
  const built = JSON.parse(readFileSync(join(siteDir, 'dist/server/wrangler.json'), 'utf8'))
  const config = join(siteDir, 'dist/server/wrangler.first-party.json')
  const port = await freePort()
  writeFileSync(
    config,
    JSON.stringify({
      ...built,
      services: [{ binding: 'BACKGOLD_API', service: 'backgold-e2e-api' }],
      vars: { BACKGOLD_SITE_ID: ACADEMY_SITE_ID, BACKGOLD_API_ORIGIN: fixture.origin, SITE_URL: `http://127.0.0.1:${port}` },
    }),
  )
  return startWorker(siteDir, { vars: {}, logFile: join(work, 'wrangler-first-party.log'), persist: '.wrangler-e2e-first-party', configs: [config, join(proxyDir, 'wrangler.json')], port })
}

const COOKIE = `bg_visitor=${ACADEMY_TOKEN}`
const signedIn = (origin, path, init = {}) => get(origin, path, { ...init, headers: { Cookie: COOKIE, ...(init.headers ?? {}) } })
const courseAt = '/courses/reading-the-budget'
const lessonAt = (slug) => `${courseAt}/${slug}`

/** The academy's pages in the HTML, signed out and signed in, and a lesson's progress saved through its form. */
async function checkAcademy(origin, fixture) {
  log('\nAcademy (first-party): the classroom, a course, a lesson and its doors, signed out and signed in')
  let res = await get(origin, '/')
  let html = await res.text()
  const classroom = sectionsOf(html).find((s) => s.type === 'Classroom')?.html ?? ''
  check(res.status === 200 && /data-variant="grid"/.test(classroom) && classroom.includes('Reading the Budget') && classroom.includes('Chapter Officers'), 'home draws the Classroom grid with both courses')
  check(/<p class="kicker">The classroom<\/p>/.test(classroom), 'under the starter’s kicker, The classroom')
  check(/class="header-account-link" href="\/_backgold\/sign-in\?return=%2F"[^>]*>Sign in</.test(html), 'the header offers Sign in, back to this page (visitorSignIn)')
  check(!/data-bg-donate/.test(html) && !/>Donate</.test(html), 'and no Donate anywhere on home: the template adds no donate call')
  const headerMenu = /<nav class="header-bar-menu" aria-label="Header menu">[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''
  const menuWords = [...headerMenu.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => plain(m[1]))
  check(menuWords.join(' · ') === 'Courses · About · Join' && /href="\/join"/.test(headerMenu), `the header menu is Courses · About · Join (${menuWords.join(' · ')})`)
  check(!/\bheader-button\b/.test(html), 'and the header has no button: Join is a menu item (board D1)')
  const footer = /<footer[\s\S]*?<\/footer>/.exec(html)?.[0] ?? ''
  check(['Academy', 'The organization', 'Courses', 'Newsletter', 'Contact'].every((w) => footer.includes(w)), 'the footer lists the Academy’s links and the organization’s')

  res = await get(origin, '/courses')
  html = await res.text()
  check(res.status === 200 && /<h1[^>]*>Courses<\/h1>/.test(html) && /class="[^"]*list-courses/.test(html) && html.includes('Reading the Budget') && html.includes('Chapter Officers'), '/courses is the course type’s list, drawn as the classroom, every course from GET /courses')

  res = await get(origin, courseAt)
  html = await res.text()
  const rows = (html.match(/class="cs-row /g) ?? []).length
  check(res.status === 200 && rows === 3 && /<h1 class="cs-title[^"]*"[^>]*>Reading the Budget<\/h1>/.test(html) && html.includes('Where the money goes') && html.includes('The levy line') && html.includes('Asking at the hearing'), `a course's page is its syllabus, every lesson in order (${rows} rows)`)
  const courseSignIn = `/_backgold/sign-in?${new URLSearchParams({ return: courseAt, title: 'Reading the Budget' })}`.replace(/&/g, '&amp;')
  check(html.includes(`href="${courseSignIn}"`), "the course's sign-in names the course to the portal")

  res = await get(origin, lessonAt('where-the-money-goes'))
  html = await res.text()
  check(res.status === 200 && /<video\b/.test(html) && /<h1[^>]*>Lesson 1: Where the money goes<\/h1>/.test(html), 'the free lesson draws its player and its title as the <h1>')
  check(!/action="\/_backgold\/progress"/.test(html), 'signed out, it offers no Mark complete')
  const freeVideo = /<video\b[^>]*>/.exec(html)?.[0] ?? ''
  check(
    /\ssrc="[^"]*\/med_where-the-money-goes\.mp4\?size=1080"/.test(freeVideo) && /\sdata-src-720="[^"]*\/med_where-the-money-goes\.mp4\?size=720"/.test(freeVideo) && /\sdata-src-original="[^"]*\/med_where-the-money-goes\.mp4"/.test(freeVideo),
    `the free lesson's player is drawn on its 1080p copy, the 720p one and the original beside it (${freeVideo})`,
  )

  res = await get(origin, lessonAt('the-levy-line'))
  html = await res.text()
  check(res.status === 200 && !/<video\b/.test(html) && html.includes('Sign in with your email to watch') && /<form class="ls-door-form" method="get" action="\/_backgold\/sign-in"/.test(html), 'a lesson for anyone signed in draws its teaser and the sign-in door')
  const levyTitle = 'Lesson 2: The levy line, in Reading the Budget'
  check(html.includes(`name="title" value="${levyTitle}"`), 'the door names the lesson to the portal: "Lesson 2: The levy line, in Reading the Budget"')
  const levySignIn = `/_backgold/sign-in?${new URLSearchParams({ return: lessonAt('the-levy-line'), title: levyTitle })}`.replace(/&/g, '&amp;')
  check(html.includes(`class="header-account-link" href="${levySignIn}"`), "and so does the header's Sign in on the lesson's page")
  res = await get(origin, `/_backgold/sign-in?${new URLSearchParams({ return: lessonAt('the-levy-line'), title: levyTitle, newsletter: '1' })}`)
  const door = new URL(res.headers.get('location') ?? '', 'https://portal.invalid')
  check(
    res.status === 302 && door.pathname === '/site-signin' && door.searchParams.get('title') === levyTitle && door.searchParams.get('newsletter') === '1',
    `the sign-in route carries the title and the newsletter tick to the portal's door (${res.status}, ${door.search})`,
  )
  res = await get(origin, lessonAt('asking-at-the-hearing'))
  html = await res.text()
  check(html.includes('Join to watch') && html.includes(`Lesson 3 is for members of ${ACADEMY_ORG}.`) && /href="\/join"/.test(html), 'a members lesson draws the Join door, naming the organization')

  // The portal's return leg: the code becomes the HttpOnly cookie, back to the path with the notice.
  res = await get(origin, `/_backgold/visitor?code=${ACADEMY_CODE}&return=%2Fcourses`)
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('bg_visitor=')) ?? ''
  check(res.status === 302 && res.headers.get('location') === '/courses#signed-in' && cookie.startsWith(`bg_visitor=${ACADEMY_TOKEN};`) && /HttpOnly/i.test(cookie), `the return leg sets the visitor's cookie and goes back to the page (${res.status}, ${res.headers.get('location')}, ${cookie})`)
  res = await get(origin, '/_backgold/visitor?code=not-the-code&return=%2F')
  check(res.status === 400 && (await res.text()).includes('That sign-in link has expired'), 'a code the api would not redeem is the expired page')

  res = await signedIn(origin, '/')
  html = await res.text()
  check(/private|no-store/.test(res.headers.get('cache-control') ?? '') && res.headers.get('x-backgold-cache') !== 'HIT', `a signed-in visitor's page is never cached (${res.headers.get('cache-control')}, ${res.headers.get('x-backgold-cache')})`)
  const account = /<div class="header-account"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? ''
  check(/<span class="header-account-name"[^>]*>Robin<\/span>/.test(account) && /href="\/_backgold\/sign-out\?return=%2F"/.test(account), `signed in, the header names the visitor and offers Sign out (${account.replace(/\s+/g, ' ')})`)
  const standing = /You have finished[^.]*\./.exec(plain(html))?.[0]
  check(standing === 'You have finished 0 of 2 courses and have 1 under way.', `the classroom says where the visitor stands (${standing})`)
  check(/<progress class="ac-bar"/.test(sectionsOf(html).find((s) => s.type === 'Classroom')?.html ?? ''), 'and the course under way carries its bar')

  res = await signedIn(origin, courseAt)
  html = await res.text()
  const weekday = WEEKDAYS[new Date(ACADEMY_FINISHED_AT).getUTCDay()]
  check(plain(html).includes(`Lesson 1 finished on ${weekday}`), `the course head says when the newest lesson was finished ("Lesson 1 finished on ${weekday}")`)
  check(/>Continue · Lesson 2</.test(html), 'and Continue opens the next lesson')

  res = await signedIn(origin, lessonAt('the-levy-line'))
  html = await res.text()
  check(/<video\b/.test(html) && !html.includes('Sign in with your email to watch'), 'signed in, the lesson for anyone signed in opens its player')
  check(/action="\/_backgold\/progress"/.test(html) && /name="return" value="\/courses\/reading-the-budget\/the-levy-line"/.test(html), 'with Mark complete, a form that comes back to the lesson')
  check(plain(html).includes('Picks up at 1:12, where you stopped.'), 'and picks up where the visitor stopped')
  res = await signedIn(origin, lessonAt('asking-at-the-hearing'))
  html = await res.text()
  check(html.includes('Join to watch') && html.includes('You are signed in as Robin'), 'the members lesson still draws the Join door, naming who is signed in')

  // The page without its script: the form posts, the Worker saves it and sends the visitor back.
  const form = new URLSearchParams({ course: 'reading-the-budget', lesson: 'the-levy-line', completed: 'true', return: lessonAt('the-levy-line') })
  res = await signedIn(origin, '/_backgold/progress', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin }, body: form.toString() })
  check(res.status === 303 && res.headers.get('location') === lessonAt('the-levy-line'), `Mark complete without the script saves and comes back to the lesson (${res.status}, ${res.headers.get('location')})`)
  const saved = fixture.state.progress.at(-1)
  check(saved?.lesson === 'the-levy-line' && saved.completed === true, `the api was told the lesson is finished (${JSON.stringify(saved)})`)
  res = await signedIn(origin, lessonAt('the-levy-line'))
  html = await res.text()
  check(/<form method="post" action="\/_backgold\/progress" data-complete="true" hidden/.test(html), 'and the lesson now reads Completed')
  res = await get(origin, '/_backgold/progress', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example', Cookie: COOKIE }, body: form.toString() })
  check(res.status === 403, `a form from another site is refused (${res.status})`)
  res = await get(origin, '/_backgold/progress', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin }, body: form.toString() })
  check(res.status === 303 && res.headers.get('location') === `/_backgold/sign-in?return=${encodeURIComponent(lessonAt('the-levy-line'))}`, `without the cookie the form goes to the sign-in door, back to the lesson (${res.headers.get('location')})`)
  // Put the lesson back, for the look checks.
  await signedIn(origin, '/_backgold/progress', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ course: 'reading-the-budget', lesson: 'the-levy-line', completed: false }) })
}

/** The academy in Chrome at 1440 and 375, light and dark, signed out then signed in. */
async function checkAcademyLook(origin, chrome) {
  log('\nAcademy: the classroom, the courses list, a course, a lesson and its doors in Chrome at 1440 and 375, light and dark')
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  const browser = await headlessChrome(chrome)
  try {
    for (const width of [1440, 375]) {
      await browser.width(width)
      for (const scheme of ['light', 'dark']) {
        const where = `${width} ${scheme}`
        const look = async (path, name, expression) => {
          await browser.open(`${origin}${path}`, scheme)
          const at = await browser.evaluate('location.pathname')
          check(at === path.replace(/[?#].*$/, ''), `${where}: Chrome is on ${path} (${at})`)
          const found = await browser.evaluate(`(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dark: document.documentElement.dataset.theme ?? null, value: (${expression})() }))()`)
          check(found.overflow <= 0, `${where}: ${name} has no horizontal scroll (${found.overflow}px over)`)
          if (SHOTS) await browser.shot(join(SHOTS, `${name}-${width}-${scheme}.png`))
          return found.value
        }
        await browser.clearCookies()
        const home = await look('/', 'home-signed-out', `() => ({
          cards: document.querySelectorAll('[data-type="Classroom"] .cr-card').length,
          signIn: [...document.querySelectorAll('.site-header a')].some((a) => a.textContent.trim() === 'Sign in'),
          bg: getComputedStyle(document.body).backgroundColor,
        })`)
        check(home.cards >= 2 && home.signIn, `${where}: home draws the classroom's cards and the header's Sign in (${JSON.stringify(home)})`)
        const list = await look('/courses', 'courses', `() => document.querySelectorAll('.list-courses .cr-card').length`)
        check(list >= 2, `${where}: /courses draws both courses (${list})`)
        const syllabus = await look(courseAt, 'course-signed-out', `() => ({ rows: document.querySelectorAll('.cs-row').length, h1: document.querySelector('h1')?.textContent.trim() })`)
        check(syllabus.rows === 3 && syllabus.h1 === 'Reading the Budget', `${where}: the course's syllabus lists its three lessons (${JSON.stringify(syllabus)})`)
        const door = await look(lessonAt('the-levy-line'), 'lesson-door-sign-in', `() => {
          // A computed colour as sRGB bytes, through a canvas (color-mix answers in color(srgb …)).
          const rgb = (css) => {
            const c = document.createElement('canvas').getContext('2d')
            c.fillStyle = css
            c.fillRect(0, 0, 1, 1)
            return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3)
          }
          const lum = (bytes) => bytes.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
          const words = document.querySelector('.ls-teaser .ls-veil p')
          const ground = document.querySelector('.ls-teaser')
          const [a, b] = [lum(rgb(getComputedStyle(words).color)), lum(rgb(getComputedStyle(ground).backgroundColor))]
          return { door: !!document.querySelector('.ls-door .ls-door-form'), video: !!document.querySelector('video'), teaser: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 }
        }`)
        check(door.door && !door.video, `${where}: the locked lesson draws its sign-in door, no player (${JSON.stringify(door)})`)
        check(door.teaser >= 4.5, `${where}: the teaser's words read at AA on its ground (${door.teaser}:1)`)
        const free = await look(lessonAt('where-the-money-goes'), 'lesson-free', `() => document.querySelector('video')?.getAttribute('src') ?? null`)
        const size = width <= 768 ? 720 : 1080
        check(free?.endsWith(`/med_where-the-money-goes.mp4?size=${size}`), `${where}: the free lesson plays its ${size}p copy (${free})`)

        // Signed in through the portal's return leg, as a browser follows it.
        await browser.open(`${origin}/_backgold/visitor?code=${ACADEMY_CODE}&return=%2F`, scheme)
        const back = await browser.evaluate('location.pathname + location.hash')
        check(back === '/#signed-in', `${where}: the return leg lands on the page with the signed-in notice (${back})`)
        const mine = await look('/', 'home-signed-in', `() => ({ name: document.querySelector('.site-header .header-account-name')?.textContent.trim() ?? null, bars: document.querySelectorAll('[data-type="Classroom"] .ac-bar').length })`)
        check(mine.name === 'Robin' && mine.bars >= 1, `${where}: signed in, the header names the visitor (${JSON.stringify(mine)})`)
        await look(courseAt, 'course-signed-in', `() => null`)
        const player = await look(lessonAt('the-levy-line'), 'lesson-player', `() => {
          const video = document.querySelector('video')
          const main = document.querySelector('.layout-main')
          return { video: !!video, fits: video && main ? video.getBoundingClientRect().width <= main.getBoundingClientRect().width + 1 : null, complete: !!document.querySelector('.ls-complete form:not([hidden]) button') }
        }`)
        check(player.video && player.fits && player.complete, `${where}: the lesson's player fits its column, Mark complete under it (${JSON.stringify(player)})`)
        const joinDoor = await look(lessonAt('asking-at-the-hearing'), 'lesson-door-join', `() => document.querySelector('.ls-door .ls-door-title')?.textContent.trim() ?? null`)
        check(joinDoor === 'Join to watch', `${where}: the members lesson draws the Join door (${joinDoor})`)
      }
    }
  } finally {
    await browser.clearCookies().catch(() => {})
    await browser.close()
  }
}

async function main() {
  // Before the long build: --lighthouse or the party template without a Chrome fails now, never skips.
  const chrome = LIGHTHOUSE || PARTY || PETITION_DRIVE || CANDIDATE || ACADEMY ? chromeBin(LIGHTHOUSE ? '--lighthouse' : `--template ${TEMPLATE_NAME}`) : null
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

  if (ON_KIT) await checkFirstPartyLive(siteDir)

  const examples = await loadExamples()
  if (PARTY) checkFirstPartyFonts(siteDir, examples.SiteResponse.site.theme)
  const disclaimer = examples.SiteResponse.legal.disclaimer
  const kitchen = await kitchenSink()
  checkSectionsMap(kitchen.blocks, kitchen.areaBlocks, kitchen.templateSections)
  // --serve --news (and --serve --template candidate, with the intro the seed writes, C10): the organization at /news.
  const fixture = await startFixture(examples, kitchen.sections, SERVE_NEWS ? 'news' : 'blog')
  log(`Fixture Content API: ${fixture.origin}`)
  // ── petition-drive (begin) ──
  // --serve: home is the drive's starter page, under its menus; a JSON brand
  // in PETITION_DRIVE_BRAND ({ primary_color, secondary_color, accent_color,
  // logo_url }) replaces the fixture's brand, and the fixture's saved theme is
  // dropped so the template's own faces show: the drive in another
  // organization's colours.
  if (PETITION_DRIVE && SERVE) {
    const drive = petitionDriveFixture(fixture)
    const own = fixture.data.page
    fixture.data.page = (slug, headline) => (slug === 'home' ? drive.page : own(slug, headline))
    fixture.data.menus = { ...fixture.data.menus, ...drive.menus }
    if (process.env.PETITION_DRIVE_BRAND) {
      fixture.data.site.brand = { ...fixture.data.site.brand, ...JSON.parse(process.env.PETITION_DRIVE_BRAND) }
      fixture.data.site.theme = null
    }
  }
  // ── petition-drive (end) ──
  // ── unlabeled (begin) ──
  // --serve: her site as the starter seeds it (unlabeledFixture): every
  // starter page at its slug, her menus, her two areas, her brand and
  // socials, pinned dark, so it can be looked at against boards U1, U6–U9.
  if (UNLABELED && SERVE) unlabeledFixture(fixture)
  // ── unlabeled (end) ──
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
    if (TEMPLATE_NAME === 'astro-starter') await checkPartnerVisitor(configured.origin, fixture)
    if (PARTY) await checkPartyBoards(configured.origin, fixture)
    if (PARTY) await checkPartyMap(configured.origin, fixture)
    if (PARTY) await checkPartyUnwired(configured.origin)
    if (PARTY) await checkPartyChrome(configured.origin)
    if (PARTY) await checkPartyLook(configured.origin, fixture, chrome)
    // ── petition-drive (begin) ──
    if (PETITION_DRIVE) await checkPetitionDrive(configured.origin, fixture, chrome)
    // ── petition-drive (end) ──
    if (CANDIDATE) await checkCandidateLook(configured.origin, chrome, fixture)
    if (NONPROFIT) await checkNonprofit(configured.origin)
    if (LIGHTHOUSE) await checkLighthouse(configured.origin, chrome, fixture)
  } finally {
    await killTree(configured.child)
  }

  // The academy first-party, on its own Worker, fixture and local KV.
  if (ACADEMY) {
    const academyFixture = await startFixture(examples, kitchen.sections, 'blog', { academy: true })
    log(`Fixture Content API for the academy: ${academyFixture.origin}`)
    const firstParty = await startFirstPartyWorker(siteDir, academyFixture)
    try {
      await checkAcademy(firstParty.origin, academyFixture)
      await checkAcademyLook(firstParty.origin, chrome)
    } finally {
      await killTree(firstParty.child)
    }
  }

  // A second organization, at /news, on its own Worker and its own local KV.
  const newsFixture = await startFixture(examples, kitchen.sections, 'news')
  log(`Fixture Content API at /news: ${newsFixture.origin}`)
  const atNews = await startWorker(siteDir, {
    vars: (origin) => ({ BACKGOLD_SITE_KEY: SITE_KEY, BACKGOLD_API_ORIGIN: newsFixture.origin, SITE_URL: origin }),
    logFile: join(work, 'wrangler-news.log'),
    persist: '.wrangler-e2e-news',
  })
  try {
    await checkNewsBase(atNews.origin, newsFixture)
    if (CANDIDATE) await checkCandidateNewsIntro(atNews.origin, chrome)
  } finally {
    await killTree(atNews.child)
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

  const workerLog = ['configured', 'news', 'setup', 'redeployed', ...(ACADEMY ? ['first-party'] : [])].map((name) => readFileSync(join(work, `wrangler-${name}.log`), 'utf8')).join('')
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
