// `.astro` imports in the component tests (Astro types them through its
// editor tooling, which plain tsc does not run).
declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js'
  const component: AstroComponentFactory
  export default component
}
