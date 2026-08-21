import { rm } from 'node:fs/promises';

import type { BoundedCommandPlanFullTestExecution, FullTestProtocolPayload } from '../../domain/full-test.js';
import type { RunCommandOptions } from '../../shared/external-command.js';
import { runBoundedCommands, runCommand, type BoundedExternalCommandTargetResult, type ExternalCommandOutcome } from '../../shared/external-command.js';
import { FlowkitError } from '../../shared/errors.js';
import { resolveFullTestLogicalCheck } from './resolver.js';

export interface BoundedFullTestExecutionDiagnostics {
  readonly logicalCheckId: string;
  readonly physicalTargetId: string;
  readonly outcome: ExternalCommandOutcome['kind'];
  readonly durationMs: number;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly spawnError?: { readonly code?: string; readonly message: string };
  readonly processTreeDiagnostics?: readonly string[];
}

export type BoundedFullTestExecutionResult =
  | { readonly kind: 'terminal'; readonly payload: FullTestProtocolPayload; readonly diagnostics: readonly BoundedFullTestExecutionDiagnostics[] }
  | { readonly kind: 'execution-error'; readonly outcomeKind: ExternalCommandOutcome['kind'] | 'resolver-error'; readonly summary: string; readonly diagnostics: readonly BoundedFullTestExecutionDiagnostics[] };

export interface ExecuteBoundedFullTestOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly comSpec?: string;
  readonly runCommand?: typeof runCommand;
  readonly resolveLogicalCheck?: typeof resolveFullTestLogicalCheck;
  readonly windowsProcessTreeCanceller?: RunCommandOptions['windowsProcessTreeCanceller'];
}

function diagnostic(result: BoundedExternalCommandTargetResult): BoundedFullTestExecutionDiagnostics {
  return {
    logicalCheckId: result.logicalCheckId,
    physicalTargetId: result.physicalTargetId,
    outcome: result.outcome,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.spawnError !== undefined ? { spawnError: result.spawnError } : {}),
    ...(result.processTreeDiagnostics !== undefined ? { processTreeDiagnostics: result.processTreeDiagnostics } : {}),
  };
}


export function formatBoundedFullTestFailureDiagnostics(
  diagnostics: readonly BoundedFullTestExecutionDiagnostics[],
): string {
  const terminal = diagnostics.at(-1);
  if (terminal === undefined) return '';
  const lines = [
    `full-test physical failure: logical=${terminal.logicalCheckId} target=${terminal.physicalTargetId} outcome=${terminal.outcome} exit=${terminal.exitCode} durationMs=${terminal.durationMs}`,
  ];
  if (terminal.spawnError !== undefined) {
    lines.push(`spawn-error: code=${terminal.spawnError.code ?? 'unknown'} message=${terminal.spawnError.message}`);
  }
  for (const item of terminal.processTreeDiagnostics ?? []) lines.push(`process-tree: ${item}`);
  if (terminal.stdout.length > 0) lines.push(`stdout:\n${terminal.stdout}`);
  if (terminal.stderr.length > 0) lines.push(`stderr:\n${terminal.stderr}`);
  return `${lines.join('\n')}\n`;
}

export async function executeBoundedFullTest(
  repoRoot: string,
  execution: BoundedCommandPlanFullTestExecution,
  options: ExecuteBoundedFullTestOptions = {},
): Promise<BoundedFullTestExecutionResult> {
  const started = process.hrtime.bigint();
  const checks: FullTestProtocolPayload['checks'][number][] = [];
  const diagnostics: BoundedFullTestExecutionDiagnostics[] = [];
  for (const check of execution.logicalChecks) {
    const logicalStarted = process.hrtime.bigint();
    let resolved;
    try {
      resolved = await (options.resolveLogicalCheck ?? resolveFullTestLogicalCheck)(repoRoot, check, { ...process.env, ...options.env });
    } catch (error) {
      return {
        kind: 'execution-error',
        outcomeKind: 'resolver-error',
        summary: `Full Test resolver failed closed for ${check.id}: ${error instanceof Error ? error.message : String(error)}`,
        diagnostics,
      };
    }
    try {
      const targets = resolved.targets.map((target) => ({
        logicalCheckId: target.logicalCheckId,
        physicalTargetId: target.physicalTargetId,
        command: target.command,
        args: target.args,
        options: {
          cwd: repoRoot,
          env: target.env,
          timeout: check.perTargetTimeoutMs,
          platform: options.platform ?? process.platform,
          ...(options.comSpec !== undefined ? { comSpec: options.comSpec } : {}),
          ...(options.windowsProcessTreeCanceller !== undefined ? { windowsProcessTreeCanceller: options.windowsProcessTreeCanceller } : {}),
        },
      }));
      if (targets.length === 0) throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', `logical check ${check.id} resolved no physical targets`);
      const sequence = await runBoundedCommands(targets, options.runCommand ?? runCommand);
      diagnostics.push(...sequence.results.map(diagnostic));
      const terminal = sequence.terminal;
      const durationMs = Math.max(0, Math.round(Number(process.hrtime.bigint() - logicalStarted) / 1_000_000));
      if (terminal === undefined) throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', `logical check ${check.id} produced no terminal transport outcome`);
      if (terminal.outcome !== 'exited') {
        return {
          kind: 'execution-error',
          outcomeKind: terminal.outcome,
          summary: `Full Test transport failed closed at ${check.id}/${terminal.physicalTargetId}: ${terminal.outcome}`,
          diagnostics,
        };
      }
      const status = terminal.exitCode === 0 ? 'passed' : 'failed';
      checks.push({ id: check.id, status, durationMs });
      if (status === 'failed') {
        return {
          kind: 'terminal',
          payload: {
            schemaVersion: 1,
            status: 'failed',
            summary: `full-test check failed: ${check.id}`,
            totalDurationMs: Math.max(0, Math.round(Number(process.hrtime.bigint() - started) / 1_000_000)),
            checks,
          },
          diagnostics,
        };
      }
    } finally {
      await Promise.all(resolved.cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
    }
  }
  return {
    kind: 'terminal',
    payload: {
      schemaVersion: 1,
      status: 'passed',
      summary: 'all full-test checks passed',
      totalDurationMs: Math.max(0, Math.round(Number(process.hrtime.bigint() - started) / 1_000_000)),
      checks,
    },
    diagnostics,
  };
}
