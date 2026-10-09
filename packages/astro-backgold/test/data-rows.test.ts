import type { Section } from '@backgold/content'
import { describe, expect, it } from 'vitest'
import { dataRowsOf } from '../src/server/render.js'

const rowsOf = (...items: Record<string, unknown>[]): Section =>
  ({ type: 'EventsList', band: 'plain', bleed: 'full', variant: null, copy: {}, media: {}, links: [], data: { source: 'events', items } }) as unknown as Section

const dateOf = (item: Record<string, unknown>) => dataRowsOf(rowsOf({ title: 'Event', ...item }))[0]?.date

describe('dataRowsOf dates', () => {
  it("labels an instant with its calendar day in the row's timezone, keeping the value as given", () => {
    expect(dateOf({ starts_at: '2026-10-20T00:30:00.000Z', timezone: 'America/Chicago' })).toEqual({
      iso: '2026-10-20T00:30:00.000Z',
      label: 'October 19, 2026',
    })
  })

  it('follows standard time in January', () => {
    // 05:30Z is 23:30 CST on the 13th (it would be 00:30 on the 14th in CDT).
    expect(dateOf({ starts_at: '2027-01-14T05:30:00Z', timezone: 'America/Chicago' })?.label).toBe('January 13, 2027')
  })

  it('falls back to the day written in the value for a zone Intl rejects', () => {
    expect(dateOf({ starts_at: '2026-10-20T00:30:00.000Z', timezone: 'Mars/Olympus' })?.label).toBe('October 20, 2026')
  })

  it('leaves a date-only value as written', () => {
    expect(dateOf({ date: '2026-10-20', timezone: 'America/Chicago' })).toEqual({ iso: '2026-10-20', label: 'October 20, 2026' })
  })

  it('leaves a row without a timezone as written', () => {
    expect(dateOf({ starts_at: '2026-10-20T00:30:00.000Z' })?.label).toBe('October 20, 2026')
    expect(dateOf({ starts_at: '2026-10-20T00:30:00.000Z', timezone: null })?.label).toBe('October 20, 2026')
  })
})
