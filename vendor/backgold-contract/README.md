# @backgold/contract

The BackGold Content API contract (`/api/content/v1`): its response types, the
example responses, the built-in content types and the site template manifest
schema, plus the request headers a site's Worker sends (`api-operations`:
`SITE_HEADER`, `SITE_TOKEN_HEADER`, `ORG_HEADER`) and what a custom site's
deploys are held to (`site-deploys`: `SITE_DEPLOY_LIMITS`, the token prefix
and scopes, the module, var, secret and preview name rules, the preview
hosts). It is the platform's `packages/shared` `build:contract` output, copied
here so this repository builds and tests against a fixed version of the
contract without depending on the platform.

Everything here except this file and `package.json` is generated. Do not edit
it; pull a new snapshot from a platform checkout instead:

```bash
node scripts/contract-pull.mjs <platform checkout>
```

The script refuses a checkout with uncommitted changes under `packages/shared`.
`CONTRACT.json` names the platform commit and branch the snapshot was built
from, and the date it was pulled.

The package is private to this workspace and never published. `@backgold/content`,
`@backgold/astro`, `@backgold/template-kit` and `@backgold/cli` bundle what they
use of it at build (a devDependency, so tsup bundles it; `dts.resolve` where a
declaration names it), so the published tarballs carry no dependency on it.
