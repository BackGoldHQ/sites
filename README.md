# BackGold sites

The public side of BackGold's websites: the two npm packages a site on
BackGold's headless Content API is built on, the starter anyone can deploy,
and the party template BackGold runs for state parties. The BackGold
platform itself (the api, the app and the Content API) lives in
gitlab.com/backgold/backgold (private).

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
| `templates/astro-starter` | The public starter. `scripts/sync-starter.sh` mirrors it to [gitlab.com/backgold/backgold-starter](https://gitlab.com/backgold/backgold-starter), the repository Cloudflare's Deploy button clones. |
| `templates/party` | The party template, which BackGold deploys as the Worker `template-party` into its Workers for Platforms dispatch namespaces. Its `template.json` tells BackGold's composer which layouts it draws. See [its README](templates/party/README.md). |

Beside them:

| Path | What it is |
| --- | --- |
| `vendor/backgold-contract` | A snapshot of the Content API contract (response types, example responses, built-in content types, the template manifest schema) built in the platform repository. It is the private workspace package `@backgold/contract`; `@backgold/content` bundles what it uses of it. Never edit it; pull a new one (below). |
| `scripts/starter-e2e.mjs` | The end-to-end check: packs both packages, installs them with npm into a copy of a template outside the repository, builds it, and runs it on `wrangler dev` against a fixture Content API. |
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
a manifest here needs that copy refreshed in a platform MR; the platform's
`templates-drift` CI job shows yellow until it is. The party template's
README has the steps.

## CI, deploys and releases

`.gitlab-ci.yml` runs only on open merge requests that are marked ready (a
draft runs nothing), and each check job runs only when the paths it covers
changed. Marking an MR ready does not start a pipeline:
`glab mr update <iid> --ready && glab ci run --mr -b <branch>`.

- **The party template deploys on push to `main`.** `deploy-party-staging`
  runs by itself when a push changed the template, a package, the vendored
  contract, the lockfile or the CI file, building everything from this
  workspace; it never waits on npm. `deploy-party-production` is a manual job
  on every `main` pipeline. Both exist only once `CLOUDFLARE_API_TOKEN` is set
  on the project. The party template's README covers the one-time setup.
- **Releasing a package to npm** is for outside users (the public starter and
  their own sites). Bump `version` in the package's `package.json` in an MR,
  merge it, then play `pack-content` or `pack-astro` on that merge's `main`
  pipeline; its publish job follows by itself. Publish `@backgold/content`
  first when `@backgold/astro` needs its new version.
- **The public starter** syncs by itself when a push to `main` changed
  `templates/astro-starter`, a package's `package.json` or
  `scripts/sync-starter.sh`. Its public `package.json` names `^<version>` of
  each package as this repository has it, and the sync waits (a yellow job)
  until npm has that version; after a release, play `sync-starter` on any
  `main` pipeline.

## License

MIT.
