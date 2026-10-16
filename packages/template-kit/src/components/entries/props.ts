// What every entry layout and every list layout is given, by
// src/routes/catch-all.astro and src/routes/preview.astro.

import type { Areas, ContentTypeSummary, Entry, EntryDetail, PageResponse, TermsResponse } from '@backgold/content'
import type { Pager, ResolvedType } from '@backgold/astro/server'
import type { ListFilter } from '../../lib/entries'
import type { TemplateConfig } from '../../template'

export interface EntryLayoutProps {
  entry: EntryDetail
  /** The entry's type from GET /types; without it the custom fields are left out. */
  type: ContentTypeSummary | undefined
  /** The entry's areas (the issue layout looks for a sign-up in them). */
  areas: Areas | null
}

export interface ListLayoutProps {
  /** The template drawing the list (its intro's sections draw through its sections map). */
  template: TemplateConfig
  type: ResolvedType
  /** The list's address without slashes, as resolveRoute names it: the blog base (`news`) for the news list, the type's url_base for any other. */
  base: string
  /** One page of the list, newest first: the first page, or the one `?cursor=` asked for. */
  entries: Entry[]
  /** The links under the list: Older to the next page, Newest back to the first. */
  pager: Pager
  /** The terms the list offers to narrow it, from its unfiltered first page. */
  filter: ListFilter | null
  /** On a term's list, the term and its taxonomy; null on the whole list. */
  term: { taxonomy: TermsResponse['taxonomy']; term: TermsResponse['terms'][number] } | null
  /** The search box, on the news list and its terms' lists; null on every other list. */
  search: ListSearch | null
  /**
   * The list's own opening, in place of its plain title: the page at the
   * news list's address (resolveRoute's `intro`; the starter's `news` page,
   * whose Hero is board A4's "From the party"), its sections drawn above the
   * list. On the whole news list only; null everywhere else, and when no page
   * sits at that address.
   */
  intro?: PageResponse | null
}

export interface ListSearch {
  /** The news list's address, where the box sends `?q=`. */
  action: string
  /** The search the rows answer (`entries` are its results, with no pager); null when they are the list itself. */
  q: string | null
}
