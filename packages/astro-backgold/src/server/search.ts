// The `?q=` a list page is searched by. The api's entry search accepts a
// term of 2–80 characters after trim; a value outside that bound is no
// search at all, so it never reaches the api, never enters an edge-cache
// key, and the list shows its first page.

/** The query parameter a list page reads. */
export const SEARCH_PARAM = 'q'

/** The api's bounds, applied after trimming. */
const SEARCH_MIN = 2
const SEARCH_MAX = 80

/** The value when it is a search term the api would accept, else null. */
export function validSearch(value: string | null | undefined): string | null {
  if (!value) return null
  const length = value.trim().length
  if (length < SEARCH_MIN || length > SEARCH_MAX) return null
  return value
}
