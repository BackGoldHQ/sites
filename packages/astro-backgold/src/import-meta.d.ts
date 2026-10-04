// The middleware runs only in a site Vite builds (the integration registers
// it), and Vite replaces `import.meta.env.DEV` with a literal there.
interface ImportMeta {
  readonly env: { readonly DEV?: boolean }
}
