# Sections: what BackGold sends and how to draw it

A page is an ordered list of sections. This file is what each section type
carries, the layout names BackGold allows for it, and how to write the
components that draw them in the site's own look.

## Contents

- How a section reaches a component
- Layouts are BackGold's names; the drawing is yours
- Every section type
- Bands and bleeds
- Writing a section component
- Mistakes that cost an afternoon
- `template.json`

## How a section reaches a component

```jsonc
{
  "id": "hero", "type": "Hero", "variant": "cover",
  "band": "plain", "bleed": "full",
  "copy": { "kicker": "Lakeside · Navajo County", "headline": "…", "subheadline": "…" },
  "media": {}, "links": [{ "label": "Pricing", "url": "/pricing" }],
  "data": { "source": "…", "items": [] },   // list and data sections
  "embed": { "iframe": "https://…" }         // money and consent sections
}
```

`<Section section={s} components={sections} />` from
`@backgold/astro/components` looks the component up in
`src/components/sections/index.ts` as `'<Type>:<variant>'`, then `'<Type>'`,
then draws it itself (`DefaultSection`). So:

```ts
export const sections = {
  Hero,                    // every Hero layout without its own component
  'Hero:cover': HeroCover, // the Hero in its Cover layout
  Cta,
  'Cta:photo': CtaClose,
}
```

Do not list money and consent types there. They are drawn as BackGold's
frame, which is the point.

**The page's first Hero is looked up separately.** The starter's
`PageSections.astro` draws a leading Hero with `components={{ Hero:
LeadingHero }}` so its headline is the page's `<h1>`. A `'Hero:cover'` entry
in `index.ts` is therefore ignored for the Hero that opens a page, which is
exactly the one you want it for. Add the layout there too:

```astro
<Section section={first} components={{ Hero: LeadingHero, 'Hero:cover': HeroCover }} />
```

**The starter has components for** Hero, About, Issues, StatCards, Cta,
QuoteStrip, Collection, Blog, ContentPost, EventsList, VideoEmbed, PdfEmbed
and a few political types. It has none for `Faq`, `Services`, `Stories`,
`Comparison`, `Pathways` and the other newer content types: those fall to
`DefaultSection` until you write one. `assets/sections/Faq.astro` is a `Faq`
to start from, since nearly every converted site has questions.

## Layouts are BackGold's names; the drawing is yours

Each type has a fixed list of layout names (the tables below). BackGold
refuses a page that names any other, and the page editor offers only these.
A custom site cannot add a name. It decides what each name **looks like**.

So a conversion is a casting exercise: for each distinctive block of the old
design, choose the type whose content fits and one of its layout names to
stand for that design. Prefer a name whose ordinary meaning is close (a table
as `archive`, numbered cards as `steps`, the page's showpiece as `cover` or
`feature`), because the owner picks it by that name. Then:

- say what each layout draws in the component's header comment and in the
  README's table;
- list only the layouts you draw in `template.json`, so the editor offers no
  layout that would fall back to a plain rendering.

A layout you do not handle should still draw the type's ordinary component,
never nothing.

## Every section type

From the Content API contract (`@backgold/contract`, content-api), as of
November 2026. A type BackGold adds later arrives the same way and is drawn
by `DefaultSection` until you give it a component.

"Words" are the keys of `copy`: what a component reads. In BackGold's page
editor the same fields appear under their own labels, which is what the
content plan names.

### Content sections

| Type | Words (`copy`) | Media | Links (label prop → address prop) | Layout prop: layouts | Rows (`data.source`, from which prop) | Default band / bleed |
| --- | --- | --- | --- | --- | --- | --- |
| `Hero` | kicker, headline, subheadline, ctaText, secondaryText, monthlyLabel, note, caption, imageAlt | imageUrl, photoUrl, videoUrl, videoPosterUrl | `ctaText` → `donateHref`; `secondaryText` → `secondaryHref` | `layout`: centered, split, overlap, cover, statement, donate, video, rotating, portrait, field | `words` from `words[]`: title | plain / full |
| `About` | kicker, heading, role, signature, body, quote, quoteSource, buttonLabel | photoUrl | `buttonLabel` → `buttonHref` | `photoSide`: right, left, letter, portrait, books | `credentials` from `items[]`: kind, label, detail, year, href, imageUrl | plain / full |
| `Issues` | heading, kicker, lead |  | `ctas[]` (label, href) | `style`: cards, steps, numbered, rows, checklist, tabs, drawer | `issues` from `items[]`: title, body, icon, imageUrl, note, includes | panel / full |
| `StatCards` | heading |  |  | `layout`: row, ribbon, feature, wall, archive | `stats` from `tiles[]`: label, value, note, accent | plain / full |
| `Cta` | eyebrow, heading, body, donateButtonText, volunteerButtonText | photoUrl | `donateButtonText` → `donateHref`; `volunteerButtonText` → `volunteerUrl` | `layout`: card, banner, strip, photo |  | contrast / contained |
| `QuoteStrip` | heading |  |  | `layout`: row, single, ticker, logos, carousel, wall | `quotes` from `items[]`: quote, attribution, role, logoUrl | plain / full |
| `Map` | kicker, heading, litLabel, darkLabel, startingLabel, charterCtaText, organizerText | geoUrl | `charterCtaText` → `charterCtaHref`; `organizerText` → `organizerHref` | `layout`: directory, map, bar | `regions` | plain / full |
| `MovementMap` | kicker, heading, badgeNoun, uncategorizedLabel, sourceLabel | datasetUrl | `sourceLabel` → `sourceHref` |  | `movement_map` from `statTiles[]`: 0; `categories[]`: value, label | contrast / full |
| `VideoEmbed` | caption | url, videoUrl, videoPosterUrl |  | `orientation`: auto, landscape, portrait, square |  | plain / full |
| `PdfEmbed` | title, caption | pdfUrl |  | `height`: short, medium, tall, card |  | plain / full |
| `QuickDonate` | kicker, heading, body, buttonLabel, monthlyLabel, note | imageUrl | `buttonLabel` → `donateHref` | `layout`: grid, hero, bar, jar, band, ladder | `ladder` from `ladder[]`: amount, impact | plain / full |
| `VoterTools` | kicker, heading, body, registerLabel, pollingLabel, idNote, earlyVoting, electionDay, datesHeading |  | `registerLabel` → `registerHref`; `pollingLabel` → `pollingHref` | `layout`: register, polling, dates | `dates` from `dates[]`: label, date, note | plain / full |
| `SampleBallot` | kicker, heading, body, printLabel, endorsedLabel, measuresHeading, note |  |  | `layout`: slate, cards, measures | `ballot` from `rows[]`: office, name, party, region, position, summary, kind, href, imageUrl, endorsed | plain / full |
| `Scorecard` | kicker, heading, body, sourceNote, promiseLabel, promise, promiseSource, didLabel, did, didDetail |  |  | `layout`: table, grades, promise | `votes` from `rows[]`: bill, issue, vote, position, date, href, name, office, grade, score, imageUrl | plain / full |
| `Faq` | kicker, heading, body, contactHeading, contactLabel |  | `contactLabel` → `contactHref` | `layout`: accordion, topics, cards | `faq` from `items[]`: question, answer, topic | plain / full |
| `Comparison` | kicker, heading, body, usLabel, themLabel, them2Label, leftLabel, rightLabel |  |  | `layout`: table, cards, spectrum | `comparison` from `rows[]`: issue, us, them, them2, usAt, themAt, them2At | plain / full |
| `Stories` | kicker, heading, body, label, title, summary, status, outcome, readLabel, watchLabel | imageUrl | `readLabel` → `readHref`; `watchLabel` → `watchHref` | `layout`: spotlight, cards, timeline | `stories` from `items[]`: label, title, body, status, tone, imageUrl, href | plain / full |
| `ShareKit` | kicker, heading, body, copyLabel, shareLabel |  |  | `layout`: cards, strip, compact | `share` from `items[]`: network, text, href, imageUrl | plain / full |
| `Financials` | kicker, heading, body, year, sourceNote, reportLabel |  | `reportLabel` → `reportHref` | `layout`: bars, donut, table | `financials` from `rows[]`: category, share, amount, note | plain / full |
| `Services` | kicker, heading, body, featuredLabel, startingLabel, note |  |  | `layout`: packages, list, compare, programs | `services` from `items[]`: name, summary, price, term, includes, href, buttonLabel, featured, icon | plain / full |
| `CaseStudies` | kicker, heading, body, readLabel, beforeLabel, afterLabel, note | imageUrl | `readLabel` → `readHref` | `layout`: featured, grid, beforeafter | `cases` from `items[]`: title, tag, challenge, approach, result, metric, metricLabel, metric2, metric2Label, metric3, metric3Label, before, after, href, imageUrl | plain / full |
| `Resources` | kicker, heading, body, gatedLabel, openLabel, buttonLabel |  | `buttonLabel` → `buttonHref` | `layout`: library, featured, band | `resources` from `items[]`: title, kind, detail, summary, href, imageUrl, gated | plain / full |
| `Pathways` | kicker, heading, body, programsLabel, quizHeading, resultLabel, startLabel |  |  | `layout`: doors, tabs, quiz | `pathways` from `items[]`: title, summary, outcome, icon, href, programs, fits | plain / full |
| `Portfolio` | kicker, heading, body, clientLabel |  |  | `layout`: grid, featured, strip | `work` from `items[]`: title, kind, client, year, summary, role, result, imageUrl, href, images | plain / full |
| `MediaKit` | kicker, heading, role, shortBio, longBio, facts, talksHeading, bookLabel, contactHeading, contactLine, kitLabel | imageUrl | `bookLabel` → `bookHref`; `kitLabel` → `kitHref` | `layout`: kit, speaker, press | `mediakit` from `items[]`: title, kind, detail, outlet, date, href, imageUrl | plain / full |

### Data sections

| Type | Words (`copy`) | Media | Links (label prop → address prop) | Layout prop: layouts | Rows (`data.source`, from which prop) | Default band / bleed |
| --- | --- | --- | --- | --- | --- | --- |
| `Progress` | kicker, heading, buttonLabel |  | `buttonLabel` → `donateHref` | `layout`: bar, ring, compact, match | `progress` | panel / full |
| `Countdown` | eyebrow, heading, body, linkText |  | `linkText` → `linkHref` | `layout`: banner, tiles, inline | `countdown` | contrast / full |
| `Leaderboard` | heading |  |  |  | `leaderboard` | panel / full |
| `SocialFeed` | heading |  |  |  | `social_feed` | panel / full |
| `MovementTicker` | heading |  |  |  | `movement` from `statTiles[]`: value, label | contrast / contained |
| `EventsList` | kicker, heading, allLabel, eventsEmptyCta |  | `allLabel` → `allHref` | `layout`: list, cards, agenda, compact, calendar, shifts, week, cohorts, map | `events` from `events[]`: id, title, starts_at, ends_at, timezone, location, is_virtual, type, registration_closed, url, sells_tickets, tickets_url, lat, lng | plain / full |
| `Blog` | kicker, heading, allLabel |  | `allLabel` → `allHref` | `layout`: cards, list, feature | `blog` | plain / full |
| `Collection` | heading, pluralLabel |  | `pluralLabel` → `moreHref` | `layout`: cards, list, compact, feature, library, shelves, outline | `entries/<type>` from `entries[]`: slug, title, summary, url, image_url, publish_at, terms, authors | plain / full |
| `ContentPost` | heading, postHtml, notesLabel, linksHeading |  | `links[]` (label, href) | `layout`: card, banner, player, theater, prose | `entry` | plain / full |
| `PlatformPlanks` | kicker, heading, pdfLabel |  | `pdfLabel` → `pdfHref` | `layout`: numbered, columns, longread | `platform` from `sections[]`: num, title, ethos, icon, planks | plain / full |
| `CandidateRoster` | kicker, heading, allLabel, candidatesEmptyCta |  | `allLabel` → `allHref` | `layout`: cards, ballot, compact | `candidates` from `entries[]`: name, office, level, region, issues, status, donate_url, web_url, image_url, endorsed | plain / full |
| `TeamGrid` | heading, teamOpenRolesIntro, interestButtonText |  | `interestButtonText` → `interestUrl` | `layout`: grid, board, list | `team` from `exec[]`: name, role, bio, image_url, link_url; `staff[]`: name, role, dept, image_url, link_url; `open[]`: role, dept, blurb, link_url; `roster[]`: body, body_key, seat, name, since, term_ends, is_officer, photo_url, bio, link, url | plain / full |
| `Membership` | kicker, heading, body, joinLabel, benefitsHeading, note |  | `joinLabel` → `joinHref` | `layout`: card, tiers, compare | `membership` from `paths[]`: name, model, monthly_cents, annual_cents, lifetime_cents, onetime_cents, symbolic, benefits | plain / full |
| `Booking` | kicker, heading, body, pickLabel |  |  | `layout`: cards, list | `booking` from `types[]`: name, slug, description, duration_minutes, durations, host_first_name, location_kind, price_cents, url | plain / full |
| `Classroom` | heading, kicker |  |  | `layout`: grid, list | `courses` from `courses[]`: slug, title, summary, url, hero_url, lesson_count, total_seconds, access, locked | plain / full |
| `Course` |  |  |  | `layout`: syllabus, outline |  | plain / full |
| `Lesson` |  |  |  | `layout`: player, reading |  | plain / full |

### Money and consent sections (always a frame)

| Type | Words (`copy`) | Media | Links (label prop → address prop) | Layout prop: layouts | Rows (`data.source`, from which prop) | Default band / bleed |
| --- | --- | --- | --- | --- | --- | --- |
| `Donate` | heading, storyHeadline, storyBody | storyImageUrl |  | `layout`: form, story |  | panel / full |
| `FormBlock` | heading |  |  | `layout`: card, wide |  | plain / full |
| `PollBlock` | heading |  |  | `layout`: card |  | plain / full |
| `Petition` | heading, addressedTo, goalNote, volunteerPrompt |  |  | `header`: none, image, map, coverage | `petition` from `asks[]`: title, body; `statTiles[]`: label, value, note | plain / full |
| `Store` | heading |  |  | `layout`: grid, featured |  | plain / full |
| `Event` | heading |  |  | `layout`: detail, card |  | plain / full |
| `Calendar` | heading |  |  | `opensOn`: month, agenda, split |  | plain / full |
| `SignupCapture` | kicker, heading, lede |  |  | `layout`: card, band, inline |  | plain / full |
| `SocialFrame` | heading |  |  | `family`: ring, lower_third, corner, countdown |  | plain / full |
| `Advocacy` | heading |  |  | `layout`: full, compact |  | plain / full |

Notes on the tables:

- `links` on a section is a list of `{ label, url }`, in the order of the
  table's link column. A link with no address is left out.
- A `Collection`'s rows are `slug, title, summary, url, image_url,
  publish_at, terms, authors`: never the entry's fields. It shows 3, 6, 9 or
  12, newest first; the number chosen is `section.options.limit`, for a
  component that draws from the entries itself and still wants to respect it.
- `Blog`, `Leaderboard` and `SocialFeed` send no rows. For a list of posts,
  read `client.entries('post')`.
- A money or consent section whose module is not set up yet arrives with no
  `embed`. Draw its heading and nothing else.

## Bands and bleeds

Every section has a `band` (`plain`, `tint`, `panel`, `wash`, `contrast`) and
a `bleed` (`full`, `contained`). They are roles, not colors: map each onto a
ground of the site's own in the stylesheet. `contrast` is a dark ground and
needs light text. `contained` is the section as a card inside the content
width.

Where the owner picked neither, the type's default applies (last column
above). Mind the ones that are not `plain / full`: a `Cta` arrives as
`contrast / contained` and an `Issues` as `panel / full`. If a component
draws its own card, have it ignore the band, or the card sits inside another
card.

The stylesheet needs, at least:

```css
.bg-band-tint, .bg-band-panel { background: var(--surface); }
.bg-band-wash { background: /* a light tint of the accent */; }
.bg-band-contrast { background: var(--dark); color: var(--on-dark); }
.bg-bleed-contained > .bg-section-inner { /* a card */ }
iframe.bg-embed { display: block; width: 100%; border: 0; min-height: 30rem; }
```

## Writing a section component

Start from the starter's component for the type and change the markup and
classes to the old site's. Keep these habits from it:

```astro
---
import type { Section } from '@backgold/content'
import Band from './Band.astro'
import Prose from '../Prose.astro'
import { links, rows } from '../../lib/section'
import { text } from '../../lib/format'

interface Props { section: Section; variant?: string }
const { section } = Astro.props
const heading = text(section.copy.heading)
const items = rows(section).filter((row) => text(row.title))
const buttons = links(section)
---
<Band section={section} class="steps-section">
  {heading && <h2>{heading}</h2>}
  …
</Band>
```

- `text()` returns a non-blank string or null: draw nothing for a blank
  field, so an owner can leave any field empty.
- `links()` and `safeHref` / `safeSrc` (from `@backgold/astro/server`) check
  every address. Use them for anything that reaches an `href` or `src`.
- `<Prose value={…} />` draws a copy value that may be plain paragraphs or
  BackGold's restricted rich text. `renderMarkdown()` turns an entry's body
  into safe HTML.
- One `<h1>` a page: the leading Hero's headline when the page opens with a
  Hero, else the page's title. Every other section uses `<h2>`.
- When a section needs the site's own data (a collection of services with
  prices), load it through one per-request helper, so ten sections on a page
  make one read:

  ```ts
  const kept = new WeakMap<object, Promise<Service[]>>()
  export function servicesFor(locals: App.Locals) {
    let read = kept.get(locals)
    if (!read) kept.set(locals, (read = loadServices(locals.backgold.client)))
    return read
  }
  ```

## Mistakes that cost an afternoon

- **A scoped style does not reach a child component's root.** A class passed
  to `<Band class="steps-section">` lands on Band's own `<section>`, outside
  the scoped `<style>` of the component that passed it, so
  `.steps-section { … }` silently does nothing. Use `<style is:global>` in
  section components and prefix every selector with the section's own class.
- **Inventing a layout name.** `night-road` is not a Hero layout; `cover` is.
  The page will not save.
- **Drawing only the rows of a `Collection`.** They carry no fields and stop
  at 12.
- **A `Cta` inside its own card inside the band's card.** See Bands above.
- **Keying behavior to a slug.** "The battery service gets the cold-weather
  tag" breaks when the owner renames it. Key it to a field (its icon, a
  boolean).
- **A form section's heading drawn twice.** The frame shows the form's own
  heading; hide the section's.
- **A counter across sections.** Numbering a run of sections (a ladder of
  `Cta`s) needs CSS counters on the sections themselves; a component cannot
  see its neighbors.
- **Section spacing copied from a one-section page.** A composed page has
  six. Give `.bg-section` modest padding and let adjacent plain sections
  close up.

## `template.json`

Put one at the repository root. A deploy carries it, and BackGold's page
editor then offers the layouts it lists and nothing else. `variants` is the
part to edit: for each type the site draws, the layout names it draws.
`assets/template.json` is a starting point. It must name only BackGold's
layout names; the deploy says which line is wrong when it does not.
