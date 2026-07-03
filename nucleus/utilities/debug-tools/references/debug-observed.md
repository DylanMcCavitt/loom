# Observed `omp` `/debug` Behavior

Observation source: `omp` v16.0.5 live terminal session, resumed with
`omp --resume` and invoked with `/debug`.

## Debug Tools Selector

The observed selector title was `Debug Tools`. It supported search by typing and
showed these options:

- `Open: artifact folder` - open session artifacts in the file manager.
- `Report: performance issue` - profile CPU, reproduce, then bundle.
- `Profile: work scheduling` - open a flamegraph of the last 30 seconds.
- `Report: dump session` - create a report bundle immediately.
- `Report: memory issue` - heap snapshot plus bundle.
- `View: recent logs` - show the last 50 log entries.
- `View: system info` - show environment details.

## Report Dump

`Report: dump session` printed `Creating report bundle...`, then saved a tarball
under `~/.omp/reports/` and showed the file count. The observed bundle contained
six files:

- `system.json`
- `env.json`
- `config.json`
- `session.jsonl`
- `subagents/*.jsonl`

The observed JSONL event shape used `session`, `model_change`,
`thinking_level_change`, and `message` event types. Assistant messages contained
`toolCall` content items. Tool results were `message` events with role
`toolResult`, `toolName`, `toolCallId`, `isError`, and optional command details.

## System Info View

`View: system info` showed:

- OS and kernel version
- architecture
- CPU
- total and free memory
- Bun version
- `omp` app version
- Node compatibility version
- cwd
- shell
- terminal type

## Recent Logs View

`View: recent logs` opened a separate log viewer TUI with:

- log count header;
- `Esc: back`;
- `Ctrl+C: copy`;
- move and range-selection controls;
- filter state, such as `pid:off`;
- selected and expanded counters.

In the observed session it displayed `0/0 logs` plus a `MOVE UP TO LOAD MORE`
sentinel. Treat empty logs as evidence, not as proof that no issue happened.
