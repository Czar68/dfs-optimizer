#!/usr/bin/env node
// Fresh data pipeline: Odds API props (fetch_oddsapi_props), no SGO.
const path = require('path');

try {
  require('ts-node').register({ transpileOnly: true });
} catch (e) {
  console.error('ts-node not found. Run: npm install');
  process.exit(1);
}

// Main entry: run_optimizer (fetch PP/UD, merge odds via fetchOddsAPIProps, build cards, export CSVs)
require(path.join(__dirname, '..', 'src', 'run_optimizer'));
