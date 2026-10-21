# The Unlabeled template

Unlabeled's own site (organization `unlabeled`, unlabeledtexas.com): a
one-of-one template on BackGold's template kit, drawn to boards U1–U11 and
U-cat in the platform repository's `docs/design/unlabeled-site-2026-10/`.
White on black, mono everywhere, display in capitals: "a court record set by
a punk zine". Every page, form, petition, poll, newsletter and donate flow
stays live through BackGold, exactly as on any template; on top of that the
site carries the BISD public data archive at `/archive`, searchable on her
own domain.

The manifest's audience is `hidden`: no other organization's `/sites/new`
gallery offers it. Staff point her site at it with the template switch.

## The files

| File | What it is |
| --- | --- |
| `template.json` | The manifest: the layouts the site uses (U-cat's table, default first), Top banner and Above the footer, the kit's entry layouts, the `bar` header and `columns` footer, and the starter (below). |
| `src/template.ts` | The config for the kit: the kit's sections with her three layouts and the archive's sections added, her faces, `defaultAppearance: 'dark'`, `frameFont: 'ubuntu-sans-mono'`, `frameRadius: 0`. |
| `src/styles/template.css` | Her look: her colours pinned on every band, the type scale, the grid, running heads and folios, buttons, the header, the footer, the photo treatment, every kit band restyled. |
| `src/components/sections/Hero/cover.astro` | Hero · Cover: the headline as a cap stack, one sentence a line on its own black slab, over the photo through the halftone screen. |
| `src/components/sections/MovementTicker/index.astro` | The ticker: one line under the header, "Live //", BackGold's live feed when the api sends it, else her typed figures running at a reading pace, still under reduced motion. |
| `src/components/sections/Petition/Sheet.astro` | Petition: the default layout puts the heading and her typed figures huge beside BackGold's sign sheet; map, coverage and image are the kit's. Every layout anchors at `#petition`. |
| `src/components/Mark.astro` | Her mark inline in the text colour (`wordmark`, `skull`, `horns`), for markup that places it itself. |
| `src/assets/mark.svg`, `skull.svg`, `horns.svg` | The mark: a trace of her `unlabeled-logo.png`, all `currentColor`. The header, footer, chapter mark, watermark and divider draw them as CSS masks. |
| `src/archive.ts`, `src/pages/archive/**`, `src/lib/archive/**`, `src/components/archive/**`, `src/components/entries/**` | The archive (boards U2–U5, U10): its routes, index and record layouts. |
| `astro.config.mjs`, `wrangler.jsonc`, `package.json` | The Worker (`template-unlabeled` in BackGold's namespaces) and its dependencies. |

`node scripts/check-manifests.mjs` parses the manifest with the contract's
schema. After a change merges here, refresh the platform's copy
(`packages/shared/site-templates/unlabeled.template.json`) and run
`pnpm --filter @givegold/shared templates:build` there.

## Her brand, and why this template writes its own tokens

| Token | Value | Used for |
| --- | --- | --- |
| Ground | `#000000` | the page and every band |
| Ink | `#ffffff` | type, rules that matter, the filled button, the mark |
| Muted | `#949494` | secondary text |
| Faint | `#737373` | running heads, meta, empty states |
| Line | `#1a1a1a` | hairlines, the grid |
| Line strong | `#616161` | band rules, boxes, field borders |
| Surface 2 | `#080808` | the newsletter band, the disclaimer band |

Every other template takes its colours from the band tokens the kit derives
from an organization's three brand colours (`src/lib/brand.ts`). Hers are two
colours and the greys between them, which no derivation from three colours
reaches: from white, black and white the kit gives a blue-black page, a cream
contrast band and a lighter muted grey. This template is hers alone, so
`template.css` writes her verified values into every band's tokens, in every
scheme the kit's layout writes (`:root:root:root`). The contrast band is the
one white ground (black ink, a black button), used by the donate strip. No
colour appears anywhere else; the status colours live only inside BackGold's
frames.

Type: Ubuntu Sans Mono 500 in capitals for every heading, numeral and button;
JetBrains Mono for text; Office Code Pro, BackGold's built-in, for the meta
line, falling back to JetBrains Mono (Google does not serve it). Radius 0
(decision 2), density .7 (`--gg-density`). Dark only (decision 8): the
header's switch is hidden; her site's appearance is pinned dark in BackGold,
which keeps it so.

## The look's classes, for the archive's pages

The archive's components reuse these; they are defined in
`src/styles/template.css`.

| Class | What it draws |
| --- | --- |
| `.u-grid` | The twelve hairline columns across the content width (four under 760px), as every band draws them. |
| `.u-running-head` | A running head in markup: three spans, the section mark and slug at the left, a centre title, the folio at the right in white, over a hairline. Kit bands get theirs from CSS (`§ 02 // anchor` and the folio). |
| `.u-meta` | The meta line: Office Code Pro, 11px, capitals, `.1em`. `.kicker` is the same with a `//` before it. |
| `.u-slash` | Puts the `//` rule before its text. |
| `.u-rule` | A row of `//////` run to the edge of its box, the rule between parts of a band. |
| `.u-bracket` | `[ label ]`: a link set in brackets in the meta face. |
| `.u-invert` | The one hover the site has: a white block, black type. Buttons, menu links, cards and event rows already invert. |
| `.u-numeral` | A numeral set huge (72 → 132px) in the display face, tabular. |
| `.u-chapter` | The chapter mark between bands: a strong rule, the skull and horns (`<Mark kind="skull" />` inside), a strong rule. |
| `.u-horns` | The horns alone, drawn out to a rule: the divider. |
| `.u-watermark` | The skull in the hairline grey behind a box (the citation box). |
| `.u-halftone` | The halftone screen on a photo's box: greyscale, a 45° 7px dot field, two tones. The words over a photo sit outside the box. |
| `.u-disclaimer`, `.u-disclaimer-band` | The legal line's style, and the disclaimer band on the second surface (the archive's three disclaimers). |
| `.u-faint` | Her faint grey. |

Tokens to read: `--u-ground`, `--u-ink`, `--u-muted`, `--u-faint`,
`--u-line`, `--u-line-strong`, `--u-surface-2`, `--font-meta`,
`--u-meta-size`, `--u-meta-track`, and the type scale `--u-mega` (54 → 120),
`--u-d1` (44 → 88), `--u-d2` (34 → 56), `--u-d3` (25 → 34), `--u-d4`
(18 → 22), `--u-d5`, `--u-numeral`.

## The starter

What a site begins with when it is made on this template (her site, switched,
keeps its own pages and gains the links it lacks):

| Page | Sections |
| --- | --- |
| Home (`""`) | Hero · Cover (*No red. No blue. Just Texans.*), MovementTicker, Issues · Cards (her four programs), About · Letter (the manifesto, unsigned; the chapter mark over it), EventsList · Compact, Cta · Strip (Donate) |
| `events` | Hero · Statement, EventsList · Agenda |
| `proof-your-vote-counts` | Hero · Statement, FormBlock · Wide, StatCards · Row, ShareKit · Strip |
| `bisd-where-is-big-lando` | Hero · Statement, Issues · Numbered (the four asks), Petition (her legal note as the sheet's goal note, under the count), ShareKit · Strip, EventsList · Compact |
| `petition-drive` (Flock Blockers) | Petition · Map, Cta · Banner, EventsList · Compact |
| `bisd-students-lets-be-real` | Hero · Statement, PollBlock · Card, FormBlock · Card |
| `nisd-prop-a-2026` | Hero · Statement, PlatformPlanks · Longread, Faq · Accordion, Cta · Banner |
| `donate` | Donate · Story, Progress · Bar, Issues · Cards (other ways in) |
| `newsletters` | Collection · List of newsletter issues |
| `contact` | Hero · Statement, FormBlock · Wide |

Reusable sections: *Early voting*, a Cta · Strip in Top banner on every page
but Donate; *The newsletter*, a SignupCapture · Band Above the footer on every
page.

Menus: HOME · EVENTS · VOTE ▾ · BISD ▾ · NEDERLAND ISD · PETITION ▾, with
DONATE as the header button; the footer's three groups. ARCHIVE (top level,
and first in the BISD group) is not a starter link: `/archive` is this
template's own route, and a menu link can name a page, a list or an https
address but not a template's route, so an absolute link would point at the
wrong host on staging. The template is to draw ARCHIVE itself, which needs a
hook in the kit's header (pending); a nav kind for a template's own routes is
a platform ask. Her other pages (I voted, the BISD petition, Texas THC and the
forms not in the menu) are hers already and are not starter pages.

Copy is hers where her site has it, and written in her register where it
does not (the board copy decks mark which). Nobody on her team is named. The
legal line *Contributions or gifts to Unlabeled are not deductible as
charitable contributions for federal income tax purposes.* is her site's
legal line in BackGold, drawn on every page in the footer and in the menu
sheet.

## Switching her site

1. The platform knows the `unlabeled` key (its copy of `template.json`, the
   template card left out of the gallery for `hidden`).
2. Deploy `template-unlabeled` to staging (below) and switch a staging copy
   of her site first.
3. The template switch carries her pages and menus, keeps every embed, and
   appends the starter's links her menus lack.
4. Her redirects, set in BackGold (Sites → Redirects), not in this template:
   - `/public-info` → `/records`
   - `/donate-` → `/donate`
   - `/donate-2` → `/donate`
5. The archive's content types and entries are imported by the archive build
   (its own steps), never by hand in D1.
6. Check her site's appearance is pinned dark and that it wears her saved
   theme *Unlabeled OG* (its faces load from BackGold; without it the
   template's own faces load from Google Fonts).

## Develop locally

As the party template (its README has the settings table and the commands):
`pnpm install` at the repository root, build `@backgold/content` and
`@backgold/astro`, then `pnpm --filter backgold-template-unlabeled run dev`.
`node scripts/starter-e2e.mjs --template unlabeled` builds and checks it
against the fixture Content API; with `--serve` it serves her starter pages
in her brand, her menus and her two areas.

## Staging deploy

As the party template's (its README, Staging deploy), with this template's
names: the Worker `template-unlabeled` in `sites-staging`, the job
`deploy-unlabeled-staging`, and the cache's KV namespace
`backgold-unlabeled-staging-cache` with its id in the
`UNLABELED_STAGING_KV_ID` CI variable. Before the first deploy, once:

```bash
npx wrangler kv namespace create backgold-unlabeled-staging-cache
glab variable set UNLABELED_STAGING_KV_ID <id> --masked --protected -R backgold/sites
```

The api dispatches a site to `template-unlabeled` once the platform knows the
`unlabeled` template key. **Deploy after the platform's embed look accepts
`ubuntu-sans-mono`**: the api drops a frame's whole look (its colours too)
when its `font` is one it does not know.

## Production deploy

As the party template's (its README, Production deploy): the Worker
`template-unlabeled` in `sites-production`, deployed by
`deploy-unlabeled-production` from the `deploy-production` button. Once:

```bash
npx wrangler kv namespace create backgold-unlabeled-production-cache
glab variable set UNLABELED_PRODUCTION_KV_ID <id> --masked --protected -R backgold/sites
```

## Not done here

- **Her vector mark.** `src/assets/*.svg` are a trace of her raster logo;
  her vector replaces all three files (keep `currentColor` and the
  `u-cut-around` / `u-cut-head` mask ids, which `Mark.astro` renumbers).
- **The live ticker feed** (decision 7): the ticker draws BackGold's live
  frame when the api sends one, else the figures typed for it; a starter
  ticker with neither draws nothing.
- **The petition's live count, huge.** The Content API sends a petition's
  count only inside BackGold's frame, so the frame draws it; the site never
  makes one up.
- **The Petition · Map legend by shape** (operators told apart by marker
  shape for a look with no colour) is drawn inside the api's petition frame
  and lands in the platform, not here.
- **BackGold's frames follow her saved theme in BackGold**, through the kit's
  `moduleLook`, not this file: white ink, black ground, her hairline; their
  muted grey and button ink are the kit's derivation from that theme.
- **ARCHIVE in the header menu** waits on a kit hook for a template's own
  menu links (above).
- **Photos at upload**: the halftone and greyscale are drawn at render time;
  the full dot screen only where the template draws the photo's box (the
  cover). Other images are greyscaled and contrasted.

## License

MIT. See [LICENSE](LICENSE).
