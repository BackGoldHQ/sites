// A Resources section as its layouts draw it: the guides and downloads in
// the authored list (`resources`), in row order, each with its `title`,
// `kind` ("Guide", "Template"), `detail` ("PDF · 18 pp"), `summary`, `href`,
// picture (`imageUrl`) and whether it is `gated` behind an email. A row
// without a title is not a resource.
//
// The email capture is BackGold's, never drawn here: the section's one link
// (`buttonLabel` → `buttonHref`) is where a gated resource sends people (a
// page with the sign-up on it). So a gated resource links to that address
// and, failing it, to its own; an open one links to its own. The featured
// and band layouts' button is that link, else the first resource's own
// address under the same words.

import type { Section } from '@backgold/content'
import { safeSrc } from '@backgold/astro/server'
import { linkOf, links, rows, type Link } from '../../../lib/section'
import { text } from '../../../lib/format'

export interface Resource {
  title: string
  kind: string | null
  detail: string | null
  /** The summary's lines, blank ones dropped: the featured layout's points, the band's first line. */
  points: string[]
  /** Where the resource's card goes: the section's link for a gated one, else its own address. */
  link: Link | null
  picture: string | null
  gated: boolean
}

export interface Resources {
  kicker: string | null
  heading: string | null
  /** The chip on an open resource ("Free"). */
  openLabel: string
  /** The chip on a gated resource ("Email to unlock"). */
  gatedLabel: string
  /** The words on the featured and band layouts' button ("Get the playbook"). */
  buttonLabel: string
  /** The section's link: where a gated resource sends people. */
  signup: Link | null
  resources: Resource[]
}

export function resourcesOf(section: Section): Resources {
  const signup = links(section)[0] ?? null
  const resources = rows(section).flatMap((row) => {
    const title = text(row.title)?.trim()
    if (!title) return []
    const gated = row.gated === true
    const own = linkOf(title, row.href)
    return [
      {
        title,
        kind: text(row.kind)?.trim() ?? null,
        detail: text(row.detail)?.trim() ?? null,
        points: (text(row.summary) ?? '').split('\n').map((line) => line.trim()).filter(Boolean),
        link: gated && signup ? { ...signup, label: title } : own,
        picture: safeSrc(row.imageUrl),
        gated,
      },
    ]
  })
  return {
    kicker: text(section.copy.kicker),
    heading: text(section.copy.heading),
    openLabel: text(section.copy.openLabel)?.trim() ?? 'Free',
    gatedLabel: text(section.copy.gatedLabel)?.trim() ?? 'Email to unlock',
    buttonLabel: text(section.copy.buttonLabel)?.trim() ?? 'Get it',
    signup,
    resources,
  }
}

/** The featured and band layouts' one button: the section's link, else the resource's own address under the button's words. */
export function buttonFor(found: Resources, resource: Resource | undefined): Link | null {
  if (found.signup) return found.signup
  if (!resource?.link) return null
  return { ...resource.link, label: found.buttonLabel }
}

/** "Guide · PDF · 18 pp": the kind and the detail, the detail alone when it repeats the kind ("Spreadsheet"). */
export function metaOf(resource: Resource): string | null {
  const { kind, detail } = resource
  if (kind && detail && kind.toLowerCase() === detail.toLowerCase()) return detail
  return [kind, detail].filter(Boolean).join(' · ') || null
}

/** The distinct kinds in row order: the library's filter chips. */
export function kindsOf(resources: Resource[]): string[] {
  return [...new Set(resources.map((r) => r.kind).filter((kind): kind is string => kind !== null))]
}
