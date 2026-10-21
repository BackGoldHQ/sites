// The nonprofit template, as the kit (@backgold/template-kit) draws it: its
// manifest, the kit's sections with four of its own (Services · programs,
// the layout it proposes; EventsList · shifts, with spot dots and weeks;
// Issues · cards and Pathways · doors with the row's icon as a doodle), the
// kit's entry layouts, its faces and its light-first look. The hand-drawn
// look itself is src/styles/template.css; the doodle sprite and the marked
// word are src/middleware.ts's. astro.config.mjs names this file to the
// kit's integration, whose routes draw every page with it.
//
// The faces, from Google Fonts: Shantell Sans for display (headlines,
// numerals, stickers, the wordmark; variable, weight 300 to 800, with its
// italic and its Informal and Bounce axes, which template.css sets per use)
// and Nunito for text (400, 600, 700, 800 and the italic 400).

import { siteTemplateManifestSchema } from '@backgold/contract/site-templates'
import { defineTemplate, kitEntries, kitSections } from '@backgold/template-kit/template'
import manifest from '../template.json'
import EventsListShifts from './components/sections/EventsList/shifts.astro'
import IssuesCards from './components/sections/Issues/cards.astro'
import PathwaysDoors from './components/sections/Pathways/doors.astro'
import ServicesPrograms from './components/sections/Services/programs.astro'
import './styles/template.css'

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: {
    ...kitSections,
    Issues: IssuesCards,
    'Issues:cards': IssuesCards,
    Pathways: PathwaysDoors,
    'Pathways:doors': PathwaysDoors,
    'Services:programs': ServicesPrograms,
    'EventsList:shifts': EventsListShifts,
  },
  entries: kitEntries,
  fonts: {
    heading: 'Shantell+Sans:ital,wght,BNCE,INFM@0,300..800,-100..100,0..100;1,300..800,-100..100,0..100',
    body: 'Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400',
  },
  defaultAppearance: 'light',
})
