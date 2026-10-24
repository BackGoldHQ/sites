# @backgold/cli

The `backgold` command: deploys an Astro site built on
[`@backgold/astro`](https://www.npmjs.com/package/@backgold/astro) to
BackGold hosting. BackGold runs the site for you, on its own Cloudflare
account: you need no Cloudflare account, no KV namespace and no site keys.
Every deploy is kept, so you can try one at a preview name before it goes
live, make any kept deploy live again in a second, and roll back the same way.

The [BackGold starter](https://gitlab.com/backgold/backgold-starter) already
has it. To add it to another site on `@backgold/astro` and the Cloudflare
adapter:

```bash
npm install --save-dev @backgold/cli
```

Requires Node 22.12 or later.

## Link the site

You need a **deploy token** for the site: in BackGold, open **Sites**, choose
the site, then **Developer**, and make one. It starts with `bg_deploy_`, is
shown once, and opens only that one site. Then, in the site's directory:

```bash
npx backgold link
```

`link` asks for the token (it is not shown as you type), checks it with
BackGold and writes `backgold.json`:

```json
{ "site": "<the site's id>", "api": "https://api.backgold.com" }
```

Commit `backgold.json`; it holds nothing secret. The token itself is never
written anywhere. Every other command reads it from the environment variable
`BACKGOLD_DEPLOY_TOKEN`: keep it in your shell's environment, a password
manager, or your CI's secret variables, never in the repository.

## Deploy

```bash
npx backgold deploy                       # build, upload, wait until it is ready
npx backgold deploy --promote             # the same, then make it the live site
npx backgold deploy --preview my-branch   # point the preview "my-branch" at it
```

`deploy` runs `npm run build` (`--build-command <cmd>` runs another;
`--no-build` deploys what `dist/` already holds), reads the Worker the
Cloudflare adapter wrote under `dist/`, uploads the static files BackGold does
not already have and the Worker, and waits until the deploy is ready (at most
ten minutes). It prints the deploy's id and whether it is live. A deploy that
fails prints the reason and exits 1; nothing about the live site changes.

What a deploy carries:

- the Worker's modules (`dist/server`, source maps left out) and the static
  files (`dist/client`, less what `.assetsignore` names);
- `_headers` and `_redirects`, which apply to the static files as on
  Cloudflare;
- the `vars` in your `wrangler.jsonc` with text values. BackGold sets every
  `BACKGOLD_*` name and `ENVIRONMENT` itself, so those are left out, as are
  your bindings (KV, D1, R2 and the rest): BackGold gives the site its own
  cache and its own connection to your organization's content, with no keys;
- `template.json`, when the project has one.

Limits: the Worker's modules 10 MiB; 20,000 static files, 25 MiB each and
250 MiB in all; `_headers` and `_redirects` 64 KiB each; 64 vars of 5 KiB.
The compatibility flags may be `nodejs_compat` and
`global_fetch_strictly_public`. A build over a limit stops before anything is
uploaded and names the limit.

The build runs with your environment, less `BACKGOLD_DEPLOY_TOKEN`: a build
can copy environment variables into the Worker it writes, and the token must
never end up there.

## Deploys, promote and rollback

```bash
npx backgold deploys           # the kept deploys, newest first; which is live
npx backgold promote 7f3a91c2  # make that deploy live (the id, or its start)
npx backgold rollback          # the newest ready deploy older than the live one, live again
npx backgold rollback 7f3a91c2 # or the one you name
```

Promote and rollback upload nothing: they move the live site to a deploy
BackGold already holds, so they take a second.

## Previews

```bash
npx backgold previews                    # each preview name and the deploy it shows
npx backgold previews --delete my-branch
```

A preview name points at one deploy; deploying with the same
`--preview <name>` moves it.

## Secrets

Values your site's server code reads, kept encrypted by BackGold and never
shown again:

```bash
npx backgold secrets set NEWSLETTER_API_KEY   # asks for the value; it is not shown
printf '%s' "$VALUE" | npx backgold secrets set NEWSLETTER_API_KEY
npx backgold secrets list                     # names and dates, no values
npx backgold secrets delete NEWSLETTER_API_KEY
```

A value is never a command-line argument. A change reaches the live site on
its next deploy. `BACKGOLD_*` names and `ENVIRONMENT` are reserved.

## From CI

The same commands, with the token in a masked, protected CI variable named
`BACKGOLD_DEPLOY_TOKEN`. GitLab CI:

```yaml
deploy:
  image: node:24
  script:
    - npm ci
    - npx backgold deploy --promote
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

preview:
  image: node:24
  script:
    - npm ci
    - npx backgold deploy --preview "$CI_COMMIT_REF_SLUG"
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

When `CI` is set, deploys are recorded as coming from CI, with the branch
and commit.

## Options

| Option | Commands | |
| --- | --- | --- |
| `--project <dir>` | all | The site's directory (default: the current one) |
| `--api <origin>` | all | The BackGold api (default: `backgold.json`'s `api`, else `https://api.backgold.com`) |
| `--token <token>` | all | A deploy token, instead of `BACKGOLD_DEPLOY_TOKEN`. Prefer the variable: a command line is visible to other processes on the machine |
| `--json` | all | Print BackGold's answer as JSON on stdout |
| `--help` | all | The command's usage |

Progress goes to stderr and the answer to stdout, so `--json` output can be
piped.

| Exit code | |
| --- | --- |
| 0 | Done |
| 1 | Failed: the deploy, the build, or a request BackGold refused |
| 2 | Usage, or a limit the build is over |
| 3 | No deploy token, or one BackGold refused |

## License

MIT
