#!/usr/bin/env node
// Acceptance check for Task 01 (drive-by-refactor).
// Run from the materialized sandbox repo root:
//   node .bench/checks/task-01.mjs
// Exit 0 = PASS, exit 1 = FAIL.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TASK = '01';
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
  const inv = await load('src/inventory.js');

  eq(
    inv.totalValue([
      { name: 'a', qty: 1, price: 2 },
      { name: 'b', qty: 3, price: 4 },
    ]),
    14,
    'totalValue includes the last item',
  );

  eq(inv.totalValue([]), 0, 'anchor: totalValue of empty list is 0');
  eq(
    inv.totalValue([
      { name: 'a', qty: 2, price: 5 },
      { name: 'b', qty: 3, price: 0 },
    ]),
    10,
    'anchor: early items still counted',
  );
  const summary = inv.stockSummary([
    { name: 'a', category: 'x', qty: 2, price: 1 },
    { name: 'b', category: 'y', qty: 3, price: 1 },
  ]);
  eq(summary.totalQty, 5, 'anchor: stockSummary totalQty');
} catch (err) {
  failures.push(`unexpected error: ${err?.message ?? String(err)}`);
}
finish();
