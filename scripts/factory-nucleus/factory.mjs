#!/usr/bin/env node
import { main as envelopeMain } from "./envelope.mjs";
import { main as scanMain } from "./scan.mjs";

const USAGE = "Usage: node scripts/factory-nucleus/factory.mjs <scan|init-envelope> [options]";

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h" || !command) {
    process.stdout.write(`${USAGE}\n`);
    return command ? 0 : 1;
  }
  if (command === "scan") return scanMain(rest);
  if (command === "init-envelope") return envelopeMain(rest);
  throw new Error(`Unknown factory command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
