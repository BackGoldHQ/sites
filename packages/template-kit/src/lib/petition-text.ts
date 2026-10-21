// What a Petition section carries of its petition's own words, as the
// Content API sends them: the text (the editor's restricted HTML, sanitized
// here), the asks (the section's rows that are not stat tiles) and the legal
// note (the section's `goalNote`). Null when BackGold sends no text: the
// layout then draws nothing more and the frame keeps its text whole. The
// Unlabeled and nonprofit Petition layouts draw these beside the frame.
import type { Section } from '@backgold/content'
import { sanitizeRichText } from '@backgold/astro/server'
import { rows } from './section'
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

interface PetitionWords {
  html: string
  asks: { title: string; body: string | null }[]
  legal: string | null
}

export function petitionWords(section: Section): PetitionWords | null {
  const petition = (section.data as { petition?: Partial<SectionPetition> } | undefined)?.petition
  const raw = text(petition?.text_html)
  const html = raw ? sanitizeRichText(raw).trim() : ''
  if (!html) return null
  const asks = rows(section)
    .filter((row) => row.group === undefined || row.group === 'asks')
    .map((row) => ({ title: text(row.title), body: text(row.body) }))
    .filter((ask): ask is { title: string; body: string | null } => ask.title !== null)
  return { html, asks, legal: text(section.copy.goalNote) }
}
