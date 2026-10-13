// The one export of the Workers runtime module the template reads
// (src/lib/env.ts reads the site's vars and bindings from it). Declared here
// so the template needs no Cloudflare types.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
}
