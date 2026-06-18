#!/usr/bin/env bash
set -euo pipefail

node --input-type=module <<'NODE'
import { readFileSync, readdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const root = process.cwd();
const configPath = `${root}/omp/.omp/agent/config.yml`;
const agentsPath = `${root}/omp/.omp/agent/AGENTS.md`;
const rulesPath = `${root}/omp/.omp/agent/RULES.md`;
const extensionPath = `${root}/omp/.omp/agent/extensions/github-issues-panel.js`;

const config = readFileSync(configPath, 'utf8');
const agents = readFileSync(agentsPath, 'utf8');
const rules = readFileSync(rulesPath, 'utf8');
const extension = readFileSync(extensionPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function lineCount(text) {
  if (!text) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function countListUnder(source, key) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(new RegExp(`^(\\s*)${key}:\\s*$`));
    if (!match) continue;
    const baseIndent = match[1].length;
    let count = 0;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const current = lines[cursor];
      if (!current.trim()) continue;
      const indent = current.match(/^\s*/)[0].length;
      if (indent <= baseIndent) break;
      if (/^\s*-\s+/.test(current)) count += 1;
    }
    return count;
  }
  return 0;
}

function countMapUnder(source, key) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(new RegExp(`^(\\s*)${key}:\\s*$`));
    if (!match) continue;
    const baseIndent = match[1].length;
    let count = 0;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const current = lines[cursor];
      if (!current.trim()) continue;
      const indent = current.match(/^\s*/)[0].length;
      if (indent <= baseIndent) break;
      if (indent === baseIndent + 2 && /^\s*[A-Za-z0-9_-]+:\s+/.test(current)) count += 1;
    }
    return count;
  }
  return 0;
}

function boolValue(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}:\\s*(true|false)\\s*$`, 'm'));
  return match ? (match[1] === 'true' ? 1 : 0) : 0;
}

function scalarValue(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}:\\s*([^#\\n]+?)\\s*$`, 'm'));
  return match ? match[1].trim() : '';
}

const disabledExtensions = countListUnder(config, 'disabledExtensions');
const ignoredSkills = countListUnder(config, 'ignoredSkills');
const disabledProviders = countListUnder(config, 'disabledProviders');
const modelRoles = countMapUnder(config, 'modelRoles');
const customExtensions = readdirSync(`${root}/omp/.omp/agent/extensions`).filter((name) => name.endsWith('.js')).length;
const configLines = lineCount(config);
const workflowLines = lineCount(agents) + lineCount(rules);
const extensionLines = lineCount(extension);
const mcpDiscoveryEnabled = boolValue(config, 'discoveryMode');
const advisorSubagentsEnabled = boolValue(config, 'subagents');
const taskEagerPreferred = scalarValue(config, 'eager') === 'preferred' ? 1 : 0;

const spawnCalls = [];
const encoder = new TextEncoder();
function streamFrom(text) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

const fakeIssues = Array.from({ length: 7 }, (_, index) => ({
  number: index + 1,
  title: `Deterministic issue ${index + 1} title for panel rendering`,
  url: `https://github.com/example/project/issues/${index + 1}`,
  state: 'OPEN',
  updatedAt: `2026-01-0${Math.min(index + 1, 9)}T00:00:00Z`,
}));

globalThis.Bun = {
  spawn(argv, options) {
    spawnCalls.push({ argv, cwd: options?.cwd || '' });
    let stdout = '';
    let stderr = '';
    let code = 0;
    const joined = argv.join(' ');
    if (joined === 'gh repo view --json nameWithOwner,url') {
      stdout = JSON.stringify({ nameWithOwner: 'example/project', url: 'https://github.com/example/project' });
    } else if (joined === 'gh issue list --repo example/project --state open --limit 7 --json number,title,url,state,updatedAt') {
      stdout = JSON.stringify(fakeIssues);
    } else {
      stderr = `unexpected gh invocation: ${joined}`;
      code = 1;
    }
    return {
      stdout: streamFrom(stdout),
      stderr: streamFrom(stderr),
      exited: Promise.resolve(code),
    };
  },
};

const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${extension}\n//# sourceURL=github-issues-panel.js`, 'utf8').toString('base64')}`;
const imported = await import(moduleUrl);
const commands = new Map();
const labels = [];
const pi = {
  setLabel(label) { labels.push(label); },
  registerCommand(name, definition) { commands.set(name, definition); },
};
imported.default(pi);

for (const name of ['issues', 'issue', 'issue-link', 'linkrefs']) {
  assert(commands.has(name), `missing /${name} command`);
}
assert(labels.includes('GitHub Issues Panel'), 'extension label was not registered');

let widgetLines = [];
let widgetPlacement = '';
let editorText = 'Fix #1 and (#2) but not word#3';
const notifications = [];
const ctx = {
  cwd: root,
  ui: {
    async setWidget(lines, options) {
      widgetLines = lines;
      widgetPlacement = options?.placement || '';
    },
    notify(message, level) { notifications.push({ message, level }); },
    async pasteToEditor(text) { editorText += text; },
    async getEditorText() { return editorText; },
    async setEditorText(text) { editorText = text; },
  },
};

let startCalls = spawnCalls.length;
await commands.get('issues').handler('7', ctx);
const issuesGhCalls = spawnCalls.length - startCalls;
assert(widgetPlacement === 'belowEditor', '/issues did not render below the editor');
assert(widgetLines.length === 8, '/issues did not render the expected issue count');
assert(widgetLines[0].includes('GitHub issues · example/project'), '/issues header did not include repo identity');
assert(widgetLines[1].includes('Deterministic issue 1'), '/issues body did not include issue titles');

startCalls = spawnCalls.length;
await commands.get('issue').handler('#42', ctx);
const issueRefGhCalls = spawnCalls.length - startCalls;
assert(editorText.includes('issue://42'), '/issue did not paste an issue:// reference');

startCalls = spawnCalls.length;
await commands.get('issue-link').handler('42', ctx);
const issueLinkGhCalls = spawnCalls.length - startCalls;
assert(editorText.includes('[#42](https://github.com/example/project/issues/42)'), '/issue-link did not paste a Markdown issue link');

editorText = 'Fix #1 and (#2) but not word#3';
startCalls = spawnCalls.length;
await commands.get('linkrefs').handler('', ctx);
const linkrefsGhCalls = spawnCalls.length - startCalls;
assert(editorText.includes('[#1](https://github.com/example/project/issues/1)'), '/linkrefs did not rewrite plain refs');
assert(editorText.includes('([#2](https://github.com/example/project/issues/2))'), '/linkrefs did not rewrite parenthesized refs');
assert(editorText.includes('word#3'), '/linkrefs rewrote a non-reference suffix');

await commands.get('issues').handler('clear', ctx);
assert(widgetLines.length === 0, '/issues clear did not clear the panel');
assert(notifications.some((entry) => entry.level === 'info'), 'commands did not notify the UI');

const commandNames = Array.from(commands.keys());
const requiredCapabilities = 4;
const liveGhCallsForPanel = issuesGhCalls;
const workflowSurface = workflowLines + configLines;
const skillFilterCount = disabledExtensions + ignoredSkills;
const configSurface = configLines + (disabledExtensions * 2) + (ignoredSkills * 3) + (disabledProviders * 5) + (modelRoles * 2) + (mcpDiscoveryEnabled * 10) + (advisorSubagentsEnabled * 4) + (taskEagerPreferred * 2);
const extensionSurface = extensionLines + (customExtensions * 20) + (commands.size * 8) + ((issuesGhCalls + issueRefGhCalls + issueLinkGhCalls + linkrefsGhCalls) * 15);
const harnessFriction = configSurface + extensionSurface + workflowLines;

const metrics = {
  harness_friction: harnessFriction,
  config_surface: configSurface,
  extension_surface: extensionSurface,
  workflow_surface: workflowSurface,
  disabled_extensions: disabledExtensions,
  ignored_skills: ignoredSkills,
  skill_filter_count: skillFilterCount,
  disabled_providers: disabledProviders,
  model_roles: modelRoles,
  mcp_discovery_enabled: mcpDiscoveryEnabled,
  advisor_subagents_enabled: advisorSubagentsEnabled,
  task_eager_preferred: taskEagerPreferred,
  custom_extensions: customExtensions,
  extension_commands: commands.size,
  required_capabilities: requiredCapabilities,
  issues_gh_calls: issuesGhCalls,
  issue_ref_gh_calls: issueRefGhCalls,
  issue_link_gh_calls: issueLinkGhCalls,
  linkrefs_gh_calls: linkrefsGhCalls,
  panel_live_gh_calls: liveGhCallsForPanel,
  config_lines: configLines,
  workflow_lines: workflowLines,
  extension_lines: extensionLines,
};

assert(commandNames.length >= requiredCapabilities, 'GitHub issue panel lost required commands');
assert(metrics.harness_friction > 0, 'primary metric did not compute');

for (const [name, value] of Object.entries(metrics)) {
  assert(Number.isFinite(value), `metric ${name} is not finite`);
  console.log(`METRIC ${name}=${value}`);
}
NODE
