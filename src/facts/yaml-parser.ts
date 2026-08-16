/**
 * C1 formal-fact-reader-and-persistence: hand-written minimal-subset YAML
 * parser (D14).
 *
 * C1 does not introduce an external YAML runtime dependency. Delivery Manifest
 * is YAML; this parser supports the subset actually used by manifests.
 *
 * Supported:
 *   - block mapping (`key: value`)
 *   - block sequence (`- item`)
 *   - flow sequence (`[a, b, c]`)
 *   - plain / single-quoted / double-quoted scalars
 *   - nested structures (mapping/sequence inside mapping/sequence)
 *   - basic types: null (`null`/`~`/empty), bool (`true`/`false`), int, string
 *   - comments (`#`)
 *   - multi-line strings: literal (`|`) and folded (`>`)
 *
 * Not supported (parse failure when encountered):
 *   - anchor / alias (`&` / `*`)
 *   - multi-document (`---` separator)
 *   - tag (`!!`)
 *   - complex flow mapping (`{key: value}`)
 *
 * Error behavior (task 9.4): parse failures return an error result; the parser
 * MUST NOT throw. Reader collects failures as `FactConflict`.
 */

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface YamlParseSuccess {
  readonly ok: true;
  readonly value: unknown;
}

export interface YamlParseFailure {
  readonly ok: false;
  readonly error: string;
  readonly line?: number;
}

export type YamlParseResult = YamlParseSuccess | YamlParseFailure;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse a YAML string into a value. Returns a {@link YamlParseResult}; never
 * throws. Unsupported features and malformed input yield `{ ok: false }`.
 */
export function parseYaml(input: string): YamlParseResult {
  try {
    const lines = preprocessLines(input);
    if (lines.length === 0) {
      return { ok: true, value: null };
    }
    const parser = new BlockParser(lines);
    const value = parser.parseBlock(0);
    if (!parser.allConsumed()) {
      return {
        ok: false,
        error: `unexpected content at line ${parser.peek().lineNumber + 1}`,
        line: parser.peek().lineNumber + 1,
      };
    }
    return { ok: true, value };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Line preprocessing
// ---------------------------------------------------------------------------

interface RawLine {
  readonly indent: number;
  readonly content: string;
  readonly lineNumber: number;
}

/**
 * Split input into indented content lines, stripping comments and blank lines.
 * Comments inside quoted strings are preserved.
 */
function preprocessLines(input: string): RawLine[] {
  const result: RawLine[] = [];
  // Split on \n and strip a trailing \r so CRLF (Windows checkout) files
  // parse identically to LF files. Without this, every mapping key on a
  // CRLF line (e.g. `delivery:\r`) is misread as a plain scalar.
  const rawLines = input.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i] as string;
    const stripped = stripComment(raw);
    // Skip blank lines (only whitespace / comment-only).
    if (stripped.trim() === '') {
      continue;
    }
    const indent = countIndent(stripped);
    const content = stripped.slice(indent);
    result.push({ indent, content, lineNumber: i });
  }
  return result;
}

/**
 * Remove a trailing `#` comment from a line, respecting quotes.
 */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === '#' && !inSingle && !inDouble) {
      // `#` must be at start or preceded by whitespace to be a comment.
      if (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t') {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function countIndent(line: string): number {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i++;
  }
  return i;
}

// ---------------------------------------------------------------------------
// Block parser (recursive descent over indented lines)
// ---------------------------------------------------------------------------

class BlockParser {
  private readonly lines: readonly RawLine[];
  private pos = 0;

  constructor(lines: readonly RawLine[]) {
    this.lines = lines;
  }

  peek(): RawLine {
    return this.lines[this.pos] as RawLine;
  }

  allConsumed(): boolean {
    return this.pos >= this.lines.length;
  }

  /**
   * Parse a block at the given minimum indentation. Returns the parsed value
   * (mapping, sequence, or scalar).
   */
  parseBlock(minIndent: number): unknown {
    if (this.pos >= this.lines.length) {
      return null;
    }
    const line = this.peek();
    if (line.indent < minIndent) {
      return null;
    }
    const blockIndent = line.indent;

    // Sequence: starts with `- `.
    if (line.content.startsWith('- ') || line.content === '-') {
      return this.parseSequence(blockIndent);
    }

    // Mapping: contains a `key:` separator.
    if (isMappingLine(line.content)) {
      return this.parseMapping(blockIndent);
    }

    // Otherwise: scalar (single line). Block scalars `|` / `>` are handled
    // when a mapping value is `|` or `>`.
    this.pos++;
    return parseScalar(line.content);
  }

  private parseMapping(indent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    while (this.pos < this.lines.length) {
      const line = this.peek();
      if (line.indent < indent) {
        break;
      }
      if (line.indent > indent) {
        // Over-indented line at mapping context — unexpected.
        throw new Error(`unexpected indentation at line ${line.lineNumber + 1}`);
      }
      if (!isMappingLine(line.content)) {
        break;
      }
      this.pos++;
      const { key, valuePart } = splitMappingEntry(line.content);
      result[key] = this.parseMappingValue(valuePart, indent, line.lineNumber);
    }
    return result;
  }

  private parseMappingValue(
    valuePart: string,
    parentIndent: number,
    parentLineNumber: number,
  ): unknown {
    const trimmed = valuePart.trim();

    // Empty value: nested block or null.
    if (trimmed === '') {
      return this.parseNestedBlock(parentIndent);
    }

    // Literal block scalar `|`.
    if (trimmed === '|' || trimmed.startsWith('|')) {
      return this.parseLiteralBlock(parentIndent, trimmed);
    }

    // Folded block scalar `>`.
    if (trimmed === '>' || trimmed.startsWith('>')) {
      return this.parseFoldedBlock(parentIndent, trimmed);
    }

    // Flow sequence `[a, b, c]`.
    if (trimmed.startsWith('[')) {
      return parseFlowSequence(trimmed, parentLineNumber);
    }

    // Inline scalar value.
    return parseScalar(trimmed);
  }

  private parseNestedBlock(parentIndent: number): unknown {
    if (this.pos >= this.lines.length) {
      return null;
    }
    const next = this.peek();
    if (next.indent <= parentIndent) {
      return null;
    }
    return this.parseBlock(next.indent);
  }

  private parseSequence(indent: number): unknown[] {
    const result: unknown[] = [];
    while (this.pos < this.lines.length) {
      const line = this.peek();
      if (line.indent < indent) {
        break;
      }
      if (line.indent > indent) {
        throw new Error(`unexpected indentation at line ${line.lineNumber + 1}`);
      }
      if (!line.content.startsWith('- ') && line.content !== '-') {
        break;
      }
      const itemContent = line.content === '-' ? '' : line.content.slice(2);
      this.pos++;

      // Item may be an inline mapping (`- key: value`) or scalar or nested.
      if (itemContent.trim() === '') {
        result.push(this.parseNestedBlock(indent));
      } else if (isMappingLine(itemContent)) {
        // Inline mapping item: treat the rest as the first mapping entry at
        // indent = indent + 2 (the `- ` prefix width).
        result.push(this.parseInlineMappingItem(itemContent, indent));
      } else {
        result.push(parseScalar(itemContent.trim()));
      }
    }
    return result;
  }

  private parseInlineMappingItem(
    firstContent: string,
    seqIndent: number,
  ): Record<string, unknown> {
    // Reinsert the inline mapping line as a synthetic indented line, then
    // parse a mapping at indent = seqIndent + 2.
    const itemIndent = seqIndent + 2;
    const synth: RawLine = {
      indent: itemIndent,
      content: firstContent.trim(),
      lineNumber: this.lines[this.pos - 1]?.lineNumber ?? 0,
    };
    // Splice the synthetic line in front of the cursor by using a wrapper.
    const savedLines = this.lines;
    const merged = [synth, ...this.lines.slice(this.pos)];
    const sub = new BlockParser(merged);
    const value = sub.parseBlock(itemIndent);
    // Advance our position by how many lines the sub-parser consumed minus
    // the synthetic line.
    const consumed = sub.pos - 1; // minus synthetic
    this.pos += Math.max(0, consumed);
    void savedLines;
    return value as Record<string, unknown>;
  }

  private parseLiteralBlock(parentIndent: number, indicator: string): string {
    const lines = this.collectBlockScalarLines(parentIndent);
    const strip = indicator.includes('-');
    let text = lines.join('\n');
    if (!strip && lines.length > 0) {
      text += '\n'; // clip: single trailing newline
    }
    return text;
  }

  private parseFoldedBlock(parentIndent: number, indicator: string): string {
    const lines = this.collectBlockScalarLines(parentIndent);
    const strip = indicator.includes('-');
    // Fold: consecutive non-empty lines join with a space; blank lines become
    // a single newline (paragraph break).
    const folded: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] as string;
      if (line === '') {
        folded.push('');
      } else if (i > 0 && lines[i - 1] !== '' && folded.length > 0) {
        // Previous line was non-empty → fold with space.
        folded[folded.length - 1] = `${folded[folded.length - 1]} ${line}`;
      } else {
        folded.push(line);
      }
    }
    let text = folded.join('\n');
    if (!strip && lines.length > 0) {
      text += '\n';
    }
    return text;
  }

  private collectBlockScalarLines(parentIndent: number): string[] {
    const collected: string[] = [];
    while (this.pos < this.lines.length) {
      const line = this.peek();
      if (line.indent <= parentIndent) {
        break;
      }
      collected.push(line.content);
      this.pos++;
    }
    return collected;
  }
}

// ---------------------------------------------------------------------------
// Mapping entry helpers
// ---------------------------------------------------------------------------

function isMappingLine(content: string): boolean {
  // A mapping line has a `key:` separator where `key` is a plain or quoted
  // scalar followed by `:` and a space or end-of-line.
  const colonIdx = findMappingColon(content);
  return colonIdx >= 0;
}

function findMappingColon(content: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ':' && !inSingle && !inDouble) {
      const next = content[i + 1];
      if (next === undefined || next === ' ' || next === '\t') {
        return i;
      }
    }
  }
  return -1;
}

function splitMappingEntry(content: string): {
  key: string;
  valuePart: string;
} {
  const colonIdx = findMappingColon(content);
  if (colonIdx < 0) {
    throw new Error(`not a mapping line: ${content}`);
  }
  const keyRaw = content.slice(0, colonIdx).trim();
  const valuePart = content.slice(colonIdx + 1);
  const key = parseScalar(keyRaw);
  return { key: String(key), valuePart };
}

// ---------------------------------------------------------------------------
// Flow sequence `[a, b, c]`
// ---------------------------------------------------------------------------

function parseFlowSequence(content: string, lineNumber: number): unknown[] {
  if (!content.startsWith('[') || !content.endsWith(']')) {
    throw new Error(`invalid flow sequence at line ${lineNumber + 1}`);
  }
  const inner = content.slice(1, -1).trim();
  if (inner === '') {
    return [];
  }
  // Reject complex flow mapping `{...}` inside flow sequence.
  if (inner.includes('{')) {
    throw new Error(
      `complex flow mapping is not supported (line ${lineNumber + 1})`,
    );
  }
  return splitFlowItems(inner).map((item) => parseScalar(item.trim()));
}

function splitFlowItems(inner: string): string[] {
  const items: string[] = [];
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] as string;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
    } else if (ch === '[' && !inSingle && !inDouble) {
      depth++;
      current += ch;
    } else if (ch === ']' && !inSingle && !inDouble) {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0 && !inSingle && !inDouble) {
      items.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '' || items.length === 0) {
    items.push(current);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Scalar parsing
// ---------------------------------------------------------------------------

/**
 * Parse a scalar value: quoted strings, null/bool/int, or plain string.
 * Rejects unsupported features (`&`, `*`, `!`, `---`).
 */
function parseScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }

  // Reject unsupported features.
  if (trimmed.startsWith('&') || trimmed.startsWith('*')) {
    throw new Error(`anchor/alias is not supported: ${trimmed}`);
  }
  if (trimmed.startsWith('!')) {
    throw new Error(`tag is not supported: ${trimmed}`);
  }
  if (trimmed === '---' || trimmed === '...') {
    throw new Error(`multi-document marker is not supported: ${trimmed}`);
  }

  // Double-quoted string.
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return unescapeDoubleQuoted(trimmed.slice(1, -1));
  }

  // Single-quoted string.
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  // null.
  if (trimmed === 'null' || trimmed === '~' || trimmed === 'Null' || trimmed === 'NULL') {
    return null;
  }

  // bool.
  if (trimmed === 'true' || trimmed === 'True' || trimmed === 'TRUE') {
    return true;
  }
  if (trimmed === 'false' || trimmed === 'False' || trimmed === 'FALSE') {
    return false;
  }

  // int.
  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  // Plain string.
  return trimmed;
}

function unescapeDoubleQuoted(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}
