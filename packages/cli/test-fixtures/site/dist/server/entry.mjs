import { page } from './chunks/page.mjs'
export default { fetch: () => new Response(page()) }
