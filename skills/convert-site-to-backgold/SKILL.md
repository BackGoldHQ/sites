---
name: convert-site-to-backgold
description: Convert an existing custom-built website (Astro, Next.js, React, Vue, plain HTML, a static export, or a hand-written Cloudflare Worker) into a BackGold custom site, built on the BackGold starter, reading its pages, menus, prices and forms from BackGold, and deployed to BackGold hosting with the `backgold` CLI. Use this whenever someone wants to move, migrate, port, convert or rebuild a site "onto BackGold", "into BackGold hosting", "as a BackGold custom site" or "on the BackGold starter"; wants their BackGold organization to manage a site's content; mentions `@backgold/astro`, `@backgold/content`, `@backgold/cli`, `backgold deploy` or a `bg_deploy_` token alongside an existing site; or asks why their site's forms, `/api` routes or cookies stopped working after moving to BackGold. Use it even when they only say "put our site on BackGold".
---

# Convert a site to a BackGold custom site

A BackGold custom site is the site's own code, run by BackGold on the
organization's domain, reading the organization's content from BackGold every
time a page is drawn. The owner edits a price, a page or a menu in BackGold
and the site shows it within about a minute, with no deploy. That is the
point of the conversion, and it decides most of the choices below: **anything
the owner might want to change belongs in BackGold, not in the code.**

The end state is always the same shape, whatever the site was built with:

- the **BackGold starter** (Astro on the Cloudflare adapter, with
  `@backgold/astro` and `@backgold/content`) as the skeleton;
- the old site's **design** carried over: its layout, components, styles,
  scripts and assets, redrawn as components for BackGold's page sections;
- the old site's **content** living in BackGold: pages, menus, content types,
  posts, entered there by the organization from a plan you write;
- its **forms and donations** as BackGold's own frames;
- deploys through the **`backgold` CLI**, a preview first, then live.

A straight lift ("keep it static, just host it on BackGold") is the wrong
target even when it looks cheaper: content stays frozen at build time, the
owner cannot edit anything, and BackGold cannot count a page view or take a
form. If someone asks for that, explain what they lose and do the real
conversion unless they insist.

## Before you start

Three things only a person can give you. Ask for them; never invent them and
never ask for a secret to be pasted into the conversation (have it exported in
the shell instead).

| What | Where it comes from | Not to be confused with |
| --- | --- | --- |
| Someone signed in to BackGold as an **owner or admin** of the organization, to enter the content | The organization | A staff login, or a site key |
| A **deploy token**, `bg_deploy_…` | BackGold → Sites → the site → Developer → make a deploy token. Shown once. | A site key (`bg_site_pk_…`, `bg_site_sk_…`), which reads content and cannot deploy |
| **Custom sites turned on** for the organization | BackGold staff grant it. Without it the first deploy answers "not entitled" (exit 3). | A plan upgrade |

You can do all of the code work, and check it locally, before the second and
third exist. Say early that they are needed so nobody is waiting at the end.

## The work, in order

Work on a branch of the site's own repository and open a pull request. Keep
the old site deployable from `main` until the new one is live.

### 1. Survey the old site

Know what you are converting before changing anything. Run the survey script
from the old site's root; it lists the pages, forms, server routes, cookies,
outside requests and environment names it can find:

```bash
node <this skill>/scripts/survey.mjs .
```

Read its output, then read the code it points at. You are building four
lists, and the pull request description should carry them:

1. **Every address** the site answers, and what kind of thing each is.
2. **Every fact** printed on the site that someone might change: names,
   phone, hours, prices, bios, FAQs, addresses, dates.
3. **Every form**, what it collects, and where it sends it.
4. **Everything that runs on a server** at request time: API routes,
   redirects, auth, cookies, calls to other services.

### 2. Decide where each thing lives

Read `references/content-model.md` now. It has the rules for the mapping and
the limits that shape it. The short form:

| On the old site | In BackGold |
| --- | --- |
| A page of prose and sections (Home, About, Pricing, Contact) | A **page**: an ordered list of sections the owner composes |
| Things that repeat and each have their own page (services, locations, team, projects) | A **content type**, with fields, at its own address |
| Site-wide facts (phone, hours, address, social links, the tagline) | One entry of a small "details" content type; brand colors, logo and social links are the site's own in BackGold |
| A blog, news, notes | **Posts** |
| Header and footer navigation | The site's **menus** |
| A contact, sign-up, application or survey form | A **Form** section: BackGold's own frame |
| Donations, tickets, a store, a petition | BackGold's own module, placed as a frame |
| Design: layout, type, color, animation, illustration | **Code**, in this repository |

Write the mapping down before coding. Where the old site has something
BackGold cannot hold (see the limits in the reference), say so in the pull
request under "Differences" instead of quietly dropping or faking it.

### 3. Start from the starter

Bring the starter into the repository rather than retrofitting the old build:
its routing, caching, preview and SEO routes are what make the site behave
like a BackGold site, and they are easy to get subtly wrong by hand.

```bash
git clone --depth 1 https://github.com/BackGoldHQ/backgold-starter /tmp/backgold-starter
```

Copy its `astro.config.mjs`, `wrangler.jsonc`, `backgold.json`,
`tsconfig.json`, `src/pages/`, `src/layouts/`, `src/lib/`, `src/components/`
and its `package.json` dependencies and scripts into the branch, then remove
what the old build no longer needs (its own server, adapters, deploy scripts,
build-time content fetching, committed content files) and the starter's
`src/pages/auth/` routes with `src/lib/visitor.ts` (a visitor sign-in keeps
a cookie, and no cookie reaches a custom site). Keep the old site's
components, styles, scripts and `public/` assets: they are the design you are
about to put back on.

Then in `wrangler.jsonc`: set `name`, set `SITE_URL` under `vars` to the
site's public address, and delete `BACKGOLD_SITE_KEY`, `BACKGOLD_API_ORIGIN`
and the `kv_namespaces` block. BackGold hosting sets every `BACKGOLD_*` value
itself and binds no KV; locally those two values go in `.dev.vars` (step 6).

Read `references/hosting.md` before porting any server code. The three rules
that break the most conversions:

- **`/api`, `/privacy`, `/sms-terms`, `/health`, `/ingest`, `/webhooks` and
  `/.well-known` are BackGold's** on every site it hosts. A route of yours at
  one of those addresses is never reached. Move it (`/weather.json`, not
  `/api/weather`).
- **No cookies on the server.** None reach the site's server code and none
  it sets reach the visitor, so a sign-in or anything a page decides from a
  cookie cannot work. Script in the browser can still keep a small
  preference, in storage or a cookie of its own.
- **No `caches.default`** and no KV. Keep a short-lived value in a module
  variable.

### 4. Put the design back on

Read `references/sections.md`. A BackGold page arrives as an ordered list of
sections, each with a `type` (Hero, About, Issues, Faq, Cta, Collection, …)
and a `variant`, the Layout the owner chose. The site draws each one with a
component: `src/components/sections/index.ts` maps `'<Type>'` and
`'<Type>:<layout>'` to components.

The craft is in the mapping. For each distinctive piece of the old design,
pick the section type whose **content** matches it, and a layout name from
BackGold's own list for that type to stand for it. The layout names are
fixed by BackGold; what each one looks like is yours. A home page's animated
scene can be the Hero's `cover` layout; a pricing table can be a Collection's
`list` layout. Record every choice in the header comment of the component
and in the README, because the owner will pick these by name in BackGold's
page editor.

Rules that keep the result a real BackGold site:

- **Draw sections through the package's `<Section>`**, and menus, areas and
  the legal line through `<Menu>`/`menuOf`, `<Area>` and `<Disclaimer>`. They
  carry the Shows-on rules, the preview markers and the page-view header.
- **Never rebuild a form, a donation, a sign-up or a store.** They render as
  BackGold's frame through `<Embed>`. Style around the frame, not inside it.
- **No facts in components.** A phone number, a price or a name typed into a
  template is a bug: read it from BackGold. Design copy that is part of the
  drawing (an illustration's label, a button's verb) can stay.
- **A section type with no component still shows**: the package draws it
  plainly. Give it grounds and spacing in the stylesheet so it does not look
  broken.
- Keep the starter's `[...path].astro` as the one route for every address.
  Give a content type its own article component by switching on the type's
  key there.

### 5. Write the content plan, and have it entered

Content goes into BackGold, not into the repository's pages, and it is
entered in the BackGold app by the organization (or by you, with them, in
their account). Your part is to make that an afternoon of copying, not a
research project: write a **content plan** that names every thing to create,
with the exact labels and values.

Copy `assets/CONTENT-PLAN.example.md` to `CONTENT-PLAN.md` at the root of the
repository and fill it in from your survey: the content types and their
fields, every entry, the posts with their dates, each page as its ordered
sections with the Layout to pick, each form's fields and tags, the menus, and
the redirects. Keep long bodies as Markdown files beside it
(`content/services/battery.md`) so they can be pasted whole.

Three things make a plan usable:

- **Exact names.** The site's code reads the keys BackGold makes from the
  labels (`references/content-model.md`). Write the label, and the key you
  expect beside it, so a mismatch is caught when the type is made.
- **Everything, not a sample.** "And so on for the other seven services" is
  where conversions lose content. List all eight.
- **The order to enter it.** Types, then entries, then pages (a Collection
  needs its type to exist), then menus (a link needs its page). Say which
  pages need the site switched off hosted mode first: a hosted site, which
  this one is until its first deploy is promoted, keeps `/donate`, `/join`,
  `/store`, `/events` and the like for itself, and will not take the page
  drawn above the posts.

An organization that signed up earlier often has a site already, sometimes
under another name, sometimes holding the domain. Which site becomes the real
one is the owner's decision: ask, and say what each one holds. A second site
cannot take a domain the first still holds.

Until the content is entered the site has nothing to draw, so agree early
who enters it and when. You can build every component against one or two
entries and one page entered first.

### 6. Check it locally

On your machine the site reads BackGold with the site's **publishable key**
(on BackGold hosting it needs no key). BackGold makes it the first time the
site is switched to headless mode, on the site's Developer page. Ask the
organization for it; if the site was switched to get it, it must be switched
back before the first deploy, because a headless site refuses one. The key
only reads what the public site shows, but it still belongs in `.dev.vars`,
not in a committed file:

```
BACKGOLD_SITE_KEY=bg_site_pk_…
BACKGOLD_API_ORIGIN=https://api.backgold.com
```

Then `npm run dev`, and open every address from your survey. Compare each
against the old site side by side, at a phone width and a desktop width. Do
not stop at "it builds": a page that renders with a blank region, a missing
menu or a form frame with no fields is not done. Finish with:

```bash
npm run check   # 0 errors
npm run build   # writes dist/server/wrangler.json, which the CLI reads
```

### 7. Deploy: preview, then live, then the domain

`references/go-live.md` is the checklist, written so it can be handed to
whoever does the cutover. The order matters and is easy to get wrong:

1. Link the repository (`npx backgold link`, commit `backgold.json`).
2. Deploy a **preview** (`npx backgold deploy --preview <name>`) and check it
   on its preview address against the real content.
3. **Promote** (`npx backgold deploy --promote`, or merge when CI does it).
   Nothing public changes yet: a custom site is served only on its connected
   domain.
4. **Then** connect the domain. Connecting it before the first promote would
   serve BackGold's default rendering of the pages on the live domain.

Copy `assets/deploy.yml` to `.github/workflows/` so every pull request gets a
preview and `main` goes live. Copy `assets/template.json` to the repository
root and list in it only the layouts the site draws, so BackGold's page
editor offers exactly those.

### 8. Write up what changed

The pull request description is the handover. Give it these sections, in this
order, in plain words:

```
## What changed
## What was checked          (addresses opened, check and build results)
## Not checked               (be exact: a form never submitted is not "tested")
## Differences from the old site
## Before this can go live   (the people steps: grant, token, domain)
```

"Differences" is not optional. Things that commonly cannot carry over: a
privacy page of the site's own (BackGold draws `/privacy`), `sms:` and `tel:`
links inside BackGold-authored links, per-page `noindex`, anything a page
decided on the server from a cookie. List each one and what replaced it.

Leave the organization as tidy as you found it. If you made a site, a page or
a content type while working something out and it is not part of the result,
say so by name in the write-up so the owner can remove it.

## When something does not fit

- **The site needs a server feature BackGold hosting does not give** (its own
  database, a sign-in, a queue). Stop and say so. Part of the site may still
  convert, with that feature left on its own host and linked.
- **A fresh install fails on a missing export from `@backgold/content`.** The
  kit and the client are out of step: use `@backgold/astro` 0.4.3 or later
  with `@backgold/content` 0.7.0 or later.
- **`npm ci` fails in CI but installs locally.** Regenerate the lockfile in an
  empty directory holding only `package.json` (`npm install
  --package-lock-only`), not beside an installed `node_modules`.
- **A page publishes but the site shows the old words.** The site re-checks
  the content version at most once a minute. Wait, then look again.
- **The deploy says the site has no domain.** That is expected until step 7.4.

## Reference files

| File | Read it when |
| --- | --- |
| `references/content-model.md` | Deciding what becomes a page, a content type, a field or code; the limits on each |
| `references/sections.md` | Writing section components: every block type, its words, its layouts, and the mistakes that cost an afternoon |
| `references/hosting.md` | Porting anything that ran on a server; limits; previews; secrets |
| `references/go-live.md` | The cutover, or handing it to someone else |
