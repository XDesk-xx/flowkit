import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FullTestStatus, VerificationStatus } from '../../domain/types.js';
import { OpenSpecCliAdapter } from '../../integrations/openspec/openspec-cli-adapter.js';
import { FlowkitError } from '../../shared/errors.js';
import { runCommand, type ExternalCommandOutcome } from '../../shared/external-command.js';
import { validateCurrentVerificationSelection, validateVerificationSelection, type VerificationSelection } from './selection.js';

export const VERIFICATION_EVIDENCE_FILE = 'verification-evidence.json';

export interface VerificationCheckEvidence {
  /** Stable logical check id for current records; historical bytes may contain the legacy physical scope string. */
  readonly scope: string;
  readonly applicability: 'applicable';
  readonly commandOrMethod: string;
  readonly status: 'passed' | 'failed';
  readonly summary: string;
  readonly resultRef: string;
  readonly environment: string;
  readonly outcomeKind: ExternalCommandOutcome['kind'] | 'openspec-archive-sync' | 'openspec-validation';
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
  /** Current three-file writer can point check refs at verification.md instead of a Run sidecar. */
  readonly resultRefBase?: string;
}

export type VerificationSelectionExecutor = (
  input: ExecuteVerificationSelectionInput,
) => Promise<VerificationEvidenceRecord>;

const NODE_TEST_CHECKS = new Set([
  'tests-cli',
  'tests-execution',
  'tests-external-tools',
  'tests-openspec-runtime',
  'tests-persistence',
  'tests-serialization',
  'tests-verification',
]);

export async function executeVerificationSelection(
  input: ExecuteVerificationSelectionInput,
): Promise<VerificationEvidenceRecord> {
  const selection = validateCurrentVerificationSelection(input.selection);
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

  const checksById = new Map<string, VerificationCheckEvidence>();
  const nodeIds = selection.verificationScopes.filter((scope) => NODE_TEST_CHECKS.has(scope));
  for (const logicalId of nodeIds) {
    const files = await resolveLogicalNodeTests(input.repoRoot, [logicalId]);
    const nodeEnv: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
    const requiresOpenSpecExecutable =
      logicalId === 'tests-openspec-runtime' ||
      files.includes('tests/integration/g1-change-cli-end-to-end.test.ts');
    if (requiresOpenSpecExecutable) {
      const invocation = await input.openSpecAdapter.resolveInvocation();
      delete nodeEnv['FLOWKIT_OPENSPEC_BIN'];
      delete nodeEnv['FLOWKIT_HOME'];
      Object.assign(nodeEnv, invocation.propagationEnv);
    }
    const outcome = await runCommand(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files], {
      cwd: input.repoRoot,
      env: nodeEnv,
      timeout: 120_000,
    });
    const command = `${process.execPath} --import tsx --test --test-concurrency=1 ${files.join(' ')}`;
    checksById.set(logicalId, evidenceFromOutcome(input, logicalId, command, outcome, environment, 'logical Node test execution'));
  }

  if (selection.verificationScopes.includes('typecheck')) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const outcome = await runCommand(npm, ['run', 'typecheck'], {
      cwd: input.repoRoot,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout: 120_000,
    });
    checksById.set('typecheck', evidenceFromOutcome(input, 'typecheck', `${npm} run typecheck`, outcome, environment, 'typecheck execution'));
  }

  if (selection.verificationScopes.includes('openspec-current-change-strict')) {
    checksById.set('openspec-current-change-strict', await executeOpenSpecCurrentChange(input, environment));
  }
  if (selection.verificationScopes.includes('openspec-current-change-archive-sync')) {
    checksById.set('openspec-current-change-archive-sync', await executeOpenSpecArchiveSync(input, environment));
  }

  const checks = selection.verificationScopes.map((scope, index) => {
    const evidence = checksById.get(scope);
    if (evidence === undefined) {
      throw new FlowkitError('VERIFICATION_SCOPE_EXECUTION_UNSUPPORTED', 'Selected logical verification check has no closed execution mapping', { scope });
    }
    return { ...evidence, resultRef: `${input.resultRefBase ?? logicalRefForRunEvidence(input.runDir)}#check-${index + 1}` };
  });

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

/** Historical/current persisted binding validation. It never compares against the future current Catalog. */
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
    throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Verification evidence checks do not exactly match selected logical checks/scopes', { producingRunId, scopes });
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
  if (outcomeKind !== 'spawn-failed' && outcomeKind !== 'exited' && outcomeKind !== 'timed-out-cancelled' && outcomeKind !== 'outcome-unknown' && outcomeKind !== 'openspec-archive-sync' && outcomeKind !== 'openspec-validation') fail(`checks[${index}].outcomeKind is invalid`);
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

async function executeOpenSpecCurrentChange(
  input: ExecuteVerificationSelectionInput,
  environment: string,
): Promise<VerificationCheckEvidence> {
  try {
    const validation = await input.openSpecAdapter.validateChange(input.changeId, true);
    const stable = JSON.stringify({ valid: validation.valid, issues: validation.issues, status: validation.status, exitCode: validation.exitCode });
    const passed = validation.valid && validation.exitCode === 0;
    return {
      scope: 'openspec-current-change-strict',
      applicability: 'applicable',
      commandOrMethod: 'OpenSpecCliAdapter.validateChange(currentChangeId, strict=true)',
      status: passed ? 'passed' : 'failed',
      summary: passed ? 'strict OpenSpec current Change validation passed' : 'strict OpenSpec current Change validation returned invalid',
      resultRef: 'pending-ref',
      environment,
      outcomeKind: 'openspec-validation',
      exitCode: validation.exitCode,
      stdoutFingerprint: sha256(stable),
      stderrFingerprint: sha256(''),
    };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    return {
      scope: 'openspec-current-change-strict',
      applicability: 'applicable',
      commandOrMethod: 'OpenSpecCliAdapter.validateChange(currentChangeId, strict=true)',
      status: 'failed',
      summary: `strict OpenSpec current Change validation failed closed: ${message}`,
      resultRef: 'pending-ref',
      environment,
      outcomeKind: 'outcome-unknown',
      exitCode: 1,
      stdoutFingerprint: sha256(''),
      stderrFingerprint: sha256(message),
    };
  }
}

async function executeOpenSpecArchiveSync(
  input: ExecuteVerificationSelectionInput,
  environment: string,
): Promise<VerificationCheckEvidence> {
  try {
    const observation = await input.openSpecAdapter.preflightArchiveSync(input.changeId);
    const stable = JSON.stringify(observation);
    return {
      scope: 'openspec-current-change-archive-sync',
      applicability: 'applicable',
      commandOrMethod: 'OpenSpecCliAdapter.preflightArchiveSync(currentChangeId)',
      status: 'passed',
      summary: 'real disposable OpenSpec archive-sync preflight passed',
      resultRef: 'pending-ref',
      environment,
      outcomeKind: 'openspec-archive-sync',
      exitCode: 0,
      stdoutFingerprint: sha256(stable),
      stderrFingerprint: sha256(''),
    };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    return {
      scope: 'openspec-current-change-archive-sync',
      applicability: 'applicable',
      commandOrMethod: 'OpenSpecCliAdapter.preflightArchiveSync(currentChangeId)',
      status: 'failed',
      summary: `real disposable OpenSpec archive-sync preflight failed closed: ${message}`,
      resultRef: 'pending-ref',
      environment,
      outcomeKind: 'outcome-unknown',
      exitCode: 1,
      stdoutFingerprint: sha256(''),
      stderrFingerprint: sha256(message),
    };
  }
}

function evidenceFromOutcome(
  _input: ExecuteVerificationSelectionInput,
  logicalId: string,
  commandOrMethod: string,
  outcome: ExternalCommandOutcome,
  environment: string,
  label: string,
): VerificationCheckEvidence {
  const passed = outcome.kind === 'exited' && outcome.exitCode === 0;
  return {
    scope: logicalId,
    applicability: 'applicable',
    commandOrMethod,
    status: passed ? 'passed' : 'failed',
    summary: passed ? `${label} passed` : `${label} failed closed: ${outcome.kind}; exitCode=${outcome.exitCode}`,
    resultRef: 'pending-ref',
    environment,
    outcomeKind: outcome.kind,
    exitCode: outcome.exitCode,
    stdoutFingerprint: sha256(outcome.stdout),
    stderrFingerprint: sha256(outcome.stderr),
  };
}

async function resolveLogicalNodeTests(repoRoot: string, logicalIds: readonly string[]): Promise<readonly string[]> {
  const selected = new Set<string>();
  for (const logicalId of logicalIds) {
    for (const selector of logicalNodeSelectors(logicalId)) {
      if (selector.endsWith('/*.test.ts')) {
        const directory = selector.slice(0, -'/*.test.ts'.length);
        let entries: import('node:fs').Dirent[];
        try { entries = await readdir(join(repoRoot, directory), { withFileTypes: true }); }
        catch { entries = []; }
        for (const entry of entries) if (entry.isFile() && entry.name.endsWith('.test.ts')) selected.add(`${directory}/${entry.name}`);
      } else {
        selected.add(selector);
      }
    }
  }
  const files = [...selected].sort();
  if (files.length === 0) throw new FlowkitError('VERIFICATION_SCOPE_EXECUTION_UNSUPPORTED', 'Logical Node test selection resolved no test files', { logicalIds });
  return files;
}

function logicalNodeSelectors(logicalId: string): readonly string[] {
  switch (logicalId) {
    case 'tests-cli':
      return ['tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts', 'tests/integration/b1-delivery-findings-and-corrective-change.test.ts', 'tests/integration/diagnostic-cli-process.test.ts', 'tests/integration/diagnostic-cli.test.ts', 'tests/integration/g1-change-cli-end-to-end.test.ts', 'tests/unit/cli/*.test.ts', 'tests/unit/diagnostics/*.test.ts'];
    case 'tests-execution':
      return ['tests/integration/f1-archive-and-checkpoint-boundary.test.ts', 'tests/unit/facts/*.test.ts', 'tests/unit/policy/*.test.ts', 'tests/unit/services/*.test.ts'];
    case 'tests-external-tools':
      return ['tests/integration/c1-external-tool-runtime-and-archify-cli-contract.test.ts', 'tests/unit/external-tools/*.test.ts'];
    case 'tests-openspec-runtime':
      return ['tests/integration/openspec-1-7-real-cli.test.ts', 'tests/unit/external-command.test.ts', 'tests/unit/integrations/openspec-cli-adapter.test.ts'];
    case 'tests-persistence':
      return ['tests/unit/persistence/delivery-manifest-document.test.ts', 'tests/unit/persistence/legacy-recognizer.test.ts', 'tests/unit/persistence/run-persistence.test.ts'];
    case 'tests-serialization':
      return ['tests/unit/domain/*.test.ts', 'tests/unit/persistence/serialization.test.ts'];
    case 'tests-verification':
      return ['tests/integration/e1-change-verification-selection.test.ts', 'tests/integration/e2-change-verification-generalization.test.ts', 'tests/unit/verification/affected-scopes.test.ts', 'tests/unit/verification/change-selection/*.test.ts', 'tests/unit/verification/verification-plan.test.ts'];
    default:
      throw new FlowkitError('VERIFICATION_SCOPE_EXECUTION_UNSUPPORTED', 'Unknown logical Node test check id', { logicalId });
  }
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
function normalizedLogicalRef(value: unknown, label: string): string { const result = nonEmpty(value, label); if (result === 'pending-ref') return result; if (result.startsWith('/') || result.includes('\\') || result.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} must be a normalized logical ref`); return result; }
function fail(message: string): never { throw new FlowkitError('SCHEMA_VALIDATION_FAILED', message); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
