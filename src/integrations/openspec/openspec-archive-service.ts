import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { ActionPackage } from '../../domain/types.js';
import { compareAndSetArchiveMutationGuard, completeRun, readArchiveMutationGuard } from '../../persistence/run-persistence.js';
import { FlowkitError } from '../../shared/errors.js';
import { OpenSpecCliAdapter } from './openspec-cli-adapter.js';
import { computeOpenSpecArchiveMutationSurfaceV1 } from './openspec-paths.js';
import {
  OPENSPEC_ARCHIVE_SURFACE_VERSION,
  type ArchiveMutationGuard,
  type ArchiveMutationGuardTerminalObservation,
  type OpenSpecArchiveTerminalObservation,
} from './openspec-types.js';

export type OpenSpecArchiveExecutionOutcome =
  | { readonly status: 'success'; readonly spawned: boolean; readonly observation: Extract<OpenSpecArchiveTerminalObservation, { kind: 'success' }> }
  | { readonly status: 'terminal-failure'; readonly spawned: boolean; readonly code: string }
  | { readonly status: 'recovery-required'; readonly spawned: boolean; readonly code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' | 'OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN' };

export interface InvokeOpenSpecArchiveOptions {
  readonly adapter?: OpenSpecCliAdapter;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, canonicalize(obj[key])]));
}

function observationFingerprint(observation: OpenSpecArchiveTerminalObservation): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(observation))).digest('hex');
}

function durableObservation(observation: OpenSpecArchiveTerminalObservation): ArchiveMutationGuardTerminalObservation {
  return {
    kind: observation.kind,
    resultFingerprint: observationFingerprint(observation),
    normalized: observation,
  };
}

function runDirFor(repoRoot: string, pkg: ActionPackage): string {
  if (pkg.run.action !== 'archive') {
    throw new FlowkitError('ACTION_PACKAGE_IDENTITY_MISMATCH', 'OpenSpec archive service requires an archive Action Package');
  }
  return join(repoRoot, '.flowkit/runs', pkg.run.deliveryId, pkg.run.changeId, pkg.run.runId);
}

function surfaceInputFromGuard(repoRoot: string, guard: ArchiveMutationGuard): {
  readonly repoRoot: string;
  readonly changeRoot: string;
  readonly archiveNamespaceRoot: string;
} {
  if (guard.surfaceVersion !== OPENSPEC_ARCHIVE_SURFACE_VERSION || guard.canonicalSpecsRoot !== 'openspec/specs') {
    throw new FlowkitError('OPENSPEC_ARCHIVE_SURFACE_VERSION_UNSUPPORTED', 'Unsupported persisted archive mutation surface version');
  }
  return {
    repoRoot,
    changeRoot: join(repoRoot, guard.changeRoot),
    archiveNamespaceRoot: join(repoRoot, guard.archiveNamespaceRoot),
  };
}

async function currentSurface(repoRoot: string, guard: ArchiveMutationGuard): Promise<string> {
  return computeOpenSpecArchiveMutationSurfaceV1(surfaceInputFromGuard(repoRoot, guard));
}

async function terminalizeFailure(runDir: string, code: string): Promise<OpenSpecArchiveExecutionOutcome> {
  await completeRun(runDir, { failureDiagnosis: code });
  return { status: 'terminal-failure', spawned: false, code };
}

async function classifyDurableGuard(
  repoRoot: string,
  runDir: string,
  guard: ArchiveMutationGuard,
): Promise<OpenSpecArchiveExecutionOutcome | { readonly status: 'retry-admitted' }> {
  const post = await currentSurface(repoRoot, guard);
  const same = post === guard.preArchiveGenerationFingerprint;
  const terminal = guard.terminalObservation?.normalized;

  if (terminal?.kind === 'success') {
    if (!same) return { status: 'success', spawned: false, observation: terminal };
    return terminalizeFailure(runDir, 'OPENSPEC_ARCHIVE_TERMINAL_STATE_MISMATCH');
  }
  if (terminal?.kind === 'failure') {
    if (same) return terminalizeFailure(runDir, 'OPENSPEC_ARCHIVE_FAILED');
    return { status: 'recovery-required', spawned: false, code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' };
  }

  if (guard.state === 'recovery-admitted') {
    if (!same) {
      return { status: 'recovery-required', spawned: false, code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' };
    }
    return { status: 'retry-admitted' };
  }

  // Armed without a durable terminal observation is outcome-unknown even when
  // the visible mutation surface currently equals F: a prior child may have run
  // and been mechanically restored, and only explicit recovery admission may
  // authorize a second mutation.
  return { status: 'recovery-required', spawned: false, code: 'OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN' };
}

/**
 * Invoke OpenSpec archive for a prepared pending archive Run. The method owns
 * durable pre-spawn arm, terminal-observation publication and post-V1 matrix
 * classification. It never auto-retries an armed generation.
 */
export async function invokeOpenSpecArchive(
  repoRoot: string,
  actionPackage: ActionPackage,
  options: InvokeOpenSpecArchiveOptions = {},
): Promise<OpenSpecArchiveExecutionOutcome> {
  const runDir = runDirFor(repoRoot, actionPackage);
  const adapter = options.adapter ?? new OpenSpecCliAdapter({ repoRoot });
  let guard = await readArchiveMutationGuard(runDir);

  if (guard !== undefined) {
    const classification = await classifyDurableGuard(repoRoot, runDir, guard);
    if (classification.status !== 'retry-admitted') return classification;
    const current = await currentSurface(repoRoot, guard);
    if (current !== guard.preArchiveGenerationFingerprint || guard.terminalObservation !== undefined) {
      return { status: 'recovery-required', spawned: false, code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' };
    }
    const rearmed: ArchiveMutationGuard = { ...guard, state: 'armed' };
    await compareAndSetArchiveMutationGuard(runDir, guard, rearmed);
    guard = rearmed;
    if (await currentSurface(repoRoot, guard) !== guard.preArchiveGenerationFingerprint) {
      return { status: 'recovery-required', spawned: false, code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' };
    }
  } else {
    const status = await adapter.getChangeStatus(actionPackage.run.changeId);
    const fingerprint = await computeOpenSpecArchiveMutationSurfaceV1({
      repoRoot,
      changeRoot: status.changeRoot,
      archiveNamespaceRoot: status.archiveNamespaceRoot,
    });
    const fresh: ArchiveMutationGuard = {
      state: 'armed',
      surfaceVersion: OPENSPEC_ARCHIVE_SURFACE_VERSION,
      changeRoot: status.changeRootLogical,
      canonicalSpecsRoot: 'openspec/specs',
      archiveNamespaceRoot: status.archiveNamespaceRootLogical,
      preArchiveGenerationFingerprint: fingerprint,
    };
    await compareAndSetArchiveMutationGuard(runDir, undefined, fresh);
    guard = fresh;
    const postArm = await currentSurface(repoRoot, guard);
    if (postArm !== fingerprint) {
      return { status: 'recovery-required', spawned: false, code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' };
    }
  }

  // At this point this invocation itself just armed the exact generation. A
  // persisted armed guard from a previous process never reaches this point.
  const statusView = await adapter.getChangeStatus(actionPackage.run.changeId);
  const invocation = await adapter.archiveChange(actionPackage.run.changeId, statusView);
  if (!invocation.spawned) {
    return terminalizeFailure(runDir, 'OPENSPEC_SPAWN_FAILED');
  }

  if (invocation.observation === undefined) {
    // No durable terminal observation may be fabricated from timeout/prose.
    // Keep the same pending Run + armed guard for explicit recovery.
    await currentSurface(repoRoot, guard); // fail closed if surface cannot be computed
    return { status: 'recovery-required', spawned: true, code: 'OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN' };
  }

  const withObservation: ArchiveMutationGuard = {
    ...guard,
    terminalObservation: durableObservation(invocation.observation),
  };
  await compareAndSetArchiveMutationGuard(runDir, guard, withObservation);
  guard = withObservation;

  const post = await currentSurface(repoRoot, guard);
  const same = post === guard.preArchiveGenerationFingerprint;
  if (invocation.observation.kind === 'success') {
    if (same) {
      await completeRun(runDir, { failureDiagnosis: 'OPENSPEC_ARCHIVE_TERMINAL_STATE_MISMATCH' });
      return { status: 'terminal-failure', spawned: true, code: 'OPENSPEC_ARCHIVE_TERMINAL_STATE_MISMATCH' };
    }
    return { status: 'success', spawned: true, observation: invocation.observation };
  }

  if (same) {
    await completeRun(runDir, { failureDiagnosis: 'OPENSPEC_ARCHIVE_FAILED' });
    return { status: 'terminal-failure', spawned: true, code: 'OPENSPEC_ARCHIVE_FAILED' };
  }
  return { status: 'recovery-required', spawned: true, code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' };
}

/**
 * Explicitly admit an exact mechanical recovery of an outcome-unknown archive.
 * Durable known failure observations terminalize after exact restore and never
 * become retry-admitted.
 */
export async function admitOpenSpecArchiveRecovery(
  repoRoot: string,
  actionPackage: ActionPackage,
): Promise<'recovery-admitted' | 'terminal-failure'> {
  const runDir = runDirFor(repoRoot, actionPackage);
  const guard = await readArchiveMutationGuard(runDir);
  if (guard === undefined || guard.state !== 'armed') {
    throw new FlowkitError('OPENSPEC_ARCHIVE_RECOVERY_NOT_REQUIRED', 'archive Run has no armed recovery gate');
  }
  const post = await currentSurface(repoRoot, guard);
  if (post !== guard.preArchiveGenerationFingerprint) {
    throw new FlowkitError('OPENSPEC_ARCHIVE_RECOVERY_GENERATION_MISMATCH', 'archive mutation surface has not been exactly restored', {
      expected: guard.preArchiveGenerationFingerprint,
      current: post,
    });
  }

  const terminal = guard.terminalObservation?.normalized;
  if (terminal?.kind === 'failure') {
    await completeRun(runDir, { failureDiagnosis: 'OPENSPEC_ARCHIVE_FAILED' });
    return 'terminal-failure';
  }
  if (terminal?.kind === 'success') {
    await completeRun(runDir, { failureDiagnosis: 'OPENSPEC_ARCHIVE_TERMINAL_STATE_MISMATCH' });
    return 'terminal-failure';
  }
  const admitted: ArchiveMutationGuard = { ...guard, state: 'recovery-admitted' };
  await compareAndSetArchiveMutationGuard(runDir, guard, admitted);
  return 'recovery-admitted';
}

/** Read-only durable recovery classification for prepare/doctor/resume. */
export async function inspectOpenSpecArchiveRecovery(
  repoRoot: string,
  runDir: string,
): Promise<'none' | 'recovery-required' | 'recovery-admitted' | 'known-success' | 'terminalizable-failure'> {
  const guard = await readArchiveMutationGuard(runDir);
  if (guard === undefined) return 'none';
  const post = await currentSurface(repoRoot, guard);
  const same = post === guard.preArchiveGenerationFingerprint;
  const terminal = guard.terminalObservation?.normalized;
  if (terminal?.kind === 'success') return same ? 'terminalizable-failure' : 'known-success';
  if (terminal?.kind === 'failure') return same ? 'terminalizable-failure' : 'recovery-required';
  return guard.state === 'recovery-admitted' && same ? 'recovery-admitted' : 'recovery-required';
}
