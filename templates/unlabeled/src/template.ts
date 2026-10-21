// The Unlabeled template, as the kit (@backgold/template-kit) draws it: one
// organization's site (Unlabeled, unlabeledtexas.com), hidden from every other
// organization's gallery. Its manifest, the kit's sections with three layouts
// of its own (the home cover as a cap stack over a halftoned photo, the
// ticker as a running line, the petition's sign sheet beside its heading and
// figures), the archive's sections and entry layouts (src/archive.ts, after
// the kit's so they win), its faces, its frames' face and corners, and its
// dark look. astro.config.mjs names this file to the kit's integration, whose
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
import { defineTemplate, kitEntries, kitSections } from '@backgold/template-kit/template'
import manifest from '../template.json'
import { archiveEntries, archiveSections } from './archive'
import HeroCover from './components/sections/Hero/cover.astro'
import MovementTicker from './components/sections/MovementTicker/index.astro'
import Petition from './components/sections/Petition/Sheet.astro'
import './styles/template.css'

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: {
    ...kitSections,
    'Hero:cover': HeroCover,
    MovementTicker,
    'MovementTicker:ticker': MovementTicker,
    Petition,
    'Petition:none': Petition,
    'Petition:image': Petition,
    'Petition:map': Petition,
    'Petition:coverage': Petition,
    ...archiveSections,
  },
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
})
