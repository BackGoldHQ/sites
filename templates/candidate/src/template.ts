// The candidate template, as the kit (@backgold/template-kit) draws it: its
// manifest, the kit's sections and entry layouts with the template's own
// layouts added (Hero · portrait, Countdown · tiles and inline, its
// QuoteStrip · wall, the endorsements wall, in place of the kit's, its
// Issues · cards, the kit's counted, and its Donate · story, the kit's with
// no kicker; the kit's ContentPost · prose as its default, so a site that
// moves here keeps its articles in place), the news search beside the news
// list's head (C10), and its
// own faces, Barlow Condensed for headings and Public Sans for text, from
// Google Fonts. astro.config.mjs names this file to the kit's integration,
// whose routes draw every page with it.

import { siteTemplateManifestSchema } from '@backgold/template-kit/contract/site-templates'
import ContentPostProse from '@backgold/template-kit/components/sections/ContentPost/prose.astro'
import { defineTemplate, kitEntries, kitSections } from '@backgold/template-kit/template'
import manifest from '../template.json'
import CountdownInline from './components/sections/Countdown/inline.astro'
import CountdownTiles from './components/sections/Countdown/tiles.astro'
import DonateStory from './components/sections/Donate/story.astro'
import HeroPortrait from './components/sections/Hero/portrait.astro'
import IssuesCards from './components/sections/Issues/cards.astro'
import QuoteStripWall from './components/sections/QuoteStrip/wall.astro'
import './styles/template.css'

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: {
    ...kitSections,
    ContentPost: ContentPostProse,
    'Hero:portrait': HeroPortrait,
    'Issues:cards': IssuesCards,
    'Countdown:tiles': CountdownTiles,
    'Countdown:inline': CountdownInline,
    'QuoteStrip:wall': QuoteStripWall,
    'Donate:story': DonateStory,
  },
  entries: kitEntries,
  fonts: {
    heading: 'Barlow+Condensed:wght@500;600;700;800',
    body: 'Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },
  // The news search beside the list's head, on its subhead's line (C10).
  newsSearch: 'head',
})
