import type { APIRoute } from 'astro'
import { getBackgold } from '../server/context.js'
import { atomFeed } from '../server/feeds.js'
import { siteNotConfigured } from '../server/respond.js'
import { ATOM, textResponse } from './text.js'

export const prerender = false

export const GET: APIRoute = async (context) => {
  const bg = await getBackgold(context)
  if (bg.setup) return siteNotConfigured()
  return textResponse(await atomFeed(bg.client, bg.siteUrl, 'blog'), ATOM)
}
