import type { APIRoute } from 'astro'
import { getBackgold } from '../server/context.js'
import { llmsTxt } from '../server/llms.js'
import { siteNotConfigured } from '../server/respond.js'
import { PLAIN, textResponse } from './text.js'

export const prerender = false

export const GET: APIRoute = async (context) => {
  const bg = await getBackgold(context)
  if (bg.setup) return siteNotConfigured()
  return textResponse(await llmsTxt(bg.client, bg.siteUrl), PLAIN)
}
