// What every entry layout and every list layout is given, by
// src/pages/[...path].astro and src/pages/preview.astro.

import type { Areas, ContentTypeSummary, Entry, EntryDetail, TermsResponse } from '@backgold/content'
import type { Pager, ResolvedType } from '@backgold/astro/server'
import type { ListFilter } from '../../lib/entries'

export interface EntryLayoutProps {
  entry: EntryDetail
  /** The entry's type from GET /types; without it the custom fields are left out. */
  type: ContentTypeSummary | undefined
  /** The entry's areas (the issue layout looks for a sign-up in them). */
  areas: Areas | null
}

export interface ListLayoutProps {
  type: ResolvedType
  /** One page of the list, newest first: the first page, or the one `?cursor=` asked for. */
  entries: Entry[]
  /** The links under the list: Older to the next page, Newest back to the first. */
  pager: Pager
  /** The terms the list offers to narrow it, from its unfiltered first page. */
  filter: ListFilter | null
  /** On a term's list, the term and its taxonomy; null on the whole list. */
  term: { taxonomy: TermsResponse['taxonomy']; term: TermsResponse['terms'][number] } | null
}
