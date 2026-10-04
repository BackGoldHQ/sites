// What the text routes answer with.

export const XML = 'application/xml; charset=utf-8'
export const ATOM = 'application/atom+xml; charset=utf-8'
export const PLAIN = 'text/plain; charset=utf-8'

export const textResponse = (body: string, contentType: string): Response =>
  new Response(body, { headers: { 'Content-Type': contentType } })
