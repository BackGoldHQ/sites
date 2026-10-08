import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { visibleNow } from './areas.js'

const NOW = Date.parse('2026-10-20T05:00:00Z')
const item = (from: string | null, until: string | null) => ({ from, until })

describe('visibleNow', () => {
  it('shows an item with neither from nor until', () => {
    assert.equal(visibleNow(item(null, null), NOW), true)
  })

  it('hides an item whose from is ahead and shows it from that instant', () => {
    assert.equal(visibleNow(item('2026-10-20T05:00:01Z', null), NOW), false)
    assert.equal(visibleNow(item('2026-10-20T05:00:00Z', null), NOW), true, 'from is inclusive')
    assert.equal(visibleNow(item('2026-10-19T00:00:00Z', null), NOW), true)
  })

  it('hides an item whose until has come', () => {
    assert.equal(visibleNow(item(null, '2026-10-20T04:59:59Z'), NOW), false)
    assert.equal(visibleNow(item(null, '2026-10-20T05:00:00Z'), NOW), false, 'until is exclusive')
    assert.equal(visibleNow(item(null, '2026-10-20T05:00:01Z'), NOW), true)
  })

  it('needs both ends to hold', () => {
    assert.equal(visibleNow(item('2026-10-19T00:00:00Z', '2026-10-21T00:00:00Z'), NOW), true)
    assert.equal(visibleNow(item('2026-10-21T00:00:00Z', '2026-10-22T00:00:00Z'), NOW), false)
    assert.equal(visibleNow(item('2026-10-18T00:00:00Z', '2026-10-19T00:00:00Z'), NOW), false)
  })

  it('treats an instant it cannot read as unset, so a malformed string never hides content', () => {
    assert.equal(visibleNow(item('not a date', null), NOW), true)
    assert.equal(visibleNow(item(null, ''), NOW), true)
    assert.equal(visibleNow(item('garbage', 'also garbage'), NOW), true)
    assert.equal(visibleNow(item('garbage', '2026-10-19T00:00:00Z'), NOW), false, 'the end that parses still applies')
  })

  it('defaults now to Date.now()', () => {
    const realNow = Date.now
    Date.now = () => NOW
    try {
      assert.equal(visibleNow(item('2026-10-20T05:00:00Z', '2026-10-20T05:00:01Z')), true)
      assert.equal(visibleNow(item(null, '2026-10-20T05:00:00Z')), false)
    } finally {
      Date.now = realNow
    }
  })
})
