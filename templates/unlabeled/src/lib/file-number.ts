// The page as a file, for Hero · Cover's running head (U1, "File 001 —
// Home"): the page's title from BackGold's page list, numbered by the place
// its address holds among the header menu's links, read in order with each
// group's own link and then its children in place, every address counted
// once (Home, first in her menu, is 001). The header button is not a menu
// link. A page the menu does not name gets its title alone; a path that is no
// published page (a preview), or a failed read, gets null.
import type { BackgoldContent, MenuItem } from '@backgold/content'
import { menuOf, type MenuNode } from '@backgold/astro/server'

const trim = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path)

/** The menu's links in reading order, each address once. */
function linksOf(nodes: MenuNode[], seen: Set<string> = new Set()): MenuNode[] {
  const out: MenuNode[] = []
  for (const node of nodes) {
    if (node.href && !seen.has(node.href)) {
      seen.add(node.href)
      out.push(node)
    }
    out.push(...linksOf(node.children, seen))
  }
  return out
}

export async function pageFile(client: BackgoldContent, pathname: string): Promise<string | null> {
  try {
    const here = trim(pathname)
    const [pages, primary] = await Promise.all([client.pages(), client.menu('primary')])
    const page = pages.pages.find((p) => (p.is_home ? here === '/' : trim(p.url) === here))
    const title = page ? page.title?.trim() || (page.is_home ? 'Home' : null) : null
    if (!title) return null
    const items = (primary?.items ?? []).filter((item: MenuItem) => !item.header_button)
    const place = linksOf(menuOf(items, here)).findIndex((node) => node.current)
    return place >= 0 ? `File ${String(place + 1).padStart(3, '0')} — ${title}` : title
  } catch {
    return null
  }
}
