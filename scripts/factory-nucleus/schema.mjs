import path from "node:path";

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SECRET_KEY_PATTERN = /(?:api[_-]?key|token|secret|password|credential|private[_-]?key)/iu;
const SECRET_VALUE_PATTERN = /(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{8,})/u;

export const SCHEMA_VERSION = 1;

export const ARTIFACT_KINDS = Object.freeze([
  "factory-scan",
  "envelope",
  "recipe",
  "recipe-plan",
  "circuit",
  "local-state",
  "radar-check",
  "run-summary",
  "adapter-ghost",
]);

export const CIRCUIT_GATES = Object.freeze([
  "protected-surface",
  "proof",
  "branch",
  "tracker",
  "merge",
]);

export const CIRCUIT_OUTCOMES = Object.freeze(["allow", "block", "escalate"]);

export const GHOST_STATES = Object.freeze([
  "triage",
  "backlog",
  "ready",
  "in-progress",
  "in-review",
  "done",
  "canceled",
]);

const metadataProperties = {
  schemaVersion: { type: "integer", const: SCHEMA_VERSION },
  kind: { type: "string", enum: ARTIFACT_KINDS },
  generatedAt: { type: "string", format: "date-time" },
};

export const ARTIFACT_METADATA_SCHEMA = Object.freeze({
  type: "object",
  required: ["schemaVersion", "kind", "generatedAt"],
  properties: metadataProperties,
  additionalProperties: true,
});

const stringArray = Object.freeze({ type: "array", items: { type: "string", minLength: 1 }, minItems: 1 });
const optionalStringArray = Object.freeze({ type: "array", items: { type: "string", minLength: 1 } });

export const CIRCUIT_SCHEMA = Object.freeze({
  type: "object",
  required: ["schemaVersion", "kind", "generatedAt", "name", "gate", "outcome", "enforcement"],
  properties: {
    ...metadataProperties,
    kind: { type: "string", const: "circuit" },
    name: { type: "string", minLength: 1 },
    gate: { type: "string", enum: CIRCUIT_GATES },
    outcome: { type: "string", enum: CIRCUIT_OUTCOMES },
    enforcement: { type: "string", enum: ["validate", "runtime-hook", "manual-review"] },
    reason: { type: "string", minLength: 1 },
    hooks: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "surface"],
        properties: {
          name: { type: "string", minLength: 1 },
          surface: { type: "string", enum: ["protected-surface", "proof", "branch", "tracker", "merge"] },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
});

const embeddedCircuitSchema = Object.freeze({
  type: "object",
  required: ["name", "gate", "outcome", "enforcement"],
  properties: {
    name: { type: "string", minLength: 1 },
    gate: { type: "string", enum: CIRCUIT_GATES },
    outcome: { type: "string", enum: CIRCUIT_OUTCOMES },
    enforcement: { type: "string", enum: ["validate", "runtime-hook", "manual-review"] },
    reason: { type: "string", minLength: 1 },
    hooks: CIRCUIT_SCHEMA.properties.hooks,
  },
  additionalProperties: false,
});

export const ENVELOPE_SCHEMA = Object.freeze({
  type: "object",
  required: ["schemaVersion", "kind", "generatedAt", "factory", "tracker", "delivery", "proof", "agents", "circuits"],
  properties: {
    ...metadataProperties,
    kind: { type: "string", const: "envelope" },
    factory: {
      type: "object",
      required: ["id", "repo"],
      properties: {
        id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
        repo: {
          type: "object",
          required: ["name", "root"],
          properties: {
            name: { type: "string", minLength: 1 },
            root: { type: "string", minLength: 1 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    tracker: {
      type: "object",
      required: ["provider"],
      properties: {
        provider: { type: "string", enum: ["none", "linear", "github"] },
        team: { type: "string", minLength: 1 },
        project: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
    delivery: {
      type: "object",
      required: ["defaultBranch", "branchPrefix", "autoMerge"],
      properties: {
        defaultBranch: { type: "string", minLength: 1 },
        branchPrefix: { type: "string", minLength: 1 },
        autoMerge: { type: "boolean" },
      },
      additionalProperties: false,
    },
    proof: {
      type: "object",
      required: ["commands"],
      properties: { commands: stringArray },
      additionalProperties: false,
    },
    agents: {
      type: "object",
      required: ["maxSubagents"],
      properties: {
        maxSubagents: { type: "integer", minimum: 0 },
        allowFullTranscriptCapture: { type: "boolean" },
      },
      additionalProperties: false,
    },
    circuits: { type: "array", items: embeddedCircuitSchema, minItems: 1 },
  },
  additionalProperties: false,
});

export const RECIPE_SCHEMA = Object.freeze({
  type: "object",
  required: ["schemaVersion", "kind", "generatedAt", "name", "mode", "stages", "circuits"],
  properties: {
    ...metadataProperties,
    kind: { type: "string", const: "recipe" },
    name: { type: "string", minLength: 1 },
    mode: { type: "string", enum: ["plan", "run"] },
    stages: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["name", "agent", "scopes", "circuits", "actions"],
        properties: {
          name: { type: "string", minLength: 1 },
          agent: { type: "string", enum: ["assembler", "inserter", "ghosts", "roboports", "radar", "proof-pass", "rocket-launch", "space-age"] },
          scopes: stringArray,
          circuits: stringArray,
          proof: stringArray,
          actions: stringArray,
        },
        additionalProperties: false,
      },
    },
    circuits: { type: "array", minItems: 1, items: embeddedCircuitSchema },
  },
  additionalProperties: false,
});

export const RECIPE_PLAN_SCHEMA = Object.freeze({
  type: "object",
  required: ["schemaVersion", "kind", "generatedAt", "recipe", "mode", "stages", "plannedActions"],
  properties: {
    ...metadataProperties,
    kind: { type: "string", const: "recipe-plan" },
    recipe: { type: "string", minLength: 1 },
    mode: { type: "string", const: "plan" },
    stages: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["name", "status", "circuits", "plannedActions"],
        properties: {
          name: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["planned", "blocked", "escalated"] },
          circuits: stringArray,
          proof: stringArray,
          plannedActions: stringArray,
          subagents: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["role", "scope", "objective"],
              properties: {
                role: { type: "string", minLength: 1 },
                scope: stringArray,
                objective: { type: "string", minLength: 1 },
                reads: optionalStringArray,
                writes: optionalStringArray,
              },
              additionalProperties: false,
            },
          },
          writeConflicts: optionalStringArray,
        },
        additionalProperties: false,
      },
    },
    plannedActions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "kind", "target", "durable"],
        properties: {
          id: { type: "string", minLength: 1 },
          kind: { type: "string", enum: ["read", "write", "branch", "pr", "comment", "state"] },
          target: { type: "string", minLength: 1 },
          durable: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
});

export const LOCAL_STATE_SCHEMA = Object.freeze({
  type: "object",
  required: ["schemaVersion", "kind", "generatedAt", "root", "envelope", "scan", "radar", "plans", "runs", "transcripts"],
  properties: {
    ...metadataProperties,
    kind: { type: "string", const: "local-state" },
    root: { type: "string", minLength: 1 },
    envelope: { type: "string", minLength: 1 },
    scan: { type: "string", minLength: 1 },
    radar: { type: "string", minLength: 1 },
    plans: { type: "string", minLength: 1 },
    runs: { type: "string", minLength: 1 },
    transcripts: {
      type: "object",
      required: ["root", "saveByDefault"],
      properties: {
        root: { type: "string", minLength: 1 },
        saveByDefault: { type: "boolean", const: false },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
});

export const ADAPTER_GHOST_SCHEMA = Object.freeze({
  type: "object",
  required: ["schemaVersion", "kind", "generatedAt", "id", "title", "state", "projectId", "labels", "dependsOn", "blocks"],
  properties: {
    ...metadataProperties,
    kind: { type: "string", const: "adapter-ghost" },
    id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    state: { type: "string", enum: GHOST_STATES },
    projectId: { type: "string", minLength: 1 },
    parentId: { type: "string", minLength: 1 },
    labels: optionalStringArray,
    dependsOn: optionalStringArray,
    blocks: optionalStringArray,
  },
  additionalProperties: false,
});

function yamlLines(input) {
  return String(input)
    .split(/\r?\n/u)
    .map((raw, index) => ({ raw, index: index + 1 }))
    .filter(({ raw }) => raw.trim() && !raw.trimStart().startsWith("#"))
    .map(({ raw, index }) => {
      const indent = raw.match(/^ */u)[0].length;
      if (indent % 2 !== 0) throw new Error(`YAML parse error on line ${index}: indentation must use two-space steps`);
      return { indent, text: raw.trim(), index };
    });
}

function splitKeyValue(text, line) {
  const separator = text.indexOf(":");
  if (separator === -1) throw new Error(`YAML parse error on line ${line}: expected key: value`);
  const key = text.slice(0, separator).trim();
  if (!key) throw new Error(`YAML parse error on line ${line}: empty key`);
  return [key, text.slice(separator + 1).trim()];
}
function isArrayMappingItem(text) {
  return /^[A-Za-z_][A-Za-z0-9_-]*\s*:(?:\s|$)/u.test(text);
}


function parseScalar(raw) {
  if (raw === "") return undefined;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+$/u.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/u.test(raw)) return Number(raw);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseScalar(part.trim()));
  }
  return raw;
}

function parseBlock(lines, start, indent) {
  if (start >= lines.length) return [null, start];
  if (lines[start].indent < indent) return [null, start];
  if (lines[start].indent !== indent) {
    throw new Error(`YAML parse error on line ${lines[start].index}: expected indent ${indent}`);
  }
  return lines[start].text.startsWith("- ") ? parseArray(lines, start, indent) : parseObject(lines, start, indent);
}

function parseObject(lines, start, indent) {
  const out = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw new Error(`YAML parse error on line ${line.index}: unexpected indentation`);
    if (line.text.startsWith("- ")) break;
    const [key, rawValue] = splitKeyValue(line.text, line.index);
    if (Object.hasOwn(out, key)) throw new Error(`YAML parse error on line ${line.index}: duplicate key ${key}`);
    if (rawValue === "") {
      if (i + 1 >= lines.length || lines[i + 1].indent <= indent) {
        out[key] = {};
        i += 1;
      } else {
        const [child, next] = parseBlock(lines, i + 1, lines[i + 1].indent);
        out[key] = child;
        i = next;
      }
    } else {
      out[key] = parseScalar(rawValue);
      i += 1;
    }
  }
  return [out, i];
}

function parseArray(lines, start, indent) {
  const out = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent !== indent) throw new Error(`YAML parse error on line ${line.index}: unexpected array indentation`);
    if (!line.text.startsWith("- ")) break;
    const itemText = line.text.slice(2).trim();
    if (itemText === "") {
      const [child, next] = parseBlock(lines, i + 1, indent + 2);
      out.push(child);
      i = next;
      continue;
    }
    if (isArrayMappingItem(itemText)) {
      const [key, rawValue] = splitKeyValue(itemText, line.index);
      const item = {};
      i += 1;
      if (rawValue === "") {
        if (i < lines.length && lines[i].indent > indent) {
          const [child, next] = parseBlock(lines, i, lines[i].indent);
          item[key] = child;
          i = next;
        } else {
          item[key] = {};
        }
      } else {
        item[key] = parseScalar(rawValue);
      }
      if (i < lines.length && lines[i].indent > indent) {
        const [child, next] = parseObject(lines, i, lines[i].indent);
        for (const childKey of Object.keys(child)) {
          if (Object.hasOwn(item, childKey)) throw new Error(`YAML parse error on line ${line.index}: duplicate key '${childKey}'`);
        }
        Object.assign(item, child);
        i = next;
      }
      out.push(item);
    } else {
      out.push(parseScalar(itemText));
      i += 1;
    }
  }
  return [out, i];
}

export function parseYaml(input) {
  const lines = yamlLines(input);
  if (!lines.length) return {};
  const [value, next] = parseBlock(lines, 0, lines[0].indent);
  if (next !== lines.length) throw new Error(`YAML parse error on line ${lines[next].index}: trailing content`);
  return value;
}

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  if (value === null) return "null";
  return typeof value;
}

function checkSecretMaterial(value, errors, at = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => checkSecretMaterial(entry, errors, `${at}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const child = `${at}.${key}`;
      if (SECRET_KEY_PATTERN.test(key)) errors.push(`${child}: secret-bearing keys are not allowed in Factory Nucleus artifacts`);
      checkSecretMaterial(entry, errors, child);
    }
    return;
  }
  if (typeof value === "string" && SECRET_VALUE_PATTERN.test(value)) {
    errors.push(`${at}: secret-looking values are not allowed in Factory Nucleus artifacts`);
  }
}

export function validateWithSchema(value, schema, at = "$", errors = []) {
  const actual = typeOf(value);
  if (schema.type && actual !== schema.type) {
    errors.push(`${at}: expected ${schema.type}, got ${actual}`);
    return errors;
  }
  if (Object.hasOwn(schema, "const") && value !== schema.const) errors.push(`${at}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: expected one of ${schema.enum.join(", ")}`);
  if (schema.type === "string") {
    if (schema.minLength && value.length < schema.minLength) errors.push(`${at}: must not be empty`);
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
    if (schema.format === "date-time" && !ISO_DATE_TIME.test(value)) errors.push(`${at}: must be an ISO generatedAt timestamp`);
  }
  if (schema.type === "integer" && schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: must be >= ${schema.minimum}`);
  if (schema.type === "array") {
    if (schema.minItems && value.length < schema.minItems) errors.push(`${at}: must contain at least ${schema.minItems} item(s)`);
    value.forEach((entry, index) => validateWithSchema(entry, schema.items, `${at}[${index}]`, errors));
  }
  if (schema.type === "object") {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: required`);
    }
    const properties = schema.properties ?? {};
    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateWithSchema(entry, properties[key], `${at}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${at}.${key}: unknown property`);
      }
    }
  }
  return errors;
}

export function validateArtifact(value, schema) {
  const errors = [];
  checkSecretMaterial(value, errors);
  validateWithSchema(value, schema, "$", errors);
  if (schema === ENVELOPE_SCHEMA) addLinearTrackerErrors(value, errors);
  return { ok: errors.length === 0, errors };
}
function addLinearTrackerErrors(value, errors) {
  if (value?.tracker?.provider !== "linear") return;
  if (typeof value.tracker.team !== "string" || value.tracker.team.length === 0) {
    errors.push("$.tracker.team: required for linear tracker");
  }
  if (typeof value.tracker.project !== "string" || value.tracker.project.length === 0) {
    errors.push("$.tracker.project: required for linear tracker");
  }
}

function addRecipeCircuitReferenceErrors(value, errors) {
  if (!Array.isArray(value?.circuits) || !Array.isArray(value?.stages)) return;
  const circuitNames = new Set(value.circuits.map((circuit) => circuit?.name).filter((name) => typeof name === "string"));
  value.stages.forEach((stage, stageIndex) => {
    if (!Array.isArray(stage?.circuits)) return;
    stage.circuits.forEach((circuit, circuitIndex) => {
      if (typeof circuit === "string" && !circuitNames.has(circuit)) {
        errors.push(`$.stages[${stageIndex}].circuits[${circuitIndex}]: unknown circuit ${circuit}`);
      }
    });
  });
}

function addRecipePlanActionReferenceErrors(value, errors) {
  if (!Array.isArray(value?.plannedActions) || !Array.isArray(value?.stages)) return;
  const actionIds = new Set(value.plannedActions.map((action) => action?.id).filter((id) => typeof id === "string"));
  value.stages.forEach((stage, stageIndex) => {
    if (!Array.isArray(stage?.plannedActions)) return;
    stage.plannedActions.forEach((action, actionIndex) => {
      if (typeof action === "string" && !actionIds.has(action)) {
        errors.push(`$.stages[${stageIndex}].plannedActions[${actionIndex}]: unknown planned action ${action}`);
      }
    });
  });
}


export function validateEnvelopeYaml(input) {
  try {
    const value = parseYaml(input);
    return validateArtifact(value, ENVELOPE_SCHEMA);
  } catch (error) {
    return { ok: false, errors: [String(error.message ?? error)] };
  }
}

export function validateRecipe(value) {
  const result = validateArtifact(value, RECIPE_SCHEMA);
  addRecipeCircuitReferenceErrors(value, result.errors);
  result.ok = result.errors.length === 0;
  return result;
}

export function validateRecipePlan(value) {
  const result = validateArtifact(value, RECIPE_PLAN_SCHEMA);
  addRecipePlanActionReferenceErrors(value, result.errors);
  result.ok = result.errors.length === 0;
  return result;
}

export function validateCircuit(value) {
  return validateArtifact(value, CIRCUIT_SCHEMA);
}

export function validateAdapterGhost(value) {
  return validateArtifact(value, ADAPTER_GHOST_SCHEMA);
}

export function validateArtifactMetadata(value, expectedKind) {
  const result = validateArtifact(value, ARTIFACT_METADATA_SCHEMA);
  if (expectedKind && value?.kind !== expectedKind) result.errors.push(`$.kind: expected ${expectedKind}`);
  return { ok: result.errors.length === 0, errors: result.errors };
}

export function artifactMetadata(kind, generatedAt = new Date()) {
  if (!ARTIFACT_KINDS.includes(kind)) throw new Error(`unsupported artifact kind: ${kind}`);
  const date = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  return { schemaVersion: SCHEMA_VERSION, kind, generatedAt: date.toISOString() };
}

export function withArtifactMetadata(kind, payload = {}, generatedAt) {
  return { ...payload, ...artifactMetadata(kind, generatedAt) };
}

function sanitizeSegment(value) {
  const segment = String(value ?? "factory").toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "");
  if (!segment) throw new Error("factory id must contain at least one alphanumeric character");
  return segment;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveFactoryStatePaths({ homeDir, targetRepoPath, factoryId, generatedAt } = {}) {
  if (!homeDir) throw new Error("homeDir is required");
  const root = path.resolve(homeDir, ".loom", "factory-nucleus", sanitizeSegment(factoryId));
  const target = targetRepoPath ? path.resolve(targetRepoPath) : null;
  if (target && isInside(target, root)) throw new Error("factory state root must stay outside the target repo");
  const state = withArtifactMetadata("local-state", {
    root,
    envelope: path.join(root, "envelope", "envelope.yaml"),
    scan: path.join(root, "scan", "latest.json"),
    radar: path.join(root, "radar", "latest.json"),
    plans: path.join(root, "plans"),
    runs: path.join(root, "runs"),
    transcripts: {
      root: path.join(root, "transcripts"),
      saveByDefault: false,
    },
  }, generatedAt);
  const result = validateArtifact(state, LOCAL_STATE_SCHEMA);
  if (!result.ok) throw new Error(`invalid local state layout: ${result.errors.join("; ")}`);
  return state;
}
