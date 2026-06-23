// CLI runner for the OMP runtime control adapter (LOO-12).
//
// Supplementary saved-file backend. A few adapter ops have no verified RPC command but ARE
// reachable through the `omp` CLI operating on a saved session file. This module spawns the real
// `omp` binary for those ops and returns its captured output. It is INJECTED into RuntimeAdapter
// (mirroring makeRpcHost) so tests substitute a hermetic fake and never spawn the real agent.
//
// Verified omp/16.0.5 flags (`omp --help`; dist/cli.js export branch):
//   --export=<sessionfile>     export a saved session file to HTML and exit (one-shot, exits 0).
//                              The first positional after the flag is an optional output path —
//                              `omp --export <session.jsonl> <out.html>` — so we hand omp a path
//                              inside a throwaway dir and read the HTML back deterministically.
//   -r, --resume=<id|path>     open/resume a saved session — INTERACTIVE (TUI/picker), no one-shot
//                              completion, so it is intentionally NOT wired as an adapter op here.
// There is NO `--session-file` flag.
//
// Every value this runner returns (HTML, paths) is content egress; the adapter scrubs it through
// scrubSecrets before it can leave. The runner itself never returns raw session content unscrubbed
// to any other caller — the adapter is its only consumer.

import { spawn as nodeSpawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Spawn `command args…`, collect stdout/stderr, resolve `{ stdout, stderr, code }` on a clean exit
// and reject on spawn error, non-zero exit, or timeout. Dependency-free.
function spawnCapture(spawnFn, command, args, { cwd, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      settle(reject, new Error(`omp CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => settle(reject, err));
    child.on("close", (code) => {
      if (code === 0) settle(resolve, { stdout, stderr, code });
      else settle(reject, new Error(`omp CLI exited with code ${code}: ${(stderr || stdout).trim()}`));
    });
  });
}

// `omp --export <sessionFile> <outPath>`: export the saved transcript to HTML, then read it back.
// We pass an explicit output path inside a throwaway dir so the read is deterministic; if a future
// omp ignores the positional output path, we fall back to the `Exported to: <path>` stdout line.
async function runExport({ command, spawnFn, timeoutMs, makeWorkDir, sessionId, sessionFile }) {
  const workDir = makeWorkDir();
  const outPath = path.join(workDir, "transcript-export.html");
  try {
    const { stdout } = await spawnCapture(spawnFn, command, ["--export", sessionFile, outPath], { cwd: workDir, timeoutMs });
    let content;
    try {
      content = readFileSync(outPath, "utf8");
    } catch {
      const match = /Exported to:\s*(.+?)\s*$/m.exec(stdout);
      if (!match) throw new Error("omp --export produced no HTML output");
      const reported = match[1].trim();
      const abs = path.isAbsolute(reported) ? reported : path.join(workDir, reported);
      content = readFileSync(abs, "utf8");
    }
    return { op: "transcript.export", sessionId, format: "html", bytes: Buffer.byteLength(content), content };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// Build the `runCli({ verb, sessionId, sessionFile })` function the adapter dispatches saved-file
// ops through. Options (`command`, `spawnFn`, `timeoutMs`, `makeWorkDir`) are injectable for tests.
export function makeCliRunner(options = {}) {
  const command = options.command ?? "omp";
  const spawnFn = options.spawnFn ?? nodeSpawn;
  const timeoutMs = options.timeoutMs ?? 60000;
  const makeWorkDir = options.makeWorkDir ?? (() => mkdtempSync(path.join(tmpdir(), "omp-cli-export-")));

  return async function runCli({ verb, sessionId, sessionFile } = {}) {
    switch (verb) {
      case "export":
        return runExport({ command, spawnFn, timeoutMs, makeWorkDir, sessionId, sessionFile });
      default:
        throw new Error(`unsupported CLI verb: ${verb}`);
    }
  };
}
