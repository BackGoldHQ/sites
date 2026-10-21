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
template draws them with the kit's own layouts, as `template.json` names
them:

| Address | What draws it |
| --- | --- |
| `/courses` | The course type's list layout, `classroom`: every course as a card, from `GET /courses`. |
| `/courses/<course>` | The course type's entry layout, `syllabus`: the course head, every lesson in order, About this course. |
| `/courses/<course>/<lesson>` | The kit's `course:lesson` layout: the player, the notes, Mark complete, previous and next, the course's rail; a locked lesson's teaser and its door. |

A page can draw the same sections anywhere: Classroom (`grid`, `list`),
Course (`syllabus`, `outline`, pinned to a course) and Lesson (`player`,
`reading`), beside the kit's Hero, About (its `books` layout for an
instructor and what they wrote), Pathways, Issues, StatCards, Faq, TeamGrid,
VideoEmbed, Cta, QuoteStrip, SignupCapture, FormBlock and Map. A lesson's
video is the org's own upload in the browser's player, or an imported YouTube
or Vimeo video in that player's frame. Who may open a lesson is the Content API's answer, never the
site's: a locked lesson arrives without its video or notes, and its `lock`
names the door (sign in, join, or ask).

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
