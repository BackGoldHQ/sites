import type { APIRoute } from 'astro'
import { handleProgress } from '../server/sign-in.js'
import { routeDeps } from './visitor-routes.js'

export const prerender = false

export const POST: APIRoute = async (context) => handleProgress(context.request, await routeDeps(context))
