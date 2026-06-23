import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { EventEmitter } from "node:events";

import { describeOps, getOp } from "../scripts/runtime-adapter/policy.mjs";
import { listSessions, resolveSelector } from "../scripts/runtime-adapter/selectors.mjs";
import { RuntimeAdapter } from "../scripts/runtime-adapter/adapter.mjs";
import { RpcHost } from "../scripts/runtime-adapter/rpc-host.mjs";
import { createServer } from "../scripts/runtime-adapter/server.mjs";
import { makeCliRunner } from "../scripts/runtime-adapter/cli-runner.mjs";

const mockOmp = new URL("./fixtures/mock-omp-rpc.mjs", import.meta.url).pathname;

const ID_A = "01900000-0000-7000-8000-000000000001";
const ID_B1 = "019edd27-e362-7000-89e5-b7ad26d21a59";
const ID_B2 = "019edd27-e362-7000-89e5-ffffffffffff";

function makeSessionsDir() {
  const root = mkdtemp_();
  const cwdDir = path.join(root, "work");
  mkdirSync(cwdDir, { recursive: true });
  for (const id of [ID_A, ID_B1, ID_B2]) {
    writeFileSync(path.join(cwdDir, `2026-06-18T23-53-59-394Z_${id}.jsonl`), '{"header":1}\n');
  }
  return root;
}

function mkdtemp_() {
  return mkdtempSync(path.join(tmpdir(), "loo7-sessions-"));
}

// In-process double of the RpcHost.request(command, params) API (resolves the response `data`
// payload). Independent of the wire frame shape — it exercises adapter gating/projection/redaction
// with deliberately hostile fields (a `messages` array, a secret-looking `note`, a /Users/ path).
function fakeHostFactory() {
  return async () => ({
    async request(command, params = {}) {
      switch (command) {
        case "get_state":
          return { sessionId: "mock", name: "Mock", model: "pi/default", cwd: "/Users/dev/project", note: "token = ABCDEFGHIJKLMNOP1234567890", messages: [{ role: "user" }, { role: "assistant" }] };
        case "get_session_stats":
          return { messages: 12, tokens: 3456 };
        case "set_session_name":
          // Verified: success carries no data payload.
          return undefined;
        case "set_model":
          // Verified params: provider + modelId; data is the resolved Model { provider, id }.
          return { provider: params.provider, id: params.modelId };
        default:
          throw new Error("unknown_command");
      }
    },
    async close() {},
  });
}

// Recording double of RpcHost.request that captures every dispatched (command, params) and answers
// the mutating commands with their VERIFIED success shapes (mirrors tests/fixtures/mock-omp-rpc.mjs).
// Lets a test prove an approved op reaches dispatch with the correct command name + verbatim params
// and returns the mapped result.
function recordingHostFactory() {
  const calls = [];
  const factory = async () => ({
    async request(command, params = {}) {
      calls.push({ command, params });
      switch (command) {
        case "set_session_name":
          if (typeof params.name !== "string" || params.name.length === 0) throw new Error("Session name cannot be empty");
          return undefined; // verified: success carries no data
        case "set_model":
          return { provider: params.provider, id: params.modelId };
        case "compact":
          return { summary: "compacted", firstKeptEntryId: "entry-1", tokensBefore: 1000 };
        case "branch":
          return { text: "branched", cancelled: false };
        case "new_session":
          return { cancelled: false };
        case "switch_session":
          return { cancelled: false };
        default:
          throw new Error(`unexpected command: ${command}`);
      }
    },
    async close() {},
  });
  return { factory, calls };
}

test("policy registry: tiers, deny flags, and discovery shape", () => {
  assert.equal(getOp("session.get").tier, "R");
  assert.equal(getOp("session.rename").tier, "M");
  assert.equal(getOp("model.set").tier, "D");
  assert.equal(getOp("nope"), null);
  const ops = describeOps();
  const transcript = ops.find((o) => o.op === "transcript.get");
  assert.equal(transcript.denied, true);
  assert.equal(transcript.egress, true);
});

test("selectors: required, ambiguous, no-match, and resolution by id/file", () => {
  const root = makeSessionsDir();
  try {
    assert.equal(listSessions(root).length, 3);
    assert.equal(resolveSelector({}, { sessionsDir: root }).error, "selector_required");
    assert.equal(resolveSelector({ session_id: "a", session_file: "b" }, { sessionsDir: root }).error, "selector_ambiguous");
    assert.equal(resolveSelector({ session_id: "deadbeef" }, { sessionsDir: root }).error, "selector_no_match");

    const ambiguous = resolveSelector({ session_id: "019edd27" }, { sessionsDir: root });
    assert.equal(ambiguous.error, "selector_ambiguous");
    assert.equal(ambiguous.candidates.length, 2);

    const single = resolveSelector({ session_id: "01900000" }, { sessionsDir: root });
    assert.equal(single.ok, true);
    assert.equal(single.sessionId, ID_A);

    const byFile = resolveSelector({ session_file: path.join(root, "work", `2026-06-18T23-53-59-394Z_${ID_A}.jsonl`) }, { sessionsDir: root });
    assert.equal(byFile.ok, true);
    assert.equal(byFile.sessionId, ID_A);

    const escape = resolveSelector({ session_file: path.join(root, "work", "..", "..", "..", "etc", "x.jsonl") }, { sessionsDir: root });
    assert.equal(escape.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter: unknown op is refused (deny-by-default)", async () => {
  const adapter = new RuntimeAdapter({ sessionsDir: makeSessionsDir(), makeRpcHost: fakeHostFactory() });
  const res = await adapter.handle({ op: "evil.delete_everything", selector: { session_id: "01900000" } });
  assert.equal(res.status, "refused");
  assert.equal(res.error, "unknown_op");
});

test("adapter: session.list is selector-exempt and returns ids only", async () => {
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory() });
  const res = await adapter.handle({ op: "session.list" });
  assert.equal(res.status, "ok");
  assert.equal(res.result.sessions.length, 3);
  assert.ok(res.result.sessions.every((s) => typeof s.sessionId === "string"));
  rmSync(root, { recursive: true, force: true });
});

test("adapter: Tier R returns metadata only and redacts secrets + home paths", async () => {
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory() });
  const res = await adapter.handle({ op: "session.get", selector: { session_id: "01900000" } });
  assert.equal(res.status, "ok");
  assert.equal(res.result.messages, undefined, "raw content dropped");
  assert.equal(res.result.messages_count, 2, "content reduced to a count");
  const serialized = JSON.stringify(res.result);
  assert.ok(!serialized.includes("/Users/"), "private home path redacted");
  assert.ok(!serialized.includes("ABCDEFGHIJKLMNOP"), "secret-looking value redacted");
  assert.equal(res.result.note, undefined, "non-allow-listed string not forwarded");
  assert.equal(typeof res.result.note_chars, "number", "unknown string reduced to a length");
  rmSync(root, { recursive: true, force: true });
});

test("adapter: Tier M requires a selector-bound token", async () => {
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory() });
  const first = await adapter.handle({ op: "session.rename", selector: { session_id: "01900000" }, params: { name: "X" } });
  assert.equal(first.status, "confirmation_required");
  assert.ok(first.confirmationToken);

  const ok = await adapter.handle({ op: "session.rename", selector: { session_id: "01900000" }, params: { name: "X" }, confirmationToken: first.confirmationToken });
  assert.equal(ok.status, "ok");
  assert.equal(ok.session.sessionId, ID_A, "rename reaches dispatch for the resolved session (no data payload)");

  // Token is bound to the session — A's token must not authorize B.
  const wrong = await adapter.handle({ op: "session.rename", selector: { session_id: ID_B1 }, params: { name: "X" }, confirmationToken: first.confirmationToken });
  assert.equal(wrong.status, "confirmation_required");
  rmSync(root, { recursive: true, force: true });
});

test("adapter: Tier D requires token then explicit approval", async () => {
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory() });
  const need = await adapter.handle({ op: "model.set", selector: { session_id: "01900000" }, params: { provider: "pi", modelId: "slow" } });
  assert.equal(need.status, "confirmation_required");

  const unapproved = await adapter.handle({ op: "model.set", selector: { session_id: "01900000" }, params: { provider: "pi", modelId: "slow" }, confirmationToken: need.confirmationToken });
  assert.equal(unapproved.status, "approval_required");

  const done = await adapter.handle({ op: "model.set", selector: { session_id: "01900000" }, params: { provider: "pi", modelId: "slow" }, confirmationToken: need.confirmationToken, approved: true });
  assert.equal(done.status, "ok");
  assert.equal(done.result.id, "slow");
  assert.equal(done.result.provider, "pi");
  rmSync(root, { recursive: true, force: true });
});

test("adapter: denied-by-default ops are refused", async () => {
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory() });
  const res = await adapter.handle({ op: "transcript.get", selector: { session_id: "01900000" } });
  assert.equal(res.status, "refused");
  assert.equal(res.error, "denied_by_default");
  rmSync(root, { recursive: true, force: true });
});

test("adapter: unsupported op reports not_implemented (after gating)", async () => {
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory() });
  // Tier D: walk the gate via the issued token, then approve, to reach dispatch.
  const need = await adapter.handle({ op: "session.move", selector: { session_id: "01900000" } });
  assert.equal(need.status, "confirmation_required");
  const res = await adapter.handle({ op: "session.move", selector: { session_id: "01900000" }, confirmationToken: need.confirmationToken, approved: true });
  assert.equal(res.status, "not_implemented");
  rmSync(root, { recursive: true, force: true });
});

test("policy: verified params are documented per mutating op and surfaced for discovery", () => {
  // Param-handling decision (a): the verified RPC param names are documented machine-readably on
  // each op (no normalization layer), so MCP callers know exactly what to pass.
  assert.deepEqual(getOp("session.rename").params, { name: "string" });
  assert.deepEqual(getOp("model.set").params, { provider: "string", modelId: "string" });
  assert.deepEqual(getOp("session.compact").params, { customInstructions: "string?" });
  assert.deepEqual(getOp("session.branch").params, { entryId: "string" });
  assert.deepEqual(getOp("session.new").params, { parentSession: "string?" });
  assert.deepEqual(getOp("session.switch").params, { sessionPath: "string" });

  const ops = describeOps();
  const setModel = ops.find((o) => o.op === "model.set");
  assert.equal(setModel.backend, "rpc:set_model");
  assert.deepEqual(setModel.params, { provider: "string", modelId: "string" });
  // No-param ops still expose an (empty) params shape for discovery.
  assert.deepEqual(ops.find((o) => o.op === "session.list").params, {});

  // session.move has NO verified RPC command (RpcCommand union, omp/16.0.5) — it stays unsupported
  // and is deferred to LOO-12; never fabricate a command for it.
  const move = ops.find((o) => o.op === "session.move");
  assert.equal(move.backend, "unsupported");
  assert.equal(getOp("session.move").unsupported, true);
  assert.equal(getOp("session.move").rpc, undefined);
});

test("adapter: each mutating op gates by tier then dispatches the verified command + params", async () => {
  // For every mutating op: walk the tier gate (M = token; D = token + approval), then assert that
  // on approval the adapter dispatches the verified RPC command with the params forwarded verbatim
  // and returns the mapped result. Earlier (un-gated) calls must NOT reach dispatch.
  const cases = [
    { op: "session.rename", tier: "M", rpc: "set_session_name", params: { name: "Renamed" }, check: (res) => assert.equal(res.result, undefined, "set_session_name success carries no data") },
    { op: "model.set", tier: "D", rpc: "set_model", params: { provider: "anthropic", modelId: "opus" }, check: (res) => { assert.equal(res.result.provider, "anthropic"); assert.equal(res.result.id, "opus"); } },
    { op: "session.compact", tier: "D", rpc: "compact", params: { customInstructions: "keep decisions" }, check: (res) => assert.equal(res.result.summary, "compacted") },
    { op: "session.compact", tier: "D", rpc: "compact", params: {}, check: (res) => assert.equal(res.result.summary, "compacted") },
    { op: "session.branch", tier: "D", rpc: "branch", params: { entryId: "entry-1" }, check: (res) => { assert.equal(res.result.text, "branched"); assert.equal(res.result.cancelled, false); } },
    { op: "session.new", tier: "D", rpc: "new_session", params: { parentSession: "parent.jsonl" }, check: (res) => assert.equal(res.result.cancelled, false) },
    { op: "session.new", tier: "D", rpc: "new_session", params: {}, check: (res) => assert.equal(res.result.cancelled, false) },
    { op: "session.switch", tier: "D", rpc: "switch_session", params: { sessionPath: "/tmp/x.jsonl" }, check: (res) => assert.equal(res.result.cancelled, false) },
  ];
  const root = makeSessionsDir();
  const { factory, calls } = recordingHostFactory();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: factory });
  const selector = { session_id: "01900000" };
  try {
    for (const tc of cases) {
      const label = `${tc.op}(${JSON.stringify(tc.params)})`;
      // 1. No token → tier-appropriate confirmation is demanded; dispatch is NOT reached.
      const first = await adapter.handle({ op: tc.op, selector, params: tc.params });
      assert.equal(first.status, "confirmation_required", `${label}: token gate`);
      assert.equal(first.needs, tc.tier === "M" ? "token" : "token+approval", `${label}: needs`);
      const token = first.confirmationToken;
      assert.ok(token, `${label}: token issued`);

      // 2. Tier D: token alone is still insufficient — explicit human approval is required.
      if (tc.tier === "D") {
        const staged = await adapter.handle({ op: tc.op, selector, params: tc.params, confirmationToken: token });
        assert.equal(staged.status, "approval_required", `${label}: approval gate`);
      }

      // 3. Fully gated → exactly one dispatch with the verified command name + verbatim params.
      const before = calls.length;
      const done = await adapter.handle({
        op: tc.op,
        selector,
        params: tc.params,
        confirmationToken: token,
        ...(tc.tier === "D" ? { approved: true } : {}),
      });
      assert.equal(done.status, "ok", `${label}: dispatched`);
      assert.equal(done.session.sessionId, ID_A, `${label}: resolved session`);
      assert.equal(calls.length, before + 1, `${label}: single dispatch`);
      assert.equal(calls[before].command, tc.rpc, `${label}: command name`);
      assert.deepEqual(calls[before].params, tc.params, `${label}: params forwarded verbatim`);
      tc.check(done);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rpc host: spawns the mock, awaits ready, correlates a response", async () => {
  const host = new RpcHost({ command: process.execPath, args: [mockOmp] });
  await host.start();
  assert.equal(host.ready, true);
  const stats = await host.request("get_session_stats");
  assert.equal(stats.totalMessages, 12);
  assert.equal(stats.tokens.total, 3456);
  await host.close();
});

test("end-to-end: adapter drives a spawned mock omp over RPC", async () => {
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({
    sessionsDir: root,
    makeRpcHost: async () => {
      const host = new RpcHost({ command: process.execPath, args: [mockOmp] });
      await host.start();
      return host;
    },
  });
  const res = await adapter.handle({ op: "session.stats", selector: { session_id: "01900000" } });
  assert.equal(res.status, "ok");
  assert.equal(res.result.totalMessages, 12);
  rmSync(root, { recursive: true, force: true });
});

test("mcp server: initialize, tools/list, and a tools/call", async () => {
  const root = makeSessionsDir();
  const server = createServer({ sessionsDir: root, makeRpcHost: fakeHostFactory() });

  const init = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(init.result.protocolVersion, "2024-11-05");

  const list = await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(list.result.tools[0].name, "omp_runtime");

  const call = await server.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "omp_runtime", arguments: { op: "session.list" } } });
  assert.equal(call.result.structuredContent.status, "ok");
  assert.equal(call.result.structuredContent.result.sessions.length, 3);
  rmSync(root, { recursive: true, force: true });
});

test("selectors: a symlinked session file is rejected (local-only containment)", () => {
  const root = makeSessionsDir();
  const outside = mkdtempSync(path.join(tmpdir(), "loo7-outside-"));
  const target = path.join(outside, "leak.jsonl");
  writeFileSync(target, '{"header":1}\n');
  const link = path.join(root, "work", `2026-06-18T23-53-59-394Z_${ID_A.replace(/.$/u, "9")}.jsonl`);
  symlinkSync(target, link);
  try {
    // session_file pointing at the symlink is refused even though the basename looks valid.
    const byFile = resolveSelector({ session_file: link }, { sessionsDir: root });
    assert.equal(byFile.ok, false);
    // and the symlink is not enumerated as a session.
    assert.ok(!listSessions(root).some((s) => s.sessionFile === link));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("rpc host: get_state over the wire is projected to metadata and redacted", async () => {
  // Exercises the VERIFIED response envelope end-to-end: a spawned mock emits
  // {type:"response",command:"get_state",success:true,data:{...}}; the host unwraps `data`,
  // the adapter projects Tier R to metadata and scrubs the synthetic secret + /Users/ path.
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({
    sessionsDir: root,
    makeRpcHost: async () => {
      const host = new RpcHost({ command: process.execPath, args: [mockOmp] });
      await host.start();
      return host;
    },
  });
  const res = await adapter.handle({ op: "session.get", selector: { session_id: "01900000" } });
  assert.equal(res.status, "ok");
  assert.equal(res.result.sessionId, "mock");
  assert.equal(res.result.model.id, "default");
  assert.equal(typeof res.result.sessionFile_chars, "number", "session file path reduced to a length");
  assert.equal(res.result.sessionFile, undefined, "raw session file path not forwarded");
  const serialized = JSON.stringify(res.result);
  assert.ok(!serialized.includes("/Users/"), "private home path redacted");
  assert.ok(!serialized.includes("ABCDEFGHIJKLMNOP"), "secret-looking value redacted");
  rmSync(root, { recursive: true, force: true });
});

// Opt-in live probe of the REAL `omp --mode rpc`. Skipped unless LOO_OMP_LIVE=1, so CI and
// hermetic runs never spawn the real agent or require auth. Sends ONLY non-model commands
// (get_state / get_session_stats) under a hard per-request timeout, then tears the child down.
// It NEVER sends a prompt or any model-invoking command.
test(
  "live omp --mode rpc: ready + non-model commands match the verified envelope",
  { skip: process.env.LOO_OMP_LIVE === "1" ? false : "set LOO_OMP_LIVE=1 to run the live probe" },
  async () => {
    const host = new RpcHost({ command: "omp", args: ["--mode", "rpc"], readyTimeoutMs: 15000, requestTimeoutMs: 15000 });
    try {
      await host.start();
      assert.equal(host.ready, true);
      const state = await host.request("get_state", {}, { timeoutMs: 10000 });
      assert.equal(typeof state.sessionId, "string");
      assert.ok(state.model && typeof state.model.provider === "string", "get_state.data.model is a Model");
      const stats = await host.request("get_session_stats", {}, { timeoutMs: 10000 });
      assert.equal(typeof stats.totalMessages, "number");
      assert.ok(stats.tokens && typeof stats.tokens.total === "number", "SessionStats carries a token breakdown");
    } finally {
      await host.close();
    }
  },
);

test("adapter: transcript.export dispatches via the injected CLI runner on the full explicit path and redacts the export", async () => {
  const root = makeSessionsDir();
  const calls = [];
  // Hermetic CLI runner double (no spawn). Returns deliberately hostile export output: a
  // secret-looking value (collapses the whole string under scrubString) and a /Users/ path.
  const fakeRunCli = async ({ op, verb, sessionId, sessionFile }) => {
    calls.push({ op, verb, sessionId, sessionFile });
    return {
      op,
      sessionId,
      format: "html",
      content: "<html><body>note token = ABCDEFGHIJKLMNOP1234567890</body></html>",
      exportPath: "/Users/dev/.omp/agent/sessions/work/transcript-export.html",
    };
  };
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory(), runCli: fakeRunCli });
  const selector = { session_id: "01900000" };

  // Deny-by-default first; the refusal still mints the selector-bound token to walk the gate.
  const refused = await adapter.handle({ op: "transcript.export", selector });
  assert.equal(refused.status, "refused");
  assert.equal(refused.error, "denied_by_default");
  assert.equal(calls.length, 0, "no CLI dispatch on refusal");
  const token = refused.confirmationToken;
  assert.ok(token);

  const ok = await adapter.handle({ op: "transcript.export", selector, explicitApproval: true, approved: true, confirmationToken: token });
  assert.equal(ok.status, "ok");
  assert.equal(ok.session.sessionId, ID_A);
  assert.equal(calls.length, 1, "exactly one CLI dispatch on the full explicit path");
  assert.equal(calls[0].verb, "export", "dispatched the cli verb declared in the registry");
  assert.ok(calls[0].sessionFile.endsWith(".jsonl"), "runner receives the resolved session file path");

  // Redaction: nothing the CLI produced leaves unscrubbed.
  assert.equal(ok.result.content, "[redacted:secret]", "secret-bearing export collapses to a redaction marker");
  const serialized = JSON.stringify(ok.result);
  assert.ok(!serialized.includes("ABCDEFGHIJKLMNOP"), "no secret leaks");
  assert.ok(!serialized.includes("/Users/"), "no private home path leaks");
  assert.ok(ok.result.exportPath.includes("[redacted:home-path]"), "private home path redacted inline");
  rmSync(root, { recursive: true, force: true });
});

test("adapter: transcript egress is refused unless explicitApproval + approved + a valid token are ALL present", async () => {
  const root = makeSessionsDir();
  const cliCalls = [];
  const rpcCalls = [];
  const fakeRunCli = async (args) => {
    cliCalls.push(args);
    return { content: "must-never-egress" };
  };
  const countingHost = async () => ({
    async request(command, params) {
      rpcCalls.push({ command, params });
      return { messages: [{ role: "user", content: "raw transcript" }] };
    },
    async close() {},
  });
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: countingHost, runCli: fakeRunCli });
  const selector = { session_id: "01900000" };

  // Covers a cli-backed egress (export), an rpc-backed egress (get → get_messages), and a
  // backend-less egress (share). Each must be denied unless the full explicit path is supplied.
  for (const op of ["transcript.export", "transcript.get", "transcript.share"]) {
    const seed = await adapter.handle({ op, selector });
    assert.equal(seed.status, "refused", `${op}: denied by default`);
    assert.equal(seed.error, "denied_by_default", `${op}: deny reason`);
    const token = seed.confirmationToken;
    assert.ok(token, `${op}: selector-bound token minted on refusal`);

    const variants = [
      { label: "missing explicitApproval", env: { approved: true, confirmationToken: token } },
      { label: "missing approved", env: { explicitApproval: true, confirmationToken: token } },
      { label: "missing token", env: { explicitApproval: true, approved: true } },
      { label: "wrong token", env: { explicitApproval: true, approved: true, confirmationToken: "deadbeefdeadbeefdeadbeefdeadbeef" } },
      { label: "approved not boolean-true", env: { explicitApproval: true, approved: "yes", confirmationToken: token } },
      { label: "explicitApproval not boolean-true", env: { explicitApproval: "yes", approved: true, confirmationToken: token } },
    ];
    for (const v of variants) {
      const res = await adapter.handle({ op, selector, ...v.env });
      assert.equal(res.status, "refused", `${op} (${v.label}): still refused`);
      assert.equal(res.error, "denied_by_default", `${op} (${v.label}): deny reason`);
    }
  }
  assert.equal(cliCalls.length, 0, "no cli backend reached without the full explicit path");
  assert.equal(rpcCalls.length, 0, "no rpc backend reached without the full explicit path");
  rmSync(root, { recursive: true, force: true });
});

test("adapter: transcript.share clears the explicit gate but honestly reports not_implemented (no verified backend)", async () => {
  // Proves the deny-by-default gate is the ONLY thing blocking egress (not a fake stub): once the
  // full explicit path is supplied, share reaches dispatch and reports it has no rpc/cli/fs backend.
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory() });
  const selector = { session_id: "01900000" };
  const seed = await adapter.handle({ op: "transcript.share", selector });
  assert.equal(seed.status, "refused");
  const done = await adapter.handle({ op: "transcript.share", selector, explicitApproval: true, approved: true, confirmationToken: seed.confirmationToken });
  assert.equal(done.status, "not_implemented");
  rmSync(root, { recursive: true, force: true });
});

test("cli runner: makeCliRunner('export') runs `omp --export <file> <out>`, returns the produced HTML, and cleans up", async () => {
  const workRoot = mkdtempSync(path.join(tmpdir(), "loo12-cli-"));
  const spawned = [];
  const workDirs = [];
  // Fake child process: write the requested HTML, print `Exported to:`, exit 0.
  const fakeSpawn = (command, args, opts) => {
    spawned.push({ command, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => {
      const outPath = args[2];
      writeFileSync(outPath, "<html>exported transcript</html>");
      child.stdout.emit("data", Buffer.from(`Exported to: ${outPath}\n`));
      child.emit("close", 0);
    });
    return child;
  };
  const makeWorkDir = () => {
    const d = mkdtempSync(path.join(workRoot, "exp-"));
    workDirs.push(d);
    return d;
  };
  const runCli = makeCliRunner({ command: "omp", spawnFn: fakeSpawn, makeWorkDir });
  const res = await runCli({ verb: "export", sessionId: "abc", sessionFile: "/tmp/sessions/2026_x.jsonl" });

  assert.equal(spawned[0].command, "omp");
  assert.deepEqual(spawned[0].args.slice(0, 2), ["--export", "/tmp/sessions/2026_x.jsonl"], "passes --export + the session file");
  assert.equal(res.format, "html");
  assert.equal(res.content, "<html>exported transcript</html>");
  assert.equal(res.sessionId, "abc");
  assert.ok(res.bytes > 0);
  assert.ok(!existsSync(workDirs[0]), "throwaway export dir is removed after the run");

  await assert.rejects(runCli({ verb: "totally-unknown" }), /unsupported CLI verb/);
  rmSync(workRoot, { recursive: true, force: true });
});
