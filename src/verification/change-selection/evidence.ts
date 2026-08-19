import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

const H1_CAPABILITY_ID = 'flowkit-stable-runner-and-self-hosting-acceptance';
const H1_TARGET = 'tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts';
const NODE_TEST_TIMEOUT_MS = 120_000;

interface BoundedNodeCommand {
  readonly label: string;
  readonly files: readonly string[];
  readonly testNamePattern?: string;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
}

const G1_CHANGE_E2E_CASES = [
  'drives the happy lifecycle through real archive, verify projection, completion and checkpoint readiness without a Git checkpoint',
  'keeps non-author blockers out of revise while explicit review creates direct same-stage re-review; author blockers permit revise',
  'fails closed for stale review target and missing Owner activation',
  'exact-resumes the same pending Run after a future-Delivery fresh clone with no chat/provider state',
  'keeps changed-surface outcome-unknown archive pending and resumes the same generation after explicit recovery admission',
  'projects not-published Verification from structured authority and fails closed when OpenSpec projection is unavailable',
  'records Change Verification failure through apply admission instead of fabricating success',
] as const;

const G1_ADAPTER_E2E_CASES = [
  'replays the real F1 retry+archive terminal and fails closed on ambiguous/corrupt archived authority',
  'keeps historical E1 selection/evidence point-in-time even when the current Catalog fingerprint differs',
  'fresh-clones a different future Delivery, resumes one exact pending Action, rebuilds context, and does not auto-next',
] as const;

const B1_RUN_EXECUTION_SUITE_PATTERNS = [
  'I1 Proposal archive-sync admission wiring',
  'E1 new preparation boundary',
  'E2 post-checkpoint three-file writer',
  'I1 exact-candidate re-verification lifecycle',
  'B1 fixed ActionDefinition catalog',
  'D2 archive terminal continuation regressions',
  'D1 structured Owner facts and reset-aware lineage',
] as const;

const B1_PREPARATION_ADMISSION_CASES = [
  'creates one Delivery-wide Run then resumes the same pending semantic input',
  'fails closed on contractRef version drift without publishing a second pending Run',
  'admits logical result after legitimate Action output mutation and Core derives artifact refs',
  'keeps blocked next while explicit review creates a new same-stage Reviewer generation',
  'failed execution retries as a new Run/NNN without provider-session identity',
  'Apply package carries exact Owner ref and remains Change-only/minimal',
  'rejects a tampered contractRef even when caller preserves the old fingerprint',
  'rejects tampered authority identity outside contractRefs before terminal publication',
  'still fails closed when immutable approved proposal content drifts during pending Apply',
  'resumes the same pending Apply after Action-owned tasks and verification progress',
  'resumes the same pending revise-apply after its own tasks and verification mutations',
  'fails closed when pending review-explore target bytes drift outside Reviewer mutation boundary',
  'fails closed when pending review-propose target bytes drift outside Reviewer mutation boundary',
  'resumes the exact pending archive after Action-owned OpenSpec relocation',
  'resumes the exact pending archive after Action-owned Change completed progress',
  'does not create a new archive Run after completion when no pending archive identity exists',
  'keeps current C1 self-archive resumable after canonical spec merge and active root relocation',
  'admits terminal result for the exact persisted pending archive after Change completed progress',
  'rejects fabricated completed archive admission when the persisted pending identity is gone',
  'keeps non-archive terminal admission bound to the active Change',
  'projects the same persisted pending archive through inspect/status/doctor/resume-context after completion',
  'keeps completed diagnostics at none when no pending archive exists',
] as const;

const NODE_TEST_CHECKS = new Set([
  'tests-architecture',
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
  const h1Selected = selection.capabilityIds.includes(H1_CAPABILITY_ID);
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

    if (h1Selected && logicalId === 'tests-cli') {
      const execution = await executeH1CliPhysicalFanout(input.repoRoot, files, nodeEnv);
      checksById.set(logicalId, evidenceFromOutcome(input, logicalId, execution.commandOrMethod, execution.outcome, environment, 'bounded H1 tests-cli physical execution'));
      continue;
    }
    if (h1Selected && logicalId === 'tests-execution') {
      const execution = await executeH1ExecutionPhysicalFanout(input.repoRoot, files, nodeEnv);
      checksById.set(logicalId, evidenceFromOutcome(input, logicalId, execution.commandOrMethod, execution.outcome, environment, 'bounded H1 tests-execution physical execution'));
      continue;
    }

    const outcome = await runCommand(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files], {
      cwd: input.repoRoot,
      env: nodeEnv,
      timeout: NODE_TEST_TIMEOUT_MS,
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function nodeCommandArgs(command: BoundedNodeCommand): string[] {
  return [
    '--import',
    'tsx',
    '--test',
    '--test-concurrency=1',
    ...(command.testNamePattern !== undefined ? [`--test-name-pattern=${command.testNamePattern}`] : []),
    ...command.files,
  ];
}

function renderBoundedNodeCommand(command: BoundedNodeCommand): string {
  const env = command.env === undefined
    ? ''
    : Object.entries(command.env)
        .filter(([key]) => key.startsWith('FLOWKIT_H1_'))
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ');
  const prefix = env === '' ? '' : `${env} `;
  return `${prefix}${process.execPath} ${nodeCommandArgs(command).join(' ')}`;
}

async function executeBoundedNodeCommands(
  repoRoot: string,
  commands: readonly BoundedNodeCommand[],
  baseEnv: NodeJS.ProcessEnv,
): Promise<{ readonly commandOrMethod: string; readonly outcome: ExternalCommandOutcome }> {
  const commandParts: string[] = [];
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  let terminal: ExternalCommandOutcome | undefined;
  for (const command of commands) {
    const commandEnv = { ...baseEnv, ...(command.env ?? {}) };
    const outcome = await runCommand(process.execPath, nodeCommandArgs(command), {
      cwd: repoRoot,
      env: commandEnv,
      timeout: NODE_TEST_TIMEOUT_MS,
    });
    commandParts.push(renderBoundedNodeCommand(command));
    stdoutParts.push(`--- ${command.label} ---\n${outcome.stdout}`);
    stderrParts.push(`--- ${command.label} ---\n${outcome.stderr}`);
    terminal = { ...outcome, stdout: stdoutParts.join('\n'), stderr: stderrParts.join('\n') };
    if (outcome.kind !== 'exited' || outcome.exitCode !== 0) break;
  }
  if (terminal === undefined) {
    throw new FlowkitError('VERIFICATION_SCOPE_EXECUTION_UNSUPPORTED', 'Bounded physical verification plan resolved no commands');
  }
  return { commandOrMethod: commandParts.join(' && '), outcome: terminal };
}

async function executeH1CliPhysicalFanout(
  repoRoot: string,
  files: readonly string[],
  nodeEnv: NodeJS.ProcessEnv,
): Promise<{ readonly commandOrMethod: string; readonly outcome: ExternalCommandOutcome }> {
  const diagnosticProcess = 'tests/integration/diagnostic-cli-process.test.ts';
  const g1Change = 'tests/integration/g1-change-cli-end-to-end.test.ts';
  const g1Adapter = 'tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts';
  const heavy = new Set([diagnosticProcess, g1Change, g1Adapter, H1_TARGET]);
  const cheapFiles = files.filter((file) => !heavy.has(file));
  const commands: BoundedNodeCommand[] = [];
  if (cheapFiles.length > 0) commands.push({ label: 'tests-cli-cheap', files: cheapFiles });
  if (files.includes(diagnosticProcess)) {
    commands.push({
      label: 'tests-cli-diagnostic-real-process-lite',
      files: [diagnosticProcess],
      testNamePattern: [
        'executes all four commands without mutating repository files',
        'rejects unknown commands with exit 2 on stderr',
      ].map(escapeRegex).join('|'),
    });
  }
  if (files.includes(g1Change)) {
    for (const [index, name] of G1_CHANGE_E2E_CASES.entries()) {
      commands.push({ label: `tests-cli-g1-change-case-${index + 1}`, files: [g1Change], testNamePattern: escapeRegex(name) });
    }
  }
  if (files.includes(g1Adapter)) {
    for (const [index, name] of G1_ADAPTER_E2E_CASES.entries()) {
      commands.push({ label: `tests-cli-g1-adapter-case-${index + 1}`, files: [g1Adapter], testNamePattern: escapeRegex(name) });
    }
  }

  const stateRoot = await mkdtemp(join(tmpdir(), 'flowkit-h1-formal-e2e-'));
  try {
    if (files.includes(H1_TARGET)) {
      for (let phase = 1; phase <= 26; phase += 1) {
        commands.push({
          label: `tests-cli-h1-phase-${phase}`,
          files: [H1_TARGET],
          env: {
            FLOWKIT_H1_FORMAL_PHASE: String(phase),
            FLOWKIT_H1_FORMAL_STATE_ROOT: stateRoot,
          },
        });
      }
    }
    return await executeBoundedNodeCommands(repoRoot, commands, nodeEnv);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
}

async function executeH1ExecutionPhysicalFanout(
  repoRoot: string,
  files: readonly string[],
  nodeEnv: NodeJS.ProcessEnv,
): Promise<{ readonly commandOrMethod: string; readonly outcome: ExternalCommandOutcome }> {
  const b1Heavy = 'tests/unit/services/b1-run-execution-service.test.ts';
  const commands: BoundedNodeCommand[] = [];
  for (const file of files.filter((file) => file !== b1Heavy)) {
    commands.push({ label: `tests-execution-file-${file.replaceAll('/', '-')}`, files: [file] });
  }
  if (files.includes(b1Heavy)) {
    for (const [index, suite] of B1_RUN_EXECUTION_SUITE_PATTERNS.entries()) {
      commands.push({ label: `tests-execution-b1-suite-${index + 1}`, files: [b1Heavy], testNamePattern: escapeRegex(suite) });
    }
    for (const [index, name] of B1_PREPARATION_ADMISSION_CASES.entries()) {
      commands.push({ label: `tests-execution-b1-preparation-case-${index + 1}`, files: [b1Heavy], testNamePattern: escapeRegex(name) });
    }
  }
  return executeBoundedNodeCommands(repoRoot, commands, nodeEnv);
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
    case 'tests-architecture':
      return ['tests/integration/d1-architecture-baseline-and-delivery-plan.test.ts', 'tests/integration/e1-architecture-actual-compare-and-system-promotion.test.ts', 'tests/unit/architecture/*.test.ts'];
    case 'tests-cli':
      return ['tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts', 'tests/integration/b1-delivery-findings-and-corrective-change.test.ts', 'tests/integration/diagnostic-cli-process.test.ts', 'tests/integration/diagnostic-cli.test.ts', 'tests/integration/g1-change-cli-end-to-end.test.ts', 'tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts', 'tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts', 'tests/unit/cli/*.test.ts', 'tests/unit/diagnostics/*.test.ts'];
    case 'tests-execution':
      return ['tests/integration/f1-archive-and-checkpoint-boundary.test.ts', 'tests/integration/f1-delivery-finalize-and-git-boundary.test.ts', 'tests/unit/facts/*.test.ts', 'tests/unit/policy/*.test.ts', 'tests/unit/services/*.test.ts'];
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
