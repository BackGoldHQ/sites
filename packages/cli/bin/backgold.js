#!/usr/bin/env node
// `backgold`: deploys a built site to BackGold hosting (src/cli.ts).
import('../dist/cli.js').then((m) => m.main(process.argv.slice(2)))
