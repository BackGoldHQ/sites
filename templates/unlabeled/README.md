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
| `template.json` | The manifest: the layouts the site uses (U-cat's table, default first; StatCards also lists `archive`, the archive's home door), Top banner and Above the footer, the kit's entry layouts, the `bar` header and `columns` footer, and the starter (below). |
| `src/template.ts` | The config for the kit: every section key filed under a running head (`Filed.astro`), her faces, `defaultAppearance: 'dark'`, her frames' face, corners and colours (`frameFont: 'ubuntu-sans-mono'`, `frameRadius: 0`, `frameColors`) and skin (`frameSkin`), her event page and 404 (`eventPage`, `notFound`), her own menu links (`menuLinks`: ARCHIVE in the header and the footer, Request a record in the footer), her socials in the phone's menu sheet (`menuSheet`), and the newsletter's numbered list and issue. |
| `src/lib/frame-skin.ts`, `src/pages/[skin]/frame.css.ts`, `src/frame/` | Her skin for BackGold's frames, to the platform's FRAME-SKINS contract (`html[data-bg-look]`, the `bg-fr-*` parts, the `--bg-look-*` variables), served at `/_backgold/frame.css` to any origin and linked by each frame when the kit sends `skin`: labels in the meta line, square fields on the field edge in JetBrains Mono, the white block submit, choices that invert, a petition's count huge, a failure's line in the status red (the one place a status colour appears). JetBrains Mono's files are served from the site's own origin at `/_backgold/fonts/` (`src/frame/`, injected in `astro.config.mjs`), the only font host a skinned frame admits by contract. |
| `src/components/newsletter/IssueList.astro`, `Issue.astro`, `src/components/sections/Collection/list.astro`, `src/lib/issues.ts` | The newsletter's list and issue page, and a Collection · List of its issues: the kit's, each issue numbered from the oldest (`Issue 02` on its row; `BISD · Issue 02` over its title). A Collection · List of any other type is the kit's. |
| `src/components/EventPage.astro`, `src/lib/last-meeting.ts` | One event's page (U8): the day set huge, the title, the meta line, the halftoned photo, the description and map, the archive's door to the last board meeting for a board meeting, BackGold's RSVP in a hairline box. |
| `src/components/NotFound.astro` | The 404 in her words: *Not on the record.*, the archive's search, the way home. |
| `src/scripts/motion.ts`, `src/styles/template.css` § 6 | The motion: headings and running heads decode through her glyphs, inverts wipe, photos develop, the manifesto un-redacts, odometers on holdings, the live folio and reading rule, the stamp and the horns, the grid ruled per band, the archive's live marks and printed rows, view transitions between pages. The finished page is the base style; reduced motion and scripts off get it as is. |
| `src/sections.ts` | Every section type and layout the template draws: the kit's, her own five and the archive's. |
| `src/components/sections/Filed.astro`, `src/components/RunningHead.astro` | The running head every band opens with: `§ 02 // <kicker>`, the heading in the centre, the folio; in a band of its own over the section. |
| `src/components/sections/About/letter.astro` | About · Letter: the chapter mark, then the letter as a dossier page (Filed under, read time, the heading, the role line in capitals, the body, the closing line across the grid). |
| `src/components/sections/EventsList/agenda.astro`, `AgendaMonths.astro` | EventsList · Agenda: the kit's, its empty months (between two listed ones, and the month after the last) carrying the section's first link as a button (Host Unlabeled). |
| `src/styles/template.css` | Her look: her colours pinned on every band, the type scale, the grid, running heads and folios, buttons, the header, the footer, the photo treatment, every kit band restyled. |
| `src/components/sections/Hero/cover.astro`, `framed.astro`, `src/lib/file-number.ts` | Hero · Cover: its running head names the page as a file (`File 001 — Home`, numbered by the header menu); the headline (else the site's title) as a cap stack, one sentence a line on its own black slab, over the photo, or the video playing muted on a loop over its still, through the halftone screen. A centered Hero with a photo or a video draws as the cover (`framed.astro`). |
| `src/components/sections/MovementTicker/index.astro` | The ticker: one line under the header, "Live //", BackGold's live feed when the api sends it, else her typed figures running at a reading pace, still under reduced motion. |
| `src/components/sections/Petition/Sheet.astro` | Petition: the default layout puts the heading and her typed figures huge beside BackGold's sign sheet; map, coverage and image are the kit's. Every layout anchors at `#petition`. |
| `src/components/Mark.astro` | Her mark as an image, for markup that places it itself: `wordmark` or `skull`. |
| `src/assets/wordmark.png`, `skull.png`, `horns.png` | The mark, cut from her own file, white on a clear ground: the wordmark (UNLA, the longhorn skull as the B, ELED) for the header, the footer and the archive's door; the skull and horns alone for the chapter mark, the 404 and the watermark; the horns alone for the divider. |
| `src/archive.ts`, `src/pages/archive/**`, `src/lib/archive/**`, `src/components/archive/**`, `src/components/entries/**` | The archive (boards U2–U5, U10): its routes, index and record layouts. |
| `src/middleware.ts` | Names a source document's query names (`find`, `all`) to BackGold's edge cache, so a stored bare page never answers them (docs/ARCHIVE.md). |
| `src/lib/next-meeting.ts` | The next board meeting on Events, for the latest meeting in the archive to point forward to (board U4). |
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
scheme the kit's layout writes (`:root:root:root`). The contrast band is
black too (dark only); a call to action on it (the donate strip) is the one
white ground (black ink, a black button). No
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
| `.u-running-head` | A running head: `<RunningHead kicker title />` (`src/components/RunningHead.astro`), the section mark and kicker at the left, the title in the centre, the folio at the right in white, over a hairline; the mark and folio count the page's running heads. Every section gets one from `Filed.astro`. |
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
| Home (`""`) | Hero · Cover (*Not Red. Not Blue. Just Texans.*), MovementTicker, Issues · Cards (her four programs), About · Letter (the manifesto, unsigned, filed under *Nonpartisan to the bone* and *Texas, all of it*; the chapter mark over it), StatCards · Archive (the archive's door, *Read it yourself.*, its live counts), EventsList · Compact, Cta · Strip (Donate) |
| `events` | Hero · Statement, EventsList · Agenda |
| `proof-your-vote-counts` | Hero · Statement, FormBlock · Wide, StatCards · Row, ShareKit · Strip |
| `bisd-where-is-big-lando` | Hero · Statement, Issues · Numbered (the four asks), Petition (her legal note as the sheet's goal note, under the count), ShareKit · Strip, EventsList · Compact |
| `petition-drive` (Flock Blockers) | Petition · Map, Cta · Banner, EventsList · Compact |
| `bisd-students-lets-be-real` | Hero · Statement, PollBlock · Card, FormBlock · Card |
| `nisd-prop-a-2026` | Hero · Statement, PlatformPlanks · Longread, Faq · Accordion, Cta · Banner |
| `donate` | Donate · Story, Issues · Cards (other ways in); Progress · Bar is hers to add once a campaign exists (a starter cannot name one) |
| `newsletters` | Collection · List of newsletter issues |
| `submit-documents` | Hero · Statement, FormBlock · Card (BackGold's form with a `pdf` field). The archive and `/records` show their Submit documents door only when this page exists. |
| `contact` | Hero · Statement, FormBlock · Wide |

Reusable sections: *Early voting*, a Cta · Strip in Top banner on every page
but Donate; *The newsletter*, a SignupCapture · Band Above the footer on every
page.

Menus: HOME · EVENTS · VOTE ▾ · BISD ▾ · NEDERLAND ISD · PETITION ▾, with
DONATE as the header button; the footer's three groups, *The record* holding
BISD: Public info, Submit documents and Nederland ISD. ARCHIVE is not a
menu link in BackGold: `/archive` is this template's own route, which no menu
link kind can name (a nav kind for a template's routes is a platform ask), so
the template adds it itself (`menuLinks` in `src/template.ts`, drawn by the
kit's header): last at the top level, after PETITION, and in no group (BISD
holds only her own rows), in the bar and the phone sheet, current on `/archive` and under it and
on each record type's address (`/meetings`, `/decisions`, `/data`, `/pay`,
`/sources`, `/records`). The footer's *The record* opens with The archive, The money
(`/archive/money`) and The pay (`/archive/pay`), then BISD: Public info and
Request a record (`/records#request-a-record`); the archive door names the two
browsing views under its holdings. Her other pages
(I voted, the BISD petition, Texas THC and the forms not in the menu) are
hers already and are not starter pages.

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
gh secret set UNLABELED_STAGING_KV_ID --body <id> -R BackGoldHQ/sites
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
gh secret set UNLABELED_PRODUCTION_KV_ID --body <id> -R BackGoldHQ/sites
```

## Not done here

- **Her vector mark.** `src/assets/*.svg` are a trace of her raster logo;
  her vector replaces all three files (keep `currentColor` and the
  `u-cut-around` / `u-cut-head` mask ids, which `Mark.astro` renumbers).
- **The live ticker feed** (decision 7): the ticker draws BackGold's live
  frame when the api sends one, else the figures typed for it. A starter
  cannot carry ticker rows: the ticker's source (`movement`) is live, not one
  a template's starter may type (the manifest schema's authored sources), so
  a new site's ticker draws nothing until the feed or her own figures arrive.
- **The petition's live count at 132px (U6)** is a platform/data follow-up:
  the Content API sends a petition's count only inside BackGold's frame, so
  the frame draws it; the site never makes one up.
- **A Hearing event's door to the last board meeting (U8)** is a
  platform/data follow-up: an event carries no link to the archive's
  meetings, so the event page cannot name the last meeting on the record.
- **The Petition · Map legend by shape** (operators told apart by marker
  shape for a look with no colour) is drawn inside the api's petition frame
  and lands in the platform, not here.
- **BackGold's frames follow her saved theme in BackGold**, through the kit's
  `moduleLook`, not this file: white ink, black ground, her hairline; their
  muted grey and button ink are the kit's derivation from that theme.
- **Photos at upload**: the halftone and greyscale are drawn at render time;
  the full dot screen only where the template draws the photo's box (the
  cover). Other images are greyscaled and contrasted.

## License

MIT. See [LICENSE](LICENSE).
