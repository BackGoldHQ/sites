import type { APIRoute } from 'astro'
import options from 'virtual:backgold/options'
import { getBackgold } from '../server/context.js'
import { robotsTxt } from '../server/seo.js'
import { PLAIN, textResponse } from './text.js'

export const prerender = false

export const GET: APIRoute = async (context) => {
  const bg = await getBackgold(context)
  return textResponse(robotsTxt({ siteUrl: bg.siteUrl, aiCrawlers: options.aiCrawlers, sitemap: options.sitemap }), PLAIN)
}
