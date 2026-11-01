# @backgold/template-kit

What every BackGold Astro template draws the same way: the section, entry and
chrome components, the Site layout, the routes, `lib/` and the stylesheets,
shipped as source and compiled by the template's own Vite, plus an Astro
integration (`templateKit({ template: './src/template.ts' })`) that serves the
routes with a template's config, and the Content API contract names the
templates use (`@backgold/template-kit/contract/site-templates`,
`@backgold/template-kit/contract/content-api`). BackGold's templates in
[github.com/BackGoldHQ/sites](https://github.com/BackGoldHQ/sites) depend on
it, and so does a project made from one with `npx backgold eject`
([`@backgold/cli`](https://www.npmjs.com/package/@backgold/cli)), which pins
the exact version its template was published with. MIT.
