import { createClient } from '@backgold/content'
import { describe, expect, it } from 'vitest'
import { handleRevalidate } from '../src/server/revalidate.js'
import { API_ORIGIN, PK, WEBHOOK_SECRET, fakeApi } from './fixtures.js'

async function knownVersionClient() {
  const client = createClient({ key: PK, apiOrigin: API_ORIGIN, fetch: fakeApi(184).fetch })
  await client.setVersion(184)
  return client
}

const request = (authorization?: string) =>
  new Request('https://pinevalleyliberty.org/api/backgold/revalidate', {
    method: 'POST',
    headers: authorization === undefined ? {} : { Authorization: authorization },
  })

describe('handleRevalidate', () => {
  it('busts the version with the right bearer', async () => {
    const client = await knownVersionClient()
    const res = await handleRevalidate(request(`Bearer ${WEBHOOK_SECRET}`), { client, secret: WEBHOOK_SECRET })
    expect(res.status).toBe(204)
    expect(client.version()).toBeNull()
  })

  it('answers 401 for a wrong bearer and keeps the version', async () => {
    const client = await knownVersionClient()
    for (const auth of [`Bearer ${WEBHOOK_SECRET}x`, 'Bearer whsec_', WEBHOOK_SECRET, 'Basic abc']) {
      const res = await handleRevalidate(request(auth), { client, secret: WEBHOOK_SECRET })
      expect(res.status).toBe(401)
      expect((await res.json()).code).toBe('UNAUTHORIZED')
    }
    expect(client.version()).toBe(184)
  })

  it('answers 401 with no Authorization header', async () => {
    const client = await knownVersionClient()
    expect((await handleRevalidate(request(), { client, secret: WEBHOOK_SECRET })).status).toBe(401)
    expect(client.version()).toBe(184)
  })

  it('answers 503 WEBHOOK_NOT_CONFIGURED with no secret', async () => {
    const client = await knownVersionClient()
    const res = await handleRevalidate(request('Bearer anything'), { client, secret: undefined })
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('WEBHOOK_NOT_CONFIGURED')
    expect(client.version()).toBe(184)
  })
})
