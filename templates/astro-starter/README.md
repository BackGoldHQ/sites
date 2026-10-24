> **This repository is synced from `templates/astro-starter` in [gitlab.com/backgold/sites](https://gitlab.com/backgold/sites), and direct pushes here are overwritten.** To build a site from it, press **Deploy to Cloudflare** below or clone it into your own repository. Do not push changes here.

# BackGold starter for Astro

A complete website for a BackGold site, built by you and hosted on your own
Cloudflare account. The organization keeps writing its pages, menus, posts and
its own content types in BackGold; this site reads them through BackGold's
Content API and renders them with components you own. It runs on Cloudflare
Workers with [Astro](https://astro.build), keeps every page cached at the edge
until the content changes, and comes with a sitemap, `robots.txt`, `llms.txt`,
Atom feeds and structured data already in place.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://gitlab.com/backgold/backgold-starter)

It is built on two packages: [`@backgold/content`](https://www.npmjs.com/package/@backgold/content),
the typed client for the Content API, and [`@backgold/astro`](https://www.npmjs.com/package/@backgold/astro),
the plumbing (routing, caching, the webhook, preview, the SEO routes). This
repository is the thin layer on top that you restyle.

## Connect it in five steps

You need the site's **Developer** page in BackGold: open **Sites**, choose the
site, then **Developer**. The site must be in headless mode. The page lists
the same five steps, in the same order, with each step's fields in it.

1. **Deploy to Cloudflare.** Press the button above. Cloudflare copies this
   repository into your own GitHub or GitLab account, creates a KV namespace,
   and asks for two values:
   - `BACKGOLD_SITE_KEY`: the **publishable key**, shown in step 1 on the
     Developer page (it starts with `bg_site_pk_`).
   - `SITE_URL`: the address the site will live at, for example
     `https://www.example.org`. If the domain is not connected yet, enter the
     address you plan to use.

   Leave `BACKGOLD_API_ORIGIN` as it is. The form asks for no secrets: the two
   the site uses are created in steps 2 and 4, once the Worker exists.

   About a minute later the site is live at
   `https://<worker name>.<your account>.workers.dev`. Then, in your new
   repository, put the same `BACKGOLD_SITE_KEY` and `SITE_URL` in
   `wrangler.jsonc` under `vars` and commit them (the key is publishable, so
   that is safe): Wrangler applies the file's `vars` on every deploy, so a
   value set only in the dashboard is reset by the next push.
2. **Give the site a secret key.** On the Developer page, press **New secret
   key**, name it, and copy the key (it starts with `bg_site_sk_` and is shown
   once). Add it to the Worker as a secret named `BACKGOLD_SECRET_KEY` (see
   [Adding a secret](#adding-a-secret-to-the-worker)). This is not the
   webhook's signing secret; that one comes in step 4.
3. **Test a preview.** In step 3 on the Developer page, enter
   `https://<your site>/preview` and press **Send a test preview**;
   `<your site>` is the `workers.dev` address Cloudflare showed when the
   deploy finished, or your own domain once step 5 is done. If the test does
   not pass, the page says what its answer means. The editor's **Preview on
   your site** now opens drafts here.
4. **Turn on the webhook.** The webhook is how BackGold tells this site that
   something was published.
   1. In step 4 on the Developer page, enter
      `https://<your site>/api/backgold/webhook` as the **Endpoint address**
      and press **Add endpoint**.
   2. BackGold shows a **signing secret** (it starts with `whsec_`) once. Copy
      it.
   3. Add it to the Worker as a secret named `BACKGOLD_WEBHOOK_SECRET` (see
      [Adding a secret](#adding-a-secret-to-the-worker)).
   4. Back on the Developer page, turn on all five content events. Every one
      is off until you do; **Turn on all five** does it in one press.

   A publish in BackGold now reaches the Worker that receives the webhook at
   once, and every other copy of it within about a minute. If the site does
   not update, the Worker's logs (**Workers & Pages → your Worker → Logs**)
   say why each delivery was refused: `BACKGOLD_WEBHOOK_SECRET is not set`
   means that secret was never added or not deployed; `signature does not match` means
   the secret on the Worker is not this endpoint's. If you no longer have the
   signing secret, press **New signing secret** in step 4 on the Developer
   page and replace `BACKGOLD_WEBHOOK_SECRET` on the Worker with the new one.
5. **Point your domain.** In Cloudflare, add the site's domain to the Worker
   (**Settings → Domains & Routes**). The edge cache, which makes pages fast,
   only works on a custom domain.

Until `BACKGOLD_SITE_KEY` is set, every page shows a short setup page naming
what is missing. The secrets can come later: without them the site still shows
everything that is published.

### Adding a secret to the Worker

In the Cloudflare dashboard: **Workers & Pages → your Worker → Settings →
Variables and Secrets → Add**. Choose the type **Secret**, enter the name
exactly as written here (for example `BACKGOLD_WEBHOOK_SECRET`), paste the
value, and press **Deploy**. Or, from your copy of the repository:

```bash
npx wrangler secret put BACKGOLD_WEBHOOK_SECRET
```

A secret takes effect as soon as it is deployed; nothing needs rebuilding.

## Deploy to BackGold hosting

Instead of your own Cloudflare account, BackGold can run the site for you.
You keep this repository and build it as before; BackGold keeps every deploy,
so you can look at one under a preview name before it goes live, and make any
kept deploy live again in a second. The site then needs no Cloudflare
account, no KV namespace and no site keys: it reads the organization's
content through BackGold's own connection, drafts for `/preview` included.
The command is `backgold`, from [`@backgold/cli`](https://www.npmjs.com/package/@backgold/cli),
already in this repository's devDependencies.

1. **Get a deploy token.** On the site's **Developer** page in BackGold, make
   a deploy token. It starts with `bg_deploy_`, is shown once, and opens only
   this one site: it can deploy it, and nothing else in the organization.
2. **Link the repository to the site.**

   ```bash
   npx backgold link
   ```

   It asks for the token (not shown as you type) and fills in
   `backgold.json` with the site's id. Commit `backgold.json`; it holds
   nothing secret. The token is never written to a file: keep it in the
   environment variable `BACKGOLD_DEPLOY_TOKEN` for the commands below (in
   your shell, or as a masked CI variable).
3. **Deploy.**

   ```bash
   npm run deploy:backgold                   # build, upload, and make it the live site
   npx backgold deploy                       # build and upload; the live site stays as it is
   npx backgold deploy --preview my-branch   # the same, shown under the preview name my-branch
   ```

   A deploy waits until it is ready and prints its id. If it fails, it says
   why and the live site does not change.
4. **Promote and roll back.**

   ```bash
   npx backgold deploys            # every kept deploy, and which one is live
   npx backgold promote 7f3a91c2   # make that deploy live (its id, or the start of it)
   npx backgold rollback           # the deploy before the live one, live again
   npx backgold previews           # the preview names; --delete <name> removes one
   ```

   Promote and rollback upload nothing, so they take a second.

Your `wrangler.jsonc` still serves `npm run dev` and `npm run preview`. On
BackGold hosting its text `vars` are kept, except the `BACKGOLD_*` ones, which
BackGold sets itself; its KV namespace is left out (BackGold gives the site a
cache of its own). A secret your own code reads is set with
`npx backgold secrets set <NAME>`, which asks for the value, and reaches the
site on its next deploy. The package's
[README](https://www.npmjs.com/package/@backgold/cli) has every command, the
limits, and a CI example.

`npm run deploy` still deploys to your own Cloudflare account; use one or the
other for a site, not both.

## Settings

| Name | Kind | Needed | What it is |
| --- | --- | --- | --- |
| `BACKGOLD_SITE_KEY` | variable | yes | The site's publishable key, `bg_site_pk_…`, from **Developer → Keys**. It only reads what the public site shows. |
| `SITE_URL` | variable | set it in production | The site's public address. Used for canonical links, the sitemap and feeds. Blank means the address each request arrives on, as the visitor's `Host` header names it, so the same page can be cached and indexed under several addresses. |
| `BACKGOLD_API_ORIGIN` | variable | no | Where the Content API lives. Keep `https://api.backgold.com`. |
| `BACKGOLD_CACHE` | KV namespace | no (created by the Deploy button) | Where the site keeps its BackGold reads and the last content version, shared by every copy of the Worker. Without it each copy keeps them in memory only: a new copy reads everything from BackGold again, and the webhook's version reaches only the copy that received it until the others re-check. |
| `BACKGOLD_SECRET_KEY` | secret | for previews and visitors signing in | A secret key, `bg_site_sk_…`, from **Developer → Keys**. The one secret serves both: the `/preview` page reads drafts with it, and the `/auth/` routes redeem the giving portal's sign-in codes and save lesson progress with it (see [Visitors signing in](#visitors-signing-in)). It never reaches a page or the cache. Without it `/preview` answers 503, every `/auth/` address answers 404, and gated entries show their teaser. |
| `BACKGOLD_WEBHOOK_SECRET` | secret | for the webhook | The webhook endpoint's signing secret, `whsec_…`, from **Developer → Webhooks**. |
| `BACKGOLD_REBUILD_HOOK_URL` | secret | no | A URL to POST after each content change, for a site you also rebuild statically (a pipeline trigger). This starter does not need it: it renders on request. Do not add it unless you have such a pipeline. |

Variables live in `wrangler.jsonc`; secrets are set with
`npx wrangler secret put <NAME>` or in the dashboard, never committed.

A **preview deployment** (the address Cloudflare builds for a pull request or
a branch) reads only what `wrangler.jsonc` lists under `previews`, never the
top-level `vars`. You do not need to write that block: each build copies
`BACKGOLD_SITE_KEY` and `BACKGOLD_API_ORIGIN` into it, so a preview shows the
site. A value you set under `previews` → `vars` yourself is kept. A preview
has no KV namespace, so it keeps its reads in memory, and no secrets unless
you add them with `npx wrangler preview secret put <NAME>`.

## How the content stays current

- Every change in BackGold moves the site's **content version**. Each page this
  site renders is cached at the edge under that version, so a new version
  makes every old copy unreachable. Nothing is purged and nothing is
  rebuilt; the next visitor gets a fresh page.
- The **webhook** (step 4) tells the site the new version when something is
  published. Cloudflare runs several copies of the Worker; the one that
  receives the webhook moves at once, and every other one within about a
  minute (each re-checks its version at most once a minute). Without the
  webhook every copy is within about a minute.
- To force a fresh read from your own tooling, POST to
  `/api/backgold/revalidate` with the webhook secret:

  ```bash
  curl -X POST https://<your site>/api/backgold/revalidate \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $BACKGOLD_WEBHOOK_SECRET"
  ```

  (Astro refuses a POST without a JSON content type from outside the site.)
- The **edge cache works only on a custom domain**. On a `workers.dev` address
  every request renders; BackGold's answers still come from the KV namespace,
  so it stays quick.

## Restyle it

Everything you see is in `src/`, and none of it is generated:

```
src/
  layouts/Site.astro           the head, header, menus and header button, Top banner,
                               Above the footer, footer and legal line
  pages/[...path].astro        every address: pages, lists, entries, authors, tags, feeds;
                               the Sidebar beside a page or an entry
  pages/preview.astro          drafts, opened from BackGold's "Preview on your site"
  pages/404.astro              the not-found page
  pages/backgold-setup.astro   shown until the site key is set
  components/sections/         one component per section type, and index.ts
  components/EntryArticle.astro, EntryCard.astro, FieldValue.astro, PageSections.astro,
             LeadingHero.astro
  styles/site.css              the whole look
  lib/brand.ts                 the brand colours and the five band grounds
```

- **Sections.** A page in BackGold is an ordered list of sections, each with a
  `type` (Hero, About, Issues, …). `src/components/sections/index.ts` maps
  each type to its component; replace a component, or point a type at your
  own. A type you do not list (including one BackGold adds later) renders
  through the package's `DefaultSection`, so nothing goes missing.
- **Layouts.** A section's `variant` is the Layout chosen for it in BackGold.
  `<Section>` looks it up as `'<Type>:<layout>'` first, then `'<Type>'`, so
  you can give one layout a component of its own (`'Hero:split'` in
  `index.ts`) and leave the rest to the type's component, which also gets
  the layout as its `variant` prop.
- **Bands.** Each section has a `band`, the ground it sits on (`plain`,
  `tint`, `panel`, `wash`, `contrast`), and a `bleed` (`full` edge to edge, or
  `contained` as a card). They arrive as the classes `bg-band-<band>` and
  `bg-bleed-<bleed>`; `site.css` maps them to grounds.
- **Colours.** `src/lib/brand.ts` turns the brand colours set in BackGold into
  CSS custom properties: `--bg-brand-primary`, `--bg-brand-secondary`,
  `--bg-brand-accent`, and for each band `--band-<band>` with its `-ink`,
  `-muted`, `-link`, `-button` and `-button-ink`. It picks each text colour so
  it meets WCAG AA contrast on its ground, whatever the brand colours are.
  Inside a section, use the short names `--ink`, `--muted`, `--link`,
  `--button` and `--button-ink`.
- **Type.** The system font stack and a fluid type scale, set at the top of
  `site.css`. Add a web font there if the design calls for one.
- **Areas and the header button.** An area's items are
  `<aside class="bg-area bg-area-<name>">` (the Sidebar's also `rail`), and
  the header button is `<a class="bg-menu-button button">`; `site.css`
  styles both, and `.layout-split` (a page or an entry whose Sidebar has an
  item) sets the Sidebar beside the main column.

Every link and image address that reaches a page goes through `safeHref` or
`safeSrc` from `@backgold/astro/server` (the rule the package's own components
follow), and BackGold's rich text through its sanitizer. Keep that when you
write your own components.

## Menus and the header button

The organization edits one header menu and one footer menu in BackGold;
`Site.astro` reads both and draws them with the package's `<Menu>`. Each link
has a **Shows on** rule (every page, only some pages, every page but some, or
only pages that take donations), and the package applies it against the page
being drawn: every route passes the layout `page`, the BackGold page as
`{ id, takes_donations }` or `null` on a list, an entry, an author, a tag or
the 404. The link marked as the header button leaves the menu and
`<MenuButton>` draws it at the right of the header on the pages its rule
names, with the starter's `.button` look; where it does not show, nothing
takes its place.

To move the button, move the `<MenuButton>` line in `Site.astro`. To ignore
the rules, leave out `page` on `<Menu>` and `<MenuButton>`: every link shows,
and the button is drawn on every page.

## Areas

An area is a place on the site that holds the same sections on many pages: a
countdown banner, a sign-up in the sidebar. The organization fills areas in
BackGold, and each page, entry or list arrives with its `areas`. The starter
draws three, each with the package's `<Area>`:

- **Top banner** (`top_banner`), under the header, in `Site.astro`;
- **Sidebar** (`sidebar`), beside the main column of a page or an entry (after
  it on a narrow screen), in `[...path].astro`; with nothing in it, the page
  keeps one column;
- **Above the footer** (`above_footer`), over the footer, in `Site.astro`.

To draw another area, add one line where it should go, with the area's key
(the Content API's `GET /site` lists every area with its key):

```astro
<Area name="<the area's key>" areas={areas} components={sections} />
```

An item with a start or an end date is sent hidden and shown in the browser
while its dates hold, so a cached page still shows and hides it on time; with
scripts off, a dated item does not show. An area with nothing in it draws
nothing.

## Section markers

On the `/preview` page every section is preceded by an empty, hidden marker
(`<span id="bg-section-<id>" data-bg-section hidden>`) and the head carries
`<meta name="backgold-preview" content="sections">`, so the BackGold editor
can scroll the preview to the section being edited. Published pages carry
neither. Keep drawing sections with the package's `<Section>` and the markers
come with it; if you write your own loop, write the same marker before each
section and keep the package's `<Seo>` (or the meta) in the head.

## Your own content types

The organization can add content types in BackGold (endorsements, press
releases, anything). Each one with pages gets its list at `/<url base>`, its
entries at `/<url base>/<slug>`, tag pages and an Atom feed at
`/<url base>/feed.xml`, with no change here. `FieldValue.astro` renders each
custom field by its kind (text, rich text, image, PDF, link, date, yes/no,
choices, list, reference).

To have TypeScript know each type's fields:

```bash
BACKGOLD_SITE_KEY=bg_site_pk_… npm run types
```

This writes `src/backgold.d.ts` from the site's types. Run it again whenever
the organization changes a content type.

## Donations, forms and petitions are embeds

**Money and consent never pass through partner code.** Donate, form, petition
and RSVP modules arrive as an embed, never as fields to rebuild. They always
render from BackGold, so contribution limits, receipts and text-message
consent stay on BackGold's side.

That is why there is no `Donate.astro`, `FormBlock.astro` or `Petition.astro`
in `src/components/sections/`: those sections (and the store, events,
calendar, polls and advocacy modules) render through the package's `Embed`,
which places BackGold's own frame and sizes it. Style the section around it
(its heading, its band, its spacing) but never cover, restyle or imitate what
is inside the frame, and never collect donations, signatures, RSVPs or consent
in a form of your own. Links to the organization's own donate, events and
store pages are followed exactly as BackGold gives them.

## The legal line

The footer shows the site's disclaimer ("Paid for by …") on every page. It is
**required by law**, and BackGold checks the live home page for it every hour
and warns the organization when it cannot find it. Restyle it as you like, but
keep it on every page, as text in the HTML the server sends (a disclaimer
added by client-side script is not found).

## Analytics

There is no analytics setting in this repository. Whether the site shares its
page views with BackGold is the organization's choice, made in BackGold; when
it does, the layout's `<Analytics />` loads a small script once the page is
idle (no session recording) and BackGold shows the traffic beside its other
sites. When it does not, `<Analytics />` renders nothing. Add your own
analytics as you would on any site.

## Ready for experiments

Nothing here runs an A/B test, but the three things one needs are in place:

1. The edge cache key has a **variant** slot (empty today), so a variant is one
   more cached copy, not a new cache.
2. A first-party **`bg_vid`** cookie (a random id, no personal data) names the
   visitor, for a server-side pick and for analytics alike.
3. `<Section>` takes a **`variant`** prop: add a component to the sections map
   as `'<Type>:<variant>'` (say `'Hero:b'`) and pass `variant="b"` to show it.
   The prop wins over the section's stored layout.

## Visitors signing in

An entry the organization keeps for people it knows (its access is
`signed_in`, `members` or a tag) reads as its teaser: the title and summary,
no body and no media. A visitor signs in with their email through BackGold's
giving portal, and the site then reads that entry for them. This starter does
it with four server routes under `src/pages/auth/` and the site's secret key:

| Route | |
| --- | --- |
| `GET /auth/sign-in?to=<path>&title=<text>` | `302` to the portal's door for this site, which sends the visitor back to `<SITE_URL>/auth/visitor?to=<path>`. A locked entry links here ("Sign in with your email"). |
| `GET /auth/visitor?code=<code>&to=<path>` | The way back: redeems the portal's one-minute code with the secret key, keeps the visitor's token in the `bg_visitor` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, thirty days), and `302`s to the path. A used or expired code: a short "That sign-in link has expired" page. |
| `POST /auth/progress` | JSON `{ course, lesson, completed?, position_seconds? }` from the site's own pages: saves where the visitor is in a lesson and answers BackGold's JSON. `401` without the cookie. |
| `GET /auth/sign-out?to=<path>` | Clears the cookie and `302`s to the path. |

To turn it on:

1. Give the Worker the secret `BACKGOLD_SECRET_KEY`, a secret key from
   **Developer → Keys** (see [Adding a secret](#adding-a-secret-to-the-worker)).
   It is the same secret previews use (step 2 of
   [Connect it](#connect-it-in-five-steps)); if it is set, there is nothing
   to add:

   ```bash
   npx wrangler secret put BACKGOLD_SECRET_KEY
   ```

2. Set `SITE_URL` to the site's `https://` address in BackGold: its connected
   domain, or, while it has none, the host of the preview address on its
   Developer page. The exact host (`www.example.org` and `example.org` are
   two different hosts). The portal sends a visitor back only to that host.

On every page after that, `@backgold/astro` reads who is signed in from the
cookie (`Astro.locals.backgold.visitor`) and passes their token to the page's
reads (`Astro.locals.backgold.visitorReads`), so an entry kept for them opens.
Such a page is never cached and is answered `private, no-store`. Signing out
clears the cookie; BackGold has no call that ends a token today, and the token
that was in it lapses within its hour, never renewed without the cookie. The token never reaches page
script: only this Worker reads the cookie.

## Develop locally

Requires Node 22.12 or later.

```bash
npm install
```

For previews and the webhook locally, create a file named `.dev.vars` (it is
git-ignored; never commit it) holding the secrets you have:

```
BACKGOLD_SECRET_KEY=bg_site_sk_…
BACKGOLD_WEBHOOK_SECRET=whsec_…
```

With the publishable key in `wrangler.jsonc` under `vars`:

| Command | |
| --- | --- |
| `npm run dev` | Astro's dev server on workerd, reloading as you edit. No edge cache. |
| `npm run preview` | Build, then serve the built Worker with `wrangler dev`, as Cloudflare will run it. |
| `npm run deploy` | Build and deploy with `wrangler deploy`. |
| `npm run deploy:backgold` | Build and deploy to BackGold hosting, live at once (see [Deploy to BackGold hosting](#deploy-to-backgold-hosting)). |
| `npm run check` | Type-check the project with `astro check`. |
| `npm run types` | Write `src/backgold.d.ts` from the site's content types. |

A deploy from the Deploy button rebuilds on every push to your repository.

## License

MIT. Once you clone it, it is yours.
