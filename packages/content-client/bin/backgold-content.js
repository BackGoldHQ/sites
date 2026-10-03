#!/usr/bin/env node
// `backgold-content types --out <file>`: writes typed fields for a site's content types (src/cli.ts).
import('../dist/cli.js').then((m) => m.main(process.argv.slice(2)))
