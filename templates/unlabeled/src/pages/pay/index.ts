// /pay without a slug is /archive/pay, where the pay records are browsed
// (board U5); /pay/<slug> is a record's own page.
import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ redirect }) => redirect('/archive/pay', 301)
