# What BackGold hosting changes for the code

BackGold runs a custom site as a Worker inside its own Cloudflare account.
A visitor's request for the site's domain reaches BackGold first; BackGold
answers a few addresses itself and hands the rest to the site's Worker. That
arrangement is why the rules below exist. Port server code with them in
hand, not after the first deploy.

## Contents

- Addresses BackGold keeps
- Cookies and sign-in
- What the Worker has, and has not
- Porting server routes
- Things BackGold and the kit now do for you
- Limits
- Settings and secrets
- Previews and the domain
- How fresh the content is

## Addresses BackGold keeps

On every domain it hosts, BackGold answers these itself. A page or route of
the site's at one of them is never reached:

| Address | Everything under it too |
| --- | --- |
| `/api` | yes |
| `/ingest`, `/webhooks`, `/health`, `/.well-known`, `/lp-runtime`, `/volunteer`, `/complete-info` | yes |
| `/privacy`, `/sms-terms` | no, these two pages only |

What this means in a conversion:

- Every `/api/*` route the old site had must move or go. Name a moved one
  for what it is: `/weather.json`, `/search.json`.
- The site's own privacy page is replaced by BackGold's. Link to `/privacy`.
- The kit's own `/api/backgold/webhook` and `/api/backgold/revalidate` are
  unreachable too. They are not needed on BackGold hosting.

## Cookies and sign-in

The site's server code gets no `Cookie` or `Authorization` header, and any
`Set-Cookie` it answers with is dropped. So:

- Script in the browser can keep a visitor's small preferences, in
  `localStorage` or in a cookie it writes and reads itself (the starter's
  banner does). The server never sees either, so nothing a page draws on the
  server can depend on them.
- A sign-in, a cart or a session cannot work on a custom site, the kit's
  own visitor sign-in included. BackGold's store keeps its cart inside its
  frame. Delete the starter's `src/pages/auth/` routes and
  `src/lib/visitor.ts`, and the `door` they feed in the entry page.
- Anything that read a cookie on the server must be redone in the browser or
  dropped.

## What the Worker has, and has not

BackGold gives the Worker these bindings, and nothing else:

| Name | What it is |
| --- | --- |
| `BACKGOLD_API` | The connection to the organization's content. The kit uses it; you rarely touch it. |
| `BACKGOLD_SITE_ID`, `BACKGOLD_SITE_TOKEN`, `BACKGOLD_API_ORIGIN`, `ENVIRONMENT` | The site's identity and where BackGold is |
| `ASSETS` | The static files of the build |
| Your own text `vars` and secrets | See below |

It does **not** have: KV, D1, R2, Queues, Durable Objects, service bindings,
cron triggers, Workers AI, routes of its own, or `caches.default`
(`caches.default` is switched off for every Worker in BackGold's namespace,
and `request.cf` is empty). `wrangler.jsonc` entries for any of these are
left out at deploy, with a warning.

It **can** make outside requests with `fetch`, read the request, and keep
values in module variables for as long as the isolate lives.

## Porting server routes

For each thing the old site did on a server:

| The old site | On BackGold hosting |
| --- | --- |
| Served pages from a server or a static build | The kit's catch-all route draws them from BackGold |
| Proxied a form to a CRM, sent mail, checked a captcha | Gone: a `FormBlock` section. Delete the route, the secret and the captcha. |
| Called another service and returned JSON (weather, a map, stock) | An Astro endpoint at an address outside `/api`. Cache with a module variable and a `Cache-Control` header, not `caches.default`. |
| Read or wrote its own database | Not on BackGold hosting. If it is content, it belongs in BackGold. If it is an application, it stays on its own host. |
| Redirected `www` to the apex, old addresses to new | The domain's setup in BackGold, and the site's redirects in BackGold (the kit applies them) |
| Wrote `robots.txt`, a sitemap, feeds | The kit: `/robots.txt`, `/sitemap.xml`, `/feed.xml`, `/llms.txt` |
| Set `noindex` off the production host | BackGold: every preview answers `X-Robots-Tag: noindex` |

An endpoint that keeps a value:

```ts
// src/pages/weather.json.ts
import type { APIRoute } from 'astro'
export const prerender = false

let kept: { at: number; body: string } | null = null
const TTL_MS = 30 * 60 * 1000

export const GET: APIRoute = async () => {
  if (!kept || Date.now() - kept.at > TTL_MS) {
    const res = await fetch('https://api.example.com/…', { signal: AbortSignal.timeout(4000) }).catch(() => null)
    kept = { at: Date.now(), body: res?.ok ? await res.text() : JSON.stringify({ ok: false }) }
  }
  return new Response(kept.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' } })
}
```

Answer a failure with a 200 and a body the page can ignore, so a third
party's outage never breaks a page.

## Things BackGold and the kit now do for you

Delete the old code for these rather than porting it:

- Page views: the kit names the page it drew and BackGold counts it.
- Analytics: the layout's `<Analytics />`, switched on or off by the
  organization in BackGold.
- The legal line: `<Disclaimer>`, from the organization. It draws nothing
  for an organization that has none.
- Previews of drafts: `src/pages/preview.astro`, with nothing to set up.
- Structured data for pages, lists and entries: `jsonLdFor`. Add the site's
  own (a local business, FAQs) beside it.

## Limits

| | Limit |
| --- | --- |
| The Worker's modules | 10 MiB, in at most 500 files |
| Static files | 20,000 files, 25 MiB each, 250 MiB in all |
| `_headers` and `_redirects` | 64 KiB each; the only asset settings carried |
| Compatibility flags | `nodejs_compat` and `global_fetch_strictly_public` only |
| CPU time a request | 100 ms |
| Text `vars` | 64, of 5 KiB each |
| Secrets | 32, of 5 KiB each |
| Deploys | 30 a day; the newest 10 are kept |
| Preview names | 20 |

Over a limit, `backgold deploy` stops before uploading and names it. The
build must come from the Cloudflare adapter (`@astrojs/cloudflare`), which
writes the `wrangler.json` the CLI reads under `dist/`; a plain static build
has none and is refused.

Heavy pages are worth a look before the first deploy: 100 ms of CPU is
plenty for drawing a page, not for resizing images or parsing a large feed
on every request.

## Settings and secrets

- **Text `vars` in `wrangler.jsonc` are kept**, except any named
  `BACKGOLD_*`, `ENVIRONMENT` or `ASSETS`, which BackGold sets. `SITE_URL`
  (the site's public address) belongs there.
- **A secret the site's own code reads**: `npx backgold secrets set NAME`
  (it asks for the value; never pass it as an argument). It reaches the site
  on its next deploy. Most converted sites need none: the secrets the old
  site held were for forms and mail.
- **Nothing secret in the repository.** `backgold.json` holds the site's id
  and is committed; the deploy token lives in the environment and in CI's
  secrets.
- **`.dev.vars` is copied into `dist/server/` by the build.** `backgold
  deploy` leaves dot-files out of the upload, so it does not reach BackGold;
  it is one more reason `dist/` stays git-ignored.

## Previews and the domain

- A deploy is kept whether or not it is live. `--preview <name>` gives it an
  address of its own; `backgold previews` prints it. A preview is open to
  anyone with the link, answers `noindex`, and counts no views.
- A custom site is served **only on its connected, verified domain**. It is
  not drawn on the organization's `backgold.com` address. Until a domain is
  connected, the promoted site is reachable only through previews.
- Promote and rollback upload nothing and take a second.

## How fresh the content is

Each copy of the Worker re-checks the site's content version at most once a
minute, so a publish in BackGold shows within about a minute. Nothing is
rebuilt and nothing needs deploying for a content change. Do not add a
"rebuild on publish" hook; there is nothing for it to do.
