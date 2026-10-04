/**
 * The route the template's setup page lives at (`src/pages/backgold-setup.astro`).
 * While `BACKGOLD_SITE_KEY` is missing or malformed the middleware rewrites
 * every HTML path to it, never cached and noindex; once the key is set the
 * path answers 404. `locals.backgold.setup.missing` names what to fix.
 */
export const SETUP_PATH = '/backgold-setup'
