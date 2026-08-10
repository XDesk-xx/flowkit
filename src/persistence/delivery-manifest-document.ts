import { FlowkitError } from '../shared/errors.js';
import { parseYaml } from '../facts/yaml-parser.js';
import type {
  OwnerDecisionRecord,
  PersistedChangeInput,
  DeliveryCreateInput,
} from '../domain/a1-types.js';

function quote(value: string): string {
  return JSON.stringify(value);
}

function requireCleanScalar(value: string, field: string): void {
  if (value.trim() === '' || value.includes('\n') || value.includes('\r')) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be a non-empty single-line string`, {
      field,
    });
  }
}

function renderStringList(values: readonly string[], indent: string): string[] {
  if (values.length === 0) return [`${indent}[]`];
  return values.map((value) => `${indent}- ${quote(value)}`);
}

export function renderOwnerDecisionRecord(
  record: OwnerDecisionRecord,
  itemIndent = '  ',
): string[] {
  const fieldIndent = `${itemIndent}  `;
  const lines = [
    `${itemIndent}- ref: ${quote(record.ref)}`,
    `${fieldIndent}decision: ${quote(record.decision)}`,
    `${fieldIndent}deliveryId: ${quote(record.deliveryId)}`,
  ];
  if (record.changeId !== undefined) {
    lines.push(`${fieldIndent}changeId: ${quote(record.changeId)}`);
  }
  lines.push(`${fieldIndent}sourceRef: ${quote(record.sourceRef)}`);
  return lines;
}

export function renderChange(
  change: PersistedChangeInput,
  itemIndent = '  ',
): string[] {
  const fieldIndent = `${itemIndent}  `;
  const lines = [
    `${itemIndent}- key: ${quote(change.key)}`,
    `${fieldIndent}id: ${quote(change.id)}`,
    `${fieldIndent}goal: ${quote(change.goal)}`,
    `${fieldIndent}required: ${change.required ? 'true' : 'false'}`,
    `${fieldIndent}dependsOn:`,
    ...renderStringList(change.dependsOn, `${fieldIndent}  `),
    `${fieldIndent}state: ${change.state}`,
    `${fieldIndent}architectureImpact: ${change.architectureImpact ? 'true' : 'false'}`,
    `${fieldIndent}outputs:`,
    ...renderStringList(change.outputs, `${fieldIndent}  `),
  ];
  return lines;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

function splitLines(content: string): string[] {
  if (content.includes('\t')) {
    throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'tabs are not supported in Delivery Manifest');
  }
  if (content.includes('\r')) {
    throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'Delivery Manifest must use LF line endings');
  }
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function findTopLevelSection(lines: readonly string[], key: string): Span | null {
  const starts: number[] = [];
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i]!)) starts.push(i);
  }
  if (starts.length > 1) {
    throw new FlowkitError('MANIFEST_AMBIGUOUS', `duplicate top-level ${key}: section`);
  }
  if (starts.length === 0) return null;
  const start = starts[0]!;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*(?:.*)?$/.test(line)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function parseRoot(content: string): Record<string, unknown> {
  const parsed = parseYaml(content);
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    throw new FlowkitError(
      'MANIFEST_PARSE_FAILED',
      parsed.ok ? 'Delivery Manifest root must be a mapping' : parsed.error,
    );
  }
  return parsed.value as Record<string, unknown>;
}

export class DeliveryManifestDocument {
  private content: string;

  private constructor(content: string) {
    this.content = content.endsWith('\n') ? content : `${content}\n`;
  }

  static parse(content: string): DeliveryManifestDocument {
    splitLines(content);
    parseRoot(content);
    return new DeliveryManifestDocument(content);
  }

  toString(): string {
    return this.content.endsWith('\n') ? this.content : `${this.content}\n`;
  }

  appendOwnerDecision(record: OwnerDecisionRecord): { ref: string; changed: boolean } {
    requireCleanScalar(record.ref, 'ref');
    requireCleanScalar(record.decision, 'decision');
    requireCleanScalar(record.deliveryId, 'deliveryId');
    requireCleanScalar(record.sourceRef, 'sourceRef');
    if (record.changeId !== undefined) requireCleanScalar(record.changeId, 'changeId');

    const root = parseRoot(this.content);
    const existing = root['ownerDecisions'];
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'ownerDecisions must be a block sequence');
    }
    if (Array.isArray(existing)) {
      for (const item of existing) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'ownerDecisions item must be a mapping');
        }
        const obj = item as Record<string, unknown>;
        if (obj['ref'] !== record.ref) continue;
        const same =
          obj['decision'] === record.decision &&
          obj['deliveryId'] === record.deliveryId &&
          obj['changeId'] === record.changeId &&
          obj['sourceRef'] === record.sourceRef;
        if (!same) {
          throw new FlowkitError('OWNER_DECISION_REF_COLLISION', `Owner decision ref collision: ${record.ref}`);
        }
        return { ref: record.ref, changed: false };
      }
    }

    const lines = splitLines(this.content);
    const ownerSpan = findTopLevelSection(lines, 'ownerDecisions');
    if (ownerSpan !== null) {
      if (ownerSpan.end === ownerSpan.start + 1) {
        throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'empty ownerDecisions section is not supported');
      }
      const next = [...lines];
      next.splice(ownerSpan.end, 0, ...renderOwnerDecisionRecord(record));
      this.content = `${next.join('\n')}\n`;
      return { ref: record.ref, changed: true };
    }

    const changesSpan = findTopLevelSection(lines, 'changes');
    if (changesSpan === null) {
      throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'changes section missing');
    }
    const insertion = [
      '',
      'ownerDecisions:',
      ...renderOwnerDecisionRecord(record),
    ];
    const next = [...lines];
    next.splice(changesSpan.end, 0, ...insertion);
    this.content = `${next.join('\n')}\n`;
    return { ref: record.ref, changed: true };
  }

  appendChange(change: PersistedChangeInput): void {
    const root = parseRoot(this.content);
    if (!Array.isArray(root['changes'])) {
      throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'changes must be a block sequence');
    }
    const changes = root['changes'] as unknown[];
    for (const item of changes) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;
      if (obj['key'] === change.key || obj['id'] === change.id) {
        throw new FlowkitError('CHANGE_ALREADY_EXISTS', `Change key/id already exists: ${change.key}/${change.id}`);
      }
    }
    const lines = splitLines(this.content);
    const span = findTopLevelSection(lines, 'changes');
    if (span === null || span.end <= span.start + 1) {
      throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'changes section missing or empty');
    }
    const next = [...lines];
    next.splice(span.end, 0, '', ...renderChange(change));
    this.content = `${next.join('\n')}\n`;
  }

  updateChangeState(changeId: string, from: string, to: string): void {
    const lines = splitLines(this.content);
    const span = findTopLevelSection(lines, 'changes');
    if (span === null) throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'changes section missing');

    const itemStarts: number[] = [];
    for (let i = span.start + 1; i < span.end; i++) {
      if (/^ {2}- key:\s+/.test(lines[i]!)) itemStarts.push(i);
    }
    if (itemStarts.length === 0) {
      throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'changes section has no canonical block items');
    }

    let target: { start: number; end: number } | null = null;
    for (let n = 0; n < itemStarts.length; n++) {
      const itemStart = itemStarts[n]!;
      const itemEnd = itemStarts[n + 1] ?? span.end;
      const idValues = lines.slice(itemStart, itemEnd)
        .filter((line) => /^ {4}id:\s+/.test(line))
        .map((line) => line.replace(/^ {4}id:\s+/, '').trim())
        .map((raw) => {
          try { return JSON.parse(raw) as unknown; } catch { return raw; }
        });
      if (idValues.length !== 1) {
        throw new FlowkitError('MANIFEST_AMBIGUOUS', 'Change item must contain exactly one id field');
      }
      if (idValues[0] === changeId) {
        if (target !== null) throw new FlowkitError('MANIFEST_AMBIGUOUS', `duplicate Change id ${changeId}`);
        target = { start: itemStart, end: itemEnd };
      }
    }

    if (target === null) throw new FlowkitError('CHANGE_NOT_FOUND', `Change not found: ${changeId}`);
    const stateIndices: number[] = [];
    for (let i = target.start; i < target.end; i++) {
      if (/^ {4}state:\s+/.test(lines[i]!)) stateIndices.push(i);
    }
    if (stateIndices.length !== 1) {
      throw new FlowkitError('MANIFEST_AMBIGUOUS', `Change ${changeId} must have exactly one state field`);
    }
    const stateIndex = stateIndices[0]!;
    const current = lines[stateIndex]!.replace(/^ {4}state:\s+/, '').trim();
    if (current !== from) {
      throw new FlowkitError('CHANGE_STATE_MISMATCH', `Change ${changeId} expected state ${from}, got ${current}`);
    }
    const next = [...lines];
    next[stateIndex] = `    state: ${to}`;
    this.content = `${next.join('\n')}\n`;
  }
}

export function serializeNewDeliveryManifest(
  input: DeliveryCreateInput,
  createdAt: string,
  createRecord: OwnerDecisionRecord,
): string {
  const lines: string[] = [
    `id: ${quote(input.id)}`,
    `createdAt: ${quote(createdAt)}`,
    `branch: ${quote(input.branch)}`,
    '',
    `goal: ${quote(input.goal)}`,
    '',
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    '',
    'scope:',
    '  included:',
    ...renderStringList(input.scope.included, '    '),
    '  excluded:',
    ...renderStringList(input.scope.excluded, '    '),
    '',
    'architecture:',
    `  impact: ${input.architecture.impact ? 'true' : 'false'}`,
    `  archifyPlan: ${quote(input.architecture.archifyPlan)}`,
    '',
    'changes:',
  ];
  for (const change of input.changes) {
    lines.push(...renderChange({ ...change, state: 'planned' }), '');
  }
  if (lines.at(-1) === '') lines.pop();
  lines.push(
    '',
    'ownerDecisions:',
    ...renderOwnerDecisionRecord(createRecord),
    '',
    'verification:',
    '  change:',
    '    requireApplicableChecks: true',
    '  fullTest:',
    '    requiresOwnerAuthorization: true',
    '    plan:',
    ...renderStringList(input.fullTestPlan, '      '),
    '',
    'acceptance:',
    ...renderStringList(input.acceptance, '  '),
  );
  return `${lines.join('\n')}\n`;
}
