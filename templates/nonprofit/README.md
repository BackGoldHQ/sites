# BackGold nonprofit template

The website template for a community nonprofit on BackGold: a food bank, a
mutual-aid group, a youth program, an animal rescue, a neighborhood
association. It is an Astro site on Cloudflare Workers, drawn by the template
kit (`@backgold/template-kit`) from the organization's content through the
Content API, like the [party template](../party/README.md). This README covers
what is the nonprofit template's own; the party template's README is the
reference for everything the kit does the same way (layouts are files, areas,
the header and footer, restyling, the legal line).

The look is bright, bubbly and hand-drawn, drawn to boards N1 to N12 and
N-catalogue (`docs/design/nonprofit-template-2026-10` in the platform
repository): a hand-lettered display face, sticker buttons, wobbly pen
outlines on every card, tape, doodles, torn paper between bands and a paper
grain over every ground. The template owns the type, the spacing, the shapes,
the texture and the motion; the organization owns the colors. Every color is
a band token the kit writes from the organization's brand
(`packages/template-kit/src/lib/brand.ts`), so the look holds under any brand
and in both schemes.

## Start a nonprofit site

In the operator app, start a new site from the Nonprofit template. That makes
a site in template mode and writes the starter from `template.json` into it:

| Page | Starts with |
| --- | --- |
| Home | Hero · overlap, StatCards · row, Issues · cards (the programs), EventsList · shifts (the next three), Stories · spotlight, Cta · photo |
| About (`/about`) | Hero · statement, About · letter, TeamGrid · grid, Financials · donut |
| Programs (`/programs`) | Hero · split, Services · programs, Pathways · doors, Faq · topics |
| Get involved (`/get-involved`) | Hero · statement, EventsList · shifts (grouped by week), FormBlock · wide, Issues · steps |
| Events (`/events`) | EventsList · agenda |
| Donate (`/donate`) | Donate · story, Membership · tiers |
| Contact (`/contact`) | Hero · statement, FormBlock · card, About · left |

- **Menus**: the header has About, Programs, Get involved, Events, Stories
  (the post list, at `/news`) and Contact, and Donate as the header button on
  every page; the footer has three columns, Visit, Help out and About us.
- **Volunteer form**: FormBlock · wide on Get involved opens with its own
  intro ("Tell us, and we'll find you a *spot*").
- **Reusable sections**: the newsletter band (SignupCapture · band) above the
  footer on every page but Donate; a drive banner (Cta · strip, the top
  banner), off until the organization dates it; a sidebar card (Cta · card),
  off until the organization places it.

Every word is starter copy for the organization to replace. Figures are
`Your figure`; nothing is typed in as a price or a statistic.

## Where the files live

| File | What it is |
| --- | --- |
| `template.json` | The manifest: the layouts this template draws per section type (the default first), the areas, the entry layouts, the site parts and the starter. |
| `src/template.ts` | The template's config for the kit: the manifest, the kit's sections with this template's own layouts registered, the kit's entry layouts, the two faces, and `defaultAppearance: 'light'`. |
| `src/styles/template.css` | The whole look, over the kit's stylesheet: faces, stickers, pen outlines, tape, marked words, dividers, torn edges, grain and every section's restyle. Its header comment lists each part. |
| `src/components/sections/` | This template's own layouts (below). |
| `src/components/entries/post/` | Its own post list and post (below). |
| `src/lib/list-label.ts` | The post list's name from the header menu ("Stories"). |
| `src/lib/frame-colors.ts`, `src/styles/frame.css`, `src/frame/` | BackGold's frames in the look (below). |
| `src/components/Doodle.astro` | One doodle from the sprite, `<svg class="dd"><use href="#d-…"/></svg>`. |
| `src/lib/doodles.ts` | The doodle set: 9 marks and 24 icons (48-unit strokes, round caps), the marker strokes for a marked word, `iconOf` (a row's `icon` → its doodle) and the sprite. |
| `src/lib/marked.ts`, `src/middleware.ts` | The marked word and the sprite (below). |
| `test/marked.test.mjs` | The rewrite's tests: `pnpm --filter backgold-template-nonprofit test`. |
| `astro.config.mjs`, `wrangler.jsonc`, `package.json` | As the party template's. |

## Its own layouts

| Layout | What it draws |
| --- | --- |
| `Services:programs` | Proposed (not yet in the contract's catalogue): an even grid of program cards, each with the row's `icon` as a doodle, its price as a chip in the operator's words ("Free"), its name and summary, its first three `includes` as For, When and Where, and its button as an outline sticker. `featured` is never drawn: no program looks recommended over another. |
| `EventsList:shifts` | The organization's open volunteer shifts (the Content API's `GET /shifts`) as hand-drawn rows: a torn-off calendar page for the date, the time span and place beside doodles, "Part of" the event a shift belongs to, the spots as dots (taken filled, open dashed) beside the words ("6 of 10 filled · 4 spots left"), and the button to the shift's signup card on BackGold (`/volunteer/<slug>`): "Sign up for this shift", "Full · join the waitlist", or "Full" and "Closed" in the outline. The counts and the button are read again from `GET /shifts/live` after the page loads. An api with no shift feed, or an organization with no open shift, draws the section's events instead, with their own button ("RSVP", "Get tickets", "Details") and Add to calendar. A list with no `max` is grouped by week (Monday to Sunday) under "Week of Nov 2" with the week's dates. |
| `Issues:cards` (and `Issues`) | The kit's cards with the row's `icon` as a doodle and its `note` as a chip with the clock. |
| `Pathways:doors` (and `Pathways`) | Each pathway as a door, arched with a knob, its `icon` as a doodle; the whole card is the link. |
| `Hero:split` | The kit's split hero with the section's kicker over the headline (the kit's leaves it out). |
| `TeamGrid:grid` (and `TeamGrid`) | Leadership and Staff as groups under a hand-lettered heading with a wavy rule, each person a card with their photo or their initials on the soft field; open roles and seats as dashed invitation cards. |
| `Stories:spotlight` (and `Stories`) | The featured story in a taped frame, or the soft field with a doodle when it has no picture; the section's first link is its read link and any further links ("All stories") sit in the section head; the listed stories as wide rows under the squiggle-and-confetti rule. A watch link is not drawn here (Stories · cards and timeline draw it). |
| `post:list` (entry layout) | The post list (board N8): the kit's ListFrame named as the header menu names the list ("Stories", `src/lib/list-label.ts`), the search beside the head ("Search stories"), the category chips; on the first page the newest post leads, its cover on a paper mount in a pen frame, taped (the soft field and its category's doodle without one), the chip with the doodle, the title, the summary and the byline; the rest as pen-outlined cards two across with the byline; the pager as stickers. |
| `post:article` (entry layout) | A post (board N9): the kit's header with the breadcrumb named from the menu ("Stories ↗ Grow Lab"), the chips, the title (the middleware marks its starred word), the byline and reading time; the cover framed and taped; the body in Nunito with every blockquote a sticker; the squiggle rule; "Share this story" as outline stickers; the author box. |
| `FormBlock:wide` | The section's kicker, heading and body as an intro column beside BackGold's form card (the frame's title is the heading without its asterisks). |

A row's `icon` maps to a doodle by name (`basket`, `book`, `wrench`, `sprout`,
`people`, `heart`, …) or alias (`food`, `garden`, `tools`, …); any other word
draws the sparkle, and a row with no icon draws none.

Everything else is the kit's layout restyled in `template.css`, among them
StatCards · row as pinned notes with the figure on a highlighter swipe,
Financials · donut as hatched wedges in a pen circle, Progress · bar as a
marker swipe in a pen trough, Membership · tiers and Services · packages with
no card filled, and every blockquote in a post as a sticker.

## BackGold's frames

Every BackGold frame on the site (the sign-up band, the volunteer and contact
forms, Donate, an event's RSVP, Join) sits on the template's hand-cut card.
Two things make the frame itself belong there:

- **The colours it is sent** (`frameColors`, `src/lib/frame-colors.ts`): the
  band's, with the frame's lines drawn in the pen (the strong line is the
  ink 82% over it, the hairline the ink at 30%), so a field's edge reads on
  the white card. The band's own lines are a quiet rule (Kettle Commons'
  tint: `#e8c87a` on `#fffdf7`), and a field bordered in one vanishes.
- **Its skin** (`frameSkin`, `src/styles/frame.css`, served at
  `/_backgold/frame.css` by `src/frame/css.ts`, an injected route since
  Astro routes no page under `_`): written to the platform's frame-skin
  contract (`docs/FRAME-SKINS.md` in the platform repository): every rule
  under `html[data-bg-look]`, only the `bg-fr-*` parts, their states and the
  `--bg-look-*` colours (fields edged in `--bg-look-field-edge`). Labels,
  card heads, choices and buttons hand-lettered; fields with the edge on
  blob corners; choices as chips; the main call a sticker (a form's and a
  sign-up's with the mail doodle; Donate's in the site's main colour); other
  buttons outline stickers; failures as the exclamation doodle in the
  accent. Nothing in it hides or covers a required field, consent, a legal
  line, the message line or the main call. The faces load from the site
  itself: the stylesheet opens with Shantell Sans' and Nunito's `@font-face`
  rules (latin and latin-ext), their files at `/_backgold/fonts/<file>`
  (`src/frame/font.ts`, read from Google Fonts' file host, with
  `Access-Control-Allow-Origin: *`), since a skinned frame admits fonts from
  the site's origin only. The kit asks a frame for the skin with `skin=<the
  site's https origin>`; BackGold may refuse it silently, and then the frame
  wears the colours above alone, which read on their own.

## The marked word (this template's convention)

An operator marks the one word that matters in a heading by wrapping it in
asterisks: `Everyone eats. Everyone *helps*.` The template draws a circle
around it in a page-opening Hero's headline and an underline swoosh under it
everywhere else, in the band's accent text color. A heading with no starred
word, more than one pair or a lone star is drawn as written: the template
never guesses the word.

The kit draws the headings, so the template marks them after the fact:
`src/middleware.ts` runs inside `@backgold/astro`'s middleware (so the edge
cache stores its output) and, on an HTML page only, rewrites each h1, h2 and
h3 that holds one starred pair (`src/lib/marked.ts`), never touching
`<script>`, `<style>`, attributes or JSON, and changing nothing on a second
pass. It also writes the doodle sprite once after `<body>` and, on a page
with a mark, a small script that draws each mark's stroke in once when it
enters the viewport (only under `prefers-reduced-motion: no-preference`;
without it the stroke is simply there). A heading helper in the kit, so every
template can honor the convention, is the brief's decision 9, the owner's
call. A starred word in an attribute (a frame's title) keeps its asterisks.

## How the stylesheet wins over the kit's

The kit's components carry Astro-scoped styles (a class plus a
`data-astro-cid` attribute), which outrank a plain class rule. Every rule in
`template.css` that restyles the kit sits under `:is(body, #main)`: it matches
every element and counts as an id, so the template's rules beat the kit's
scoped ones evenly and still settle among themselves by their own order. Only
the tokens, `body` and the page's grain sit outside it. A new rule goes inside.

## A page with no Hero

The kit draws a page that does not open with a Hero under a page header, the
page's title as its `<h1>` (every template on the kit does). On this template
that header is the quiet title: the title set small in the accent after the
calendar doodle, so the first section's own kicker and heading lead the page
(the starter's Events opens on its agenda's "What's coming up").

## The faces

Shantell Sans for display (headlines at 800 with the Informal axis at 55 and
Bounce at 22; buttons, chips and small numerals at 25 and 0; the letter's
signature in the italic at 100 and 40) and Nunito for text (400, 600, 700,
800, italic 400), both from Google Fonts (`fonts` in `src/template.ts`). Long
reading stays in Nunito. An organization that saves a theme in BackGold
replaces both.

## Designer's calls it implements

From the boards' README: pen outlines in the band's ink mixed 82% over its
strong line; a sticker's inset ring in the band's ground; the heart on every
Donate sticker; the header's Donate as the outline sticker on `/donate` (the
kit's `aria-current`) and on a page carrying QuickDonate; the menu sheet does
not repeat Donate; the marked word from the operator's asterisks; Hero ·
overlap's card as a torn sheet of the contrast band, taped; tears only where
grounds differ, never on the Hero, always on the footer; grain at 5%; tape
and highlighter from the accent; StatCards as pinned notes; no filled card in
Membership · tiers and Services; shifts grouped by week with spots as dots and
words; the post list labelled Stories at `/news`; Footer · columns the
default; errors as the exclamation doodle and a sentence in the accent, never
red; RSVP and Sign up as primary stickers; kickers in mixed case after a
doodle; the phone header's menu as an icon. Motion only under
`prefers-reduced-motion: no-preference`: a sticker lifts 1px, a marked word
draws in once. In Firefox, which does not keep a stretched mask's stroke at
2px, a card's pen outline is a plain 2px blob border.

## Known gaps

What the boards draw that this template does not, and why:

- **The menu sheet's closing stickers and address** (N11: Volunteer a shift,
  Become a member, the street address): the kit's sheet has no slot for a
  template's own part. Follow-up: a sheet slot in the kit's Site layout.
- **Stories in the header is not drawn as current on a post** (N9): the
  kit's menu marks a link current on its own address only.
- **The 404 page offers "Read the news"**: the kit's not-found words.
- **The hero's hand-lettered aside** ("two hours, no experience needed", N1):
  Hero · overlap has no field for it, and the template adds no copy of its own.
- **Events · agenda does not list volunteer shifts** (N5): it is the kit's
  layout over the events; the shifts are on Get involved and home.
- **Financials · donut**: every wedge carries the same hatch angle (a conic
  gradient cannot vary its pattern per slice; the colors differ) and the
  hole has no hand-lettered label (the template adds no copy).
- **StatCards** with the starter's `Your figure` set the words at the
  figure's size: CSS cannot tell the starter's word from a number.
- **Contrast the kit owns**: under the marigold, straw and apricot brand in
  the dark scheme, the kit's derived tint ground gives muted text 4.39:1 and
  accent text 4.16:1 (board N12's brand 3); both come from `brand.ts`, not
  from this template.

## Develop locally

From the repository root:

```bash
pnpm install
pnpm --filter @backgold/content build
pnpm --filter @backgold/astro build
pnpm --filter @backgold/template-kit build
pnpm --filter backgold-template-nonprofit dev
```

`node scripts/starter-e2e.mjs --template nonprofit` builds the template and
checks it end to end, its starter pages at `/nonprofit-<slug>`. With
`--serve` it keeps the site running with the starter's pages at their own
addresses, its menus and the boards' brand; `NONPROFIT_BRAND` (JSON:
`primary_color`, `secondary_color`, `accent_color`) swaps the brand.

## Deploys

BackGold deploys this template itself, as the Worker `template-nonprofit` in its
Workers for Platforms dispatch namespaces: `sites-staging` on a push to
`main`, `sites-production` from the Release workflow, built from this
workspace, never from npm. The `env.staging` and `env.production` blocks in
`wrangler.jsonc` hold that form, and the deploy job writes the cache
namespace's id over the `__NONPROFIT_STAGING_KV_ID__` and
`__NONPROFIT_PRODUCTION_KV_ID__` placeholders before it builds. How the jobs
run, how to tell a deploy worked and the one-time account steps are in the
repository's [docs/TEMPLATE-DEPLOYS.md](https://github.com/BackGoldHQ/sites/blob/main/docs/TEMPLATE-DEPLOYS.md).

A copy of this template outside this repository (one `backgold eject`
made) deletes both `env` blocks and deploys with `npx backgold deploy`; the
`@backgold/cli` README has the steps.

## License

MIT. See [LICENSE](LICENSE).
