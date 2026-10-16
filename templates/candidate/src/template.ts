// The candidate template, as the kit (@backgold/template-kit) draws it: its
// manifest, the kit's sections and entry layouts with the template's own
// layouts added (Hero · portrait, Countdown · tiles and inline, its
// QuoteStrip · wall, the endorsements wall, in place of the kit's, and its
// Issues · cards, the kit's counted), and its
// own faces, Barlow Condensed for headings and Public Sans for text, from
// Google Fonts. astro.config.mjs names this file to the kit's integration,
// whose routes draw every page with it.

import { siteTemplateManifestSchema } from '@backgold/contract/site-templates'
import { defineTemplate, kitEntries, kitSections } from '@backgold/template-kit/template'
import manifest from '../template.json'
import CountdownInline from './components/sections/Countdown/inline.astro'
import CountdownTiles from './components/sections/Countdown/tiles.astro'
import HeroPortrait from './components/sections/Hero/portrait.astro'
import IssuesCards from './components/sections/Issues/cards.astro'
import QuoteStripWall from './components/sections/QuoteStrip/wall.astro'
import './styles/template.css'

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: {
    ...kitSections,
    'Hero:portrait': HeroPortrait,
    'Issues:cards': IssuesCards,
    'Countdown:tiles': CountdownTiles,
    'Countdown:inline': CountdownInline,
    'QuoteStrip:wall': QuoteStripWall,
  },
  entries: kitEntries,
  fonts: {
    heading: 'Barlow+Condensed:wght@500;600;700;800',
    body: 'Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },
})
