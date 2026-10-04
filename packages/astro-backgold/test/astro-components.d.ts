// `.astro` imports in the tests, for tsc (Astro types them through its own
// TypeScript plugin, which `pnpm lint` does not run).
declare module '*.astro' {
  const component: import('astro/runtime/server/index.js').AstroComponentFactory
  export default component
}
