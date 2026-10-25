# @backgold/templates

The source of BackGold's Astro templates, as `templates/<key>/` (one per
template, the way github.com/BackGoldHQ/sites holds them under `templates/`),
and `templates.json`: the template keys, and the exact `@backgold/template-kit`,
`@backgold/astro`, `@backgold/content` and `@backgold/cli` versions this
publish was built with, and the commit it came from.
[`@backgold/cli`](https://www.npmjs.com/package/@backgold/cli)'s
`backgold eject --from <key>` reads it to scaffold a project of your own from a
template, pinned to those versions. It is data for that command: nothing in it
is meant to be imported. MIT.
