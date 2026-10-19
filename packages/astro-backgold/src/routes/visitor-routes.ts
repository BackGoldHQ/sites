// The four `/_backgold/` routes (server/sign-in.ts), one module so they share
// how a route reads its state: `locals.backgold`, the cookie jar, the api origin.
import type { APIContext } from 'astro'
import { getBackgold } from '../server/context.js'
import { DEFAULT_API_ORIGIN, text, workerEnv } from '../server/env.js'
import type { VisitorRouteDeps } from '../server/sign-in.js'

export async function routeDeps(context: APIContext): Promise<VisitorRouteDeps> {
  const env = await workerEnv()
  return { bg: await getBackgold(context), cookies: context.cookies, apiOrigin: text(env.BACKGOLD_API_ORIGIN) ?? DEFAULT_API_ORIGIN }
}
