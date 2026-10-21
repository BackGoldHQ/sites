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
import type { FrameColors } from '@backgold/template-kit/lib/brand'
import manifest from '../template.json'
import { archiveEntries } from './archive'
import EventPage from './components/EventPage.astro'
import NotFound from './components/NotFound.astro'
import Filed from './components/sections/Filed.astro'
import { drawn } from './sections'
import './styles/template.css'

/**
 * BackGold's frames on her black bands: white ink, the greys, black fields on
 * hairlines, and both buttons the white block (a frame's submit is its
 * second button as often as its first: the RSVP's is).
 */
const DARK: FrameColors = {
  ground: '#000000',
  ink: '#ffffff',
  muted: '#949494',
  accent: '#ffffff',
  link: '#ffffff',
  button: '#ffffff',
  buttonInk: '#000000',
  button2: '#ffffff',
  button2Ink: '#000000',
  surface: '#000000',
  line: '#1a1a1a',
  lineStrong: '#616161',
}

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
  // Their colours: hers, as src/styles/template.css pins them on every band
  // (the kit would derive blue-blacks from her theme's dark set), in every
  // scheme: every band a frame can sit on is black here (the white ground is
  // a call to action's, which carries no frame).
  frameColors: () => DARK,
  // Their markup under her own stylesheet (src/pages/_backgold/frame.css.ts):
  // capitals in the meta face for labels, hairline square fields, the white
  // block submit, the count set huge.
  frameSkin: true,
  // One event's page as U8 draws it, and the 404 in her words.
  eventPage: EventPage,
  notFound: NotFound,
  // The archive is this template's own route, which no menu link in BackGold
  // can name: ARCHIVE at the end of the header menu (after PETITION, as the
  // boards draw it) and first in the BISD group, current on the archive and
  // on every record's own address but the records requests' (BISD: Public
  // info is current there); and first in the footer's The record,
  // with Request a record (the how-to on her records ledger) after it.
  menuLinks: [
    { label: 'Archive', href: '/archive', group: 'BISD', match: 'prefix', also: ARCHIVE_BASES.filter((base) => base !== '/records') },
    { label: 'The archive', href: '/archive', menu: 'footer', group: 'The record', match: 'prefix', also: ARCHIVE_BASES },
    { label: 'BISD: Public info', href: '/records', group: 'BISD', match: 'prefix' },
    { label: 'BISD: Public info', href: '/records', menu: 'footer', group: 'The record', match: 'prefix' },
    { label: 'Request a record', href: '/records#request-a-record', menu: 'footer', group: 'The record' },
  ],
})
