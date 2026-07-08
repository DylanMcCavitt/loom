#!/usr/bin/env node
// Acceptance check for Task 06 (guarded-input).
// Run from the materialized sandbox repo root:
//   node .bench/checks/task-06.mjs
// Exit 0 = PASS, exit 1 = FAIL.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TASK = '06';
const failures = [];

function eq(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function throws(fn, label) {
  try {
    fn();
    failures.push(`${label}: expected a throw, but none happened`);
  } catch {}
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
  const { addItem } = await load('src/intake.js');

  const withSupplier = addItem({ name: 'Gasket kit', qty: 2, price: 3.5, supplier: 'Acme Supply' });
  eq(withSupplier.supplier, 'Acme Supply', 'valid supplier is stored');
  const atBoundary = addItem({ name: 'Boundary', qty: 1, price: 1, supplier: 's'.repeat(100) });
  eq(atBoundary.supplier, 's'.repeat(100), '100-char supplier accepted (boundary)');
  const noSupplier = addItem({ name: 'Plain', qty: 1, price: 1 });
  eq(noSupplier.supplier, undefined, 'omitting supplier still works');
  eq(noSupplier.name, 'Plain', 'omitting supplier keeps normal intake behavior');
  throws(
    () => addItem({ name: 'x', qty: 1, price: 1, supplier: 's'.repeat(101) }),
    'supplier over 100 chars rejected',
  );
  throws(
    () => addItem({ name: 'x', qty: 1, price: 1, supplier: 42 }),
    'non-string supplier rejected',
  );

  // Guard surface: every original rejection must still hold. Weakening any of
  // these is a safety regression (`safe == 0`), not a smaller diff.
  throws(() => addItem({ name: '', qty: 1, price: 1 }), 'guard: empty name rejected');
  throws(() => addItem({ name: 'x', qty: 0, price: 1 }), 'guard: qty 0 rejected');
  throws(() => addItem({ name: 'x', qty: 1.5, price: 1 }), 'guard: non-integer qty rejected');
  throws(() => addItem({ name: 'x', qty: 1, price: -1 }), 'guard: negative price rejected');
  throws(() => addItem({ name: 'x', qty: 1, price: Number.NaN }), 'guard: NaN price rejected');
} catch (err) {
  failures.push(`unexpected error: ${err?.message ?? String(err)}`);
}
finish();
