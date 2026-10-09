// Which component draws an entry, and which draws a list, by content type, as
// template.json's `entryLayouts` names them. Each routable built-in type has
// a directory, `<type>/<layout>.astro`, one file for its entry layout and one
// for its list layout; every layout template.json names is registered below
// as '<type>:<layout>'. A type template.json does not name (one the
// organization adds in BackGold) is drawn with the post layouts.
//
// To give a type a different layout, add the file, register it here, and
// change the name in template.json.

import manifest from '../../../template.json'
import NewsletterIssue from './newsletter/issue.astro'
import NewsletterList from './newsletter/list.astro'
import PodcastEpisode from './podcast/episode.astro'
import PodcastList from './podcast/list.astro'
import PostArticle from './post/article.astro'
import PostList from './post/list.astro'
import VideoGrid from './video/grid.astro'
import VideoWatch from './video/watch.astro'

const ENTRY_LAYOUTS = {
  'post:article': PostArticle,
  'podcast:episode': PodcastEpisode,
  'video:watch': VideoWatch,
  'newsletter:issue': NewsletterIssue,
}

const LIST_LAYOUTS = {
  'post:list': PostList,
  'podcast:list': PodcastList,
  'video:grid': VideoGrid,
  'newsletter:list': NewsletterList,
}

const named: Record<string, { entry: string; list: string }> = manifest.entryLayouts

/** The type key whose layouts draw `key`: itself when template.json names it, else post. */
const drawnAs = (key: string): string => (Object.hasOwn(named, key) ? key : 'post')

function pick<T>(layouts: Record<string, T>, key: string, which: 'entry' | 'list', fallback: T): T {
  const type = drawnAs(key)
  const name = `${type}:${named[type]![which]}`
  return Object.hasOwn(layouts, name) ? layouts[name]! : fallback
}

/** The entry layout for an entry of type `key`. */
export const entryLayoutFor = (key: string) => pick<typeof PostArticle>(ENTRY_LAYOUTS, key, 'entry', PostArticle)

/** The list layout for a list of type `key` (`post` for the built-in types' shared list). */
export const listLayoutFor = (key: string) => pick<typeof PostList>(LIST_LAYOUTS, key, 'list', PostList)
