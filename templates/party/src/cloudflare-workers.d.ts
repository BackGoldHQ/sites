// The one export of the Workers runtime module the template reads
// (src/lib/live.ts reads the site's vars from it). Declared here so the
// template needs no Cloudflare types.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
}
