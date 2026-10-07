import type { BackgoldContent, ContentTypeSummary, MenuItem, SiteResponse } from '@backgold/content'
import { absoluteUrl, htmlToTextLines, isoDate, markdownLine, markdownText, markdownUrl, siteName, typeIndexPath, writtenBy } from './format.js'

/** Entries listed per type in `llms.txt`. */
const LLMS_ENTRIES_PER_TYPE = 20
/** Entries written out per type in `llms-full.txt`. */
const FULL_ENTRIES_PER_TYPE = 50
/** `llms-full.txt`'s size ceiling in UTF-8 bytes, the closing line included. */
const FULL_MAX_BYTES = 512 * 1024

/**
 * The line before every document in `llms-full.txt`. A document's header
 * (`### title`, then the `HEADER_LABELS` lines) runs from here to the first
 * blank line; no authored text can write this line.
 */
const DOCUMENT_DELIMITER = '---'
const HEADER_LABELS = ['Type', 'URL', 'Published', 'By', 'Summary'] as const

const routable = (types: ContentTypeSummary[]): ContentTypeSummary[] => types.filter((t) => typeIndexPath(t) !== null)

/** `# Name` and the description as a blockquote. */
function header(site: SiteResponse['site']): string[] {
  const lines = [`# ${markdownText(siteName(site))}`, '']
  if (site.seo.description) lines.push(`> ${markdownLine(site.seo.description)}`, '')
  return lines
}

const link = (label: string, url: string): string => `[${markdownText(label)}](${markdownUrl(url)})`

function menuLines(items: MenuItem[], siteUrl: string, depth: number): string[] {
  const lines: string[] = []
  const indent = '  '.repeat(depth)
  for (const item of items) {
    const url = absoluteUrl(item.url, siteUrl)
    const children = menuLines(item.children, siteUrl, depth + 1)
    if (url) lines.push(`${indent}- ${link(item.label, url)}`)
    else if (children.length > 0) lines.push(`${indent}- ${markdownText(item.label)}`)
    else continue
    lines.push(...children)
  }
  return lines
}

/** `GET /llms.txt`: the site, its menu as links, its types as sections. */
export async function llmsTxt(bg: BackgoldContent, siteUrl: string): Promise<string> {
  const [{ site }, menu, { types }] = await Promise.all([bg.site(), bg.menu('primary'), bg.types()])
  const lines = header(site)

  const menuItems = menu ? menuLines(menu.items, siteUrl, 0) : []
  if (menuItems.length > 0) lines.push('## Menu', '', ...menuItems, '')

  const sections = await Promise.all(
    routable(types).map(async (type) => ({ type, page: await bg.entries(type.key, { limit: LLMS_ENTRIES_PER_TYPE }) })),
  )
  for (const { type, page } of sections) {
    const items: string[] = []
    for (const entry of page?.entries ?? []) {
      const url = absoluteUrl(entry.url, siteUrl)
      if (!url) continue
      items.push(`- ${link(entry.title, url)}${entry.summary ? `: ${markdownText(entry.summary)}` : ''}`)
    }
    if (items.length > 0) lines.push(`## ${markdownText(type.plural_label)}`, '', ...items, '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * An entry body's markdown, kept as markdown inside its document: `<` is an
 * entity so no tag survives as markup, a line of three or more hyphens is
 * escaped so the body never writes the delimiter, and a code fence the body
 * leaves open is closed so it cannot swallow the documents after it.
 */
function bodyMarkdown(markdown: string): string {
  let fence: { char: string; length: number } | null = null
  const lines: string[] = []
  for (const raw of markdown.trim().split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw)
    if (marker) {
      const run = marker[1]!
      if (!fence) {
        if (!(run[0] === '`' && marker[2]!.includes('`'))) fence = { char: run[0]!, length: run.length }
      } else if (run[0] === fence.char && run.length >= fence.length && marker[2]!.trim() === '') {
        fence = null
      }
    }
    lines.push(raw.replace(/</g, '&lt;').replace(/^( {0,3})(-[ \t]*-[ \t]*-[ \t-]*)$/, '$1\\$2'))
  }
  if (fence) lines.push(fence.char.repeat(fence.length))
  return lines.join('\n')
}

const encoder = new TextEncoder()
const bytes = (text: string): number => encoder.encode(text).length

/** `GET /llms-full.txt`: every published page and entry as markdown, one delimited document each, capped. */
export async function llmsFullTxt(bg: BackgoldContent, siteUrl: string): Promise<string> {
  const [{ site }, { pages }, { types }] = await Promise.all([bg.site(), bg.pages(), bg.types()])
  const truncatedBlock = `${DOCUMENT_DELIMITER}\n\nThis file is truncated. Every address on the site is in ${siteUrl}/sitemap.xml.\n`
  const budget = FULL_MAX_BYTES - bytes(`\n${truncatedBlock}`)
  let out = `${header(site).join('\n')}\n`
  let used = bytes(out)
  let truncated = false

  /** Appends a document when it fits; false once the budget is spent. */
  const add = (headerLines: string[], body: string): boolean => {
    const block = `${[DOCUMENT_DELIMITER, '', ...headerLines].join('\n')}\n\n${body ? `${body}\n\n` : ''}`
    const size = bytes(block)
    if (used + size > budget) {
      truncated = true
      return false
    }
    out += block
    used += size
    return true
  }

  let open = true
  for (const summary of pages) {
    if (!open) break
    const read = await bg.page(summary.slug)
    if (!read) continue
    const title = read.page.title ?? read.page.meta.title ?? summary.slug
    const head = [`### ${markdownLine(title)}`, 'Type: Page']
    const url = absoluteUrl(read.page.url, siteUrl)
    if (url) head.push(`URL: ${url}`)
    // A section's prose only: a copy value that is one of its links' labels
    // (a button's words, which the Content API also carries as copy) is not a
    // paragraph of the page.
    const copy = read.sections.flatMap((section) => {
      const labels = new Set(section.links.map((l) => l.label))
      return Object.values(section.copy)
        .filter((text) => !labels.has(text))
        .flatMap((text) => htmlToTextLines(text).map((line) => markdownLine(line, HEADER_LABELS)))
    })
    open = add(head, copy.join('\n\n'))
  }

  for (const type of routable(types)) {
    if (!open) break
    let count = 0
    for await (const entry of bg.allEntries(type.key, { limit: FULL_ENTRIES_PER_TYPE })) {
      if (count === FULL_ENTRIES_PER_TYPE) {
        truncated = true
        break
      }
      count++
      const read = await bg.entry(type.key, entry.slug)
      if (!read) continue
      const detail = read.entry
      const head = [`### ${markdownLine(detail.title)}`, `Type: ${markdownLine(type.singular_label)}`]
      const url = absoluteUrl(detail.url, siteUrl)
      if (url) head.push(`URL: ${url}`)
      const date = isoDate(detail.publish_at)
      if (date) head.push(`Published: ${date.slice(0, 10)}`)
      const authors = writtenBy(detail.authors).map((a) => markdownLine(a.display_name))
      if (authors.length > 0) head.push(`By: ${authors.join(', ')}`)
      if (detail.summary) head.push(`Summary: ${markdownLine(detail.summary)}`)
      open = add(head, detail.body.markdown.trim() ? bodyMarkdown(detail.body.markdown) : '')
      if (!open) break
    }
  }

  const body = `${out.trimEnd()}\n`
  return truncated ? `${body}\n${truncatedBlock}` : body
}
