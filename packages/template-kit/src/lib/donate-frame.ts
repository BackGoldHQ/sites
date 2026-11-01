// A Donate frame's share of the page's address. A link to a site's Donate
// page carries what the gift starts with: QuickDonate's amounts link to
// `/donate?amount=25`, a donate place that opens a page links to
// `<page>?place=<slug>`, a mailer's link carries its `utm_*` names. The frame
// (sections/modules/ModuleFrame.astro) copies those names from the page's
// address into its own, as BackGold's hosted Donate page copies them into its
// checkout frame; the checkout inside the frame reads and checks its own
// address, so a name not copied never reaches it.
//
// The edge cache keys a page by its path alone (with a list's `cursor` and
// `q`), so a page that draws a Donate frame says it reads these names
// (READS_QUERY_HEADER): its stored copy is never served to a request that
// carries one, and that request's render is `no-store` (catch-all.astro).

import type { Areas, Section } from '@backgold/content'

/** The section types that draw BackGold's donate checkout in a frame. */
const DONATE_FRAME_TYPES = new Set(['Donate', 'QuickDonate'])

/**
 * The names the hosted Donate page copies (the platform's
 * DONATE_DOOR_PASSTHROUGH_KEYS, its five `utm_*` included) and the donate
 * place's `place`. Every other `utm_*` name is copied too (UTM_PREFIX).
 */
const DONATE_QUERY_NAMES = ['amount', 'frequency', 'fund', 'email', 'ref', 'place', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
const UTM_PREFIX = 'utm_'

/** The value of the page's READS_QUERY_HEADER when it draws a Donate frame. */
export const DONATE_READS_QUERY = [...DONATE_QUERY_NAMES, `${UTM_PREFIX}*`].join(',')

function isDonateName(name: string): boolean {
  return DONATE_QUERY_NAMES.includes(name) || name.startsWith(UTM_PREFIX)
}

/** Whether a frame of this module type takes the page's donate names. */
export function isDonateFrame(type: string): boolean {
  return DONATE_FRAME_TYPES.has(type)
}

/**
 * The frame's address with the page's donate names added: each name's first
 * value, when it is not empty and the address does not already carry that
 * name (BackGold's own wins).
 */
export function withDonateQuery(frame: URL, page: URLSearchParams): void {
  for (const [name, value] of page) {
    if (value && isDonateName(name) && !frame.searchParams.has(name)) frame.searchParams.set(name, value)
  }
}

/** Whether the page's address carries a donate name with a value. */
export function carriesDonateQuery(page: URLSearchParams): boolean {
  for (const [name, value] of page) if (value && isDonateName(name)) return true
  return false
}

/** Whether a page with these sections and areas draws a frame of a type `draws` names anywhere. */
function drawsFrame(sections: Section[], areas: Areas | null, draws: (type: string) => boolean): boolean {
  if (sections.some((s) => draws(s.type))) return true
  for (const items of Object.values(areas ?? {})) {
    for (const item of items) if (item.sections.some((s) => draws(s.type))) return true
  }
  return false
}

/** Whether a page with these sections and areas draws a Donate frame anywhere. */
export function drawsDonateFrame(sections: Section[], areas: Areas | null): boolean {
  return drawsFrame(sections, areas, isDonateFrame)
}

// ── A form frame's share of the page's address ──────────────────────────────
//
// A link to a page's form may name the choice it opens on: a site's open
// roles link to `/volunteer?pick=Phone%20Banker`, and the form's first
// Choose-one field offering that value takes it (BackGold's FormBlock frame
// reads `pick` off its own address). The frame copies the page's `pick`
// as it copies the donate names, and a page that draws a form frame says it
// reads the name (READS_QUERY_HEADER) the same way.

const FORM_FRAME_TYPES = new Set(['FormBlock'])
const PICK_NAME = 'pick'
/** The value of the page's READS_QUERY_HEADER when it draws a form frame. */
export const FORM_READS_QUERY = PICK_NAME

/** Whether a frame of this module type takes the page's `pick`. */
export function isFormFrame(type: string): boolean {
  return FORM_FRAME_TYPES.has(type)
}

/** The frame's address with the page's `pick` added, when the page carries one the address does not. */
export function withPickQuery(frame: URL, page: URLSearchParams): void {
  const pick = page.get(PICK_NAME)
  if (pick && !frame.searchParams.has(PICK_NAME)) frame.searchParams.set(PICK_NAME, pick)
}

/** Whether the page's address carries a `pick` with a value. */
export function carriesPickQuery(page: URLSearchParams): boolean {
  return !!page.get(PICK_NAME)
}

/** Whether a page with these sections and areas draws a form frame anywhere. */
export function drawsFormFrame(sections: Section[], areas: Areas | null): boolean {
  return drawsFrame(sections, areas, isFormFrame)
}
