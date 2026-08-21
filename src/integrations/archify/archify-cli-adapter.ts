import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveManagedToolInvocation, type ExternalToolInvocation } from '../external-tools/managed-tool.js';
import { runCommand, type RunCommandResult } from '../../shared/external-command.js';
import { FlowkitError } from '../../shared/errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;
export type ArchifyRenderableType = 'architecture' | 'workflow' | 'sequence' | 'lifecycle';

export interface ArchifyRepositoryEvidenceOptions {
  readonly repositoryRoot?: string;
}

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number },
) => Promise<RunCommandResult>;

export interface ArchifyCliAdapterOptions {
  readonly repoRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly runner?: CommandRunner;
  readonly invocation?: ExternalToolInvocation;
}

function parseJson(stdout: string, operation: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', `Archify ${operation} did not return valid JSON`, {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', `Archify ${operation} JSON must be an object`);
  }
  const record = parsed as Record<string, unknown>;
  if (record['ok'] !== true) {
    throw new FlowkitError('ARCHIFY_OPERATION_FAILED', `Archify ${operation} returned ok=false or omitted success`, {
      ok: record['ok'],
    });
  }
  return record;
}

function assertProcessSuccess(result: RunCommandResult, operation: string, timeoutMs: number): void {
  if (!result.spawned || result.spawnError !== undefined) {
    throw new FlowkitError('ARCHIFY_OPERATION_FAILED', `Archify ${operation} could not spawn`, {
      code: result.spawnError?.code,
      detail: result.spawnError?.message,
    });
  }
  if (result.kind === 'outcome-unknown') {
    throw new FlowkitError('ARCHIFY_OPERATION_FAILED', `Archify ${operation} outcome is unknown`);
  }
  if (result.timedOut) {
    throw new FlowkitError('ARCHIFY_OPERATION_FAILED', `Archify ${operation} timed out`, { timeoutMs });
  }
  if (result.exitCode !== 0) {
    throw new FlowkitError('ARCHIFY_OPERATION_FAILED', `Archify ${operation} exited ${result.exitCode}`, {
      exitCode: result.exitCode,
      stderr: result.stderr,
    });
  }
}

function repositoryEvidenceArgs(type: ArchifyRenderableType, options?: ArchifyRepositoryEvidenceOptions): string[] {
  const repositoryRoot = options?.repositoryRoot;
  if (repositoryRoot === undefined) return [];
  if (type !== 'architecture') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'Archify --repo-root is supported only for architecture diagrams', { type });
  }
  return ['--repo-root', resolve(repositoryRoot)];
}

export class ArchifyCliAdapter {
  readonly repoRoot: string;
  readonly timeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;
  private readonly runner: CommandRunner;
  private readonly explicitInvocation?: ExternalToolInvocation;
  private invocationPromise?: Promise<ExternalToolInvocation>;

  constructor(options: ArchifyCliAdapterOptions) {
    this.repoRoot = resolve(options.repoRoot);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'Archify timeout must be positive');
    }
    this.env = { ...process.env, ...options.env, FORCE_COLOR: '0', NO_COLOR: '1' };
    this.runner = options.runner ?? runCommand;
    this.explicitInvocation = options.invocation;
  }

  async resolveInvocation(): Promise<ExternalToolInvocation> {
    this.invocationPromise ??= this.explicitInvocation === undefined
      ? resolveManagedToolInvocation('archify', { env: this.env })
      : Promise.resolve(this.explicitInvocation);
    const invocation = await this.invocationPromise;
    if (invocation.source !== 'managed' || invocation.toolId !== 'archify' || invocation.version !== '2.14.0') {
      throw new FlowkitError('EXTERNAL_TOOL_PACKAGE_MISMATCH', 'Archify adapter requires exact managed archify@2.14.0');
    }
    return invocation;
  }

  async doctor(): Promise<{ readonly ready: true; readonly stdout: string }> {
    const result = await this.invoke(['doctor'], 'doctor');
    if (!result.stdout.includes('Archify is ready.')) {
      throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', 'Archify doctor did not report ready condition');
    }
    return { ready: true, stdout: result.stdout };
  }

  async validate(
    type: ArchifyRenderableType,
    input: string,
    options?: ArchifyRepositoryEvidenceOptions,
  ): Promise<Record<string, unknown>> {
    const result = await this.invoke([
      'validate', type, resolve(input), ...repositoryEvidenceArgs(type, options), '--json',
    ], `validate ${type}`);
    const parsed = parseJson(result.stdout, `validate ${type}`);
    if (parsed['command'] !== 'validate' || parsed['type'] !== type) {
      throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', 'Archify validate structured identity mismatch');
    }
    return parsed;
  }

  async deliver(
    type: ArchifyRenderableType,
    input: string,
    output: string,
    options?: ArchifyRepositoryEvidenceOptions,
  ): Promise<Record<string, unknown>> {
    const resolvedOutput = resolve(output);
    const result = await this.invoke([
      'deliver', type, resolve(input), resolvedOutput, ...repositoryEvidenceArgs(type, options), '--json',
    ], `deliver ${type}`);
    const parsed = parseJson(result.stdout, `deliver ${type}`);
    if (parsed['command'] !== 'deliver' || parsed['type'] !== type || resolve(String(parsed['output'] ?? '')) !== resolvedOutput) {
      throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', 'Archify deliver structured identity mismatch');
    }
    try {
      await access(resolvedOutput);
    } catch {
      throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', 'Archify deliver reported success without generated HTML', { output: resolvedOutput });
    }
    return parsed;
  }

  async compareArchitecture(
    base: string,
    head: string,
    output: string,
    receipt: string,
    options?: ArchifyRepositoryEvidenceOptions,
  ): Promise<Record<string, unknown>> {
    const resolvedOutput = resolve(output);
    const resolvedReceipt = resolve(receipt);
    const result = await this.invoke([
      'compare', 'architecture', resolve(base), resolve(head), resolvedOutput,
      '--receipt', resolvedReceipt, ...repositoryEvidenceArgs('architecture', options), '--json',
    ], 'compare architecture');
    const parsed = parseJson(result.stdout, 'compare architecture');
    if (parsed['command'] !== 'compare' || parsed['type'] !== 'architecture') {
      throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', 'Archify compare structured identity mismatch');
    }
    try {
      await access(resolvedOutput);
      const sidecar = JSON.parse(await readFile(resolvedReceipt, 'utf8')) as unknown;
      if (JSON.stringify(sidecar) !== JSON.stringify(parsed)) {
        throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', 'Archify compare receipt does not match JSON stdout');
      }
    } catch (error) {
      if (error instanceof FlowkitError) throw error;
      throw new FlowkitError('ARCHIFY_MALFORMED_OUTPUT', 'Archify compare success outputs are missing or malformed', {
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return parsed;
  }

  private async invoke(args: string[], operation: string): Promise<RunCommandResult> {
    const invocation = await this.resolveInvocation();
    const result = await this.runner(invocation.command, [...invocation.argsPrefix, ...args], {
      cwd: this.repoRoot,
      env: { ...this.env, ...invocation.propagationEnv },
      timeout: this.timeoutMs,
    });
    assertProcessSuccess(result, operation, this.timeoutMs);
    return result;
  }
}
