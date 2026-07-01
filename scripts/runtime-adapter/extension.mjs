// Supplementary OMP runtime extension for the runtime control adapter (Linear LOO-11).
//
// SUPPLEMENTARY, NOT PRIMARY. The cross-harness control surface is the MCP server →
// RPC host (`omp --mode rpc`) shipped in this same directory (adapter.mjs / rpc-host.mjs /
// server.mjs, PR #71). This extension exists ONLY for the few needs RPC mode cannot cover
// in-process: custom in-OMP slash commands, tool-call policy interception, and (future)
// `session_stop` continuation. See docs/harness/omp-runtime-adapter-contract.md §5
// ("Transport: RPC host + supplementary extension + CLI"). Everything that can be done over
// RPC MUST stay on the RPC path; do not grow this file into a second control plane.
//
// API: this uses the CURRENT Extensions API (`ExtensionAPI`, loaded via `omp --extension`),
// NOT the legacy hooks subsystem. The decision and rationale are recorded in LOO-1
// (the runtime-adapter contract, §5 + "Open questions — resolved"): the hooks subsystem is
// superseded (`--hook` is aliased to `--extension`), so author against extensions.
//
//   import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
//   export default function ompRuntimeExtension(pi: ExtensionAPI) { ... }
//
// VERSION PIN: the Extensions API surface is actively consolidating. This module is written
// and verified against the omp version pinned by the adapter contract — `omp/16.0.5`
// (distributions/snapshots/omp-builtins/source.json, cited by LOO-1). Re-verify `omp://extensions.md`
// and bump OMP_VERSION_PIN before trusting this extension on a newer omp.
//
// Loadable in principle via:  omp --extension scripts/runtime-adapter/extension.mjs
// It registers nothing at import time beyond the factory; all runtime behavior fires from the
// tool_call event handler and the slash command (runtime action methods are unavailable during
// extension load — register first, act from events/commands).

/** omp version this extension was authored/verified against (see LOO-1 contract). */
export const OMP_VERSION_PIN = "omp/16.0.5";

/** Label shown for this extension's contributions in the OMP UI. */
const LABEL = "Runtime Adapter (supplementary)";

/**
 * Classify an obviously-dangerous shell command. Returns a short human reason when the command
 * matches a hard-blocked pattern, or `null` when it should be allowed to run.
 *
 * Deliberately narrow: this guard only refuses commands that are unambiguously destructive at the
 * machine level (irreversible recursive deletes, raw block-device writes). It is NOT a general
 * safety sandbox — the deny-by-default policy/tier gating for cross-harness ops lives in the RPC
 * adapter (policy.mjs). This is an in-process backstop for tool calls the model issues directly.
 */
function classifyDanger(command) {
  const c = command.toLowerCase();

  // Recursive, forced delete: `rm -rf`, `rm -fr`, `rm -r -f`, `rm --recursive --force`, etc.
  if (/\brm\b/.test(c) && /(-[a-z]*r|--recursive)/.test(c) && /(-[a-z]*f|--force)/.test(c)) {
    return "recursive force-delete (rm -rf) is blocked by runtime-adapter policy";
  }

  // Raw block-device / filesystem destruction: `mkfs ...`, `dd ... of=/dev/...`, `> /dev/sdX`.
  if (/\bmkfs\b/.test(c) || /\bdd\b[^\n]*\bof=\/dev\//.test(c) || />\s*\/dev\/(sd|nvme|disk)/.test(c)) {
    return "raw block-device write is blocked by runtime-adapter policy";
  }

  return null;
}

/**
 * Collect benign, read-only session metadata for the `/runtime-info` command. Strictly
 * non-egressing: no transcript, no message contents, no secrets, no provider auth — only the
 * derived runtime facts the caller already controls (cwd, current model id, idle/pending flags).
 * Mirrors the Tier-R "metadata only" stance of the RPC adapter. Every field access is defensive
 * so the handler never throws on a partial context.
 */
function benignMetadata(ctx) {
  const model = ctx?.model;
  const modelId = typeof model === "string" ? model : (model?.id ?? null);
  return {
    label: LABEL,
    ompVersionPin: OMP_VERSION_PIN,
    cwd: typeof ctx?.cwd === "string" ? ctx.cwd : null,
    model: modelId,
    idle: typeof ctx?.isIdle === "function" ? Boolean(ctx.isIdle()) : null,
    pendingMessages: typeof ctx?.hasPendingMessages === "function" ? Boolean(ctx.hasPendingMessages()) : null,
  };
}

/**
 * Default factory — the only export OMP's loader uses. Registers one representative capability of
 * each supplementary kind: a `tool_call` policy guard and a read-only slash command.
 *
 * @param {import("@oh-my-pi/pi-coding-agent").ExtensionAPI} pi
 */
export default function ompRuntimeExtension(pi) {
  if (typeof pi?.setLabel === "function") {
    pi.setLabel(LABEL);
  }

  // (1) Tool-call policy interception — a fail-closed guard on direct bash tool calls. RPC mode
  // cannot intercept the model's own tool execution, so this is a genuine "RPC can't cover it"
  // need. Returning `{ block: true, reason }` refuses the call; returning nothing allows it.
  pi.on("tool_call", async (event) => {
    if (!event || event.toolName !== "bash") return;
    const command = event.input?.command;
    if (typeof command !== "string") return;
    const reason = classifyDanger(command);
    if (reason) {
      return { block: true, reason: `[runtime-adapter] ${reason}` };
    }
    // Allow: no return value === permit execution.
  });

  // (2) Read-only slash command — surfaces benign runtime metadata in-session. A custom in-OMP
  // command is exactly the kind of UX the RPC adapter (a separate process) cannot contribute, so
  // it belongs here. It only reads/notifies; it performs no mutation and no content egress.
  pi.registerCommand("runtime-info", {
    description: "Show benign runtime-adapter session metadata (read-only).",
    handler: async (_args, ctx) => {
      const meta = benignMetadata(ctx);
      ctx?.ui?.notify?.(
        `runtime-adapter ${meta.ompVersionPin} · model=${meta.model ?? "?"} · cwd=${meta.cwd ?? "?"}`,
        "info",
      );
      // Returned for programmatic/headless callers and hermetic tests; harmless in interactive use.
      return meta;
    },
  });
}
