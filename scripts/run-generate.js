#!/usr/bin/env node
const path = require('path');

try {
  require('ts-node').register({ transpileOnly: true });
} catch (e) {
  console.error('ts-node not found. Run: npm install');
  process.exit(1);
}

// Main entry: run_optimizer (fetch PP/UD, merge odds, build cards, export CSVs)
require(path.join(__dirname, '..', 'src', 'run_optimizer'));
