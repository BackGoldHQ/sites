import { describe, expect, it } from 'vitest'
import { redirectFor } from '../src/server/redirects.js'

const rule = (destination: string | null, source = '/old', status_code = 301) => ({ source, destination, status_code })

describe('redirectFor', () => {
  it.each([
    ['/issues', '/issues'],
    ['https://example.org/new', 'https://example.org/new'],
    ['http://example.org/new', 'http://example.org/new'],
    ['/café', '/caf%C3%A9'],
  ])('sends %s as the Location', (destination, location) => {
    const res = redirectFor([rule(destination)], '/old')
    expect(res?.status).toBe(301)
    expect(res?.headers.get('Location')).toBe(location)
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/x',
    '/\\evil.example',
    'mailto:a@example.org',
    'tel:+15555550100',
    '#volunteer',
    'issues',
    'https://',
    'ftp://example.org/x',
    '/issues\nSet-Cookie: x=1',
  ])('ignores a rule whose destination is %j', (destination) => {
    expect(redirectFor([rule(destination)], '/old')).toBeNull()
  })

  it('lets a later usable rule for the same source answer', () => {
    const res = redirectFor([rule('javascript:alert(1)'), rule('/issues', '/old', 302)], '/old')
    expect(res?.status).toBe(302)
    expect(res?.headers.get('Location')).toBe('/issues')
  })

  it('answers 410 for a rule with no destination', () => {
    expect(redirectFor([rule(null)], '/old')?.status).toBe(410)
    expect(redirectFor([rule('')], '/old')?.status).toBe(410)
  })
})
