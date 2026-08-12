import { readFile } from 'node:fs/promises';

import {
  discoverRepositoryRoot,
  loadDiagnosticContext,
} from './context-loader.js';
import { renderDoctor, diagnoseRepository } from '../diagnostics/doctor.js';
import { renderNext } from '../diagnostics/next.js';
import { renderResumeContext } from '../diagnostics/resume-context.js';
import { renderStatus } from '../diagnostics/status.js';
import { inspectPreparedRun, recoverContractResetPendingRun } from '../services/b1-run-execution-service.js';
import { getVersion } from './version.js';
import {
  activateChange,
  createChange,
  createDelivery,
  recordOwnerDecision,
} from '../services/a1-write-service.js';

export interface CliInvocation {
  readonly argv: readonly string[];
  readonly cwd: string;
}

export interface CliResult {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

const DIAGNOSTIC_COMMANDS = new Set(['status', 'next', 'doctor', 'resume-context']);

const USAGE =
  'usage: flowkit <status|next|doctor|resume-context|create delivery|create change|owner record|recover contract-reset-pending|activate|--version>\n';

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) return undefined;
  return value;
}

function optionValues(args: readonly string[], name: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (value !== undefined && !value.startsWith('--')) values.push(value);
  }
  return values;
}

function requiredOption(args: readonly string[], name: string): string {
  const value = optionValue(args, name);
  if (value === undefined || value.trim() === '') {
    throw new Error(`missing required option ${name}`);
  }
  return value;
}

async function readJsonInput(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as unknown;
}

function renderWriteResult(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export async function runCli(invocation: CliInvocation): Promise<CliResult> {
  const args = [...invocation.argv];
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    return { exitCode: 0, stdout: `${getVersion()}\n`, stderr: '' };
  }

  try {
    if (args.length === 1 && DIAGNOSTIC_COMMANDS.has(args[0]!)) {
      const { snapshot, repoRoot, deliveryId } = await loadDiagnosticContext(invocation.cwd);
      const prepared = await inspectPreparedRun(repoRoot, deliveryId);
      switch (args[0]) {
        case 'status':
          return { exitCode: 0, stdout: renderStatus(snapshot, prepared), stderr: '' };
        case 'next':
          return { exitCode: 0, stdout: renderNext(snapshot), stderr: '' };
        case 'resume-context':
          return { exitCode: 0, stdout: renderResumeContext(snapshot, prepared), stderr: '' };
        case 'doctor': {
          const report = diagnoseRepository(snapshot, prepared);
          return {
            exitCode: report.overall === 'error' ? 1 : 0,
            stdout: renderDoctor(snapshot, prepared),
            stderr: '',
          };
        }
      }
    }

    const repoRoot = await discoverRepositoryRoot(invocation.cwd);

    if (args[0] === 'recover' && args[1] === 'contract-reset-pending') {
      const { deliveryId } = await loadDiagnosticContext(invocation.cwd);
      const result = await recoverContractResetPendingRun({ repoRoot, deliveryId });
      return { exitCode: 0, stdout: renderWriteResult(result), stderr: '' };
    }

    if (args[0] === 'create' && args[1] === 'delivery') {
      const inputPath = requiredOption(args, '--input');
      const sourceRef = requiredOption(args, '--source-ref');
      const result = await createDelivery(repoRoot, await readJsonInput(inputPath), sourceRef);
      return { exitCode: 0, stdout: renderWriteResult(result), stderr: '' };
    }

    if (args[0] === 'create' && args[1] === 'change') {
      const inputPath = requiredOption(args, '--input');
      const sourceRef = requiredOption(args, '--source-ref');
      const result = await createChange(repoRoot, await readJsonInput(inputPath), sourceRef);
      return { exitCode: 0, stdout: renderWriteResult(result), stderr: '' };
    }

    if (args[0] === 'owner' && args[1] === 'record') {
      const decision = requiredOption(args, '--decision');
      const sourceRef = requiredOption(args, '--source-ref');
      const changeId = optionValue(args, '--change');
      const scope = optionValue(args, '--scope');
      const requiredOutcomes = optionValues(args, '--required-outcome');
      const result = await recordOwnerDecision(repoRoot, {
        decision,
        sourceRef,
        ...(changeId !== undefined ? { changeId } : {}),
        ...(scope !== undefined ? { scope } : {}),
        ...(requiredOutcomes.length > 0 ? { requiredOutcomes } : {}),
      });
      return { exitCode: 0, stdout: renderWriteResult(result), stderr: '' };
    }

    if (args[0] === 'activate') {
      const changeId = requiredOption(args, '--change');
      const sourceRef = requiredOption(args, '--source-ref');
      const specDeltaMode = optionValue(args, '--spec-delta-mode');
      if (specDeltaMode !== undefined && specDeltaMode !== 'required' && specDeltaMode !== 'skip') {
        throw new Error('--spec-delta-mode must be required|skip');
      }
      const result = await activateChange(repoRoot, changeId, sourceRef, {
        ...(specDeltaMode !== undefined && { specDeltaMode }),
      });
      return { exitCode: 0, stdout: renderWriteResult(result), stderr: '' };
    }

    return { exitCode: 2, stdout: '', stderr: USAGE };
  } catch (error) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `flowkit: ${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}
