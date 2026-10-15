# BackGold sites — agent rules

This repository (gitlab.com/backgold/sites, public) holds the two npm
packages a BackGold site is built on, the public starter and the party
template. It follows the house rules of the BackGold platform repository
(gitlab.com/backgold/backgold, private): its `CLAUDE.md` and
`docs/contributing-with-agents.md`. Read both before landing code here when
you can reach them; the rules that apply here are below.

For how a client site is built, on either path (a client's own repository
from the public starter, or a site on the party template), read
[docs/CLIENT-SITES.md](docs/CLIENT-SITES.md).

## Layout

| Path | What it is |
| --- | --- |
| `packages/content-client` | `@backgold/content` (npm): the Content API client and the `backgold-content` command. |
| `packages/astro-backgold` | `@backgold/astro` (npm): the Astro plumbing and components. Depends on `@backgold/content`. |
| `templates/astro-starter` | The public starter (`backgold-starter`), mirrored to gitlab.com/backgold/backgold-starter by `scripts/sync-starter.sh`. Its README is public text for outside users. |
| `templates/party` | The party template (`backgold-template-party`), deployed as the Worker `template-party`. Its `template.json` is its manifest. |
| `vendor/backgold-contract` | The Content API contract snapshot (`@backgold/contract`, private, never published). Generated; never edited. |
| `scripts/` | `starter-e2e.mjs` (the end-to-end check), `check-manifests.mjs` (every `template.json` against the contract's schema), `contract-pull.mjs` (refreshes `vendor/`), `sync-starter.sh` (the starter mirror, run only by CI). |
| `docs/` | `CLIENT-SITES.md`, the build-out guide. |

Both templates depend on the packages as `workspace:^`. Keep it that way:
the party deploy builds from this workspace, and the starter sync writes
published `^<version>` ranges into the public copy.

## Lint and test before every push

Build `@backgold/content`, then `@backgold/astro`, first: the astro package
reads the client's `dist/`, and the templates read both.

```bash
pnpm install --frozen-lockfile
pnpm --filter @backgold/content build
pnpm --filter @backgold/astro build
pnpm -r lint     # tsc --noEmit in the two packages only
pnpm -r test     # node:test (content), vitest (astro)
```

`pnpm -r lint` skips the templates: they have no `lint` script. For a
template you touched, also run its type check and the end-to-end check:

| Changed | Run |
| --- | --- |
| `packages/content-client` | `pnpm --filter @backgold/content lint`, `build`, `test` |
| `packages/astro-backgold` | `pnpm --filter @backgold/astro lint`, `build`, `test` |
| `templates/astro-starter` | `pnpm --filter backgold-starter exec astro check`, `node scripts/starter-e2e.mjs` |
| `templates/party` | `pnpm --filter backgold-template-party exec astro check`, `node scripts/starter-e2e.mjs --template party` |
| `templates/*/template.json` | `node scripts/check-manifests.mjs` |

**The e2e needs Chrome.** `--template party` and `--lighthouse` run in the
Chrome or Chromium at `CHROME_BIN`.

## Rules

- **Merge requests via `glab mr create` against `main`.** Never push to
  `main`, never stack MRs, squash-merge once green. Open a draft while work
  is still landing; CI runs only on an open, ready MR, and marking it ready
  does not start a pipeline:
  `glab mr update <iid> --ready && glab ci run --mr -b <branch>`. The
  runners are shared with the platform, so never push a branch lint would
  have failed.
- **No AI attribution** anywhere: no `Co-Authored-By`, no "Generated with".
- **Product, pricing and taxonomy decisions belong to JHL.** Put the question
  under `Decisions needed` in the MR description. Do not widen scope.
- **A comment describes what the code does now.** No narration of removed or
  moved code.
- **The contract is a snapshot. Never edit `vendor/`.** Change the contract
  in the platform repository; once that merges, pull it here from a platform
  checkout of `main` with its dependencies installed, and commit the result:
  `node scripts/contract-pull.mjs <platform checkout>`. Pull when a package
  or template needs a contract change (a response field, a section type, the
  manifest schema). `vendor/backgold-contract/CONTRACT.json` names the
  platform commit it came from.
- **A `template.json` change needs the platform's copy refreshed.** The
  platform keeps `packages/shared/site-templates/<key>.template.json`; after
  the change merges here, copy the file there and run
  `pnpm --filter @givegold/shared templates:build` in a platform MR. Until
  then the platform's `templates-drift` job is yellow. Say so in the MR.
- **A push to `main` deploys the party template to staging**
  (`deploy-party-staging`, when it touches `templates/party/`, `packages/`,
  `vendor/`, `pnpm-lock.yaml` or `.gitlab-ci.yml`). Production is the manual
  `deploy-party-production` job. Never merge something you would not put on
  staging.
- **A push to `main` syncs the public starter** (`sync-starter`, when it
  touches `templates/astro-starter/`, a package's `package.json` or
  `scripts/sync-starter.sh`). Never push to the public repository by hand.
- **npm publishing is a release step**, played by a person on a `main`
  pipeline (`pack-content`, `pack-astro`; each publish job follows) after a
  version bump merges. Never run `npm publish`, and never commit an `.npmrc`.
  Nothing in this repository waits on a publish.
- **Never commit a key or a secret.** `bg_site_sk_…` and `whsec_…` values go
  in a git-ignored `.dev.vars`; this repository is public.
- **Never play a deploy, pack, publish or sync job** unless a person asked
  for that job by name.
