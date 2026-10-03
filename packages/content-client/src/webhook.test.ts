import { strict as assert } from 'node:assert'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import { parseContentEvent, verifyBackgoldWebhook } from './webhook.js'

// The api's signing scheme (packages/api/src/lib/webhooks.ts
// signWebhookPayload), rebuilt with node:crypto so the vectors do not come
// from the code under test: `t=<t>,v1=<hex HMAC-SHA256 of "<t>.<body>">`.
function sign(payload: string, secret: string, timestamp: number): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`
}

const SECRET = 'whsec_test_0123456789abcdef'
const T = 1_759_400_000
const BODY = JSON.stringify({
  id: 'a7f3c2e91b',
  type: 'content.published',
  created_at: '2026-10-02T14:13:20.000Z',
  data: { site_domain_id: 'cd_8f2a', content_version: 185, content_item_id: 'ci_7d1' },
})

describe('verifyBackgoldWebhook', () => {
  const signature = sign(BODY, SECRET, T)

  it('accepts the api signature within the window', async () => {
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: SECRET, now: T + 10 }), true)
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: SECRET, now: T + 300 }), true)
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: SECRET, now: T - 300 }), true)
  })

  it('uses the clock when no `now` is passed', async () => {
    const t = Math.floor(Date.now() / 1000)
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature: sign(BODY, SECRET, t), secret: SECRET }), true)
  })

  it('rejects a tampered body', async () => {
    const tampered = BODY.replace('185', '186')
    assert.equal(await verifyBackgoldWebhook({ rawBody: tampered, signature, secret: SECRET, now: T }), false)
    assert.equal(await verifyBackgoldWebhook({ rawBody: `${BODY} `, signature, secret: SECRET, now: T }), false)
  })

  it('rejects an old timestamp', async () => {
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: SECRET, now: T + 301 }), false)
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: SECRET, now: T + 61, toleranceSeconds: 60 }), false)
  })

  it('rejects a timestamp in the future beyond the tolerance', async () => {
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: SECRET, now: T - 301 }), false)
  })

  it('rejects a missing part', async () => {
    const [t, v1] = signature.split(',')
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature: t!, secret: SECRET, now: T }), false)
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature: v1!, secret: SECRET, now: T }), false)
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature: '', secret: SECRET, now: T }), false)
  })

  it('rejects the wrong secret', async () => {
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: 'whsec_other', now: T }), false)
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: '', now: T }), false)
  })

  it('rejects a null or undefined header', async () => {
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature: null, secret: SECRET, now: T }), false)
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature: undefined, secret: SECRET, now: T }), false)
  })

  it('rejects malformed parts without throwing', async () => {
    const hex = signature.split('v1=')[1]!
    const cases = [
      'garbage',
      `t=abc,v1=${hex}`,
      `t=${T},v1=${hex.toUpperCase()}`,
      `t=${T},v1=${hex.slice(1)}`,
      `t=${T},v1=${hex}00`,
      `t=-${T},v1=${hex}`,
      `t=,v1=${hex}`,
    ]
    for (const bad of cases) {
      assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature: bad, secret: SECRET, now: T }), false, bad)
    }
    assert.equal(await verifyBackgoldWebhook({ rawBody: BODY, signature, secret: SECRET, now: T, toleranceSeconds: -1 }), false)
    assert.equal(
      await verifyBackgoldWebhook({ rawBody: 42 as unknown as string, signature, secret: SECRET, now: T }),
      false,
    )
  })
})

describe('parseContentEvent', () => {
  const envelope = (type: string, data: Record<string, unknown> = { site_domain_id: 'cd_8f2a', content_version: 185 }) =>
    JSON.stringify({ id: 'evt_1', type, created_at: '2026-10-02T14:13:20.000Z', data })

  it('accepts the five content events', () => {
    for (const type of ['site.published', 'content.published', 'content.unpublished', 'menu.updated', 'redirects.updated']) {
      assert.deepEqual(parseContentEvent(envelope(type)), {
        id: 'evt_1',
        type,
        created_at: '2026-10-02T14:13:20.000Z',
        data: { site_domain_id: 'cd_8f2a', content_version: 185 },
      })
    }
  })

  it('copies the optional ids and nothing else', () => {
    const parsed = parseContentEvent(
      JSON.stringify({
        id: 'evt_2',
        type: 'menu.updated',
        created_at: '2026-10-02T14:13:20.000Z',
        extra: 'dropped',
        data: { site_domain_id: 'cd_8f2a', content_version: 186, menu_key: 'primary', page_id: 'lp_1', content_item_id: 'ci_1', title: 'dropped' },
      }),
    )
    assert.deepEqual(parsed, {
      id: 'evt_2',
      type: 'menu.updated',
      created_at: '2026-10-02T14:13:20.000Z',
      data: { site_domain_id: 'cd_8f2a', content_version: 186, page_id: 'lp_1', content_item_id: 'ci_1', menu_key: 'primary' },
    })
  })

  it('rejects other events and garbage', () => {
    assert.equal(parseContentEvent(envelope('donation.completed')), null)
    assert.equal(parseContentEvent('{'), null)
    assert.equal(parseContentEvent(''), null)
    assert.equal(parseContentEvent('[]'), null)
    assert.equal(parseContentEvent('null'), null)
    assert.equal(parseContentEvent(envelope('site.published', { site_domain_id: 'cd_8f2a' })), null)
    assert.equal(parseContentEvent(envelope('site.published', { site_domain_id: 'cd_8f2a', content_version: '185' })), null)
    assert.equal(parseContentEvent(envelope('site.published', { content_version: 185 })), null)
    assert.equal(parseContentEvent(JSON.stringify({ type: 'site.published', created_at: 'x', data: { site_domain_id: 'a', content_version: 1 } })), null)
    assert.equal(parseContentEvent(JSON.stringify({ id: 'e', type: 'site.published', created_at: 'x', data: [] })), null)
  })
})
