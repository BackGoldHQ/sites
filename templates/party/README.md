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
may see what. The schema is `siteTemplateManifestSchema` in BackGold's
`packages/shared/src/site-templates.ts`, and a test there parses this file.

## Layouts are files

Each section type the template draws has a directory under
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
points at it. To add a layout, add it to the type's list in `template.json`,
add the file, and register it in `index.ts`. The page's leading Hero (the one
whose headline is the page's `<h1>`) goes through the same lookup, with
`level={1}`.

## Entries and lists

A post, an episode, a video and a newsletter issue are entries, not pages of
sections: the operator writes them in BackGold and the template draws their
fields in a fixed order. `template.json`'s `entryLayouts` names one entry
layout and one list layout per routable built-in type, and each is a file
under `src/components/entries/`, registered in its `index.ts` as
`'<type>:<layout>'`:

| Type | Entry layout | List layout |
| --- | --- | --- |
| `post` | `post/article.astro`: breadcrumb, terms, title, summary, byline with the reading time, the cover, the body in one serif reading column with a reading bar, the type's own fields, Share, and a box for each writer with their bio | `post/list.astro`: one post per row, its picture beside its category, title, summary, writer and date |
| `podcast` | `podcast/episode.astro`: the episode's art beside the browser's audio player (the entry's media file), then the show notes | `podcast/list.astro`: one episode per row with a Listen link |
| `video` | `video/watch.astro`: the video large first (a YouTube or Vimeo address in its player, a file in the browser's own player), the description under it | `video/grid.astro`: a grid of stills with a play mark |
| `newsletter` | `newsletter/issue.astro`: the issue's line over the title, the issue in the reading column, and a closing call to get the next one, which points to the sign-up in Above the footer when the page has one there | `newsletter/list.astro`: the past issues, newest first |

A content type the organization adds is drawn with the post layouts, its own
fields through `src/components/FieldValue.astro` by their kind, so it needs
no change here. `src/pages/[...path].astro` picks the layout by the entry's
type (an entry) or the list's type (a list, or a category's or tag's list),
and `src/pages/preview.astro` draws a draft entry the same way.

BackGold serves the built-in post, podcast and video types as one list at
`/blog`, so that list, News, is drawn by the post list layout. The
newsletter has its own address, `/newsletters`, drawn by the newsletter
list layout, and the podcast and video list layouts are there for when one
of those types reports an address of its own. Every list offers its
categories (or its tags, when no listed entry has a category) as links to
each term's list, only the terms a listed entry carries, taken from the
list's first page. A list shows 50 entries a page, newest first: "Older"
under it goes on to the next page (`?cursor=`), and "Newest" goes back to
the first from any later page; a term's list pages the same way at its own
address. `/blog` pages only on a site with one of those built-in types:
when it merges more than one, it shows their newest 50 together and no
pager (a cursor names one type's list). There is no search: the Content API
has none.

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

  News is the built-in post list at `/blog`, not a page.
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
  list, under it on a phone, in `src/pages/[...path].astro` and
  `src/pages/preview.astro`; with nothing in it the page keeps one column;
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

- **Type and spacing are the template's.** `src/styles/site.css` sets the type
  scale (Fraunces for headings and numerals, Public Sans for text, both from
  Google Fonts, loaded in `Site.astro`), the spacing, the radii and every
  component's shape.
- **Colours are the organization's.** `src/lib/brand.ts` turns the brand
  colours set in BackGold into CSS custom properties, a light set and a dark
  set: `--bg-brand-primary`,
  `--bg-brand-secondary`, `--bg-brand-accent`, and for each band `--band-<band>`
  with its `-ink`, `-muted`, `-accent`, `-link`, `-button`, `-button-ink`,
  `-button-2`, `-button-2-ink`, `-surface`, `-line` and `-line-strong`, each
  text colour chosen to meet WCAG AA on its ground whatever the brand is.
  `site.css` reads only these names; it has no colour of its own.
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
`FormBlock/`, `SignupCapture/`, …): the section's heading, the card and the
story beside a donate form. BackGold is credited once, as "Powered by
BackGold" in the footer's bottom row, never per module. Each goes
through `modules/ModuleFrame.astro`, which asks BackGold's frame to wear the
site (BackGold's embed look): the layout, the colours where the module sits
(`moduleLook` in `src/lib/brand.ts`, light and dark), the radius and the type.
The frame then draws no ground, card, heading or footer of its own, and
follows the header's light and dark switch.

Never cover, restyle or imitate what is inside the frame, and never collect
donations, signatures, sign-ups or consent in a form of your own. Profile
frames (SocialFrame) have no frame a site can place and are not drawn.

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
| `BACKGOLD_CACHE` | KV namespace | no | Where the site keeps its BackGold reads and the last content version, shared by every copy of the Worker. |
| `BACKGOLD_SECRET_KEY` | secret | for previews | A secret key, `bg_site_sk_…`, from **Developer → Keys**. Only the `/preview` page uses it. |
| `BACKGOLD_WEBHOOK_SECRET` | secret | for the webhook | The webhook endpoint's signing secret, `whsec_…`, from **Developer → Webhooks**. |

Variables live in `wrangler.jsonc`; secrets are set with
`npx wrangler secret put <NAME>` or in the dashboard, never committed. The
starter's README (`templates/astro-starter`) walks through connecting a site
step by step; the steps are the same here.

## Develop locally

Requires Node 22.12 or later.

```bash
npm install
```

| Command | |
| --- | --- |
| `npm run dev` | Astro's dev server on workerd, reloading as you edit. |
| `npm run preview` | Build, then serve the built Worker with `wrangler dev`. |
| `npm run deploy` | Build and deploy with `wrangler deploy`. |
| `npm run check` | Type-check the project with `astro check`. |
| `npm run types` | Write `src/backgold.d.ts` from the site's content types. |

In BackGold's repository, `node scripts/starter-e2e.mjs --template party`
builds this template against the packages' current source and checks it end
to end against a fixture Content API (`--serve` keeps it running to look at).

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

**Once, before the first run**, in BackGold's account, in this order:

1. Create the dispatch namespace `sites-staging`, with the `cf` CLI
   (`cf workers-for-platforms dispatch-namespaces create --name sites-staging`)
   or with wrangler (`npx wrangler dispatch-namespace create sites-staging`),
   whichever the operator uses.
2. Create the cache's KV namespace and put its id in the
   `PARTY_STAGING_KV_ID` CI variable (a GitLab project variable, masked and
   protected, so only `main` pipelines see it):
   `npx wrangler kv namespace create backgold-party-staging-cache`.

The job also uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, as
every staging deploy does. It needs no site key and no secrets: a
first-party read needs no key, `/preview` reads drafts through the same
binding, and the api keeps `/api/*` on every site host, so the template's
webhook route (`/api/backgold/webhook`) is never reached and needs no signing
secret.

**Merge order.**

1. The `@backgold/astro` 0.3.0 release, which takes the site from
   `X-BackGold-Site` and pages lists, goes to npm first. This template
   pins `^0.3.0`, and the job's range check refuses to deploy until npm
   has it.
2. This deploy (the `env.staging` block and the job).
3. The api's dispatch, which sends party-template sites to the namespace.
4. The seed with the Westmark site in template mode (`seed:staging`).

**The job.** `deploy-party-staging` in BackGold's `.gitlab-ci.yml` is a
manual job on every `main` pipeline; it never runs by itself and never
blocks the pipeline. It deploys this template as committed in the pipeline
it is played from, so play it on the newest one. It:

1. refuses to start without a `PARTY_STAGING_KV_ID` that is a 32-character
   namespace id;
2. checks that the `@backgold/astro` and `@backgold/content` ranges in
   `package.json` resolve on npm (as the starter sync does) and stops with
   "publish it first" when one does not;
3. writes `PARTY_STAGING_KV_ID` over the `__PARTY_STAGING_KV_ID__`
   placeholder in `wrangler.jsonc`, then `npm install` (from npm, not the
   monorepo; the template has no lockfile);
4. reads the namespace `sites-staging` and stops, saying it does not exist
   on this account, when step 1 of the one-time list has not been done;
5. builds with `CLOUDFLARE_ENV=staging npm run build`. The Cloudflare adapter
   writes the deploy configuration (`dist/server/wrangler.json`) during the
   build and picks the environment then, so `wrangler deploy --env staging`
   on its own would deploy the default configuration. The job refuses to
   deploy unless the built configuration names `template-party`;
6. uploads with `npx wrangler deploy --dispatch-namespace sites-staging`.

**How to tell it worked.** The job's log ends with `Dispatch Namespace:
sites-staging` and the new version's id. The namespace's script list shows
`template-party`:
`cf workers-for-platforms dispatch-namespaces scripts list --dispatch-namespace sites-staging`.
Once the api's dispatch and the Westmark seed are in, `https://westmark.backgold.dev/`
answers with the Westmark home page.

**Content never needs a redeploy.** Publishing in BackGold bumps the site's
content version, the client notices within a minute when it next checks the
version, and a new version is a miss in the site's cache. Play the job again
only for a template change or a package update.

## License

MIT.
