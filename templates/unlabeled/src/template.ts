// The unlabeled template, as the kit (@backgold/template-kit) draws it. Scaffold:
// the build pass adds its own layouts, faces and look here.
import { siteTemplateManifestSchema } from '@backgold/contract/site-templates'
import { defineTemplate, kitEntries, kitSections } from '@backgold/template-kit/template'
import manifest from '../template.json'
import './styles/template.css'

export default defineTemplate({
  manifest: siteTemplateManifestSchema.parse(manifest),
  sections: kitSections,
  entries: kitEntries,
  fonts: {
    heading: 'Public+Sans:wght@500;700',
    body: 'Public+Sans:wght@400;500;600;700',
  },
})
