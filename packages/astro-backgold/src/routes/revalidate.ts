import type { APIRoute } from 'astro'
import { getBackgold } from '../server/context.js'
import { text, workerEnv } from '../server/env.js'
import { handleRevalidate } from '../server/revalidate.js'

export const prerender = false

export const POST: APIRoute = async (context) => {
  const env = await workerEnv()
  const bg = await getBackgold(context)
  return handleRevalidate(context.request, { client: bg.client, secret: text(env.BACKGOLD_WEBHOOK_SECRET) })
}
