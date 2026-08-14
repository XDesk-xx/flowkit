import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { runCommand, type RunCommandResult } from '../../shared/external-command.js';
import { FlowkitError } from '../../shared/errors.js';
import {
  assertAbsolutePath,
  assertPhysicalPathWithin,
  assertRepoRootIdentity,
  assertRequestedChangeRoot,
  physicalToRepoLogical,
} from './openspec-paths.js';
import {
  OPENSPEC_SUPPORTED_ARTIFACT_IDS,
  type OpenSpecActionContextView,
  type OpenSpecApplyInstructionsView,
  type OpenSpecArchiveFailureObservation,
  type OpenSpecArchiveInvocation,
  type OpenSpecArchiveSuccessObservation,
  type OpenSpecArchiveTotals,
  type OpenSpecArtifactId,
  type OpenSpecArtifactInstructionsView,
  type OpenSpecArtifactPathView,
  type OpenSpecChangeStatusView,
  type OpenSpecPlanningHomeView,
  type OpenSpecOperationProjection,
  type OpenSpecStatusEntry,
  type OpenSpecValidationIssue,
  type OpenSpecValidationView,
} from './openspec-types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number; platform?: NodeJS.Platform },
) => Promise<RunCommandResult>;

export interface OpenSpecCliAdapterOptions {
  readonly repoRoot: string;
  readonly executable?: string;
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly runner?: CommandRunner;
  /** D1 deterministic platform seam for real Windows behavior and focused tests. */
  readonly platform?: NodeJS.Platform;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', `${label} must be a non-empty string`, { value });
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', `${label} must be boolean`, { value });
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', `${label} must be a non-negative integer`, { value });
  }
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', `${label} must be a string array`);
  }
  return value as string[];
}

function dependencyIds(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', `${label} must be an array`);
  }
  return value.map((item, index) => {
    if (typeof item === 'string') return item;
    const obj = record(item, `${label}[${index}]`);
    return string(obj['id'], `${label}[${index}].id`);
  });
}

function parseJson(stdout: string, operation: string): unknown {
  try {
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', `${operation} did not return valid JSON`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseStatusEntries(value: unknown): readonly OpenSpecStatusEntry[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', 'status must be an array');
  return value.map((item, index) => {
    const obj = record(item, `status[${index}]`);
    const severity = string(obj['severity'], `status[${index}].severity`);
    const code = typeof obj['code'] === 'string' && obj['code'].trim() !== '' ? obj['code'] : undefined;
    const message = typeof obj['message'] === 'string' && obj['message'].trim() !== '' ? obj['message'] : undefined;
    return { severity, ...(code !== undefined && { code }), ...(message !== undefined && { message }) };
  });
}

function hasErrorStatus(status: readonly OpenSpecStatusEntry[]): boolean {
  return status.some((entry) => entry.severity.toLowerCase() === 'error');
}

function supportedVersion(version: string): boolean {
  // C1 admits only stable SemVer releases at or above the stable 1.7.0
  // baseline. There is deliberately no fixed upper bound: higher stable
  // releases are admitted only as far as each required structured machine
  // surface continues to satisfy the typed parsers below.
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version.trim());
  if (match === null) return false;
  const tuple = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  const baseline = [1, 7, 0] as const;
  for (let index = 0; index < baseline.length; index += 1) {
    if (tuple[index]! > baseline[index]!) return true;
    if (tuple[index]! < baseline[index]!) return false;
  }
  return true;
}

function samePhysicalIdentity(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

function uniquePaths(paths: readonly string[], label: string): readonly string[] {
  const normalized = paths.map((path) => resolve(path));
  if (new Set(normalized).size !== normalized.length) {
    throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', `${label} contains duplicate physical identities`, { paths });
  }
  return normalized;
}

function normalizeEnvironment(input?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...input,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  };
}

export class OpenSpecCliAdapter {
  readonly repoRoot: string;
  readonly executable: string;
  readonly timeoutMs: number;
  private readonly env: NodeJS.ProcessEnv;
  private readonly runner: CommandRunner;
  private readonly platform: NodeJS.Platform;
  private readonly explicitExecutable?: string;
  private defaultExecutablePromise?: Promise<string>;
  private versionPromise?: Promise<string>;

  constructor(options: OpenSpecCliAdapterOptions) {
    this.repoRoot = resolve(options.repoRoot);
    this.platform = options.platform ?? process.platform;
    this.explicitExecutable = options.executable;
    this.executable = options.executable ?? (this.platform === 'win32' ? 'openspec.ps1' : 'openspec');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'OpenSpec timeout must be positive');
    }
    this.env = normalizeEnvironment(options.env);
    this.runner = options.runner ?? runCommand;
  }

  async getVersion(): Promise<string> {
    this.versionPromise ??= this.readVersion();
    return this.versionPromise;
  }

  private async readVersion(): Promise<string> {
    const result = await this.invokeRaw(['--version']);
    this.assertReadOnlyProcessSuccess(result, 'version');
    const version = result.stdout.trim();
    if (!supportedVersion(version)) {
      throw new FlowkitError('OPENSPEC_UNSUPPORTED_VERSION', `Unsupported OpenSpec version: ${version || '<empty>'}`, {
        minimumStableBaseline: '1.7.0',
        fixedUpperBound: null,
        compatibilityAuthority: 'structured-machine-contract-conformance',
        version,
      });
    }
    return version;
  }

  async getContext(): Promise<{ readonly root: string; readonly status: readonly OpenSpecStatusEntry[] }> {
    await this.getVersion();
    const parsed = await this.invokeReadOnlyJson(['context', '--json'], 'context');
    const obj = record(parsed, 'context');
    const rootObj = record(obj['root'], 'context.root');
    const root = assertRepoRootIdentity(this.repoRoot, rootObj['path'], 'context.root.path');
    return { root, status: parseStatusEntries(obj['status']) };
  }

  async doctor(): Promise<{ readonly root: string; readonly healthy: boolean; readonly status: readonly OpenSpecStatusEntry[] }> {
    await this.getVersion();
    const parsed = await this.invokeReadOnlyJson(['doctor', '--json'], 'doctor');
    const obj = record(parsed, 'doctor');
    const rootObj = record(obj['root'], 'doctor.root');
    const root = assertRepoRootIdentity(this.repoRoot, rootObj['path'], 'doctor.root.path');
    return { root, healthy: boolean(rootObj['healthy'], 'doctor.root.healthy'), status: parseStatusEntries(obj['status']) };
  }

  async getChangeStatus(changeId: string): Promise<OpenSpecChangeStatusView> {
    await this.getVersion();
    const parsed = await this.invokeReadOnlyJson(['status', '--change', changeId, '--json'], 'status');
    return this.parseChangeStatus(parsed, changeId);
  }

  async getArtifactInstructions(
    changeId: string,
    artifactId: OpenSpecArtifactId,
    persistedStatus?: OpenSpecChangeStatusView,
  ): Promise<OpenSpecArtifactInstructionsView> {
    if (!(OPENSPEC_SUPPORTED_ARTIFACT_IDS as readonly string[]).includes(artifactId)) {
      throw new FlowkitError('OPENSPEC_UNSUPPORTED_ARTIFACT', `Unsupported OpenSpec artifact id: ${String(artifactId)}`);
    }
    const status = persistedStatus ?? await this.getChangeStatus(changeId);
    const parsed = await this.invokeReadOnlyJson(['instructions', artifactId, '--change', changeId, '--json'], `instructions ${artifactId}`);
    const obj = record(parsed, `instructions.${artifactId}`);
    if (string(obj['changeName'], 'changeName') !== changeId || string(obj['artifactId'], 'artifactId') !== artifactId) {
      throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'artifact instructions do not match requested identity');
    }
    if (string(obj['schemaName'], 'schemaName') !== 'spec-driven') {
      throw new FlowkitError('OPENSPEC_UNSUPPORTED_SCHEMA', 'Only spec-driven OpenSpec schema is supported');
    }
    const planningHome = this.parsePlanningHome(obj['planningHome']);
    if (!samePhysicalIdentity(planningHome.changesDir, status.planningHome.changesDir)) {
      throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'artifact instructions planningHome differs from validated status');
    }
    const changeDir = assertRequestedChangeRoot(this.repoRoot, planningHome.changesDir, obj['changeDir'], changeId);
    if (!samePhysicalIdentity(changeDir.physical, status.changeRoot)) {
      throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'artifact instructions changeDir differs from validated status root');
    }
    const resolvedOutput = assertPhysicalPathWithin(changeDir.physical, assertAbsolutePath(obj['resolvedOutputPath'], 'resolvedOutputPath'), 'resolvedOutputPath');
    const existing = uniquePaths(stringArray(obj['existingOutputPaths'] ?? [], 'existingOutputPaths'), 'existingOutputPaths').map((path) =>
      assertPhysicalPathWithin(changeDir.physical, assertAbsolutePath(path, 'existingOutputPaths[]'), 'existingOutputPaths[]'));

    if (artifactId !== 'specs') {
      const identities = new Set([resolve(resolvedOutput), ...existing.map((path) => resolve(path))]);
      if (identities.size !== 1) {
        throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', `OpenSpec ${artifactId} instructions resolve to conflicting singleton identities`, {
          resolvedOutput, existing,
        });
      }
      const expected = status.artifactPaths[artifactId].physicalPaths;
      if (expected.length !== 1 || !samePhysicalIdentity(expected[0]!, resolvedOutput)) {
        throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', `OpenSpec ${artifactId} instructions differ from status artifact identity`, {
          expected, resolvedOutput,
        });
      }
    } else {
      const expected = new Set(status.artifactPaths.specs.physicalPaths.map((path) => resolve(path)));
      if (existing.some((path) => !expected.has(resolve(path)))) {
        throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', 'OpenSpec specs instructions contain paths absent from status identity', { existing, expected: [...expected] });
      }
    }

    return {
      changeId,
      artifactId,
      schemaName: 'spec-driven',
      resolvedOutputLogicalPath: physicalToRepoLogical(this.repoRoot, resolvedOutput, 'resolvedOutputPath'),
      existingOutputLogicalPaths: existing.map((path) => physicalToRepoLogical(this.repoRoot, path, 'existingOutputPaths[]')),
      dependencies: dependencyIds(obj['dependencies'] ?? [], 'dependencies'),
      unlocks: stringArray(obj['unlocks'] ?? [], 'unlocks'),
      instruction: typeof obj['instruction'] === 'string' ? obj['instruction'] : '',
      template: typeof obj['template'] === 'string' ? obj['template'] : '',
    };
  }

  async getApplyInstructions(
    changeId: string,
    persistedStatus?: OpenSpecChangeStatusView,
  ): Promise<OpenSpecApplyInstructionsView> {
    const status = persistedStatus ?? await this.getChangeStatus(changeId);
    const parsed = await this.invokeReadOnlyJson(['instructions', 'apply', '--change', changeId, '--json'], 'instructions apply');
    const obj = record(parsed, 'instructions.apply');
    if (string(obj['changeName'], 'changeName') !== changeId) {
      throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'apply instructions do not match requested Change');
    }
    if (string(obj['schemaName'], 'schemaName') !== 'spec-driven') {
      throw new FlowkitError('OPENSPEC_UNSUPPORTED_SCHEMA', 'Only spec-driven OpenSpec schema is supported');
    }
    const changeDir = assertRequestedChangeRoot(this.repoRoot, status.planningHome.changesDir, obj['changeDir'], changeId);
    if (!samePhysicalIdentity(changeDir.physical, status.changeRoot)) {
      throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'apply instructions changeDir differs from validated requested Change root', {
        expected: status.changeRoot, actual: changeDir.physical,
      });
    }
    const contextFilesObj = record(obj['contextFiles'], 'contextFiles');
    const contextFiles = Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => {
      const raw = uniquePaths(stringArray(contextFilesObj[artifactId] ?? [], `contextFiles.${artifactId}`), `contextFiles.${artifactId}`);
      const physical = raw.map((path) => assertPhysicalPathWithin(changeDir.physical, assertAbsolutePath(path, `contextFiles.${artifactId}[]`), `contextFiles.${artifactId}[]`));
      const expected = status.artifactPaths[artifactId].physicalPaths.map((path) => resolve(path));
      const actual = physical.map((path) => resolve(path));
      if (artifactId !== 'specs' && (actual.length !== 1 || expected.length !== 1 || actual[0] !== expected[0])) {
        throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', `apply contextFiles.${artifactId} does not match the unique status artifact identity`, { expected, actual });
      }
      if (artifactId === 'specs' && (actual.length !== expected.length || actual.some((path) => !expected.includes(path)))) {
        throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', 'apply contextFiles.specs does not match status specs identity set', { expected, actual });
      }
      return [artifactId, physical.map((path) => physicalToRepoLogical(this.repoRoot, path, `contextFiles.${artifactId}[]`))];
    })) as unknown as Readonly<Record<OpenSpecArtifactId, readonly string[]>>;
    const progressObj = record(obj['progress'], 'progress');
    const total = integer(progressObj['total'], 'progress.total');
    const complete = integer(progressObj['complete'], 'progress.complete');
    const remaining = integer(progressObj['remaining'], 'progress.remaining');
    if (complete + remaining !== total) {
      throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', 'apply progress fields are incoherent', { total, complete, remaining });
    }
    return {
      changeId,
      schemaName: 'spec-driven',
      contextFiles,
      progress: { total, complete, remaining },
      ...(typeof obj['state'] === 'string' && obj['state'].trim() !== '' && { state: obj['state'] }),
    };
  }

  async validateChange(changeId: string, strict = true): Promise<OpenSpecValidationView> {
    await this.getVersion();
    const args = ['validate', changeId, '--type', 'change', ...(strict ? ['--strict'] : []), '--json', '--no-interactive'];
    const result = await this.invokeRaw(args);
    if (result.spawnError !== undefined || !result.spawned) this.throwSpawnFailure(result, 'validate');
    if (result.kind === 'outcome-unknown') {
      throw new FlowkitError('OPENSPEC_COMMAND_OUTCOME_UNKNOWN', 'OpenSpec validate outcome is unknown after transport recovery', { changeId });
    }
    if (result.timedOut) throw new FlowkitError('OPENSPEC_COMMAND_TIMEOUT', 'OpenSpec validate timed out', { changeId });
    const parsed = parseJson(result.stdout, 'validate');
    const obj = record(parsed, 'validate');
    const items = obj['items'];
    if (!Array.isArray(items)) throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', 'validate.items must be an array');
    const matches = items
      .map((candidate) => record(candidate, 'validate.items[]'))
      .filter((candidate) => candidate['id'] === changeId && candidate['type'] === 'change');
    if (matches.length !== 1) {
      throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'validate output must contain exactly one requested Change item', { changeId, matches: matches.length });
    }
    const item = matches[0]!;
    if (typeof item['valid'] !== 'boolean') throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', 'validate item.valid must be boolean');
    const issuesRaw = item['issues'];
    if (!Array.isArray(issuesRaw)) throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', 'validate item.issues must be an array');
    const issues: OpenSpecValidationIssue[] = issuesRaw.map((issue) => {
      const issueObj = record(issue, 'validate issue');
      const pick = (key: string): string | undefined => typeof issueObj[key] === 'string' ? issueObj[key] as string : undefined;
      return {
        ...(pick('severity') !== undefined && { severity: pick('severity') }),
        ...(pick('path') !== undefined && { path: pick('path') }),
        ...(pick('message') !== undefined && { message: pick('message') }),
        ...(pick('code') !== undefined && { code: pick('code') }),
      };
    });
    const status = parseStatusEntries(obj['status']);
    const valid = item['valid'] as boolean;
    const issueHasError = issues.some((issue) => issue.severity?.toLowerCase() === 'error');
    if (valid && (result.exitCode !== 0 || hasErrorStatus(status) || issueHasError)) {
      throw new FlowkitError('OPENSPEC_VALIDATION_COHERENCE_MISMATCH', 'OpenSpec validate returned valid=true with contradictory process/status/issues', {
        changeId, exitCode: result.exitCode, status, issues,
      });
    }
    return { changeId, valid, issues, status, exitCode: result.exitCode };
  }

  async createOperationProjection(
    changeId: string,
    request: {
      readonly artifactInstructionIds?: readonly OpenSpecArtifactId[];
      readonly includeApplyInstructions?: boolean;
      readonly includeStrictValidation?: boolean;
      readonly baseProjection?: OpenSpecOperationProjection;
    } = {},
  ): Promise<OpenSpecOperationProjection> {
    const baseProjection = request.baseProjection;
    if (baseProjection !== undefined && baseProjection.changeId !== changeId) {
      throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'OpenSpec base operation projection belongs to a different Change', {
        expected: changeId, actual: baseProjection.changeId,
      });
    }
    const version = baseProjection?.version ?? await this.getVersion();
    const status = baseProjection?.status ?? await this.getChangeStatus(changeId);
    const invocationDiagnostics = baseProjection === undefined ? ['version', 'status'] : [...baseProjection.invocationDiagnostics];
    const artifactInstructionIds = request.artifactInstructionIds ?? [];
    const artifactInstructions = artifactInstructionIds.length === 0
      ? undefined
      : Object.fromEntries(await Promise.all(artifactInstructionIds.map(async (artifactId) => {
        const instruction = await this.getArtifactInstructions(changeId, artifactId, status);
        return [artifactId, instruction] as const;
      }))) as Readonly<Record<OpenSpecArtifactId, OpenSpecArtifactInstructionsView>>;
    if (artifactInstructions !== undefined) invocationDiagnostics.push(...artifactInstructionIds.map((artifactId) => `instructions:${artifactId}`));

    const validation = request.includeStrictValidation ? await this.validateChange(changeId, true) : undefined;
    if (validation !== undefined) invocationDiagnostics.push('validate:strict');
    const applyInstructions = request.includeApplyInstructions
      ? await this.getApplyInstructions(changeId, status)
      : undefined;
    if (applyInstructions !== undefined) invocationDiagnostics.push('instructions:apply');

    return {
      projectionVersion: 1,
      version,
      changeId,
      status,
      ...(artifactInstructions !== undefined && { artifactInstructions }),
      ...(validation !== undefined && { validation }),
      ...(applyInstructions !== undefined && { applyInstructions }),
      invocationDiagnostics,
    };
  }

  /**
   * Execute the mutating archive command only. Durable arm/recovery is owned by
   * the higher-level archive service; this method deliberately exposes whether
   * a child reached `spawn` and only an admissible normalized terminal result.
   */
  async archiveChange(changeId: string, statusView?: OpenSpecChangeStatusView): Promise<OpenSpecArchiveInvocation> {
    await this.getVersion();
    const status = statusView ?? await this.getChangeStatus(changeId);
    const result = await this.invokeRaw(['archive', changeId, '--json', '--yes']);
    if (!result.spawned) {
      return {
        spawned: false,
        timedOut: result.timedOut,
        exitCode: result.exitCode,
        transportDiagnosis: result.spawnError?.message ?? 'archive child did not spawn',
      };
    }
    if (result.timedOut) {
      return { spawned: true, timedOut: true, exitCode: result.exitCode, transportDiagnosis: 'archive timed out' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout) as unknown;
    } catch {
      return { spawned: true, timedOut: false, exitCode: result.exitCode, transportDiagnosis: 'archive terminal output was not valid JSON' };
    }
    const obj = record(parsed, 'archive');
    const structuredStatus = parseStatusEntries(obj['status']);
    const archiveRaw = obj['archive'];
    if (result.exitCode === 0 && !hasErrorStatus(structuredStatus) && archiveRaw !== null && archiveRaw !== undefined) {
      const archive = record(archiveRaw, 'archive.archive');
      const change = string(archive['change'], 'archive.change');
      if (change !== changeId) throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'archive result Change identity mismatch', { expected: changeId, actual: change });
      const archivedAs = string(archive['archivedAs'], 'archive.archivedAs');
      const path = assertPhysicalPathWithin(status.archiveNamespaceRoot, assertAbsolutePath(archive['path'], 'archive.path'), 'archive.path');
      if (!samePhysicalIdentity(path, resolve(status.archiveNamespaceRoot, archivedAs))) {
        throw new FlowkitError('OPENSPEC_PATH_AUTHORITY_INVALID', 'archive.path does not match archivedAs within archive namespace', { archivedAs, path });
      }
      const specsUpdated = boolean(archive['specsUpdated'], 'archive.specsUpdated');
      const totals = archive['totals'] === undefined ? undefined : this.parseArchiveTotals(archive['totals']);
      const observation: OpenSpecArchiveSuccessObservation = {
        kind: 'success', change, archivedAs,
        path: physicalToRepoLogical(this.repoRoot, path, 'archive.path'),
        specsUpdated,
        ...(totals !== undefined && { totals }),
      };
      return { spawned: true, timedOut: false, exitCode: result.exitCode, observation };
    }

    if (result.exitCode !== 0 || hasErrorStatus(structuredStatus)) {
      if (structuredStatus.length === 0) {
        return { spawned: true, timedOut: false, exitCode: result.exitCode, transportDiagnosis: 'archive failure had no structured status' };
      }
      const normalized = structuredStatus
        .map((entry) => ({ severity: entry.severity, ...(entry.code !== undefined && { code: entry.code }) }))
        .sort((a, b) => `${a.severity}\0${a.code ?? ''}`.localeCompare(`${b.severity}\0${b.code ?? ''}`));
      const observation: OpenSpecArchiveFailureObservation = { kind: 'failure', exitCode: result.exitCode, status: normalized };
      return { spawned: true, timedOut: false, exitCode: result.exitCode, observation };
    }

    return { spawned: true, timedOut: false, exitCode: result.exitCode, transportDiagnosis: 'archive output did not match supported success/failure shape' };
  }

  private parseChangeStatus(parsed: unknown, changeId: string): OpenSpecChangeStatusView {
    const obj = record(parsed, 'status');
    if (string(obj['changeName'], 'changeName') !== changeId) {
      throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'status does not match requested Change');
    }
    if (string(obj['schemaName'], 'schemaName') !== 'spec-driven') {
      throw new FlowkitError('OPENSPEC_UNSUPPORTED_SCHEMA', 'Only spec-driven OpenSpec schema is supported');
    }
    const rootObj = record(obj['root'], 'status.root');
    const rootPath = assertRepoRootIdentity(this.repoRoot, rootObj['path'], 'status.root.path');
    const planningHome = this.parsePlanningHome(obj['planningHome']);
    const changeRoot = assertRequestedChangeRoot(this.repoRoot, planningHome.changesDir, obj['changeRoot'], changeId);
    const actionContext = this.parseActionContext(obj['actionContext']);
    const artifactPathsObj = record(obj['artifactPaths'], 'artifactPaths');
    const singletonIdentities = new Map<string, string>();
    const artifactPaths = Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => {
      const entry = record(artifactPathsObj[artifactId], `artifactPaths.${artifactId}`);
      const resolvedOutput = assertPhysicalPathWithin(
        changeRoot.physical,
        assertAbsolutePath(entry['resolvedOutputPath'], `artifactPaths.${artifactId}.resolvedOutputPath`),
        `artifactPaths.${artifactId}.resolvedOutputPath`,
      );
      const existingRaw = uniquePaths(
        stringArray(entry['existingOutputPaths'] ?? [], `artifactPaths.${artifactId}.existingOutputPaths`),
        `artifactPaths.${artifactId}.existingOutputPaths`,
      );
      const existing = existingRaw.map((path) => assertPhysicalPathWithin(
        changeRoot.physical,
        assertAbsolutePath(path, `artifactPaths.${artifactId}.existingOutputPaths[]`),
        `artifactPaths.${artifactId}.existingOutputPaths[]`,
      ));
      let physicalPaths: readonly string[];
      if (artifactId === 'specs') {
        physicalPaths = existing;
      } else {
        const identities = new Set([resolve(resolvedOutput), ...existing.map((path) => resolve(path))]);
        if (identities.size !== 1) {
          throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', `OpenSpec ${artifactId} singleton has conflicting resolved/existing identities`, {
            resolvedOutput, existing,
          });
        }
        physicalPaths = [resolvedOutput];
        const identity = resolve(resolvedOutput);
        const prior = singletonIdentities.get(identity);
        if (prior !== undefined && prior !== artifactId) {
          throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', 'OpenSpec singleton artifacts alias the same physical identity', {
            artifactId, priorArtifactId: prior, path: identity,
          });
        }
        singletonIdentities.set(identity, artifactId);
      }
      const view: OpenSpecArtifactPathView = {
        artifactId,
        physicalPaths,
        logicalPaths: physicalPaths.map((path) => physicalToRepoLogical(this.repoRoot, path, `artifactPaths.${artifactId}`)),
      };
      return [artifactId, view];
    })) as unknown as Readonly<Record<OpenSpecArtifactId, OpenSpecArtifactPathView>>;

    const singletonPaths = new Set([
      ...artifactPaths.proposal.physicalPaths,
      ...artifactPaths.design.physicalPaths,
      ...artifactPaths.tasks.physicalPaths,
    ].map((path) => resolve(path)));
    if (artifactPaths.specs.physicalPaths.some((path) => singletonPaths.has(resolve(path)))) {
      throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', 'OpenSpec specs path aliases a singleton planning artifact');
    }

    const archiveNamespaceRoot = assertPhysicalPathWithin(this.repoRoot, resolve(planningHome.changesDir, 'archive'), 'archiveNamespaceRoot');
    return {
      changeId,
      schemaName: 'spec-driven',
      root: { path: rootPath },
      planningHome,
      changeRoot: changeRoot.physical,
      changeRootLogical: changeRoot.logical,
      archiveNamespaceRoot,
      archiveNamespaceRootLogical: physicalToRepoLogical(this.repoRoot, archiveNamespaceRoot, 'archiveNamespaceRoot'),
      actionContext,
      artifactPaths,
      status: parseStatusEntries(obj['status']),
    };
  }

  private parsePlanningHome(value: unknown): OpenSpecPlanningHomeView {
    const obj = record(value, 'planningHome');
    if (obj['kind'] !== 'repo') {
      throw new FlowkitError('OPENSPEC_UNSUPPORTED_PLANNING_HOME', 'Only repo-local OpenSpec planningHome is supported', { kind: obj['kind'] });
    }
    const root = assertRepoRootIdentity(this.repoRoot, obj['root'], 'planningHome.root');
    const changesDir = assertPhysicalPathWithin(root, assertAbsolutePath(obj['changesDir'], 'planningHome.changesDir'), 'planningHome.changesDir');
    return { kind: 'repo', root, changesDir };
  }

  private parseActionContext(value: unknown): OpenSpecActionContextView {
    const obj = record(value, 'actionContext');
    if (obj['mode'] !== 'repo-local' || obj['sourceOfTruth'] !== 'repo') {
      throw new FlowkitError('OPENSPEC_UNSUPPORTED_PLANNING_HOME', 'OpenSpec actionContext must be repo-local/repo', {
        mode: obj['mode'], sourceOfTruth: obj['sourceOfTruth'],
      });
    }
    const allowed = stringArray(obj['allowedEditRoots'] ?? [], 'actionContext.allowedEditRoots').map((path) =>
      assertRepoRootIdentity(this.repoRoot, path, 'actionContext.allowedEditRoots[]'));
    if (allowed.length === 0) throw new FlowkitError('OPENSPEC_MALFORMED_OUTPUT', 'actionContext.allowedEditRoots must include repoRoot');
    return { mode: 'repo-local', sourceOfTruth: 'repo', allowedEditRoots: allowed };
  }

  private parseArchiveTotals(value: unknown): OpenSpecArchiveTotals {
    const obj = record(value, 'archive.totals');
    return {
      added: integer(obj['added'], 'archive.totals.added'),
      modified: integer(obj['modified'], 'archive.totals.modified'),
      removed: integer(obj['removed'], 'archive.totals.removed'),
      renamed: integer(obj['renamed'], 'archive.totals.renamed'),
    };
  }

  private async invokeReadOnlyJson(args: string[], operation: string): Promise<unknown> {
    const result = await this.invokeRaw(args);
    this.assertReadOnlyProcessSuccess(result, operation);
    const parsed = parseJson(result.stdout, operation);
    const obj = record(parsed, operation);
    const status = parseStatusEntries(obj['status']);
    if (hasErrorStatus(status)) {
      throw new FlowkitError('OPENSPEC_STRUCTURED_ERROR', `${operation} returned structured error status`, { status });
    }
    return parsed;
  }

  private assertReadOnlyProcessSuccess(result: RunCommandResult, operation: string): void {
    if (result.spawnError !== undefined || !result.spawned) this.throwSpawnFailure(result, operation);
    if (result.kind === 'outcome-unknown') {
      throw new FlowkitError('OPENSPEC_COMMAND_OUTCOME_UNKNOWN', `OpenSpec ${operation} outcome is unknown after transport recovery`, {
        timeoutMs: this.timeoutMs,
      });
    }
    if (result.timedOut) throw new FlowkitError('OPENSPEC_COMMAND_TIMEOUT', `OpenSpec ${operation} timed out`, { timeoutMs: this.timeoutMs });
    if (result.exitCode !== 0) {
      let status: readonly OpenSpecStatusEntry[] = [];
      try { status = parseStatusEntries(record(parseJson(result.stdout, operation), operation)['status']); } catch { /* retain transport diagnosis */ }
      throw new FlowkitError('OPENSPEC_COMMAND_FAILED', `OpenSpec ${operation} exited ${result.exitCode}`, { exitCode: result.exitCode, status });
    }
  }

  private throwSpawnFailure(result: RunCommandResult, operation: string): never {
    throw new FlowkitError('OPENSPEC_SPAWN_FAILED', `OpenSpec ${operation} could not spawn`, {
      ...(result.spawnError?.code !== undefined && { code: result.spawnError.code }),
      message: result.spawnError?.message ?? 'child did not emit spawn',
    });
  }

  private async invokeRaw(args: string[]): Promise<RunCommandResult> {
    const executable = this.explicitExecutable ?? await this.resolveDefaultExecutable();
    return this.runner(executable, args, {
      cwd: this.repoRoot,
      env: this.env,
      timeout: this.timeoutMs,
      platform: this.platform,
    });
  }

  private async resolveDefaultExecutable(): Promise<string> {
    if (this.platform !== 'win32') return 'openspec';
    this.defaultExecutablePromise ??= this.resolveDefaultWindowsShim();
    return this.defaultExecutablePromise;
  }

  private async resolveDefaultWindowsShim(): Promise<string> {
    const pathValue = Object.entries(this.env).filter(([key]) => key.toLowerCase() === 'path').at(-1)?.[1] ?? '';
    const directories = pathValue.split(';').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    for (const shim of ['openspec.ps1', 'openspec.cmd'] as const) {
      for (const directory of directories) {
        const candidate = join(directory, shim);
        try {
          await access(candidate);
          return candidate;
        } catch {
          // Continue deterministic PATH search. `.cmd` is considered only
          // after the complete `.ps1` search has found no shim.
        }
      }
    }
    throw new FlowkitError(
      'OPENSPEC_SPAWN_FAILED',
      'OpenSpec Windows shim not found on PATH (expected openspec.ps1, fallback openspec.cmd)',
      { pathEntries: directories.length },
    );
  }
}
