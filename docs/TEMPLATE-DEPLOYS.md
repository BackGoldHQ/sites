# Deploying the templates

How BackGold runs each template under `templates/` as a Worker of its own, and
the one-time account steps behind the jobs. This is BackGold's runbook: it
lives here, not in a template's README, because every template README ships
inside `@backgold/templates` and lands in every project `backgold eject`
makes. The template READMEs point here.

## The shape

BackGold runs a template as one Worker, `template-<key>` (`party`,
`candidate`, `petition-drive`, `academy`, `nonprofit`, `unlabeled`: the
`key` in its `template.json`), in a Workers for Platforms dispatch namespace
in BackGold's Cloudflare account: `sites-staging` for staging,
`sites-production` for production. The api Worker of that environment
(`givegold-api-staging`, which answers every `*.backgold.dev` host;
`backgold-api`, which answers every `*.backgold.com` host and each verified
tenant custom domain) binds the namespace as `SITES`. For a site on a
template it hands the request to the namespace's Worker `template-<key>`
with the site's id in the `X-BackGold-Site` header. The Worker reads the
Content API first-party, through the `BACKGOLD_API` service binding to the
api's `FirstParty` entrypoint, with no site key, and draws the site the
header names at the request's own address. One deploy serves every site on
that template in that environment; the Westmark Liberty Party demo at
`https://westmark.backgold.dev` (the `seed-westmark` fixture's site,
`dom_westmark`) was the first on `party`.

The `env.staging` and `env.production` blocks in each template's
`wrangler.jsonc` hold that form: the Worker's name, the service binding
(the environment's api Worker, entrypoint `FirstParty`),
`BACKGOLD_API_ORIGIN` (`https://api.backgold.dev` on staging,
`https://api.backgold.com` in production) and the cache's KV namespace, as
the placeholder `__<KEY>_<ENV>_KV_ID__` (`__PARTY_STAGING_KV_ID__`,
`__PETITION_DRIVE_PRODUCTION_KV_ID__`, ...). A block has no routes, Custom
Domain or `workers.dev` address: a Worker in a dispatch namespace is reached
only through the api's dispatch, so a deploy touches no DNS. It sets neither
`BACKGOLD_SITE_KEY` nor `SITE_URL`: the dispatch names the site per request.
The default configuration above the blocks is what an ejected copy deploys
with (`npx backgold deploy`; it deletes both blocks).

**While a namespace holds no `template-<key>` script, every site on that
template in that environment answers 503 "This site isn't ready yet."** with
a `Retry-After` of 60 seconds. A new namespace holds none until the job has
run.

## The jobs

Both run `scripts/deploy-template.sh <staging|production> <key>` after
`pnpm install --frozen-lockfile`, which deploys the template and the packages
as committed, built from this workspace: a template deploy never waits on
npm.

- **Staging:** `.github/workflows/deploy-staging.yml`, one job per template,
  on a push to `main` that changed that template, `packages/`, `vendor/`,
  `pnpm-lock.yaml` or the workflow, and by hand (Actions → Deploy staging →
  Run workflow, one template or `all`) to redeploy `main`'s head.
- **Production:** `.github/workflows/release.yml`, one job per template, only
  when the Release workflow is run by hand on `main` (environment
  `production`); it is never run on its own.

The script, step for step:

1. refuses to start without `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`, or without a `<KEY>_<ENV>_KV_ID` that is a
   32-character namespace id;
2. writes that id over the `__<KEY>_<ENV>_KV_ID__` placeholder in the
   template's `wrangler.jsonc`, and stops when there is no placeholder;
3. reads the dispatch namespace and stops, saying it does not exist on this
   account, when the one-time step below was not done;
4. builds `@backgold/content`, `@backgold/astro` and `@backgold/template-kit`,
   then the template with `CLOUDFLARE_ENV=<env> pnpm --filter
   backgold-template-<key> build`. The Cloudflare adapter writes the deploy
   configuration (`dist/server/wrangler.json`) during the build and picks the
   environment then, so `wrangler deploy --env <env>` on its own would deploy
   the default configuration. The script refuses to deploy unless the built
   configuration names `template-<key>`;
5. uploads with `pnpm --filter backgold-template-<key> exec wrangler deploy
   --dispatch-namespace sites-<env>`.

The jobs need no site key and no secrets of the template's own: a
first-party read needs no key, `/preview` reads drafts through the same
binding, and the api keeps `/api/*` on every site host, so a template's
webhook route (`/api/backgold/webhook`) is never reached and needs no
signing secret.

**How to tell it worked.** The job's log ends with `Dispatch Namespace:
sites-<env>` and the new version's id. The namespace's script list shows
`template-<key>`:

```bash
cf workers-for-platforms dispatch-namespaces scripts list --dispatch-namespace sites-staging
```

and a site on the template answers with its home page on its
`*.backgold.dev` (staging) or `*.backgold.com` address instead of the 503.

**Content never needs a redeploy.** Publishing in BackGold bumps the site's
content version, the client notices within a minute when it next checks the
version, and a new version is a miss in the site's cache. A change to a
template or the packages deploys with the push to `main` that carries it
(staging) or the next Release (production); run a job by hand only to
redeploy what is already there.

## One-time account setup

In place today, for both environments and every template. To set an
environment up again from nothing, in BackGold's Cloudflare account, in this
order. The operator's login spans more than one Cloudflare account, so export
`CLOUDFLARE_ACCOUNT_ID` (the id the repository secret of that name holds)
before every command below.

1. **The dispatch namespace** (`sites-staging` or `sites-production`). The
   api's own deploy binds it, so it is usually there: read it with
   `npx wrangler dispatch-namespace get sites-<env>` (from any template
   directory, or anywhere wrangler runs). Only when that reports it missing,
   create it, with the `cf` CLI
   (`cf workers-for-platforms dispatch-namespaces create --name sites-<env>`)
   or with wrangler (`npx wrangler dispatch-namespace create sites-<env>`),
   whichever the operator uses.
2. **The template's cache namespace**, one per template per environment,
   never shared between environments:
   `npx wrangler kv namespace create backgold-<key>-<env>-cache`. Copy the
   `id` it prints (32 hex characters).
3. **The repository secret** `<KEY>_<ENV>_KV_ID` (`PARTY_STAGING_KV_ID`,
   `ACADEMY_PRODUCTION_KV_ID`, ...) holding that id:
   `gh secret set <KEY>_<ENV>_KV_ID --body <id> -R BackGoldHQ/sites`. It is
   the only secret a template adds.
4. **`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`**, repository secrets
   under **Settings → Secrets and variables → Actions** (or `gh secret set …
   -R BackGoldHQ/sites`), shared by every job. The deploy jobs stop before
   deploying while `CLOUDFLARE_API_TOKEN` is unset. This repository is the
   only one that deploys the template Workers.
5. **The api must already carry the `FirstParty` entrypoint** in that
   environment, because the service binding names the api Worker and that
   export. The script cannot fix this; if the environment's api predates it,
   run the platform repository's deploy first (staging deploys on its every
   push to `main`; production from its Release workflow).
6. Run the job: for staging, push to `main` or run Deploy staging by hand;
   for production, Actions → Release → Run workflow on `main`, which deploys
   every template, one job each.

The api dispatches a site to `template-<key>` once the platform knows the
template key (`SITE_TEMPLATE_KEYS` in the platform's shared package, which
the sites repository's `templates-drift` check in the platform keeps in step
with the manifests here).

### Unlabeled

`template-unlabeled` is one organization's one-of-one template. Deploy it
after the platform's embed look accepts `ubuntu-sans-mono`: the api drops a
frame's whole look (its colours too) when its `font` is one it does not
know.
