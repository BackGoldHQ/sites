import { describe, expect, it } from 'vitest'
import { validSearch } from '../src/server/search.js'

describe('validSearch', () => {
  it('keeps a term of 2–80 characters after trim', () => {
    expect(validSearch('ab')).toBe('ab')
    expect(validSearch('x'.repeat(80))).toBe('x'.repeat(80))
    expect(validSearch('  levy  ')).toBe('  levy  ')
  })

  it('drops a term that is too short or too long after trim', () => {
    expect(validSearch('a')).toBeNull()
    expect(validSearch(' a ')).toBeNull()
    expect(validSearch('')).toBeNull()
    expect(validSearch('  ')).toBeNull()
    expect(validSearch('x'.repeat(81))).toBeNull()
    expect(validSearch(`  ${'x'.repeat(80)}  `)).toBe(`  ${'x'.repeat(80)}  `)
    expect(validSearch(`  ${'x'.repeat(81)}  `)).toBeNull()
  })

  it('is null for a missing value', () => {
    expect(validSearch(null)).toBeNull()
    expect(validSearch(undefined)).toBeNull()
  })
})
