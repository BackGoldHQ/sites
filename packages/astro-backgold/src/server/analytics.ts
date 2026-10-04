// The `analytics` block BackGold puts on the `/site` answer while the site
// shares its analytics (the switch is in BackGold, nowhere else). Typed
// structurally: the block's presence is what turns the island on.

import { safeEmbedUrl } from './urls.js'

export interface BackgoldAnalytics {
  provider: 'posthog'
  /** The BackGold project token: public, already in every hosted page. */
  key: string
  /** The api's `/ingest` proxy. */
  ingest: string
  group: { organization: string }
  site_domain_id: string
  environment: string
}

const TOKEN = /^[A-Za-z0-9_-]{1,200}$/
const ID = /^[A-Za-z0-9_.:-]{1,200}$/

/** The block when it is well formed, else undefined (and the island renders nothing). */
export function analyticsOf(answer: unknown): BackgoldAnalytics | undefined {
  const block = (answer as { analytics?: unknown } | null)?.analytics as Partial<BackgoldAnalytics> | null | undefined
  if (!block || typeof block !== 'object' || block.provider !== 'posthog') return undefined
  const { key, ingest, group, site_domain_id: siteDomainId, environment } = block
  if (typeof key !== 'string' || !TOKEN.test(key)) return undefined
  if (typeof ingest !== 'string' || !safeEmbedUrl(ingest)) return undefined
  const organization = group && typeof group === 'object' ? group.organization : undefined
  if (typeof organization !== 'string' || !ID.test(organization)) return undefined
  if (typeof siteDomainId !== 'string' || !ID.test(siteDomainId)) return undefined
  if (typeof environment !== 'string' || !ID.test(environment)) return undefined
  return { provider: 'posthog', key, ingest, group: { organization }, site_domain_id: siteDomainId, environment }
}
