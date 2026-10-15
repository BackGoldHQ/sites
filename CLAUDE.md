# BackGold sites — agent rules

This repository follows the house rules of the BackGold platform repository
(gitlab.com/polyneural/backgold): its `CLAUDE.md` and
`docs/contributing-with-agents.md`. Read both before landing code here. The
short form that applies here:

- **Merge requests via `glab mr create` against `main`.** Never push to
  `main`, never stack MRs, squash-merge once green. Open a draft while work
  is still landing; CI runs only on a ready MR, and marking it ready does not
  start a pipeline: `glab mr update <iid> --ready && glab ci run --mr -b <branch>`.
- **Lint and test before every push.** `pnpm -r lint` and `pnpm -r test`
  (build `@backgold/content`, then `@backgold/astro`, first: the astro
  package reads the client's `dist/`, and the templates read both). For a
  template you touched, also `pnpm --filter <template> exec astro check` and
  `node scripts/starter-e2e.mjs [--template party]`.
- **No AI attribution** anywhere: no `Co-Authored-By`, no "Generated with".
- **Product, pricing and taxonomy decisions belong to JHL.** Put the question
  under `Decisions needed` in the MR description. Do not widen scope.
- **A comment describes what the code does now.** No narration of removed or
  moved code.

## What lives where

- `packages/content-client`: `@backgold/content` (npm).
- `packages/astro-backgold`: `@backgold/astro` (npm).
- `templates/astro-starter`: the public starter, mirrored to
  gitlab.com/backgold/backgold-starter by `scripts/sync-starter.sh`. Never
  push to the public repository by hand.
- `templates/party`: the party template, deployed as `template-party`.
- `vendor/backgold-contract`: the Content API contract snapshot
  (`@backgold/contract`, private).
- `scripts/`: the e2e, the manifest check, the contract pull, the starter
  sync.

Both templates depend on the packages as `workspace:^`. Keep it that way:
the deploy builds from this workspace, and the starter sync writes published
ranges into the public copy.

## Rules specific to this repository

- **The contract is a snapshot. Never edit `vendor/`.** Change the contract
  in the platform repository, then pull it here with
  `node scripts/contract-pull.mjs <platform checkout>` and commit the result.
- **A `template.json` change needs the platform's copy refreshed.** The
  platform keeps `packages/shared/site-templates/<key>.template.json`; after
  the change merges here, copy the file there and run
  `pnpm --filter @givegold/shared templates:build` in a platform MR. Until
  then the platform's `templates-drift` job is yellow.
- **A push to `main` deploys the party template to staging** (when it touches
  the template, a package, `vendor/`, the lockfile or `.gitlab-ci.yml`).
  Production is the manual `deploy-party-production` job. Never merge
  something you would not put on staging.
- **npm publishing is a release step**, played by hand (`pack-content`,
  `pack-astro`) after a version bump merges. Nothing in this repository waits
  on it.
- **The e2e needs Chrome.** `--lighthouse` and the party template's look
  checks run in the Chrome or Chromium at `CHROME_BIN`.
