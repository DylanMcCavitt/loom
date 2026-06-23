// RPC host for the OMP runtime control adapter (LOO-7).
//
// Spawns and OWNS an `omp --mode rpc` child process and speaks newline-delimited JSON over
// stdio. There is no attach-to-running-TUI and no control port (LOO-7 spike, omp://rpc.md).
//
// Wire shape (VERIFIED against omp/16.0.5 — see docs/harness/omp-runtime-adapter-contract.md §5):
//   request : `{ id?: string, type: <command>, ...inline params }` — the command name is `type`,
//             params are inlined at the top level (NOT a nested `params` object), `id` is an
//             optional string the response echoes back.
//   ready   : `{ type: "ready" }`, emitted once at startup.
//   response: success `{ id?, type: "response", command, success: true, data? }`;
//             failure `{ id?, type: "response", command, success: false, error: string }`.
//   Any other frame (session/agent events, available_commands_update, extension_ui_request,
//   host_tool_call, …) is unsolicited and is recorded on `this.events`, never correlated.
// Source: dist/types/modes/rpc/rpc-types.d.ts (RpcCommand/RpcResponse) + a live `omp --mode rpc`
// probe (get_state/get_session_stats) + omp://rpc.md.

import { spawn as nodeSpawn } from "node:child_process";
import { createInterface } from "node:readline";

export class RpcHost {
  constructor(options = {}) {
    this.command = options.command ?? "omp";
    this.args = options.args ?? ["--mode", "rpc"];
    this.cwd = options.cwd;
    this.env = options.env;
    this.spawnFn = options.spawnFn ?? nodeSpawn;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 10000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.child = null;
    this.rl = null;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.closed = false;
    this.events = [];
  }

  start() {
    return new Promise((resolve, reject) => {
      let settled = false;
      let child;
      try {
        child = this.spawnFn(this.command, this.args, {
          cwd: this.cwd,
          env: this.env,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error) {
        reject(error);
        return;
      }
      this.child = child;

      const readyTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.terminate();
        reject(new Error(`omp --mode rpc did not signal ready within ${this.readyTimeoutMs}ms`));
      }, this.readyTimeoutMs);

      child.on("error", (error) => {
        if (settled) {
          this._failAll(error);
          return;
        }
        settled = true;
        clearTimeout(readyTimer);
        reject(error);
      });

      child.on("exit", (code) => {
        this.closed = true;
        this._failAll(new Error(`omp --mode rpc exited (code ${code})`));
      });

      this.rl = createInterface({ input: child.stdout });
      this.rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let frame;
        try {
          frame = JSON.parse(trimmed);
        } catch {
          return; // ignore non-JSON noise on stdout
        }
        if (frame.type === "ready") {
          this.ready = true;
          if (!settled) {
            settled = true;
            clearTimeout(readyTimer);
            resolve(this);
          }
          return;
        }
        if (frame.type === "response") {
          const rid = frame.id;
          if (rid !== undefined && this.pending.has(rid)) {
            const { resolve: resolveReq, reject: rejectReq, timer } = this.pending.get(rid);
            this.pending.delete(rid);
            clearTimeout(timer);
            if (frame.success === false) {
              rejectReq(new Error(typeof frame.error === "string" ? frame.error : JSON.stringify(frame.error ?? "rpc error")));
            } else {
              resolveReq(frame.data);
            }
            return;
          }
          // Uncorrelated response (e.g. an unknown command echoes id:undefined, or a late
          // prompt-scheduling error after stdin close) — record it, never silently drop.
        }
        this.events.push(frame);
      });
    });
  }

  // `command` is the RPC command name written on the wire as the frame `type`; `params` fields are
  // inlined alongside `id`/`type`. Resolves with the response `data` payload (undefined for
  // commands that carry no data), rejects with an Error built from `error` on `success:false`.
  request(command, params = {}, options = {}) {
    if (this.closed) return Promise.reject(new Error("rpc host is closed"));
    if (!this.ready) return Promise.reject(new Error("rpc host is not ready"));
    const id = `req_${this.nextId}`;
    this.nextId += 1;
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc request "${command}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ ...params, id, type: command })}\n`);
    });
  }

  _failAll(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  terminate() {
    try {
      this.rl?.close();
    } catch {
      // ignore
    }
    try {
      this.child?.kill();
    } catch {
      // ignore
    }
    this.closed = true;
  }

  async close() {
    this.terminate();
  }
}
