import { FlowkitError } from '../shared/errors.js';
import { parseYaml } from '../facts/yaml-parser.js';
import type {
  OwnerDecisionRecord,
  PersistedChangeInput,
  DeliveryCreateInput,
} from '../domain/a1-types.js';
import type {
  FullTestExecutionBlock,
  FullTestExecutionContract,
  FullTestTerminalResult,
  ResolvedFullTestFailureFinding,
} from '../domain/full-test.js';
import type { AcceptedSystemSource, CurrentArchitectureCycle } from '../architecture/architecture-lifecycle.js';

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

function renderFullTestExecution(execution: FullTestExecutionContract, indent = '    '): string[] {
  const child = `${indent}  `;
  return [
    `${indent}execution:`,
    `${child}id: ${quote(execution.id)}`,
    `${child}kind: ${execution.kind}`,
    `${child}command: ${quote(execution.command)}`,
    `${child}args:`,
    ...renderStringList(execution.args, `${child}  `),
    `${child}launcherMode: ${execution.launcherMode}`,
    `${child}scope: ${execution.scope}`,
    `${child}timeoutMs: ${execution.timeoutMs}`,
    `${child}resultProtocol: ${execution.resultProtocol}`,
    `${child}resultAuthority: ${execution.resultAuthority}`,
    `${child}expectedTerminalStatuses:`,
    ...renderStringList(execution.expectedTerminalStatuses, `${child}  `),
  ];
}

function renderFullTestExecutionBlock(block: FullTestExecutionBlock, indent = '    '): string[] {
  const child = `${indent}  `;
  return [
    `${indent}executionBlock:`,
    `${child}schemaVersion: ${block.schemaVersion}`,
    `${child}reason: ${block.reason}`,
    `${child}summary: ${quote(block.summary)}`,
  ];
}

function renderFullTestResult(result: FullTestTerminalResult, indent = '    '): string[] {
  const child = `${indent}  `;
  const lines = [
    `${indent}result:`,
    `${child}schemaVersion: ${result.schemaVersion}`,
    `${child}status: ${result.status}`,
    `${child}summary: ${quote(result.summary)}`,
    `${child}totalDurationMs: ${result.totalDurationMs}`,
    `${child}checks:`,
  ];
  for (const check of result.checks) {
    lines.push(
      `${child}  - id: ${quote(check.id)}`,
      `${child}    status: ${check.status}`,
      `${child}    durationMs: ${check.durationMs}`,
    );
  }
  lines.push(`${child}resultRef: ${quote(result.resultRef)}`);
  return lines;
}

function renderRetainedFullTestResult(result: FullTestTerminalResult, itemIndent = '      '): string[] {
  const fieldIndent = `${itemIndent}  `;
  const lines = [
    `${itemIndent}- schemaVersion: ${result.schemaVersion}`,
    `${fieldIndent}status: ${result.status}`,
    `${fieldIndent}summary: ${quote(result.summary)}`,
    `${fieldIndent}totalDurationMs: ${result.totalDurationMs}`,
    `${fieldIndent}checks:`,
  ];
  for (const check of result.checks) {
    lines.push(
      `${fieldIndent}  - id: ${quote(check.id)}`,
      `${fieldIndent}    status: ${check.status}`,
      `${fieldIndent}    durationMs: ${check.durationMs}`,
    );
  }
  lines.push(`${fieldIndent}resultRef: ${quote(result.resultRef)}`);
  return lines;
}

function renderResolvedFullTestFinding(
  finding: ResolvedFullTestFailureFinding,
  itemIndent = '    ',
): string[] {
  const fieldIndent = `${itemIndent}  `;
  return [
    `${itemIndent}- schemaVersion: ${finding.schemaVersion}`,
    `${fieldIndent}findingId: ${quote(finding.findingId)}`,
    `${fieldIndent}authorizationRef: ${quote(finding.authorizationRef)}`,
    `${fieldIndent}sourceResultRef: ${quote(finding.sourceResultRef)}`,
    `${fieldIndent}severity: ${finding.severity}`,
    `${fieldIndent}summary: ${quote(finding.summary)}`,
    `${fieldIndent}affectedScope: ${finding.affectedScope}`,
    `${fieldIndent}requiredOwnerDecision: ${finding.requiredOwnerDecision}`,
    `${fieldIndent}resolution:`,
    `${fieldIndent}  kind: ${finding.resolution.kind}`,
    `${fieldIndent}  changeId: ${quote(finding.resolution.changeId)}`,
    `${fieldIndent}  ownerDecisionRef: ${quote(finding.resolution.ownerDecisionRef)}`,
  ];
}


function renderActualArchitectureRef(ref: CurrentArchitectureCycle['actualArchitectureRef'] | AcceptedSystemSource['actualArchitectureRef'], indent: string): string[] {
  return [
    `${indent}path: ${quote(ref.path)}`,
    `${indent}sha256: ${quote(ref.sha256)}`,
    `${indent}repositoryRevision: ${quote(ref.repositoryRevision)}`,
  ];
}

function renderArchitectureCurrentCycle(cycle: CurrentArchitectureCycle, indent = '  '): string[] {
  const field = `${indent}  `;
  const lines = [
    `${indent}currentCycle:`,
    `${field}schemaVersion: 1`,
    `${field}cycleRef: ${quote(cycle.cycleRef)}`,
    `${field}fullTestAuthorizationRef: ${quote(cycle.fullTestAuthorizationRef)}`,
    `${field}fullTestResultRef: ${quote(cycle.fullTestResultRef)}`,
    `${field}actualArchitectureRef:`,
    ...renderActualArchitectureRef(cycle.actualArchitectureRef, `${field}  `),
    `${field}compareRef: ${quote(cycle.compareRef)}`,
    `${field}acceptance:`,
    `${field}  status: ${cycle.acceptance.status}`,
  ];
  if (cycle.acceptance.status === 'accepted') {
    lines.push(`${field}  ownerDecisionRef: ${quote(cycle.acceptance.ownerDecisionRef)}`);
  }
  return lines;
}

function renderAcceptedSystemSource(source: AcceptedSystemSource, indent = '  '): string[] {
  const field = `${indent}  `;
  return [
    `${indent}acceptedSystemSource:`,
    `${field}schemaVersion: 1`,
    `${field}sourceDeliveryId: ${quote(source.sourceDeliveryId)}`,
    `${field}actualArchitectureRef:`,
    ...renderActualArchitectureRef(source.actualArchitectureRef, `${field}  `),
    `${field}compareRef: ${quote(source.compareRef)}`,
    `${field}ownerAcceptanceRef: ${quote(source.ownerAcceptanceRef)}`,
  ];
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
  if (record.scope !== undefined) {
    lines.push(`${fieldIndent}scope: ${quote(record.scope)}`);
  }
  if (record.requiredOutcomes !== undefined) {
    lines.push(`${fieldIndent}requiredOutcomes:`);
    lines.push(...renderStringList(record.requiredOutcomes, `${fieldIndent}  `));
  }
  if (record.architectureCycleRef !== undefined) {
    lines.push(`${fieldIndent}architectureCycleRef: ${quote(record.architectureCycleRef)}`);
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


function normalizeManifestLineEndings(content: string): string {
  if (!content.includes('\r')) return content;

  // Accept exactly one Windows form: every newline is CRLF. Any bare CR or a
  // mixture of CRLF and bare LF remains unsupported/fail-closed.
  const withoutCrLf = content.replace(/\r\n/g, '');
  if (withoutCrLf.includes('\r')) {
    throw new FlowkitError(
      'MANIFEST_UNSUPPORTED_SHAPE',
      'Delivery Manifest contains unsupported carriage return characters',
    );
  }
  if (withoutCrLf.includes('\n')) {
    throw new FlowkitError(
      'MANIFEST_UNSUPPORTED_SHAPE',
      'Delivery Manifest contains mixed LF/CRLF line endings',
    );
  }
  return content.replace(/\r\n/g, '\n');
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
    const normalized = normalizeManifestLineEndings(content);
    splitLines(normalized);
    parseRoot(normalized);
    return new DeliveryManifestDocument(normalized);
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
    if (record.scope !== undefined) requireCleanScalar(record.scope, 'scope');
    if (record.architectureCycleRef !== undefined) requireCleanScalar(record.architectureCycleRef, 'architectureCycleRef');
    if (record.requiredOutcomes !== undefined) {
      if (record.requiredOutcomes.length === 0) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'requiredOutcomes must not be empty');
      for (const outcome of record.requiredOutcomes) requireCleanScalar(outcome, 'requiredOutcomes');
    }

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
          obj['scope'] === record.scope &&
          JSON.stringify(obj['requiredOutcomes']) === JSON.stringify(record.requiredOutcomes) &&
          obj['architectureCycleRef'] === record.architectureCycleRef &&
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

  updateFullTestStatus(from: string, to: string): void {
    const lines = splitLines(this.content);
    const span = findTopLevelSection(lines, 'delivery');
    if (span === null) throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'delivery section missing');
    const indices: number[] = [];
    for (let i = span.start + 1; i < span.end; i++) if (/^ {2}fullTestStatus:\s+/.test(lines[i]!)) indices.push(i);
    if (indices.length !== 1) throw new FlowkitError('MANIFEST_AMBIGUOUS', 'delivery must contain exactly one fullTestStatus');
    const index = indices[0]!;
    const current = lines[index]!.replace(/^ {2}fullTestStatus:\s+/, '').trim();
    if (current !== from) throw new FlowkitError('FULL_TEST_STATUS_MISMATCH', `expected Full Test status ${from}, got ${current}`);
    const next = [...lines];
    next[index] = `  fullTestStatus: ${to}`;
    this.content = `${next.join('\n')}\n`;
  }

  private replaceFullTestOwnedBlock(key: 'executionBlock' | 'result' | 'failureHistory', replacement: readonly string[]): void {
    const lines = splitLines(this.content);
    const verification = findTopLevelSection(lines, 'verification');
    if (verification === null) throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'verification section missing');
    const fullStarts: number[] = [];
    for (let i = verification.start + 1; i < verification.end; i++) if (/^ {2}fullTest:\s*$/.test(lines[i]!)) fullStarts.push(i);
    if (fullStarts.length !== 1) throw new FlowkitError('MANIFEST_AMBIGUOUS', 'verification must contain exactly one fullTest section');
    const fullStart = fullStarts[0]!;
    let fullEnd = verification.end;
    for (let i = fullStart + 1; i < verification.end; i++) {
      if (/^ {2}[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(lines[i]!)) { fullEnd = i; break; }
    }
    const keyRe = new RegExp(`^ {4}${key}:\\s*$`);
    const starts: number[] = [];
    for (let i = fullStart + 1; i < fullEnd; i++) if (keyRe.test(lines[i]!)) starts.push(i);
    if (starts.length > 1) throw new FlowkitError('MANIFEST_AMBIGUOUS', `duplicate verification.fullTest.${key}`);
    const next = [...lines];
    if (starts.length === 1) {
      const start = starts[0]!;
      let end = fullEnd;
      for (let i = start + 1; i < fullEnd; i++) {
        if (/^ {4}[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(lines[i]!)) { end = i; break; }
      }
      next.splice(start, end - start, ...replacement);
    } else {
      next.splice(fullEnd, 0, ...replacement);
    }
    this.content = `${next.join('\n')}\n`;
  }

  setFullTestExecutionBlock(block: FullTestExecutionBlock): void {
    requireCleanScalar(block.summary, 'executionBlock.summary');
    this.replaceFullTestOwnedBlock('executionBlock', renderFullTestExecutionBlock(block));
  }

  publishFullTestResult(result: FullTestTerminalResult): void {
    requireCleanScalar(result.summary, 'result.summary');
    this.updateFullTestStatus('authorized', result.status);
    this.replaceFullTestOwnedBlock('result', renderFullTestResult(result));
  }

  retainFullTestFailureResult(result: FullTestTerminalResult): void {
    if (result.status !== 'failed') {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'failureHistory may retain only failed Full Test results');
    }
    requireCleanScalar(result.summary, 'failureHistory.summary');
    const root = parseRoot(this.content);
    const verification = root['verification'];
    const verificationObj = typeof verification === 'object' && verification !== null && !Array.isArray(verification)
      ? verification as Record<string, unknown>
      : undefined;
    const fullTest = verificationObj?.['fullTest'];
    const fullTestObj = typeof fullTest === 'object' && fullTest !== null && !Array.isArray(fullTest)
      ? fullTest as Record<string, unknown>
      : undefined;
    const existing = fullTestObj?.['failureHistory'];
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'verification.fullTest.failureHistory must be a sequence');
    }
    if (Array.isArray(existing)) {
      for (const item of existing) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'failureHistory item must be a mapping');
        }
        const obj = item as Record<string, unknown>;
        if (obj['resultRef'] !== result.resultRef) continue;
        const same = JSON.stringify(obj) === JSON.stringify({
          schemaVersion: result.schemaVersion,
          status: result.status,
          summary: result.summary,
          totalDurationMs: result.totalDurationMs,
          checks: result.checks.map((check) => ({ id: check.id, status: check.status, durationMs: check.durationMs })),
          resultRef: result.resultRef,
        });
        if (!same) throw new FlowkitError('FULL_TEST_RESULT_REF_COLLISION', `retained result ref collision: ${result.resultRef}`);
        return;
      }
    }

    const lines = splitLines(this.content);
    const verificationSpan = findTopLevelSection(lines, 'verification');
    if (verificationSpan === null) throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'verification section missing');
    const fullStarts: number[] = [];
    for (let i = verificationSpan.start + 1; i < verificationSpan.end; i++) if (/^ {2}fullTest:\s*$/.test(lines[i]!)) fullStarts.push(i);
    if (fullStarts.length !== 1) throw new FlowkitError('MANIFEST_AMBIGUOUS', 'verification must contain exactly one fullTest section');
    const fullStart = fullStarts[0]!;
    let fullEnd = verificationSpan.end;
    for (let i = fullStart + 1; i < verificationSpan.end; i++) if (/^ {2}[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(lines[i]!)) { fullEnd = i; break; }
    const historyStart = lines.findIndex((line, index) => index > fullStart && index < fullEnd && /^ {4}failureHistory:\s*$/.test(line));
    const next = [...lines];
    if (historyStart >= 0) {
      let historyEnd = fullEnd;
      for (let i = historyStart + 1; i < fullEnd; i++) if (/^ {4}[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(lines[i]!)) { historyEnd = i; break; }
      next.splice(historyEnd, 0, ...renderRetainedFullTestResult(result));
    } else {
      next.splice(fullEnd, 0, '    failureHistory:', ...renderRetainedFullTestResult(result));
    }
    this.content = `${next.join('\n')}\n`;
  }

  removeFullTestResult(): void {
    this.replaceFullTestOwnedBlock('result', []);
  }

  appendResolvedFullTestFinding(finding: ResolvedFullTestFailureFinding): void {
    requireCleanScalar(finding.findingId, 'finding.findingId');
    requireCleanScalar(finding.authorizationRef, 'finding.authorizationRef');
    requireCleanScalar(finding.sourceResultRef, 'finding.sourceResultRef');
    requireCleanScalar(finding.summary, 'finding.summary');
    requireCleanScalar(finding.resolution.changeId, 'finding.resolution.changeId');
    requireCleanScalar(finding.resolution.ownerDecisionRef, 'finding.resolution.ownerDecisionRef');
    const root = parseRoot(this.content);
    const delivery = root['delivery'];
    if (typeof delivery !== 'object' || delivery === null || Array.isArray(delivery)) {
      throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'delivery section missing');
    }
    const existing = (delivery as Record<string, unknown>)['fullTestFindings'];
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'delivery.fullTestFindings must be a sequence');
    }
    if (Array.isArray(existing)) {
      for (const item of existing) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'fullTestFindings item must be a mapping');
        }
        const obj = item as Record<string, unknown>;
        if (obj['findingId'] === finding.findingId || obj['authorizationRef'] === finding.authorizationRef) {
          throw new FlowkitError('FULL_TEST_FINDING_DUPLICATE', `duplicate Full Test failure occurrence ${finding.findingId}`);
        }
      }
    }

    const lines = splitLines(this.content);
    const deliverySpan = findTopLevelSection(lines, 'delivery');
    if (deliverySpan === null) throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'delivery section missing');
    const starts: number[] = [];
    for (let i = deliverySpan.start + 1; i < deliverySpan.end; i++) if (/^ {2}fullTestFindings:\s*$/.test(lines[i]!)) starts.push(i);
    if (starts.length > 1) throw new FlowkitError('MANIFEST_AMBIGUOUS', 'duplicate delivery.fullTestFindings');
    const next = [...lines];
    if (starts.length === 1) {
      const start = starts[0]!;
      let end = deliverySpan.end;
      for (let i = start + 1; i < deliverySpan.end; i++) if (/^ {2}[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(lines[i]!)) { end = i; break; }
      next.splice(end, 0, ...renderResolvedFullTestFinding(finding));
    } else {
      next.splice(deliverySpan.end, 0, '  fullTestFindings:', ...renderResolvedFullTestFinding(finding));
    }
    this.content = `${next.join('\n')}\n`;
  }

  private replaceArchitectureOwnedBlock(key: 'currentCycle' | 'acceptedSystemSource', replacement: readonly string[]): void {
    const lines = splitLines(this.content);
    const span = findTopLevelSection(lines, 'architecture');
    if (span === null) throw new FlowkitError('MANIFEST_UNSUPPORTED_SHAPE', 'architecture section missing');
    const keyRe = new RegExp(`^ {2}${key}:\\s*$`);
    const starts: number[] = [];
    for (let i = span.start + 1; i < span.end; i += 1) if (keyRe.test(lines[i]!)) starts.push(i);
    if (starts.length > 1) throw new FlowkitError('MANIFEST_AMBIGUOUS', `duplicate architecture.${key}`);
    const next = [...lines];
    if (starts.length === 1) {
      const start = starts[0]!;
      let end = span.end;
      for (let i = start + 1; i < span.end; i += 1) {
        if (/^ {2}[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(lines[i]!)) { end = i; break; }
      }
      next.splice(start, end - start, ...replacement);
    } else {
      next.splice(span.end, 0, ...replacement);
    }
    this.content = `${next.join('\n')}\n`;
  }

  publishArchitectureCurrentCycle(cycle: CurrentArchitectureCycle): void {
    this.replaceArchitectureOwnedBlock('currentCycle', renderArchitectureCurrentCycle(cycle));
  }

  removeArchitectureCurrentCycle(): void {
    this.replaceArchitectureOwnedBlock('currentCycle', []);
  }

  publishArchitectureAcceptance(cycle: CurrentArchitectureCycle, source: AcceptedSystemSource): void {
    if (cycle.acceptance.status !== 'accepted') {
      throw new FlowkitError('ARCHITECTURE_ACCEPTANCE_MISMATCH', 'architecture acceptance publication requires accepted cycle');
    }
    this.replaceArchitectureOwnedBlock('currentCycle', renderArchitectureCurrentCycle(cycle));
    this.replaceArchitectureOwnedBlock('acceptedSystemSource', renderAcceptedSystemSource(source));
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
    ...renderFullTestExecution(input.fullTestExecution),
    '    plan:',
    ...renderStringList(input.fullTestPlan, '      '),
    '',
    'acceptance:',
    ...renderStringList(input.acceptance, '  '),
  );
  return `${lines.join('\n')}\n`;
}
