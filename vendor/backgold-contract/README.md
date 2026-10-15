# @backgold/contract

The BackGold Content API contract (`/api/content/v1`): its response types, the
example responses, the built-in content types and the site template manifest
schema. It is the platform's `packages/shared` `build:contract` output, copied
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

The package is private to this workspace and never published. `@backgold/content`
bundles what it uses of it at build (tsup `noExternal` for the modules,
`dts.resolve` for the declarations), so the published tarballs carry no
dependency on it. `@backgold/astro` uses it only in its tests.
