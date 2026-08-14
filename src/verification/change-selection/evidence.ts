import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FullTestStatus, VerificationStatus } from '../../domain/types.js';
import { OpenSpecCliAdapter } from '../../integrations/openspec/openspec-cli-adapter.js';
import { FlowkitError } from '../../shared/errors.js';
import { runCommand, type ExternalCommandOutcome } from '../../shared/external-command.js';
import { validateVerificationSelection, type VerificationSelection } from './selection.js';

export const VERIFICATION_EVIDENCE_FILE = 'verification-evidence.json';

export interface VerificationCheckEvidence {
  readonly scope: string;
  readonly applicability: 'applicable';
  readonly commandOrMethod: string;
  readonly status: 'passed' | 'failed';
  readonly summary: string;
  readonly resultRef: string;
  readonly environment: string;
  readonly outcomeKind: ExternalCommandOutcome['kind'] | 'openspec-validation';
  readonly exitCode: number;
  readonly stdoutFingerprint: string;
  readonly stderrFingerprint: string;
}

export interface VerificationEvidenceRecord {
  readonly schemaVersion: 1;
  readonly producingRunId: string;
  readonly selectionFingerprint: string;
  readonly overallStatus: Extract<VerificationStatus, 'passed' | 'failed' | 'not-applicable'>;
  readonly fullTestStatus: FullTestStatus;
  readonly environment: string;
  readonly checks: readonly VerificationCheckEvidence[];
  readonly notApplicableProof?: { readonly predicateId: 'no-candidate-change' };
}

export interface ExecuteVerificationSelectionInput {
  readonly repoRoot: string;
  readonly changeId: string;
  readonly runDir: string;
  readonly producingRunId: string;
  readonly selection: VerificationSelection;
  readonly fullTestStatus: FullTestStatus;
  readonly openSpecAdapter: OpenSpecCliAdapter;
}

export type VerificationSelectionExecutor = (
  input: ExecuteVerificationSelectionInput,
) => Promise<VerificationEvidenceRecord>;

export async function executeVerificationSelection(
  input: ExecuteVerificationSelectionInput,
): Promise<VerificationEvidenceRecord> {
  const selection = validateVerificationSelection(input.selection);
  const environment = verificationEnvironment();
  if (selection.capabilityRelation.kind === 'not-applicable') {
    return validateVerificationEvidenceRecord({
      schemaVersion: 1,
      producingRunId: input.producingRunId,
      selectionFingerprint: selection.selectionFingerprint,
      overallStatus: 'not-applicable',
      fullTestStatus: input.fullTestStatus,
      environment,
      checks: [],
      notApplicableProof: selection.capabilityRelation,
    });
  }

  const checks: VerificationCheckEvidence[] = [];
  for (const [index, scope] of selection.verificationScopes.entries()) {
    checks.push(await executeScope(input, scope, index, environment));
  }
  return validateVerificationEvidenceRecord({
    schemaVersion: 1,
    producingRunId: input.producingRunId,
    selectionFingerprint: selection.selectionFingerprint,
    overallStatus: checks.every((check) => check.status === 'passed') ? 'passed' : 'failed',
    fullTestStatus: input.fullTestStatus,
    environment,
    checks,
  });
}

export async function publishVerificationEvidence(
  runDir: string,
  record: VerificationEvidenceRecord,
): Promise<{ readonly record: VerificationEvidenceRecord; readonly fingerprint: string }> {
  const validated = validateVerificationEvidenceRecord(record);
  const path = join(runDir, VERIFICATION_EVIDENCE_FILE);
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;
  try {
    await writeFile(path, serialized, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    let existing: string;
    try { existing = await readFile(path, 'utf8'); }
    catch { throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Cannot read existing immutable verification evidence', { path, detail: error instanceof Error ? error.message : String(error) }); }
    if (existing !== serialized) {
      throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Immutable verification evidence already exists with different bytes', { path });
    }
  }
  return { record: validated, fingerprint: sha256(serialized) };
}

export async function readVerificationEvidenceRecord(
  runDir: string,
  required: boolean,
): Promise<{ readonly record: VerificationEvidenceRecord; readonly fingerprint: string } | undefined> {
  const path = join(runDir, VERIFICATION_EVIDENCE_FILE);
  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch (error) {
    if (!required) return undefined;
    throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Immutable verification evidence is missing', { path, detail: error instanceof Error ? error.message : String(error) });
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch (error) { throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Immutable verification evidence is malformed JSON', { path, detail: error instanceof Error ? error.message : String(error) }); }
  return { record: validateVerificationEvidenceRecord(parsed), fingerprint: sha256(raw) };
}

export function validateVerificationEvidenceForSelection(
  evidence: VerificationEvidenceRecord,
  selection: VerificationSelection,
  producingRunId: string,
): void {
  const validatedSelection = validateVerificationSelection(selection);
  const validatedEvidence = validateVerificationEvidenceRecord(evidence);
  if (validatedEvidence.producingRunId !== producingRunId || validatedEvidence.selectionFingerprint !== validatedSelection.selectionFingerprint) {
    throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Verification evidence does not bind the producing Run and exact selection', { producingRunId });
  }
  if (validatedSelection.capabilityRelation.kind === 'not-applicable') {
    if (validatedEvidence.overallStatus !== 'not-applicable' || validatedEvidence.checks.length !== 0 || validatedEvidence.notApplicableProof?.predicateId !== validatedSelection.capabilityRelation.predicateId) {
      throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'not-applicable evidence does not match the closed selection proof', { producingRunId });
    }
    return;
  }
  if (validatedEvidence.overallStatus === 'not-applicable') {
    throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'matched selection cannot use not-applicable evidence', { producingRunId });
  }
  const scopes = validatedEvidence.checks.map((check) => check.scope);
  if (JSON.stringify(scopes) !== JSON.stringify(validatedSelection.verificationScopes)) {
    throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Verification evidence checks do not exactly match selected scopes', { producingRunId, scopes });
  }
  const expectedOverall = validatedEvidence.checks.every((check) => check.status === 'passed') ? 'passed' : 'failed';
  if (validatedEvidence.overallStatus !== expectedOverall) {
    throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Verification evidence overall status is incoherent with selected checks', { producingRunId });
  }
}

export function validateVerificationEvidenceRecord(value: unknown): VerificationEvidenceRecord {
  const object = asObject(value, 'verification evidence');
  const keys = Object.keys(object).sort();
  const hasProof = object['notApplicableProof'] !== undefined;
  const expected = hasProof
    ? ['checks', 'environment', 'fullTestStatus', 'notApplicableProof', 'overallStatus', 'producingRunId', 'schemaVersion', 'selectionFingerprint']
    : ['checks', 'environment', 'fullTestStatus', 'overallStatus', 'producingRunId', 'schemaVersion', 'selectionFingerprint'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) || object['schemaVersion'] !== 1) fail('verification evidence must use the closed schemaVersion 1 shape');
  const producingRunId = nonEmpty(object['producingRunId'], 'producingRunId');
  const selectionFingerprint = requireSha(object['selectionFingerprint'], 'selectionFingerprint');
  const overallStatus = object['overallStatus'];
  if (overallStatus !== 'passed' && overallStatus !== 'failed' && overallStatus !== 'not-applicable') fail('overallStatus must be passed|failed|not-applicable');
  const fullTestStatus = object['fullTestStatus'];
  if (fullTestStatus !== 'not-ready' && fullTestStatus !== 'awaiting-user-decision' && fullTestStatus !== 'authorized' && fullTestStatus !== 'passed' && fullTestStatus !== 'failed') fail('fullTestStatus is invalid');
  const environment = nonEmpty(object['environment'], 'environment');
  if (!Array.isArray(object['checks'])) fail('checks must be an array');
  const checks = object['checks'].map((candidate, index) => validateCheck(candidate, index));
  if (new Set(checks.map((check) => check.scope)).size !== checks.length) fail('verification evidence scopes must be unique');
  const notApplicableProof = hasProof ? validateProof(object['notApplicableProof']) : undefined;
  if (overallStatus === 'not-applicable') {
    if (checks.length !== 0 || notApplicableProof === undefined) fail('not-applicable evidence requires zero checks and closed proof');
  } else if (checks.length === 0 || notApplicableProof !== undefined) {
    fail('matched verification evidence requires checks and must not carry not-applicable proof');
  }
  return {
    schemaVersion: 1,
    producingRunId,
    selectionFingerprint,
    overallStatus,
    fullTestStatus,
    environment,
    checks,
    ...(notApplicableProof !== undefined && { notApplicableProof }),
  };
}

function validateCheck(value: unknown, index: number): VerificationCheckEvidence {
  const object = asObject(value, `checks[${index}]`);
  const expected = ['applicability', 'commandOrMethod', 'environment', 'exitCode', 'outcomeKind', 'resultRef', 'scope', 'status', 'stderrFingerprint', 'stdoutFingerprint', 'summary'];
  const keys = Object.keys(object).sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) fail(`checks[${index}] must use the closed shape`);
  if (object['applicability'] !== 'applicable') fail(`checks[${index}].applicability must be applicable`);
  const status = object['status'];
  if (status !== 'passed' && status !== 'failed') fail(`checks[${index}].status must be passed|failed`);
  const outcomeKind = object['outcomeKind'];
  if (outcomeKind !== 'spawn-failed' && outcomeKind !== 'exited' && outcomeKind !== 'timed-out-cancelled' && outcomeKind !== 'outcome-unknown' && outcomeKind !== 'openspec-validation') fail(`checks[${index}].outcomeKind is invalid`);
  if (!Number.isInteger(object['exitCode'])) fail(`checks[${index}].exitCode must be an integer`);
  return {
    scope: nonEmpty(object['scope'], `checks[${index}].scope`),
    applicability: 'applicable',
    commandOrMethod: nonEmpty(object['commandOrMethod'], `checks[${index}].commandOrMethod`),
    status,
    summary: nonEmpty(object['summary'], `checks[${index}].summary`),
    resultRef: normalizedLogicalRef(object['resultRef'], `checks[${index}].resultRef`),
    environment: nonEmpty(object['environment'], `checks[${index}].environment`),
    outcomeKind,
    exitCode: object['exitCode'] as number,
    stdoutFingerprint: requireSha(object['stdoutFingerprint'], `checks[${index}].stdoutFingerprint`),
    stderrFingerprint: requireSha(object['stderrFingerprint'], `checks[${index}].stderrFingerprint`),
  };
}

async function executeScope(
  input: ExecuteVerificationSelectionInput,
  scope: string,
  index: number,
  environment: string,
): Promise<VerificationCheckEvidence> {
  const resultRef = `${logicalRefForRunEvidence(input.runDir)}#check-${index + 1}`;
  if (scope === 'npx openspec validate change-verification-selection-and-change-set --strict') {
    try {
      const validation = await input.openSpecAdapter.validateChange(input.changeId, true);
      const stable = JSON.stringify({ valid: validation.valid, issues: validation.issues, status: validation.status, exitCode: validation.exitCode });
      const passed = validation.valid && validation.exitCode === 0;
      return {
        scope,
        applicability: 'applicable',
        commandOrMethod: 'OpenSpecCliAdapter.validateChange(strict=true)',
        status: passed ? 'passed' : 'failed',
        summary: passed ? 'strict OpenSpec Change validation passed' : 'strict OpenSpec Change validation returned invalid',
        resultRef,
        environment,
        outcomeKind: 'openspec-validation',
        exitCode: validation.exitCode,
        stdoutFingerprint: sha256(stable),
        stderrFingerprint: sha256(''),
      };
    } catch (error) {
      const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
      return {
        scope,
        applicability: 'applicable',
        commandOrMethod: 'OpenSpecCliAdapter.validateChange(strict=true)',
        status: 'failed',
        summary: `strict OpenSpec Change validation failed closed: ${message}`,
        resultRef,
        environment,
        outcomeKind: 'outcome-unknown',
        exitCode: 1,
        stdoutFingerprint: sha256(''),
        stderrFingerprint: sha256(message),
      };
    }
  }

  const resolved = await resolveScopeCommand(input.repoRoot, scope);
  const outcome = await runCommand(resolved.command, [...resolved.args], {
    cwd: input.repoRoot,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    timeout: 120_000,
  });
  const passed = outcome.kind === 'exited' && outcome.exitCode === 0;
  return {
    scope,
    applicability: 'applicable',
    commandOrMethod: `${resolved.command} ${resolved.args.join(' ')}`.trim(),
    status: passed ? 'passed' : 'failed',
    summary: passed ? 'command exited successfully' : `command failed closed: ${outcome.kind}; exitCode=${outcome.exitCode}`,
    resultRef,
    environment,
    outcomeKind: outcome.kind,
    exitCode: outcome.exitCode,
    stdoutFingerprint: sha256(outcome.stdout),
    stderrFingerprint: sha256(outcome.stderr),
  };
}

async function resolveScopeCommand(repoRoot: string, scope: string): Promise<{ readonly command: string; readonly args: readonly string[] }> {
  if (scope === 'npm run typecheck') {
    return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'typecheck'] };
  }
  const nodePrefix = 'node --test --import tsx ';
  if (scope.startsWith(nodePrefix)) {
    const requested = scope.slice(nodePrefix.length).split(' ').filter(Boolean);
    const files: string[] = [];
    for (const candidate of requested) {
      if (candidate.endsWith('/*.test.ts')) {
        const directory = candidate.slice(0, -'/*.test.ts'.length);
        const entries = await readdir(join(repoRoot, directory), { withFileTypes: true });
        files.push(...entries.filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts')).map((entry) => `${directory}/${entry.name}`).sort());
      } else {
        files.push(candidate);
      }
    }
    return { command: process.execPath, args: ['--test', '--import', 'tsx', ...files] };
  }
  throw new FlowkitError('VERIFICATION_SCOPE_EXECUTION_UNSUPPORTED', 'Selected verification scope has no closed execution mapping', { scope });
}

function verificationEnvironment(): string {
  return `platform=${process.platform} arch=${process.arch} node=${process.version}`;
}

function logicalRefForRunEvidence(runDir: string): string {
  const normalized = runDir.replaceAll('\\', '/');
  const marker = '/.flowkit/runs/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0) throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Run directory is not under .flowkit/runs', { runDir });
  return `${normalized.slice(index + 1)}/${VERIFICATION_EVIDENCE_FILE}`;
}

function validateProof(value: unknown): { readonly predicateId: 'no-candidate-change' } {
  const object = asObject(value, 'notApplicableProof');
  if (Object.keys(object).length !== 1 || object['predicateId'] !== 'no-candidate-change') fail('notApplicableProof must be the closed no-candidate-change proof');
  return { predicateId: 'no-candidate-change' };
}
function asObject(value: unknown, label: string): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`); return value as Record<string, unknown>; }
function nonEmpty(value: unknown, label: string): string { if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`); return value; }
function requireSha(value: unknown, label: string): string { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(`${label} must be SHA-256`); return value; }
function normalizedLogicalRef(value: unknown, label: string): string { const result = nonEmpty(value, label); if (result.startsWith('/') || result.includes('\\') || result.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} must be a normalized logical ref`); return result; }
function fail(message: string): never { throw new FlowkitError('SCHEMA_VALIDATION_FAILED', message); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
