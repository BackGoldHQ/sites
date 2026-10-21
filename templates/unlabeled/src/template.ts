// The Unlabeled template, as the kit (@backgold/template-kit) draws it: one
// organization's site (Unlabeled, unlabeledtexas.com), hidden from every other
// organization's gallery. Its manifest; its sections, every one filed under a
// running head (Filed.astro) and drawn by the kit's layouts, five of its own
// (the home cover, the ticker, the petition's sheet, the letter, the agenda)
// and the archive's (src/sections.ts); the archive's entry layouts
// (src/archive.ts, after the kit's so they win); its faces, its frames' face
// and corners, its own menu links, and its dark look. astro.config.mjs names this file to the kit's integration, whose
// routes draw every page with it.
//
// The faces, from Google Fonts: Ubuntu Sans Mono at 500 for every heading,
// numeral and button (set in capitals by src/styles/template.css), and
// JetBrains Mono at 400 and 500 for text and fields. A site wearing her saved
// theme in BackGold loads the theme's own files for both instead (the kit's
// src/lib/fonts.ts). The meta face, Office Code Pro, is a BackGold built-in
// that Google does not serve: the stylesheet names it first and falls back to
// JetBrains Mono.

import { siteTemplateManifestSchema } from '@backgold/contract/site-templates'
import { defineTemplate, kitEntries } from '@backgold/template-kit/template'
import manifest from '../template.json'
import { archiveEntries } from './archive'
import Filed from './components/sections/Filed.astro'
import { drawn } from './sections'
import './styles/template.css'

/** Where the archive's records open: each type's own address. */
const ARCHIVE_BASES = ['/meetings', '/decisions', '/data', '/pay', '/sources', '/records']

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: Object.fromEntries(Object.keys(drawn).map((key) => [key, Filed])),
  entries: { ...kitEntries, ...archiveEntries },
  fonts: {
    heading: 'Ubuntu+Sans+Mono:wght@500',
    body: 'JetBrains+Mono:wght@400;500',
  },
  // Dark only (decision 8): a site whose appearance is `auto` opens dark, and
  // src/styles/template.css hides the header's switch. Her site is pinned dark
  // in BackGold, which drops the switch outright.
  defaultAppearance: 'dark',
  // BackGold's frames (the petition's sheet, the forms, the donate form, the
  // RSVP, the sign-up) draw their titles and buttons in her display face, and
  // with square corners (decision 2).
  frameFont: 'ubuntu-sans-mono',
  frameRadius: 0,
  // The archive is this template's own route, which no menu link in BackGold
  // can name: ARCHIVE at the end of the header menu (after PETITION, as the
  // boards draw it) and first in the BISD group, current on the archive and
  // on every record's own address; and first in the footer's The record,
  // with Request a record (the how-to on her records ledger) after it.
  menuLinks: [
    { label: 'Archive', href: '/archive', group: 'BISD', match: 'prefix', also: ARCHIVE_BASES },
    { label: 'The archive', href: '/archive', menu: 'footer', group: 'The record', match: 'prefix', also: ARCHIVE_BASES },
    { label: 'BISD: Public info', href: '/records', group: 'BISD', match: 'prefix' },
    { label: 'BISD: Public info', href: '/records', menu: 'footer', group: 'The record', match: 'prefix' },
    { label: 'Request a record', href: '/records#request-a-record', menu: 'footer', group: 'The record' },
  ],
})
