import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FullTestProtocolPayload, FullTestTerminalResult } from '../domain/full-test.js';
import { fullTestResultRefFor } from '../domain/full-test.js';
import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import { DeliveryManifestDocument } from '../persistence/delivery-manifest-document.js';
import { next } from '../policy/next.js';
import { atomicWriteFile } from '../shared/atomic-write.js';
import { FlowkitError } from '../shared/errors.js';
import { runCommand, type ExternalCommandOutcome, type RunCommandOptions } from '../shared/external-command.js';

export interface DeliveryFullTestOptions {
  readonly platform?: NodeJS.Platform;
  readonly comSpec?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly runCommand?: typeof runCommand;
  readonly atomicWrite?: (path: string, data: string) => Promise<void>;
  readonly windowsProcessTreeCanceller?: RunCommandOptions['windowsProcessTreeCanceller'];
}

export interface DeliveryFullTestOperationResult {
  readonly deliveryId: string;
  readonly executionStatus: 'passed' | 'failed' | 'execution-error' | 'blocked';
  readonly outcomeKind?: ExternalCommandOutcome['kind'] | 'protocol-error';
  readonly resultRef?: string;
  readonly summary: string;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function parseFullTestProtocol(value: unknown): FullTestProtocolPayload {
  const obj = object(value);
  if (obj === undefined) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', 'Full Test protocol root must be an object');
  const expected = ['checks', 'schemaVersion', 'status', 'summary', 'totalDurationMs'];
  if (JSON.stringify(Object.keys(obj).sort()) !== JSON.stringify(expected)) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', 'Full Test protocol fields are not closed');
  if (obj['schemaVersion'] !== 1) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', 'Full Test protocol schemaVersion must be 1');
  if (obj['status'] !== 'passed' && obj['status'] !== 'failed') throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', 'Full Test protocol status must be passed|failed');
  if (typeof obj['summary'] !== 'string' || obj['summary'].trim() === '' || obj['summary'].includes('\n') || obj['summary'].includes('\r')) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', 'Full Test protocol summary must be a non-empty single-line string');
  if (typeof obj['totalDurationMs'] !== 'number' || !Number.isInteger(obj['totalDurationMs']) || obj['totalDurationMs'] < 0) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', 'Full Test protocol totalDurationMs must be a non-negative integer');
  if (!Array.isArray(obj['checks'])) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', 'Full Test protocol checks must be an array');
  const ids = new Set<string>();
  const checks = obj['checks'].map((raw, index) => {
    const check = object(raw);
    if (check === undefined || JSON.stringify(Object.keys(check).sort()) !== JSON.stringify(['durationMs','id','status'])) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', `Full Test protocol checks[${index}] is invalid`);
    if (typeof check['id'] !== 'string' || check['id'].trim() === '' || ids.has(check['id'])) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', `Full Test protocol checks[${index}].id is invalid/duplicate`);
    if (check['status'] !== 'passed' && check['status'] !== 'failed') throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', `Full Test protocol checks[${index}].status is invalid`);
    if (typeof check['durationMs'] !== 'number' || !Number.isInteger(check['durationMs']) || check['durationMs'] < 0) throw new FlowkitError('FULL_TEST_PROTOCOL_INVALID', `Full Test protocol checks[${index}].durationMs is invalid`);
    ids.add(check['id']);
    return { id: check['id'], status: check['status'], durationMs: check['durationMs'] } as const;
  });
  return { schemaVersion: 1, status: obj['status'], summary: obj['summary'], totalDurationMs: obj['totalDurationMs'], checks };
}

function resolveExecution(command: string, args: readonly string[], launcherMode: 'direct' | 'npm-shim', platform: NodeJS.Platform): { command: string; args: string[] } {
  if (launcherMode === 'direct') return { command, args: [...args] };
  if (command !== 'npm') throw new FlowkitError('FULL_TEST_EXECUTION_INVALID', 'npm-shim requires logical command npm');
  return { command: platform === 'win32' ? 'npm.cmd' : 'npm', args: [...args] };
}

async function defaultWindowsTreeCanceller(
  input: { readonly pid: number; readonly command: string; readonly args: readonly string[] },
  runner: typeof runCommand,
  env: NodeJS.ProcessEnv,
): Promise<{ readonly terminated: boolean; readonly diagnostics: readonly string[] }> {
  const outcome = await runner('taskkill.exe', ['/PID', String(input.pid), '/T', '/F'], { platform: 'win32', env, timeout: 10_000 });
  return {
    terminated: outcome.kind === 'exited' && outcome.exitCode === 0,
    diagnostics: [`taskkill-kind=${outcome.kind}`, `taskkill-exit=${outcome.exitCode}`],
  };
}

async function snapshot(repoRoot: string, deliveryId: string) {
  return readFormalFactSnapshot({ repoRoot, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups' });
}

async function mutateManifest(
  repoRoot: string,
  deliveryId: string,
  mutate: (doc: DeliveryManifestDocument) => void,
  atomicWrite: (path: string, data: string) => Promise<void>,
): Promise<void> {
  const path = join(repoRoot, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const doc = DeliveryManifestDocument.parse(await readFile(path, 'utf8'));
  mutate(doc);
  await atomicWrite(path, doc.toString());
}

export async function runDeliveryFullTest(
  repoRoot: string,
  deliveryId: string,
  options: DeliveryFullTestOptions = {},
): Promise<DeliveryFullTestOperationResult> {
  const before = await snapshot(repoRoot, deliveryId);
  const boundary = next(before);
  if (boundary.kind !== 'delivery-behavior' || boundary.behavior !== 'full-test') {
    return { deliveryId, executionStatus: 'blocked', summary: `current Policy boundary is ${boundary.kind}` };
  }
  const execution = before.deliveryFullTestExecution;
  if (execution === undefined) throw new FlowkitError('FULL_TEST_EXECUTION_UNAVAILABLE', 'Delivery Full Test execution contract is unavailable');
  if (before.deliveryFullTestExecutionBlock !== undefined) throw new FlowkitError('FULL_TEST_EXECUTION_BLOCKED', 'Delivery Full Test execution is blocked by outcome-unknown');

  const platform = options.platform ?? process.platform;
  const physical = resolveExecution(execution.command, execution.args, execution.launcherMode, platform);
  const runner = options.runCommand ?? runCommand;
  const env = { ...process.env, ...options.env };
  const temp = await mkdtemp(join(tmpdir(), 'flowkit-full-test-'));
  const resultPath = join(temp, 'result.json');
  env['FLOWKIT_FULL_TEST_RESULT_PATH'] = resultPath;
  const canceller = platform === 'win32'
    ? options.windowsProcessTreeCanceller ?? ((input) => defaultWindowsTreeCanceller(input, runner, env))
    : undefined;
  let outcome: ExternalCommandOutcome;
  try {
    outcome = await runner(physical.command, physical.args, {
      cwd: repoRoot,
      env,
      timeout: execution.timeoutMs,
      platform,
      ...(options.comSpec !== undefined && { comSpec: options.comSpec }),
      ...(canceller !== undefined && { windowsProcessTreeCanceller: canceller }),
    });

    if (outcome.kind === 'outcome-unknown') {
      const summary = `Full Test process-tree outcome unknown: ${(outcome.processTreeDiagnostics ?? []).join('; ') || 'termination not proven'}`;
      await mutateManifest(repoRoot, deliveryId, (doc) => doc.setFullTestExecutionBlock({ schemaVersion: 1, reason: 'outcome-unknown', summary }), options.atomicWrite ?? atomicWriteFile);
      return { deliveryId, executionStatus: 'execution-error', outcomeKind: outcome.kind, summary };
    }
    if (outcome.kind === 'spawn-failed' || outcome.kind === 'timed-out-cancelled') {
      return { deliveryId, executionStatus: 'execution-error', outcomeKind: outcome.kind, summary: `Full Test transport failed closed: ${outcome.kind}` };
    }

    let payload: FullTestProtocolPayload;
    try {
      payload = parseFullTestProtocol(JSON.parse(await readFile(resultPath, 'utf8')) as unknown);
    } catch (error) {
      return { deliveryId, executionStatus: 'execution-error', outcomeKind: 'protocol-error', summary: `Full Test protocol failed closed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const exitPassed = outcome.exitCode === 0;
    if ((payload.status === 'passed') !== exitPassed) {
      return { deliveryId, executionStatus: 'execution-error', outcomeKind: 'protocol-error', summary: 'Full Test child exit/protocol status mismatch' };
    }
    const terminal: FullTestTerminalResult = { ...payload, resultRef: fullTestResultRefFor(payload) };
    await mutateManifest(repoRoot, deliveryId, (doc) => doc.publishFullTestResult(terminal), options.atomicWrite ?? atomicWriteFile);
    return { deliveryId, executionStatus: payload.status, outcomeKind: outcome.kind, resultRef: terminal.resultRef, summary: payload.summary };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
