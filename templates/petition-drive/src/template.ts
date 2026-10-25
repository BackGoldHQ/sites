// The petition drive template, as the kit (@backgold/template-kit) draws it:
// its manifest, the kit's sections with four of the drive's own (every
// Petition layout anchored at `petition` as a hosted page's is, the Get
// involved funnel, the event rows, the signers card), the kit's entry
// layouts, its faces (the module frames' too) and its dark-first look. astro.config.mjs names this
// file to the kit's integration, whose routes draw every page with it.
//
// The faces, from Google Fonts: Bricolage Grotesque for headings, Inter for
// text, and IBM Plex Mono for the kickers, step labels, numerals and dates,
// which rides in the body face's request (the kit asks Google for the
// heading and body specs as `family=` parameters of one stylesheet), so a
// site whose theme in BackGold replaces the body face keeps the system
// monospace for those instead. src/styles/template.css sets the three as
// --font-display, --font and --font-mono.

import { siteTemplateManifestSchema } from '@backgold/template-kit/contract/site-templates'
import { defineTemplate, kitEntries, kitSections } from '@backgold/template-kit/template'
import manifest from '../template.json'
import EventsListList from './components/sections/EventsList/list.astro'
import IssuesSteps from './components/sections/Issues/steps.astro'
import MovementTicker from './components/sections/MovementTicker/index.astro'
import Petition from './components/sections/Petition/Anchored.astro'
import './styles/template.css'

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: {
    ...kitSections,
    Petition,
    'Petition:image': Petition,
    'Petition:map': Petition,
    'Petition:coverage': Petition,
    'Issues:steps': IssuesSteps,
    EventsList: EventsListList,
    'EventsList:list': EventsListList,
    MovementTicker,
  },
  entries: kitEntries,
  fonts: {
    heading: 'Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800',
    body: 'Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600',
  },
  // A drive opens dark, as the hosted petition-drive pages do; the header's
  // switch still turns it light, and a site pinned light in BackGold stays light.
  defaultAppearance: 'dark',
  // BackGold's module frames (the petition's map band and sign sheet) draw in
  // Inter, the drive's text face: `inter` is one of the embed look's faces.
  frameFont: 'inter',
})
