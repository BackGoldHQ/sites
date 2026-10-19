import type { APIRoute } from 'astro'
import { handleSignIn } from '../server/sign-in.js'
import { routeDeps } from './visitor-routes.js'

export const prerender = false

export const GET: APIRoute = async (context) => handleSignIn(context.request, await routeDeps(context))
