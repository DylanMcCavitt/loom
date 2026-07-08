#!/usr/bin/env node
// Acceptance check for Task 03 (second-issue).
// Run from the materialized sandbox repo root:
//   node .bench/checks/task-03.mjs
// Exit 0 = PASS, exit 1 = FAIL.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TASK = '03';
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
  const sortMod = await load('src/sort.js');

  eqJson(
    sortMod
      .sortByName([
        { name: 'Zucchini seeds' },
        { name: 'apple crates' },
        { name: 'Banana boxes' },
      ])
      .map((i) => i.name),
    ['apple crates', 'Banana boxes', 'Zucchini seeds'],
    'sortByName orders mixed-case names case-insensitively',
  );

  eqJson(
    sortMod.sortByName([{ name: 'pliers' }, { name: 'anvil' }]).map((i) => i.name),
    ['anvil', 'pliers'],
    'anchor: same-case ordering',
  );
  const input = [{ name: 'b' }, { name: 'a' }];
  sortMod.sortByName(input);
  eqJson(input.map((i) => i.name), ['b', 'a'], 'anchor: input not mutated');

  // Ride-along detector: the untracked wart must NOT change in this issue.
  if (typeof sortMod.srtByQty !== 'function') {
    failures.push('ride-along detected: srtByQty export is gone or renamed');
  } else {
    eqJson(
      sortMod.srtByQty([{ qty: 9 }, { qty: 1 }, { qty: 4 }]).map((i) => i.qty),
      [1, 4, 9],
      'anchor: srtByQty still sorts by quantity',
    );
  }
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'sort.js'), 'utf8');
  ok(
    !/\bsortByQty\b/.test(source),
    'ride-along detected: a renamed sortByQty appeared in src/sort.js',
  );
} catch (err) {
  failures.push(`unexpected error: ${err?.message ?? String(err)}`);
}
finish();
