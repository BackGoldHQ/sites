# BackGold petition drive template

The website template for a petition drive on BackGold: one page that puts a
live map of what an organization is documenting beside the petition that
asks for it to be put on the record, then shows a neighbor how to help, where
to show up, and who has signed. It is an [Astro](https://astro.build) site on
Cloudflare Workers, built on the same two public packages as BackGold's
starter: [`@backgold/content`](https://www.npmjs.com/package/@backgold/content),
the typed client for the Content API, and
[`@backgold/astro`](https://www.npmjs.com/package/@backgold/astro), the
plumbing (routing, caching, the webhook, preview, the SEO routes, menus and
areas). The organization writes its petition, its asks, its events and its
menus in BackGold; this template decides how they look.

It is the template of BackGold's hosted `petition-drive` pages (the
accountability drives on the hosted builder), drawn as an Astro site, and
opens dark, as those pages do.

## template.json

| Key | What it declares |
| --- | --- |
| `key`, `name`, `audience`, `version` | `petition-drive`, *Petition drive*, for a `movement`, version 1. |
| `variants` | For each section type the kit draws, its layouts, the default first, each a subset of the contract's catalogue. Every type is listed, money sections included, because a page composed for one template renders on another; it is the starter that carries no money. |
| `areas` | Top banner above the header, Sidebar beside the page, Above the footer over it; any other area after the page. |
| `entryLayouts` | The kit's post, podcast, video and newsletter layouts, as the party template's. |
| `chrome` | The header `bar`, the footer `columns` (the brand, the anchors, the legal line and the bottom row: no donate strip), the takeover banner and the legal line. |
| `starter` | One page, its header and footer menus, no reusable sections. |

`node scripts/check-manifests.mjs` parses it with the contract's schema. After
a change merges here, refresh the platform's copy
(`packages/shared/site-templates/petition-drive.template.json`) in a platform
MR and run `pnpm --filter @givegold/shared templates:build` there.

## Where the files live

Everything a BackGold template draws the same way comes from the template kit,
[`packages/template-kit`](../../packages/template-kit). This directory holds
only what is the drive's:

| File | What it is |
| --- | --- |
| `template.json` | The manifest. |
| `src/template.ts` | The config for the kit: the manifest, the kit's sections with the drive's four layouts added, the kit's entry layouts, the faces, `defaultAppearance: 'dark'` and `frameFont: 'inter'`. |
| `src/components/sections/Petition/Anchored.astro` | Every Petition layout as the kit draws it, anchored at `#petition` when the section names no anchor (a hosted page's Petition is). |
| `src/components/sections/Issues/steps.astro` | Get involved: the kicker, the claim and the lead over numbered step cards (icon, "Step 01" in mono, title, line), then one action row with one filled button. |
| `src/components/sections/EventsList/list.astro` | Show up in person: a row per event with its date block, type, time and place, live counts, and its RSVP and Details buttons. |
| `src/components/sections/MovementTicker/index.astro` | Neighbors signing on: a live label over the figures the organization typed, in large mono numerals. |
| `src/styles/template.css` | The faces, the compact rhythm, the 13px corners, the mono labels, the band seams and the footer on the page's ground. |
| `astro.config.mjs`, `wrangler.jsonc`, `package.json` | The Worker (`template-petition-drive` in BackGold's namespaces) and its dependencies. |

## The starter page

A new site on this template begins with one page, Home (`""`), whose
sections are, top to bottom:

1. **Petition · Map**, on the page (`plain`), full width: BackGold's petition
   with its live map header, seeded with the camera dataset (`datasetPreset`
   `alpr` over `datasetArea` `US-TX`, the hosted seed's choice, so the band is
   live on first publish), the badge noun *ALPRs*, four asks, the
   *Addressed to* line, the goal note, the volunteer box, signer
   recognition, and three tiles (sites mapped and signatures counted live,
   public votes taken typed as 0). The frame draws its own dark map band and
   sheet, so the section stays the page's ground, as on a hosted
   petition-drive page.
2. **Key issues · Steps** (`#get-involved`), on the tint band: the four
   steps of documenting what the drive maps, and three actions: the global
   map (filled), Sign the petition and Join a mapping walk (outlined, to
   `#petition` and `#events`).
3. **Upcoming events · List** (`#events`), on the page: up to three.
4. **Movement ticker** (`#signers`), a contained card on the panel band.
5. **Call to action · Banner**, a contained card on the panel band: *Put
   it on the record*, its one button *Add to the map* to `#get-involved`.

The header menu is The petition, Get involved and Events, each an anchor on
Home, with **Sign the petition** as the header button on every page. The
footer menu repeats the three anchors.

**No money anywhere.** A petition drive's job is signatures: the starter has
no donate section, chip-in or donate link, the closing call's donate button
is blank on purpose, and the footer has no donate strip. An organization can
add a Donate section later; the template draws it.

All of it is starter copy in the voice of a local accountability drive,
naming no person and no place, and BackGold flags every starter word until
the organization replaces it.

## The map band is BackGold's frame

On a template site the Petition section is BackGold's own module. The Content
API sends it as an embed of the api's `/embed/petition/<page>/<block>`, and
the kit's `Petition/map.astro` frames it (`ModuleFrame`), asking it to wear
this site: the layout (`map`), the colours of the band it sits on, light and
dark, the radius and the type (`frameFont: 'inter'` in `src/template.ts`, the
drive's text face). That frame draws the whole band and sheet: the
live MapLibre map, its legend and count badge, the asks, the *Addressed to*
line, the sign form with its goal meter, the tiles, the volunteer box. The
template draws none of it twice, and never a field of its own.

## Dark first

The drive opens in the dark set of the organization's brand whatever the
visitor's system says (`defaultAppearance: 'dark'` in `src/template.ts`,
which the kit's `Site.astro` and `brandCss` honour for a site whose appearance
is `auto`). The header's switch still turns it light, and remembers the
choice. No starter band uses `contrast`, the one ground the dark set draws
light, so the whole page opens dark. To pin it, set the site's appearance in BackGold: **light** keeps it
light for everyone (and drops the switch), **dark** keeps it dark.

The colours are the organization's: the template names none. A drive that
wants the hosted DeFlock look sets a near-black primary, a pale secondary and
a gold accent as its brand.

## What to change first

1. **The petition.** Pick which petition the map band signs (BackGold's
   Petition section), and rewrite its heading and asks for your fight.
2. **The state or county.** The map starts on cameras across Texas; choose
   your own area (`datasetArea`), or your own dataset.
3. **The asks, Addressed to and the goal note.** Then the Get involved
   steps and the closing call.
4. **Events.** Post a mapping walk or the next public hearing; the list
   fills itself.

## Moving a hosted petition-drive page here

A hosted petition-drive page maps to this template block for section, one to
one: Navbar → the header menu (its anchors) and header button; Petition →
Petition (its `header` is the layout); Issues → Key issues (its `style` is the
layout, `steps` or `cards`); EventsList → Upcoming events; MovementTicker →
Movement ticker; Cta → Call to action; Footer and Disclaimer → the footer and
the legal line. The hosted ticker's live signer feed is not in the Content
API yet: until it is, the ticker here draws only the figures the organization
types.

## Develop locally

As the party template (its README has the settings table and the commands):
from the repository root, `pnpm install`, build `@backgold/content` and
`@backgold/astro`, then `pnpm --filter backgold-template-petition-drive run dev`.
`node scripts/starter-e2e.mjs --template petition-drive` builds and checks it
against the fixture Content API; with `--serve` it keeps the starter page
running (`PETITION_DRIVE_BRAND` swaps in another organization's colours).
