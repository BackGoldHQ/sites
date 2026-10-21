// The rewrite src/middleware.ts applies (marked.ts), on small pages:
// pnpm --filter backgold-template-nonprofit test
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { markHeading, rewritePage } from '../src/lib/marked.ts'

const page = (body) => `<!doctype html><html><head><title>A *page*</title></head><body class="x">${body}</body></html>`
const mark = (word) => `<span class="np-mark"><span class="np-mark-word">${word}</span><svg class="np-mark-u"`

test('marks the one starred word in a heading', () => {
  const out = rewritePage(page('<h1 class="h">Everyone eats. Everyone *helps*.</h1>'))
  assert.ok(out.includes(`<h1 class="h">Everyone eats. Everyone ${mark('helps')}`))
  assert.ok(out.includes('</span>.</h1>'))
  assert.ok(!out.includes('*helps*'))
})

test('marks a starred phrase, inside a link in the heading', () => {
  assert.ok(markHeading('<a href="/x">What&#39;s *really growing*</a>').includes(mark('really growing')))
})

test('leaves a heading with no pair, two pairs, a lone star or a star across a tag as written', () => {
  for (const inner of ['No mark here', 'Two *marks* in *one*', 'A lone * star', 'Across *a <em>tag*</em>', 'A * spaced* star']) {
    assert.equal(markHeading(inner), inner)
  }
})

test('touches nothing outside h1 to h3: paragraphs, h4, attributes, title, scripts, styles and JSON', () => {
  const body =
    '<p>A *paragraph*</p><h4>A *small* head</h4><h2 data-x="*attr*">Plain</h2>' +
    '<script type="application/ld+json">{"name":"<h2>*json*</h2>"}</script><style>h2::after{content:"<h2>*css*</h2>"}</style>'
  const out = rewritePage(page(body))
  for (const kept of ['<p>A *paragraph*</p>', '<h4>A *small* head</h4>', 'data-x="*attr*"', '<title>A *page*</title>', '"<h2>*json*</h2>"', '"<h2>*css*</h2>"']) {
    assert.ok(out.includes(kept), kept)
  }
})

test('writes the sprite once, after <body>, and a second pass changes nothing', () => {
  const once = rewritePage(page('<h2>Shifts that need *you*</h2>'))
  assert.ok(once.includes('<body class="x"><svg class="np-sprite"'))
  assert.equal(once.split('class="np-sprite"').length, 2)
  assert.equal(once.split('data-np-draw-in').length, 2)
  assert.equal(rewritePage(once), once)
})

test('adds the draw-in script only to a page with a marked word', () => {
  assert.ok(!rewritePage(page('<h2>No mark</h2>')).includes('data-np-draw-in'))
  assert.ok(rewritePage(page('<h2>A *mark*</h2>')).includes('<script data-np-draw-in>'))
})
