// `Astro.locals.backgold`, typed for any project that imports this package
// (the integration also injects a reference to it into `.astro/types.d.ts`).

import type { BackgoldLocals } from './server/context.js'

declare global {
  namespace App {
    interface Locals {
      backgold: BackgoldLocals
    }
  }
}

export {}
