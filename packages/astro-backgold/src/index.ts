// `@backgold/astro`: the integration and the types a site's code names.
import './locals.js'

export { backgold } from './integration.js'
export { backgold as default } from './integration.js'
export type { BackgoldOptions } from './options.js'
export type { BackgoldEnv } from './server/env.js'
export type { BackgoldLocals, BackgoldReady, BackgoldSetup } from './server/context.js'
export type { Resolved, ResolvedType } from './server/resolve.js'
