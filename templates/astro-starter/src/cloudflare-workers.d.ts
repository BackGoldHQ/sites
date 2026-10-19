// The one export of the Workers runtime module the site reads
// (src/lib/visitor.ts reads BACKGOLD_SECRET_KEY from it). Declared here
// so the site needs no Cloudflare types.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
}
