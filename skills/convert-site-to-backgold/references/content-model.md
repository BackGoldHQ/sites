# Where each thing lives

How to sort an old site's content into BackGold's model, and the limits that
shape the sort. Read the Content API guide
(`docs/HEADLESS-CONTENT-API.md` in github.com/BackGoldHQ/sites) for the
response shapes; this file is about the decisions.

## Contents

- The test for "content or code"
- Pages
- Content types
- A "details" entry for site-wide facts
- Posts
- Menus
- Forms and money
- Limits that change the design
- A worked example

## The test for "content or code"

Ask of each thing on the old site: **would the owner ever want to change this
without a developer?** If yes, it is content and lives in BackGold. If it is
part of how the site looks or moves, it is code.

| Content (BackGold) | Code (the repository) |
| --- | --- |
| A price, a phone number, opening hours | The layout of the price sheet |
| A page's headings and paragraphs | The typeface and the type scale |
| Which services exist, and their order | The icon set a service picks from |
| FAQ questions and answers | That FAQs open as an accordion |
| Menu links and their order | The header's shape and the mobile menu |
| The hero's headline and line | The hero's illustration or animation |

When in doubt, make it content. The cost of a field nobody edits is small;
the cost of a price typed into a template is a developer every time it
changes.

## Pages

A page is an ordered list of **sections** the owner arranges in BackGold's
page editor. Use a page for anything that is one-of-a-kind prose: Home,
About, Pricing, Contact, How it works, a landing page.

Break an old page into sections by content, not by markup. A typical page is
a `Hero` (kicker, headline, a line), then two to five sections. Prefer the
type whose content matches:

| The old page has | Use |
| --- | --- |
| An opening title and a line under it | `Hero` |
| Paragraphs of prose, perhaps beside a photo | `About` |
| Three to twelve short items with a title and a few lines | `Issues` |
| Numbered steps | `Issues` in its `steps` layout |
| Questions and answers | `Faq` |
| Figures with labels, or a small table of label, value, note | `StatCards` |
| A closing prompt with one or two buttons | `Cta` |
| A list of the site's own services, locations, people | `Collection` of that content type |
| Customer quotes | `QuoteStrip` |
| A form | `FormBlock` |

`references/sections.md` has every type, its words and its layouts.

The home page's slug is `home`. A page's address is its slug.

## Content types

Use a content type for things that **repeat and each have a page**:
services, locations, team members, projects, case studies. The organization
defines the type and its fields in BackGold; each entry gets a title, a
summary, a Markdown body and the type's fields; a routable type gets a list
at `/<url base>` and each entry at `/<url base>/<slug>`, with no code change.

Rules that matter when you design one:

- **BackGold names the keys.** A type's key is made from its plural name
  ("Service areas" is `service_areas`) and a field's key from its label
  ("Short name" is `short_name`): lower case, anything that is not a letter or
  digit becomes `_`. Choose labels whose keys you are happy to read in code.
- **Field kinds**: `short_text`, `long_text`, `rich_text`, `image`, `pdf`,
  `link`, `date`, `datetime`, `boolean`, `choice`, `choices`, `list`,
  `reference`.
- **A `list` is short strings**: at most 50 items of at most 200 characters
  each. It is right for bullet points ("What to bring"), wrong for FAQs or
  anything with two parts.
- **A `link` is `https://` or `mailto:` only.** A phone number is a
  `short_text`; build the `tel:` link in the component.
- **`image` and `pdf` hold an uploaded file**, not an address.
- **Order.** Lists come newest first. If the order matters (it usually does
  for services), add a `short_text` field "Order" and sort by it in code.
- **Structured parts of a body.** For things that are a title and a
  paragraph, repeated (questions, roads, milestones), write them in the body
  under a known heading and read them out in code:

  ```markdown
  ## Questions people ask

  ### How much is a jump start?

  The floor is $35, which covers the first ten miles.
  ```

  The site takes the `## Questions…` section out of the body, draws it as an
  accordion and sends it to search engines as FAQ data. It reads naturally
  in BackGold's editor and needs no field. Tell the owner the convention in
  the README.
- **Entries belong to a site.** An entry shows through the Content API only
  on the site it is homed on (or also published to). Say in the content plan
  which site each entry is made on.
- **A search title.** An entry's `<title>` is its title. If the old site
  tuned its titles for search, add a `short_text` "Search title" and prefer
  it in the `<head>`.

A section's `Collection` rows carry only an entry's title, summary, address
and picture, never its fields. The number the owner chose is
`section.options.limit`. To draw a collection with prices or icons,
load the type's entries once per request and draw from those; treat the
section as saying *which type, in which layout*.

## A "details" entry for site-wide facts

The Content API's `GET /site` gives the site's name, brand colors, logo,
favicon, social links and SEO defaults. Everything else a small business
prints everywhere (phone, email, hours, city, the owner's name, a tagline,
coordinates for a map or weather) has no built-in home.

Give them one: a content type that is not routable, with **one entry**. There
is no "singleton" switch; the site reads the type's first entry. Name it for
what it is ("Shop details", "Practice details"). Load it once per request and
pass it to the header, the footer and the structured data.

Draw nothing for a fact that is blank: no empty "Call" button, no "undefined"
in the footer.

## Posts

A blog, news page or notes become BackGold's built-in **posts** (podcast and
video entries list with them). They live at the organization's blog base,
`/news` for a new organization. To keep the old address, change the posts'
address on the Posts type in BackGold, and BackGold answers the old one with
a redirect.

A published page whose slug is the blog base is drawn **above** the list as
its introduction, so "Field notes" can keep its heading and lede. The one
address this cannot be done at is `/blog` (no page may have that slug): keep
the posts there if the old site had them there, and head the list in code.

Carry each post's original date, and the old site's redirects (Sites → the
site → Redirects). Both go in the content plan.

## Menus

The site has a `primary` menu and a `footer` menu (and a `utility` one). Each
link is a page, a content type's list, the blog, a group, or an outside
address, and has a Shows-on rule. One link in the primary menu can be marked
as the **header button**.

- An outside link must be `https://` or `mailto:`. There is no `tel:` menu
  item: draw the phone in the header from the details entry.
- Draw menus from `menuOf` / `headerButtonOf` (or the `<Menu>` component) so
  the Shows-on rules apply.

## Forms and money

A form on the old site becomes a `FormBlock` section. Its fields, button,
thanks message and the tags it puts on the contact are set on the section in
BackGold, and it renders as BackGold's frame. That is not a limitation to
work around: the response lands in the organization's records with consent
handled, and a custom form posting to a proxy would lose both.

- Carry the old form's **fields and labels** into the section.
- Carry its **routing** as tags (`service-request`, `applicant`).
- Remove the old form's endpoint, its spam protection and any mail-sending
  code; BackGold does all three.
- Donations, tickets, a store and petitions are BackGold modules. They need
  setting up in BackGold by the owner (a donation form, a product); place
  them and leave what is inside to BackGold.

## Limits that change the design

Find these on day one, not at review:

| Limit | What to do |
| --- | --- |
| A section's layout must be one of BackGold's names for its type | Map each old design to an existing name (`references/sections.md`) |
| A Collection shows 3, 6, 9 or 12 rows, newest first | Draw from the type's entries when you need all of them or a set order |
| Rich text allows `h2 h3 p strong em a ul ol li blockquote img br` | Tables become a `StatCards` in a table layout, or a list |
| Links authored in BackGold cannot be `tel:` or `sms:` | Buttons that call or text are drawn by a component from the details entry |
| `/privacy` and `/sms-terms` are BackGold's own pages | Drop the site's own; link to BackGold's |
| A page has no per-page `noindex` switch | Say so under Differences |
| A hosted site (any site before its first promoted deploy) keeps `/donate`, `/join`, `/store`, `/events` and BackGold's other addresses, and will not take a page at the posts' address | Make those pages while the site is switched to headless (its Developer page), or after the first promote. A headless site refuses a deploy, so switch it back first. |
| No page may have the slug `blog`, `api` or `preview` | Keep posts at `/blog` without an intro page, and head the list in code |
| No cookies, so no sign-in of any kind on a custom site | Gated content stays off the site. Delete the starter's `src/pages/auth/` routes and `src/lib/visitor.ts`: they keep the visitor in a cookie |

## A worked example

A mobile mechanic's site: a home page with an animated hero and five priced
"mile markers", eight service pages, four area pages, pricing, about, a
contact form, a join form, a donation log form, and notes.

| Old | New |
| --- | --- |
| `src/data/services.ts` (8 objects with price, icon, body, FAQs) | Content type **Services**: fields Short name, Icon (choice), Price, Price terms, Price unit, Mile marker (boolean), Order, Lede, Have ready (list), Service type; body in Markdown with a `## Questions people ask` section |
| `src/data/areas.ts` | Content type **Areas**, the same way, with `## Roads…` and `## Questions…` sections in the body |
| A committed `content.json` (phone, hours, city, owner, tagline) | Content type **Shop details**, one entry |
| `index.astro` with a drawn night-road hero | Page `home`: `Hero` in the `cover` layout (the site draws that layout as the scene), `Collection` of services in `feature` (the mile markers), `Collection` in `cards`, `Cta` in `photo` (the closing beat) |
| `pricing.astro` with a price list and a mileage table | Page: `Hero`, `About`, `Collection` in `list`, `StatCards` in `archive` (drawn as a table), `Cta` in `banner` (drawn as the call buttons), `Faq` |
| A six-step "how it works" | `Issues` in `steps` |
| Three forms posting to `/api/contact`, `/api/join`, `/api/donate` | Three `FormBlock` sections with the same fields and the tags `service-request`, `network-applicant`, `parts-fund-pledge` |
| `/api/weather` (cached with `caches.default`) | `/weather.json`, kept in a module variable for half an hour |
| A hand-written Worker with `www` redirect, robots and noindex | Gone: BackGold and the kit do all three |
