# BackGold candidate template

The website template for one candidate, or one race, on BackGold. It is an
[Astro](https://astro.build) site on Cloudflare Workers, built on the same two
public packages as BackGold's starter: [`@backgold/content`](https://www.npmjs.com/package/@backgold/content),
the typed client for the Content API, and [`@backgold/astro`](https://www.npmjs.com/package/@backgold/astro),
the plumbing (routing, caching, the webhook, preview, the SEO routes, menus
and areas). The campaign writes its pages, menus, posts and events in
BackGold; this template decides how they look.

It is drawn to boards C1 to C11 and the C catalogue
(`docs/design/sites-unification-2026-10/mockups` in the platform repository,
README §17). The boards use the party template's CSS (set A), so the two
templates read as one family: what changes is the display face, a condensed
one, and what a condensed face needs around it. The colours are the
campaign's brand, set in BackGold.

## template.json

| Key | What it declares |
| --- | --- |
| `key`, `name`, `audience`, `version` | Which template this is (`candidate`), its name in BackGold (Candidate), who it is for (`candidate`), and the manifest's version. |
| `variants` | For each section type the template draws, its layouts, the default first. Every list is a subset of the contract's catalogue and starts with the catalogue's default for that type. A section stored with a layout the template does not list draws as its default, and the composer says so. Hero adds `portrait`, QuoteStrip lists `wall`, Countdown lists `banner`, `tiles` and `inline`. |
| `areas` | Where the layout puts each area BackGold sends: Top banner above the header, the Sidebar beside the page (under it on a phone), Above the footer just above it. `unknown` is `after_page`: an area the organization adds is drawn after the page, full width. |
| `entryLayouts` | For each routable built-in content type, the layout of one entry and of its list: post (`article`, `list`), podcast (`episode`, `list`), video (`watch`, `grid`), newsletter (`issue`, `list`), as the party template's. A content type the organization adds uses the post layouts. There is no `press_release` row: that built-in is not shipped, and the manifest schema does not know it yet. |
| `chrome` | The header (`bar`), the footer (`columns`), and that the template draws the takeover banner and the legal line. |
| `starter` | What a new site on this template begins with: pages (as sections), the header and footer menus, and reusable sections with their rules (`starter.sections`). |

It never names a price, a plan, a person, a section type outside the
catalogue, or who may see what. The schema is `siteTemplateManifestSchema`
from the vendored contract (`vendor/backgold-contract`); this repository's
`manifests` CI job (`node scripts/check-manifests.mjs`) parses every
`templates/*/template.json` with it, so a manifest that passes here is one
BackGold can read. After a change to `template.json` merges here, refresh the
platform's copy (`packages/shared/site-templates/candidate.template.json`) in a
platform PR and run `pnpm --filter @givegold/shared templates:build` there.

## Where the files live

The template draws everything with the template kit,
[`packages/template-kit`](../../packages/template-kit) (`@backgold/template-kit`),
which every BackGold template shares: the section, entry and chrome
components, the Site layout, `lib`, the stylesheets and the routes. The
party template's README describes the kit's parts (areas, header and footer,
entries and lists, module frames, the legal line); they are the same here.
This directory holds only what is the candidate's:

| File | What it is |
| --- | --- |
| `template.json` | The manifest (above). |
| `src/template.ts` | The template's config for the kit: `template.json` parsed with the contract's schema (so a bad manifest fails the build), the kit's sections with this template's own layouts added, the kit's entry layouts, and its two faces, Barlow Condensed and Public Sans. |
| `src/components/sections/` | The template's own layouts (below). |
| `src/styles/template.css` | What the template draws differently from the kit's stylesheet (below). It loads after the kit's on every page. |
| `astro.config.mjs` | Astro on Workers, with `@backgold/astro`'s integration and the kit's, `templateKit({ template: './src/template.ts' })`, which serves the kit's routes with this config. The template has no `src/pages`. |
| `wrangler.jsonc`, `package.json` | The Worker (`template-candidate` in BackGold's dispatch namespaces) and its dependencies. |

## Its own layouts

Three layouts the kit does not draw, and two it draws differently, each a
file under `src/components/sections/<Type>/` registered in `src/template.ts`:

- **Hero · portrait** (`Hero/portrait.astro`, `'Hero:portrait'`; boards C1
  and C9). The office line small above (the Hero's `kicker`: "State Senate ·
  District 9"), the candidate's name as the headline set large in capitals at
  the left, the line under it and two buttons, and the portrait at the right,
  standing on the band's floor over a stripe in the brand's accent (the
  office line's rule too), in both sets. On a phone the portrait follows the
  words, still on the floor. Without a portrait the
  words take the full width. Leading the page, its headline is the page's
  `<h1>`.
- **Countdown · tiles** (`Countdown/tiles.astro`, `'Countdown:tiles'`; C1).
  The heading and the day at the left, and the days, hours and minutes left
  as three tiles at the right. Pages are cached until the content changes, so
  the server writes only the deadline and the visitor's browser counts the
  tiles, ticking once a minute (set once and left when the visitor asks for
  reduced motion). Without script the heading and the day read plainly and no
  tiles are drawn.
- **Countdown · inline** (`Countdown/inline.astro`, `'Countdown:inline'`;
  C5's sidebar). One line, "26 days", under the heading set small and over
  the day; in the Sidebar it sits on a card, as every sidebar section does.
- **Issues · cards** (`Issues/cards.astro`, `'Issues:cards'`; C1 and C7). The
  kit's cards (raised, on the band's card colour), each counted in a disc,
  "1", "2", "3". The party's A8 draws the same cards uncounted, which is what
  the kit draws on its own.
- **QuoteStrip · wall** (`QuoteStrip/wall.astro`, `'QuoteStrip:wall'`, in
  place of the kit's; C4). The endorsements wall: name cards, four across, each
  the endorser's logo (or the initials of the name in a disc), the name and
  the role; a row with words is a quote card spanning two columns. One
  section is one group (Organizations, Elected officials, Neighbors). The
  kit's `wall` is a masonry of quotes, which is not what C4 draws.

Both Countdown layouts hide themselves once the deadline has passed, and a
page rendered after it draws no countdown at all.

## What template.css changes

- **The faces.** `--font-display` is Barlow Condensed (and `--font` Public
  Sans) whenever the site's saved theme in BackGold names no face for that
  slot; a theme's faces win, as on every template. The h2 and h3 sizes are
  larger, as a condensed face needs, and headings sit closer to normal
  tracking.
- **The wordmark** is set in capitals, its second line muted.
- **Long reading stays in the body face**: a post's body and the About
  letter are set in Public Sans; the drop cap keeps the display face.
- **One gold affordance** (C-7): the accent's filled button is Donate's
  alone, the header button and the donation form. Everywhere else on the
  page and in its areas the main call takes the quieter solid button's
  colours (the primary, or the light ink on a dark band), so a call to
  action, an RSVP or a current tab is never gold.
- **The header button on its own page** (C-6): on a page that carries the
  donation form, the header's Donate is an outline, so the form's Donate is
  the page's one gold affordance.
- **The editorial quote** (QuoteStrip · single) is set upright and bold, as
  C4 draws it.

Everything else the C boards draw is the kit's: the event rows (C1), the
sidebar's cards a rem apart and its start under the page's opening Hero
(C5), Cta · card and the quiet title over it (C8), the counted platform
(C3), the news list's lead post (C10), and the accent taken darker, not to
ink, on light bands.

## Starter content

What a new site on this template begins with is data in `template.json`'s
`starter`, which BackGold writes into the site when it is created. **All of
it is starter copy**, in a candidate's voice but naming none: the boards'
words with every name, place and figure made generic ("the candidate", "the
district", "Your figure"). BackGold flags every starter word until the
campaign replaces it. There are no names, no prices, no plan names and no
pictures (a section without its picture draws without one).

- **Pages**, as sections in the contract's shape:
  - Home (`""`): Hero · portrait (on the contrast band), Countdown · tiles,
    Issues · cards, EventsList · list (three, with RSVP buttons, and All
    events to the Events page in its head), Blog · cards (three), Cta ·
    banner.
  - Meet the candidate (`about`): Hero · split, About · letter (anchored
    `why`, signed with the role line), StatCards · row, QuoteStrip · row
    (All endorsements to the Endorsements page in its head).
  - Issues (`issues`): Hero · statement, Issues · numbered, PlatformPlanks ·
    longread (anchored `platform`).
  - Endorsements (`endorsements`): Hero · statement, QuoteStrip · single,
    QuoteStrip · wall, FormBlock · card ("Add your name"; the campaign picks
    its form in BackGold).
  - Events (`events`): Hero · statement, EventsList · agenda.
  - Donate (`donate`): the donation form in its Story layout, then Issues ·
    cards with other ways to help.
  - Volunteer (`volunteer`): Hero · statement, FormBlock · wide ("Sign up to
    volunteer"; the campaign picks its form), Issues · steps.
  - Join (`join`): a call to action whose button goes to the organization's
    join page in BackGold (`{ "kind": "surface", "path": "/join" }`), until
    BackGold has a Membership section a template can draw.

  News is the built-in post list at the organization's blog address
  (`/news` for a new organization), drawn by the post list layout.
- **Starter rows.** Sections whose rows an author types (Issues, StatCards,
  QuoteStrip, PlatformPlanks) carry placeholder rows under their own
  `data.source`; every stat's value is the words "Your figure". Rows BackGold
  fills (the countdown's date, events, posts) are never starter content.
- **The header menu**: Meet the candidate, Issues, Endorsements, Events,
  News, Get involved (Volunteer, Join the team), and Donate as the header
  button on every page (C-5).
- **The footer menu**: The candidate (Meet the candidate, Issues,
  Endorsements, News), Take part (Volunteer, Events, Join the team).
- **Reusable sections**: *Campaign sidebar* (Countdown · inline, then a call
  to action to volunteer) in the Sidebar on every post, on News and on the
  Events page; *More from the campaign* (Blog · list) in the Sidebar on every
  post, after it; *Get the campaign letter* (BackGold's email sign-up in its
  band layout, with its kicker, heading and lede) Above the footer on every
  page.

## Decisions built as drawn

These follow the boards; none is ruled yet, and each is listed for JHL in
the pull request (README §17, Decisions needed).

- **C-1 Hero `portrait`** is proposed, in the contract as a proposed layout.
- **C-2 Endorsements ride QuoteStrip** (an endorsement is a quote, optional,
  and who said it), drawn by this template's `wall`.
- **C-3 The office line** is the Hero's `kicker`.
- **C-5 Donate on every page**: the starter's Donate link shows on every
  page (`every_page`), where the party starter uses `donation_pages`.
- **C-6 The header button on its own page** draws as the current page, in
  `template.css`.
- **C-7 One gold affordance**: the filled accent button is Donate's alone.
- **C-8 The countdown hides** once the date passes, rather than showing
  zeros.
- **C-9 What the starter leaves out**: VideoEmbed, PdfEmbed and Progress
  (they draw nothing until a file or a goal is set), the footer's Vote links
  (they need the state's own addresses), and anything in the Top banner.
- **`press_release` is absent** from `entryLayouts`: the built-in is not
  shipped.
- **C7's other ways to help keep their link in the head.** The board draws
  a link inside two of the cards (Volunteer, Ask for a sign); an Issues row
  has no link of its own in the contract, so the section's one link draws
  as the kit draws it, beside the heading.

## Develop locally

As for the party template (its README has the details). From the
repository root:

```bash
pnpm install
pnpm --filter @backgold/content build
pnpm --filter @backgold/astro build
pnpm --filter @backgold/template-kit build
pnpm --filter backgold-template-candidate run check
```

`node scripts/starter-e2e.mjs --template candidate` builds this template
against the packages' current source and checks it end to end against a
fixture Content API, the candidate's starter pages among the fixture's at
`/candidate-<slug>`; `--serve` keeps it running with the starter pages at
their own addresses, the starter's menus and the boards' brand, to look at.

## Deploys

BackGold runs this template as one Worker, `template-candidate`, in the
Workers for Platforms dispatch namespaces `sites-staging` and
`sites-production`, exactly as the party template runs `template-party`
(see the party template's README, Staging deploy and Production deploy).
The `env.staging` and `env.production` blocks in `wrangler.jsonc` hold that
form; the CI jobs write the `CANDIDATE_STAGING_KV_ID` and
`CANDIDATE_PRODUCTION_KV_ID` variables over the `__CANDIDATE_STAGING_KV_ID__`
and `__CANDIDATE_PRODUCTION_KV_ID__` placeholders before they build. Each
cache's KV namespace is created once, by hand:
`npx wrangler kv namespace create backgold-candidate-staging-cache` (and
`backgold-candidate-production-cache`).

## License

MIT.
