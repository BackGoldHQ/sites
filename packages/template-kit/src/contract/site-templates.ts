// The template manifest schema every template's src/template.ts parses its
// template.json with, bundled from the vendored contract (@backgold/contract,
// private to the workspace) into dist/contract/site-templates.js by
// `pnpm build`; zod stays a dependency. The kit imports it as
// `#contract/site-templates`; a template as
// `@backgold/template-kit/contract/site-templates`.
export { siteTemplateManifestSchema } from '@backgold/contract/site-templates'
export type { SiteTemplateManifest } from '@backgold/contract/site-templates'
