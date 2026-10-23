# BackGold academy template

An organization's classroom on BackGold: courses of short video lessons,
some open to anyone, some for anyone signed in with their email, some for
members, some for a tag. It is an Astro site on Cloudflare Workers, drawn by
the template kit (`@backgold/template-kit`) from the organization's content
through the Content API, like the [party template](../party/README.md). This
README covers what is the academy's own; the party template's README is the
reference for everything the kit does the same way (layouts are files, areas,
the header and footer, restyling, the legal line).

## Start an academy site

In the operator app, start a new site from the Academy template. That makes a
site in template mode and writes the starter from `template.json` into it:

- **Home**: Hero · Cover ("Learn to lead where you live.", See the courses,
  About the Academy), then Classroom · Grid under "The classroom".
- **About**, **Join** (one Cta · Card to the membership page) and
  **Contact** (the message form and where to find you).
- **Menus**: the header has Courses, About and Join as plain menu items, and
  no header button; the footer has an Academy column (Courses, About, Join) and the
  organization's (Home, Newsletter, Contact).
- **The Academy letter**: an email sign-up band above the footer on every
  page. A locked lesson's sign-in door offers it by its kicker.

Every word is starter copy for the organization to replace. The template adds
no donate button: an organization that takes donations adds the link itself.

## Where the lessons live

Lessons are video entries; a course is an entry of the built-in `course`
type, at `/courses`, with its lessons in order in the course editor. The
template draws them with its own layouts over the kit's (`src/classroom.ts`,
the components under `src/components/classroom/`), under the names
`template.json` gives them:

| Address | What draws it |
| --- | --- |
| `/courses` | The course type's list layout, `classroom`: every course as a card with its cover, the ember line at its foot, the access chip and, for a signed-in visitor, its progress ring; from `GET /courses`. |
| `/courses/<course>` | The course type's entry layout, `syllabus`: the course head on the hearth band (the ring, the bar, Start or Continue), the ruled syllabus with numerals, About this course. |
| `/courses/<course>/<lesson>` | The `course:lesson` layout: the theater (the player, the lesson's numeral, Mark complete, Up next, the course's rail with a still per lesson), the notes, previous and next; a locked lesson's teaser and its door. |

A page can draw the same sections anywhere: Classroom (`grid`, `list`),
Course (`syllabus`, `outline`, pinned to a course) and Lesson (`player`,
`reading`), beside the kit's Hero, About (its `books` layout for an
instructor and what they wrote), Pathways, Issues, StatCards, Faq, TeamGrid,
VideoEmbed, Cta, QuoteStrip, SignupCapture, FormBlock, Map and Collection. A lesson's
video is the org's own upload in the browser's player, or an imported YouTube
or Vimeo video in that player's frame. Who may open a lesson is the Content API's answer, never the
site's: a locked lesson arrives without its video or notes, and its `lock`
names the door (sign in, join, or ask).

## What the academy draws itself

The kit draws every section and page; the template draws some of them its
own way (boards K1, K4 and K6 of the Kindling pass, turned up to full volume
by its brief's §10). Its sections are listed in `src/sections.ts`, each drawn
through `src/components/sections/Kindled.astro`.

Every page alternates three grounds, mapped from the band an organization
picks for a section: `plain` is night (the page), `tint` and `wash` are
parchment (an ivory ground in night ink, with a paper grain, its calls
filled in night), `panel` is smoke (the card ground) and `contrast` is the
hearth (a deep ember-brown with a glow of the ember at a corner). Every
color is mixed from the organization's theme (`src/styles/template.css` § 1;
`src/lib/kindling.ts` for BackGold's frames on parchment), never pinned.

| Where | What the academy draws |
| --- | --- |
| Hero · Field | The kit's field on the night, burning three times as bright, the headline up to 7.5rem, the second call as a link, and under the calls the proof line: "{courses} courses · {lessons} lessons · {videos} conversations and clips", each number counted from the Content API when the page is drawn (`src/lib/counts.ts`), never typed. A Hero with a photo is a split: the words at the left and the photo at the right in an ember rim light (under the words on a phone). Under the page's opening hero, a strip of the ten newest conversations (`NEW · <title> · <length>`), carried across at reading pace, stopping for the pointer and the focus, still for reduced motion. |
| Course · Outline | The free course as a feature card: "Start here", the course's title and summary, its cover with its facts (lessons, who can watch), its first four lessons (Free, the locks and what opens them), Play lesson 1 and See the syllabus. |
| Collection (cards) | Conversations: the chapter mark (the site's icon on a hairline), "Watch", the heading, a line about who talks in them and "All conversations", then each entry's 16:9 still with a play mark, its title, its guest line, its length and date: the newest across two thirds, the next two stacked beside it; one under another on a phone. |
| Pathways · Doors | A ruled list: each pathway's number in the gold, its title, its line, and its link at the right: "Start with <course>" when it opens a course, "Apply" when it opens `/join`, else the section's link label or "Start here". |
| Issues · Steps | Each step under its rule with its number at 6rem in the gold. |
| The video list, and a news list that holds videos alone | "Watch.": the videos grouped by their `series` term (Conversations, Training clips, Live sessions; a video with none is a training clip), each group headed at 3rem and counted in a 4rem numeral, newest eight (four on a phone) with a link to the series' own list. A news list with a post or an episode in it is the kit's. |
| A video's page | The theater: the player, the title, the summary, the series, length, date and byline, Watch on YouTube, the five newest videos of its series beside it, then the free course's feature card. |
| The header's brand | The site's icon beside the name set in type ("Libertarian Leadership" / "ACADEMY"); the header's button an outline. |
| The footer | On the page's ground; its closing call (the `closing` layout) as the site's closing line in the display face beside the icon. |

On the hearth the classroom's course cards are paper with night ink, the
ring in gold on a night disc. Kickers sit over an ember rule, every ember
line glows, the heading under a kicker rises as it comes into view, and the
proof line's numbers roll up once; all of it is the stylesheet's § Motion and
`src/scripts/motion.ts`, and none of it runs for a visitor who asked for
reduced motion.

## Signing in

The header offers **Sign in** (`visitorSignIn: true` in `src/template.ts`).
`@backgold/astro` adds four routes on the site's own host:

- `/_backgold/sign-in?return=<path>` sends the visitor to the giving portal's
  door for this site, naming the lesson or course they came from (`title`)
  and, from a lesson's door, the newsletter box when it is ticked
  (`newsletter=1`);
- `/_backgold/visitor?code=…` is the portal's way back: it redeems the code
  and keeps the visitor's token in the HttpOnly `bg_visitor` cookie;
- `/_backgold/sign-out` ends it;
- `/_backgold/progress` saves a lesson's progress (the page's script posts
  JSON; without the script, Mark complete is a form that comes back to the
  lesson).

A page read for a signed-in visitor is answered `private, no-store` and never
cached. Signing in needs the first-party form BackGold deploys (below): a
copy of this template on a site key has no Sign in and its `/_backgold/`
routes answer 404.

## Develop locally

From the repository root:

```bash
pnpm install
pnpm --filter @backgold/content build
pnpm --filter @backgold/astro build
pnpm --filter backgold-template-academy dev
```

`node scripts/starter-e2e.mjs --template academy` (Chrome at `CHROME_BIN`)
builds the template and checks it end to end, then runs it first-party
against a stand-in api with a visitor who signs in: the classroom, a course,
a lesson's player and the locked lessons' doors, at 1440 and 375, light and
dark. `--shots <dir>` saves a PNG of each page it reads.

## Staging deploy

As the party template's (its README, Staging deploy), with this template's
names: the Worker `template-academy` in `sites-staging`, the job
`deploy-academy-staging`, and the cache's KV namespace
`backgold-academy-staging-cache` with its id in the `ACADEMY_STAGING_KV_ID`
CI variable. Before the first deploy, once:

```bash
npx wrangler kv namespace create backgold-academy-staging-cache
glab variable set ACADEMY_STAGING_KV_ID <id> --masked --protected -R backgold/sites
```

The api dispatches a site to `template-academy` once the platform knows the
`academy` template key.

## Production deploy

As the party template's (its README, Production deploy): the Worker
`template-academy` in `sites-production`, deployed by
`deploy-academy-production` from the `deploy-production` button. Once:

```bash
npx wrangler kv namespace create backgold-academy-production-cache
glab variable set ACADEMY_PRODUCTION_KV_ID <id> --masked --protected -R backgold/sites
```

## License

MIT. See [LICENSE](LICENSE).
