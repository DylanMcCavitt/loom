[/private/tmp/loom-loo152/docs/operator/install-update.md#70E4]
1:# Installing, applying, verifying, and rolling back the harness nucleus
2:
3:Use this runbook when you are changing local harness installation state. Daily
4:issue work stays in [`daily-workflow.md`](daily-workflow.md); this page is only
5:for moving reviewed Loom nucleus output from dry-run to scratch proof to an
6:explicit live apply.
7:
8:## Architecture in one screen
9:
10:- `loom` is the version-controlled nucleus repo. It owns canonical source under
11:  `nucleus/`, harness adapters under `adapters/`, generated/checkable output
12:  under `distributions/`, renderers, validators, and operator docs.
13:- The Factorio workflow kit is authored under `nucleus/skills/` and rendered to
14:  `.agents/skills/` as the OMP compatibility surface.
15:- OMP, Codex, and Claude are target harnesses. They consume rendered or linked
16:  surfaces; their runtime state stays local-only.
17:- `scripts/render-nucleus.mjs` renders the OMP/Codex/Claude adapter nucleus and
18:  applies only approved `track` / `adapt` HOME-scoped candidates.
19:- `scripts/render-plugin-bridge.mjs` renders the `loom-nucleus` Codex/Claude
20:  plugin bridge and reuses the same render -> gate -> marker apply engine.
21:
22:The safety model is always:
23:
24:```text
25:dry-run -> review -> scratch-HOME proof -> explicit live apply -> verify
26:```
27:
28:Never skip straight to `--write` against the real HOME. A live apply requires a
29:clean dry-run manifest, human review of the destinations, and explicit approval
30:for the concrete target HOME.
31:
32:## Current live baseline
33:
34:The historical pre-cutover live inventory is recorded in
35:[`docs/harness/live-nucleus-inventory-2026-06-25.md`](../harness/live-nucleus-inventory-2026-06-25.md).
36:It is superseded by ADR 0004 and the LOO-107..111 layout cutover; use it only as
37:reference context. The current operator distinction:
38:
39:- Already effective:
40:  - `.agents/skills` is rendered from `nucleus/skills/` and `nucleus/utilities/`.
41:  - OMP mirror files are rendered from `adapters/omp/source/`.
42:- Planned or gated:
43:  - generated Codex config/profile fragments;
44:  - generated Claude instruction/settings/agent/skill candidates;
45:  - the `loom-nucleus` plugin bridge under `~/.agents/plugins/`;
46:  - marker-owned apply records under `~/.loom-harness/applied-manifest.json`.
47:
48:Do not treat planned config files as live until the specific dry-run -> review
49:-> explicit apply gate has passed.
50:
51:## Non-goals and hard boundaries
52:
53:- Do not write live `~/.omp`, `~/.codex`, `~/.claude`, `~/.agents`, or repo
54:  config except through the explicit commands below after review.
55:- Do not read or copy secrets, tokens, auth/cache data, sessions, histories,
56:  runtime databases, browser state, plugin caches, local settings, logs, or
57:  private runtime files.
58:- Do not duplicate private local config values into docs, commits, PRs, issues,
59:  or marker notes.
60:- Do not publish a plugin, install marketplace content, enable hooks, or change
61:  provider/model/auth/telemetry/default-profile settings in this runbook.
62:- Do not overwrite user files. The apply engine is create-missing-only for
63:  unmarked files; marker-owned drift is backed up before update.
64:
65:## Common preflight
66:
67:Run these from the repo root before any lane-specific apply:
68:
69:```sh
70:npm run doctor
71:npm run check
72:```
73:
74:Machine-readable dry-runs are preferred for saved evidence:
75:
76:```sh
77:npm run render-nucleus -- --json
78:node scripts/render-plugin-bridge.mjs --json
79:```
80:
81:Both dry-runs render into temporary output, run the safety gate, print candidate
82:manifests, and write nothing to live HOME.
83:
84:## OMP lane
85:
86:Owner chain:
87:
88:- Parent lane: LOO-35 (`FN-M03: Scan and onboarding`).
89:- OMP mirror/config split: `adapters/omp/source/` and
90:  `docs/harness/resource-manifest.*`.
91:- Live apply runbook: LOO-91.
92:
93:### Dry-run
94:
95:```sh
96:npm run render-nucleus -- --json
97:```
98:
99:Review the JSON:
100:
101:- `result` must be `pass`;
102:- `findings` must be empty;
103:- OMP destinations must be expected `track` / `adapt` surfaces;
104:- local-only runtime patterns must be reported, not appliable.
105:
106:### Scratch-HOME apply proof
107:
108:```sh
109:SCRATCH_HOME="$(mktemp -d)"
110:node scripts/render-nucleus.mjs --home "$SCRATCH_HOME" --write --json
111:node scripts/render-nucleus.mjs --home "$SCRATCH_HOME" --write --json
112:node scripts/render-nucleus.mjs --home "$SCRATCH_HOME" --json
113:```
114:
115:Expected proof:
116:
117:- first `--write` returns `result: "pass"`;
118:- second `--write` reports already-applied or skipped actions and
119:  `markerChanged: false`;
120:- final dry-run still returns `result: "pass"` and shows marker-owned live
121:  status under the scratch HOME.
122:
123:### Live apply
124:
125:Only after the reviewed scratch proof:
126:
127:```sh
128:npm run install-nucleus -- --json
129:```
130:
131:`install-nucleus` is `node scripts/render-nucleus.mjs --write`. It
132:refuses on safety findings, creates only missing unowned files, skips existing
133:unmarked files with `reason: "exists"`, backs up marker-owned drift as
134:`*.loom-bak-<timestamp>`, and records ownership in
135:`~/.loom-harness/applied-manifest.json`.
136:
137:The OMP repo-owned transition has an additional explicit gate. If the reviewed
138:dry-run shows `~/.omp/agent/AGENTS.md`, `RULES.md`, or `config.yml` as
139:`repo-mirror-symlink` or `existing-user-file`, a plain `--write` must skip those
140:paths with `reason: "omp-approval-required"`. To intentionally claim a reviewed
141:repo-mirror symlink as marker-owned, or to replace a reviewed existing OMP user
142:file with the repo mirror content after backup, pass:
143:
144:```sh
145:node scripts/render-nucleus.mjs --write --approve-omp-repo-owned --json
146:```
147:
148:This flag is only for the three OMP mirror destinations above. It does not make
149:local-only OMP overlays, sessions, caches, logs, databases, or runtime state
150:readable or writable.
151:
152:Repo layout moves are also managed through this gate. If a live OMP link dangles
153:because its target moved inside the repo (dry-run shows
154:`stale-repo-mirror-symlink`), a plain `--write` still skips it with
155:`reason: "omp-approval-required"`; `--write --approve-omp-repo-owned` retargets
156:the link to the current source (action
157:`retargeted-stale-repo-mirror-symlink`), records the marker, and a repeat run
158:reports `already-applied`. Links resolving outside the repo are user property:
159:they stay `user-file` and are never retargeted.
160:
161:### Verify
162:
163:```sh
164:npm run render-nucleus -- --json
165:node scripts/dry-run-harness-inventory.mjs --check-live
166:node scripts/dry-run-harness-safety-gate.mjs --check-live
167:```
168:
169:The `--check-live` commands read path metadata and symlink targets only. They do
170:not read local-only runtime contents and do not write.
171:
172:### Rollback
173:
174:There is no broad rollback script. Roll back only the concrete paths listed in
175:the live apply JSON.
176:
177:For a file created by the apply:
178:
179:```sh
180:rm -- "<created-live-path-from-actions>"
181:```
182:
183:For a marker-owned file updated with a backup:
184:
185:```sh
186:cp -- "<backup-path-from-actions>" "<live-path-from-actions>"
187:```
188:
189:For an OMP repo-mirror symlink that was only claimed with
190:`claimed-repo-mirror-symlink`, the live symlink target was not changed. Rollback
191:is a marker-only decision: keep the marker as audit evidence unless the reviewed
192:rollback explicitly removes that destination from
193:`~/.loom-harness/applied-manifest.json`.
194:
195:For an existing OMP file replaced by `--approve-omp-repo-owned`, use the backup
196:path in the apply JSON exactly like marker-owned drift:
197:
198:```sh
199:cp -- "<backup-path-from-actions>" "<live-path-from-actions>"
200:```
201:
202:After rollback, verify again:
203:
204:```sh
205:npm run render-nucleus -- --json
206:node scripts/dry-run-harness-inventory.mjs --check-live
207:node scripts/dry-run-harness-safety-gate.mjs --check-live
208:```
209:
210:Leave `~/.loom-harness/applied-manifest.json` in place as audit evidence unless
211:the reviewed rollback specifically says to remove a marker entry. Do not edit
212:the marker by hand in routine rollback.
213:
214:## Codex lane
215:
216:Owner chain:
217:
218:- Codex adapter plan: `docs/harness/codex-adapter-plan.md`.
219:- Shared-agent source/rendering: LOO-96 through LOO-105.
220:- Plugin bridge scratch activation proof: LOO-102.
221:- Live apply runbook: LOO-91.
222:
223:Codex consumes the shared `loom-nucleus` package through the personal plugin
224:marketplace catalog at `~/.agents/plugins/marketplace.json`. The rendered plugin
225:source stays under `~/.agents/plugins/loom-nucleus/`.
226:
227:### Dry-run
228:
229:```sh
230:node scripts/render-plugin-bridge.mjs --json
231:```
232:
233:Review the JSON:
234:
235:- `result` must be `pass`;
236:- appliable destinations must be limited to
237:  `~/.agents/plugins/marketplace.json` and
238:  `~/.agents/plugins/loom-nucleus/**`;
239:- no Codex provider, model, auth, telemetry, notification, profile, or plugin
240:  cache path may be generated.
241:
242:### Scratch-HOME apply proof
243:
244:```sh
245:SCRATCH_HOME="$(mktemp -d)"
246:node scripts/render-plugin-bridge.mjs --home "$SCRATCH_HOME" --write --json
247:node scripts/render-plugin-bridge.mjs --home "$SCRATCH_HOME" --write --json
248:node adapters/plugin-bridge/loom-nucleus/hooks/verify-loom-install.mjs \
249:  --root "$SCRATCH_HOME/.agents/plugins/loom-nucleus" \
250:  --home "$SCRATCH_HOME" \
251:  --marketplace "$SCRATCH_HOME/.agents/plugins/marketplace.json" \
252:  --json
253:```
254:
255:Expected proof:
256:
257:- the first apply creates only the marketplace catalog, plugin source, and
258:  marker entries under the scratch HOME;
259:- the second apply reports `already-applied` and `markerChanged: false`;
260:- the verifier exits 0 and reports JSON success.
261:
262:### Live apply
263:
264:Only after review:
265:
266:```sh
267:node scripts/render-plugin-bridge.mjs --write --json
268:```
269:
270:This does not install or enable the plugin in Codex. It only creates the
271:personal marketplace catalog and co-located plugin source if missing.
272:
273:### Verify
274:
275:```sh
276:node adapters/plugin-bridge/loom-nucleus/hooks/verify-loom-install.mjs \
277:  --root "$HOME/.agents/plugins/loom-nucleus" \
278:  --home "$HOME" \
279:  --marketplace "$HOME/.agents/plugins/marketplace.json" \
280:  --json
281:node scripts/render-plugin-bridge.mjs --json
282:```
283:
284:Codex auto-discovery of `~/.agents/plugins/marketplace.json` was verified in
285:the bridge design. If a later reviewed step chooses to inspect marketplace
286:registration in Codex, use the official marketplace command:
287:
288:```sh
289:codex plugin marketplace list
290:```
291:
292:Plugin installation through Codex is separate from this live apply gate.
293:
294:### Rollback
295:
296:Use the live apply JSON actions:
297:
298:```sh
299:rm -- "$HOME/.agents/plugins/marketplace.json"
300:rm -rf -- "$HOME/.agents/plugins/loom-nucleus"
301:```
…
316:
…
428:`LOO-89` was superseded by LOO-102 and is not a live apply owner.

[Showing lines 1-300 of 429. Use :301 to continue]