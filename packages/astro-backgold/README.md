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
| `BACKGOLD_SECRET_KEY` | secret | for preview | A secret key, `bg_site_sk_…`. Only `loadPreview` (your `/preview` page) reads it; it never reaches a page or a cache. |
| `BACKGOLD_WEBHOOK_SECRET` | secret | for webhooks | The webhook endpoint's signing secret, `whsec_…`. Also the bearer token for `/api/backgold/revalidate`. |
| `BACKGOLD_REBUILD_HOOK_URL` | secret | no | POSTed after each verified content event, for a site that rebuilds statically. Failures are logged, never surfaced. |

Until `BACKGOLD_SITE_KEY` is set to a publishable key (or while
`BACKGOLD_API_ORIGIN` is not an http(s) URL), every HTML path renders the
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

```bash
curl -X POST https://<your site>/api/backgold/revalidate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BACKGOLD_WEBHOOK_SECRET"
```

Send the JSON content type: Astro's origin check answers `403` to a POST from
outside the site that has no content type or a form one.

`/preview` is a page of the site's own, `src/pages/preview.astro`, so a draft
renders in the site's layout. It is BackGold's "Preview on your site" link
(`?bg_preview=<token>&path=<path>`). `loadPreview` reads the draft with the
secret key. Every answer on the path, the draft or any error, carries
`Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow` (the
middleware adds them to whatever the page answers) and is never cached. No
secret key: `503 PREVIEW_NOT_CONFIGURED`. A missing, malformed (`.`, `..`),
bad or expired token: `400 BAD_PREVIEW_TOKEN`. BackGold not answering in 10
seconds: `504 PREVIEW_UNAVAILABLE`; any other failure reading or rendering
the draft: `502 PREVIEW_UNAVAILABLE`. None of them names anything internal.

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
the `bg_vid` cookie, the site's redirects (301/302/307/308, and 410 for a
rule with no destination; a rule whose destination is neither an http(s) URL
nor a path on the site is ignored), then the edge cache. `Astro.locals.backgold` holds
`{ client, site, legal, version, siteUrl, variant, visitorId, analytics?,
setup }`; `analytics` is the `/site` answer's analytics block, when it has one.

## SEO and AI search

Everything here is generated from the site's content in BackGold and cached
like a page. Each route is one option to turn off.

| Route | What it serves | Off with |
| --- | --- | --- |
| `GET /sitemap.xml` | Every address `/sitemap` lists (pages, type indexes, entries) on `SITE_URL`, with `<lastmod>` from the last update. An address on another host is left out. | `sitemap: false` |
| `GET /robots.txt` | `User-agent: *` / `Allow: /` with `/preview` and `/api/` disallowed, then an `Allow: /` group for each name in `aiCrawlers`, then `Sitemap:` while the sitemap is on. | `robots: false` |
| `GET /llms.txt` | The [llms.txt](https://llmstxt.org) file: the site's name, its description, the primary menu as links, then a section per routable type with its 20 newest entries as `- [title](url): summary`. | `llms: false` |
| `GET /llms-full.txt` | The site's name and description, then every published page and entry as its own document: a `---` line, a header (`### <title>`, then `Type:`, `URL:` and, for an entry, `Published:`, `By:` and `Summary:` lines) ending at the first blank line, then the body: a page's section copy as text, an entry's markdown. See the format below. | `llms: false` |
| `GET /feed.xml` | An Atom feed of the 50 newest entries of the blog types (posts, podcasts and videos, which share `/blog`), merged by date. | `feeds: false` |

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
URL: https://pinevalleyliberty.org/blog/levy-explained
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

**Per-type feeds.** A routable type of your own has its feed at
`/<url_base>/feed.xml`: `resolveRoute` answers that path with
`{ kind: 'feed', type }`, and the template's catch-all page answers it with
`atomFeed(client, siteUrl, type)`. Feeds carry the entry's title, summary,
dates, authors and address, never its body.

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
a `resolveRoute` result into it) and returns schema.org objects:

| Page | Objects |
| --- | --- |
| every page | `Organization` (name, logo, `sameAs` from the site's social links) and `WebSite` (name, description) |
| type index, term | `BreadcrumbList` (the blog types' index is named "Blog") |
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

`<site origin>` is `SITE_URL`, or without it the origin the request arrived
on: a page names that origin in its canonical, Open Graph and feed links, so
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
everywhere. Query strings are dropped from the key (no query name is allowed in
it today), so `?utm_source=…` and every other parameter share the one entry
and cannot fill the cache with copies.

Never stored: `/preview` (your page), `/api/backgold/*`, the setup page,
anything but a 200, a render that sets a cookie, and one whose
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
   section's component without touching the page.

## Routing a page

`resolveRoute(client, pathname)` says what a path is, from `/types`, so a
type an operator adds in BackGold gets its pages with no code change. A
catch-all `src/pages/[...path].astro` switches on `kind`:

| Path | `kind` |
| --- | --- |
| `/`, or a published page's `url` | `page` |
| `/blog` (every built-in blog type, merged), `/<url_base>` | `index`: the first 50 entries and `next_cursor` |
| `/blog/<slug>`, `/<url_base>/<slug>` | `entry` |
| `/authors/<slug>` | `author`; `entries` is empty (the Content API lists entries by type and term only) |
| `/blog/<taxonomy>/<slug>`, `/<url_base>/<taxonomy>/<slug>` | `term` |
| `/blog/feed.xml`, `/<url_base>/feed.xml` | `feed` |
| anything else, or a malformed path | `not_found` |

An index shows its first page: the edge cache drops query strings, so there
is no `?cursor=` page, and `/blog`'s `next_cursor` is null when more than one
built-in type is routable. Redirects are the middleware's, before this runs.

## Rendering

- `<Section section={s} components={sections} variant={flag} />` renders
  `components[s.type]` (or `components['<type>:<variant>']` first, when a
  `variant` is given), else `<DefaultSection>`: one shape-driven renderer for
  any block type, so a type BackGold adds later still renders. It emits a
  `<section class="bg-section bg-band-<band> bg-bleed-<bleed>">` with
  `data-type`, `data-band` and `data-bleed`, the heading as an `<h2>` (never
  an `<h1>`: the page has one), copy, media, links, the data rows and the
  embed. Restyle it through the `--bg-*` custom properties or the classes.
- `<Embed embed={s.embed} title="Donate" />` places a money or consent module
  as BackGold serves it: the frame (lazy, `allow="payment"`, no `sandbox`),
  sized from its `givegold:resize` message by one script per page that
  trusts only the page's own frames at their own origin; or, for a
  script-only module, the `mount` container and its script once. An address
  that is not https renders nothing, except plain http on `localhost` or
  `127.0.0.1`, for an api running on your own machine.
- `<Menu items={menu.items} label="Primary" />`, `<Disclaimer legal={legal} />`
  (verbatim, as text, on every page; when the organization has none set in
  BackGold it renders nothing, never a made-up line, and logs a warning
  naming the site), `<PreviewBar />`.
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

## Entry points

| Import | |
| --- | --- |
| `@backgold/astro` | `backgold(options)` and the types. |
| `@backgold/astro/server` | `getBackgold(context)`, the route handlers (`handleWebhook`, `handleRevalidate`, `handlePreview`), `loadPreview` and `PREVIEW_HEADERS`, `resolveRoute`, `renderMarkdown`, `sanitizeRichText`, the link rule (`safeHref(value, { anchors? })` for a link: http(s), `mailto:`, `tel:` or a site path, `#anchor` only with `anchors: true`; `safeSrc(value)` for an image or file: http(s) or a site path; each null for anything else; `relFor(href)`, `noopener` for an absolute link), `sitemapXml`, `robotsTxt`, `llmsTxt`, `llmsFullTxt`, `atomFeed`, `jsonLdFor`, `seoHead`, `serializeJsonLd`, `SETUP_PATH`. |
| `@backgold/astro/components` | `Section`, `DefaultSection`, `Embed`, `Menu`, `Disclaimer`, `Seo`, `Analytics`, `PreviewBar` (Astro source). |
| `@backgold/astro/middleware` | `onRequest`. |

## License

MIT.
