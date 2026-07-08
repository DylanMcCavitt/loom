#!/usr/bin/env node
// Acceptance check for Task 05 (one-liner).
// Run from the materialized sandbox repo root:
//   node .bench/checks/task-05.mjs
// Exit 0 = PASS, exit 1 = FAIL.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TASK = '05';
const failures = [];

function eq(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function load(rel) {
  return import(pathToFileURL(path.join(process.cwd(), rel)).href);
}
function finish() {
  if (failures.length === 0) {
    console.log(`PASS task-${TASK}`);
    process.exit(0);
  }
  console.log(`FAIL task-${TASK}`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

try {
  const { bulkDiscount } = await load('src/discount.js');

  eq(bulkDiscount(10, 10), 90, 'discount applies at exactly 10 units');

  eq(bulkDiscount(9, 10), 90, 'anchor: 9 units pays full price');
  eq(bulkDiscount(11, 10), 99, 'anchor: 11 units still discounted');
  eq(bulkDiscount(11, 0.33), 3.27, 'anchor: rounding unchanged');
  eq(bulkDiscount(0, 12.5), 0, 'anchor: zero units is zero');
} catch (err) {
  failures.push(`unexpected error: ${err?.message ?? String(err)}`);
}
finish();
