// @ts-check
// The kit's Astro integration, which a template's astro.config.mjs adds as
// `templateKit({ template: './src/template.ts' })`:
//
// - the routes: /preview, /backgold-setup, the 404, the volunteer shifts
//   (/volunteer and /volunteer/<slug>) and every other address (/[...path])
//   are the kit's own pages (src/routes), in that order, so a template has
//   no src/pages of its own;
// - the template: those pages import `virtual:backgold-template`, which
//   resolves to the file the `template` option names (the template's config,
//   src/template.ts in the kit's terms; a path relative to the project root);
// - the source: the kit ships .astro, .ts and .css, so Vite compiles the
//   package as the template's own code, never pre-bundled, and bundles it
//   into the server build.

import { fileURLToPath } from 'node:url'

const PACKAGE = '@backgold/template-kit'
const TEMPLATE_MODULE = 'virtual:backgold-template'

/** A route page beside this module. */
const route = (/** @type {string} */ file) => new URL(`./routes/${file}`, import.meta.url)

/**
 * @param {{ template: string }} options
 * @returns {import('astro').AstroIntegration}
 */
export function templateKit(options) {
  if (!options || typeof options.template !== 'string' || !options.template) {
    throw new Error(`${PACKAGE}: templateKit({ template }) names the template's config, for example './src/template.ts'.`)
  }
  return {
    name: PACKAGE,
    hooks: {
      'astro:config:setup': ({ config, injectRoute, updateConfig }) => {
        const templatePath = fileURLToPath(new URL(options.template, config.root))
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'backgold:template',
                resolveId: (/** @type {string} */ id) => (id === TEMPLATE_MODULE ? templatePath : undefined),
              },
            ],
            optimizeDeps: { exclude: [PACKAGE] },
            ssr: { noExternal: [PACKAGE] },
          },
        })
        injectRoute({ pattern: '/preview', entrypoint: route('preview.astro'), prerender: false })
        injectRoute({ pattern: '/backgold-setup', entrypoint: route('setup.astro'), prerender: false })
        injectRoute({ pattern: '/404', entrypoint: route('not-found.astro'), prerender: false })
        injectRoute({ pattern: '/volunteer', entrypoint: route('volunteer.astro'), prerender: false })
        injectRoute({ pattern: '/volunteer/[slug]', entrypoint: route('volunteer-shift.astro'), prerender: false })
        injectRoute({ pattern: '/[...path]', entrypoint: route('catch-all.astro'), prerender: false })
      },
    },
  }
}

export default templateKit
