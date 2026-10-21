// The header menu as the bar and the phone sheet draw it, from menuOf's
// nodes: what an organization's menu rows can repeat is drawn once.
//
//   - The header button is never a plain item too: an item (at any depth)
//     with the button's label (case and spacing aside) is left out, so DONATE
//     reads once, as the button, whatever address each row names. An item
//     with the button's address under another label stays (a drive's "The
//     petition" beside its "Sign the petition" button).
//   - Two siblings with the same label and the same address are one item,
//     the first; a group that opens on its own address does not list that
//     address again among its children (MenuList lists it first).
//   - A group whose links come down to one (its own address and its
//     children, counted once) is a plain item: the group's label, the one
//     link's address, current where that link is. A group left with no link
//     at all (its one link was the button) is left out.
//
// The footer is not tidied here: its groups are its columns.
import type { MenuNode } from '@backgold/astro/server'

const sameLabel = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()
const sameItem = (a: MenuNode, b: MenuNode) => a.href === b.href && sameLabel(a.label, b.label)

const isButton = (node: MenuNode, button: MenuNode | null): boolean => button !== null && sameLabel(node.label, button.label)

function tidy(nodes: MenuNode[], button: MenuNode | null): MenuNode[] {
  const out: MenuNode[] = []
  for (const node of nodes) {
    const isGroup = node.children.length > 0
    if (!isGroup && isButton(node, button)) continue
    let children = isGroup ? tidy(node.children, button) : []
    if (node.href) children = children.filter((child) => !(child.children.length === 0 && sameItem(child, { ...node, children: [] })))
    let next: MenuNode = { ...node, children }
    if (isGroup) {
      const links = [...(node.href ? [{ ...node, children: [] }] : []), ...children]
      if (links.length === 0) continue
      const only = links.length === 1 ? links[0]! : null
      if (only && only.children.length === 0) next = { ...only, label: node.label, children: [] }
    }
    if (out.some((kept) => kept.children.length === 0 && next.children.length === 0 && sameItem(kept, next))) continue
    out.push(next)
  }
  return out
}

/** The header menu with repeats drawn once (above); `button` is the header button, when one shows. */
export function tidyHeaderMenu(nodes: MenuNode[], button: MenuNode | null): MenuNode[] {
  return tidy(nodes, button)
}
