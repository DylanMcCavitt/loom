// Shared Markdown YAML-frontmatter parsing for harness scripts.

function stripQuotes(value) {
  return value.replace(/^["']|["']$/gu, "");
}

function parseInlineValue(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }
  return stripQuotes(value);
}

function collectIndentedLines(lines, startIndex, baseIndent) {
  const parts = [];
  let continuation = startIndex;
  for (; continuation < lines.length; continuation += 1) {
    const next = lines[continuation];
    if (!next.trim()) {
      parts.push("");
      continue;
    }
    if (next.length - next.trimStart().length <= baseIndent) break;
    parts.push(next);
  }
  return { parts, continuation };
}

function parseNestedStringMap(lines, startIndex, baseIndent) {
  const { parts, continuation } = collectIndentedLines(lines, startIndex, baseIndent);
  const values = {};
  const invalidLines = [];
  for (let offset = 0; offset < parts.length; offset += 1) {
    const rawLine = parts[offset];
    if (!rawLine.trim()) continue;
    const separator = rawLine.indexOf(":");
    const key = separator === -1 ? "" : rawLine.slice(0, separator).trim();
    const rawValue = separator === -1 ? "" : rawLine.slice(separator + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(key) || rawValue === "" || /^[|>][+-]?$/u.test(rawValue)) {
      invalidLines.push({ line: startIndex + offset + 2, text: rawLine });
      continue;
    }
    values[key] = parseInlineValue(rawValue);
  }
  return { value: parts.some((line) => line.trim()) ? values : "", continuation, invalidLines };
}

export function parseFrontmatter(content) {
  const open = /^---\r?\n/u.exec(content);
  if (!open) return null;

  const close = /\r?\n---\s*(?:\r?\n|$)/u.exec(content.slice(open[0].length));
  if (!close) return null;

  const frontmatterStart = open[0].length;
  const frontmatterEnd = frontmatterStart + close.index;
  const bodyOffset = frontmatterEnd + close[0].length;
  const frontmatter = content.slice(frontmatterStart, frontmatterEnd);
  const body = content.slice(bodyOffset);
  const lines = frontmatter.split(/\r?\n/u);
  const keys = [];
  const values = {};
  const invalidLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = rawLine.indexOf(":");
    if (separator === -1) {
      invalidLines.push({ line: index + 2, text: rawLine });
      continue;
    }

    const key = rawLine.slice(0, separator).trim();
    const rawValue = rawLine.slice(separator + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(key)) {
      invalidLines.push({ line: index + 2, text: rawLine });
      continue;
    }

    keys.push(key);
    if (/^[|>][+-]?$/u.test(rawValue)) {
      const baseIndent = rawLine.length - rawLine.trimStart().length;
      const { parts, continuation } = collectIndentedLines(lines, index + 1, baseIndent);
      values[key] = parts.map((part) => part.trim()).join("\n").trim();
      index = continuation - 1;
    } else if (rawValue === "") {
      const baseIndent = rawLine.length - rawLine.trimStart().length;
      const nested = parseNestedStringMap(lines, index + 1, baseIndent);
      values[key] = nested.value;
      invalidLines.push(...nested.invalidLines);
      index = nested.continuation - 1;
    } else {
      values[key] = parseInlineValue(rawValue);
    }
  }

  return { frontmatter, body, data: values, keys, values, bodyOffset, invalidLines };
}
