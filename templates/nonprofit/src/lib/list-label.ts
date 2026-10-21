// The post list's name as the organization's header menu words it (board
// N8, designer's call 17: the list at /news is labelled Stories). The kit
// names a list from its address ("News"); this template names it from the
// header menu's link to that address, at any depth, so the list's heading
// and a post's breadcrumb say what the menu says. No link to it, or no
// menu, and it is null: the kit's name stands.
import type { BackgoldContent, MenuResponse } from '@backgold/content'

type Item = MenuResponse['items'][number]

function find(items: Item[], path: string): string | null {
  for (const item of items) {
    if (item.url === path && item.label.trim()) return item.label.trim()
    const below = find(item.children ?? [], path)
    if (below) return below
  }
  return null
}

/** The header menu's label for the link to `path` (`/news`), or null. */
export async function listLabel(client: BackgoldContent, path: string): Promise<string | null> {
  const menu = await client.menu('primary').catch(() => null)
  return menu ? find(menu.items, path) : null
}
