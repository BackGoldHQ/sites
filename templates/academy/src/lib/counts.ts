// The proof line's counts (the field hero's, src/components/ProofLine.astro),
// read at request time from the Content API: the courses (every page of
// GET /courses), their lessons (each course's lesson count, added up) and the
// videos (every page of GET /entries/video). Neither list answers with a
// total, so both are walked 50 at a time, each page cached under the content
// version like every other read. Null when either read fails: the line is
// then left out, never drawn with a guess.

import type { BackgoldContent } from '@backgold/content'

export interface Counts {
  courses: number
  lessons: number
  videos: number
}

const PAGE = 50

export async function countsOf(client: BackgoldContent): Promise<Counts | null> {
  try {
    let courses = 0
    let lessons = 0
    const seen = new Set<string>()
    let cursor: string | undefined
    for (;;) {
      const page = await client.courses({ limit: PAGE, cursor })
      if (!page) break
      courses += page.courses.length
      lessons += page.courses.reduce((sum, course) => sum + course.lesson_count, 0)
      // A cursor seen before would count the same pages again.
      if (!page.next_cursor || seen.has(page.next_cursor)) break
      seen.add(page.next_cursor)
      cursor = page.next_cursor
    }
    let videos = 0
    for await (const _ of client.allEntries('video', { limit: PAGE })) videos += 1
    return { courses, lessons, videos }
  } catch {
    return null
  }
}
