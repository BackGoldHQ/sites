# BackGold party template

The website template for a state political party on BackGold. It is an
[Astro](https://astro.build) site on Cloudflare Workers, built on the same two
public packages as BackGold's starter: [`@backgold/content`](https://www.npmjs.com/package/@backgold/content),
the typed client for the Content API, and [`@backgold/astro`](https://www.npmjs.com/package/@backgold/astro),
the plumbing (routing, caching, the webhook, preview, the SEO routes, menus
and areas). The party writes its pages, menus, posts, events and candidates
in BackGold; this template decides how they look.

A template is more than a theme. It says which layouts it draws for each kind
of section, where it puts the site's areas, how it draws an entry and a list
of each content type, and what its header and footer are. It says so in one
file, `template.json`, which BackGold's composer reads to offer only the
layouts this template draws.

## template.json

| Key | What it declares |
| --- | --- |
| `key`, `name`, `audience`, `version` | Which template this is (`party`), its name in BackGold, who it is for, and the manifest's version. |
| `variants` | For each section type the template draws, its layouts, the default first. Every list is a subset of the contract's catalogue and starts with the catalogue's default for that type. A section stored with a layout the template does not list draws as its default, and the composer says so. |
| `areas` | Where the layout puts each area BackGold sends, by area key, in words the composer shows. `unknown` says what happens to an area the template does not name (one the organization adds): `after_page` draws it after the page, full width, in the order BackGold lists the site's areas. |
| `entryLayouts` | For each routable built-in content type, the layout of one entry and of its list. A content type the organization adds uses the `post` layouts. |
| `chrome` | The header (`bar`), the footer (`columns`), and that the template draws the takeover banner and the legal line. |
| `starter` | What a new site on this template begins with: pages (as sections), the header and footer menus, and reusable sections with their rules. |

It never names a price, a plan, a section type outside the catalogue, or who
may see what. The schema is `siteTemplateManifestSchema` from BackGold's
`packages/shared/src/site-templates.ts`, which this repository holds in the
vendored contract (`vendor/backgold-contract`). This repository's `manifests`
CI job (`node scripts/check-manifests.mjs`) parses every
`templates/*/template.json` with it, so a manifest that passes here is one
BackGold can read.

BackGold's api and app read the manifest from the platform repository,
gitlab.com/backgold/backgold (private), which keeps its own copy at `packages/shared/site-templates/party.template.json`.
After a change to `template.json` merges here, refresh that copy in a platform
MR: copy the file to that path and run
`pnpm --filter @givegold/shared templates:build` there. Until then the
platform's `templates-drift` CI job, which compares its copy with this file
on this repository's `main`, shows yellow; it never fails a platform pipeline.

## Where the files live

The party template draws everything with the template kit,
[`packages/template-kit`](../../packages/template-kit) (`@backgold/template-kit`,
a private package of this workspace), which every BackGold template shares:
the section, entry and chrome components, the Site layout, `lib`, the
stylesheets and the routes. In what follows a path under `src/` is the
kit's (`packages/template-kit/src/…`) unless it says otherwise. This
directory holds only what is the party's:

| File | What it is |
| --- | --- |
| `template.json` | The manifest (below). |
| `src/template.ts` | The template's config for the kit: `template.json` parsed with the contract's schema (so a bad manifest fails the build), the kit's sections and entry layouts, and the party's two faces, Fraunces and Public Sans. A layout of the party's own would live under this directory's `src/components/` and be registered here. |
| `src/styles/template.css` | What the party draws differently from the kit's stylesheet: nothing, since the kit's values are the party's. It loads after the kit's on every page. |
| `astro.config.mjs` | Astro on Workers, with `@backgold/astro`'s integration and the kit's, `templateKit({ template: './src/template.ts' })`, which serves the kit's routes (`/preview`, `/backgold-setup`, the 404 and every other address) with this config. The template has no `src/pages`. |
| `wrangler.jsonc`, `package.json` | The Worker and its dependencies. |

## Layouts are files

Each section type the template draws has a directory under the kit's
`src/components/sections/`:

```
src/components/sections/
  Hero/index.astro         the default layout (the first one template.json lists)
  Hero/cover.astro         the 'cover' layout
  Hero/split.astro         the 'split' layout
  Hero/statement.astro     the 'statement' layout
  …
  Band.astro               the band every section sits in
  index.ts                 every type and layout, registered
```

`index.ts` registers `'Hero'` for `Hero/index.astro` and `'Hero:cover'` for
`Hero/cover.astro`, and so on for every layout `template.json` lists. The
package's `<Section>` looks a section up as `'<Type>:<layout>'` first, then
`'<Type>'`, then its own `DefaultSection`, and passes the layout to the
component as its `variant` prop. A layout that has no design of its own yet
is a file that draws the default with the same props:

```astro
---
import type { ComponentProps } from 'astro/types'
import Default from './index.astro'

type Props = ComponentProps<typeof Default>
---
<Default {...Astro.props} />
```

To give a layout its design, replace that file's contents; `index.ts` already
points at it. To add a layout every template can draw, add the file in the
kit and register it in `index.ts`; to add one only this template draws, add
the file under this directory's `src/components/sections/<Type>/` and
register it in `src/template.ts` (`sections: { ...kitSections,
'Hero:portrait': HeroPortrait }`). Either way, add it to the type's list in
`template.json`. The page's leading Hero (the one
whose headline is the page's `<h1>`) goes through the same lookup, with
`level={1}`.

## Entries and lists

A post, an episode, a video and a newsletter issue are entries, not pages of
sections: the operator writes them in BackGold and the template draws their
fields in a fixed order. `template.json`'s `entryLayouts` names one entry
layout and one list layout per routable built-in type, and each is a file
under the kit's `src/components/entries/`, registered in its `index.ts` as
`'<type>:<layout>'` (`kitEntries`, which `src/template.ts` passes as the
template's `entries`):

| Type | Entry layout | List layout |
| --- | --- | --- |
| `post` | `post/article.astro`: breadcrumb, terms, title, summary, byline with the reading time, the cover, the body in one serif reading column with a reading bar, the type's own fields, Share, and a box for each writer with their bio | `post/list.astro`: one post per row, its picture beside its category, title, summary, writer and date |
| `podcast` | `podcast/episode.astro`: the episode's art beside the browser's audio player (the entry's media file), then the show notes | `podcast/list.astro`: one episode per row with a Listen link |
| `video` | `video/watch.astro`: the video large first (a YouTube or Vimeo address in its player, a file in the browser's own player), the description under it | `video/grid.astro`: a grid of stills with a play mark |
| `newsletter` | `newsletter/issue.astro`: the issue's line over the title, the issue in the reading column, and a closing call to get the next one, which points to the sign-up in Above the footer when the page has one there | `newsletter/list.astro`: the past issues, newest first |

A content type the organization adds is drawn with the post layouts, its own
fields through `src/components/FieldValue.astro` by their kind, so it needs
no change here. The kit's `src/routes/catch-all.astro` picks the layout by
the entry's type (an entry) or the list's type (a list, or a category's or
tag's list), and `src/routes/preview.astro` draws a draft entry the same way.

BackGold serves the built-in post, podcast and video types as one list, News,
at the organization's blog address: `/news` for an organization made since
the address became its own, `/blog` for one that kept it (the Posts type's
address in BackGold, which the operator can change; the old address then
redirects). That list is drawn by the post list layout, and opens with its
intro when a published page sits at its address (the starter's `news`
page): the page's sections, its Hero's headline as the page's heading, above
the list. The newsletter has its own address, `/newsletters`, drawn by the
newsletter list layout, and the podcast and video list layouts are there for
when one of those types reports an address of its own. Every list offers its
categories (or its tags, when no listed entry has a category) as links to
each term's list, only the terms a listed entry carries, taken from the
list's first page. A list shows 50 entries a page, newest first: "Older"
under it goes on to the next page (`?cursor=`), and "Newest" goes back to
the first from any later page; a term's list pages the same way at its own
address. News is there only on a site with one of those built-in types: when
it merges more than one, it shows their newest 50 together and no pager (a
cursor names one type's list). News and its terms' lists carry a search box
("Search news"), which lists the posts whose title or summary matches.

Share under an entry is three plain links (Email, X, Facebook): an entry page
loads no script of its own.

## Starter content

What a new site on this template begins with is data in `template.json`'s
`starter`, which BackGold writes into the site when it is created. **All of
it is starter copy**, in the voice of a state party but naming none, and
BackGold flags every starter word until the organization replaces it, so
nothing placeholder goes live unnoticed. There are no names, no prices, no
plan names and no pictures (a section without its picture draws without
one).

- **Pages**, as sections in the contract's shape:
  - Home (`""`): Hero · Full photo, Stat cards · Ribbon, Key issues ·
    Numbered, Upcoming events · Cards, Blog · Lead story, Candidate roster ·
    Compact, Call to action · With photo.
  - About (`about`): Hero · Split, About · Letter, Stat cards · Row,
    Platform planks · Long read (anchored `platform`), Press quotes · Single.
  - Leadership (`leadership`): Hero · Statement, Team · Board, Candidate
    roster · Ballot, Call to action · Banner.
  - Events (`events`): Hero · Statement, Upcoming events · Calendar (a month
    grid on a desktop, the month as the Agenda's rows on a phone).
  - Donate (`donate`): the donation form in its Story layout, then Key issues
    · Cards with other ways to give.
  - Join (`join`): a call to action whose button goes to the organization's
    join page in BackGold (`{ "kind": "surface", "path": "/join" }`; BackGold
    sends the organization's own address for it).
  - Petition (`petition`): the petition in its Coverage layout, About ·
    Photo right, Key issues · Steps.
  - Contact (`contact`): Hero · Statement, the form in its Wide layout,
    About · Photo left, Coverage map · Map.

  News is the built-in post list at the organization's blog address
  (`/news` for a new organization); the starter's `news` page is its intro,
  a Hero · Statement drawn above the posts.
- **Starter rows.** Sections whose rows an author types (Key issues, Stat
  cards, Press quotes, Platform planks) carry placeholder rows under their
  own `data.source`; every stat's value is the words "Your figure", never a
  made-up number. Rows BackGold fills (events, posts, candidates, the team)
  are never starter content, and the schema refuses them. The operator
  replaces every row.
- **The header menu**: Home, About (a group: About, Platform, Leadership),
  News, Events, Petition, Contact, Join, and Donate as the header button,
  shown only on pages that take donations.
- **The footer menu**: The party (About, Platform, Leadership, Contact),
  Take part (Join, Events, Sign the petition), Read (News, Newsletter).
- **Reusable sections**: *Blog sidebar* (Upcoming events, then a call to
  become a member) in the Sidebar on every post and on News (the Events
  page's calendar is its own list of what is coming up); and
  *Join the newsletter* (BackGold's email sign-up) Above the footer on every
  page.

Every slug a menu link, a rule or a section link names is one of the starter
pages; a test in BackGold's `packages/shared/src/site-templates.test.ts`
checks it, along with the schema.

## Areas

An area is a place on the site that holds the same reusable sections on many
pages: a convention notice above the header, a newsletter sign-up over the
footer. The organization fills areas in BackGold, and each page, entry or
list arrives with its `areas`. The template places them as `template.json`
says, each with the package's `<Area>`:

- **Top banner** (`top_banner`), above the header, in `src/layouts/Site.astro`:
  a Call to action in its Strip layout is the slim announcement strip, a
  takeover banner fills the first screen before the page;
- **Sidebar** (`sidebar`), beside the main column of a page, an entry or a
  list, under it on a phone, in `src/routes/catch-all.astro` and
  `src/routes/preview.astro`; with nothing in it the page keeps one column.
  A page that opens with a Hero puts the Hero over both columns, so the
  sidebar starts under it. Every section in the sidebar is a card on its
  band's card colour, a call to action on the brand's ground, a rem apart.
  An event's page has no column beside it: its sidebar items draw under the
  event, full width;
- **Above the footer** (`above_footer`), over the footer, in `Site.astro`;
- **any other area**, after the page, full width, in the order BackGold lists
  the site's areas, in `Site.astro`.

The takeover banner is a `TakeoverBanner` section an area carries (most often
Top banner); `src/components/chrome/TakeoverBanner.astro` draws it as a
full-screen ask before the page, registered in `index.ts` so `<Area>` finds
it.

An item with a start or an end date is sent hidden and shown in the browser
while its dates hold, so a cached page still shows and hides it on time. An
area with nothing in it draws nothing.

## Header and footer

The organization edits one header menu and one footer menu in BackGold.

- **The header bar** (`Site.astro`, with `src/components/chrome/MenuList.astro`
  and `Brand.astro`) shows the site's logo, or the template's mark beside the
  name as a two-line wordmark ("Westmark" over "LIBERTY PARTY"), the header
  menu with each group as a dropdown, and the header button at the right. On
  a phone the menu opens as a sheet under the bar and the button stays beside
  Menu (which reads Close while the sheet is open); the sheet repeats the
  button full width under the menu, then the legal line, and the page behind
  it dims. The dropdowns and the sheet are `<details>` elements: they work
  with the keyboard and with scripts off.
- **The footer** (`Site.astro`, with `src/components/chrome/FooterColumns.astro`)
  shows the brand, the site's description and its social links, then the
  footer menu as columns, one per group, then the legal line, then the bottom
  row: the utility menu's links and "Powered by BackGold".

Each link has a **Shows on** rule, and the package's `menuOf` and
`<MenuButton>` apply it against the page being drawn: every route passes the
layout `page`, the BackGold page as `{ id, takes_donations }` or `null` on a
route with no BackGold page. The link marked as the header button leaves the
menu and is drawn at the right of the header on the pages its rule names.

## Restyle it

- **Spacing is the template's; the faces are the site's.** The kit's
  `src/styles/site.css` sets the type scale, the spacing, the radii and every
  component's shape, and this directory's `src/styles/template.css`, loaded
  after it, is where the party would set its own. The
  faces are the site's saved theme in BackGold when it has one: `/site`'s
  `theme.fonts` heading and body, which `src/lib/fonts.ts` declares as a hosted
  BackGold page does (`@font-face` rules for the woff2 files BackGold serves
  under `/lp-runtime`, on the site's own host first-party, else on the api's;
  a system face downloads nothing) and sets as `--site-font-heading` and
  `--site-font-body`. A site with no theme, or a slot its theme leaves empty,
  keeps the template's own faces, the `fonts` of this directory's
  `src/template.ts`: Fraunces for headings and numerals, Public Sans for text,
  both from Google Fonts. `Site.astro` loads whichever applies.
- **Colours are the organization's.** `src/lib/brand.ts` turns the brand
  colours set in BackGold into CSS custom properties, a light set and a dark
  set: `--bg-brand-primary`,
  `--bg-brand-secondary`, `--bg-brand-accent`, and for each band `--band-<band>`
  with its `-ink`, `-muted`, `-accent`, `-link`, `-button`, `-button-ink`,
  `-button-2`, `-button-2-ink`, `-surface`, `-line` and `-line-strong`, each
  text colour chosen to meet WCAG AA on its ground whatever the brand is. A
  brand colour that already reads stays itself: the accent is taken darker
  (light grounds) or lighter (dark grounds) only as far as AA needs, up to
  seven twentieths of the way before the band's ink takes over, and in
  dark mode the main call's fill only as far as 3:1 against the page. A button
  keeps its own ink wherever it sits, the header included. `site.css` reads
  only these names; it has no colour of its own.
- **Light and dark.** The site's appearance in BackGold picks the set: always
  light, always dark, or (the default) the visitor's device, with a switch in
  the header (`src/components/chrome/ModeToggle.astro`) that overrides it and
  is remembered in the browser as `data-gg-mode` on `<html>`, the same
  attribute and storage key a hosted BackGold site's switch uses.
- **Bands.** Each section has a `band` (`plain`, `tint`, `panel`, `wash`,
  `contrast`) and a `bleed` (`full` or `contained`), as the classes
  `bg-band-<band>` and `bg-bleed-<bleed>`. Inside a section use the short
  names `--ink`, `--muted`, `--accent` (kickers, numerals, date lines),
  `--link`, `--button` and `--button-ink` (the main call), `--button-2` and
  `--button-2-ink` (the quieter solid button), `--surface` (cards), `--line`
  and `--line-strong`. Words over a photo take the class `on-photo`. The
  footer sits on the contrast band.

Every link and image address that reaches a page goes through `safeHref` or
`safeSrc` from `@backgold/astro/server`, and BackGold's rich text through its
sanitizer. Keep that in every component you write.

## Donations, forms and petitions are BackGold's

**Money and consent never pass through template code.** Donate, forms,
petitions, sign-ups, the store, events, the calendar, polls and contacting
legislators arrive as BackGold's own module: a frame BackGold serves, placed
through the package's `Embed`. The template draws only the frame around it,
one component per layout like any section (`src/components/sections/Donate/`,
`FormBlock/`, `SignupCapture/`, …): the section's heading (and a sign-up's
kicker and lede), the card and the story beside a donate form. BackGold is
credited once, as "Powered by BackGold" in the footer's bottom row, never per
module. Each goes through `modules/ModuleFrame.astro`, which asks BackGold's
frame to wear the site (BackGold's embed look): the layout, the colours where
the module sits (`moduleLook` in `src/lib/brand.ts`, light and dark), the
radius and the type.
The frame then draws no ground, card, heading or footer of its own, and
follows the header's light and dark switch.

Never cover, restyle or imitate what is inside the frame, and never collect
donations, signatures, sign-ups or consent in a form of your own. Profile
frames (SocialFrame) have no frame a site can place and are not drawn.

A module BackGold sends with nothing to frame (an organization with no
donation form yet, a petition section with no petition picked) still draws
its section's words, and where the frame would be, one line saying the module
is not available ("Online donations are not available right now.", the words
a hosted BackGold page uses), never nothing.

In a preview (`src/routes/preview.astro`), the form, poll and sign-up frames
that show the draft arrive with the preview link's token on their address:
they show the draft as it stands, say they are a preview, and send nothing.
The donate, petition, event and store frames are addressed by their record,
not by the page, and are the same in a preview as on the published page.

**Each event's page** is `/events/<slug>` on the site (board A7's address):
every events list links there, and `src/components/EventPage.astro` draws a
breadcrumb back to Events over BackGold's event frame (its details, RSVP and
tickets), read from the Content API's `GET /events/<slug>`.

**The events calendar** (Upcoming events · Calendar) shows a month at a
time: `?month=YYYY-MM` on the page's address, else this month. It reads the
month from the Content API's `GET /events?from=&to=` (past days included),
and its arrows and type tabs are plain addresses. A page with a calendar is
never stored in the edge cache, because the month in view and today move
with the clock and `?month=` is not part of the cache's key.

**The Join page** is a call to action (a `Cta` section) whose button goes to
the organization's join address in BackGold, until BackGold has a Membership
section a template can draw.

## The legal line

The footer shows the site's disclaimer ("Paid for by …") on every page,
through the package's `<Disclaimer>`, from what the organization set in
BackGold. It is **required by law**, and BackGold checks the live home page for
it every hour. Restyle it as you like, but keep it on every page, as text in
the HTML the server sends, and never type its words into the template.

## Settings

| Name | Kind | Needed | What it is |
| --- | --- | --- | --- |
| `BACKGOLD_SITE_KEY` | variable | yes | The site's publishable key, `bg_site_pk_…`, from **Developer → Keys**. It only reads what the public site shows. |
| `SITE_URL` | variable | set it in production | The site's public address. Used for canonical links, the sitemap and feeds. |
| `BACKGOLD_API_ORIGIN` | variable | no | Where the Content API lives. Keep `https://api.backgold.com`. |
| `BACKGOLD_CACHE` | KV namespace | no | Where the site keeps its BackGold reads, the last content version and the Coverage map's geometry, shared by every copy of the Worker. |
| `BACKGOLD_SECRET_KEY` | secret | for previews | A secret key, `bg_site_sk_…`, from **Developer → Keys**. Only the `/preview` page uses it. |
| `BACKGOLD_WEBHOOK_SECRET` | secret | for the webhook | The webhook endpoint's signing secret, `whsec_…`, from **Developer → Webhooks**. |

Variables live in `wrangler.jsonc`; secrets are set with
`npx wrangler secret put <NAME>` or in the dashboard, never committed. The
starter's README (`templates/astro-starter`) walks through connecting a site
step by step; the steps are the same here.

## Develop locally

Requires Node 22.12 or later and pnpm (the version the repository root's
`package.json` names in `packageManager`). The template is part of this repository's
pnpm workspace and depends on `@backgold/astro`, `@backgold/content` and
`@backgold/template-kit` as `workspace:^` (and on the vendored contract,
`@backgold/contract`, as `workspace:*`), so it builds against the packages in
`packages/`, not the copies on npm. From the repository root:

```bash
pnpm install
pnpm --filter @backgold/content build
pnpm --filter @backgold/astro build
```

The template reads each package's built `dist/`, so build a package again
after changing it; the kit has no build, and a change to it shows at once. Then, in `templates/party` (or from the root as
`pnpm --filter backgold-template-party run <script>`):

| Command | |
| --- | --- |
| `pnpm run dev` | Astro's dev server on workerd, reloading as you edit. |
| `pnpm run preview` | Build, then serve the built Worker with `wrangler dev`. |
| `pnpm run deploy` | Build and deploy with `wrangler deploy`. |
| `pnpm run check` | Type-check the project with `astro check`. |
| `pnpm run types` | Write `src/backgold.d.ts` from the site's content types. |

The kit and the contract are private to this workspace and not on npm, so a
copy of the template outside this repository installs only with their
tarballs (`pnpm pack` in each), as the end-to-end check below installs it.

In this repository, `node scripts/starter-e2e.mjs --template party` builds
this template against the packages' current source and checks it end to end
against a fixture Content API (`--serve` keeps it running to look at).

## Staging deploy

BackGold runs this template on staging as one Worker, `template-party`, in
the Workers for Platforms dispatch namespace `sites-staging` in BackGold's
Cloudflare account. The staging api Worker answers every `*.backgold.dev`
host; for a site on the party template it hands the request to the
namespace's Worker `template-<template key>` (the key is `party`, from
`template.json`) with the site's id in the `X-BackGold-Site` header. The
Worker reads the Content API first-party, through the `BACKGOLD_API` service
binding to the api's `FirstParty` entrypoint, with no site key, and draws the
site the header names at the request's own address. One deploy serves every
party-template site on staging; the Westmark Liberty Party demo at
`https://westmark.backgold.dev` (the `seed-westmark` fixture's site,
`dom_westmark`) is the first.

The `env.staging` block in `wrangler.jsonc` holds that form: the name, the
service binding (Worker `givegold-api-staging`, entrypoint `FirstParty`),
`BACKGOLD_API_ORIGIN` = `https://api.backgold.dev`, and the cache's KV
namespace. It has no routes, Custom Domain or `workers.dev` address: a Worker
in a dispatch namespace is reached only through the api's dispatch, so the
deploy touches no DNS. A copy of this template for another organization can
delete the block; the default configuration above it is what the Deploy
button and `npm run deploy` use.

**Account setup.** In place today: the dispatch namespace `sites-staging`,
the KV namespace `backgold-party-staging-cache` with its id in the
`PARTY_STAGING_KV_ID` CI variable, and `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, each a masked, protected project variable on this
repository, so only `main` pipelines see them. To set it up again from
nothing, in BackGold's account, in this order:

1. Create the dispatch namespace `sites-staging`, with the `cf` CLI
   (`cf workers-for-platforms dispatch-namespaces create --name sites-staging`)
   or with wrangler (`npx wrangler dispatch-namespace create sites-staging`),
   whichever the operator uses.
2. Create the cache's KV namespace and put its id in the
   `PARTY_STAGING_KV_ID` CI variable (a GitLab project variable on this
   repository, masked and protected, so only `main` pipelines see it):
   `npx wrangler kv namespace create backgold-party-staging-cache`, then
   `glab variable set PARTY_STAGING_KV_ID <id> --masked --protected -R backgold/sites`.
3. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` on this repository,
   masked and protected, under **Settings → CI/CD → Variables** (or with
   `glab variable set … -R backgold/sites`). The two deploy jobs exist only
   while `CLOUDFLARE_API_TOKEN` is set. This repository is the only one that
   deploys `template-party`.

The job needs no site key and no secrets: a first-party read needs no key,
`/preview` reads drafts through the same binding, and the api keeps `/api/*`
on every site host, so the template's webhook route
(`/api/backgold/webhook`) is never reached and needs no signing secret.

**The job.** `deploy-party-staging` in this repository's `.gitlab-ci.yml`
runs by itself on a push to `main` that changed `templates/party/`,
`packages/`, `vendor/`, `pnpm-lock.yaml` or `.gitlab-ci.yml`, and is a
manual job, never blocking, on every other `main` pipeline, to redeploy by
hand. It deploys the template and the packages as committed in the pipeline
it runs in, built from this workspace, so it never waits on npm; play it by
hand on the newest `main` pipeline. After the pipeline's
`pnpm install --frozen-lockfile`, it:

1. refuses to start without `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`, or without a `PARTY_STAGING_KV_ID` that is a
   32-character namespace id;
2. writes `PARTY_STAGING_KV_ID` over the `__PARTY_STAGING_KV_ID__`
   placeholder in `wrangler.jsonc`, and stops when there is no placeholder;
3. reads the namespace `sites-staging` and stops, saying it does not exist
   on this account, when step 1 of the one-time list has not been done;
4. builds `@backgold/content` and `@backgold/astro`, then the template with
   `CLOUDFLARE_ENV=staging pnpm --filter backgold-template-party build`. The
   Cloudflare adapter writes the deploy configuration
   (`dist/server/wrangler.json`) during the build and picks the environment
   then, so `wrangler deploy --env staging` on its own would deploy the
   default configuration. The job refuses to deploy unless the built
   configuration names `template-party`;
5. uploads with
   `pnpm --filter backgold-template-party exec wrangler deploy --dispatch-namespace sites-staging`.

**How to tell it worked.** The job's log ends with `Dispatch Namespace:
sites-staging` and the new version's id. The namespace's script list shows
`template-party`:
`cf workers-for-platforms dispatch-namespaces scripts list --dispatch-namespace sites-staging`.
`https://westmark.backgold.dev/` answers with the Westmark home page.

**Content never needs a redeploy.** Publishing in BackGold bumps the site's
content version, the client notices within a minute when it next checks the
version, and a new version is a miss in the site's cache. A change to the
template or the packages deploys with the push to `main` that carries it;
play the job by hand only to redeploy what is already there.

## Production deploy

BackGold runs this template in production the same way as on staging: one
Worker, `template-party`, in the Workers for Platforms dispatch namespace
`sites-production` in BackGold's Cloudflare account. The production api Worker
(`backgold-api`, which binds the namespace as `SITES`) answers every
`*.backgold.com` host and each verified tenant custom domain; for a site on
the party template it hands the request to the namespace's Worker
`template-<template key>` with the site's id in the `X-BackGold-Site` header,
and the Worker reads the Content API first-party through the `BACKGOLD_API`
service binding to the api's `FirstParty` entrypoint, with no site key.

**While `sites-production` holds no `template-party` script, every
production template site answers 503 "This site isn't ready yet."** (with a
`Retry-After` of 60 seconds). The namespace holds one today; a new namespace
holds none until the job is played.

The `env.production` block in `wrangler.jsonc` holds that form: the name, the
service binding (Worker `backgold-api`, entrypoint `FirstParty`),
`BACKGOLD_API_ORIGIN` = `https://api.backgold.com`, and the cache's KV
namespace. Like staging's it has no routes, Custom Domain or `workers.dev`
address, and sets neither `BACKGOLD_SITE_KEY` nor `SITE_URL`: the dispatch
names the site per request.

**Account setup.** In place today: the dispatch namespace `sites-production`
holding `template-party`, the KV namespace `backgold-party-production-cache`
with its id in the `PARTY_PRODUCTION_KV_ID` CI variable, and the two
Cloudflare variables staging uses. To set it up again from nothing, in
BackGold's account, in this order. There is more than one Cloudflare account
on the operator's login, so every command below names the account
(`247651947e3b35805b31daef5ab9eab9`):

1. Make sure the dispatch namespace `sites-production` exists. The production
   api's deploy binds it, so it may already be there: read it with
   `CLOUDFLARE_ACCOUNT_ID=247651947e3b35805b31daef5ab9eab9 npx wrangler dispatch-namespace get sites-production`
   (from `templates/party`, or anywhere wrangler runs). Only when that reports
   it missing, create it, with the `cf` CLI
   (`CLOUDFLARE_ACCOUNT_ID=247651947e3b35805b31daef5ab9eab9 cf workers-for-platforms dispatch-namespaces create --name sites-production`)
   or with wrangler
   (`CLOUDFLARE_ACCOUNT_ID=247651947e3b35805b31daef5ab9eab9 npx wrangler dispatch-namespace create sites-production`),
   whichever the operator uses.
2. Create the cache's KV namespace, a new one, never staging's
   `backgold-party-staging-cache`:
   `CLOUDFLARE_ACCOUNT_ID=247651947e3b35805b31daef5ab9eab9 npx wrangler kv namespace create backgold-party-production-cache`.
   Copy the `id` it prints (32 hex characters).
3. Put that id in the `PARTY_PRODUCTION_KV_ID` CI variable, a GitLab project
   variable on this repository, masked and protected so only `main`
   pipelines see it:
   `glab variable set PARTY_PRODUCTION_KV_ID <id> --masked --protected -R backgold/sites`.
   It is the only variable production adds. Staging reads `PARTY_STAGING_KV_ID`
   and nothing else of its own; both jobs use `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` (staging's step 3), and need no site key and no
   secrets.
4. Check the one thing the job cannot fix: the production api must already
   be deployed with the `FirstParty` entrypoint, because the service binding
   names `backgold-api` and that export; if production's api predates it,
   play `deploy-api-production` on the platform repository's pipeline first.
5. Play `deploy-production` on a `main` pipeline, the newest one; it runs
   `deploy-party-production` (and the other templates' production jobs).

**The job.** `deploy-party-production` in this repository's `.gitlab-ci.yml`
runs on a `main` pipeline once the `deploy-production` button has been played
there (environment `production`, resource group `party-production`); it is
never played on its own and the unplayed button never blocks the pipeline. It is `deploy-party-staging` with
the production names, step for step (see Staging deploy above): it refuses to
start without `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and a
`PARTY_PRODUCTION_KV_ID` that is a 32-character namespace id, writes the id
over the `__PARTY_PRODUCTION_KV_ID__` placeholder in `wrangler.jsonc`, reads
the namespace `sites-production` and stops, saying it does not exist on this
account, when step 1 was not done, builds the two packages from this
workspace and the template with
`CLOUDFLARE_ENV=production pnpm --filter backgold-template-party build`,
refuses to deploy unless the built configuration names `template-party`, and
uploads with
`pnpm --filter backgold-template-party exec wrangler deploy --dispatch-namespace sites-production`.

**How to tell it worked.** The job's log ends with `Dispatch Namespace:
sites-production` and the new version's id. The namespace now holds one
script (`script_count: 1` in
`CLOUDFLARE_ACCOUNT_ID=247651947e3b35805b31daef5ab9eab9 npx wrangler dispatch-namespace get sites-production`;
the list is
`CLOUDFLARE_ACCOUNT_ID=247651947e3b35805b31daef5ab9eab9 cf workers-for-platforms dispatch-namespaces scripts list --dispatch-namespace sites-production`),
and a production site in template mode answers with its home page on its
`*.backgold.com` address instead of the 503.

**Content never needs a redeploy**, in production either; play the job again
only for a template change or a package update.

## License

MIT.
