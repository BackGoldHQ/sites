#!/usr/bin/env node
// The starter template (or another template under templates/) and the two
// packages it is built on, end to end on workerd: builds @givegold/shared,
// @backgold/content and @backgold/astro, packs the two public packages,
// installs them into a copy of the template outside the repository (so
// nothing resolves through the pnpm workspace), builds it, and runs it on
// `wrangler dev` against a fixture Content API served from
// CONTENT_API_EXAMPLES: first an organization that kept the legacy blog
// address (`/blog`), then one at `/news` with a page there, the news list's
// intro. Exits non-zero at the first failed check.
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
// --template party needs Chrome at $CHROME_BIN too: the party template's look
// (the header button's contrast, the accent, the faces, light and dark) is
// read in a headless Chrome, driven over the DevTools protocol.
//
// Needs node >= 22.12, pnpm and npm. No dependencies beyond node's own.

import { spawn, spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
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
  // @backgold/astro depends on @backgold/content; the override makes that
  // the tarball too, never the copy on npm.
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

/** The kitchen sink's membership program's benefits, on every one of its rows. */
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
 * On the party template its home's Blog section is the List layout, so the
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
      if (slug !== 'home' || !PARTY) return found
      return { ...found, sections: found.sections.map((sec) => (sec.type === 'Blog' ? { ...sec, variant: 'list' } : sec)) }
    },
    entries: move(data.entries),
    entry: move(data.entry),
    sitemap: move(data.sitemap),
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
  return {
    blocks: shared.CONTENT_API_BLOCKS,
    areaBlocks: shared.CONTENT_API_AREA_BLOCKS,
    // Drawn by the party template. The public starter has no component for
    // them and falls through to DefaultSection.
    templateSections: new Set(shared.TEMPLATE_SECTION_TYPES),
    doc,
    sections,
  }
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

/** The month (and day) `date` falls in in Denver, the calendar rows' zone. */
function calendarMonthOf(date) {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'America/Denver' }).formatToParts(date)
  const part = (type) => Number(parts.find((p) => p.type === type).value)
  return { year: part('year'), monthIndex: part('month') - 1, day: part('day') }
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
  const texas = file(JSON.stringify(JSON.parse(readFileSync(join(ROOT, 'packages/site/src/geo/tx-counties.json'), 'utf8'))))
  return { four, texas, byHash: new Map([four, texas].map((f) => [f.hash, f.json])) }
}

function placeholderImage(path) {
  if (path.includes('med_logo')) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="56" viewBox="0 0 200 56"><rect width="56" height="56" rx="10" fill="#1b3a5c"/><path d="M14 40 L28 14 L42 40 Z" fill="#f4efe6"/><text x="66" y="35" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#1b3a5c">Pine Valley</text></svg>'
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd9e3"/><stop offset="1" stop-color="#f4efe6"/></linearGradient></defs><rect width="1200" height="800" fill="url(#s)"/><path d="M0 560 L260 330 L430 470 L640 250 L900 520 L1200 360 L1200 800 L0 800 Z" fill="#1b3a5c" opacity=".85"/><path d="M0 660 L300 520 L620 640 L900 560 L1200 650 L1200 800 L0 800 Z" fill="#2f5a3a"/></svg>'
}

/** The fixture Content API; `blogBase` 'news' serves the organization at /news (newsBaseData). */
function startFixture(examples, kitchenSections, blogBase = 'blog') {
  const plain = fixtureData(examples, kitchenSections)
  const data = blogBase === 'news' ? newsBaseData(plain, examples) : plain
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
      res.end(body === undefined ? undefined : JSON.stringify(body).replace(UPLOADS, `${state.origin}/media/`).replace(GEO_FILES, `${state.origin}/lp-runtime/`))
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
    // A geometry file by its hash, immutable as the api serves it; any other hash is a 404.
    const geoHash = /^\/lp-runtime\/([0-9a-f]{64})\.json$/.exec(url.pathname)?.[1]
    if (geoHash) {
      const json = data.geo.byHash.get(geoHash)
      res.writeHead(json ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': json ? 'public, max-age=31536000, immutable' : 'no-store' })
      return res.end(json ?? JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }))
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

/** The built Worker on `wrangler dev`; `persist` names its local KV's directory under the site (one per organization served). */
async function startWorker(siteDir, { vars, logFile, persist = '.wrangler-e2e' }) {
  const port = await freePort()
  const inspector = await freePort()
  const args = ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', join(siteDir, persist), '--show-interactive-dev-session=false']
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
    PARTY
      ? /<iframe\b[^>]*data-bg-embed[^>]*src="https:\/\/secure\.backgold\.com\/embed\/d\/df_general\?layout=form&amp;look=[0-9a-f.]+&amp;look_dark=[0-9a-f.]+&amp;radius=12&amp;font=public-sans"/.test(html)
      : /<iframe\b[^>]*data-bg-embed[^>]*src="https:\/\/secure\.backgold\.com\/embed\/d\/df_general"/.test(html),
    PARTY ? "the Donate section is BackGold's frame, asked to wear the site in its layout" : "the Donate section is BackGold's embed iframe",
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
  // area's sign-up is framed by its reusable section, and on the party
  // template the light and dark switch's two (the head's kept choice, the
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
      entryModeScripts === (PARTY ? 2 : 0),
    `an entry loads only JSON-LD${dated ? ", the areas' window script once" : ''}${framed ? " and the frames' resize script once" : ''}${PARTY ? ' and the light and dark switch\'s two' : ''} (${scripts.length} other script tag(s))`,
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

/**
 * An organization at the blog base `news` (newsBaseData), on both templates:
 * the list at /news with the intro page's sections above it, an entry at
 * /news/<slug> with its breadcrumb, the links to the list (the Blog section's,
 * the featured post's, the menu's), the feed, the sitemap, and nothing at
 * /blog.
 */
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
  if (PARTY) {
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
  if (PARTY) check(/<nav class="crumbs"[^>]*>\s*<a href="\/news"[^>]*>News<\/a>/.test(html), 'the entry page links back to News at /news')

  res = await get(origin, '/')
  html = await res.text()
  check(
    res.status === 200 && (PARTY ? /<a href="\/news"[^>]*>All news<\/a>/ : /<a href="\/news"[^>]*>All posts<\/a>/).test(html) && !html.includes('href="/blog'),
    `home's Blog section links ${PARTY ? '"All news"' : '"All posts"'} to /news, and nothing on home points at /blog`,
  )
  res = await get(origin, '/kitchen-sink')
  html = await res.text()
  check(res.status === 200 && html.includes('href="/news/levy-explained"') && !html.includes('href="/blog'), 'the featured post (ContentPost) links /news/<slug>')

  for (const path of ['/blog', '/blog/levy-explained', '/blog/feed.xml']) {
    res = await get(origin, path)
    await res.text()
    check(res.status === 404, `${path} is a 404 on an organization at /news (got ${res.status})`)
  }
  if (PARTY) {
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
      async open(url, scheme) {
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId)
        const loaded = next('Page.loadEventFired', sessionId, 60)
        await send('Page.navigate', { url }, sessionId)
        await loaded
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
  VoterTools: (i) => [i.label],
  SampleBallot: (i) => [i.name ?? i.office],
  Scorecard: (i) => [i.bill ?? i.name],
  // The offer's name and the program's first benefit; prices are the template's own words over the *_cents columns.
  Membership: (i) => [i.name, ...(i.benefits ?? []).slice(0, 1)],
  Faq: (i) => [i.question],
  Comparison: (i) => [i.issue, i.us, i.them, i.them2],
  Stories: (i) => [i.title],
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
        // The party template asks the frame to wear the site: the same address with its layout and look appended.
        const placed = PARTY ? new RegExp(`src="${src.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\?layout=[a-z_]+&amp;look=[0-9a-f.]+&amp;look_dark=[0-9a-f.]+&amp;radius=12&amp;font=public-sans"`) : null
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
    // The party template's components must show every column. The public
    // starter draws these through DefaultSection, which shows the heading
    // and the row fields it knows, not each column the party component draws.
    const plainFallback = !PARTY && kitchen.templateSections.has(type)
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
const config = await getViteConfig({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false } }, { configFile: false, logLevel: 'silent' })({ command: 'serve', mode: 'test' })
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
  const { default: LiveCounts } = await server.ssrLoadModule('/src/components/sections/EventsList/LiveCounts.astro')
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

/**
 * First-party faces, unit-level (the Worker under test reads with a site key):
 * src/lib/fonts.ts names each theme file by its same-origin path, as a hosted
 * page does, with nothing to preconnect; a system face downloads nothing; a
 * face it cannot read keeps the template's own face for that slot alone.
 */
function checkFirstPartyFonts(siteDir, theme) {
  log('\nFirst-party faces (src/lib/fonts.ts alone)')
  const fonts = probe(
    siteDir,
    'fonts-first-party',
    `  const { siteFonts } = await server.ssrLoadModule('/src/lib/fonts.ts')
  const theme = ${JSON.stringify(theme)}
  const system = { ...theme, fonts: { ...theme.fonts, heading: { family: 'Georgia', stack: "Georgia,'Times New Roman',Times,serif", source: 'system', files: [] } } }
  const unreadable = { ...theme, fonts: { ...theme.fonts, heading: { ...theme.fonts.heading, stack: '"Roboto Slab"}body{color:red' } } }
  console.log('PROBE ' + JSON.stringify({ theme: siteFonts(theme, true), system: siteFonts(system, true), unreadable: siteFonts(unreadable, true) }))`,
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
  const actions = (markup) => [...markup.matchAll(/<a class="button" href="([^"]*)"[^>]*>([^<]*)<span class="visually-hidden"[^>]*>: ([^<]*)<\/span>/g)].map((m) => [decode(m[3]), m[2], decode(m[1])])
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
      [...phone.matchAll(/class="agenda-title"[^>]*><a href="([^"]*)"/g)].map((m) => m[1]).join(' ') === '/events/chapter-supper /events/phone-bank-night /events/month-end-mixer',
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
      /<a href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=39\.5%2C-105\.25"[^>]*>Get directions<\/a>/.test(main) &&
      /<iframe class="event-map"[^>]*src="https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=[^"]*marker=39\.50000%2C-105\.25000"/.test(main),
    'the event page offers Add to calendar and Get directions, and frames a map of the venue from its coordinates',
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
 * which the party template draws and the starter leaves to DefaultSection).
 * The party template draws the compliance modules for their frame (heading
 * and card around BackGold's own frame), all but SocialFrame, which has no
 * frame a site can place. A block the api projects only inside an area
 * (areaBlocks) counts with its area role.
 */
function checkSectionsMap(chromeBlocks, areaBlocks, templateSections) {
  const blocks = { ...chromeBlocks, ...areaBlocks }
  const source = readFileSync(join(TEMPLATE, 'src/components/sections/index.ts'), 'utf8')
  const body = /export const sections = \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
  const keys = new Set([...body.matchAll(/^\s*([A-Za-z]+)\s*(?::|,)/gm)].map((m) => m[1]))
  const unframed = ['SocialFrame']
  const delegated = PARTY ? new Set() : templateSections
  const missing = Object.entries(blocks)
    .filter(([type, spec]) => spec.role !== 'chrome' && (PARTY || spec.role !== 'compliance') && !unframed.includes(type) && !delegated.has(type) && !keys.has(type))
    .map(([type]) => type)
  const extra = [...keys].filter(
    (key) => !(key in blocks) || blocks[key].role === 'chrome' || unframed.includes(key) || (!PARTY && blocks[key].role === 'compliance'),
  )
  check(missing.length === 0, `the template has a section component for every presentational, data and compliance block${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`)
  check(extra.length === 0, `and none for a chrome block, SocialFrame, or a type BackGold does not have${extra.length ? ` (${extra.join(', ')})` : ''}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Before the long build: --lighthouse or the party template without a Chrome fails now, never skips.
  const chrome = LIGHTHOUSE || PARTY ? chromeBin(LIGHTHOUSE ? '--lighthouse' : '--template party') : null
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
  if (PARTY) checkFirstPartyFonts(siteDir, examples.SiteResponse.site.theme)
  const disclaimer = examples.SiteResponse.legal.disclaimer
  const kitchen = await kitchenSink()
  checkSectionsMap(kitchen.blocks, kitchen.areaBlocks, kitchen.templateSections)
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
    if (PARTY) await checkPartyMap(configured.origin, fixture)
    if (PARTY) await checkPartyChrome(configured.origin)
    if (PARTY) await checkPartyLook(configured.origin, fixture, chrome)
    if (LIGHTHOUSE) await checkLighthouse(configured.origin, chrome, fixture)
  } finally {
    await killTree(configured.child)
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

  const workerLog = ['configured', 'news', 'setup', 'redeployed'].map((name) => readFileSync(join(work, `wrangler-${name}.log`), 'utf8')).join('')
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
