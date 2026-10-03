#!/usr/bin/env node
// `backgold-content types --out <file>`: implemented by task w9a-content-types-codegen.
import('../dist/cli.js').then((m) => m.main(process.argv.slice(2)))
