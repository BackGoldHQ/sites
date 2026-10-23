// The classroom's small words: a lesson's numeral as the boards set it
// ("05", "12"), and an id for one part of a section.

import type { Section } from '@backgold/content'

/** A lesson's place as a two-figure numeral: "05", "12", "104". */
export const numeral = (n: number): string => String(n).padStart(2, '0')

/** An id for one part of a section ("classroom-page-rail"), safe in an attribute. */
export const partId = (section: Section, part: string): string => `${section.id}-${part}`.replace(/[^A-Za-z0-9_-]/g, '-')
