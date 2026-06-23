#!/usr/bin/env node
// Mock `omp --mode rpc` for hermetic LOO-7/LOO-10 tests. Conforms to the VERIFIED omp/16.0.5 RPC
// wire shape (docs/harness/omp-runtime-adapter-contract.md §5; dist/types/modes/rpc/rpc-types.d.ts):
//   - emits one `{ type: "ready" }` frame at startup;
//   - reads requests `{ id?, type, ...inline params }` (command name is `type`, params inlined);
//   - answers with `{ id?, type: "response", command, success: true, data? }` on success and
//     `{ id?, type: "response", command, success: false, error }` on failure, echoing the `id`.
// Data payloads mirror the real result types (RpcSessionState, SessionStats, Model, …) but are
// SYNTHETIC. get_state intentionally carries a secret-looking string and a /Users/ path so the
// adapter's redaction/projection is exercised; both are fabricated (tests/ is outside the
// safety-gate source-scan scope) — no real session content, path, or secret is present here.

import { createInterface } from "node:readline";

process.stdout.write(`${JSON.stringify({ type: "ready" })}\n`);

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  const { id, type } = message;
  // Params are inlined on the frame, not nested under `params`.
  const reply = (data) =>
    process.stdout.write(
      `${JSON.stringify(
        data === undefined
          ? { id, type: "response", command: type, success: true }
          : { id, type: "response", command: type, success: true, data },
      )}\n`,
    );
  const fail = (error) =>
    process.stdout.write(`${JSON.stringify({ id, type: "response", command: type, success: false, error })}\n`);

  switch (type) {
    case "get_state":
      // RpcSessionState (subset). `sessionFile`/`note` are synthetic redaction bait.
      return reply({
        model: { provider: "pi", id: "default" },
        thinkingLevel: "medium",
        isStreaming: false,
        isCompacting: false,
        steeringMode: "one-at-a-time",
        followUpMode: "one-at-a-time",
        interruptMode: "immediate",
        sessionFile: "/Users/dev/project/.omp/agent/sessions/mock.jsonl",
        sessionId: "mock",
        sessionName: "Mock Session",
        autoCompactionEnabled: true,
        messageCount: 2,
        queuedMessageCount: 0,
        todoPhases: [],
        contextUsage: { tokens: 1100, contextWindow: 200000, percent: 0.55 },
        note: "token = ABCDEFGHIJKLMNOP1234567890",
      });
    case "get_session_stats":
      // SessionStats (verified shape: counts + a nested token breakdown, no raw content).
      return reply({
        sessionFile: "/Users/dev/project/.omp/agent/sessions/mock.jsonl",
        sessionId: "mock",
        userMessages: 5,
        assistantMessages: 7,
        toolCalls: 9,
        toolResults: 9,
        totalMessages: 12,
        tokens: { input: 2000, output: 1456, cacheRead: 0, cacheWrite: 0, total: 3456 },
        premiumRequests: 3,
        cost: 0.12,
      });
    case "set_session_name":
      // Real `set_session_name` success carries NO data; empty name is rejected.
      if (typeof message.name !== "string" || message.name.length === 0) return fail("Session name cannot be empty");
      return reply();
    case "set_model":
      // Params are `provider` + `modelId`; data is the resolved Model.
      return reply({ provider: message.provider ?? "pi", id: message.modelId ?? "default" });
    case "compact":
      // CompactionResult (subset).
      return reply({ summary: "compacted", firstKeptEntryId: "entry-1", tokensBefore: 1000 });
    case "branch":
      return reply({ text: "branched", cancelled: false });
    case "new_session":
      return reply({ cancelled: false });
    case "switch_session":
      return reply({ cancelled: false });
    case "get_messages":
      return reply({ messages: [{ role: "user", content: "raw transcript" }] });
    case "login":
      return reply({ providerId: message.providerId ?? "anthropic" });
    default:
      return fail(`Unknown command: ${type}`);
  }
});
