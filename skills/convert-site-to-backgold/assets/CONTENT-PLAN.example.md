# Content plan: Example Co

What to create in BackGold so the converted site has everything the old one
showed. It is written to be followed by a person in the BackGold app, top to
bottom. Every name here is exact: the site's code reads the keys BackGold
makes from these labels, so a different label is a field the site never
shows.

Copy this file to `CONTENT-PLAN.md` at the root of the repository, replace
every value, and tick each item as it is entered. Once the owner is editing
in BackGold, BackGold is the record and this file is history.

## 0. Before entering anything

- [ ] Which site: `<the site's name in BackGold>`. If the organization has
      more than one site, the owner chooses; a site that already holds the
      domain is usually the one.
- [ ] The site's name is what the site prints in titles and the header:
      `Example Co`. Rename it if it is called something else.
- [ ] Pages at `/donate`, `/join`, `/store`, `/events` and the page above the
      posts cannot be made on a hosted site. If this plan has any (marked
      **†** below), switch the site to headless on its Developer page while
      entering pages, and **switch it back before the first deploy**.

## 1. Content types

Content → Types → New type. The key in brackets is what BackGold will make
from the plural name; if it shows another, stop and tell the developer.

### Business details  `[business_details]`

Not routable. One entry.

| Field label | Kind | Required | Note for the owner |
| --- | --- | --- | --- |
| Phone | Short text | | As it should be printed |
| Email | Short text | | |
| City | Short text | | |
| Weekday hours | Short text | | |
| Tagline | Short text | | |

### Services  `[services]`

Routable, at `/services`.

| Field label | Kind | Required | Note for the owner |
| --- | --- | --- | --- |
| Short name | Short text | yes | On cards and price rows |
| Price | Short text | | A number (35) or words (At cost) |
| Order | Short text | | A number. Lower comes first |
| Lede | Long text | | |
| Have ready | List | | One line each, under 200 characters |

## 2. Entries

### Business details (1)

| Field | Value |
| --- | --- |
| Title | Example Co |
| Slug | `details` |
| Phone | (555) 010-0100 |
| City | Springfield |
| Weekday hours | 8 to 6 |
| Tagline | We come to you. |

### Services (1 of N shown; list every one)

**Battery jump and replacement** · slug `battery`

| Field | Value |
| --- | --- |
| Summary | Jump start, battery test, and replacement where the car sits. |
| Short name | Battery jump |
| Price | 35 |
| Order | 10 |
| Lede | A line under the title. |
| Have ready | Year, make and model · Where the car is |

Body (Markdown):

```markdown
The first paragraph.

The second.

## Questions people ask

### How much is a jump start?

The floor is $35.
```

## 3. Posts

Posts live at `/notes` (change the posts' address on the Posts type; BackGold
redirects the old one). Keep each post's original date.

| Slug | Title | Date | Summary |
| --- | --- | --- | --- |
| `first-note` | A first note | 2026-03-04 | What it is about. |

The body of each is in `content/posts/<slug>.md`.

## 4. Pages

Sites → the site → Pages. Sections in order; the Layout is the one to pick
in the section's settings.

### Home · slug `home`

Search title: `Example Co · What we do, where`
Description: `One sentence for search results.`

| # | Section | Layout | Content |
| --- | --- | --- | --- |
| 1 | Hero | Cover | Kicker: Springfield · Headline: Example Co · Line: We come to you. |
| 2 | Collection | Cards | Type: Services · Show: 9 · Heading: What we do |
| 3 | Call to action | Card | Heading: Ready when you are · Body: Tell us what you need. · Button: Get in touch → `/contact` |

### Contact · slug `contact`

| # | Section | Layout | Content |
| --- | --- | --- | --- |
| 1 | Hero | Centered | Kicker: Get in touch · Headline: Contact · Line: Tell us what you need and where you are. |
| 2 | Form | Card | See "Forms" below |
| 3 | FAQ | Accordion | When are you open? → Monday to Saturday, 8 to 6. |

### Notes · slug `notes` **†**

Drawn above the posts' list.

| # | Section | Layout | Content |
| --- | --- | --- | --- |
| 1 | Hero | Centered | Headline: Notes · Line: Written down once. |

## 5. Forms

### Contact form (on Contact, section 2)

Heading: `Send us a note` · Line under it: `We call you back at the number
you give us.` · Button: `Send it` · After sending: `Got it.` / `We will be in
touch.` · Tag on the contact: `contact-request`

| Field label | Type | Required | Options, placeholder or help |
| --- | --- | --- | --- |
| Name | Text | yes | |
| Phone | Phone | yes | |
| Email | Email | | |
| What you need | Long text | yes | |

## 6. Menus

Sites → the site → Menus.

| Menu | Label | Goes to | Header button |
| --- | --- | --- | --- |
| Primary | Services | The Services list | |
| Primary | Contact | Page: Contact | yes |
| Footer | Notes | The posts | |
| Footer | Privacy | `https://example.org/privacy` | |

An outside address must be a whole `https://` or `mailto:` address.

## 7. Redirects

Sites → the site → Redirects.

| From | To |
| --- | --- |
| `/old-contact` | `/contact` |

## 8. Brand

Logo, favicon and the three brand colors, on the site's settings. Social
links, if the old site had them.

## Not carried over

List here what the old site showed that has no place in BackGold, and what
replaced it. The same list goes in the pull request under "Differences".
