// /data without a slug is /archive/money, where the data buckets are
// browsed (board U5); /data/<slug> is a bucket's own page.
import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ redirect }) => redirect('/archive/money', 301)
