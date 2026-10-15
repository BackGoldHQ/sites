// The footer menu as columns, from `menuOf` (the Shows on rules already
// applied). Each group is a column headed by its label, its links under it (a
// group with an address of its own lists it first; a link nested deeper is
// listed after its parent, in order). Links that sit at the top level,
// outside any group, share one column with no heading, before the groups.
// Site.astro counts the columns to size the footer's grid; FooterColumns
// draws them.
import type { MenuNode } from '@backgold/astro/server'

export interface FooterColumn {
  label: string | null
  links: MenuNode[]
}

/** A node and every link under it, in menu order, as one flat list. */
const flat = (node: MenuNode): MenuNode[] => [...(node.href ? [{ ...node, children: [] }] : []), ...node.children.flatMap(flat)]

export function footerColumnsOf(nodes: MenuNode[]): FooterColumn[] {
  const loose = nodes.filter((node) => node.children.length === 0)
  return [
    ...(loose.length > 0 ? [{ label: null, links: loose }] : []),
    ...nodes.filter((node) => node.children.length > 0).map((node) => ({ label: node.label, links: flat(node) })),
  ]
}
