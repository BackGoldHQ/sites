// The section a course page, the courses list or a lesson page draws its
// academy layout as: no words, no rows, the plain band, the course pinned
// when the page is one course's. The layout then reads the course for this
// visitor itself (sections/Course/course.ts, sections/Classroom/classroom.ts).

import type { Section } from '@backgold/content'

export function academySection(type: 'Classroom' | 'Course' | 'Lesson', variant: string, courseSlug: string | null = null): Section {
  return {
    id: `${type.toLowerCase()}-page`,
    type,
    band: 'plain',
    bleed: 'full',
    variant,
    copy: {},
    media: {},
    links: [],
    options: courseSlug ? { courseSlug } : {},
  }
}
