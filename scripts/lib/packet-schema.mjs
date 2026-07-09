// Machine-checkable packet schemas derived from docs/agent-contract.md.
// Plain-object descriptors + a hand-rolled validator (no external deps).

/** @typedef {"string"|"string[]"|"string-or-string[]"} FieldType */

/**
 * @typedef {object} FieldSchema
 * @property {string} name
 * @property {FieldType} type
 * @property {boolean} required
 * @property {readonly string[]} [enum]
 * @property {string} [description]
 */

/**
 * @typedef {object} PacketSchema
 * @property {string} kind
 * @property {string} description
 * @property {readonly FieldSchema[]} fields
 */

export const PACKET_KINDS = Object.freeze([
  "repair-finding",
  "agent-input",
  "agent-output",
]);

export const REQUEST_MODES = Object.freeze([
  "shape",
  "implement",
  "review",
  "prove",
  "repair",
  "launch",
]);

export const EXECUTION_CONTEXTS = Object.freeze(["validation", "live"]);

/** @type {Readonly<Record<string, PacketSchema>>} */
export const PACKET_SCHEMAS = Object.freeze({
  "repair-finding": Object.freeze({
    kind: "repair-finding",
    description:
      "repair-pack finding packet: exactly one concrete finding with nine required fields (docs/agent-contract.md Repair-pack finding-fix loop).",
    fields: Object.freeze([
      Object.freeze({ name: "file", type: "string", required: true, description: "Path of the file containing the finding." }),
      Object.freeze({ name: "symbol", type: "string", required: true, description: "Named symbol (function, class, export) under repair." }),
      Object.freeze({ name: "scope", type: "string", required: true, description: "Bounded scope of the fix; must not widen beyond this." }),
      Object.freeze({ name: "concreteRisk", type: "string", required: true, description: "Concrete risk the finding describes." }),
      Object.freeze({ name: "minimalExpectedFix", type: "string", required: true, description: "Minimal expected fix; no drive-by cleanup." }),
      Object.freeze({ name: "proofCheck", type: "string", required: true, description: "Named proof check to rerun after the fix." }),
      Object.freeze({ name: "ruleSourceId", type: "string", required: true, description: "Stable rule/source id for the finding." }),
      Object.freeze({ name: "nonGoals", type: "string-or-string[]", required: true, description: "Explicit non-goals for this repair." }),
      Object.freeze({ name: "allowedFiles", type: "string[]", required: true, description: "Files the repair may touch." }),
      Object.freeze({
        name: "context",
        type: "string",
        required: false,
        enum: EXECUTION_CONTEXTS,
        description: "validation | live; absent means live (state the assumption in the output packet).",
      }),
    ]),
  }),

  "agent-input": Object.freeze({
    kind: "agent-input",
    description:
      "Bounded common agent input packet (docs/agent-contract.md Request modes, Lens policy, Execution context, Packet contract).",
    fields: Object.freeze([
      Object.freeze({
        name: "mode",
        type: "string",
        required: true,
        enum: REQUEST_MODES,
        description: "Request mode resolved before acting.",
      }),
      Object.freeze({
        name: "context",
        type: "string",
        required: false,
        enum: EXECUTION_CONTEXTS,
        description: "validation | live; absent means live.",
      }),
      Object.freeze({
        name: "lens",
        type: "string",
        required: false,
        description: "Single lens reference name; when absent the agent loads its mode default.",
      }),
      Object.freeze({
        name: "lenses",
        type: "string[]",
        required: false,
        description: "One or more lens reference names for fan-out.",
      }),
      Object.freeze({
        name: "targetSurface",
        type: "string",
        required: true,
        description: "Target surface / scope boundary for the packet.",
      }),
      Object.freeze({
        name: "scope",
        type: "string",
        required: false,
        description: "Optional narrower scope note within the target surface.",
      }),
      Object.freeze({
        name: "issueId",
        type: "string",
        required: false,
        description: "Optional tracked issue id.",
      }),
      Object.freeze({
        name: "prId",
        type: "string",
        required: false,
        description: "Optional pull request id.",
      }),
    ]),
  }),

  "agent-output": Object.freeze({
    kind: "agent-output",
    description:
      "Bounded common agent output packet reporting mode, lens, loaded references, proof, coverage gaps, and changed files.",
    fields: Object.freeze([
      Object.freeze({
        name: "mode",
        type: "string",
        required: true,
        enum: REQUEST_MODES,
        description: "Mode that was executed.",
      }),
      Object.freeze({
        name: "lens",
        type: "string",
        required: false,
        description: "Lens used (named or mode default).",
      }),
      Object.freeze({
        name: "targetSurface",
        type: "string",
        required: true,
        description: "Target surface reported for the work.",
      }),
      Object.freeze({
        name: "loadedReferences",
        type: "string[]",
        required: true,
        description: "Reference paths loaded for this packet.",
      }),
      Object.freeze({
        name: "ruleIds",
        type: "string[]",
        required: true,
        description: "Stable rule IDs applied or cited.",
      }),
      Object.freeze({
        name: "proofRun",
        type: "string",
        required: true,
        description: "Proof command or check that was run.",
      }),
      Object.freeze({
        name: "proofResult",
        type: "string",
        required: true,
        description: "Result of the proof run (pass/fail/skipped summary).",
      }),
      Object.freeze({
        name: "unresolvedCoverageGaps",
        type: "string[]",
        required: true,
        description: "Unresolved coverage gaps; empty array when none.",
      }),
      Object.freeze({
        name: "changedFiles",
        type: "string[]",
        required: true,
        description: "Files changed by this packet; empty when none.",
      }),
      Object.freeze({
        name: "blockerReason",
        type: "string",
        required: false,
        description: "Present when the agent is blocked.",
      }),
      Object.freeze({
        name: "context",
        type: "string",
        required: false,
        enum: EXECUTION_CONTEXTS,
        description: "validation | live; absent means live was assumed.",
      }),
    ]),
  }),
});

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * @param {FieldSchema} field
 * @param {unknown} value
 * @param {string[]} errors
 * @param {string} path
 */
function validateField(field, value, errors, path) {
  const label = `${path}.${field.name}`;

  if (value === undefined || value === null) {
    if (field.required) {
      errors.push(`${label}: missing required field`);
    }
    return;
  }

  switch (field.type) {
    case "string": {
      if (typeof value !== "string") {
        errors.push(`${label}: expected string, got ${typeName(value)}`);
        return;
      }
      if (field.required && !value.trim()) {
        errors.push(`${label}: must be a non-empty string`);
        return;
      }
      if (field.enum && !field.enum.includes(value)) {
        errors.push(`${label}: must be one of ${field.enum.join("|")}, got ${JSON.stringify(value)}`);
      }
      break;
    }
    case "string[]": {
      if (!Array.isArray(value)) {
        errors.push(`${label}: expected string[], got ${typeName(value)}`);
        return;
      }
      if (!value.every((item) => typeof item === "string")) {
        errors.push(`${label}: every element must be a string`);
      }
      break;
    }
    case "string-or-string[]": {
      if (typeof value === "string") {
        if (field.required && !value.trim()) {
          errors.push(`${label}: must be a non-empty string or string[]`);
        }
        break;
      }
      if (isStringArray(value)) {
        if (field.required && value.length === 0) {
          errors.push(`${label}: must be a non-empty string or non-empty string[]`);
        }
        break;
      }
      errors.push(`${label}: expected string or string[], got ${typeName(value)}`);
      break;
    }
    default: {
      const _exhaustive = field.type;
      errors.push(`${label}: unknown field type ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Validate a packet object against a named kind schema.
 *
 * @param {string} kind one of PACKET_KINDS
 * @param {unknown} object candidate packet (may include a `packet` kind tag)
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePacket(kind, object) {
  const errors = [];

  if (typeof kind !== "string" || !kind.trim()) {
    return { ok: false, errors: ["kind: must be a non-empty string"] };
  }

  const schema = PACKET_SCHEMAS[kind];
  if (!schema) {
    return {
      ok: false,
      errors: [`kind: unknown packet kind ${JSON.stringify(kind)}; expected one of ${PACKET_KINDS.join("|")}`],
    };
  }

  if (!isPlainObject(object)) {
    return { ok: false, errors: [`${kind}: expected a plain object, got ${typeName(object)}`] };
  }

  if (Object.prototype.hasOwnProperty.call(object, "packet")) {
    if (object.packet !== kind) {
      errors.push(
        `${kind}.packet: kind tag ${JSON.stringify(object.packet)} does not match validated kind ${JSON.stringify(kind)}`,
      );
    }
  }

  for (const field of schema.fields) {
    validateField(field, object[field.name], errors, kind);
  }

  if (kind === "agent-input" && Object.prototype.hasOwnProperty.call(object, "lens")) {
    if (typeof object.lens === "string" && !object.lens.trim()) {
      errors.push("agent-input.lens: must be a non-empty string when present");
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Resolve the packet kind from an object that carries a `packet` tag.
 *
 * @param {unknown} object
 * @returns {{ kind: string|null, errors: string[] }}
 */
export function resolvePacketKind(object) {
  if (!isPlainObject(object)) {
    return { kind: null, errors: [`packet: expected a plain object, got ${typeName(object)}`] };
  }
  if (!Object.prototype.hasOwnProperty.call(object, "packet")) {
    return { kind: null, errors: ["packet: missing required kind tag field \"packet\""] };
  }
  if (typeof object.packet !== "string" || !object.packet.trim()) {
    return { kind: null, errors: ["packet: kind tag must be a non-empty string"] };
  }
  if (!PACKET_SCHEMAS[object.packet]) {
    return {
      kind: null,
      errors: [`packet: unknown kind ${JSON.stringify(object.packet)}; expected one of ${PACKET_KINDS.join("|")}`],
    };
  }
  return { kind: object.packet, errors: [] };
}

/**
 * Validate an object that self-describes its kind via the `packet` field.
 *
 * @param {unknown} object
 * @returns {{ ok: boolean, kind: string|null, errors: string[] }}
 */
export function validateTaggedPacket(object) {
  const resolved = resolvePacketKind(object);
  if (!resolved.kind) {
    return { ok: false, kind: null, errors: resolved.errors };
  }
  const result = validatePacket(resolved.kind, object);
  return { ok: result.ok, kind: resolved.kind, errors: result.errors };
}
