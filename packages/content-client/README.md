# @backgold/content

A typed client for the BackGold headless Content API (`/api/content/v1`). It
reads a site's pages, menus, sections, entries, types, terms, authors,
redirects and sitemap with a site key, caches every read under the site's
content version, and helps with the two other things a partner site needs:
verifying BackGold's webhooks and serving "Preview on your site".

It has no dependencies and runs anywhere `fetch` and Web Crypto exist: Node
20+, Cloudflare Workers, Deno, Bun and browsers. Responses are the API's own
JSON, unchanged and typed.

The full API reference is at
<https://api.backgold.com/api/content/v1/docs>. The developer guide,
[docs/developers/headless-content-api.md](../../docs/developers/headless-content-api.md),
covers keys, rendering, caching, preview and webhooks in depth.

## Install

```bash
npm install @backgold/content
```

## Create a client

```ts
import { createClient } from '@backgold/content'

const bg = createClient({ key: process.env.BACKGOLD_SITE_KEY! })
```

The key comes from the site's **Developer** page in BackGold.

| Key | Starts with | Where it may live | What it reads |
| --- | --- | --- | --- |
| Publishable | `bg_site_pk_` | Anywhere, a browser included | Published content |
| Secret | `bg_site_sk_` | Your server only | Published content, drafts and previews |

`createClient` throws a `TypeError` for anything that is not a site key as
BackGold mints it (the prefix, then letters and digits; the message never
repeats the key), and `SecretKeyInBrowserError` for a secret key in a browser
page or a browser worker. Cloudflare Workers are servers and may hold one.

Options:

| Option | Default | |
| --- | --- | --- |
| `key` | (required) | The site key. |
| `apiOrigin` | `https://api.backgold.com` | Where the API lives. The key is sent nowhere else. |
| `cache` | `memoryCache()` | Where reads and the content version are kept. See [Caching](#caching). |
| `maxVersionAgeSeconds` | `60` | How long a known content version is trusted before `/site` is checked again. `0` checks on every read. |
| `cacheTtlSeconds` | `3600` | How long a stored read may live. A value under 1 is raised to 1; each store keeps its own floor (KV's is 60). |
| `fetch` | `globalThis.fetch` | The fetch to use. |

## Reading content

Each method is one endpoint. A 404 for the thing you named (a page, entry,
menu, … that does not exist or is not published) is `null`. A 404 for the site
itself (removed, or its headless access switched off) throws, as does any
other error: a `BackgoldApiError` with the HTTP `status` and the API's `code`
(`INVALID_KEY`, `BAD_CURSOR`, `SECRET_KEY_REQUIRED`, `NOT_FOUND`, …;
`HTTP_<status>` when the answer had no code). A path argument that is `.` or
`..` throws a `TypeError` before any request.

**`site()`**: the site's name, brand, social links, SEO defaults, the legal
line every page must show, and the content version.

```ts
const { site, legal, version } = await bg.site()
```

**`menu(key)`**: `primary`, `footer` or `utility`, as a tree. `null` for a key
the site does not have.

```ts
const primary = await bg.menu('primary')
for (const item of primary?.items ?? []) console.log(item.label, item.url)
```

**`pages()`**: the published pages.

```ts
const { pages } = await bg.pages()
```

**`page(slug, { preview? })`**: one page as ordered sections. `home` is the
home page.

```ts
const home = await bg.page('home')
if (!home) return notFound()
```

**`section(key)`**: `header`, `footer`, or a synced section by its key.

```ts
const header = await bg.section('header')
```

**`types()`**: the content types and their fields.

```ts
const { types } = await bg.types()
```

**`entries(type, { term?, limit?, cursor?, preview? })`**: one page of a
type's entries, newest first, with `next_cursor`. `null` for an unknown type.

```ts
const first = await bg.entries('post', { limit: 10, term: 'taxes' })
const second = first?.next_cursor ? await bg.entries('post', { limit: 10, cursor: first.next_cursor }) : null
```

**`allEntries(type, { term?, limit?, preview? })`**: every entry of a type,
walking the cursor for you. It yields nothing for an unknown type.

```ts
for await (const entry of bg.allEntries('post')) console.log(entry.title, entry.url)
```

**`entry(type, slug, { preview? })`**: one entry with its body and field
values.

```ts
const post = await bg.entry('post', 'levy-explained')
const markdown = post?.entry.body.markdown
```

**`terms(taxonomy)`**: a taxonomy's terms.

```ts
const tags = await bg.terms('tag')
```

**`authors()`** and **`author(slug)`**: the public faces of the site's
bylines.

```ts
const { authors } = await bg.authors()
const dana = await bg.author('dana-k')
```

**`redirects()`**: the site's redirect rules. Your server must honour them.

```ts
const { redirects } = await bg.redirects()
const rule = redirects.find((r) => r.source === pathname)
```

**`sitemap()`**: every public address of the site.

```ts
const { urls } = await bg.sitemap()
```

**`preview(token)`**: the draft a preview link names. Secret key only. See
[Preview](#preview).

```ts
const draft = await bg.preview(token)
```

**`raw(path, query?, { preview? })`**: any `GET` under `/api/content/v1` this
client does not name yet, cached and versioned like the rest. `null` on a 404
for the thing named. A `preview=1` query or a path under `/preview/` makes it a
preview read: secret key only, never cached.

```ts
const page = await bg.raw<{ page: { title: string } }>('/pages/about')
```

## Caching

Every published read is stored under the site's **content version**, a number
BackGold raises whenever anything the API serves changes. The store key is

```
<scope>:v<version>:<path>?<query sorted by name>
```

where `<scope>` is the first 16 hex characters of the SHA-256 of your key (the
key itself never reaches a store). This is the same rule the API's own edge
cache uses. A new version is a new key, so a publish never needs a purge: the
next read misses, fetches and stores the new answer. Old entries expire on
their own.

How the client knows the version:

- **Every answer** carries `X-Content-Version`, and the client moves to it.
- **A version older than `maxVersionAgeSeconds`** (60 by default) is checked
  with one `GET /site` and `If-None-Match`. An unchanged site answers `304`,
  which costs nothing. Concurrent reads share that one check. So without a
  webhook, a site is at most a minute behind.
- **`setVersion(n)`** trusts `n` straight away. A webhook receiver calls it.
  It never goes backwards: it re-reads the store's record every time and
  ignores a version lower than the larger of memory and the store, because
  webhooks can arrive out of order, and writes only a version newer than the
  store's. Two processes writing at the same moment can still race (KV has no
  compare-and-swap). Call `bust()` first to go back.
- The version is kept in memory and in the store, so a store shared between
  processes (KV, the filesystem) shares it too. The record is rewritten when
  the version changes or its last confirmation is more than five seconds old,
  not on every fetch (KV takes one write per key per second).

`bg.version()` returns the version the client trusts (`null` before the first
read). `bg.bust()` forgets the version, in memory and in the store; the next
read re-learns it (another process sharing the store may already have written
a newer one).

While the version is trusted, a read the store already holds makes no request
at all.

### Stores

| Store | Import | Where it keeps reads |
| --- | --- | --- |
| `memoryCache({ max? })` | `@backgold/content` | A `Map` in the process, at most `max` (500) values. The default. |
| `cacheApiStore({ cache?, prefix? })` | `@backgold/content` | The Workers Cache API (`caches.default` unless you pass one). Per data center; may evict early. |
| `kvStore(namespace, { prefix? })` | `@backgold/content` | A Workers KV namespace. KV needs a ttl of at least 60 seconds, so shorter ones are raised to 60. |
| `fsCache(dir)` | `@backgold/content/fs` | One file per key under `dir`, for a Node build step. |

```ts
import { createClient, kvStore } from '@backgold/content'

const bg = createClient({ key: env.BACKGOLD_SITE_KEY, cache: kvStore(env.BACKGOLD_CACHE) })
```

```ts
import { createClient } from '@backgold/content'
import { fsCache } from '@backgold/content/fs'

const bg = createClient({ key: process.env.BACKGOLD_SITE_KEY!, cache: fsCache('.backgold-cache') })
```

A store is any object with `get`, `set`, `delete` and `clear` (the
`CacheStore` type). `clear()` on the Cache API and KV stores removes only the
keys that store wrote in the current process, because neither can list its
entries cheaply; anything older expires under its ttl. A store that fails
makes a read go to the network instead; `setVersion` and `bust` surface the
store's error.

## Webhooks

BackGold can POST five content events to your endpoint: `site.published`,
`content.published`, `content.unpublished`, `menu.updated` and
`redirects.updated`. Each one carries the site's new `content_version`.
Calling `setVersion` with it makes the next read fetch fresh content. It
ignores a version older than the one it knows, so call it for every event.

```ts
import { createClient, kvStore, parseContentEvent, verifyBackgoldWebhook } from '@backgold/content'

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text() // the raw body: re-serialized JSON breaks the signature
  const valid = await verifyBackgoldWebhook({
    rawBody,
    signature: request.headers.get('X-BackGold-Signature'),
    secret: env.BACKGOLD_WEBHOOK_SECRET, // whsec_…
  })
  if (!valid) return new Response('Bad signature', { status: 401 })

  const event = parseContentEvent(rawBody)
  if (event && event.data.site_domain_id === env.BACKGOLD_SITE_ID) {
    const bg = createClient({ key: env.BACKGOLD_SITE_KEY, cache: kvStore(env.BACKGOLD_CACHE) })
    await bg.setVersion(event.data.content_version)
  }
  return new Response(null, { status: 204 })
}
```

- `verifyBackgoldWebhook` checks `X-BackGold-Signature` (`t=<unix
  seconds>,v1=<hex>`): HMAC-SHA256 over `<t>.<rawBody>` with your signing
  secret, compared in constant time. It rejects a timestamp more than
  `toleranceSeconds` (300) from now in either direction, old or in the
  future, and answers `false`, never throws, for anything malformed.
- `parseContentEvent` returns the event for the five content events (with a
  whole-number `content_version` of 0 or more) and `null` for anything else. It copies only `id`, `type`, `created_at` and
  `data.site_domain_id`, `content_version`, `page_id`, `content_item_id`,
  `menu_key`.
- One endpoint serves every site of an organization, so compare
  `data.site_domain_id` with your site's `site.id`.
- Each event is delivered once and is not retried. The `/site` check is the
  backstop that catches a missed event.

## Preview

"Preview on your site" sends an editor to your preview route with
`?bg_preview=<token>&path=<the page's path>`, and the Developer page's
**Send a test preview** calls it the same way for the home page. Read it with
a secret key, on the server, and never cache the answer.

```ts
import { createClient, previewFromRequest } from '@backgold/content'

const bg = createClient({ key: process.env.BACKGOLD_SECRET_KEY! }) // bg_site_sk_…, server only

export async function previewRoute(request: Request): Promise<Response> {
  const preview = previewFromRequest(request.url)
  if (!preview) return new Response('Missing bg_preview', { status: 400 })
  const draft = await bg.preview(preview.token) // throws BAD_PREVIEW_TOKEN when expired
  if (!draft) return new Response('Not found', { status: 404 })
  return new Response(render(draft, preview.path), {
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'private, no-store' },
  })
}
```

`previewFromRequest` returns `null` when there is no token. Its `path` is `/`
when the link has none or when it is not a safe path on your own site (holding
a control character or space, not starting with `/`, starting with `//`,
holding a `\` or a `..` segment).

`page(slug, { preview: true })`, `entry(type, slug, { preview: true })` and
`entries(type, { preview: true })` read drafts the same way, as does `raw`
with a `preview=1` query or a `/preview/` path. Every preview read needs a
secret key: with a publishable key the client throws `BackgoldApiError` 403
`SECRET_KEY_REQUIRED` without making a request.

## Typed fields

The seven built-in types (`post`, `podcast`, `video`, `plank`, `team_member`,
`open_role`, `newsletter`) are typed out of the box. Any other type's `fields` are
`Record<string, unknown>` until the client knows the type. The
`backgold-content types` command reads `/types` and writes a file that
declares each type's fields:

```bash
BACKGOLD_SITE_KEY=bg_site_pk_… npx backgold-content types --out src/backgold-types.d.ts
```

The key is read from `BACKGOLD_SITE_KEY` (`--key` also works, but a command
line is visible to other processes on the machine). `--generated-at
<YYYY-MM-DD>` fixes the date in the header: the same types and the same date
give the same bytes, which keeps a checked-in file stable in CI.

With that file in your project, `bg.entry('endorsement', slug)` returns
`fields` typed as `{ quote: string; tier: 'Gold' | 'Silver' | null }`. Run it
again after the organization changes its content types. A field without
`| null` is one the type requires, which holds for published entries; a
preview read of a draft may answer `null` for any field. You can also write
the declaration by hand:

```ts
declare module '@backgold/content' {
  interface BackgoldTypeMap {
    endorsement: { quote: string; tier: 'Gold' | 'Silver' | null }
  }
}
```

## What the client never does

- It never writes to BackGold. Every request is a `GET`.
- It never sends your key anywhere but `apiOrigin`, and it does not follow
  redirects.
- It never stores a preview or draft read, and never reads one from the store.
- It never sends a header other than `Authorization`, `Accept` and
  `If-None-Match`.
