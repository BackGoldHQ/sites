// The organization's YouTube stream as the kit draws it: the header's Watch
// Live item (layouts/Site.astro) and the /live page (routes/live.astro).
//
// The stream is `GET /live`, read once a request by @backgold/astro's
// liveStreamOf (the client's `live()`: held 60 s in memory, never under the
// content version). The edge cache keys every page on it, so a page drawn
// while the channel is live is never served once it is off, and the other way
// round. A read that fails, or an api with no `GET /live` yet, is nothing
// live: no item, and /live says so.
//
// What a page draws from the stream is built here from its video id (a
// YouTube id, else the stream is drawn as nothing live): the player
// (`embed_url` with `autoplay=1&rel=0`), the live chat for this site's host
// (in YouTube's dark look, `dark_theme=1`, on a site that opens dark),
// the watch address, the still, and its moments in UTC, which the visitor's
// browser writes again in their own zone (components/live/LocalTime.astro).
// `embed_url`, `url` and `thumbnail_url` are used when they are YouTube's own
// addresses for that id; anything else is built from the id.

import type { Areas, Entry, LiveStream } from '@backgold/content'
import { liveStreamOf, safeSrc, type BackgoldReady, type MenuNode } from '@backgold/astro/server'
import { streamTime } from './stream-time'

/** The kit's page for the stream (routes/live.astro). */
export const LIVE_PATH = '/live'

/** A YouTube video id. */
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/
const PLAYER_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'])
const WATCH_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'])

/** The request's stream (null while the channel is off the air, or when it could not be read). */
export function liveStream(bg: BackgoldReady): Promise<LiveStream | null> {
  return liveStreamOf(bg)
}

/** A header menu node, marked when it is the Watch Live item (MenuList draws its dot). */
export type LiveMenuNode = MenuNode & { live?: boolean }

/**
 * The header menu with Watch Live as its last item while the stream is live
 * (not while it is only upcoming): current on /live. A menu that already
 * links /live at its top level keeps its own link and gets no second one.
 */
export function withWatchLive(nodes: MenuNode[], stream: LiveStream | null, pathname: string): LiveMenuNode[] {
  if (stream?.status !== 'live' || nodes.some((node) => node.href === LIVE_PATH)) return nodes
  const here = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return [...nodes, { label: 'Watch Live', kind: 'page', href: LIVE_PATH, rel: undefined, current: here === LIVE_PATH, children: [], live: true }]
}

/** What a page draws of the stream. */
export interface StreamView {
  status: 'live' | 'upcoming'
  videoId: string
  title: string
  /** The watch address on YouTube. */
  watchUrl: string
  /** The player's address: the embed address with `autoplay=1&rel=0`. */
  playerSrc: string
  /** The live chat's address for this site's host, in YouTube's light look, or its dark one on a site that opens dark. */
  chatSrc: string
  /** The same chat in YouTube's dark look, for a template that draws it on a dark ground. */
  chatSrcDark: string
  /** The still: the stream's thumbnail, else YouTube's own for the id. */
  still: string
  /** When it went live, and the same in words in UTC (the server's text until the visitor's zone replaces it). */
  startedAt: string | null
  startedText: string | null
  /** When an upcoming stream starts, and the same in words in UTC. */
  scheduledAt: string | null
  scheduledText: string | null
  channelTitle: string | null
}

/** `raw` when it is an https address on one of `hosts` and passes `test`, else null. */
function youtubeUrl(raw: unknown, hosts: Set<string>, test: (url: URL) => boolean = () => true): URL | null {
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && hosts.has(url.hostname) && test(url) ? url : null
  } catch {
    return null
  }
}

/** The stream as a page draws it on `host` (`dark`: the site opens dark); null when it names no YouTube video id. */
export function streamView(stream: LiveStream, host: string, dark = false): StreamView | null {
  const id = stream.video_id
  if (!VIDEO_ID.test(id)) return null
  const player = youtubeUrl(stream.embed_url, PLAYER_HOSTS, (url) => url.pathname === `/embed/${id}`) ?? new URL(`https://www.youtube.com/embed/${id}`)
  player.search = ''
  player.searchParams.set('autoplay', '1')
  player.searchParams.set('rel', '0')
  const watch = youtubeUrl(stream.url, WATCH_HOSTS)?.toString() ?? `https://www.youtube.com/watch?v=${id}`
  const chat = new URL('https://www.youtube.com/live_chat')
  chat.searchParams.set('v', id)
  chat.searchParams.set('embed_domain', host)
  const chatDark = new URL(chat)
  chatDark.searchParams.set('dark_theme', '1')
  return {
    status: stream.status,
    videoId: id,
    title: stream.title.trim() || 'Live on YouTube',
    watchUrl: watch,
    playerSrc: player.toString(),
    chatSrc: (dark ? chatDark : chat).toString(),
    chatSrcDark: chatDark.toString(),
    still: safeSrc(stream.thumbnail_url) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    startedAt: streamTime(stream.started_at, 'time') ? stream.started_at : null,
    startedText: streamTime(stream.started_at, 'time', 'UTC'),
    scheduledAt: streamTime(stream.scheduled_start_at, 'day') ? stream.scheduled_start_at : null,
    scheduledText: streamTime(stream.scheduled_start_at, 'day', 'UTC'),
    channelTitle: stream.channel_title?.trim() || null,
  }
}

/** What the /live page's component is given: the kit's (components/live/LivePage.astro) or the template's `livePage`. */
export interface LivePageProps {
  /** The stream while it is live or upcoming; null while the channel is off the air. */
  stream: StreamView | null
  /** The three newest videos (GET /entries/video), newest first; empty without a video type. */
  videos: Entry[]
  /** The videos' list, for "All videos"; null without one. */
  videoList: { path: string; name: string } | null
  /** Who goes live, for "When … goes live": the channel's name, else the organization's. */
  channel: string
  /** The page's areas (the video list's), which the layout draws around it. */
  areas: Areas | null
}

/** The /live page's title and description in each state. */
export function liveHead(stream: StreamView | null, channel: string, siteName: string): { title: string; description: string } {
  if (stream?.status === 'live') {
    return { title: `Live now: ${stream.title} · ${siteName}`, description: `${channel} is live now: ${stream.title}. Watch the stream here.` }
  }
  if (stream) {
    const when = stream.scheduledText ? ` on ${stream.scheduledText}` : ''
    return { title: `Next live: ${stream.title} · ${siteName}`, description: `${channel} goes live${when}: ${stream.title}. Watch the stream here.` }
  }
  return { title: `Watch Live · ${siteName}`, description: `When ${channel} goes live, the stream plays here.` }
}
