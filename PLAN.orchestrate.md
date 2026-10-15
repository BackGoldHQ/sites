# Plan: the candidate and petition-drive templates on a shared template kit

Workstream node: `BackGold WS: candidate + petition-drive Astro templates on a shared template kit (2026-10-15)`

Two repositories, two branches:

- **sites** (`gitlab.com/backgold/sites`): branch `jhl/templates-candidate-petition-drive` off `origin/main` @ 66c6f2c. The templates live here. Lands as a glab MR.
- **platform** (`gitlab.com/backgold/backgold`): branch `jh/candidate-deflock-petition-pages-20fd14` off `origin/main` @ 903d650e2 (worktree `GiveGold/.claude/worktrees/candidate-deflock-petition-pages-20fd14`). The template registry, manifests, the gallery cards, the contract addition, the comparison doc.
- **Prerequisite MR `backgold!1599`** (petition map + movement map frame the page's block on a template site): rebased on main 2026-10-15 in this run (conflicts in `landing-pages-ssr.ts` / `form-embed.ts`: main's `geoAssets` map threaded through the extracted `bakePetitionProps` and the embed route), gate running; push, CI, squash-merge.

## Interface decisions (made; subagents do not re-decide)

1. **One kit, many templates.** `packages/template-kit` (`@backgold/template-kit`, private workspace package, not published) holds what every BackGold template draws the same way: the section components and their layouts, the entry layouts, the chrome pieces (brand, menus, footer parts, mode toggle, sign-up band, takeover banner), `lib/*`, `styles/site.css` + `entries.css`, the `Site.astro` layout and the route bodies. A template directory is a manifest (`template.json`), a Worker (`wrangler.jsonc`, `package.json`, `astro.config.mjs`), a `src/template.ts` (`TemplateConfig`: the manifest, the section/entry registries with the template's own layouts added, its two Google faces), thin `src/pages/*.astro` wrappers, and `src/styles/template.css` for what the template sets differently. The party template becomes the first consumer with zero visible change (its e2e is the proof). Why: the candidate boards are drawn in set A's CSS ("only the brand tokens and the display face change"); copying 330 files per template is the thing JHL said to avoid, and "mix and match" needs one place a layout lives.
2. **Template keys**: `candidate` (name *Candidate*, audience `candidate`; C-10 closed) and `petition-drive` (name *Petition drive*, audience `movement`; proposed, for JHL). `petition-drive` is the hosted family id the live DeFlock-style sites carry, so the migration maps 1:1.
3. **Contract**: Hero gains `portrait` (C-1, proposed, marked like batch 4's rows). `QuoteStrip.wall`, `Countdown.tiles`/`inline`, `SignupCapture.band` kicker/lede/ZIP already exist. No other contract change. The sites branch vendors the snapshot after the platform edit.
4. **The petition-drive template is single-page by default**: one starter page at `""` = Petition · `map` (the api's framed block: map band + sign sheet, `/embed/petition/:page/:block` from !1599) → Issues · `steps` (Get involved) → EventsList · `list` → MovementTicker → Cta · `banner`; header `bar` with anchor links (The petition, Get involved, Events) and *Sign the petition* as the header button (a `section` link, never donate); footer `compact`-like (brand + legal line + bottom row); appearance dark by default (`starter` cannot pin style — the template's own tokens read dark-first, the brand's primary deep in shadow, as deflocksa.org / the DeFlock identity mock). No money surface anywhere in the starter (seed doctrine, 2026-07-23).
5. **The candidate template** follows boards C1–C11 and the C-catalogue's draft manifest exactly, in set A's CSS with a condensed display face; Donate is the one gold affordance (C-7 as drawn); the header button draws as the current page on `/donate` (C-6 as drawn); Donate `every_page` (C-5 as drawn); Countdown hides after the date (C-8 as drawn). Every "as drawn" is listed under Decisions needed, never presented as ruled.
6. **No new section types.** A template may add layouts of its own under its directory; it never changes what a section means.
7. **Migration of the live hosted sites is NOT in this run.** The run delivers the comparison and the migration mapping; the adopt-in-place door (W11) is its own workstream.

## Tasks

Wave 0 (serial):
- [ ] **T0 sites-template-kit** (opus, in place on the feature branch): extract the kit from `templates/party`; party consumes it; e2e packs the kit; CI globs. Party e2e + astro check green.
- [ ] **T0b platform contract** (orchestrator): `SECTION_LAYOUTS.Hero` += `portrait`; CONTRACT §2 row; shared lint/test; then `node scripts/contract-pull.mjs <platform worktree>` on the sites branch after T0 integrates.

Wave 1 (parallel, worktrees under `GGPC/backgold-sites-wt/<slug>`, base = the feature branch after T0):
- [ ] **T1 template-candidate** (opus): `templates/candidate` from the C boards and the draft manifest; layouts Hero `portrait`, QuoteStrip `wall` (kit has it? verify; else add in the template), Countdown `tiles` + `inline`; starter copy in a candidate's voice (no names); README; e2e `--template candidate`.
- [ ] **T2 template-petition-drive** (opus): `templates/petition-drive` from the deflocksa.org production document, the DeFlock identity mock and the hosted petition-drive seed; dark-first tokens; single page; README; e2e `--template petition-drive`.
- [ ] **T4 sites-ci-per-template** (sonnet): `.gitlab-ci.yml` check + deploy jobs per template (candidate, petition-drive) mirroring the party's, KV/CI variables named per template; `scripts/check-manifests.mjs` unchanged; README/CLAUDE.md rows.

Wave 2 (after T1 + T2 integrate):
- [ ] **T3 platform-template-registry** (opus, platform worktree): `SITE_TEMPLATE_KEYS` += `candidate`, `petition-drive`; manifest copies + `templates:build`; blurbs; `COMING_SOON_TEMPLATES` drops Candidate; `/sites/new` gallery + start route sanity; shared starter tests; frontend lint + QUnit for touched components; api lint.
- [ ] **T6 candidate-comp-walk** (opus, audit-only → fix wave): every C board vs the built template, gap table with evidence.
- [ ] **T5 petition-drive-comparison-migration** (opus): deflocksa.org vs the new template at 1440/375 (Playwright, own port), gap table, and the migration mapping for the eight live/draft hosted petition-drive pages (prod D1 list in the scratchpad), written to `docs/design/petition-drive-template-2026-10/COMPARISON.md` on the platform branch.

Ship: combined gates (sites: `pnpm -r lint`, `pnpm -r test`, astro check ×3, e2e ×3; platform: shared/api/frontend lint), changelog files, graph close-out, MRs (sites via glab; platform: see Decisions — Assay names no GitLab landing today).

## Claimed resources
- Sites worktrees: `GGPC/backgold-sites-wt/<slug>`; dev ports 4321+ per the subagent skill's claim.
- No migrations.
- Scratchpad per task: `<scratchpad>/<slug>/`.

## Decisions needed (JHL) — carried to the MR bodies
- The kit as a private workspace package (vs publishing it for partner forks).
- Template key `petition-drive` / name *Petition drive* / audience `movement`.
- C-1 Hero `portrait` added to the contract as proposed; C-2 endorsements on QuoteStrip `wall`; C-5/C-6/C-7/C-8 built as drawn.
- Landing path for the platform branch: Assay (`assay project show` names no gate/staging/production) or a glab MR.

## Feed cursor
(recorded at dispatch)
