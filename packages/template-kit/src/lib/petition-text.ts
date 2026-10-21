// A Petition section's petition text, as the Content API sends it on the
// section's `data.petition.text_html` (the editor's restricted HTML), sanitized
// here. Null when BackGold sends no text: the layout then draws nothing more
// and the frame keeps its text whole. The Unlabeled and nonprofit Petition
// layouts draw it beside the sheet; the asks are the page's Issues band's and
// the legal note is the frame's, so neither is read here.
import type { Section } from '@backgold/content'
import { sanitizeRichText } from '@backgold/astro/server'
import { text } from './format'

// TODO(the platform MR from backgold branch task/petition-text-left):
// the vendored contract's SectionData has no `petition` yet; drop this type for
// the contract's once that MR lands and `contract-pull` brings it here.
/** The petition a Petition section names, on its `data` (the platform's Content API). */
interface SectionPetition {
  slug: string
  title: string
  text_html: string | null
  addressed_to: string | null
  signature_count: number
  goal: number | null
}

export function petitionText(section: Section): string | null {
  const petition = (section.data as { petition?: Partial<SectionPetition> } | undefined)?.petition
  const raw = text(petition?.text_html)
  const html = raw ? sanitizeRichText(raw).trim() : ''
  return html || null
}
