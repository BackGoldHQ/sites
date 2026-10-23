// The academy's classroom, drawn by the template itself (boards L1–L3 of
// docs/design/academy-2026-10/mockups/look, in the organization's colors,
// as the academy flagship brief's §6 items 4, 8, 9 and 10 ask): the course
// cards with their rings, the course page's hearth head and ruled syllabus,
// the lesson's theater with its rail of thumbnails, and the instructor's
// shelf. Each reads its courses, lessons and the visitor's place the way the
// kit's own layouts do (@backgold/template-kit's sections/Classroom,
// Course and Lesson), and the kit's Course · Outline stays the kit's.
//
// The template's section registry spreads `classroomSections` and its
// `entries` spread `classroomEntries`, each after the kit's so these win:
// `course:classroom` is the courses list (`/courses`), `course:syllabus` a
// course's page and `course:lesson` a lesson's. The look is
// src/styles/classroom.css, loaded with this file.
import type { AstroComponent } from '@backgold/template-kit/template'
import Books from './components/classroom/Books.astro'
import ClassroomGrid from './components/classroom/ClassroomGrid.astro'
import ClassroomList from './components/classroom/ClassroomList.astro'
import Course from './components/classroom/Course.astro'
import CoursePage from './components/classroom/CoursePage.astro'
import CoursesPage from './components/classroom/CoursesPage.astro'
import LessonPage from './components/classroom/LessonPage.astro'
import LessonPlayer from './components/classroom/LessonPlayer.astro'
import LessonReading from './components/classroom/LessonReading.astro'
import './styles/classroom.css'

export const classroomSections: Record<string, AstroComponent> = {
  Classroom: ClassroomGrid,
  'Classroom:grid': ClassroomGrid,
  'Classroom:list': ClassroomList,
  Course,
  'Course:syllabus': Course,
  Lesson: LessonPlayer,
  'Lesson:player': LessonPlayer,
  'Lesson:reading': LessonReading,
  'About:books': Books,
}

export const classroomEntries: Record<string, AstroComponent> = {
  'course:classroom': CoursesPage,
  'course:syllabus': CoursePage,
  'course:lesson': LessonPage,
}
