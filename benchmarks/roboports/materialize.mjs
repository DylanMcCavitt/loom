#!/usr/bin/env node
// Materialize the roboports benchmark sandbox into a fresh throwaway git repo.
//
//   node materialize.mjs --dest <dir> [--force]
//
// Copies template/ into <dest> as the app, tasks/ and checks/ into
// <dest>/.bench/, then creates the baseline commit. Safety posture:
// - --dest is required and must NOT be inside this (Loom) repo.
// - An existing dest containing a .git directory is always refused.
// - An existing non-empty dest is refused unless --force; even with --force
//   nothing is ever deleted, files are only written.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultLoomRoot = fs.realpathSync(path.resolve(here, '..', '..'));

function die(msg) {
  console.error(`materialize: ${msg}`);
  process.exit(1);
}

export function parseMaterializeArgs(argv) {
  let dest = null;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dest') dest = argv[++i];
    else if (arg === '--force') force = true;
    else die(`unknown argument: ${arg}`);
  }
  if (!dest) die('--dest <dir> is required');
  return { dest, force };
}

// Resolve dest against the realpath of its deepest existing ancestor so
// symlinked paths (e.g. /tmp on macOS) cannot dodge the inside-repo guard.
export function resolveReal(p) {
  let current = path.resolve(p);
  const pending = [];
  while (!fs.existsSync(current)) {
    pending.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...pending);
}

function git(args, cwd, label) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.error) throw new Error(`${label} failed: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${label} failed: ${res.stderr.trim() || res.stdout.trim()}`);
  return res.stdout.trim();
}

export function materializeRoboportsSandbox({ dest, force = false, sourceDir = here, loomRoot = defaultLoomRoot } = {}) {
  if (!dest) throw new Error('--dest <dir> is required');

  const destReal = resolveReal(dest);
  const loomReal = fs.realpathSync(loomRoot);

  if (destReal === loomReal || destReal.startsWith(loomReal + path.sep)) {
    throw new Error(`refusing to materialize inside the Loom repo (${loomReal}); pick a throwaway location such as a temp dir`);
  }

  if (fs.existsSync(destReal)) {
    if (!fs.statSync(destReal).isDirectory()) {
      throw new Error(`dest exists and is not a directory: ${destReal}`);
    }
    if (fs.existsSync(path.join(destReal, '.git'))) {
      throw new Error(`dest already contains a .git directory: ${destReal} — refusing (even with --force; nothing is ever deleted)`);
    }
    if (fs.readdirSync(destReal).length > 0 && !force) {
      throw new Error(`dest is not empty: ${destReal} (pass --force to write into it anyway; existing files are never deleted)`);
    }
  } else {
    fs.mkdirSync(destReal, { recursive: true });
  }

  fs.cpSync(path.join(sourceDir, 'template'), destReal, { recursive: true });
  fs.cpSync(path.join(sourceDir, 'tasks'), path.join(destReal, '.bench', 'tasks'), { recursive: true });
  fs.cpSync(path.join(sourceDir, 'checks'), path.join(destReal, '.bench', 'checks'), { recursive: true });

  git(['init', '--quiet'], destReal, 'git init');
  fs.appendFileSync(
    path.join(destReal, '.git', 'info', 'exclude'),
    '\n# Loom benchmark runtime marker\n.bench/baseline.txt\n',
  );
  git(['add', '-A'], destReal, 'git add');
  git(
    [
      '-c', 'user.name=bench',
      '-c', 'user.email=bench@localhost',
      'commit', '--quiet', '--no-gpg-sign',
      '-m', 'roboports-sandbox: baseline',
    ],
    destReal,
    'git commit',
  );
  const baseline = git(['rev-parse', 'HEAD'], destReal, 'git rev-parse');
  fs.writeFileSync(path.join(destReal, '.bench', 'baseline.txt'), `${baseline}\n`);

  return { dest: destReal, baseline };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const { dest, force } = parseMaterializeArgs(argv);
    const result = materializeRoboportsSandbox({ dest, force });
    console.log(`materialized: ${result.dest}`);
    console.log(`baseline commit: ${result.baseline}`);
  } catch (error) {
    die(error.message);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
