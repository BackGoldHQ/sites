// The ambient types the kit's modules are checked against: Astro's own
// (`*.astro` modules, `Astro.locals`), @backgold/astro's `locals.backgold`,
// the template's config the routes import (src/index.js serves it), and the
// one export of the Workers runtime module src/lib/env.ts reads. `*.astro`
// is for `tsc` alone, which cannot read a component; `astro check` reads
// each one's own props.
/// <reference types="astro/client" />
/// <reference types="@backgold/astro" />

declare module '*.astro' {
  const Component: import('astro/runtime/server/index.js').AstroComponentFactory
  export default Component
}

declare module 'virtual:backgold-template' {
  const template: import('./template').TemplateConfig
  export default template
}

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
}
