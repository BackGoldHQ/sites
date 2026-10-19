// Which component draws an entry, and which draws a list, by content type, as
// the template's template.json `entryLayouts` names them. Each routable
// built-in type has a directory, `<type>/<layout>.astro`, one file for its
// entry layout and one for its list layout; each is registered below as
// '<type>:<layout>', and a template's `entries` (src/template.ts) is this map
// with any layouts of its own added. A type template.json does not name (one
// the organization adds in BackGold) is drawn with the post layouts.
//
// To give a type a different layout, add the file, register it in the
// template's `entries`, and change the name in its template.json.
//
// A lesson (`/<courses base>/<course>/<lesson>`) is not an entry of a type
// of its own: it is drawn by the template's `course:lesson` (the kit's is
// the Lesson section's Player layout), given LessonLayoutProps
// (lessonLayoutFor).

import type { AstroComponentFactory } from 'astro/runtime/server/index.js'
import type { TemplateConfig } from '../../template'
import CourseClassroom from './course/classroom.astro'
import CourseLesson from './course/lesson.astro'
import CourseSyllabus from './course/syllabus.astro'
import NewsletterIssue from './newsletter/issue.astro'
import NewsletterList from './newsletter/list.astro'
import PodcastEpisode from './podcast/episode.astro'
import PodcastList from './podcast/list.astro'
import PostArticle from './post/article.astro'
import PostList from './post/list.astro'
import VideoGrid from './video/grid.astro'
import VideoWatch from './video/watch.astro'

export const entries = {
  'post:article': PostArticle,
  'podcast:episode': PodcastEpisode,
  'video:watch': VideoWatch,
  'newsletter:issue': NewsletterIssue,
  'course:syllabus': CourseSyllabus,
  'post:list': PostList,
  'podcast:list': PodcastList,
  'video:grid': VideoGrid,
  'newsletter:list': NewsletterList,
  'course:classroom': CourseClassroom,
  'course:lesson': CourseLesson,
}

function pick(template: TemplateConfig, key: string, which: 'entry' | 'list', fallback: AstroComponentFactory): AstroComponentFactory {
  const named: Record<string, { entry: string; list: string }> = template.manifest.entryLayouts
  /** The type key whose layouts draw `key`: itself when template.json names it, else post. */
  const type = Object.hasOwn(named, key) ? key : 'post'
  const name = `${type}:${named[type]![which]}`
  return Object.hasOwn(template.entries, name) ? template.entries[name]! : fallback
}

/** The template's entry layout for an entry of type `key`. */
export const entryLayoutFor = (template: TemplateConfig, key: string) => pick(template, key, 'entry', PostArticle)

/** The template's list layout for a list of type `key` (`post` for the built-in types' shared list). */
export const listLayoutFor = (template: TemplateConfig, key: string) => pick(template, key, 'list', PostList)

/** The template's lesson layout: the `course:lesson` its entries register, else the kit's. */
export const lessonLayoutFor = (template: TemplateConfig): AstroComponentFactory =>
  Object.hasOwn(template.entries, 'course:lesson') ? template.entries['course:lesson']! : CourseLesson
