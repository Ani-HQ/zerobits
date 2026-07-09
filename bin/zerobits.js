#!/usr/bin/env node
// zerobits CLI. Zero build step, zero required dependencies.
//   git clone https://github.com/anianroid/zerobits && node zerobits/bin/zerobits.js --help

import { run } from '../src/cli.js';

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`zerobits: ${err?.stack || err}\n`);
    process.exit(1);
  });
