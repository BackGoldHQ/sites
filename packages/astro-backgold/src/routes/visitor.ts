import type { APIRoute } from 'astro'
import { handleVisitorReturn } from '../server/sign-in.js'
import { routeDeps } from './visitor-routes.js'

export const prerender = false

export const GET: APIRoute = async (context) => handleVisitorReturn(context.request, await routeDeps(context))
