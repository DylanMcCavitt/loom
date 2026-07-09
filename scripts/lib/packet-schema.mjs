// Packet schemas from docs/agent-contract.md (hand-rolled; no external deps).

/** @typedef {"string"|"string[]"|"string-or-string[]"} FieldType */
/**
 * @typedef {{ name: string, type: FieldType, required: boolean, enum?: readonly string[] }} FieldSchema
 * @typedef {{ fields: readonly FieldSchema[] }} PacketSchema
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
    fields: Object.freeze([
      Object.freeze({ name: "file", type: "string", required: true }),
      Object.freeze({ name: "symbol", type: "string", required: true }),
      Object.freeze({ name: "scope", type: "string", required: true }),
      Object.freeze({ name: "concreteRisk", type: "string", required: true }),
      Object.freeze({ name: "minimalExpectedFix", type: "string", required: true }),
      Object.freeze({ name: "proofCheck", type: "string", required: true }),
      Object.freeze({ name: "ruleSourceId", type: "string", required: true }),
      Object.freeze({ name: "nonGoals", type: "string-or-string[]", required: true }),
      Object.freeze({ name: "allowedFiles", type: "string[]", required: true }),
      Object.freeze({ name: "context", type: "string", required: false, enum: EXECUTION_CONTEXTS }),
    ]),
  }),

  "agent-input": Object.freeze({
    fields: Object.freeze([
      Object.freeze({ name: "mode", type: "string", required: true, enum: REQUEST_MODES }),
      Object.freeze({ name: "context", type: "string", required: false, enum: EXECUTION_CONTEXTS }),
      Object.freeze({ name: "lens", type: "string", required: false }),
      Object.freeze({ name: "lenses", type: "string[]", required: false }),
      Object.freeze({ name: "targetSurface", type: "string", required: true }),
      Object.freeze({ name: "scope", type: "string", required: false }),
      Object.freeze({ name: "issueId", type: "string", required: false }),
      Object.freeze({ name: "prId", type: "string", required: false }),
    ]),
  }),

  "agent-output": Object.freeze({
    fields: Object.freeze([
      Object.freeze({ name: "mode", type: "string", required: true, enum: REQUEST_MODES }),
      Object.freeze({ name: "lens", type: "string", required: false }),
      Object.freeze({ name: "targetSurface", type: "string", required: true }),
      Object.freeze({ name: "loadedReferences", type: "string[]", required: true }),
      Object.freeze({ name: "ruleIds", type: "string[]", required: true }),
      Object.freeze({ name: "proofRun", type: "string", required: true }),
      Object.freeze({ name: "proofResult", type: "string", required: true }),
      Object.freeze({ name: "unresolvedCoverageGaps", type: "string[]", required: true }),
      Object.freeze({ name: "changedFiles", type: "string[]", required: true }),
      Object.freeze({ name: "blockerReason", type: "string", required: false }),
      Object.freeze({ name: "context", type: "string", required: false, enum: EXECUTION_CONTEXTS }),
    ]),
  }),
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** @param {FieldSchema} field @param {unknown} value @param {string[]} errors @param {string} path */
function validateField(field, value, errors, path) {
  const label = `${path}.${field.name}`;

  if (value === undefined || value === null) {
    if (field.required) errors.push(`${label}: missing required field`);
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
 * @param {string} kind
 * @param {unknown} object
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

  if (Object.prototype.hasOwnProperty.call(object, "packet") && object.packet !== kind) {
    errors.push(
      `${kind}.packet: kind tag ${JSON.stringify(object.packet)} does not match validated kind ${JSON.stringify(kind)}`,
    );
  }

  for (const field of schema.fields) {
    validateField(field, object[field.name], errors, kind);
  }

  if (
    kind === "agent-input"
    && Object.prototype.hasOwnProperty.call(object, "lens")
    && typeof object.lens === "string"
    && !object.lens.trim()
  ) {
    errors.push("agent-input.lens: must be a non-empty string when present");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {unknown} object
 * @returns {{ kind: string|null, errors: string[] }}
 */
function resolvePacketKind(object) {
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
