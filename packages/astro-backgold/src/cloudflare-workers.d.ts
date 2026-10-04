// The one export of the Workers runtime module this package reads. Declared
// here so the package needs no Cloudflare types; never emitted to dist.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
}
