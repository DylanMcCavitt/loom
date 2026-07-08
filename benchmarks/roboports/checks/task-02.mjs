#!/usr/bin/env node
// Acceptance check for Task 02 (reuse-util).
// Run from the materialized sandbox repo root:
//   node .bench/checks/task-02.mjs
// Exit 0 = PASS, exit 1 = FAIL.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TASK = '02';
const failures = [];

function eqJson(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${label}: expected ${e}, got ${a}`);
}
function ok(cond, label) {
  if (!cond) failures.push(label);
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
  const rep = await load('src/report.js');

  if (typeof rep.reportBySupplier !== 'function') {
    failures.push('reportBySupplier is not exported from src/report.js');
  } else {
    const items = [
      { name: 'bolts', category: 'fasteners', supplier: 'Acme Supply', qty: 2, price: 5 },
      { name: 'goggles', category: 'safety', supplier: 'ShieldWorks', qty: 1, price: 10 },
      { name: 'hammer', category: 'tools', supplier: 'Acme Supply', qty: 3, price: 1 },
      { name: 'rags', category: 'consumables', qty: 4, price: 0.5 },
    ];
    eqJson(
      rep.reportBySupplier(items),
      [
        { supplier: 'Acme Supply', itemCount: 2, totalQty: 5, totalValue: 13 },
        { supplier: 'ShieldWorks', itemCount: 1, totalQty: 1, totalValue: 10 },
        { supplier: 'unknown', itemCount: 1, totalQty: 4, totalValue: 2 },
      ],
      'reportBySupplier groups, totals, and orders by supplier',
    );
  }

  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'report.js'), 'utf8');
  ok(/\bgroupBy\b/.test(source), 'src/report.js references groupBy');
  ok(
    /from\s+['"]\.\/util\.js['"]/.test(source),
    'src/report.js imports from ./util.js',
  );

  eqJson(
    rep.reportByCategory([
      { name: 'hammer', category: 'tools', qty: 1, price: 14.5 },
      { name: 'bolts', category: 'fasteners', qty: 10, price: 0.12 },
    ]),
    [
      { category: 'fasteners', name: 'bolts', qty: 10, lineValue: 1.2 },
      { category: 'tools', name: 'hammer', qty: 1, lineValue: 14.5 },
    ],
    'anchor: reportByCategory unchanged',
  );
} catch (err) {
  failures.push(`unexpected error: ${err?.message ?? String(err)}`);
}
finish();
