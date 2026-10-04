import { createClient } from '@backgold/content'
import { describe, expect, it, vi } from 'vitest'
import { handleWebhook, type WebhookDeps } from '../src/server/webhook.js'
import { API_ORIGIN, PK, WEBHOOK_SECRET, contentEvent, fakeApi, sign } from './fixtures.js'

const NOW = 1_790_000_000

function setup(overrides: Partial<WebhookDeps> = {}) {
  const client = createClient({ key: PK, apiOrigin: API_ORIGIN, fetch: fakeApi(184).fetch })
  const log = vi.fn()
  const deps: WebhookDeps = { client, siteId: 'cd_8f2a', secret: WEBHOOK_SECRET, now: NOW, log, ...overrides }
  return { client, log, deps }
}

function delivery(body: string, signature: string | null): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-BackGold-Delivery': 'dlv_42' }
  if (signature !== null) headers['X-BackGold-Signature'] = signature
  return new Request('https://pinevalleyliberty.org/api/backgold/webhook', { method: 'POST', headers, body })
}

describe('handleWebhook', () => {
  it('verifies the raw body, sets the version and answers 204', async () => {
    const { client, deps } = setup()
    const body = contentEvent(190)
    const res = await handleWebhook(delivery(body, sign(body, WEBHOOK_SECRET, NOW)), deps)
    expect(res.status).toBe(204)
    expect(client.version()).toBe(190)
  })

  it('answers 401 for a bad signature and changes nothing', async () => {
    const { client, deps, log } = setup()
    const body = contentEvent(190)
    const res = await handleWebhook(delivery(body, sign(body, 'whsec_someoneElse', NOW)), deps)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: expect.any(String), code: 'BAD_SIGNATURE' })
    expect(client.version()).toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('dlv_42'))
    expect(log.mock.calls.join(' ')).not.toContain(WEBHOOK_SECRET)
  })

  it('answers 401 for a body changed after signing', async () => {
    const { deps } = setup()
    const signature = sign(contentEvent(190), WEBHOOK_SECRET, NOW)
    expect((await handleWebhook(delivery(contentEvent(999), signature), deps)).status).toBe(401)
  })

  it('answers 401 for a stale timestamp and logs why', async () => {
    const { client, deps, log } = setup()
    const body = contentEvent(190)
    const res = await handleWebhook(delivery(body, sign(body, WEBHOOK_SECRET, NOW - 301)), deps)
    expect(res.status).toBe(401)
    expect(client.version()).toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('timestamp outside'))
  })

  it('answers 401 with no signature header', async () => {
    const { deps } = setup()
    expect((await handleWebhook(delivery(contentEvent(190), null), deps)).status).toBe(401)
  })

  it('answers 503 WEBHOOK_NOT_CONFIGURED with no secret', async () => {
    const { deps } = setup({ secret: undefined })
    const body = contentEvent(190)
    const res = await handleWebhook(delivery(body, sign(body, WEBHOOK_SECRET, NOW)), deps)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: expect.any(String), code: 'WEBHOOK_NOT_CONFIGURED' })
  })

  it('keeps the newest version when events arrive out of order', async () => {
    const { client, deps } = setup()
    for (const version of [190, 186, 192, 191]) {
      const body = contentEvent(version)
      expect((await handleWebhook(delivery(body, sign(body, WEBHOOK_SECRET, NOW)), deps)).status).toBe(204)
    }
    expect(client.version()).toBe(192)
  })

  it('ignores a signed event for another site of the organization', async () => {
    const { client, deps } = setup()
    const body = contentEvent(190, 'cd_other')
    expect((await handleWebhook(delivery(body, sign(body, WEBHOOK_SECRET, NOW)), deps)).status).toBe(204)
    expect(client.version()).toBeNull()
  })

  it('acknowledges a signed event that is not a content event', async () => {
    const { client, deps } = setup()
    const body = JSON.stringify({ id: 'evt_2', type: 'form.submitted', created_at: '2026-10-04T12:00:00.000Z', data: {} })
    expect((await handleWebhook(delivery(body, sign(body, WEBHOOK_SECRET, NOW)), deps)).status).toBe(204)
    expect(client.version()).toBeNull()
  })

  it('POSTs the rebuild hook through waitUntil and never surfaces its failure', async () => {
    const hookFetch = vi.fn(async () => new Response('nope', { status: 500 }))
    const pending: Array<Promise<unknown>> = []
    const { deps, log } = setup({
      rebuildHookUrl: 'https://gitlab.example/api/v4/projects/1/trigger/pipeline?token=glptt-secret',
      fetch: hookFetch as unknown as typeof fetch,
      waitUntil: (p) => pending.push(p),
    })
    const body = contentEvent(190)
    const res = await handleWebhook(delivery(body, sign(body, WEBHOOK_SECRET, NOW)), deps)
    expect(res.status).toBe(204)
    expect(pending).toHaveLength(1)
    await Promise.all(pending)
    expect(hookFetch).toHaveBeenCalledWith(expect.stringContaining('trigger/pipeline'), { method: 'POST' })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('rebuild hook answered 500'))
    expect(log.mock.calls.join(' ')).not.toContain('glptt-secret')
  })

  it('logs a rebuild hook that cannot be reached', async () => {
    const { deps, log } = setup({
      rebuildHookUrl: 'https://hooks.example/build',
      fetch: (async () => {
        throw new TypeError('network down')
      }) as typeof fetch,
    })
    const body = contentEvent(190)
    expect((await handleWebhook(delivery(body, sign(body, WEBHOOK_SECRET, NOW)), deps)).status).toBe(204)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('rebuild hook failed'))
  })
})
