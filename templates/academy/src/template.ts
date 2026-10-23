// The academy template, as the kit (@backgold/template-kit) draws it: its
// manifest; its sections, the kit's with the academy's own over them
// (src/sections.ts: the field hero's proof line, the free course's feature
// card, the conversations grid, the doors), every one drawn through
// Kindled.astro, which loads the template's motion; the kit's entry layouts
// with its own over three of them: the Watch list over the video list and an
// all-video news list (Watch.astro: the videos grouped by their series), and
// a video's page in the theater (Video.astro); the header's brand set in
// type beside the organization's mark (HeaderBrand.astro); the footer's
// closing call as the organization's closing line beside its mark
// (Closing.astro); its own faces, Fraunces for headings and Public Sans for
// text, from Google Fonts, light first; and Sign in in the header (board
// D1): a classroom's lessons are kept for the people the organization knows.
// astro.config.mjs names this file to the kit's integration, whose routes
// draw every page with it.

import { siteTemplateManifestSchema } from '@backgold/contract/site-templates'
import { defineTemplate, kitEntries } from '@backgold/template-kit/template'
import manifest from '../template.json'
import { kindlingFrameColors } from './lib/kindling'
import Closing from './components/Closing.astro'
import HeaderBrand from './components/HeaderBrand.astro'
import Live from './components/Live.astro'
import Video from './components/entries/Video.astro'
import Watch from './components/entries/Watch.astro'
import Kindled from './components/sections/Kindled.astro'
import { classroomEntries } from './classroom'
import { drawn } from './sections'
import './styles/template.css'

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: Object.fromEntries(Object.keys(drawn).map((key) => [key, Kindled])),
  // The Watch list draws the video list, and the news list of an academy whose blog is its videos; a video's page is the theater.
  entries: { ...kitEntries, ...classroomEntries, 'video:grid': Watch, 'post:list': Watch, 'video:watch': Video },
  fonts: {
    heading: 'Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,800;1,9..144,500',
    body: 'Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },
  defaultAppearance: 'light',
  visitorSignIn: true,
  // BackGold's frames on a parchment band wear the parchment (src/lib/kindling.ts).
  frameColors: kindlingFrameColors,
  closingCall: Closing,
  headerBrand: HeaderBrand,
  livePage: Live,
})
