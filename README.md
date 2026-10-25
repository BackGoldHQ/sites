# BackGold sites

The public side of BackGold's websites: the two npm packages a site on
BackGold's headless Content API is built on, the starter anyone can deploy,
and the party template BackGold runs for state parties. The BackGold
platform itself (the api, the app and the Content API) lives in
github.com/BackGoldHQ/backgold (private).

## Start here

- **Building a client site?** Read [docs/CLIENT-SITES.md](docs/CLIENT-SITES.md):
  which path you are on (a client's own repository from the public starter,
  or a site on the party template), the commands for each, the Content API
  and its keys, deploys, releases, and a ready-to-paste brief for your agent.
- **An agent working here** reads [CLAUDE.md](CLAUDE.md), the rule sheet,
  first.

## What is here

| Path | What it is |
| --- | --- |
| `packages/content-client` | [`@backgold/content`](https://www.npmjs.com/package/@backgold/content) on npm: the typed, cache-aware client for the Content API (`/api/content/v1`), and the `backgold-content` command that writes a site's content types. |
| `packages/astro-backgold` | [`@backgold/astro`](https://www.npmjs.com/package/@backgold/astro) on npm: the plumbing for an Astro site on Cloudflare Workers (routing, the edge cache keyed by content version, the webhook, preview, redirects, the SEO routes and the components). It reads content with `@backgold/content`. |
| `packages/cli` | [`@backgold/cli`](https://www.npmjs.com/package/@backgold/cli) on npm: the `backgold` command that deploys a site built on `@backgold/astro` to BackGold hosting (link, deploy, promote, rollback, previews, secrets). |
| `packages/template-kit` | `@backgold/template-kit`, private to this workspace: what every BackGold template draws the same way (the section, entry and chrome components, the Site layout, `lib`, the stylesheets) and an Astro integration that serves its routes with a template's config. Consumed as source; no build. A template is its manifest, its `src/template.ts`, its `src/styles/template.css` and any layouts of its own. |
| `templates/astro-starter` | The public starter. `scripts/sync-starter.sh` mirrors it to [github.com/BackGoldHQ/backgold-starter](https://github.com/BackGoldHQ/backgold-starter), the repository Cloudflare's Deploy button clones. |
| `templates/party` | The party template, drawn by the template kit, which BackGold deploys as the Worker `template-party` into its Workers for Platforms dispatch namespaces. Its `template.json` tells BackGold's composer which layouts it draws. See [its README](templates/party/README.md). |
| `templates/candidate`, `templates/petition-drive` | The candidate and petition-drive templates, drawn by the template kit and deployed like the party: Workers `template-candidate` and `template-petition-drive`, with the CI variables `CANDIDATE_STAGING_KV_ID`, `CANDIDATE_PRODUCTION_KV_ID`, `PETITION_DRIVE_STAGING_KV_ID` and `PETITION_DRIVE_PRODUCTION_KV_ID`. |

Beside them:

| Path | What it is |
| --- | --- |
| `vendor/backgold-contract` | A snapshot of the Content API contract (response types, example responses, built-in content types, the template manifest schema) built in the platform repository. It is the private workspace package `@backgold/contract`; `@backgold/content` bundles what it uses of it. Never edit it; pull a new one (below). |
| `scripts/starter-e2e.mjs` | The end-to-end check: packs both packages (and the template kit and the contract, for a template on the kit), installs them with npm into a copy of a template outside the repository, builds it, and runs it on `wrangler dev` against a fixture Content API. |
| `scripts/check-manifests.mjs` | Parses every `templates/*/template.json` with the vendored manifest schema. |
| `scripts/contract-pull.mjs` | Refreshes `vendor/backgold-contract` from a platform checkout. |
| `scripts/sync-starter.sh` | Mirrors the starter to its public repository. |

## Develop

Requires Node 22.12 or later and pnpm (the version `package.json` names in
`packageManager`; `corepack enable` provides it).

```bash
pnpm install
pnpm --filter @backgold/content build
pnpm --filter @backgold/astro build
pnpm -r lint
pnpm -r test
```

Both templates are in the pnpm workspace and depend on the two packages as
`workspace:^`, so they build against the packages' source here: a template
reads each package's built `dist/`, so build a package again after changing
it. To run a template:

```bash
pnpm --filter backgold-template-party dev
pnpm --filter backgold-starter dev
```

`pnpm --filter <template> exec astro check` type-checks one. A template's
README describes its configuration; the starter's is written for its public
copy, where `npm install` works because that copy names published ranges.

The end-to-end check, for the starter and for the party template:

```bash
node scripts/starter-e2e.mjs
node scripts/starter-e2e.mjs --template party
```

`--lighthouse` also scores pages with Lighthouse; it and the party
template's look checks need Chrome or Chromium at `CHROME_BIN`. `--serve`
keeps the fixture api and the site running to look at in a browser.

When the platform's Content API contract changes, pull a new snapshot from a
platform checkout with its dependencies installed:

```bash
node scripts/contract-pull.mjs <platform checkout>
```

`vendor/backgold-contract/CONTRACT.json` then names the platform commit the
snapshot came from.

## Template manifests

The platform keeps a copy of each template's `template.json` (for the party
template, `packages/shared/site-templates/party.template.json`). A change to
a manifest here needs that copy refreshed in a platform PR; the platform's
`templates-drift` CI job shows yellow until it is. The party template's
README has the steps.

## CI, deploys and releases

GitHub Actions, in `.github/workflows/` (`.gitlab-ci.yml` is the retired
GitLab pipeline; nothing runs it). `ci.yml` runs on open pull requests that
are marked ready (a draft runs nothing; `gh pr ready <n>` starts the run), and
each check job runs only when the paths it covers changed; `gate`
(`CI Passed`) is the one required check.

- **Each template deploys on push to `main`** (`deploy-staging.yml`). The six
  templates share one deploy shape (`scripts/deploy-template.sh`): a template
  deploys when a push changed it, a package, the vendored contract, the
  lockfile or the workflow file, building everything from this workspace; it
  never waits on npm. Production is `release.yml` (Actions → Release → Run
  workflow, on `main`): every template, one job each. Both stop before
  deploying unless `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set
  as repository secrets, and each template reads its own KV namespace id from
  `<TEMPLATE>_STAGING_KV_ID` or `<TEMPLATE>_PRODUCTION_KV_ID`. Each template's
  README covers the one-time setup.
- **Releasing a package to npm** is for outside users (the public starter and
  their own sites). Bump `version` in the package's `package.json` in a PR,
  merge it, then run `publish.yml` (Actions → Publish to npm) on `main` for
  that package (`content`, `astro` or `cli`); its publish job follows the pack job by itself. Publish
  `@backgold/content` first when `@backgold/astro` needs its new version.
- **The public starter** syncs by itself (`sync-starter.yml`) when a push to
  `main` changed `templates/astro-starter`, a package's `package.json` or
  `scripts/sync-starter.sh`. Its public `package.json` names `^<version>` of
  each package as this repository has it, and the sync waits (a warning, not
  a failure) until npm has that version; after a release, run the workflow by
  hand.

## License

MIT.
