import { decodeEntryCursor, encodeEntryCursor } from '@givegold/shared/content-api'
import { describe, expect, it } from 'vitest'
import { validCursor } from '../src/server/cursor.js'

const b64url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

describe('validCursor', () => {
  it('accepts exactly what the api’s decodeEntryCursor accepts', () => {
    const values = [
      encodeEntryCursor({ publish_at: '2026-09-29T12:00:00.000Z', id: 'ci_7d1' }),
      encodeEntryCursor({ publish_at: '2026-09-29 12:00:00', id: 'ci_é' }),
      encodeEntryCursor({ publish_at: '2026-01-01', id: 'x'.repeat(500) }),
      b64url('2026-09-29|'),
      b64url('|ci_1'),
      b64url('2026-09-29|ci_1|x'),
      b64url('not a date|ci_1'),
      b64url('no bar'),
      `${b64url('2026-09-29|ci_1')}=`,
      'garbage!',
      'a',
      '_-_-',
      'x'.repeat(513),
      '',
    ]
    for (const value of values) expect(validCursor(value) !== null, value.slice(0, 40)).toBe(decodeEntryCursor(value) !== null)
    expect(validCursor(values[0])).toBe(values[0])
    expect(validCursor(values[2])).toBeNull()
  })

  it('is null for a missing value', () => {
    expect(validCursor(null)).toBeNull()
    expect(validCursor(undefined)).toBeNull()
  })
})
