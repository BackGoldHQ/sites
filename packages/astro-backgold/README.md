# @backgold/astro

The plumbing for an [Astro](https://astro.build) site on Cloudflare Workers
that renders a BackGold site through the headless Content API: an edge cache
keyed by the site's content version, the webhook that bumps that version,
draft previews, the site's redirects, `sitemap.xml`, `robots.txt`, `llms.txt`
and an Atom feed, route resolution, and the components a page is built from.

It reads content with [`@backgold/content`](https://www.npmjs.com/package/@backgold/content).
The starter template (gitlab.com/backgold/backgold-starter, with a Deploy to
Cloudflare button) is a complete site built on it.

Requires Astro 7 with `@astrojs/cloudflare` 14 and Node 22.12+ to build.

## Install

```bash
npm install @backgold/astro @backgold/content
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import backgold from '@backgold/astro'

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [backgold()],
})
```

## Environment

Set on the Worker (`wrangler.jsonc` vars, `wrangler secret put` for secrets,
`.dev.vars` locally). The package reads them from `cloudflare:workers`.

| Name | Kind | Required | |
| --- | --- | --- | --- |
| `BACKGOLD_SITE_KEY` | var | yes | The site's publishable key, `bg_site_pk_…`, from the site's **Developer** page. |
| `BACKGOLD_API_ORIGIN` | var | no | Default `https://api.backgold.com`. |
| `SITE_URL` | var | set it in production | The site's public origin, for canonicals, the sitemap and feeds. Default: the request's origin, which is whatever `Host` the visitor sent; each origin then gets its own edge-cache entries, so a page is never served with another host's canonical, but crawlers can see the site under more than one address. |
| `BACKGOLD_CACHE` | KV binding | no | Where the client keeps its reads and the last content version it learned, shared by every isolate, so a new isolate starts warm and spares the api. Without it each isolate keeps its own copy in memory and reads everything from BackGold once. |
| `BACKGOLD_SECRET_KEY` | secret | for preview (key mode) | A secret key, `bg_site_sk_…`. Only `loadPreview` (your `/preview` page) reads it, and only without `BACKGOLD_API`; it never reaches a page or a cache. |
| `BACKGOLD_WEBHOOK_SECRET` | secret | for webhooks | The webhook endpoint's signing secret, `whsec_…`. Also the bearer token for `/api/backgold/revalidate`. |
| `BACKGOLD_REBUILD_HOOK_URL` | secret | no | POSTed after each verified content event, for a site that rebuilds statically. Failures are logged, never surfaced. |
| `BACKGOLD_SITE_ID` | var | single-site first-party only | The site's id. Set, it makes the site first-party: every read, previews included, goes through `BACKGOLD_API` as that site, and `BACKGOLD_SITE_KEY` and `BACKGOLD_SECRET_KEY` are not read. |
| `BACKGOLD_API` | service binding | first-party only | The binding to the api's `FirstParty` entrypoint. `BACKGOLD_API_ORIGIN` still names the origin the addresses are built on; the binding ignores the host. Without `BACKGOLD_SITE_ID` it makes the Worker a template's shared Worker (below). |

First-party mode is for a site Worker inside BackGold's own namespace, and
BackGold sets these names up for it. A site built elsewhere never sets them: it
reads with its site keys, and an `X-BackGold-Site` header a visitor sends it
is ignored. `Astro.locals.backgold.firstParty` says which mode the request
ran in, and `Astro.locals.backgold.siteId` which site it rendered.

### A template's shared Worker (the dispatched form)

One of BackGold's templates runs as one Worker in BackGold's dispatch
namespace serving every site on that template, so no var can name the site.
The Worker has the `BACKGOLD_API` binding and no `BACKGOLD_SITE_ID`; the api
routes each request for a site's domain to the template's Worker and names
the site in the `X-BackGold-Site: <site id>` request header, which it
overwrites on every request. A namespace Worker has no routes and no
`workers.dev` address, so the api's dispatch is the only way in and the
header is trusted.

- **The site.** `BACKGOLD_SITE_ID` wins when it is set (a single-site
  Worker); otherwise the header names the site. A request whose header is
  missing or is not a site id (1–64 letters, digits, `_` or `-`) answers
  `404` `text/plain` `No site.` with `Cache-Control: no-store`: never the
  setup page (nothing is misconfigured) and never a render, and nothing is
  read from BackGold. The setup page lists `BACKGOLD_API` only for a Worker
  with `BACKGOLD_SITE_ID` and no binding.
- **One client per site.** Each isolate keeps a client per site it has
  served, up to 32, dropping the least recently used. Every client keys its
  `BACKGOLD_CACHE` (or memory) entries under its own scope, a hash of
  `first-party:<site id>`, so the sites sharing one KV namespace never read
  each other's values.
- **The edge cache** keys every page by the request's site id and origin
  (see [Caching](#caching)), so one site's page is never served to another.
- **`SITE_URL` is not read**: every site's origin is the one its request
  arrived on, the site's own domain.
- **Previews.** `loadPreview` reads the draft through `BACKGOLD_API` as the
  site the request names, with no secret key. A preview request naming no
  site answers the same `404 No site.`, with the preview headers.
- **The webhook and revalidate routes are unreachable**: the api keeps
  `/api/*` on every domain it routes, so `/api/backgold/webhook` and
  `/api/backgold/revalidate` never reach the Worker, and BackGold purges
  nothing through them. A publish reaches the site the way it does a site
  with no webhook: each client re-checks its site's content version with a
  conditional `GET /site` once its known version is more than 60 seconds
  old, and stores the answer in `BACKGOLD_CACHE` for the next isolate, so a
  publish shows within about a minute.

A Cloudflare preview deployment (a pull request's or a branch's address) reads
only the `previews` block of the Worker's config, never the top-level `vars`.
Each `astro build` copies `BACKGOLD_SITE_KEY` and `BACKGOLD_API_ORIGIN` into
`previews.vars` of the config the adapter writes, unless the site set its own
there, so previews show the site.

Until `BACKGOLD_SITE_KEY` is set to a publishable key (with `BACKGOLD_SITE_ID`
set, until `BACKGOLD_API` is a binding), or while `BACKGOLD_API_ORIGIN` is not an
http(s) URL, every HTML path renders the
site's setup page at `/backgold-setup` (`SETUP_PATH` from
`@backgold/astro/server`), uncached and noindex, and
`Astro.locals.backgold.setup.missing` names what to fix. Once configured, that
path answers 404.

There is no analytics setting. The `<Analytics>` component follows the
site's analytics block from BackGold, which an owner or admin turns on or off
there.

## Options

```js
backgold({
  sitemap: true,   // GET /sitemap.xml
  robots: true,    // GET /robots.txt
  llms: true,      // GET /llms.txt and /llms-full.txt
  feeds: true,     // GET /feed.xml
  aiCrawlers: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'],
})
```

Each option defaults to on. `aiCrawlers` are the user agents `robots.txt`
names as allowed; a name must be letters, digits, `.`, `_` or `-`.

## Routes

| Route | |
| --- | --- |
| `POST /api/backgold/webhook` | Verifies `X-BackGold-Signature` over the raw body (5-minute window), then trusts the event's `content_version`; versions only move forward, so out-of-order deliveries are harmless. The Worker isolate that receives it moves to the new version at once and writes it to `BACKGOLD_CACHE`; every other running isolate keeps its version until its own re-check, at most 60 seconds later. `204`. An event for another of the organization's sites, or a signed event that is not a content event, is acknowledged and ignored. No secret: `503 WEBHOOK_NOT_CONFIGURED`. Bad or expired signature: `401 BAD_SIGNATURE`. Rejections are logged with the `X-BackGold-Delivery` id. |
| `POST /api/backgold/revalidate` | `Authorization: Bearer <BACKGOLD_WEBHOOK_SECRET>`, compared in constant time. Forgets the content version so the isolate's next request re-reads it from BackGold (other isolates re-check within 60 seconds). `204`; `401 UNAUTHORIZED`; no secret: `503 WEBHOOK_NOT_CONFIGURED`. |
| `GET /sitemap.xml`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/feed.xml` | Generated from the site's content, cached like pages. |
| `GET /_backgold/sign-in`, `GET /_backgold/visitor`, `GET /_backgold/sign-out`, `POST /_backgold/progress` | A visitor signing in on the site, and a lesson saving their place: see [Signed-in visitors](#signed-in-visitors). First-party sites only (`404` with a site key). Never cached. |

```bash
curl -X POST https://<your site>/api/backgold/revalidate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BACKGOLD_WEBHOOK_SECRET"
```

Send the JSON content type: Astro's origin check answers `403` to a POST from
outside the site that has no content type or a form one.

`/preview` is a page of the site's own, `src/pages/preview.astro`, so a draft
renders in the site's layout. It is BackGold's "Preview on your site" link
(`?bg_preview=<token>&path=<path>`). In first-party mode `loadPreview` reads
the draft through `BACKGOLD_API` as the site, with no key: nothing to set up.
Otherwise it reads with `BACKGOLD_SECRET_KEY`, and with no secret key answers
`503 PREVIEW_NOT_CONFIGURED`. Every answer on the path, the draft or any
error, carries `Cache-Control: private, no-store` and `X-Robots-Tag: noindex,
nofollow` (the middleware adds them to whatever the page answers) and is
never cached. A missing, malformed (`.`, `..`), bad or expired token: `400
BAD_PREVIEW_TOKEN`. BackGold not answering in 10 seconds: `504
PREVIEW_UNAVAILABLE`; any other failure reading or rendering the draft: `502
PREVIEW_UNAVAILABLE`. None of them names anything internal.

```astro
---
// src/pages/preview.astro: Layout is the site's own, here taking a title and noindex.
import { PREVIEW_HEADERS, loadPreview, renderMarkdown } from '@backgold/astro/server'
import { PreviewBar, Section } from '@backgold/astro/components'
import Layout from '../layouts/Layout.astro'

export const prerender = false
const result = await loadPreview(Astro.request)
if (!result.ok) return result.response
for (const [name, value] of Object.entries(PREVIEW_HEADERS)) Astro.response.headers.set(name, value)
const draft = result.preview
---
<Layout title={'page' in draft ? draft.page.title : draft.entry.title} noindex>
  <PreviewBar />
  {'page' in draft && draft.sections.map((section) => <Section section={section} />)}
  {'entry' in draft && <article><h1>{draft.entry.title}</h1><Fragment set:html={renderMarkdown(draft.entry.body.markdown)} /></article>}
</Layout>
```

Middleware runs first on every request (`@backgold/astro/middleware` exports
`onRequest` for a site composing its own with `sequence()`; it reads the build
id from the integration, so `backgold()` stays in the config): the setup check,
the `bg_vid` cookie, the signed-in visitor (the `bg_visitor` cookie), the
site's redirects (301/302/307/308, and 410 for a
rule with no destination; a rule whose destination is neither an http(s) URL
nor a path on the site is ignored), then the edge cache. `Astro.locals.backgold` holds
`{ client, siteId, site, legal, version, siteUrl, variant, visitorId, visitor,
visitorReads, analytics?, firstParty, setup }`; `analytics` is the `/site` answer's analytics block, when it has one.
`siteId` is the site the request renders: `BACKGOLD_SITE_ID`, the dispatched
request's `X-BackGold-Site`, or with a site key the `/site` answer's
`site.id`; null while the setup page shows.

## SEO and AI search

Everything here is generated from the site's content in BackGold and cached
like a page. Each route is one option to turn off.

| Route | What it serves | Off with |
| --- | --- | --- |
| `GET /sitemap.xml` | Every address `/sitemap` lists (pages, type indexes, entries) on `SITE_URL`, with `<lastmod>` from the last update. An address on another host is left out. | `sitemap: false` |
| `GET /robots.txt` | `User-agent: *` / `Allow: /` with `/preview` and `/api/` disallowed, then an `Allow: /` group for each name in `aiCrawlers`, then `Sitemap:` while the sitemap is on. | `robots: false` |
| `GET /llms.txt` | The [llms.txt](https://llmstxt.org) file: the site's name, its description, the primary menu as links, then a section per routable type with its 20 newest entries as `- [title](url): summary`. | `llms: false` |
| `GET /llms-full.txt` | The site's name and description, then every published page and entry as its own document: a `---` line, a header (`### <title>`, then `Type:`, `URL:` and, for an entry, `Published:`, `By:` and `Summary:` lines) ending at the first blank line, then the body: a page's section copy as text, an entry's markdown. See the format below. | `llms: false` |
| `GET /feed.xml` | An Atom feed of the 50 newest entries of the blog types (posts, podcasts and videos, which share the organization's blog base), merged by date; its HTML link is the list at the blog base. | `feeds: false` |

**AI crawlers are allowed by default.** `aiCrawlers` lists the user agents
named as allowed (default `GPTBot`, `ClaudeBot`, `PerplexityBot`,
`Google-Extended`); `aiCrawlers: []` names none, and they fall under the
`User-agent: *` group like every other crawler. There is no setting that
blocks a crawler. To block one, turn the route off with `robots: false` and
serve your own `src/pages/robots.txt.ts`:

```ts
import type { APIRoute } from 'astro'

export const GET: APIRoute = () =>
  new Response('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
```

`robotsTxt({ siteUrl, aiCrawlers, sitemap })` from `@backgold/astro/server`
builds the default text if you want to start from it.

**`llms-full.txt`, document by document.** There are no section headings;
pages come first, then each routable type's entries, newest first:

```
# Pine Valley for Liberty

> Lower taxes, open books, school choice.

---

### The levy, explained
Type: Post
URL: https://pinevalleyliberty.org/news/levy-explained
Published: 2026-09-29
By: Dana K.
Summary: Where the money goes.

## Where it goes

Every dollar…
```

A line that is exactly `---` only ever opens a document, and a header ends at
its first blank line. Authored text cannot forge either: titles and header
values are escaped (a leading list marker, `#`, `-`, a `Type:`-style label,
`<`, `>` and `&` all read literally); page copy is written as plain text the
same way; an entry body stays markdown with `<` as `&lt;`, any line of three
or more hyphens escaped, and a code fence it leaves open closed.

**It is capped**: at most 50 entries per type and 512 KiB in all. When either
cap is reached the file ends with one more block after a final `---` line:
`This file is truncated. Every address on the site is in <SITE_URL>/sitemap.xml.`
Each entry it writes is one read of the Content API (cached like every other
read).

**Per-type feeds.** Every routable type outside the blog types (a type of
your own, the newsletter) has its feed at
`/<url_base>/feed.xml`: `resolveRoute` answers that path with
`{ kind: 'feed', type }`, and the template's catch-all page answers it with
`atomFeed(client, siteUrl, type)`. `/<blog base>/feed.xml` resolves to
`{ kind: 'feed', type: 'blog' }`, the same merged feed as `/feed.xml` (its
self link). Feeds carry the entry's title, summary, dates, authors and
address, never its body.

### `<Seo>`

```astro
---
import { Seo } from '@backgold/astro/components'
import { jsonLdFor } from '@backgold/astro/server'
const { site, siteUrl } = Astro.locals.backgold
// `type` and `entry` from resolveRoute's { kind: 'entry', type, entry }
---
<head>
  <Seo
    title={entry.title}
    description={entry.summary ?? undefined}
    image={entry.hero?.url}
    canonicalPath={Astro.url.pathname}
    jsonLd={jsonLdFor({ site, siteUrl, kind: 'entry', type, entry })}
  />
</head>
```

Props: `title`, `description`, `image`, `canonicalPath` (required),
`noindex`, `jsonLd`. It writes `<title>`, the meta description, the
canonical link on `SITE_URL` (the query and fragment dropped), Open Graph
(`og:title`, `og:description`, `og:url`, `og:site_name`, `og:type`, and
`og:image` when there is an image), the Twitter card
(`summary_large_image` with an image, else `summary`), `robots: noindex`
when asked, the favicon from `/site`, the blog feed link while `feeds` is on,
and the JSON-LD. A missing title or description falls back to the site's SEO
title and description from BackGold. An image must be an absolute http(s)
URL or a path on the site; anything else is left out. `og:type` is `article`
when the JSON-LD describes an `Article` or `BlogPosting`.

`seoHead(props, locals.backgold, feeds)` returns the same values for a site
writing its own head tags.

### JSON-LD

`jsonLdFor({ site, siteUrl, kind, … })` takes what a path resolved to (spread
a `resolveRoute` result into it, so a list brings its `base` and `intro`) and
returns schema.org objects:

| Page | Objects |
| --- | --- |
| every page | `Organization` (name, logo, `sameAs` from the site's social links) and `WebSite` (name, description) |
| type index, term | `BreadcrumbList`. The blog types' list is at its `base` and named by its intro page's title, else by the base capitalised ("News" at `/news`, "Blog" at `/blog`); without a `base`, the blog types' list is taken to be at `/blog` |
| entry | `BreadcrumbList`, then `BlogPosting` for a post, `PodcastEpisode` for a podcast (the media file as `associatedMedia`), `VideoObject` for a video, `Article` for every other type: title, summary, hero image, published and updated dates, the "Written by" and "Interview by" bylines as `Person`, the organization as publisher |
| author | `BreadcrumbList` and `Person` (name, bio, avatar, link) |

Every property comes from a field of the Content API; a field that is empty
is left out, never filled with a default. `serializeJsonLd(objects)` writes
the JSON for a `<script type="application/ld+json">` with `<`, `>`, `&`,
U+2028 and U+2029 escaped, so no content can close the script element.

## Caching

Every `GET` that renders a 200 is stored in the Workers Cache API under

```
https://backgold.cache/<site id>/<build id>/<content version>/<variant>/<site origin>/<path>?<query>
```

`<site id>` is `Astro.locals.backgold.siteId`, on a template's shared Worker
the one the request's `X-BackGold-Site` names. `<site origin>` is `SITE_URL`,
or without it (and always on a template's shared Worker) the origin the
request arrived on: a page names that origin in its canonical, Open Graph and feed links, so
a render for one `Host` is never served to another.

A publish in BackGold sends the webhook and the version moves: the Worker
isolate that receives it renders fresh at once, and every other one within
about a minute (each keeps its version in memory until its 60-second
re-check). Older entries simply become unreachable: nothing is purged,
nothing is rebuilt. A deploy of
new code does the same: each `astro build` mints a random build id (twelve hex
characters, nothing about the machine; `dev` under `astro dev`), so pages the
previous deploy rendered, and the asset addresses in them, are never served
by the new one. Without a webhook every isolate re-checks the version with
BackGold at most every 60 seconds, so a publish shows within about a minute
everywhere. Two query parameters enter the key: `cursor`, a list's later page
(see [Lists and paging](#lists-and-paging)), only when its value is a
cursor the Content API would accept (base64url of a date and an id, at most
512 characters; the first `cursor` when there are several); and `q`, a
list's search term, only when it is 2–80 characters after trim, matching the
Content API's own check. Every other parameter, and a value that fails its
check, is dropped from the key, so `?utm_source=…`, `?cursor=junk` and
`?q=x` share the bare path's entry and cannot fill the cache with copies. A
cursor's or search's page is keyed by the content version like every other
page, so a publish retires it too.

A page that reads a query parameter the key drops says so with an
`X-Backgold-Reads-Query` header (`READS_QUERY_HEADER` from
`@backgold/astro/server`): the names, comma-separated, a trailing `*` standing
for every name with that prefix (`amount,place,utm_*`). Its stored copy is not
served to a request that carries one of those names with a value; that
request renders, and the page sets `Cache-Control: no-store` on that render so
it never takes the bare path's entry.

Never stored: `/preview` (your page), `/api/backgold/*`, `/_backgold/*`,
the setup page, any request that carries the `bg_visitor` cookie (it is
never answered from the cache either), anything but a 200, a render that sets a cookie, and one whose
`Cache-Control` says `no-store`, `no-cache` or `private`. The render's own
`Cache-Control` (what the page set for browsers) comes back on a hit; the edge copy lives up to a week. Responses carry
`X-Backgold-Cache: HIT` or `MISS`.

**Where it works.** Cloudflare documents the Cache API as working for
Workers on a custom domain, as a no-op in the dashboard editor and
playground previews, and as unavailable for Workers behind Cloudflare
Access; it is local to each data center. Its documentation makes no promise
for `*.workers.dev`, so treat a `workers.dev` address as uncached: every
request renders, and the client's reads still come from `BACKGOLD_CACHE`
instead of BackGold. `astro dev` skips the edge cache so edits show on reload.
Put the site on its custom domain for the edge cache.

**When BackGold does not answer.** Every Content API read is aborted after
10 seconds. A request whose read times out before its response starts (the
site's own read, a redirect check, a page's or a route's reads) answers `504`
with a short "try again in a moment" page, `Cache-Control: no-store` and
`Retry-After: 30`, naming nothing internal; it is never stored. A read that
times out after a page has started streaming ends that page early.

## Signed-in visitors

A visitor can sign in on a first-party site with their email, through
BackGold's giving portal, to open what the organization keeps for people it
knows (lessons and entries whose access is `signed_in`, `members` or a tag).
The portal runs the sign-in; the site's own host keeps the result, so a
custom domain works.

| Route | |
| --- | --- |
| `GET /_backgold/sign-in?return=<path>&title=<text>` | `302` to the portal's door for this site (`giving.backgold.com`, or `giving.backgold.dev` for an api on `backgold.dev` or a local host), carrying the site's id, the path to come back to and, when given, the page's title as plain text. |
| `GET /_backgold/visitor?code=<code>&return=<path>` | The portal's return leg. Redeems its one-minute code with the api (`exchangeVisitor`), keeps the token in the `bg_visitor` cookie (`HttpOnly`, `Secure` but on plain http localhost, `SameSite=Lax`, `Path=/`, thirty days), and `302`s to the path with `#signed-in`. A used or expired code: a plain `400` page, "That sign-in link has expired. Sign in again.", linking back to the door. |
| `GET /_backgold/sign-out?return=<path>` | Ends the token at the api (best effort), clears the cookie, `302` to the path. |
| `POST /_backgold/progress` | JSON `{ course, lesson, completed?, position_seconds? }` from the lesson page: `Sec-Fetch-Site: same-origin`, or without it an `Origin` equal to the site's, else `403 CROSS_ORIGIN`. Forwarded with the visitor's token; the api's JSON comes back. `401 VISITOR_REQUIRED` without the cookie, `400 BAD_PROGRESS` for a body it cannot forward. The page without its script posts the same fields as a form (`application/x-www-form-urlencoded`, `completed` as `true` or `false`, `position_seconds` as digits) with a `return` path, under the same origin check: saved, it answers `303` to that path (`/` for one off the site); without the cookie, `303` to `/_backgold/sign-in?return=<that path>`. |

`return` is a path on the site (one leading `/`, no control character,
space, backslash or `..` segment); anything else returns to `/`.
`signInHref(path)` and `signOutHref(path)` from `@backgold/astro/server`
build the two links.

On every other request that carries `bg_visitor` the middleware reads who it
is, once, with `GET /visitor` (the token goes as the `X-BackGold-Visitor`
header; the cookie itself never leaves the Worker), and puts the answer on
`locals.backgold.visitor` (`{ first_name, email, member }`, else null). A
token the api no longer takes clears the cookie; a renewed one rewrites it.
`locals.backgold.visitorReads` is what to pass to a read made for that
person, so their locks open and their progress shows:

```ts
const { client, visitorReads } = Astro.locals.backgold
const course = await client.course(slug, visitorReads) // undefined when signed out: the cached, anonymous read
const resolved = await resolveRoute(client, Astro.url, visitorReads)
```

Such a request is never answered from or stored in the edge cache, and every
response to it carries `Cache-Control: private, no-store`. Nothing about a
visitor is ever written into a page anyone else is served.

## A/B testing hooks

Nothing here runs an experiment; these are the three things an experiment
needs, in place from the start:

1. **A variant slot in the cache key.** `locals.backgold.variant` is empty
   today; a variant later is one more value in the key, not a new cache.
2. **A first-party visitor id.** The `bg_vid` cookie: a random id, one year,
   `SameSite=Lax`, `Secure`, readable by script so the analytics island can
   use it as the visitor's id. No personal data. Set after the cache step and
   never stored with a page. `locals.backgold.visitorId` has it during a
   render.
3. **A `variant` prop on `<Section>`**, so a feature flag can swap one
   section's component without touching the page; it takes precedence over
   the section's stored layout.

## Routing a page

`resolveRoute(client, Astro.url)` says what a path is, from `/types`, so a
type an operator adds in BackGold gets its pages with no code change. It
takes the request's URL (or a pathname, with or without its query): the
`?cursor=` in it asks a list for a later page. A catch-all
`src/pages/[...path].astro` switches on `kind`:

| Path | `kind` |
| --- | --- |
| `/`, or a published page's `url` | `page`: the page response, its `areas` inside it |
| `/<blog base>` (the blog types, merged), `/<url_base>` | `index`: up to 50 entries, `cursor`, `next_cursor`, the list's `areas`, its `base` and its `intro` |
| `/<blog base>/<slug>`, `/<url_base>/<slug>` | `entry`: the entry and its `areas` |
| `/authors/<slug>` | `author`; `entries` is empty (the Content API lists entries by type and term only); no `areas` |
| `/<blog base>/<taxonomy>/<slug>`, `/<url_base>/<taxonomy>/<slug>` | `term`: its entries, `cursor`, `next_cursor`, the list's `areas` and its `base` |
| `/<courses base>/<course>/<lesson>` (the course type's `url_base`) | `lesson`: `courseSlug`, `lessonSlug`, the api's `lesson` answer (the teaser when it is locked for the reader) and its `areas`; a slug pair the course does not have falls through to a term |
| `/<blog base>/feed.xml`, `/<url_base>/feed.xml` | `feed` |
| anything else, or a malformed path | `not_found` |

A type's address is the `url_base` `/types` reports for it. The three blog
types, post, podcast and video, list together: `/types` marks them
`index: 'blog'` and reports the organization's **blog base** as each one's
`url_base`, `news` for an organization made since the address became its own
(`blog` for one made before, until it changes the address on its Posts type).
`resolveRoute` merges them at that base, with `type: 'blog'` (the merged
list, not an address) and `base` (the address, without slashes); their
entries live at `/<blog base>/<slug>`. Every other routable type has its own
list, entries, terms and feed at the base it reports, a custom type and the
built-in newsletter (`/newsletters`) alike: a type that reports a base of its
own is listed there, never with the blog types. `isBlogType(type)` and
`blogBaseOf(types)` from `@backgold/astro/server` answer the same rule for
a site's own code (a section that lists the newest posts, a link to the
list).

**The list's intro.** A published page whose address is the blog base (the
`news` page a template starts with) is not a page of its own there: the
blog base resolves to the merged list, with that page as `intro`, for the
site to draw its sections above the list. `intro` is null on every other
list, and when no page sits at the base. A term's list carries no intro.

**An api older than this package** reports no `index`. Then the routable
built-ins that report `blog` (or no base) are the blog types, merged at
`/blog`, as before 0.4, so a site on 0.4 keeps working against it.

The blog base's `areas` are the first blog type's: the rules that place a
section on a list are per site, so every type's list answers the same areas.
Pass them to `<Area>` as you would a page's. Redirects are the middleware's,
before this runs: an organization that moves its blog base gets 301s from
the old address.

### Lists and paging

An index or a term shows one page of up to 50 entries, newest first.
`cursor` is the cursor the page was read at (null on the first page) and
`next_cursor` the next page's (null on the last). `?cursor=<next_cursor>` on
the same path reads the next page; a cursor the Content API would not accept
(malformed, too long, or refused by the api) reads the first page, with
`cursor` null.

A cursor names one type's list, so the blog base with more than one blog type
merges their first pages and reads no cursor: its `cursor` and `next_cursor`
are both null. A site that wants a paged list links to a type's own address.

`pagerOf(resolved, Astro.url.pathname)` from `@backgold/astro/server` gives
the two links a list draws under it, as `{ newest, older }`: `older` is the
path at `?cursor=<next_cursor>` when there is a next page, and `newest` is
the bare path when the page was reached by a cursor; each is null otherwise,
and both are null for anything that is not an index or a term. There is no
"newer" link: the Content API answers a page with the next page's cursor
only, never the previous one.

```astro
---
import { pagerOf, resolveRoute } from '@backgold/astro/server'
const resolved = await resolveRoute(Astro.locals.backgold.client, Astro.url)
const pager = pagerOf(resolved, Astro.url.pathname)
---
{(pager.newest || pager.older) && (
  <nav class="pager" aria-label="Pages">
    {pager.newest && <a href={pager.newest}>Newest</a>}
    {pager.older && <a href={pager.older}>Older</a>}
  </nav>
)}
```

Each page is its own edge-cache entry (see [Caching](#caching)).

## Rendering

- `<Section section={s} components={sections} variant={flag} />` looks up,
  in order: `components['<type>:<variant>']`, where the variant is the
  `variant` prop when given, else the section's stored layout
  (`s.variant`, when it has one); then `components[s.type]`; then
  `<DefaultSection>`. The chosen variant is passed to your component as its
  `variant` prop. `<DefaultSection>` is one shape-driven renderer for any
  block type, so a type BackGold adds later still renders. It emits a
  `<section class="bg-section bg-band-<band> bg-bleed-<bleed>">` with
  `data-type`, `data-band` and `data-bleed`, the heading (`heading`, else
  `title`, else `headline`) as an `<h2>` (never an `<h1>`: the page has
  one), copy, media, links, the data rows and the embed. A data row's date
  is the calendar day in the row's `timezone` (an event's own zone) when the
  value is an instant (`Z` or an offset) and `Intl` knows the zone; otherwise
  it is the day written in the value. Restyle it through
  the `--bg-*` custom properties or the classes.
- On the preview page only (`/preview` and below), `<Section>` writes an
  empty marker before each section, `<span id="bg-section-<section id>"
  data-bg-section hidden></span>` (every character of the id outside
  `[A-Za-z0-9_-]` written as `-`), and `<Seo>` writes `<meta
  name="backgold-preview" content="sections">`. Published pages carry
  neither.
- `<Area name="sidebar" areas={page.areas} components={sections} class="rail" />`
  draws one area of a page, entry or list (`areas` from the response, or
  from `client.areas({ holds })` on a route with no BackGold page). An empty
  area renders nothing. Otherwise each item whose `until` has not passed is
  an `<aside class="bg-area bg-area-<name> <class>" data-bg-area
  data-bg-area-item aria-label="<label>">` holding its sections through
  `<Section>`. An item with a `from` or an `until` carries them as
  `data-from` and `data-until` and, when either is a date (a malformed value
  counts as unset), starts `hidden`; one inline script per
  page shows it while its window holds and re-checks at the next moment, so
  with scripts off a dated item never shows. `visibleNow` (re-exported from
  `@backgold/astro/server`) is the same rule for code of your own.
- `<Menu items={menu.items} label="Primary" page={menuPage} />` and
  `<MenuButton items={menu.items} page={menuPage} class="…" />`. `page` is
  the page being drawn as `{ id, takes_donations }` (from
  `PageResponse.page`), or `null` on a route with no BackGold page (an
  index, an entry, an author, a term). With it, each link's Shows on rule
  applies: `every_page` shows; `only_pages` shows on the pages it lists;
  `except_pages` shows everywhere but the pages it lists (non-page routes
  included); `donation_pages` shows where `takes_donations` is true. A group
  shows the children that show, and goes when none does. The header button
  leaves the menu and `<MenuButton>` draws it, as `<a class="bg-menu-button"
  data-bg-button>` (plus `data-bg-donate` on a Donate link, and
  `aria-current="page"` on the page the button links to), on the pages
  its rule names; when it does not show, or has no address, nothing takes
  its place. Without `page`, `<Menu>` draws every link (the header button
  among them) and `<MenuButton>` draws the button everywhere. `menuOf` and
  `headerButtonOf` in `@backgold/astro/server` return the same as data.
- `<Disclaimer legal={legal} />`
  (verbatim, as text, on every page; when the organization has none set in
  BackGold it renders nothing, never a made-up line, and logs a warning
  naming the site), `<PreviewBar />` ("Draft · not published").
- `<Embed embed={s.embed} title="Donate" />` places a money or consent module
  as BackGold serves it: the frame (lazy, `allow="payment"`, no `sandbox`),
  sized from its `givegold:resize` message by one script per page that
  trusts only the page's own frames at their own origin; or, for a
  script-only module, the `mount` container and its script once. An address
  that is not https renders nothing, except plain http on `localhost` or
  `127.0.0.1`, for an api running on your own machine.
- `<Analytics />` takes no props. It renders nothing unless the site's
  `/site` answer carries BackGold's analytics block; with it, posthog-js
  loads once the page is idle, without session replay, named by the
  `bg_vid` cookie. On `/preview` it renders nothing either way: the address
  carries the signed preview token and the page is a draft.
- `renderMarkdown(entry.body.markdown)` and `sanitizeRichText(html)` give
  HTML for `set:html`: raw HTML in markdown is escaped, then both pass one
  allowlist (`h2 h3 p strong em a ul ol li blockquote img br`; `h1` becomes
  `h2`, `h4`–`h6` become `h3`; links to http(s), `mailto:`, `tel:` or a
  site path, with `rel="noopener"` on absolute ones; images from http(s) or
  a site path). Everything else is dropped and its text kept; scripts,
  styles, frames, forms' fields, SVG and MathML go with their contents.

### Section markers

The BackGold editor shows your preview page in a frame and scrolls it to the
section being edited, by the `#bg-section-<id>` marker; the
`backgold-preview` meta tells it the page carries them. If you draw sections
with a loop of your own instead of `<Section>`, write the same empty
`<span id="bg-section-<id>" data-bg-section hidden></span>` before each
section on the preview page, and keep `<Seo>` (or write the meta yourself),
so the editor can still scroll to a section. Without them the preview works,
it just opens at the top.

## Entry points

| Import | |
| --- | --- |
| `@backgold/astro` | `backgold(options)` and the types. |
| `@backgold/astro/server` | `getBackgold(context)`, `menuOf`, `headerButtonOf` and their `MenuPage` and `MenuNode` types, `pagerOf` and its `Pager` type, `isBlogType`, `blogBaseOf`, `areaEntriesOf(areas, name)` (the items `<Area>` would draw, each with `needsWindow`, so a layout can tell whether an area has anything to draw) and its `AreaEntry` type, `visibleNow` (from `@backgold/content`), the route handlers (`handleWebhook`, `handleRevalidate`, `handlePreview`), `loadPreview` and `PREVIEW_HEADERS`, `resolveRoute`, `renderMarkdown`, `sanitizeRichText`, the link rule (`safeHref(value, { anchors? })` for a link: http(s), `mailto:`, `tel:` or a site path, `#anchor` only with `anchors: true`; `safeSrc(value)` for an image or file: http(s) or a site path; each null for anything else; `relFor(href)`, `noopener` for an absolute link), `sitemapXml`, `robotsTxt`, `llmsTxt`, `llmsFullTxt`, `atomFeed`, `jsonLdFor`, `seoHead`, `serializeJsonLd`, `SETUP_PATH`. |
| `@backgold/astro/components` | `Section`, `DefaultSection`, `Embed`, `Menu`, `MenuButton`, `Area`, `Disclaimer`, `Seo`, `Analytics`, `PreviewBar` (Astro source). |
| `@backgold/astro/middleware` | `onRequest`. |

## License

MIT.
