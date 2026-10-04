import type { APIRoute } from 'astro'
import { getBackgold } from '../server/context.js'
import { siteNotConfigured } from '../server/respond.js'
import { sitemapXml } from '../server/seo.js'
import { XML, textResponse } from './text.js'

export const prerender = false

export const GET: APIRoute = async (context) => {
  const bg = await getBackgold(context)
  if (bg.setup) return siteNotConfigured()
  return textResponse(await sitemapXml(bg.client, bg.siteUrl), XML)
}
