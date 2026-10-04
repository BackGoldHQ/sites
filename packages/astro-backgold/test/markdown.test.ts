import { describe, expect, it } from 'vitest'
import { renderMarkdown, sanitizeRichText } from '../src/server/markdown.js'
import { relFor, safeEmbedUrl, safeHref, safeSrc } from '../src/server/urls.js'

describe('renderMarkdown', () => {
  it.each([
    ['the allowlist survives', '## Where it goes\n\nEvery dollar **counts**, _all_ of it.', '<h2>Where it goes</h2>\n<p>Every dollar <strong>counts</strong>, <em>all</em> of it.</p>\n'],
    ['lists and quotes', '- one\n- two\n\n1. first\n\n> said', '<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<ol>\n<li>first</li>\n</ol>\n<blockquote>\n<p>said</p>\n</blockquote>\n'],
    ['a hard break', 'line  \nnext', '<p>line<br>next</p>\n'],
    ['a script block is text', '<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['inline HTML is text', 'a <b onclick="x()">b</b>', '<p>a &lt;b onclick="x()"&gt;b&lt;/b&gt;</p>\n'],
    ['an img with onerror is text', '<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
    ['HTML inside a link label is text', '[<img src=x onerror=alert(1)>](https://example.org)', '<p><a href="https://example.org" rel="noopener">&lt;img src=x onerror=alert(1)&gt;</a></p>\n'],
    ['a link title is dropped', '[read](https://example.org/a "a title")', '<p><a href="https://example.org/a" rel="noopener">read</a></p>\n'],
    ['an image keeps src and alt only', '![a chart](https://example.org/c.png "t")', '<p><img src="https://example.org/c.png" alt="a chart"></p>\n'],
    ['a site-relative link has no rel', '[issues](/issues)', '<p><a href="/issues">issues</a></p>\n'],
    ['mailto and tel links', '[mail](mailto:info@example.org) [call](tel:+15555550100)', '<p><a href="mailto:info@example.org">mail</a> <a href="tel:+15555550100">call</a></p>\n'],
    ['javascript: link keeps its text', '[x](javascript:alert(1))', '<p>x</p>\n'],
    ['JAVASCRIPT: in any case', '[x](JaVaScRiPt:alert(1))', '<p>x</p>\n'],
    ['javascript: behind an entity', '[x](&#106;avascript:alert(1))', '<p>x</p>\n'],
    ['data: link', '[x](data:text/html;base64,PHNjcmlwdD4=)', '<p>x</p>\n'],
    ['data: image', '![x](data:image/png;base64,AAAA)', '<p></p>\n'],
    ['protocol-relative link', '[x](//evil.example/a)', '<p>x</p>\n'],
    ['an anchor link is not in the subset', '[x](#top)', '<p>x</p>\n'],
    ['h1 becomes h2; the page has the h1', '# Title', '<h2>Title</h2>\n'],
    ['h4 becomes h3', '#### Small', '<h3>Small</h3>\n'],
    ['code keeps its text, not its element', '`a<b`', '<p>a&lt;b</p>\n'],
  ])('%s', (_name, input, output) => {
    expect(renderMarkdown(input)).toBe(output)
  })
})

describe('sanitizeRichText', () => {
  it.each([
    ['allowlisted markup is kept', '<p>A <strong>b</strong> <em>c</em></p><h2>d</h2><h3>e</h3><ul><li>f</li></ul><ol><li>g</li></ol><blockquote>h</blockquote>i<br>j', '<p>A <strong>b</strong> <em>c</em></p><h2>d</h2><h3>e</h3><ul><li>f</li></ul><ol><li>g</li></ol><blockquote>h</blockquote>i<br>j'],
    ['script and its text are dropped', '<p>a<script>alert(1)</script>b</p>', '<p>ab</p>'],
    ['style element and attribute, class, handlers', '<style>p{}</style><p style="color:red" class="x" onclick="y()">s</p>', '<p>s</p>'],
    ['img onerror keeps src and alt only', '<img src="https://example.org/a.png" onerror="alert(1)" alt="a">', '<img src="https://example.org/a.png" alt="a">'],
    ['img without a safe src is dropped', '<img src="x" onerror="alert(1)">', ''],
    ['img data: src is dropped', '<img src="data:image/svg+xml,<svg onload=alert(1)>" alt="x">', ''],
    ['javascript: with a tab entity', '<a href="java&#x09;script:alert(1)">x</a>', 'x'],
    ['javascript: with a raw tab', '<a href="java\tscript:alert(1)">x</a>', 'x'],
    ['javascript: with a newline', '<a href="java\nscript:alert(1)">x</a>', 'x'],
    ['javascript: decimal entity', '<a href="&#106;avascript:alert(1)">x</a>', 'x'],
    ['javascript: named entity colon', '<a href="javascript&colon;alert(1)">x</a>', 'x'],
    ['javascript: leading space and case', '<a href="  JAVASCRIPT:alert(1)">x</a>', 'x'],
    ['javascript: leading control character', '<a href="\u0001javascript:alert(1)">x</a>', 'x'],
    ['vbscript:', '<a href="vbscript:msgbox(1)">x</a>', 'x'],
    ['data: link', '<a href="DATA:text/html,x">d</a>', 'd'],
    ['protocol-relative', '<a href="//evil.example">x</a>', 'x'],
    ['backslash protocol-relative', '<a href="/\\evil.example">x</a>', 'x'],
    ['a bare relative path is refused', '<a href="issues">x</a>', 'x'],
    ['absolute link gets rel=noopener; entities round-trip', '<a href=" https://example.org/?a=1&amp;b=2 " target="_blank">x</a>', '<a href="https://example.org/?a=1&amp;b=2" rel="noopener">x</a>'],
    ['site-relative link', '<a href="/issues#taxes">x</a>', '<a href="/issues#taxes">x</a>'],
    ['mailto and tel', '<a href="mailto:a@example.org">m</a><a href="tel:+15555550100">t</a>', '<a href="mailto:a@example.org">m</a><a href="tel:+15555550100">t</a>'],
    ['unclosed tags close where the browser closes them', '<p><strong>a<em>b</p>c', '<p><strong>a<em>b</em></strong></p><strong><em>c</em></strong>'],
    ['nested links are split as the browser splits them', '<a href="https://a.example"><a href="https://b.example">n</a></a>', '<a href="https://a.example" rel="noopener"></a><a href="https://b.example" rel="noopener">n</a>'],
    ['svg and math are dropped whole', '<svg><a href="https://x.example"><text>t</text></a></svg><math><mi>x</mi></math>ok', 'ok'],
    ['iframe, object, template, textarea are dropped whole', '<iframe src="https://x.example">f</iframe><object>o</object><template><p>t</p></template><textarea>ta</textarea>ok', 'ok'],
    ['unknown elements keep their text', '<div><span>a</span><table><tr><td>b</td></tr></table></div>', 'ab'],
    ['comments are dropped', 'a<!-- <script>x</script> -->b', 'ab'],
    ['text is re-escaped', 'a &amp; b &lt;c&gt; "d"', 'a &amp; b &lt;c&gt; "d"'],
    ['attribute quotes are re-escaped', '<img src="/api/media-files/m1" alt="say &quot;hi&quot; <now>">', '<img src="/api/media-files/m1" alt="say &quot;hi&quot; &lt;now&gt;">'],
    ['a broken attribute cannot open a tag', '<a href="https://example.org/"onmouseover="alert(1)">x</a>', '<a href="https://example.org/" rel="noopener">x</a>'],
  ])('%s', (_name, input, output) => {
    expect(sanitizeRichText(input)).toBe(output)
  })

  it('is idempotent', () => {
    const once = sanitizeRichText('<p>a <a href="https://example.org">b</a> &amp; <img src="/x.png" alt="&quot;"></p>')
    expect(sanitizeRichText(once)).toBe(once)
  })
})

describe('address policy', () => {
  it('links', () => {
    expect(safeHref('https://example.org')).toBe('https://example.org')
    expect(safeHref('#volunteer')).toBeNull()
    expect(safeHref('#volunteer', { anchors: true })).toBe('#volunteer')
    expect(safeHref('#', { anchors: true })).toBeNull()
    expect(safeHref('/\\evil')).toBeNull()
    expect(safeHref('https://')).toBeNull()
    expect(safeHref('ftp://example.org/x')).toBeNull()
  })

  it('takes any value, and names the links that leave the site', () => {
    for (const value of [null, undefined, 42, { url: '/x' }]) {
      expect(safeHref(value)).toBeNull()
      expect(safeSrc(value)).toBeNull()
    }
    expect(relFor('https://example.org')).toBe('noopener')
    expect(relFor('/issues')).toBeUndefined()
    expect(relFor('mailto:a@example.org')).toBeUndefined()
  })

  it('media takes no mailto or tel', () => {
    expect(safeSrc('mailto:a@example.org')).toBeNull()
    expect(safeSrc('tel:1')).toBeNull()
    expect(safeSrc('/api/lp-assets/a1/hero.webp')).toBe('/api/lp-assets/a1/hero.webp')
  })

  it('embeds are https, or http on localhost or 127.0.0.1', () => {
    expect(safeEmbedUrl('https://secure.backgold.com/embed/d/df_1')).toBe('https://secure.backgold.com/embed/d/df_1')
    expect(safeEmbedUrl('http://localhost:8787/f/p/b')).toBe('http://localhost:8787/f/p/b')
    expect(safeEmbedUrl('http://127.0.0.1:8787/f/p/b')).toBe('http://127.0.0.1:8787/f/p/b')
    for (const bad of ['http://secure.backgold.com/embed/d/df_1', 'http://localhost.evil.example/x', 'javascript:alert(1)', '//secure.backgold.com/x', '/embed/d/1', 'https://user:pw@secure.backgold.com/x', ' https://secure.backgold.com/x', null, 7]) {
      expect(safeEmbedUrl(bad), String(bad)).toBeNull()
    }
  })
})
