# Building a site on BackGold content: the headless Content API

This guide is for a developer building a website whose pages, menus and posts
an organization manages in BackGold. Read it top to bottom once; the
[OpenAPI reference](https://api.backgold.com/api/content/v1/docs) has every
schema in full.

## 1. What this is

- The organization manages its site's **pages, menus, sections and entries**
  (posts, podcasts, videos and its own content types) in BackGold, as it would
  for a site BackGold hosts.
- **Your frontend reads them as JSON** from the Content API with a per-site
  key, and draws them however you like.
- **Money and consent always render from BackGold.** Donations, forms, polls,
  sign-up forms, petitions, event RSVPs, the store and the calendar arrive as an `embed`
  you place. They never arrive as fields. Never rebuild them in your own code.
- Links to BackGold's own pages (donate, events, the store, …) point at the
  organization's BackGold address and must be followed as given.
- Every page must show the site's legal disclaimer, and BackGold checks the
  live site for it.

The API is read-only. It does not write anything back to BackGold.

## 2. Getting access

The headless Content API is enabled per organization by BackGold. If the
organization does not see a **Developer** page on its site, ask BackGold to
enable it for the organization. Until it is enabled, every Content API request
for that organization's sites answers `404`.

Once it is enabled, an owner or admin of the organization opens
**Sites → the site → Developer** (under **Admin** in the site's left rail).
Only owners and admins see the controls.

1. **Site mode.** They pick **Built elsewhere** (the other choice is
   **Hosted by BackGold**). Choosing Built elsewhere makes the site's
   publishable key if it has none. Switching back to Hosted keeps every key,
   and the API keeps answering.
2. **Keys.** Step 2 on the page, **Give the site a secret key**, holds two kinds:

   | Key | Starts with | Where it may live | What it reads |
   | --- | --- | --- | --- |
   | Publishable key | `bg_site_pk_` | Anywhere, a browser included | Published content only |
   | Secret key | `bg_site_sk_` | Your server only | Published content, plus drafts and previews |

   - A site has exactly one publishable key. It is always shown in full with a
     **Copy** button. The Developer page cannot revoke or replace it.
   - Secret keys are made with **New secret key** and a name ("Say where it
     will live, so you know which one to revoke later"). The full key is shown
     **once**, in a card that reads "Copy this secret key now. You won't see it
     again." After that the page shows only its last four characters
     (`bg_site_sk_••••••••3f9a`), who made it, and when it was last used.
   - A site can hold up to **10** live secret keys. **Revoke** stops a key at
     once, and a revoked key cannot be restored.

   A secret key can read drafts. **Never ship it to a browser.** Do not put it
   in client-side bundles, `NEXT_PUBLIC_*`-style variables, or HTML.

   The same key also works in an AI assistant that speaks MCP; see
   [section 11](#11-use-the-content-from-an-ai-assistant-mcp).
3. The preview address (step 3) and the webhook (step 4) are covered in
   sections 7 and 8.
4. The **Content API** card shows the base URL and links to the full
   reference.

## 3. Authentication and the base URL

```
Base URL:  https://api.backgold.com/api/content/v1
Header:    Authorization: Bearer bg_site_pk_…   (or bg_site_sk_…)
```

The Developer page shows the base URL. Use it exactly as shown there.

```bash
curl -s https://api.backgold.com/api/content/v1/site \
  -H "Authorization: Bearer $BG_SITE_KEY"
```

- **The key names the site.** You never pass a site id or domain. Each key
  reads only its own site.
- **CORS is open to any origin.** Every response, errors included, carries
  `Access-Control-Allow-Origin: *`. Allowed methods are `GET, HEAD, OPTIONS`.
  Allowed request headers are `Authorization, If-None-Match, Content-Type`.
  `ETag` and `X-Content-Version` are exposed to browser code. No cookies or
  credentials are involved, so do not set `credentials: 'include'`.
- **No rate limit.** The API is served from a cache rather than throttled.
  Use the caching headers anyway (section 6).
- `GET /openapi.json` and `GET /docs` are public and need no key.

| Status | `code` | Meaning |
| --- | --- | --- |
| `401` | `INVALID_KEY` | The key is missing, is not a site key, is unknown, or was revoked. |
| `403` | `SECRET_KEY_REQUIRED` | You asked for a draft or a preview, or redeemed a visitor's sign-in code, with a publishable key. |
| `403` | `SERVER_ONLY` | A visitor's sign-in code was sent with a browser's `Origin`, `Sec-Fetch-Site` or `Sec-Fetch-Dest` header (headers only a browser sends; `Sec-Fetch-Mode` alone, which Node's `fetch` adds, passes): redeem it from your server ([Visitors](#visitors-letting-people-sign-in-on-your-site)). |
| `404` | `NOT_FOUND` | Nothing at that address. This is also the answer when the key's site was removed or the organization no longer has the Content API, because for that organization the API does not exist. |

Every error body is `{ "error": "<message>", "code": "<CODE>" }`. Responses
are top-level named objects with no `{ data }` wrapper.

The [TypeScript client](#12-the-typescript-client) (section 12) does this for you.

## 4. The endpoints

All of them are `GET`. Each one below shows a trimmed response; the full
schemas are in the reference. Ids in the examples are shortened; treat every
id as an opaque string. Published reads carry `ETag` and
`X-Content-Version` (section 6).

The curl examples assume:

```bash
BG=https://api.backgold.com/api/content/v1
BG_SITE_KEY=bg_site_pk_…   # the site's publishable key
```

### `GET /site`

The site's identity, brand, social links, SEO defaults, legal line and current
content version.

```bash
curl -s "$BG/site" -H "Authorization: Bearer $BG_SITE_KEY"
```

```json
{
  "site": {
    "id": "cd_8f2a",
    "name": "Example Org",
    "domain": "example.org",
    "mode": "headless",
    "favicon_url": "https://api.backgold.com/api/media-files/med_logo",
    "pack": "evidence",
    "style": "{\"corners\":\"sharp\"}",
    "theme": null,
    "brand": {
      "logo_url": "https://api.backgold.com/api/media-files/med_logo",
      "primary_color": "#1b3a5c",
      "secondary_color": "#f4efe6",
      "accent_color": "#c8102e",
      "palette_id": null
    },
    "social": [{ "platform": "facebook", "url": "https://facebook.com/example" }],
    "seo": { "title": "Example Org", "description": "What we stand for." }
  },
  "legal": { "disclaimer": "Paid for by Example Org.", "required": true },
  "version": 184
}
```

- `favicon_url` is the site's own icon, or the organization's logo if the
  site has none.
- `style` is the site's style settings as **JSON text**. Parse it if you use
  it.
- `seo` comes from the published home page's title and description.
- `social` leaves out any row that still holds its placeholder address.
- `theme` is the saved theme the site wears, or `null` when it wears its
  palette. When present it carries `id` and `name`, `heading_transform`,
  `heading_weight` (the weight in use), `radius_px`, `light` and `dark` (each
  `colors` — the five seed colours — and `tokens`, the resolved palette whose
  keys match a baked page's custom properties: `accent_text` is
  `--accent-text`), `fonts.heading` and `fonts.body` (`family`, `stack`,
  `source` — `builtin`, `fontsource` or `system` — and `files`, absolute woff2
  addresses by weight), and `css_url`. With a theme, `pack` is the palette it
  was laid over and `style` keeps only `appearance`, `density` and `width`.
  Use any of it, or none: layout is yours.

### `GET /site/theme.css`

The site's theme as one stylesheet: `@font-face` rules for its faces, then
both modes' custom properties under `:root[data-gg-mode="light"]`,
`:root[data-gg-mode="dark"]` and a bare `:root` (light), exactly as a page
BackGold bakes for the site carries them. Cached and versioned like every
published read. `404 NOT_FOUND` when the site wears no saved theme.

```bash
curl -s "$BG/site/theme.css" -H "Authorization: Bearer $BG_SITE_KEY"
```

### `GET /menus/{key}`

`key` is `primary` (the header), `footer` (the footer's link columns) or
`utility` (the footer's small row of links). Any other key answers `404`.

```bash
curl -s "$BG/menus/primary" -H "Authorization: Bearer $BG_SITE_KEY"
```

```json
{
  "menu": { "key": "primary" },
  "items": [
    { "id": "nav_1", "label": "Issues", "kind": "page",
      "target": { "kind": "page", "page_id": "lp_issues", "slug": "issues" },
      "url": "/issues", "external": false, "children": [] },
    { "id": "nav_2", "label": "Get involved", "kind": "group",
      "target": { "kind": "group" }, "url": null, "external": false,
      "children": [
        { "id": "nav_3", "label": "Volunteer", "kind": "section",
          "target": { "kind": "section", "page_id": "lp_home", "slug": "home", "anchor": "volunteer" },
          "url": "/#volunteer", "external": false, "children": [] },
        { "id": "nav_4", "label": "Our chapter", "kind": "external",
          "target": { "kind": "external", "url": "https://chapter.example.org" },
          "url": "https://chapter.example.org", "external": true, "children": [] }
      ] }
  ]
}
```

- **Always link with `url`.** `target` tells you what the item points at.
  `url` is the resolved address: a path on the site, a `#anchor`, or an
  absolute address.
- Item kinds you will see: `page`, `section` (a block on a page), `external`,
  `group` (a named parent with children, which is a dropdown or a footer
  column) and `campaign_forms` (a campaign's published forms, listed as its
  children). A group's `url` is `null` unless it has a page of its own.
  `campaign_forms` children may carry absolute URLs when a form lives
  elsewhere. `entry` and `term` are reserved and are not returned today.
- Nesting is one level deep: top-level items, and children under a group or
  campaign-forms item.
- The API returns only items a visitor can follow. An item pointing at an
  unpublished or internal page is dropped, and so is a group left empty.
- If the site has stored no primary menu, `primary` lists the published pages
  marked to show in navigation.

### `GET /pages`

The site's published public pages, in navigation order.

```json
{
  "pages": [
    { "id": "lp_home", "slug": "home", "title": "Home", "url": "/", "is_home": true,
      "published_at": "2026-09-30T14:00:00.000Z", "updated_at": "2026-10-01T09:12:00.000Z" }
  ]
}
```

`url` is `/` for the home page and `/<slug>` for any other page.

### `GET /pages/{slug}`: a page as ordered sections

`slug` is the page's slug. `home` (or `/`) is the home page.

```bash
curl -s "$BG/pages/home" -H "Authorization: Bearer $BG_SITE_KEY"
```

```json
{
  "page": {
    "id": "lp_home", "slug": "home", "title": "Home", "url": "/", "is_home": true,
    "published_at": "2026-09-30T14:00:00.000Z",
    "meta": { "title": "Example Org", "description": "What we stand for.", "image_url": null }
  },
  "sections": [
    {
      "id": "Hero-1", "type": "Hero", "band": "contrast", "bleed": "full", "variant": "split",
      "copy": { "headline": "A headline.", "subheadline": "A line under it." },
      "media": { "imageUrl": { "url": "https://api.backgold.com/api/lp-assets/a1/hero.webp" } },
      "links": [{ "label": "Get involved", "target": { "kind": "page", "slug": "get-involved" }, "url": "/get-involved" }]
    },
    {
      "id": "Donate-1", "type": "Donate", "band": "panel", "bleed": "full", "variant": null,
      "copy": { "heading": "Support the work" },
      "media": {}, "links": [],
      "embed": { "iframe": "https://secure.backgold.com/embed/d/df_general",
                 "script": "https://secure.backgold.com/embed.js" }
    }
  ],
  "legal": { "disclaimer": "Paid for by Example Org.", "required": true }
}
```

`page.meta` holds the page's own title, description and share image. Where
the organization left one blank, it is taken from the page's content.

**The Section shape.** Each section is one block of the page, in order:

| Field | Always present | What it is |
| --- | --- | --- |
| `id` | yes | The block's id, stable across publishes. Blocks without one get `<Type>-<position>`. |
| `type` | yes | The block type, such as `Hero`, `About` or `Donate`. See section 5. |
| `band` | yes | The section's ground: `plain`, `tint`, `panel`, `wash` or `contrast`. |
| `bleed` | yes | The section's geometry: `full` (edge to edge) or `contained`. |
| `variant` | yes | The block's one layout choice (for example a Hero's `layout`), or `null`. |
| `copy` | yes | The block's words, keyed by field name (`headline`, `heading`, `body`, …). Blank fields are left out. |
| `media` | yes | Images, videos and documents, keyed by field name. Each value is `{ url }`, and uploaded files are absolute URLs. |
| `links` | yes | `{ label, target, url }` for each link the block authors. Always `[]` on a money or consent section. |
| `data` | for data blocks | `{ source, items }`: the rows the block lists (section 5). |
| `embed` | for money and consent blocks | `{ iframe, script, mount? }`: what to place (section 5). |
| `section_ref` | when synced | `{ key, label }` when the block comes from a synced site section placed on this page. |

**Link targets.** `links[].target.kind` is one of:

| `kind` | Extra fields | `url` is |
| --- | --- | --- |
| `page` | `slug` | A path on the site, such as `/get-involved` |
| `section` | `anchor` | `#anchor`, on the same page |
| `external` | `url` | The address as written (`http`, `https` or `mailto`) |
| `surface` | `surface`, `path` | An **absolute** address on the organization's BackGold host, such as `https://<org>.backgold.com/donate/give` |

`surface` covers these first path segments: `donate`, `join`, `store`,
`events`, `blog`, `petition`, `form`, `poll`, `frame`, `privacy`, `sms-terms`.
A link the organization wrote as `/donate/give` is not a page on your site.
It goes to BackGold, so follow `url` as given (section 5). Links the API
considers unsafe (`javascript:`, `data:` and the like) are left out entirely.

What a page does **not** return: site chrome (header, navigation, footer,
announcement takeovers and the disclaimer block), which come from `/menus`,
`/sections` and `/site`. It also leaves out unknown block types, internal or
trashed pages, and any form id, amount, consent wording or contact detail.

### `GET /sections/{key}`

A synced site section by its key, or the site's `header` or `footer`. A
sign-up form (a `SignupCapture`, or a `Hero` with its form on) read here
carries no `embed`: its frame belongs to a page. Read the page that places
the section to get it.

```json
{
  "section": { "key": "town-halls", "label": "Town halls", "kind": "custom", "role": null },
  "sections": [
    { "id": "EventsList-1", "type": "EventsList", "band": "plain", "bleed": "full", "variant": null,
      "copy": { "heading": "Come to a meeting" }, "media": {}, "links": [],
      "data": { "source": "events", "items": [
        { "id": "evt_2k9", "title": "Town hall", "starts_at": "2026-10-09T00:00:00.000Z",
          "ends_at": null, "timezone": "America/Chicago", "location": "Public library",
          "is_virtual": false, "type": "blank", "registration_closed": false,
          "url": "https://example.backgold.com/events/town-hall" } ] },
      "section_ref": { "key": "town-halls", "label": "Town halls" } }
  ]
}
```

`kind` is `announcement`, `pre_footer`, `sidebar` or `custom`.

**Why `header` and `footer` return no sections.** They answer with metadata
(`{ "key": "_header", "label": "Site header", "role": "header", … }`) and
`"sections": []`. These two hold only the site's navigation and footer blocks,
and those come to you as data elsewhere:

- the header is `GET /menus/primary`;
- the footer is `GET /menus/footer`, `GET /menus/utility`, `site.social` and
  `legal` from `GET /site`.

### `GET /types`

The organization's content types and their fields. Content types belong to
the organization, so every site of the organization sees the same list.

```json
{
  "types": [
    { "key": "endorsement", "singular_label": "Endorsement", "plural_label": "Endorsements",
      "routable": true, "url_base": "endorsements", "built_in": false,
      "fields": [
        { "key": "quote", "label": "Quote", "kind": "long_text", "required": true },
        { "key": "tier", "label": "Tier", "kind": "choice", "required": false, "choices": ["Gold", "Silver"] }
      ] }
  ]
}
```

Built-in types are `post`, `podcast` and `video` (the blog), and `plank`,
`team_member` and `open_role`. `url_base` is where a type's entries live
(`/<url_base>/<slug>`): it is `blog` for each of the three blog types, which
all live under `/blog`, and `null` for a type with no pages of its own. Field kinds: `short_text`, `long_text`,
`rich_text`, `image`, `pdf`, `link`, `date`, `datetime`, `boolean`,
`choice`, `choices`, `list`, `reference`.

### `GET /entries/{type}`: lists and paging

A type's published entries on this site, newest first.

| Query | Meaning |
| --- | --- |
| `limit` | Page size, a whole number from **1 to 50**. Defaults to **20**. Anything else is `400 BAD_LIMIT`. |
| `cursor` | The `next_cursor` of the previous page. Anything else is `400 BAD_CURSOR`. |
| `term` | Only entries carrying the term with this slug, in any taxonomy (for example `?term=taxes`). An unknown slug returns an empty list. |

```bash
curl -s "$BG/entries/post?limit=10&term=taxes" -H "Authorization: Bearer $BG_SITE_KEY"
```

```json
{
  "entries": [
    { "id": "ci_7d1", "slug": "levy-explained", "type": "post", "title": "The levy, explained",
      "summary": "Where the money goes.", "url": "/blog/levy-explained",
      "hero": { "url": "https://api.backgold.com/api/content-pages/example/hero/ci_7d1?v=1" },
      "media_url": null, "publish_at": "2026-09-29T12:00:00.000Z", "updated_at": "2026-09-29T12:05:00.000Z",
      "terms": [{ "taxonomy": "tag", "slug": "taxes", "label": "Taxes" }],
      "authors": [{ "slug": "dana-k", "display_name": "Dana K.", "avatar_url": null, "link_url": null, "role": "Written by" }] }
  ],
  "next_cursor": "MjAyNi0wOS0yOVQxMjowMDowMC4wMDBafGNpXzdkMQ"
}
```

- Keep requesting with `?cursor=<next_cursor>` until `next_cursor` is `null`.
  Treat the cursor as opaque.
- "On this site" means entries homed on this site or also published to it.
  An entry scheduled for a future time does not appear until that time has
  passed.
- An entry's `url` is its address on the site: `/blog/<slug>` for the
  built-in blog types, or `/<url_base>/<slug>` for a routable type of the
  organization's own. It is `null` for a type with no pages of its own.
- `authors[].role` is `Written by`, `Edited by`, `Photos by` or
  `Interview by`.
- An unknown type is `404`.

### `GET /entries/{type}/{slug}`: one entry

Everything in the list item, plus the body as Markdown and the type's field
values.

```json
{
  "entry": {
    "id": "ci_7d1", "slug": "levy-explained", "type": "post", "title": "The levy, explained",
    "url": "/blog/levy-explained",
    "body": { "markdown": "## Where it goes\n\nEvery dollar…" },
    "fields": {
      "endorser": { "kind": "entry", "label": "Mayor Jones", "slug": "mayor-jones" },
      "give_here": { "kind": "form", "label": "General fund", "url": "https://example.backgold.com/donate/give" }
    }
  }
}
```

`fields` is keyed by field key, and no value is ever an internal id:

| Field kind | Value |
| --- | --- |
| `image` | `{ url }` |
| `pdf` | `{ url, file_name, size_bytes }` |
| `reference` to another entry | `{ kind: "entry", label, slug }` |
| `reference` to an event, campaign, candidate, petition, form or fund | `{ kind, label, url? }`. `url` is that thing's page on the organization's BackGold host, when it has one. |
| anything else | The stored value |

### `GET /terms/{taxonomy}`

A taxonomy's terms that at least one published entry on this site carries.
Built-in taxonomies are `category` and `tag`.

```json
{
  "taxonomy": { "key": "tag", "label": "Tags", "hierarchical": false },
  "terms": [{ "id": "term_1", "slug": "taxes", "label": "Taxes", "parent_id": null, "position": 0 }]
}
```

### `GET /authors` and `GET /authors/{slug}`

Bylines credited on this site's published entries, with their public details
only.

```json
{ "authors": [{ "slug": "dana-k", "display_name": "Dana K.", "bio": "Treasurer.",
                "avatar_url": null, "link_url": "https://example.org/dana" }] }
```

`/authors/{slug}` answers `{ "author": { … } }`, or `404`.

### `GET /redirects`: honour these on your server

```json
{
  "redirects": [
    { "source": "/old-issues", "destination": "/issues", "status_code": 301 },
    { "source": "/2022-slate", "destination": null, "status_code": 410 }
  ]
}
```

These are the organization's redirects for old addresses, and only the
enabled ones are returned. `status_code` is `301`, `302`, `307`, `308` or
`410`. To match BackGold's own behaviour on sites it hosts:

- **Apply them when a request would otherwise 404**, for `GET` and `HEAD`.
- **Match the path** with doubled slashes collapsed, no trailing slash, and
  each segment percent-encoded. A `source` is one of:
  - `/old`, which matches exactly that path;
  - `/old/[slug]`, which matches exactly one more segment and captures it as
    `[slug]`;
  - `/old/[...path]`, which matches one or more further segments and captures
    them as `[...path]`.
- **When several match,** exact sources win over `[slug]` patterns, and
  `[slug]` patterns win over `[...path]` patterns. Among sources of the same
  kind, the longest wins; between two of equal length, the one that sorts
  first wins.
- **Fill the destination** by replacing each `[slug]` / `[...path]` with what
  the source captured. Encode each captured segment, and keep the slashes
  between `[...path]` segments. Append the request's query string, then answer
  with the rule's `status_code` and a `Location` header.
- **A `410` rule has no destination.** Answer `410 Gone`.

Reading `/redirects` is how the organization's Overview knows you honour old
addresses (section 10).

### `GET /sitemap`

Every public address of the site, as absolute URLs on the site's domain: the
published pages, then an index for each routable type with published entries
(the built-in blog types share `/blog`), then each entry. At most 50,000
entries are listed.

```json
{
  "urls": [
    { "url": "https://example.org/", "kind": "page", "updated_at": "2026-10-01T09:12:00.000Z" },
    { "url": "https://example.org/blog", "kind": "type_index", "updated_at": "2026-09-29T12:05:00.000Z" },
    { "url": "https://example.org/blog/levy-explained", "kind": "entry", "updated_at": "2026-09-29T12:05:00.000Z" }
  ]
}
```

### `GET /preview/{token}`

Covered in section 7. It needs a secret key.

### Reading drafts: `?preview=1`

With a **secret** key, `?preview=1` reads drafts:

- `GET /pages/{slug}?preview=1` returns the page's current draft, and finds
  pages that are not published yet.
- `GET /entries/{type}?preview=1` and `GET /entries/{type}/{slug}?preview=1`
  include draft entries and show a published entry's pending edits. Each
  entry then carries `status` (`draft` or `published`).

A preview read is never cached (`Cache-Control: private, no-store`) and has no
ETag. Other endpoints accept `?preview=1` but answer with published content.
With a publishable key, `?preview=1` is `403 SECRET_KEY_REQUIRED`. Do not mix
cursors from preview lists with cursors from published lists.

## 5. Rendering guidance

**Map `type` to your own components.** The API gives you the content and its
order; how it looks is up to you. Here is what each type carries:

| Type | Kind | What you get |
| --- | --- | --- |
| `Hero` | Content | `copy`, `media`, `links`, and, when the hero has its sign-up form on, an `embed` of that form. The frame shows the form's own heading; place it below the hero's words. |
| `About`, `Cta`, `VideoEmbed`, `PdfEmbed` | Content | `copy`, `media`, `links` |
| `Issues` (`issues`), `StatCards` (`stats`), `QuoteStrip` (`quotes`), `Map` (`regions`), `MovementMap` (`movement_map`) | Content with a list | `copy`, `links`, and `data.source` as shown |
| `Progress` (`progress`), `Countdown` (`countdown`), `MovementTicker` (`movement`), `Collection` (`entries/<type>`), `ContentPost` (`entry`), `PlatformPlanks` (`platform`), `CandidateRoster` (`candidates`), `TeamGrid` (`team`) | Data | `copy.heading` and `data.items` |
| `EventsList` (`events`) | Data, with an embed | `data.items` (each row links to the event's own page, where the RSVP happens) **and** an `embed` of the events list, if you would rather place that |
| `Leaderboard`, `SocialFeed` | Data | `data.items` is always `[]`. Their live rows are not exposed. |
| `Blog` | Data | `data.items` is always `[]`. Read `GET /entries/post` instead. |
| `Donate`, `FormBlock`, `PollBlock`, `SignupCapture`, `Petition`, `Event`, `Store`, `Calendar` | Money and consent | `copy.heading` and an `embed` with an `iframe`. A `SignupCapture` also carries `copy.kicker` and `copy.lede` when the organization wrote them, and its frame repeats none of its words: show the kicker, the heading and the lede beside or above it. A success address set on the section is not followed inside the frame; its thanks message shows in place. |
| `Advocacy` | Money and consent | `copy.heading` and an `embed` with a `script` and `mount` and no iframe |
| `SocialFrame` | Money and consent | `copy.heading` only. It has nothing you can embed, so keep the section's place and heading and nothing else. |

**What each data row holds.** `data.items` rows by `data.source`, for the
blocks whose rows are worth rendering yourself:

| `source` | Each row | Notes |
| --- | --- | --- |
| `events` | `id`, `title`, `starts_at`, `ends_at`, `timezone`, `location`, `is_virtual`, `type`, `registration_closed`, `url` | As many rows as the block shows (its own limit, six by default). `timezone` is the event's IANA zone, or `null`: show `starts_at` in that zone, as BackGold's own list does. `type` is `rally`, `convention`, `fundraiser`, `blank` or `null`. When `registration_closed` is `true`, keep the row and its link but offer no RSVP. `copy.eventsEmptyCta` is the line to show when there are no rows. |
| `regions` | `region`, `status` (`lit` or `dark`), `url`, `is_new` | `url` is the region's link, or `null`. `is_new` marks a newly lit region. |
| `candidates` | `name`, `office`, `level`, `region`, `issues`, `status`, `donate_url`, `web_url`, `image_url` | `image_url` is the candidate's headshot, or `null`. `level`, `issues` and `donate_url` are always `null`, `[]` and `null` today. `copy.candidatesEmptyCta` is the line to show when there are no rows. |
| `platform` | `num`, `title`, `ethos`, `icon`, `planks` (`headline`, `plain`, `full`) | `num` is the number BackGold prints beside the section (its place, two digits, when the section has none of its own). `ethos` and `icon` are always `null` today. |
| `progress` | `raised_cents`, `goal_cents` | One row, or none at all when the block shows nothing (no goal and nothing raised yet). `goal_cents` is `null` when there is no goal: show the amount raised without a meter. |
| `entries/<type>` | `slug`, `title`, `summary`, `url`, `image_url`, `publish_at`, `terms`, `authors` | `links` carries the "see all" link to the type's index when there are more entries than the block shows, labelled with `copy.pluralLabel`. |

Data rows never carry contact details: keys that look like email, phone,
address, street or ZIP are removed, and so are `mailto:`, `tel:` and `sms:`
values. A money or consent section whose block names nothing to embed comes
with no `embed` at all: for example a donate block with no form chosen yet, a
form or poll placed from another page that has since been removed, or an
event block whose event is no longer public. A form or poll placed from
another page embeds the form or poll it was placed from.

**`band` and `bleed` are the ground and the geometry.** `band` is a role,
not a colour. BackGold's own renderer maps the roles like this:

| `band` | Ground |
| --- | --- |
| `plain` | the page background |
| `tint` | one step off the page background (a softer off-white on light themes, a lifted panel on dark) |
| `panel` | the card/surface colour |
| `wash` | the page background with a light tint of the brand accent |
| `contrast` | a dark brand ground. Text on it must switch to light ink. |

Map the five roles onto your own design's grounds. `bleed: full` runs edge to
edge, and `contained` sits inside the content width as a card. Where the organization picked neither, each type
has a default (for example a `Donate` section is `panel` / `full` and a
`Cta` is `contrast` / `contained`).

**Follow `surface` links exactly as given.** A link whose target `kind` is
`surface` points at a page BackGold serves on the organization's host:
donate, join, store, events, a petition, a form, and so on. Use its `url`
unchanged. Do not rewrite it onto your own domain, do not proxy it, and do not
build a page of your own for that path. The same goes for menu items and
reference fields whose `url` is on the organization's BackGold host.

**Place `embed` blocks; never rebuild them.** The `embed.iframe` URLs come
from these hosts (production shown):

| Module | `embed.iframe` | Min-height used by BackGold's own snippets | `allow` |
| --- | --- | --- | --- |
| Donate | `https://secure.backgold.com/embed/d/<form>` | 600px | `payment` |
| Petition | `https://secure.backgold.com/embed/p/<org>/<petition>` under the `none` and `image` headers; `https://api.backgold.com/embed/petition/<page>/<block>` under `map` and `coverage`, where the frame draws the section's own band (the live map and its data source, the asks, the goal note and the stat tiles, or the county coverage map) | 600px (the block frame reports its height) | `layout`, the look |
| MovementMap | `https://api.backgold.com/embed/movement-map/<page>/<block>`, sent as the section's `embed` when it names a data source: the live map a visitor zooms and explores, with the legend, the count badge and the stat tiles; draw the kicker and heading beside it | 44rem (reports its height) | `layout`, the look |
| Event (RSVP and tickets) | `https://secure.backgold.com/embed/e/<org>/<event>` | 640px | `payment` |
| Store | `https://secure.backgold.com/embed/s/<org>` | 640px | (none) |
| Events list | `https://api.backgold.com/embed/events/<org>` | 480px | (none) |
| Calendar | `https://api.backgold.com/embed/calendar/<org>` | (not set) | (none) |
| Form, Poll | `https://api.backgold.com/f/<page>/<block>` | (not set) | (none) |
| Sign-up (a `SignupCapture`, or a `Hero` with its form on) | `https://api.backgold.com/embed/signup/<page>/<block>` | (not set) | (none) |

`embed.script` is BackGold's embed loader (`https://secure.backgold.com/embed.js`).
**Loading it is not enough to size an iframe you placed yourself.** The loader
builds its own frames inside `data-backgold-*` container elements that are in
the page when the script runs. It does nothing to an `<iframe>` you render
from `embed.iframe`, and it does not notice containers added after it loaded.
The reliable pattern is to render the iframe and listen for the height
messages the frames send. That is exactly what the loader does for frames it
builds:

```html
<iframe
  data-bg-embed
  src="https://secure.backgold.com/embed/d/df_general"
  title="Donate"
  style="width:100%;border:none;min-height:600px"
  loading="lazy"
  allow="payment"
></iframe>

<script>
  // Once per page: resize each BackGold frame to the height it reports.
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'givegold:resize') return;
    for (const frame of document.querySelectorAll('iframe[data-bg-embed]')) {
      if (event.source === frame.contentWindow && event.origin === new URL(frame.src).origin) {
        frame.style.height = event.data.height + 'px';
      }
    }
  });
</script>
```

- Donate, event, store, events-list, calendar and form/poll frames report
  their height this way. The petition frame does not, so give it its
  min-height.
- Some frames address their height message to the origin they see as the
  referrer. Do not set `referrerpolicy="no-referrer"` on these frames (or a
  site-wide `Referrer-Policy: no-referrer`), or they cannot report their
  height.
- Send the petition frame your page's whole address as its referrer
  (`referrerpolicy="no-referrer-when-downgrade"` on the frame; a browser's
  default sends the origin alone across origins). The frame reads the link
  tag (`?src=`) off it, so a signature made through it counts for the link
  the signer arrived by; without it, signatures through the frame carry no
  tag. The share row after signing shares the page's own address either way.
- Keep `allow="payment"` on the donate and event frames. Checkout happens
  inside them.

**Advocacy** has no iframe. Render a container element carrying every
attribute in `embed.mount`, then load `embed.script` once:

```html
<div data-bg-advocacy data-org="example" data-set="contact-your-legislators"></div>
<script src="https://api.backgold.com/api/advocacy-pages/embed.js" async></script>
```

The script mounts every such container on the page when it loads. If your
site swaps pages without a full reload, call `window.BackGoldAdvocacy.mount()`
after the new container is in the page.

**Never restyle the money path.** You may style the section around an embed:
its heading, its band, its spacing, all in the site's brand tokens from
`GET /site`. Do not cover, crop, restyle or imitate what is inside the frame,
and do not collect donations, signatures, RSVPs or consent in your own forms.
Contribution limits, receipts and text-message consent depend on these
rendering from BackGold.

**Show `legal.disclaimer` on every page.** Both `GET /site` and every
`GET /pages/{slug}` response carry `legal: { disclaimer, required: true }`.
Render the disclaimer text on every page of the site, typically in the footer.
`disclaimer` can be `null` when the site has none.

BackGold checks for it. Once an hour it fetches the live home page
(`https://<domain>/`) and looks for the disclaimer text. The organization's
Overview then shows **Disclaimer found on live site**, or a warning asking the
organization to have its developer show the disclaimer. The warning never
blocks anything. How the check reads the page:

- It reads the **HTML your server sends**. Scripts, styles and tags are
  stripped first, so a disclaimer injected only by client-side JavaScript is
  not found. Render it on the server or in your static HTML.
- It reads the first 512 KiB of the page, waits up to 8 seconds, and follows
  up to 3 redirects. Anything other than a 2xx answer counts as "couldn't
  read".
- The comparison ignores case, collapses whitespace, decodes HTML entities,
  and treats curly quotes and dashes as their plain forms. The text must
  otherwise appear as written.

## 6. Caching

Every published read is versioned by the site's **content version**, a single
number per site.

| Header | Value |
| --- | --- |
| `ETag` | `"v<content_version>"`, for example `"v184"`. It is the same for every endpoint of the site at that version. |
| `X-Content-Version` | `184`. It is on every response for an authenticated site, errors included. |
| `Cache-Control` | `public, max-age=60, stale-while-revalidate=600` on published reads |
| `Vary` | `Authorization` |
| `Cache-Control` (preview) | `private, no-store`, with no ETag |

- **Conditional requests.** Send `If-None-Match` with the ETag you hold, and an
  unchanged site answers `304 Not Modified` with no body. A `W/` prefix is
  accepted. `If-None-Match: *` never matches.
- **The version changes whenever what the API serves changes.** That covers a
  page or section published or unpublished, a menu change, an entry published,
  edited while live, unpublished or trashed, a scheduled entry going live, a
  redirect change, and changes to authors, terms, content types, the brand or
  the site's name. BackGold's own edge cache is keyed by site and version, so
  a new version is served immediately. Your own HTTP caches (the browser, your
  CDN) may keep the previous answer for up to 60 seconds, plus the
  stale-while-revalidate window, if you let them.
- `GET /site` also returns the version in its body (`version`).

**Build-time sites** (static generation): fetch everything at build. Store the
`X-Content-Version` you built from, and rebuild when a webhook (section 8)
reports a higher `content_version`.

**Runtime sites** (server rendering): fetch per request, or keep the last
response with its ETag and revalidate with `If-None-Match`. A `304` costs no
body. For example:

```js
const BASE = 'https://api.backgold.com/api/content/v1';
const memo = new Map(); // path -> { etag, body }

export async function bg(path, key = process.env.BG_SITE_KEY) {
  const held = memo.get(path);
  const res = await fetch(BASE + path, {
    headers: {
      Authorization: `Bearer ${key}`,
      ...(held ? { 'If-None-Match': held.etag } : {}),
    },
  });
  if (res.status === 304 && held) return held.body;
  if (!res.ok) throw Object.assign(new Error(`Content API ${res.status}`), { status: res.status, body: await res.json() });
  const body = await res.json();
  memo.set(path, { etag: res.headers.get('ETag'), body });
  return body;
}
```

The [TypeScript client](#12-the-typescript-client) (section 12) does this for you.

## 7. Preview

"Preview on your site" lets the organization see a draft page drawn by your
frontend before publishing it.

**1. You build a preview route** on your site, for example
`https://example.org/api/bg-preview`, and the organization enters it on the
Developer page as **Preview address on the partner's site**. It must start
with `https://`, carry no username or password, and be a public address.

**2. BackGold sends editors to it.** In the page editor, **Preview on your
site** opens:

```
<preview address>?bg_preview=<token>&path=<the page's path, URL-encoded>
```

If your preview address already has a query string, the parameters are
appended with `&`. `path` is `/` for the home page or `/<slug>` for any other.
The token names one draft page of this site and **expires one hour** after it
is minted.

**3. Your route verifies the token on the server, with a secret key:**

```bash
curl -s "https://api.backgold.com/api/content/v1/preview/$TOKEN" \
  -H "Authorization: Bearer $BG_SITE_SECRET_KEY"
```

- `200` with a page response (the same shape as `GET /pages/{slug}`, built
  from the page's current draft). A token naming an entry would answer with an
  entry response (the shape of `GET /entries/{type}/{slug}`), but the links
  BackGold sends today always name pages.
- `400 BAD_PREVIEW_TOKEN` means the token is malformed, tampered with or
  expired.
- `403 SECRET_KEY_REQUIRED` means you used the publishable key.
- `404 NOT_FOUND` means the token names a different site, or a page that no
  longer exists.

Then render that response with your normal page components. A preview answer
is `private, no-store`, so do not cache it, and do not let your CDN cache the
preview route.

**Keep the secret key on the server.** Make the preview call from your server
code (a server route, server component or edge function) and send the browser
only the rendered result. The preview route is the one place a partner site
needs a secret key.

A minimal preview route (Node, framework-neutral):

```js
// GET /api/bg-preview?bg_preview=…&path=/…
export async function handlePreview(req, res) {
  const url = new URL(req.url, 'https://example.org');
  const token = url.searchParams.get('bg_preview');
  if (!token) return res.writeHead(400).end('Missing bg_preview');

  const api = await fetch(
    `https://api.backgold.com/api/content/v1/preview/${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${process.env.BG_SITE_SECRET_KEY}` } },
  );
  if (!api.ok) return res.writeHead(api.status === 400 ? 410 : 404).end('Preview unavailable');

  const draft = await api.json(); // { page, sections, legal }
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'private, no-store' });
  res.end(renderPage(draft)); // your renderer
}
```

**4. "Send a test preview."** On the Developer page, **Send a test preview**
calls your preview address once:

```
GET <preview address>?bg_preview=<token>&path=/
```

The token names the site's home page (or its first published page), and
`path` is that page's path on your site (`/` for the home page). BackGold waits up to 8 seconds, follows up
to 3 redirects, records only the HTTP status, and never reads the body. The
Developer page then shows **Answered 200 · <time>** (green for any 2xx) or
**Couldn't reach it**. **Your route must answer the test with a 2xx.** The
editor's **Preview on your site** button stays hidden until the preview
address has passed a test, and changing the address clears the last result.

## 8. Webhooks

Webhooks tell your build when content changes, so a static site can rebuild
or a server-rendered site can purge its cache.

**Setup** (on the Developer page, step 4, **Turn on the webhook**):

- The organization enters an **Endpoint address** (`https://`, public). This
  creates the site's content-webhook endpoint. The response
  shows its **signing secret once** ("Copy this signing secret now. You won't
  see it again."). It starts with `whsec_`, so give it to your build.
- **Every event is off until the organization turns it on.** There are five
  toggles. Nothing is sent by default.
- **Change endpoint** moves the same endpoint, with the same secret, to a new
  address.
- **New signing secret**, beside Change endpoint, makes a new secret for the
  endpoint and shows it once, the same way. The old secret stops working at
  once, so deliveries are refused until the new one is on your build. Use it
  when the first one is lost; the old secret cannot be shown again.
- Each site has its own endpoint and hears only its own content events. Two
  sites of one organization, each on its own Worker, each add their own
  endpoint on their own Developer page. Every payload still carries
  `data.site_domain_id` (the same value as `site.id` from `GET /site`).

**The five events:**

| Event | Toggle label | Sent when |
| --- | --- | --- |
| `site.published` | Site published | A page of the site is published or unpublished. Also sent once when an import into the site finishes. |
| `content.published` | Content published | An entry is published, edited while published, or imported as published, or a scheduled entry goes live. It is sent once per site the entry appears on. |
| `content.unpublished` | Content unpublished | A published entry goes back to draft, is unpublished, or is trashed. It is sent once per site the entry appeared on. |
| `menu.updated` | Menu updated | The organization saves the site's menus, or adds, removes or hides a page in the site's navigation. |
| `redirects.updated` | Redirects updated | A redirect of the site is added, changed or removed. |

Pages are announced by `site.published`; the `content.*` events are for
entries only. Each event is sent after the change has bumped the site's
content version. A scheduled entry is announced by a sweep that runs every
five minutes, so its `content.published` can arrive up to about five minutes
after its publish time.

Some changes bump the content version but send **no** event: edits to a
synced site section, authors, terms, content types, the brand or the site's
name, and menu changes that happen as a side effect elsewhere (a new page
added to the header when it is created, a menu label following a page
rename). The backstop check described below catches these.

**The delivery** is a `POST` with a JSON body:

```http
POST /hooks/backgold HTTP/1.1
Content-Type: application/json
X-BackGold-Event: content.published
X-BackGold-Delivery: 3b0e9c41d2…
X-BackGold-Signature: t=1759400000,v1=5f2c…e9

{
  "id": "a7f3c2e91b…",
  "type": "content.published",
  "created_at": "2026-10-02T14:13:20.000Z",
  "data": {
    "site_domain_id": "cd_8f2a",
    "content_version": 185,
    "content_item_id": "ci_7d1"
  }
}
```

`data` carries ids and the version only, never a title, body or person:

| Field | On |
| --- | --- |
| `site_domain_id`, `content_version` | Every event |
| `page_id` | `site.published` for a page publish or unpublish |
| `content_item_id` | `content.published`, `content.unpublished` |
| `menu_key` | `menu.updated`, set to `"primary"` only when just the primary menu changed. It is absent when any or all menus changed. |

To get the content, read the Content API.

**Verify the signature.** `X-BackGold-Signature` is `t=<unix seconds>,v1=<hex>`.
`v1` is the HMAC-SHA256, in lowercase hex, of `` `${t}.${rawBody}` ``, keyed
with the **whole signing secret** (including `whsec_`) as UTF-8 bytes.
Compute it over the raw request body exactly as received, before any JSON
parsing. Reject the delivery if `t` is more than **5 minutes** old, which is
the same tolerance BackGold's own verifier uses.

```js
import crypto from 'node:crypto';

export function verifyBackGold(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(
    String(header).split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const t = Number.parseInt(parts.t, 10);
  if (!parts.v1 || !Number.isFinite(t)) return false;
  if (Math.floor(Date.now() / 1000) - t > toleranceSec) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(parts.v1, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

**Answer quickly with a 2xx.** Any 2xx counts as delivered. Do the rebuild or
purge after you respond.

**Retries: there are none today.** Each event is delivered **once**. If your
endpoint answers with anything other than a 2xx, or cannot be reached, that
delivery is recorded as failed and **is not sent again**. After **10
consecutive failed deliveries** the endpoint is switched off, and nothing more
is sent. The Developer page then shows no endpoint, and the organization has
to add the address again. That creates a new endpoint with a **new signing
secret**, with every event off until turned back on. A successful delivery
resets the failure count. Because a delivery can be missed, do not rely on
webhooks alone:

- compare `content_version` in each event with the version you last built or
  cached. If an event shows a jump of more than one, or you suspect a missed
  event, refetch;
- and keep a periodic check (for example, `GET /site` with `If-None-Match`
  every few minutes) as a backstop. It costs a `304` when nothing changed.

**Recommended pattern: rebuild or purge on event.**

1. Verify the signature, then answer `204` straight away.
2. If `data.content_version` is not higher than the version you hold, ignore
   it.
3. Otherwise trigger your rebuild (static) or purge the affected paths
   (runtime). `site.published` and `menu.updated` usually mean the whole site.
   `content.*` mean that entry's page, its type's index and any page listing
   entries. `redirects.updated` means your redirect table: re-read
   `GET /redirects`.

The [TypeScript client](#12-the-typescript-client) (section 12) does this for you.

## 9. Errors and limits

| Status | `code` | Meaning |
| --- | --- | --- |
| `304` | (none) | Not modified. Your `If-None-Match` matches the current version. |
| `400` | `BAD_LIMIT` | `limit` is not a whole number from 1 to 50. |
| `400` | `BAD_CURSOR` | `cursor` is not one this API returned. |
| `400` | `BAD_PREVIEW_TOKEN` | The preview token is malformed, tampered with or expired. |
| `401` | `INVALID_KEY` | The key is missing, unknown, revoked or not a site key. |
| `403` | `SECRET_KEY_REQUIRED` | A preview or draft read made with a publishable key. |
| `404` | `NOT_FOUND` | An unknown path, page, menu key, section, type, entry, taxonomy or author; a preview token for another site; or a site or organization the API no longer serves. |

| Limit | Value |
| --- | --- |
| `GET /entries/{type}` page size | 1–50, default 20 |
| Publishable keys per site | 1, which cannot be revoked from the Developer page |
| Secret keys per site | 10 live at once. A secret key's name is up to 80 characters. |
| Preview link lifetime | 1 hour |
| "Send a test preview" | 8 s timeout, up to 3 redirects, needs a 2xx |
| Webhook signature tolerance | 5 minutes |
| Webhook delivery | One attempt per event. The endpoint is switched off after 10 consecutive failures. |
| Content webhook endpoints | 1 per organization |
| Sitemap | Up to 50,000 entries |
| Disclaimer check | Hourly, home page only, first 512 KiB, 8 s, up to 3 redirects |
| Rate limit | None |

## 10. Checklist before you go live

The organization's site **Overview** shows these rows for a site built
elsewhere. Get every one to green:

- [ ] **Partner site connected.** Your site has read content with the site's
      key. The row shows when it last did.
- [ ] **Home page published.** The organization has published a home page,
      and `GET /pages/home` answers.
- [ ] **Disclaimer found on live site.** `legal.disclaimer` is in the
      server-sent HTML of `https://<domain>/` and of every other page.
      Checked hourly.
- [ ] **Old addresses honoured.** Your server reads `GET /redirects` and
      applies the rules on a would-be 404, including `410 Gone`.
- [ ] **Donations and sign-ups render from BackGold.** Every `embed` is placed
      as given, `surface` links go to BackGold unchanged, and nothing in your
      code collects money or consent.

And on your side:

- [ ] The publishable key is the only key in browser code. The secret key
      lives only on the server that answers previews.
- [ ] **Send a test preview** shows a green **Answered 2xx**, and **Preview on
      your site** from the editor opens the right page.
- [ ] Your webhook endpoint verifies `X-BackGold-Signature`, answers 2xx
      quickly, and you have a version check as a backstop for missed
      deliveries.
- [ ] You send `If-None-Match` and handle `304`.
- [ ] Your sitemap comes from `GET /sitemap`, and `site.seo` / `page.meta` fill
      your `<title>` and description tags.

## 11. Use the content from an AI assistant (MCP)

The same site key also opens a read-only
[Model Context Protocol](https://modelcontextprotocol.io) server. An AI
assistant can use it to read the site's pages, menus, entries and redirects
while you build, for example "list the menus and draft the header component".

```
Endpoint:  POST https://api.backgold.com/mcp
Header:    Authorization: Bearer bg_site_pk_…   (or bg_site_sk_…)
```

- **Transport.** It uses Streamable HTTP and is stateless. Every request
  stands alone, and there is no session to open or resume.
- **Authentication.** It uses the same site key as the Content API, in the
  same header. A missing, unknown or revoked key is `401 INVALID_KEY`, and a
  key whose site or organization the API no longer serves is `404 NOT_FOUND`.
  Both come back as plain JSON errors before any MCP exchange.
- **It is for desktop and server MCP clients, not web pages.** `GET /mcp`
  answers `405`, and a request carrying a browser `Origin` header is refused
  with `403`. No CORS access is granted.

**Tools.** A key gets one tool for each published read of this guide. Each
tool is a `GET` of the endpoint it is named after, made with your key. Its
result is that endpoint's JSON exactly as it comes back, so the response shapes
in section 4 are the tool results:

| Tool | Reads | Inputs |
| --- | --- | --- |
| `content_site` | `GET /site` | (none) |
| `content_menu` | `GET /menus/{key}` | `key`: `primary`, `footer` or `utility` |
| `content_pages` | `GET /pages` | (none) |
| `content_page` | `GET /pages/{slug}` | `slug` |
| `content_section` | `GET /sections/{key}` | `key` |
| `content_types` | `GET /types` | (none) |
| `content_entries` | `GET /entries/{type}` | `type`; optional `term`, `cursor`, `limit` (1–50, default 20) |
| `content_entry` | `GET /entries/{type}/{slug}` | `type`, `slug` |
| `content_terms` | `GET /terms/{taxonomy}` | `taxonomy` |
| `content_authors` | `GET /authors` | (none) |
| `content_author` | `GET /authors/{slug}` | `slug` |
| `content_redirects` | `GET /redirects` | (none) |
| `content_sitemap` | `GET /sitemap` | (none) |

- A **publishable** key gets these thirteen tools, which read published
  content only.
- A **secret** key gets the same thirteen. `content_page`, `content_entries`
  and `content_entry` also take `preview: true`, which reads the draft as
  `?preview=1` does (section 4). The preview-link read, `GET /preview/{token}`,
  is not a tool.
- Inputs are checked strictly. An input a read does not take, or a value
  outside its bounds, is refused.
- When the endpoint refuses (for example `404 NOT_FOUND` or
  `400 BAD_CURSOR`), the tool returns an error result carrying the same
  `{ error, code }` body.

**Resource.** `backgold://openapi` holds the Content API's OpenAPI document,
the same reference as `/openapi.json`.

**Read-only by construction.** Every tool sends a `GET`. There is no tool that
creates, changes or publishes anything.

**Client setup.** MCP clients differ in where this configuration lives and in
how they spell a remote server with headers, so check your client's
documentation (Claude Desktop, Cursor and others). The common `mcpServers`
shape is:

```json
{
  "mcpServers": {
    "backgold-site": {
      "url": "https://api.backgold.com/mcp",
      "headers": {
        "Authorization": "Bearer bg_site_pk_…"
      }
    }
  }
}
```

> **Keep the secret key on a machine you control.** A secret key reads
> drafts, so put it only in a client on your own computer or server, never in
> a shared or hosted configuration.
> A publishable key in a client only ever reads what the public site already
> shows.

**Without a key: sign in.** A person on the organization's team can connect
the same endpoint by signing in to BackGold instead of pasting a key. Add
`https://api.backgold.com/mcp` with no `Authorization` header; the client
opens BackGold's sign-in page, and they pick which organizations to share.
The thirteen tools then each take two more inputs: `org` (the organization's
slug or id) and `site` (the site's domain or id). The `orgs_list` tool names
both. A sign-in reads what a secret key reads, drafts included (`preview`
on the page and entry tools), and only where the person's role includes the
organization's sites and content. It needs no headless CMS: anyone on the
team who works on the sites in BackGold can read them this way.

A sign-in is also offered tools beyond site content: the organization's
fundraising, people, outreach, events and leadership, as that person's role
allows, and, when they allow updates on the sign-in page, tools that add
records and save drafts. The client's tool list names them. None of them
sends, publishes, refunds or deletes. A site key gets only the thirteen
content tools above.

## 12. The TypeScript client

`@backgold/content` is the Content API as a typed TypeScript library. It
sends the key, keeps each answer under the site's content version, revalidates
with `If-None-Match`, verifies webhooks and reads preview links, so a few
calls replace the code sections 6 to 8 ask you to write. It has no
dependencies and runs on Node 20 or later, Cloudflare Workers, and any
runtime with `fetch` and Web Crypto. Every answer has the shape of section 4.
For a complete Astro site built on it, see
[the public starter](../templates/astro-starter/README.md)
([gitlab.com/backgold/backgold-starter](https://gitlab.com/backgold/backgold-starter)),
and for every option and method in full, the client's
[README](../packages/content-client/README.md).

```bash
npm install @backgold/content
```

```ts
import { createClient } from '@backgold/content'

const bg = createClient({ key: process.env.BG_SITE_KEY! }) // the publishable key
const { site, legal } = await bg.site()
const home = await bg.page('home') // null until the home page is published
```

`createClient` also takes `apiOrigin` (default `https://api.backgold.com`),
`cache`, `maxVersionAgeSeconds`, `cacheTtlSeconds` and `fetch`. In place of
`key` it takes `firstParty: { siteId }`, which only a Worker inside
BackGold's own dispatch namespace can use, through BackGold's service
binding; a site built elsewhere always uses a key.

**What each method returns.** Each method reads one endpoint and answers its
JSON unchanged (`{ page, sections, legal }`, `{ entries,
next_cursor }`, and so on). A read of something you name (a page, a menu, a
type's entries) answers `null` when the API says `404`, so a missing page
becomes your own 404 rather than a crash. The reads that always exist for a
site (`site`, `pages`, `types`, `events`, `authors`, `redirects`, `sitemap`,
`areas`) throw on a `404`. Any other error throws a `BackgoldApiError` carrying `status`, `code`
(the API's `code`, such as `BAD_CURSOR`) and `message`.

| Method | Reads | On `404` |
| --- | --- | --- |
| `site()` | `GET /site` | throws |
| `menu(key)` | `GET /menus/{key}` | `null` |
| `pages()` | `GET /pages` | throws |
| `page(slug, { preview? })` | `GET /pages/{slug}` | `null` |
| `section(key)` | `GET /sections/{key}` | `null` |
| `types()` | `GET /types` | throws |
| `entries(type, { term?, q?, limit?, cursor?, preview? })` | `GET /entries/{type}`, one page; `q` searches titles and summaries (2 to 80 characters, one page of at most 20) | `null` |
| `allEntries(type, { term?, limit?, preview? })` | `GET /entries/{type}`, every page, as an async iterator of entries | yields nothing |
| `entry(type, slug, { preview? })` | `GET /entries/{type}/{slug}` | `null` |
| `events({ type?, cursor?, limit? })` | `GET /events`, the upcoming public events, one page | throws |
| `terms(taxonomy)` | `GET /terms/{taxonomy}` | `null` |
| `authors()` | `GET /authors` | throws |
| `author(slug)` | `GET /authors/{slug}` | `null` |
| `redirects()` | `GET /redirects` | throws |
| `sitemap()` | `GET /sitemap` | throws |
| `areas({ holds })` | `GET /areas?holds=…`, the areas for a route with no BackGold page behind it | throws |
| `preview(token)` | `GET /preview/{token}` (a secret key) | `null` |
| `raw(path, query?, { preview? })` | any other `GET` under the base URL | `null` |

`preview: true` reads drafts as `?preview=1` does (section 4), and needs a
secret key.

### Caching and versions

Every read is stored under a key built from a hash of your site key, the
site's content version, the path and the sorted query: the API's own rule, so
a new version is a miss by construction and an old answer is never served
under it. The client learns the version from the `X-Content-Version` header
on every answer. A read whose version is known and whose answer is stored
makes no request at all, as long as the version is still trusted
(`maxVersionAgeSeconds`, below). Otherwise the client sends `If-None-Match`,
and a `304` keeps the stored copy.

Pick a store with `cache`. The site key itself never appears in a store key.

| Store | Use it for |
| --- | --- |
| `memoryCache()` | The default. One process: a Node server, or a single build. Gone on restart. |
| `cacheApiStore()` | Cloudflare Workers. The Workers Cache API, shared by the requests a data center serves. |
| `kvStore(env.BACKGOLD_CACHE)` | Cloudflare Workers with a KV namespace. Shared by every location and kept across deploys. |
| `fsCache('.backgold')` | A Node build step. Import it from `@backgold/content/fs`. The folder survives between builds, so a rebuild where nothing changed reads from disk. |

```ts
import { createClient, kvStore } from '@backgold/content'

const bg = createClient({ key: env.BG_SITE_KEY, cache: kvStore(env.BACKGOLD_CACHE) })
```

- **`maxVersionAgeSeconds`** (default `60`) is how long the client trusts a
  version before it re-checks `GET /site` with `If-None-Match`. That check is
  one `304` when nothing changed. A site with no webhook is at most a minute
  behind. `0` re-checks before every read.
- **`setVersion(n)`** trusts version `n` from now on and saves it in the
  store. It is what your webhook handler calls (below), so the next read
  fetches the new content at once. It never goes backwards: a version lower
  than the one the client or the store already knows is ignored, so webhooks
  that arrive out of order cannot roll the site back.
- **`bust()`** forgets the version, so the next read learns it again from the
  API. **`version()`** is the version the client trusts now, or `null` before
  the first read.
- **`cacheTtlSeconds`** (default `3600`) is how long a stored answer may live
  under its version.

The store is where the version lives too. With `memoryCache()` only the
process that received the webhook learns the new version. With `kvStore()`
every Worker does. The others catch up within `maxVersionAgeSeconds`.

### The preview route

`previewFromRequest` reads `bg_preview` and `path` off the link BackGold
sends (section 7). Make the client for this route with a secret key from a
server secret, never from browser code. The client never stores a preview
answer.

```ts
import { createClient, previewFromRequest } from '@backgold/content'

export async function onPreview(request: Request, env: { BG_SITE_SECRET_KEY: string }) {
  const link = previewFromRequest(request.url)
  if (!link) return new Response('Missing bg_preview', { status: 400 })
  const bg = createClient({ key: env.BG_SITE_SECRET_KEY })
  const draft = await bg.preview(link.token).catch(() => null) // throws BAD_PREVIEW_TOKEN when expired
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
  if (!draft) return new Response('Preview unavailable', { status: 404, headers })
  return new Response(renderPreview(draft, link.path), { headers: { ...headers, 'Content-Type': 'text/html' } })
}
```

`draft` is a page response (`'page' in draft`) or an entry response. Render
it with your normal components. `link.path` is the page's path on your site,
`/` when the link had none.

### The webhook handler

`verifyBackgoldWebhook` checks `X-BackGold-Signature` exactly as section 8
describes (HMAC-SHA256 over `<t>.<raw body>`, compared in constant time, 5
minutes either way). `parseContentEvent` answers the event when the body is
one of the five content events, or `null`. Neither ever throws.

```ts
import { parseContentEvent, verifyBackgoldWebhook } from '@backgold/content'

export async function onWebhook(request: Request, env: { BG_WEBHOOK_SECRET: string; BG_SITE_ID: string }, ctx: ExecutionContext) {
  const rawBody = await request.text() // the raw body: never parse and re-serialize it first
  const signature = request.headers.get('X-BackGold-Signature')
  if (!(await verifyBackgoldWebhook({ rawBody, signature, secret: env.BG_WEBHOOK_SECRET }))) {
    return new Response('Bad signature', { status: 401 })
  }
  const event = parseContentEvent(rawBody)
  // One endpoint serves every site of the organization: act only on this site's events.
  if (event && event.data.site_domain_id === env.BG_SITE_ID) ctx.waitUntil(bg.setVersion(event.data.content_version)) // after the 204 has gone; an older version is ignored
  return new Response(null, { status: 204 })
}
```

Answer the `2xx` first and do the work after, as section 8 asks. In Workers
that is `ctx.waitUntil`. On Node, respond and then call `setVersion`. `bg`
is the same client your pages read with, on a shared store. A static site
triggers its rebuild here instead.

### Typed fields

`entry(type, slug)` returns `fields` as a loose record until the client knows
the type's fields. The eight built-in types (`post`, `podcast`, `video`,
`plank`, `team_member`, `open_role`, `newsletter`, `course`) are typed already. For the
organization's own types, the `backgold-content` command reads `GET /types`
and writes a TypeScript file:

```bash
BACKGOLD_SITE_KEY=bg_site_pk_… npx backgold-content types --out src/backgold-types.ts
```

```
Usage: backgold-content types --out <file> [--key <site key>] [--api-origin <origin>] [--module <name>] [--generated-at <YYYY-MM-DD>]

Writes TypeScript types for your site's content types, read from
GET /api/content/v1/types, so entry(type, slug) returns typed fields.

  --out <file>                The .ts file to write (its folder is created)
  --key <site key>            bg_site_pk_... or bg_site_sk_... (default: $BACKGOLD_SITE_KEY;
                              prefer the variable: argv is visible to other processes)
  --api-origin <origin>       Default https://api.backgold.com; a path is kept
  --module <name>             The module the file augments (default: @backgold/content)
  --generated-at <YYYY-MM-DD> The date in the header (default: today); the same types
                              and the same date give the same bytes
```

Put the file anywhere your `tsconfig.json` includes; nothing imports it.
Each field is typed by its kind (section 4): a `choice` is the union of its
choices, and a field that is not required can be `null`.

```ts
const member = await bg.entry('team_member', 'dana-k')
if (member) {
  const group = member.entry.fields.group // 'Leadership' | 'Staff'
}
```

Run the command again whenever the organization changes a content type.

### What the client never does

- **It never writes but for a signed-in visitor.** Every request is a `GET`
  except a visitor's lesson progress, sign-in code exchange and sign-out.
- **It sends your key only to `apiOrigin`.** No other host ever sees it, and
  the client sends nothing anywhere else. A key that is not shaped like one
  BackGold mints is refused before any request, and no error message repeats
  a key.
- **It never stores a preview or a visitor's read.** Draft reads,
  `preview(token)` and every call made with a visitor's token go to the API
  every time and never reach the cache.
- **A secret key refuses to run in a browser.** `createClient` with a
  `bg_site_sk_` key throws a `SecretKeyInBrowserError` in a browser page or a
  browser worker. Cloudflare Workers are servers and may hold one. Give browser code the publishable key.

### Visitors: letting people sign in on your site

An organization can keep entries and lessons for people it knows: an entry's
`access` is `signed_in`, `members` or `tag` (a tag the person carries), and a
course's lessons follow the course. Read without a visitor, such an entry is
its teaser: `locked: true`, `lock` saying why (`reason`, `tag_label`,
`org_name`: the door to draw), the body empty, `fields` empty and no
`media_url`. A visitor signs in with their email through BackGold's giving
portal, which hands the sign-in back to your site; your server then reads for
them with their **visitor token**, and their locks open.

Everything below runs on your server. The token, the hand-off code and the
secret key never reach page script, and a page drawn for a visitor is theirs
alone: never cache it. The examples are plain `Request` → `Response`
handlers (a Cloudflare Worker, or any framework that hands you a `Request`);
[the public starter](../templates/astro-starter/README.md#visitors-signing-in)
has the same four routes as Astro endpoints under `src/pages/auth/`.

**1. The sign-in link.** Send the visitor to the portal's door for your
site:

```
https://giving.backgold.com/site-signin?site=<site id>&return=<https://your-domain/auth/visitor?to=/courses/foundations>&title=<lesson title>
```

- `site` is your site's id: `site.id` from `GET /site` (`(await
  bg.site()).site.id`), the `cd_…` id the Developer page names.
- `return` is where the portal sends the visitor back: an absolute `https://`
  address whose host is the site's address in BackGold: its connected
  domain, or, while it has none, the host of the preview address on its
  Developer page. The exact host (`www.example.org` and `example.org` are two
  hosts). Its path and query are yours. It carries no user name or password,
  no fragment and no port. The portal refuses any other address, and answers
  `404` for an organization without the headless CMS.
- `title` (optional, plain text) is what the door names: "Sign in to watch
  Lesson 2: The levy line".
- The portal is `https://giving.backgold.com` for `api.backgold.com`;
  BackGold's staging api, on `backgold.dev`, has its portal at
  `https://giving.backgold.dev`.

```ts
// auth.ts
const PORTAL = 'https://giving.backgold.com'
const SITE_URL = 'https://www.example.org' // the site's address in BackGold: its connected domain, else its preview address's host

export function signInUrl(siteId: string, to: string, title?: string): string {
  const back = new URL('/auth/visitor', SITE_URL)
  back.searchParams.set('to', to)
  const door = new URLSearchParams({ site: siteId, return: back.href })
  if (title) door.set('title', title)
  return `${PORTAL}/site-signin?${door}`
}
```

**2. The way back: redeem the code with the secret key.** Once the visitor
has signed in, the portal sends their browser to your `return` address with
`code=<code>` added to its query. The code is good for one minute and once.
Redeem it from your server with a client on the site's **secret key**
(`exchangeVisitor(code)`, `POST /visitor/exchange`); the api answers
`{ token, expires_at, visitor }`. Keep the token in your own cookie:
`HttpOnly` (page script never sees it), `Secure`, `SameSite=Lax`, `Path=/`.
The token is good for an hour, and the api renews it while the visitor's
portal session stands, for up to thirty days, so give the cookie thirty days.

```ts
// auth.ts, continued
import { BackgoldApiError, VISITOR_COOKIE, createClient } from '@backgold/content'

interface Env {
  BACKGOLD_SECRET_KEY: string // bg_site_sk_…, a server secret
}

const THIRTY_DAYS = 30 * 24 * 60 * 60

export function visitorCookie(token: string): string {
  return `${VISITOR_COOKIE}=${token}; Path=/; Max-Age=${THIRTY_DAYS}; HttpOnly; Secure; SameSite=Lax`
}

/** A path on this site to go on to; `/` for anything else, so the link can never send anyone off the site. */
export function localPath(raw: string | null): string {
  return raw !== null && /^\/(?![/\\])/.test(raw) && !/[\u0000- \\]/.test(raw) ? raw : '/'
}

// GET /auth/visitor?code=<code>&to=<path>
export async function onVisitorReturn(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const to = localPath(url.searchParams.get('to'))
  const server = createClient({ key: env.BACKGOLD_SECRET_KEY })
  try {
    const { token } = await server.exchangeVisitor(url.searchParams.get('code') ?? '')
    return new Response(null, {
      status: 302,
      // The code is in this address: no page it leads to is told it.
      headers: { Location: to, 'Set-Cookie': visitorCookie(token), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    })
  } catch (error) {
    if (!(error instanceof BackgoldApiError) && !(error instanceof TypeError)) throw error
    return new Response('That sign-in link has expired. Sign in again.', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
}
```

Only a secret key (or a BackGold template's own Worker) redeems a code. The
api answers `403 SECRET_KEY_REQUIRED` to a publishable key (and the client
throws it before any request), `403 SERVER_ONLY` to a request that carries
a browser's `Origin`, `Sec-Fetch-Site` or `Sec-Fetch-Dest` header (headers only a browser sends; `Sec-Fetch-Mode` alone, which Node's `fetch` adds, passes), and `400 INVALID_CODE` to a code
that is unknown, used, expired, or minted for another site.

**3. Read for the visitor.** Pass the token to the reads you make for that
person: `entry`, `entries`, `page`, `courses`, `course`, `lesson` and `raw`
take `{ visitor, onVisitorRenew }`. Any of the site's keys reads this way.
Such a read sends `X-BackGold-Visitor`, is answered for that person with
`Cache-Control: private, no-store`, and never reads or writes the client's
store. When the api renews the token, `onVisitorRenew` has the fresh one:
write it back to the cookie. `visitor(token)` (`GET /visitor`) says who the
token is, `{ visitor: { first_name, email, member } }`, or `{ visitor: null }`
once the api no longer takes it (clear the cookie then).

```ts
// visitor-reads.ts
import { VISITOR_COOKIE, type BackgoldContent, type VisitorOptions } from '@backgold/content'
import { visitorCookie } from './auth'

/** The visitor's token from the request's cookie. */
export function tokenFrom(request: Request): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === VISITOR_COOKIE && value.length > 0) return value.join('=')
  }
  return null
}

/** The options for a read made for the request's visitor, and the Set-Cookie to send when the api renewed the token. */
export function visitorReads(request: Request): { reads: VisitorOptions | undefined; setCookie: () => string | null } {
  const token = tokenFrom(request)
  let renewed: string | undefined
  const reads = token ? { visitor: token, onVisitorRenew: (fresh: string) => void (renewed = fresh) } : undefined
  return { reads, setCookie: () => (renewed === undefined ? null : visitorCookie(renewed)) }
}

// GET /courses/:course/:lesson, with `bg` the client your pages read with.
export async function onLesson(request: Request, bg: BackgoldContent, course: string, lesson: string): Promise<Response> {
  const { reads, setCookie } = visitorReads(request)
  const read = await bg.lesson(course, lesson, reads)
  if (!read) return new Response('Not found', { status: 404 })
  const { title, locked, lock, body } = read.lesson
  const html = locked
    ? `<h1>${escapeHtml(title)}</h1><p>${lock?.reason === 'signed_in' ? 'Sign in with your email to watch.' : `For members of ${escapeHtml(lock?.org_name ?? '')}.`}</p>`
    : `<h1>${escapeHtml(title)}</h1>${renderMarkdown(body.markdown)}`
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' })
  // A visitor's page is theirs alone; the anonymous one is the cacheable one.
  headers.set('Cache-Control', reads ? 'private, no-store' : 'public, max-age=60')
  const cookie = setCookie()
  if (cookie) headers.append('Set-Cookie', cookie)
  return new Response(html, { headers })
}
```

`escapeHtml` and `renderMarkdown` are your own (section 5 on rendering the body). A visitor's header is not one
the api's CORS lets a browser send, so these reads are server-side reads too.

**4. Save progress from the server.** A lesson page posts to your own
server, which forwards with the token (`lessonProgress`, `POST
/courses/{course}/{lesson}/progress` with `{ completed?, position_seconds? }`).
Take the post from your own pages only.

```ts
// progress.ts
import { BackgoldApiError, createClient } from '@backgold/content'
import { visitorCookie } from './auth'
import { tokenFrom } from './visitor-reads'

// POST /auth/progress {course, lesson, completed?, position_seconds?}
export async function onProgress(request: Request, env: { BACKGOLD_SECRET_KEY: string }): Promise<Response> {
  const site = request.headers.get('Sec-Fetch-Site')
  const ownPage = site !== null ? site === 'same-origin' : request.headers.get('Origin') === new URL(request.url).origin
  if (!ownPage) return Response.json({ error: 'From this site only', code: 'CROSS_ORIGIN' }, { status: 403 })
  const token = tokenFrom(request)
  if (!token) return Response.json({ error: 'Sign in to save your place.', code: 'VISITOR_REQUIRED' }, { status: 401 })
  const { course, lesson, completed, position_seconds } = (await request.json()) as {
    course: string
    lesson: string
    completed?: boolean
    position_seconds?: number
  }
  const server = createClient({ key: env.BACKGOLD_SECRET_KEY })
  let renewed: string | undefined
  try {
    const saved = await server.lessonProgress(course, lesson, { completed, position_seconds }, token, {
      onVisitorRenew: (fresh) => void (renewed = fresh),
    })
    const headers = new Headers({ 'Cache-Control': 'no-store' })
    if (renewed !== undefined) headers.append('Set-Cookie', visitorCookie(renewed))
    return Response.json(saved, { headers }) // { progress, course }: where the visitor now stands
  } catch (error) {
    if (error instanceof BackgoldApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status })
    throw error
  }
}
```

**5. Sign out: clear the cookie.** There is no revocation call today: the api
has no way to end a token (`signOutVisitor` sends `DELETE /visitor`, which
the api answers `404` today). Clearing your cookie is the sign-out: the token
that was in it lapses within its hour, and without the cookie nothing renews
it.

```ts
// auth.ts, continued

// GET /auth/sign-out?to=<path>
export function onSignOut(request: Request): Response {
  const to = localPath(new URL(request.url).searchParams.get('to'))
  const cleared = `${VISITOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
  return new Response(null, { status: 302, headers: { Location: to, 'Set-Cookie': cleared, 'Cache-Control': 'no-store' } })
}
```
