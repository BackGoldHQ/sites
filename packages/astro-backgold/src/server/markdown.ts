// Entry bodies and rich-text fields as HTML a page can emit with `set:html`.
// Markdown goes through `marked` with every raw HTML token escaped; its output
// and any rich-text HTML then go through one allowlist: parse5 builds the tree
// a browser would build from the string (entities decoded, malformed nesting
// resolved by the HTML spec), and only allowlisted elements and attributes
// are written back out, every text and attribute value re-escaped.

import { Marked } from 'marked'
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5'
import { isAbsoluteHttp, safeHref, safeSrc } from './urls.js'

type Node = DefaultTreeAdapterTypes.ChildNode
type Element = DefaultTreeAdapterTypes.Element

/** The entry editor's subset. */
const ALLOWED = new Set(['h2', 'h3', 'p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'img', 'br'])
/** Headings outside the subset keep their place as the nearest allowed level; the page's one `<h1>` is the template's. */
const DEMOTED: Record<string, string> = { h1: 'h2', h4: 'h3', h5: 'h3', h6: 'h3' }
/** Elements dropped with everything inside them: their text is code, markup or a form's, never prose. */
const DROPPED_WITH_CONTENT = new Set([
  'script',
  'style',
  'template',
  'iframe',
  'object',
  'embed',
  'noscript',
  'noembed',
  'noframes',
  'textarea',
  'select',
  'title',
  'xmp',
  'svg',
  'math',
])
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, '&quot;')

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((a) => a.name === name)?.value
}

function children(node: { childNodes: Node[] }): string {
  return node.childNodes.map(write).join('')
}

function write(node: Node): string {
  if (node.nodeName === '#text') return escapeText((node as DefaultTreeAdapterTypes.TextNode).value)
  if (!('tagName' in node)) return ''
  const element = node as Element
  if (element.namespaceURI !== HTML_NAMESPACE || DROPPED_WITH_CONTENT.has(element.tagName)) return ''
  const tag = DEMOTED[element.tagName] ?? element.tagName
  if (!ALLOWED.has(tag)) return children(element)

  switch (tag) {
    case 'br':
      return '<br>'
    case 'img': {
      const src = safeSrc(attribute(element, 'src') ?? '')
      if (!src) return ''
      return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(attribute(element, 'alt') ?? '')}">`
    }
    case 'a': {
      const href = safeHref(attribute(element, 'href') ?? '')
      if (!href) return children(element)
      const rel = isAbsoluteHttp(href) ? ' rel="noopener"' : ''
      return `<a href="${escapeAttribute(href)}"${rel}>${children(element)}</a>`
    }
    default:
      return `<${tag}>${children(element)}</${tag}>`
  }
}

/** Rich-text field HTML reduced to the entry editor's allowlist. */
export function sanitizeRichText(html: string): string {
  return children(parseFragment(html))
}

const markdown = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html: ({ text }) => escapeText(text),
  },
})

/** An entry body's markdown as HTML: raw HTML escaped, then the allowlist sanitizer. */
export function renderMarkdown(md: string): string {
  return sanitizeRichText(markdown.parse(md, { async: false }))
}
