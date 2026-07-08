#!/usr/bin/env node
// Acceptance check for Task 04 (migration-cut).
// Run from the materialized sandbox repo root:
//   node .bench/checks/task-04.mjs
// Exit 0 = PASS, exit 1 = FAIL.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TASK = '04';
const failures = [];

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
  const api = await load('src/api.js');

  if (typeof api.listItems !== 'function') {
    failures.push('listItems is not exported from src/api.js');
  } else {
    const items = api.listItems();
    ok(Array.isArray(items) && items.length > 0, 'listItems returns the store contents');
  }
  ok(!('getItems' in api), 'getItems must be gone from src/api.js (no compat alias)');

  const srcDir = path.join(process.cwd(), 'src');
  for (const file of fs.readdirSync(srcDir).sort()) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
    ok(!/\bgetItems\b/.test(source), `getItems identifier still present in src/${file}`);
  }

  const rep = await load('src/report.js');
  const rows = rep.reportByCategory();
  ok(Array.isArray(rows) && rows.length > 0, 'reportByCategory() still works (store-backed)');
  const inv = await load('src/inventory.js');
  ok(typeof inv.totalValue() === 'number', 'totalValue() still works (store-backed)');
} catch (err) {
  failures.push(`unexpected error: ${err?.message ?? String(err)}`);
}
finish();
