// POST /api/backgold/revalidate — a manual bust from the operator's or the
// partner's own tooling, authorized by the webhook secret as a bearer token.

import type { BackgoldContent } from '@backgold/content'
import { constantTimeEqual, errorResponse, noContent, siteNotConfigured } from './respond.js'

export interface RevalidateDeps {
  client: BackgoldContent | null
  /** `BACKGOLD_WEBHOOK_SECRET`. */
  secret: string | undefined
}

export async function handleRevalidate(request: Request, deps: RevalidateDeps): Promise<Response> {
  if (!deps.secret) return errorResponse(503, 'WEBHOOK_NOT_CONFIGURED', 'BACKGOLD_WEBHOOK_SECRET is not set on this Worker.')
  if (!deps.client) return siteNotConfigured()
  const match = /^Bearer\s+(.+)$/.exec(request.headers.get('Authorization') ?? '')
  if (!match || !(await constantTimeEqual(match[1]!.trim(), deps.secret))) {
    return errorResponse(401, 'UNAUTHORIZED', 'Send the webhook secret as a bearer token.', { 'WWW-Authenticate': 'Bearer' })
  }
  await deps.client.bust()
  return noContent()
}
