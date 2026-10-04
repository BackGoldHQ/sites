import type { APIRoute } from 'astro'
import { getBackgold } from '../server/context.js'
import { text, waitUntilOf, workerEnv } from '../server/env.js'
import { handleWebhook } from '../server/webhook.js'

export const prerender = false

export const POST: APIRoute = async (context) => {
  const env = await workerEnv()
  const bg = await getBackgold(context)
  return handleWebhook(context.request, {
    client: bg.client,
    siteId: bg.site?.id ?? null,
    secret: text(env.BACKGOLD_WEBHOOK_SECRET),
    rebuildHookUrl: text(env.BACKGOLD_REBUILD_HOOK_URL),
    waitUntil: waitUntilOf(context.locals),
  })
}
