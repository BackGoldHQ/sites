import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { previewFromRequest } from './preview.js'

describe('previewFromRequest', () => {
  it('reads the token and the path a preview link carries', () => {
    assert.deepEqual(previewFromRequest('https://example.org/api/bg-preview?bg_preview=tok_1&path=%2Fissues'), {
      token: 'tok_1',
      path: '/issues',
    })
    assert.deepEqual(previewFromRequest(new URL('https://example.org/p?x=1&bg_preview=tok_2&path=/blog/levy-explained')), {
      token: 'tok_2',
      path: '/blog/levy-explained',
    })
  })

  it('takes a relative URL', () => {
    assert.deepEqual(previewFromRequest('/api/bg-preview?bg_preview=tok_3&path=/'), { token: 'tok_3', path: '/' })
  })

  it('is null without a token', () => {
    assert.equal(previewFromRequest('https://example.org/api/bg-preview?path=/issues'), null)
    assert.equal(previewFromRequest('https://example.org/api/bg-preview?bg_preview='), null)
    assert.equal(previewFromRequest('http://['), null)
  })

  it('answers / for an absent path (the test preview sends none)', () => {
    assert.deepEqual(previewFromRequest('https://example.org/api/bg-preview?bg_preview=tok'), { token: 'tok', path: '/' })
  })

  it('answers / for an unsafe path', () => {
    const unsafe = [
      'issues',
      '//evil.example',
      'https://evil.example/',
      '/a\\b',
      '/\\evil.example',
      '/a/../b',
      '/..',
      '/a/%2e%2e/b',
      '/a/%2E./b',
      '',
    ]
    for (const path of unsafe) {
      const url = `https://example.org/p?bg_preview=tok&path=${encodeURIComponent(path)}`
      assert.deepEqual(previewFromRequest(url), { token: 'tok', path: '/' }, path)
    }
  })

  it('answers / for a path with a control character, DEL or space', () => {
    // A URL parser drops a tab or newline: `/\t/evil.example` would resolve to https://evil.example/.
    for (const raw of ['%2F%09%2Fevil.example', '%2F%0A%2Fevil.example', '%2F%0D%2Fevil.example', '%2Fa%20b', '%2Fa%7F', '%2F%00']) {
      assert.deepEqual(previewFromRequest(`https://example.org/p?bg_preview=tok&path=${raw}`), { token: 'tok', path: '/' }, raw)
    }
  })

  it('keeps a safe path with dots that are not a parent segment', () => {
    assert.deepEqual(previewFromRequest('https://example.org/p?bg_preview=tok&path=%2Fv1.2%2F..notes'), {
      token: 'tok',
      path: '/v1.2/..notes',
    })
  })
})
