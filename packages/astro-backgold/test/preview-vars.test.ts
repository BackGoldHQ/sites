import { describe, expect, it } from 'vitest'
import { withPreviewVars } from '../src/preview-vars.js'

const vars = { BACKGOLD_SITE_KEY: 'bg_site_pk_abc', SITE_URL: 'https://www.example.org', BACKGOLD_API_ORIGIN: 'https://api.backgold.com' }

describe('withPreviewVars', () => {
  it('copies the site key and the api origin into previews.vars, and never SITE_URL', () => {
    expect(withPreviewVars({ name: 'site', vars, previews: {} })?.previews).toEqual({
      vars: { BACKGOLD_SITE_KEY: 'bg_site_pk_abc', BACKGOLD_API_ORIGIN: 'https://api.backgold.com' },
    })
  })

  it('fills a blank preview value and keeps one the site set', () => {
    const next = withPreviewVars({ vars, previews: { vars: { BACKGOLD_SITE_KEY: '', BACKGOLD_API_ORIGIN: 'https://api.staging.example' }, limits: { cpu_ms: 50 } } })
    expect(next?.previews).toEqual({
      vars: { BACKGOLD_SITE_KEY: 'bg_site_pk_abc', BACKGOLD_API_ORIGIN: 'https://api.staging.example' },
      limits: { cpu_ms: 50 },
    })
  })

  it('changes nothing when the top level has no value to copy or previews already has both', () => {
    expect(withPreviewVars({ vars: { BACKGOLD_SITE_KEY: '' } })).toBeNull()
    expect(withPreviewVars({ vars, previews: { vars: { BACKGOLD_SITE_KEY: 'bg_site_pk_x', BACKGOLD_API_ORIGIN: 'https://a.example' } } })).toBeNull()
  })
})
