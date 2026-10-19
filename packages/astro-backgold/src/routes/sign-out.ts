import type { APIRoute } from 'astro'
import { handleSignOut } from '../server/sign-in.js'
import { routeDeps } from './visitor-routes.js'

export const prerender = false

export const GET: APIRoute = async (context) => handleSignOut(context.request, await routeDeps(context))
