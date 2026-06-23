import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { describeOps, getOp } from "../scripts/runtime-adapter/policy.mjs";
import { listSessions, resolveSelector } from "../scripts/runtime-adapter/selectors.mjs";
import { RuntimeAdapter } from "../scripts/runtime-adapter/adapter.mjs";
import { RpcHost } from "../scripts/runtime-adapter/rpc-host.mjs";
import { createServer } from "../scripts/runtime-adapter/server.mjs";

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

// In-process fake omp RPC host (mirrors the mock fixture) for fast adapter tests.
function fakeHostFactory() {
  return async () => ({
    async request(command, params = {}) {
      switch (command) {
        case "get_state":
          return { sessionId: "mock", name: "Mock", model: "pi/default", cwd: "/Users/dev/project", note: "token = ABCDEFGHIJKLMNOP1234567890", messages: [{ role: "user" }, { role: "assistant" }] };
        case "get_session_stats":
          return { messages: 12, tokens: 3456 };
        case "set_session_name":
          return { ok: true, name: params.name };
        case "set_model":
          return { ok: true, model: params.model };
        default:
          throw new Error("unknown_command");
      }
    },
    async close() {},
  });
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
  assert.equal(ok.result.name, "X");

  // Token is bound to the session — A's token must not authorize B.
  const wrong = await adapter.handle({ op: "session.rename", selector: { session_id: ID_B1 }, params: { name: "X" }, confirmationToken: first.confirmationToken });
  assert.equal(wrong.status, "confirmation_required");
  rmSync(root, { recursive: true, force: true });
});

test("adapter: Tier D requires token then explicit approval", async () => {
  const root = makeSessionsDir();
  const adapter = new RuntimeAdapter({ sessionsDir: root, makeRpcHost: fakeHostFactory() });
  const need = await adapter.handle({ op: "model.set", selector: { session_id: "01900000" }, params: { model: "pi/slow" } });
  assert.equal(need.status, "confirmation_required");

  const unapproved = await adapter.handle({ op: "model.set", selector: { session_id: "01900000" }, params: { model: "pi/slow" }, confirmationToken: need.confirmationToken });
  assert.equal(unapproved.status, "approval_required");

  const done = await adapter.handle({ op: "model.set", selector: { session_id: "01900000" }, params: { model: "pi/slow" }, confirmationToken: need.confirmationToken, approved: true });
  assert.equal(done.status, "ok");
  assert.equal(done.result.model, "pi/slow");
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

test("rpc host: spawns the mock, awaits ready, correlates a response", async () => {
  const host = new RpcHost({ command: process.execPath, args: [mockOmp] });
  await host.start();
  assert.equal(host.ready, true);
  const stats = await host.request("get_session_stats");
  assert.equal(stats.messages, 12);
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
  assert.equal(res.result.messages, 12);
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
