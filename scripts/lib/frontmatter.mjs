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
    if (/^[|>][+-]?$/u.test(rawValue) || rawValue === "") {
      const baseIndent = rawLine.length - rawLine.trimStart().length;
      const parts = [];
      let continuation = index + 1;
      for (; continuation < lines.length; continuation += 1) {
        const next = lines[continuation];
        if (!next.trim()) {
          parts.push("");
          continue;
        }
        if (next.length - next.trimStart().length <= baseIndent) break;
        parts.push(next.trim());
      }
      values[key] = parts.join("\n").trim();
      index = continuation - 1;
    } else {
      values[key] = parseInlineValue(rawValue);
    }
  }

  return { frontmatter, body, data: values, keys, values, bodyOffset, invalidLines };
}
