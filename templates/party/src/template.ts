// The party template, as the kit (@backgold/template-kit) draws it: its
// manifest, the kit's sections and entry layouts as they are, and its own
// faces, Fraunces for headings and Public Sans for text, from Google Fonts.
// astro.config.mjs names this file to the kit's integration, whose routes
// draw every page with it.

import { siteTemplateManifestSchema } from '@backgold/contract/site-templates'
import { defineTemplate, kitEntries, kitSections } from '@backgold/template-kit/template'
import manifest from '../template.json'
import './styles/template.css'

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: kitSections,
  entries: kitEntries,
  fonts: {
    heading: 'Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,800;1,9..144,500',
    body: 'Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },
})
