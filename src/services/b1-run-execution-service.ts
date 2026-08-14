import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getActionDefinition,
  expectedRoleForAction,
  type ChangeAction,
} from '../domain/actions.js';
import type {
  ActionPackage,
  ActionPackageV1,
  ActionPackageV2,
  ActionPackageV2Apply,
  ActionPackageV2NonApply,
  ActionPackageFindingConvergenceView,
  ActionPackageFindingView,
  ActionPackageReviewView,
  ActionPackageVerificationView,
  LogicalActionResultInput,
  OwnerAuthorizationRef,
  OwnerFactRef,
  EntryWorkspaceIdentity,
  MutationDeclaration,
  VersionedAuthorityRef,
} from '../domain/types.js';
import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import type {
  FormalFactSnapshot,
  ReviewVerdictFact,
  RunFact,
} from '../facts/formal-fact-snapshot.js';
import { computeLineage } from '../policy/lineage.js';
import { type Stage } from '../policy/stage-detector.js';
import { currentContractResetRefs, projectCurrentContractResetLifecycle, runMatchesContractResetIdentity } from '../facts/generation-resolver.js';
import { next } from '../policy/next.js';
import { getActiveChange, getCompletedUncheckpointedChanges } from '../policy/preconditions.js';
import { resolveReview } from '../policy/unified-entry.js';
import { allocateNextRunId } from '../persistence/run-id-fs.js';
import {
  completeRun,
  createRun,
  type CompleteRunInput,
} from '../persistence/run-persistence.js';
import {
  admitC1RunResultForReader,
  validateContextFile,
  validateContextFileIdentity,
  type ContextFile,
  type ContextFileConstraints,
  type ReviewFinding,
} from '../persistence/serialization.js';
import { FlowkitError } from '../shared/errors.js';
import { normalizeSeparators } from '../shared/paths.js';
import { OpenSpecCliAdapter } from '../integrations/openspec/openspec-cli-adapter.js';
import {
  OPENSPEC_SUPPORTED_ARTIFACT_IDS,
  type ArchiveEntryOpenSpecProjection,
  type OpenSpecPreparedActionContextView,
} from '../integrations/openspec/openspec-types.js';
import { isOpenSpecThinIntegrationActive } from '../integrations/openspec/openspec-integration-state.js';
import { inspectOpenSpecArchiveRecovery } from '../integrations/openspec/openspec-archive-service.js';
import { deriveMutationDeclaration } from '../verification/change-selection/mutation-declaration.js';
import {
  captureEntryWorkspaceSnapshot,
  validateEntryWorkspaceSnapshotRecord,
} from '../verification/change-selection/entry-snapshot.js';
import { derivePostActionChangeObservation } from '../verification/change-selection/actual-change-set.js';
import { buildVerificationSelection } from '../verification/change-selection/selection.js';
import {
  buildVerificationSelectionPublication,
  publishVerificationSelection,
  validatePublishedVerificationSelection,
} from '../verification/change-selection/publication.js';

export type RunPreparationEntry = 'next' | 'review';

export interface PrepareActionExecutionInput {
  readonly repoRoot: string;
  readonly deliveryId: string;
  /** Unified execution intent. Caller MUST NOT name a concrete formal Action. */
  readonly entry: RunPreparationEntry;
  readonly now?: () => Date;
}

export interface PreparedActionExecution {
  readonly package: ActionPackage;
  readonly resumed: boolean;
  /** Bounded external OpenSpec execution view for the single resolved Action. */
  readonly openSpecContext?: OpenSpecPreparedActionContextView;
}

export type PreparedNewExecution =
  | { readonly kind: 'prepared'; readonly package: ActionPackage; readonly openSpecContext?: OpenSpecPreparedActionContextView }
  | { readonly kind: 'exact-resume-required'; readonly expectedRunId: string };

export interface ResumeRunInput {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly expectedRunId: string;
}

/**
 * Exact v5 continuation surface. It intentionally reads only the persisted
 * Run identity; it does not re-enter Policy or allocate a replacement Run.
 */
export async function resumeRun(input: ResumeRunInput): Promise<ActionPackageV2> {
  const deliveryRunsDir = join(input.repoRoot, RUNS_PREFIX, input.deliveryId);
  const matches = await findExactPersistedRunDirectories(deliveryRunsDir, input.expectedRunId);
  if (matches.length !== 1) {
    throw new FlowkitError('EXACT_RESUME_RUN_NOT_FOUND', 'Expected exactly one persisted Run for exact resume', {
      expectedRunId: input.expectedRunId,
      matches: matches.length,
    });
  }
  const runDir = matches[0]!;
  const resultPath = join(runDir, 'result.json');
  if (await isFile(resultPath)) {
    throw new FlowkitError('EXACT_RESUME_NOT_PENDING', 'Exact resume requires a pending Run', {
      expectedRunId: input.expectedRunId,
    });
  }
  const context = await readContextFile(runDir);
  validateContextFileIdentity(context, runDir);
  if (context.schemaVersion !== 5) {
    throw new FlowkitError('EXACT_RESUME_V5_CONTEXT_REQUIRED', 'Exact resume requires a persisted v5 ActionPackage', {
      expectedRunId: input.expectedRunId,
      schemaVersion: context.schemaVersion,
    });
  }
  const actionPackage = context.actionPackage;
  if (
    actionPackage.run.runId !== input.expectedRunId ||
    actionPackage.run.deliveryId !== input.deliveryId ||
    actionPackage.run.changeId !== context.changeId ||
    actionPackage.run.action !== context.action ||
    actionPackage.run.role !== context.role ||
    actionPackage.run.semanticInputFingerprint !== context.semanticInputFingerprint
  ) {
    throw new FlowkitError('EXACT_RESUME_CONTEXT_IDENTITY_MISMATCH', 'Persisted ActionPackage does not match the pending Run identity', {
      expectedRunId: input.expectedRunId,
    });
  }
  if (actionPackage.run.action === 'apply' || actionPackage.run.action === 'revise-apply') {
    const applyPackage = actionPackage as ActionPackageV2Apply;
    let entrySnapshot: unknown;
    try {
      entrySnapshot = JSON.parse(await readFile(join(runDir, 'entry-workspace.json'), 'utf8')) as unknown;
    } catch (error) {
      throw new FlowkitError('EXACT_RESUME_ENTRY_SNAPSHOT_MISSING', 'v5 Apply exact resume requires its immutable entry workspace record', {
        expectedRunId: input.expectedRunId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    const validatedEntrySnapshot = validateEntryWorkspaceSnapshotRecord(entrySnapshot);
    if (
      validatedEntrySnapshot.canonicalBase !== applyPackage.entryWorkspaceIdentity.canonicalBase ||
      validatedEntrySnapshot.workspaceFingerprint !== applyPackage.entryWorkspaceIdentity.workspaceFingerprint
    ) {
      throw new FlowkitError('EXACT_RESUME_ENTRY_SNAPSHOT_MISMATCH', 'v5 Apply entry workspace record does not match its persisted ActionPackage', {
        expectedRunId: input.expectedRunId,
      });
    }
    const currentWorkspace = await captureEntryWorkspaceSnapshot(input.repoRoot);
    // The actual base-to-post candidate set is computed at terminal admission.
    // Resume only answers the self-drift question from immutable entry to now.
    derivePostActionChangeObservation(
      validatedEntrySnapshot,
      validatedEntrySnapshot,
      currentWorkspace,
      applyPackage.mutationDeclaration,
    );
  }
  return actionPackage;
}

async function findExactPersistedRunDirectories(deliveryRunsDir: string, expectedRunId: string): Promise<readonly string[]> {
  let changeDirectories: readonly import('node:fs').Dirent[];
  try {
    changeDirectories = await readdir(deliveryRunsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const matches: string[] = [];
  for (const changeDirectory of changeDirectories) {
    if (!changeDirectory.isDirectory() || changeDirectory.name.startsWith('.')) continue;
    const candidate = join(deliveryRunsDir, changeDirectory.name, expectedRunId);
    if (await isDirectory(candidate)) matches.push(candidate);
  }
  return matches;
}


export interface PreparedRunInspection {
  readonly runId?: string;
  readonly action?: ChangeAction;
  readonly role?: 'author' | 'reviewer';
  readonly status: 'none' | 'resumable' | 'input-drift' | 'fingerprint-missing' | 'not-resumable' | 'ambiguous' | 'recovery-required' | 'terminal-observation';
}

/** Read-only diagnostic projection for one B1 prepared pending Run. */
export async function inspectPreparedRun(
  repoRoot: string,
  deliveryId: string,
): Promise<PreparedRunInspection> {
  const snapshot = await readSnapshot(repoRoot, deliveryId);
  const change = getActiveChange(snapshot);
  if (change === null) {
    const persistedArchive = await findPersistedPendingArchive(repoRoot, deliveryId, snapshot);
    if (persistedArchive !== undefined) {
      return inspectPersistedPendingArchive(repoRoot, deliveryId, snapshot, persistedArchive);
    }
    return { status: 'none' };
  }
  const pending = snapshot.runs.filter((run) => run.changeId === change.id && run.status === 'pending');
  if (pending.length === 0) return { status: 'none' };
  if (pending.length > 1) return { status: 'ambiguous' };
  const run = pending[0]!;
  const base = { runId: run.runId, action: run.action, role: run.role === 'reviewer' ? 'reviewer' as const : 'author' as const };
  if (run.semanticInputFingerprint === undefined) return { ...base, status: 'fingerprint-missing' };

  const runDir = join(repoRoot, RUNS_PREFIX, deliveryId, change.id, run.runId);
  try {
    const context = await readContextFile(runDir);
    if (await isContractResetOnlyPendingDrift(repoRoot, deliveryId, snapshot, change.id, context)) {
      return { ...base, status: 'recovery-required' };
    }
  } catch {
    // Continue with the normal resumability diagnostic. A malformed or otherwise
    // unreadable pending context is not eligible for Contract Reset recovery.
  }

  const normal = next(snapshot);
  const review = run.action.startsWith('review-') ? resolveReview(snapshot) : undefined;
  const resolved = normal.kind === 'action' && normal.action === run.action
    ? normal.action
    : review?.kind === 'action' && review.action === run.action
      ? review.action
      : undefined;
  if (resolved === undefined) return { ...base, status: 'not-resumable' };

  try {
    const descriptors = deriveRunDescriptors(snapshot, change.id, resolved);
    const semantic = await deriveSemanticInputs(repoRoot, deliveryId, snapshot, change.id, resolved, descriptors);
    return {
      ...base,
      status: semantic.semanticInputFingerprint === run.semanticInputFingerprint ? 'resumable' : 'input-drift',
    };
  } catch {
    return { ...base, status: 'not-resumable' };
  }
}

export interface AdmitActionResultInput {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly actionPackage: ActionPackage;
  readonly result: LogicalActionResultInput;
  /** Focused bootstrap seam; production uses the canonical adapter. */
  readonly openSpecAdapter?: OpenSpecCliAdapter;
}

export interface RecoverContractResetPendingInput {
  readonly repoRoot: string;
  readonly deliveryId: string;
}

export interface RecoverContractResetPendingResult {
  readonly runId: string;
  readonly action: ChangeAction;
  readonly status: 'cancelled';
  readonly cancellationReason: 'superseded-by-owner-contract-reset';
}

export interface RecoverArchiveTerminalInput {
  readonly repoRoot: string;
  readonly deliveryId: string;
}

export interface RecoverArchiveTerminalResult {
  readonly runId: string;
  readonly changeId: string;
  readonly status: 'completed';
  readonly archivedAs: string;
}

interface RunDescriptors {
  readonly consumedRunId?: string;
  readonly reviewedRunId?: string;
  readonly sourceReviewRun?: string;
  readonly sourceReviewVerdict?: 'approved' | 'changes-requested';
}

interface SemanticInputs {
  readonly contractRefs: readonly VersionedAuthorityRef[];
  readonly handoffRefs: readonly VersionedAuthorityRef[];
  readonly reviewView?: ActionPackageReviewView;
  readonly ownerAuthorizationRefs: readonly OwnerAuthorizationRef[];
  readonly ownerFactRefs: readonly OwnerFactRef[];
  readonly verificationView?: ActionPackageVerificationView;
  readonly openSpecContext?: OpenSpecPreparedActionContextView;
  readonly externalContextFingerprint?: string;
  readonly mutationDeclaration?: MutationDeclaration;
  readonly semanticInputFingerprint: string;
}

const RUNS_PREFIX = '.flowkit/runs';
const OPEN_SPEC_CHANGE_PREFIX = 'openspec/changes';
const MANIFEST_PREFIX = 'openspec/delivery-groups';

/**
 * B1 high-level preparation surface. It is intentionally narrow: the caller
 * chooses only normal progression (`next`) or the Q1 unified explicit review
 * intent (`review`). Policy resolves the concrete formal Action.
 */
export async function prepareActionExecution(
  input: PrepareActionExecutionInput,
): Promise<PreparedActionExecution> {
  const snapshot = await readSnapshot(input.repoRoot, input.deliveryId);
  assertConflictFree(snapshot);

  // D2: bind normal preparation to the current active Change before consulting
  // Delivery-wide historical archive continuations. A checkpointed historical
  // terminal-observation (for example D1/085) must never steal D2/E1 execution.
  const change = getActiveChange(snapshot);
  if (change === null) {
    const pendingArchive = await findPersistedPendingArchive(input.repoRoot, input.deliveryId, snapshot);
    if (pendingArchive !== undefined) {
      if (input.entry !== 'next') {
        throw new FlowkitError(
          'RUN_PREPARATION_NOT_ALLOWED',
          'A persisted pending archive may only resume through the normal next entry',
        );
      }
      return resumePendingArchive(input, snapshot, pendingArchive);
    }
    throw new FlowkitError('RUN_PREPARATION_NOT_ALLOWED', 'B1 preparation requires one active Change or one relevant pending archive continuation');
  }

  const policy = input.entry === 'next' ? next(snapshot) : resolveReview(snapshot);
  if (policy.kind !== 'action') {
    throw new FlowkitError(
      'RUN_PREPARATION_NOT_ALLOWED',
      `Policy entry ${input.entry} did not resolve a Standard Change Action`,
      { entry: input.entry, policyKind: policy.kind },
    );
  }

  const action = policy.action;
  const role = expectedRoleForAction(action);
  const descriptors = deriveRunDescriptors(snapshot, change.id, action);
  const semantic = await deriveSemanticInputs(
    input.repoRoot,
    input.deliveryId,
    snapshot,
    change.id,
    action,
    descriptors,
  );

  const pending = snapshot.runs.filter(
    (run) => run.changeId === change.id && run.status === 'pending',
  );
  if (pending.length > 1) {
    throw new FlowkitError(
      'AMBIGUOUS_PENDING_RUNS',
      `Active Change has multiple pending Runs: ${pending.map((run) => run.runId).sort().join(', ')}`,
    );
  }

  if (pending.length === 1) {
    const existing = pending[0]!;
    if (existing.action !== action || existing.role !== role) {
      throw new FlowkitError(
        'PENDING_INPUT_DRIFT',
        `Pending Run ${existing.runId} does not match resolved ${action}/${role}`,
        { runId: existing.runId, pendingAction: existing.action, action, pendingRole: existing.role, role },
      );
    }
    if (existing.semanticInputFingerprint === undefined) {
      throw new FlowkitError(
        'PENDING_INPUT_FINGERPRINT_MISSING',
        `Pending Run ${existing.runId} predates B1 semantic input identity and cannot be resumed through B1 preparation`,
        { runId: existing.runId },
      );
    }
    if (existing.semanticInputFingerprint !== semantic.semanticInputFingerprint) {
      throw new FlowkitError(
        'PENDING_INPUT_DRIFT',
        `Pending Run ${existing.runId} semantic input no longer matches current formal facts`,
        {
          runId: existing.runId,
          stored: existing.semanticInputFingerprint,
          current: semantic.semanticInputFingerprint,
        },
      );
    }
    return {
      package: buildActionPackage(input.deliveryId, change.id, existing.runId, action, semantic),
      resumed: true,
      ...(semantic.openSpecContext !== undefined && { openSpecContext: semantic.openSpecContext }),
    };
  }

  const now = input.now ?? (() => new Date());
  const date = now().toISOString().slice(0, 10).replaceAll('-', '');
  const deliveryRunsDir = join(input.repoRoot, RUNS_PREFIX, input.deliveryId);
  const allocated = await allocateNextRunId(deliveryRunsDir, date, action);
  const ownerAuthorization = semantic.ownerAuthorizationRefs.length > 0 ? 'explicit' : 'not-required';

  await createRun({
    runId: allocated.runId,
    deliveryId: input.deliveryId,
    changeKey: change.key,
    changeId: change.id,
    action,
    role,
    ownerAuthorization,
    semanticInputFingerprint: semantic.semanticInputFingerprint,
    ownerFactRefs: semantic.ownerFactRefs,
    ...(action === 'archive' && semantic.openSpecContext !== undefined && {
      archiveEntryOpenSpecProjection: buildArchiveEntryOpenSpecProjection(semantic.openSpecContext),
    }),
    ...descriptors,
    constraints: constraintsForAction(action),
    actionMd: renderPreparedActionMd({
      runId: allocated.runId,
      deliveryId: input.deliveryId,
      changeKey: change.key,
      changeId: change.id,
      action,
      role,
      semanticInputFingerprint: semantic.semanticInputFingerprint,
    }),
    deliveryRunsDir,
    runsPathPrefix: RUNS_PREFIX,
    repoRoot: input.repoRoot,
  });

  return {
    package: buildActionPackage(input.deliveryId, change.id, allocated.runId, action, semantic),
    resumed: false,
    ...(semantic.openSpecContext !== undefined && { openSpecContext: semantic.openSpecContext }),
  };
}

/**
 * E1 new-execution boundary. Pending continuation is intentionally not
 * performed here: callers receive the persisted identity and must use the
 * exact-resume surface once it is available.
 */
export async function prepareNewExecution(
  input: PrepareActionExecutionInput,
): Promise<PreparedNewExecution> {
  const snapshot = await readSnapshot(input.repoRoot, input.deliveryId);
  assertConflictFree(snapshot);
  const change = getActiveChange(snapshot);
  if (change === null) {
    throw new FlowkitError('RUN_PREPARATION_NOT_ALLOWED', 'new execution preparation requires an active Change');
  }
  const policy = input.entry === 'next' ? next(snapshot) : resolveReview(snapshot);
  if (policy.kind !== 'action') {
    throw new FlowkitError('RUN_PREPARATION_NOT_ALLOWED', `Policy entry ${input.entry} did not resolve a Standard Change Action`);
  }
  const pending = snapshot.runs.filter((run) => run.changeId === change.id && run.status === 'pending');
  if (pending.length > 1) {
    throw new FlowkitError('AMBIGUOUS_PENDING_RUNS', `Active Change has multiple pending Runs: ${pending.map((run) => run.runId).sort().join(', ')}`);
  }
  if (pending.length === 1) return { kind: 'exact-resume-required', expectedRunId: pending[0]!.runId };

  const action = policy.action;
  const role = expectedRoleForAction(action);
  const descriptors = deriveRunDescriptors(snapshot, change.id, action);
  const baseSemantic = await deriveSemanticInputs(input.repoRoot, input.deliveryId, snapshot, change.id, action, descriptors);
  const entrySnapshot = await captureEntryWorkspaceSnapshot(input.repoRoot);
  const entryWorkspaceIdentity = toEntryWorkspaceIdentity(entrySnapshot);
  let mutationDeclaration: MutationDeclaration | undefined;
  let semantic = baseSemantic;
  if (action === 'apply' || action === 'revise-apply') {
    mutationDeclaration = await deriveMutationDeclaration(input.repoRoot, action, baseSemantic.contractRefs);
    semantic = withMutationDeclaration(
      baseSemantic,
      input.deliveryId,
      change.id,
      action,
      mutationDeclaration,
      entryWorkspaceIdentity,
    );
  }
  const allocated = await allocateNextRunId(join(input.repoRoot, RUNS_PREFIX, input.deliveryId), (input.now ?? (() => new Date()))().toISOString().slice(0, 10).replaceAll('-', ''), action);
  const applyEntryWorkspaceIdentity = mutationDeclaration === undefined ? undefined : entryWorkspaceIdentity;
  const actionPackage = buildActionPackageV2(
    input.deliveryId,
    change.id,
    allocated.runId,
    action,
    semantic,
    mutationDeclaration,
    applyEntryWorkspaceIdentity,
  );
  await createRun({
    runId: allocated.runId,
    deliveryId: input.deliveryId,
    changeKey: change.key,
    changeId: change.id,
    action,
    role,
    ownerAuthorization: semantic.ownerAuthorizationRefs.length > 0 ? 'explicit' : 'not-required',
    contextVersion: 5,
    canonicalBase: entrySnapshot.canonicalBase,
    applicableFactRefs: sortRefs([...semantic.contractRefs, ...semantic.handoffRefs]),
    actionPackage,
    ...(mutationDeclaration !== undefined && {
      entryWorkspaceIdentity: applyEntryWorkspaceIdentity,
      entryWorkspaceSnapshot: entrySnapshot,
      mutationDeclaration,
    }),
    semanticInputFingerprint: semantic.semanticInputFingerprint,
    ownerFactRefs: semantic.ownerFactRefs,
    ...descriptors,
    constraints: constraintsForAction(action),
    actionMd: renderPreparedActionMd({ runId: allocated.runId, deliveryId: input.deliveryId, changeKey: change.key, changeId: change.id, action, role, semanticInputFingerprint: semantic.semanticInputFingerprint }),
    deliveryRunsDir: join(input.repoRoot, RUNS_PREFIX, input.deliveryId),
    runsPathPrefix: RUNS_PREFIX,
    repoRoot: input.repoRoot,
  });
  return {
    kind: 'prepared',
    package: actionPackage,
    ...(semantic.openSpecContext !== undefined && { openSpecContext: semantic.openSpecContext }),
  };
}

function toEntryWorkspaceIdentity(snapshot: { readonly canonicalBase: string; readonly workspaceFingerprint: string }): EntryWorkspaceIdentity {
  return { canonicalBase: snapshot.canonicalBase, workspaceFingerprint: snapshot.workspaceFingerprint };
}


async function findPersistedPendingArchive(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
): Promise<ContextFile | undefined> {
  const deliveryRunsDir = join(repoRoot, RUNS_PREFIX, deliveryId);
  let changeEntries;
  try {
    changeEntries = await readdir(deliveryRunsDir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const pending: ContextFile[] = [];
  for (const changeEntry of changeEntries) {
    if (!changeEntry.isDirectory() || changeEntry.name.startsWith('.')) continue;
    const changeDir = join(deliveryRunsDir, changeEntry.name);
    let runEntries;
    try {
      runEntries = await readdir(changeDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory() || runEntry.name.startsWith('.')) continue;
      const runDir = join(changeDir, runEntry.name);
      if (await isFile(join(runDir, 'result.json'))) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(join(runDir, 'context.json'), 'utf8')) as unknown;
      } catch {
        continue;
      }
      const context = validateContextFile(parsed);
      if (context.deliveryId === deliveryId) pending.push(context);
    }
  }

  const relevantChangeIds = new Set(getCompletedUncheckpointedChanges(snapshot).map((change) => change.id));
  const archives = pending.filter(
    (context) => context.action === 'archive' && relevantChangeIds.has(context.changeId),
  );
  if (archives.length === 0) return undefined;
  if (archives.length !== 1) {
    throw new FlowkitError(
      'AMBIGUOUS_PENDING_RUNS',
      `Delivery has multiple lifecycle-relevant pending archives: ${archives.map((run) => run.runId).sort().join(', ')}`,
    );
  }
  return archives[0];
}

async function findPersistedPendingArchiveCandidates(
  repoRoot: string,
  deliveryId: string,
): Promise<readonly ContextFile[]> {
  const deliveryRunsDir = join(repoRoot, RUNS_PREFIX, deliveryId);
  let changeEntries;
  try {
    changeEntries = await readdir(deliveryRunsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const archives: ContextFile[] = [];
  for (const changeEntry of changeEntries) {
    if (!changeEntry.isDirectory() || changeEntry.name.startsWith('.')) continue;
    const changeDir = join(deliveryRunsDir, changeEntry.name);
    let runEntries;
    try {
      runEntries = await readdir(changeDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory() || runEntry.name.startsWith('.')) continue;
      const runDir = join(changeDir, runEntry.name);
      if (await isFile(join(runDir, 'result.json'))) continue;
      try {
        const context = validateContextFile(JSON.parse(await readFile(join(runDir, 'context.json'), 'utf8')) as unknown);
        if (context.deliveryId === deliveryId && context.action === 'archive') archives.push(context);
      } catch {
        // Explicit archive-terminal recovery is intentionally narrow: malformed
        // historical Runs are not silently selected as recovery candidates.
      }
    }
  }
  return archives.sort((a, b) => a.runId.localeCompare(b.runId));
}

async function resumePendingArchive(
  input: PrepareActionExecutionInput,
  snapshot: FormalFactSnapshot,
  existing: ContextFile,
): Promise<PreparedActionExecution> {
  if (await isOpenSpecThinIntegrationActive(input.repoRoot, existing.changeId)) {
    const runDir = join(input.repoRoot, existing.runPath);
    const recovery = await inspectOpenSpecArchiveRecovery(input.repoRoot, runDir);
    if (recovery === 'recovery-required') {
      throw new FlowkitError('OPENSPEC_ARCHIVE_RECOVERY_REQUIRED', `Pending archive Run ${existing.runId} requires exact mutation-surface recovery`);
    }
  }
  const recovered = await recoverPersistedPendingArchive(
    input.repoRoot,
    input.deliveryId,
    snapshot,
    existing,
  );
  assertRecoveredArchiveFingerprint(existing, recovered.semantic);

  return {
    package: buildActionPackage(
      input.deliveryId,
      existing.changeId,
      existing.runId,
      'archive',
      recovered.semantic,
    ),
    resumed: true,
    ...(recovered.semantic.openSpecContext !== undefined && { openSpecContext: recovered.semantic.openSpecContext }),
  };
}

async function inspectPersistedPendingArchive(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  existing: ContextFile,
): Promise<PreparedRunInspection> {
  const base = {
    runId: existing.runId,
    action: 'archive' as const,
    role: existing.role === 'author' ? 'author' as const : 'reviewer' as const,
  };
  if (existing.role !== 'author') return { ...base, status: 'not-resumable' };
  if (await isOpenSpecThinIntegrationActive(repoRoot, existing.changeId)) {
    const recovery = await inspectOpenSpecArchiveRecovery(repoRoot, join(repoRoot, existing.runPath));
    if (recovery === 'recovery-required') return { ...base, status: 'recovery-required' };
    if (recovery === 'known-success' || recovery === 'terminalizable-failure') return { ...base, status: 'terminal-observation' };
  }
  if (existing.semanticInputFingerprint === undefined) {
    return { ...base, status: 'fingerprint-missing' };
  }

  try {
    const recovered = await recoverPersistedPendingArchive(repoRoot, deliveryId, snapshot, existing);
    return {
      ...base,
      status: recovered.semantic.semanticInputFingerprint === existing.semanticInputFingerprint
        ? 'resumable'
        : 'input-drift',
    };
  } catch {
    return { ...base, status: 'not-resumable' };
  }
}

async function reconstructPersistedArchiveOpenSpecContext(
  repoRoot: string,
  existing: ContextFile,
): Promise<OpenSpecPreparedActionContextView | undefined> {
  if (existing.action !== 'archive') return undefined;

  if (existing.archiveEntryOpenSpecProjection !== undefined) {
    const currentVersion = await new OpenSpecCliAdapter({ repoRoot }).getVersion();
    if (currentVersion !== existing.archiveEntryOpenSpecProjection.version) {
      throw new FlowkitError(
        'PENDING_INPUT_DRIFT',
        `OpenSpec version changed after archive entry (${existing.archiveEntryOpenSpecProjection.version} → ${currentVersion})`,
        { runId: existing.runId },
      );
    }
    return openSpecContextFromArchiveProjection(existing.archiveEntryOpenSpecProjection);
  }

  // Historical v2/v3 archives predate the D2 keyed projection. Only a durable
  // known-success observation may use the bounded legacy reconstruction path;
  // ordinary pre-mutation pending archives keep the original active-status path.
  const terminal = existing.archiveMutationGuard?.terminalObservation?.normalized;
  if ((existing.schemaVersion === 2 || existing.schemaVersion === 3) && terminal?.kind === 'success') {
    return reconstructLegacyArchiveOpenSpecContext(repoRoot, existing);
  }
  return undefined;
}

async function reconstructLegacyArchiveOpenSpecContext(
  repoRoot: string,
  existing: ContextFile,
): Promise<OpenSpecPreparedActionContextView> {
  const guard = existing.archiveMutationGuard;
  const terminal = guard?.terminalObservation?.normalized;
  if (guard === undefined || terminal?.kind !== 'success') {
    throw new FlowkitError('OPENSPEC_ARCHIVE_RESULT_NOT_ADMISSIBLE', 'legacy archive reconstruction requires a durable success observation');
  }
  if (terminal.change !== existing.changeId) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'legacy archive observation change identity mismatch', {
      runId: existing.runId, expected: existing.changeId, actual: terminal.change,
    });
  }
  const expectedArchivePath = `${OPEN_SPEC_CHANGE_PREFIX}/archive/${terminal.archivedAs}`;
  const archivedPath = normalizeSeparators(terminal.path);
  if (
    archivedPath !== expectedArchivePath
    || archivedPath.startsWith('/')
    || archivedPath.includes('\\')
    || archivedPath.split('/').some((part) => part === '' || part === '..' || part === '.')
  ) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'legacy archive observation path identity is not safely reconstructable', {
      runId: existing.runId, path: terminal.path, expectedArchivePath,
    });
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'flowkit-archive-terminal-'));
  try {
    const configSource = join(repoRoot, 'openspec/config.yaml');
    const configTarget = join(tempRoot, 'openspec/config.yaml');
    await mkdir(join(tempRoot, 'openspec/changes'), { recursive: true });
    if (await isFile(configSource)) {
      await mkdir(join(tempRoot, 'openspec'), { recursive: true });
      await cp(configSource, configTarget);
    }
    const archivedSource = join(repoRoot, archivedPath);
    if (!(await isDirectory(archivedSource))) {
      throw new FlowkitError('PENDING_INPUT_DRIFT', 'legacy archive observation target is missing', {
        runId: existing.runId, archivedPath,
      });
    }
    const tempChangeRoot = join(tempRoot, guard.changeRoot);
    await mkdir(join(tempChangeRoot, '..'), { recursive: true });
    await cp(archivedSource, tempChangeRoot, { recursive: true, force: false });

    const adapter = new OpenSpecCliAdapter({ repoRoot: tempRoot });
    const version = await adapter.getVersion();
    const status = await adapter.getChangeStatus(existing.changeId);
    if (status.changeId !== existing.changeId || status.changeRootLogical !== guard.changeRoot) {
      throw new FlowkitError('PENDING_INPUT_DRIFT', 'legacy disposable OpenSpec status returned a different Change identity', {
        runId: existing.runId,
        expectedChangeId: existing.changeId,
        actualChangeId: status.changeId,
        expectedChangeRoot: guard.changeRoot,
        actualChangeRoot: status.changeRootLogical,
      });
    }
    return {
      version,
      changeId: existing.changeId,
      changeRootLogical: status.changeRootLogical,
      artifactPaths: Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => [
        artifactId,
        [...status.artifactPaths[artifactId].logicalPaths].map(normalizeSeparators).sort(),
      ])) as unknown as Readonly<Record<(typeof OPENSPEC_SUPPORTED_ARTIFACT_IDS)[number], readonly string[]>>,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function recoverPersistedPendingArchive(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  existing: ContextFile,
): Promise<{ readonly semantic: SemanticInputs; readonly run: RunFact }> {
  if (existing.role !== 'author') {
    throw new FlowkitError(
      'PENDING_INPUT_DRIFT',
      `Pending archive Run ${existing.runId} has unexpected role ${existing.role}`,
    );
  }
  if (existing.semanticInputFingerprint === undefined) {
    throw new FlowkitError(
      'PENDING_INPUT_FINGERPRINT_MISSING',
      `Pending Run ${existing.runId} predates B1 semantic input identity and cannot be resumed`,
      { runId: existing.runId },
    );
  }

  const recovered = await readPersistedChangeLineage(repoRoot, deliveryId, existing.changeId);
  const run = recovered.runs.find((candidate) => candidate.runId === existing.runId);
  if (run === undefined || run.status !== 'pending' || run.action !== 'archive') {
    throw new FlowkitError(
      'RUN_NOT_PENDING',
      `Persisted archive Run ${existing.runId} is not the pending archive execution`,
    );
  }
  const recoverySnapshot: FormalFactSnapshot = {
    ...snapshot,
    runs: recovered.runs,
    reviewVerdicts: recovered.reviewVerdicts,
  };
  const descriptors = deriveRunDescriptors(recoverySnapshot, existing.changeId, 'archive');
  const archiveOpenSpecContext = await reconstructPersistedArchiveOpenSpecContext(repoRoot, existing);
  const semantic = await deriveSemanticInputs(
    repoRoot,
    deliveryId,
    recoverySnapshot,
    existing.changeId,
    'archive',
    descriptors,
    archiveOpenSpecContext,
  );
  return { semantic, run };
}

function assertRecoveredArchiveFingerprint(existing: ContextFile, semantic: SemanticInputs): void {
  if (semantic.semanticInputFingerprint !== existing.semanticInputFingerprint) {
    throw new FlowkitError(
      'PENDING_INPUT_DRIFT',
      `Pending archive Run ${existing.runId} semantic input no longer matches its entry authority generation`,
      {
        runId: existing.runId,
        stored: existing.semanticInputFingerprint,
        current: semantic.semanticInputFingerprint,
      },
    );
  }
}


async function readPersistedChangeLineage(
  repoRoot: string,
  deliveryId: string,
  changeId: string,
): Promise<{
  readonly runs: readonly RunFact[];
  readonly reviewVerdicts: readonly ReviewVerdictFact[];
}> {
  const changeDir = join(repoRoot, RUNS_PREFIX, deliveryId, changeId);
  let entries;
  try {
    entries = await readdir(changeDir, { withFileTypes: true });
  } catch {
    throw new FlowkitError(
      'RUN_PREPARATION_BINDING_MISSING',
      `Cannot recover persisted Run lineage for archive Change ${changeId}`,
    );
  }

  const runs: RunFact[] = [];
  const reviewVerdicts: ReviewVerdictFact[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const runDir = join(changeDir, entry.name);
    let parsedContext: unknown;
    try {
      parsedContext = JSON.parse(await readFile(join(runDir, 'context.json'), 'utf8')) as unknown;
    } catch {
      continue;
    }
    const context = validateContextFile(parsedContext);
    if (context.deliveryId !== deliveryId || context.changeId !== changeId) continue;

    let status: RunFact['status'] = 'pending';
    const resultPath = join(runDir, 'result.json');
    if (await isFile(resultPath)) {
      const raw = await readFile(resultPath, 'utf8');
      const result = admitC1RunResultForReader(raw, context.action, {
        runId: context.runId,
        deliveryId: context.deliveryId,
        changeId: context.changeId,
      });
      status = result.runStatus;
      if (
        context.action.startsWith('review-')
        && result.reviewVerdict !== undefined
        && context.reviewedRunId !== undefined
      ) {
        const blockingAuthorities = [...new Set(
          (result.reviewFindings ?? [])
            .filter((finding) => finding.severity === 'blocking' && finding.blockingAuthority !== undefined)
            .map((finding) => finding.blockingAuthority!),
        )].sort();
        reviewVerdicts.push({
          reviewRunId: context.runId,
          verdict: result.reviewVerdict,
          reviewedRunId: context.reviewedRunId,
          blockingAuthorities,
        });
      }
    }

    runs.push({
      runId: context.runId,
      deliveryId: context.deliveryId,
      changeId: context.changeId,
      action: context.action,
      role: context.role,
      status,
      ...(context.semanticInputFingerprint !== undefined && {
        semanticInputFingerprint: context.semanticInputFingerprint,
      }),
      ...(context.ownerFactRefs !== undefined && { ownerFactRefs: context.ownerFactRefs }),
      ...(context.sourceReviewRun !== undefined && { sourceReviewRun: context.sourceReviewRun }),
      ...(context.sourceReviewVerdict !== undefined && { sourceReviewVerdict: context.sourceReviewVerdict }),
      ...(context.reviewedRunId !== undefined && { reviewedRunId: context.reviewedRunId }),
    });
  }

  return { runs, reviewVerdicts };
}

/**
 * B1 logical result admission. Caller-owned result fields stay logical; Core
 * re-validates pending/action/role/current semantic identity and then delegates
 * to descriptor-driven `completeRun()`, which remains the sole physical
 * terminal publisher and ResultRef authority.
 */
/**
 * D1 narrow reset-vs-pending recovery surface.
 *
 * This is deliberately not a generic Run cancellation API. It may cancel the
 * active Change's sole pending Standard Run only when recomputing the Run's
 * original semantic identity against current formal facts proves that the
 * *only* drift is the applicable structured Owner Contract Reset projection.
 * All other drift remains fail-closed.
 */
export async function recoverContractResetPendingRun(
  input: RecoverContractResetPendingInput,
): Promise<RecoverContractResetPendingResult> {
  const snapshot = await readSnapshot(input.repoRoot, input.deliveryId);
  assertConflictFree(snapshot);
  const change = getActiveChange(snapshot);
  if (change === null) {
    throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Contract Reset pending recovery requires one active Change');
  }
  const pending = snapshot.runs.filter((run) => run.changeId === change.id && run.status === 'pending');
  if (pending.length !== 1) {
    throw new FlowkitError(
      'RESET_PENDING_RECOVERY_NOT_ALLOWED',
      `Contract Reset pending recovery requires exactly one pending Run; found ${pending.length}`,
      { changeId: change.id, pendingRunIds: pending.map((run) => run.runId).sort() },
    );
  }

  const run = pending[0]!;
  const runDir = join(input.repoRoot, RUNS_PREFIX, input.deliveryId, change.id, run.runId);
  const context = await readContextFile(runDir);
  if (!(await isContractResetOnlyPendingDrift(input.repoRoot, input.deliveryId, snapshot, change.id, context))) {
    throw new FlowkitError(
      'RESET_PENDING_RECOVERY_NOT_ALLOWED',
      `Pending Run ${run.runId} is not stale solely because of an applicable Owner Contract Reset`,
      { runId: run.runId, action: run.action },
    );
  }

  const cancellationReason = 'superseded-by-owner-contract-reset' as const;
  await completeRun(runDir, { cancellationReason });
  return { runId: run.runId, action: run.action, status: 'cancelled', cancellationReason };
}

/**
 * D2 bounded recovery for a durable known-success archive terminal observation.
 * This is not a generic Run completion API: callers cannot choose a Run or
 * provide a terminal payload, and OpenSpec archive is never respawned here.
 */
export async function recoverArchiveTerminalRun(
  input: RecoverArchiveTerminalInput,
): Promise<RecoverArchiveTerminalResult> {
  const snapshot = await readSnapshot(input.repoRoot, input.deliveryId);
  assertConflictFree(snapshot);
  const candidates = await findPersistedPendingArchiveCandidates(input.repoRoot, input.deliveryId);
  const eligible: ContextFile[] = [];
  for (const candidate of candidates) {
    const guard = candidate.archiveMutationGuard;
    if (guard?.terminalObservation?.normalized.kind !== 'success') continue;
    const classification = await inspectOpenSpecArchiveRecovery(
      input.repoRoot,
      join(input.repoRoot, candidate.runPath),
    );
    if (classification === 'known-success') eligible.push(candidate);
  }
  if (eligible.length !== 1) {
    throw new FlowkitError(
      'OPENSPEC_ARCHIVE_TERMINAL_RECOVERY_NOT_ALLOWED',
      `archive-terminal recovery requires exactly one durable known-success pending archive; found ${eligible.length}`,
      { candidateRunIds: eligible.map((candidate) => candidate.runId) },
    );
  }

  const existing = eligible[0]!;
  const recovered = await recoverPersistedPendingArchive(
    input.repoRoot,
    input.deliveryId,
    snapshot,
    existing,
  );
  assertRecoveredArchiveFingerprint(existing, recovered.semantic);
  const terminal = existing.archiveMutationGuard!.terminalObservation!.normalized;
  if (terminal.kind !== 'success') {
    throw new FlowkitError('OPENSPEC_ARCHIVE_TERMINAL_RECOVERY_NOT_ALLOWED', 'eligible archive lost its success observation');
  }

  const descriptors = descriptorsFromContext(existing);
  await completeRun(join(input.repoRoot, existing.runPath), {
    executionStatus: 'completed',
    summary: `OpenSpec archive completed as ${terminal.archivedAs}`,
    ...(descriptors.consumedRunId !== undefined && { consumedRunIds: [descriptors.consumedRunId] }),
  });
  return {
    runId: existing.runId,
    changeId: existing.changeId,
    status: 'completed',
    archivedAs: terminal.archivedAs,
  };
}

export async function admitActionResult(input: AdmitActionResultInput): Promise<void> {
  const pkg = input.actionPackage;
  const openSpecAdapter = input.openSpecAdapter ?? new OpenSpecCliAdapter({ repoRoot: input.repoRoot });
  if (pkg.run.deliveryId !== input.deliveryId) {
    throw new FlowkitError('ACTION_PACKAGE_IDENTITY_MISMATCH', 'Action Package Delivery mismatch');
  }
  const definition = getActionDefinition(pkg.run.action);
  if (stableStringify(definition) !== stableStringify(pkg.definition)) {
    throw new FlowkitError('ACTION_PACKAGE_DEFINITION_MISMATCH', 'Action Package definition differs from fixed catalog');
  }
  if (pkg.run.role !== definition.role) {
    throw new FlowkitError('ACTION_ROLE_MISMATCH', `Action ${pkg.run.action} requires role ${definition.role}`);
  }

  const runDir = join(
    input.repoRoot,
    RUNS_PREFIX,
    input.deliveryId,
    pkg.run.changeId,
    pkg.run.runId,
  );
  const context = await readContextFile(runDir);
  if (
    context.runId !== pkg.run.runId ||
    context.deliveryId !== pkg.run.deliveryId ||
    context.changeId !== pkg.run.changeId ||
    context.action !== pkg.run.action ||
    context.role !== pkg.run.role
  ) {
    throw new FlowkitError('ACTION_PACKAGE_IDENTITY_MISMATCH', 'Action Package does not match persisted pending Run');
  }
  if (context.semanticInputFingerprint === undefined) {
    throw new FlowkitError('PENDING_INPUT_FINGERPRINT_MISSING', `Run ${context.runId} has no B1 semantic fingerprint`);
  }
  if (context.semanticInputFingerprint !== pkg.run.semanticInputFingerprint) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'Action Package fingerprint differs from persisted pending Run');
  }
  if (stableStringify(pkg.requiredResultContract) !== stableStringify(definition.terminalContract)) {
    throw new FlowkitError(
      'ACTION_PACKAGE_RESULT_CONTRACT_MISMATCH',
      'Action Package requiredResultContract differs from fixed ActionDefinition terminal contract',
    );
  }
  const packageSemanticFingerprint = fingerprintActionPackageSemantics(pkg);
  if (packageSemanticFingerprint !== context.semanticInputFingerprint) {
    throw new FlowkitError(
      'PENDING_INPUT_DRIFT',
      'Action Package semantic content does not match the persisted pending Run fingerprint',
      {
        runId: context.runId,
        stored: context.semanticInputFingerprint,
        packageSemanticFingerprint,
      },
    );
  }

  const snapshot = await readSnapshot(input.repoRoot, input.deliveryId);
  assertConflictFree(snapshot);

  // Owner authority remains Manifest.ownerDecisions. Run context and the Action
  // Package carry only a bounded, re-verifiable projection. Re-check that the
  // projection prepared at entry still equals the current applicable Owner
  // facts without recomputing Action-owned mutable outputs.
  const persistedOwnerFacts = [...(context.ownerFactRefs ?? [])].sort((a, b) => a.ref.localeCompare(b.ref));
  const packageOwnerFacts = [...(pkg.ownerFactRefs ?? [])].sort((a, b) => a.ref.localeCompare(b.ref));
  if (stableStringify(persistedOwnerFacts) !== stableStringify(packageOwnerFacts)) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'Action Package Owner fact projection differs from persisted pending Run');
  }
  const currentOwnerFacts = collectApplicableOwnerFactRefs(snapshot, pkg.run.changeId);
  if (stableStringify(currentOwnerFacts) !== stableStringify(persistedOwnerFacts)) {
    throw new FlowkitError(
      'PENDING_INPUT_DRIFT',
      'Applicable Owner facts changed after Action preparation',
      { runId: context.runId },
    );
  }

  const c1OpenSpecActive = await isOpenSpecThinIntegrationActive(input.repoRoot, pkg.run.changeId);
  if (c1OpenSpecActive && (pkg.run.action === 'propose' || pkg.run.action === 'revise-propose')
      && input.result.failureDiagnosis === undefined && input.result.cancellationReason === undefined) {
    const validation = await openSpecAdapter.validateChange(pkg.run.changeId, true);
    if (!validation.valid) {
      throw new FlowkitError('OPENSPEC_STRICT_VALIDATION_FAILED', `OpenSpec strict validation failed before ${pkg.run.action} terminal admission`, {
        changeId: pkg.run.changeId, issues: validation.issues, status: validation.status,
      });
    }
  }

  if (pkg.run.action === 'archive') {
    // D2: bind terminal admission to the exact persisted archive Run from the
    // Action Package, not to a Delivery-wide historical pending-Run scan.
    // Post-relocation semantic reconstruction uses the Run's entry projection
    // (or the bounded pre-D2 legacy adapter) and never requires active status.
    const recovered = await recoverPersistedPendingArchive(
      input.repoRoot,
      input.deliveryId,
      snapshot,
      context,
    );
    assertRecoveredArchiveFingerprint(context, recovered.semantic);
    if (c1OpenSpecActive) {
      const recovery = await inspectOpenSpecArchiveRecovery(input.repoRoot, runDir);
      if (recovery !== 'known-success') {
        throw new FlowkitError('OPENSPEC_ARCHIVE_RESULT_NOT_ADMISSIBLE', 'archive completion requires durable structured success plus post-invocation mutation-surface drift', { recovery });
      }
    }
  } else {
    const change = getActiveChange(snapshot);
    if (change === null || change.id !== pkg.run.changeId) {
      throw new FlowkitError('PENDING_INPUT_DRIFT', 'Prepared Run is no longer bound to the active Change');
    }
    const run = snapshot.runs.find((candidate) => candidate.runId === pkg.run.runId);
    if (run === undefined || run.status !== 'pending') {
      throw new FlowkitError('RUN_NOT_PENDING', `Run ${pkg.run.runId} is not pending`);
    }
  }

  if (context.schemaVersion === 5 && (pkg.run.action === 'apply' || pkg.run.action === 'revise-apply')) {
    await publishV5ApplyVerificationSelection({
      repoRoot: input.repoRoot,
      runDir,
      context,
      actionPackage: pkg as ActionPackageV2Apply,
      openSpecAdapter,
    });
  }

  // Do not recompute the entry fingerprint from the post-execution working tree.
  // The current Action may legitimately mutate its own output artifacts (for
  // example Apply updates tasks/verification), so hashing those current bytes
  // here would make a successful execution invalidate its own prepared input.
  // Entry-time drift is guarded by prepare/resume; terminal admission instead
  // exact-matches the persisted package fingerprint and delegates authoritative
  // reviewed/source-review/verification binding checks to completeRun().
  validateLogicalResultInput(pkg.run.action, input.result);
  await completeRun(runDir, logicalToCompleteRunInput(input.result));
}

async function publishV5ApplyVerificationSelection(input: {
  readonly repoRoot: string;
  readonly runDir: string;
  readonly context: ContextFile;
  readonly actionPackage: ActionPackageV2Apply;
  readonly openSpecAdapter: OpenSpecCliAdapter;
}): Promise<void> {
  const expectedVerificationPath = join(input.repoRoot, 'openspec', 'changes', input.context.changeId, 'verification.md');
  if (await validatePublishedVerificationSelection({
    runDir: input.runDir,
    canonicalVerificationPath: expectedVerificationPath,
    producingRunId: input.context.runId,
  })) return;
  let entryRaw: unknown;
  try {
    entryRaw = JSON.parse(await readFile(join(input.runDir, 'entry-workspace.json'), 'utf8')) as unknown;
  } catch (error) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_ENTRY_MISSING', 'v5 Apply terminal publication requires its immutable entry workspace record', {
      runId: input.context.runId,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  const entry = validateEntryWorkspaceSnapshotRecord(entryRaw);
  if (
    entry.canonicalBase !== input.actionPackage.entryWorkspaceIdentity.canonicalBase ||
    entry.workspaceFingerprint !== input.actionPackage.entryWorkspaceIdentity.workspaceFingerprint
  ) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_ENTRY_MISMATCH', 'v5 Apply entry workspace record does not match persisted ActionPackage', {
      runId: input.context.runId,
    });
  }
  const postAction = await captureEntryWorkspaceSnapshot(input.repoRoot);
  const observation = derivePostActionChangeObservation(
    entry,
    entry,
    postAction,
    input.actionPackage.mutationDeclaration,
  );
  const projection = await input.openSpecAdapter.createOperationProjection(input.context.changeId);
  const selection = buildVerificationSelection(
    observation.actualChangeSet,
    projection.status.artifactPaths.specs.logicalPaths,
  );
  const record = buildVerificationSelectionPublication({
    producingRunId: input.context.runId,
    producingSemanticInputFingerprint: input.actionPackage.run.semanticInputFingerprint,
    canonicalBase: entry.canonicalBase,
    entryWorkspaceIdentity: {
      schemaVersion: 1,
      canonicalBase: entry.canonicalBase,
      workspaceFingerprint: entry.workspaceFingerprint,
    },
    postActionWorkspaceFingerprint: postAction.workspaceFingerprint,
    actualChangeSet: observation.actualChangeSet,
    selection,
    verificationMarkdownLogicalRef: `openspec/changes/${input.context.changeId}/verification.md`,
  });
  await publishVerificationSelection({
    runDir: input.runDir,
    canonicalVerificationPath: join(projection.status.changeRoot, 'verification.md'),
    record,
  });
}

function descriptorsFromContext(context: ContextFile): RunDescriptors {
  const inputRunId = context.inputRef?.kind === 'run-result'
    ? context.inputRef.ref.match(/\/([^/]+)\/result\.json$/)?.[1]
    : undefined;
  const consumesInputRun = !context.action.startsWith('review-') && !context.action.startsWith('revise-');
  return {
    ...(consumesInputRun && inputRunId !== undefined && { consumedRunId: inputRunId }),
    ...(context.reviewedRunId !== undefined && { reviewedRunId: context.reviewedRunId }),
    ...(context.sourceReviewRun !== undefined && { sourceReviewRun: context.sourceReviewRun }),
    ...(context.sourceReviewVerdict !== undefined && { sourceReviewVerdict: context.sourceReviewVerdict }),
  };
}

async function isContractResetOnlyPendingDrift(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  changeId: string,
  context: ContextFile,
): Promise<boolean> {
  if (context.changeId !== changeId || context.semanticInputFingerprint === undefined) return false;
  const frozenOwnerFacts = [...(context.ownerFactRefs ?? [])].sort((a, b) => a.ref.localeCompare(b.ref));
  const currentOwnerFacts = [...collectApplicableOwnerFactRefs(snapshot, changeId)].sort((a, b) => a.ref.localeCompare(b.ref));
  if (stableStringify(frozenOwnerFacts) === stableStringify(currentOwnerFacts)) return false;

  const frozenResetRefs = frozenOwnerFacts.filter((fact) => fact.decision === 'contract-reset').map((fact) => fact.ref).sort();
  const currentResetRefs = currentOwnerFacts.filter((fact) => fact.decision === 'contract-reset').map((fact) => fact.ref).sort();
  if (stableStringify(frozenResetRefs) === stableStringify(currentResetRefs)) return false;

  const semantic = await deriveSemanticInputs(
    repoRoot,
    deliveryId,
    snapshot,
    changeId,
    context.action,
    descriptorsFromContext(context),
  );
  if (semantic.semanticInputFingerprint === context.semanticInputFingerprint) return false;

  const resetNeutralFingerprint = sha256(stableStringify(buildSemanticDescriptor({
    deliveryId,
    changeId,
    action: context.action,
    definition: getActionDefinition(context.action),
    contractRefs: semantic.contractRefs,
    handoffRefs: semantic.handoffRefs,
    ...(semantic.reviewView !== undefined && { reviewView: semantic.reviewView }),
    ownerAuthorizationRefs: semantic.ownerAuthorizationRefs,
    ownerFactRefs: frozenOwnerFacts,
    ...(semantic.verificationView !== undefined && { verificationView: semantic.verificationView }),
    ...(semantic.externalContextFingerprint !== undefined && { externalContextFingerprint: semantic.externalContextFingerprint }),
  })));
  return resetNeutralFingerprint === context.semanticInputFingerprint;
}

function buildActionPackage(
  deliveryId: string,
  changeId: string,
  runId: string,
  action: ChangeAction,
  semantic: SemanticInputs,
): ActionPackageV1 {
  const definition = getActionDefinition(action);
  return {
    schemaVersion: 1,
    run: {
      deliveryId,
      changeId,
      runId,
      action,
      role: definition.role,
      semanticInputFingerprint: semantic.semanticInputFingerprint,
    },
    definition,
    contractRefs: semantic.contractRefs,
    handoffRefs: semantic.handoffRefs,
    ...(semantic.reviewView !== undefined && { reviewView: semantic.reviewView }),
    ownerAuthorizationRefs: semantic.ownerAuthorizationRefs,
    ownerFactRefs: semantic.ownerFactRefs,
    ...(semantic.verificationView !== undefined && { verificationView: semantic.verificationView }),
    ...(semantic.externalContextFingerprint !== undefined && { externalContextFingerprint: semantic.externalContextFingerprint }),
    requiredResultContract: definition.terminalContract,
  };
}

function buildActionPackageV2(
  deliveryId: string,
  changeId: string,
  runId: string,
  action: ChangeAction,
  semantic: SemanticInputs,
  mutationDeclaration: MutationDeclaration | undefined,
  entryWorkspaceIdentity: EntryWorkspaceIdentity | undefined,
): ActionPackageV2 {
  const common = <T extends ChangeAction>(resolvedAction: T) => ({
    schemaVersion: 2 as const,
    run: { deliveryId, changeId, runId, action: resolvedAction, role: getActionDefinition(resolvedAction).role, semanticInputFingerprint: semantic.semanticInputFingerprint },
    definition: getActionDefinition(resolvedAction),
    contractRefs: semantic.contractRefs,
    handoffRefs: semantic.handoffRefs,
    ...(semantic.reviewView !== undefined && { reviewView: semantic.reviewView }),
    ownerAuthorizationRefs: semantic.ownerAuthorizationRefs,
    ownerFactRefs: semantic.ownerFactRefs,
    ...(semantic.verificationView !== undefined && { verificationView: semantic.verificationView }),
    ...(semantic.externalContextFingerprint !== undefined && { externalContextFingerprint: semantic.externalContextFingerprint }),
    requiredResultContract: getActionDefinition(resolvedAction).terminalContract,
  });
  if (action === 'apply' || action === 'revise-apply') {
    if (mutationDeclaration === undefined || entryWorkspaceIdentity === undefined) {
      throw new FlowkitError('ACTION_PACKAGE_SCHEMA_MISMATCH', 'v2 Apply package requires entry workspace identity and mutation declaration');
    }
    return { ...common(action), entryWorkspaceIdentity, mutationDeclaration } as ActionPackageV2Apply;
  }
  if (mutationDeclaration !== undefined || entryWorkspaceIdentity !== undefined) {
    throw new FlowkitError('ACTION_PACKAGE_SCHEMA_MISMATCH', 'non-Apply v2 package must not carry Apply authority');
  }
  return common(action) as ActionPackageV2NonApply;
}

function withMutationDeclaration(
  semantic: SemanticInputs,
  deliveryId: string,
  changeId: string,
  action: 'apply' | 'revise-apply',
  mutationDeclaration: MutationDeclaration,
  entryWorkspaceIdentity: EntryWorkspaceIdentity,
): SemanticInputs {
  const definition = getActionDefinition(action);
  return {
    ...semantic,
    mutationDeclaration,
    semanticInputFingerprint: sha256(stableStringify(buildV2ApplySemanticDescriptor({
      deliveryId,
      changeId,
      action,
      definition,
      contractRefs: semantic.contractRefs,
      handoffRefs: semantic.handoffRefs,
      ...(semantic.reviewView !== undefined && { reviewView: semantic.reviewView }),
      ownerAuthorizationRefs: semantic.ownerAuthorizationRefs,
      ownerFactRefs: semantic.ownerFactRefs,
      ...(semantic.verificationView !== undefined && { verificationView: semantic.verificationView }),
      ...(semantic.externalContextFingerprint !== undefined && { externalContextFingerprint: semantic.externalContextFingerprint }),
      entryWorkspaceIdentity,
      mutationDeclaration,
    }))),
  };
}

export async function buildOpenSpecPreparedActionContext(
  repoRoot: string,
  changeId: string,
  action: ChangeAction,
  adapter: OpenSpecCliAdapter = new OpenSpecCliAdapter({ repoRoot }),
): Promise<OpenSpecPreparedActionContextView | undefined> {
  if (!(await isOpenSpecThinIntegrationActive(repoRoot, changeId))) return undefined;

  const projection = await adapter.createOperationProjection(changeId, {
    ...(action === 'propose' || action === 'revise-propose'
      ? { artifactInstructionIds: OPENSPEC_SUPPORTED_ARTIFACT_IDS }
      : {}),
    ...(action === 'apply' || action === 'revise-apply'
      ? { includeStrictValidation: true, includeApplyInstructions: true }
      : {}),
  });
  const { version, status } = projection;
  const base = {
    version,
    changeId,
    changeRootLogical: status.changeRootLogical,
    artifactPaths: Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => [
      artifactId,
      [...status.artifactPaths[artifactId].logicalPaths],
    ])) as unknown as Readonly<Record<(typeof OPENSPEC_SUPPORTED_ARTIFACT_IDS)[number], readonly string[]>>,
  };

  if (action === 'propose' || action === 'revise-propose') {
    if (projection.artifactInstructions === undefined) {
      throw new FlowkitError('OPENSPEC_OPERATION_PROJECTION_INCOMPLETE', 'OpenSpec proposal projection omitted artifact instructions', { changeId, action });
    }
    return { ...base, artifactInstructions: projection.artifactInstructions };
  }

  if (action === 'apply' || action === 'revise-apply') {
    const validation = projection.validation;
    if (validation === undefined || projection.applyInstructions === undefined) {
      throw new FlowkitError('OPENSPEC_OPERATION_PROJECTION_INCOMPLETE', 'OpenSpec Apply projection omitted required views', { changeId, action });
    }
    if (!validation.valid) {
      throw new FlowkitError('OPENSPEC_STRICT_VALIDATION_FAILED', `OpenSpec strict validation failed before ${action}`, {
        changeId, issues: validation.issues, status: validation.status,
      });
    }
    return { ...base, applyInstructions: projection.applyInstructions };
  }

  return base;
}


export function buildArchiveEntryOpenSpecProjection(
  view: OpenSpecPreparedActionContextView,
): ArchiveEntryOpenSpecProjection {
  return {
    projectionVersion: 1,
    version: view.version,
    changeId: view.changeId,
    changeRootLogical: normalizeSeparators(view.changeRootLogical),
    artifactPaths: Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => [
      artifactId,
      [...view.artifactPaths[artifactId]].map(normalizeSeparators).sort(),
    ])) as unknown as Readonly<Record<(typeof OPENSPEC_SUPPORTED_ARTIFACT_IDS)[number], readonly string[]>>,
  };
}

function openSpecContextFromArchiveProjection(
  projection: ArchiveEntryOpenSpecProjection,
): OpenSpecPreparedActionContextView {
  return {
    version: projection.version,
    changeId: projection.changeId,
    changeRootLogical: projection.changeRootLogical,
    artifactPaths: Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => [
      artifactId,
      [...projection.artifactPaths[artifactId]],
    ])) as unknown as Readonly<Record<(typeof OPENSPEC_SUPPORTED_ARTIFACT_IDS)[number], readonly string[]>>,
  };
}

export function fingerprintOpenSpecPreparedActionContext(
  view: OpenSpecPreparedActionContextView | undefined,
  action?: ChangeAction,
): string | undefined {
  if (view === undefined) return undefined;
  // Compatibility: callers that do not identify an Action retain the C1/B1
  // raw-context digest. New prepared Runs always provide the Action and use
  // the D1 action-sensitive semantic projection below.
  if (action === undefined) return sha256(stableStringify(view));
  return sha256(stableStringify(projectOpenSpecSemanticContext(view, action)));
}

function projectOpenSpecSemanticContext(
  view: OpenSpecPreparedActionContextView,
  action: ChangeAction,
): unknown {
  const identity = {
    version: view.version,
    changeId: view.changeId,
    changeRootLogical: view.changeRootLogical,
  };

  if (action === 'propose' || action === 'revise-propose') {
    const instructions = view.artifactInstructions;
    if (instructions === undefined) return identity;
    return {
      ...identity,
      artifactInstructions: Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => {
        const instruction = instructions[artifactId];
        return [artifactId, {
          changeId: instruction.changeId,
          artifactId: instruction.artifactId,
          schemaName: instruction.schemaName,
          resolvedOutputLogicalPath: instruction.resolvedOutputLogicalPath,
          dependencies: [...instruction.dependencies].sort(),
          unlocks: [...instruction.unlocks].sort(),
          instruction: instruction.instruction,
          template: instruction.template,
        }];
      })),
    };
  }

  if (action === 'apply' || action === 'revise-apply') {
    const apply = view.applyInstructions;
    if (apply === undefined) return identity;
    return {
      ...identity,
      applyInstructions: {
        changeId: apply.changeId,
        schemaName: apply.schemaName,
        contextFiles: Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => [
          artifactId,
          [...apply.contextFiles[artifactId]].sort(),
        ])),
      },
    };
  }

  return view;
}

async function deriveSemanticInputs(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: ChangeAction,
  descriptors: RunDescriptors,
  archiveOpenSpecContextOverride?: OpenSpecPreparedActionContextView,
): Promise<SemanticInputs> {
  const definition = getActionDefinition(action);
  const contractRefs = await collectContractRefs(
    repoRoot,
    deliveryId,
    snapshot,
    changeId,
    action,
    archiveOpenSpecContextOverride,
  );
  const handoffRefs = await collectHandoffRefs(repoRoot, deliveryId, changeId, descriptors);
  const reviewView = await buildRelevantReviewView(repoRoot, deliveryId, snapshot, changeId, action, descriptors);
  const ownerAuthorizationRefs = collectApplicableOwnerRefs(snapshot, changeId, action);
  const ownerFactRefs = collectApplicableOwnerFactRefs(snapshot, changeId);
  const verificationView = await buildVerificationView(
    repoRoot,
    deliveryId,
    snapshot,
    changeId,
    action,
    descriptors,
  );
  const openSpecContext = archiveOpenSpecContextOverride ?? await buildOpenSpecPreparedActionContext(repoRoot, changeId, action);
  const externalContextFingerprint = fingerprintOpenSpecPreparedActionContext(openSpecContext, action);

  const semanticInputFingerprint = sha256(stableStringify(buildSemanticDescriptor({
    deliveryId,
    changeId,
    action,
    definition,
    contractRefs,
    handoffRefs,
    reviewView,
    ownerAuthorizationRefs,
    ownerFactRefs,
    verificationView,
    externalContextFingerprint,
  })));
  return {
    contractRefs,
    handoffRefs,
    ...(reviewView !== undefined && { reviewView }),
    ownerAuthorizationRefs,
    ownerFactRefs,
    ...(verificationView !== undefined && { verificationView }),
    ...(openSpecContext !== undefined && { openSpecContext }),
    ...(externalContextFingerprint !== undefined && { externalContextFingerprint }),
    semanticInputFingerprint,
  };
}

function computeResetAwareLineage(
  snapshot: FormalFactSnapshot,
  changeId: string,
  stage: Stage,
): ReturnType<typeof computeLineage> {
  const current = projectCurrentContractResetLifecycle(snapshot, changeId);
  return computeLineage(current.runs, current.reviewVerdicts, changeId, stage);
}

function deriveRunDescriptors(
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: ChangeAction,
): RunDescriptors {
  const lineageFor = (stage: 'explore' | 'propose' | 'apply') =>
    computeResetAwareLineage(snapshot, changeId, stage);

  switch (action) {
    case 'explore':
      return {};
    case 'review-explore': {
      const artifact = lineageFor('explore').artifact;
      return { reviewedRunId: requireRunId(artifact, action, 'reviewed explore artifact') };
    }
    case 'revise-explore': {
      const review = lineageFor('explore').review;
      return {
        sourceReviewRun: requireReviewRunId(review, action),
        sourceReviewVerdict: requireChangesRequested(review, action),
      };
    }
    case 'propose': {
      const review = lineageFor('explore').review;
      return { consumedRunId: requireApprovedReviewRunId(review, action) };
    }
    case 'review-propose': {
      const artifact = lineageFor('propose').artifact;
      return { reviewedRunId: requireRunId(artifact, action, 'reviewed proposal artifact') };
    }
    case 'revise-propose': {
      const review = lineageFor('propose').review;
      return {
        sourceReviewRun: requireReviewRunId(review, action),
        sourceReviewVerdict: requireChangesRequested(review, action),
      };
    }
    case 'apply': {
      const review = lineageFor('propose').review;
      return { consumedRunId: requireApprovedReviewRunId(review, action) };
    }
    case 'review-apply': {
      const artifact = lineageFor('apply').artifact;
      return { reviewedRunId: requireRunId(artifact, action, 'reviewed apply artifact') };
    }
    case 'revise-apply': {
      const review = lineageFor('apply').review;
      return {
        sourceReviewRun: requireReviewRunId(review, action),
        sourceReviewVerdict: requireChangesRequested(review, action),
      };
    }
    case 'archive': {
      const review = lineageFor('apply').review;
      return { consumedRunId: requireApprovedReviewRunId(review, action) };
    }
  }
}

function requireRunId(run: RunFact | null, action: ChangeAction, label: string): string {
  if (run === null) {
    throw new FlowkitError('RUN_PREPARATION_BINDING_MISSING', `${action} has no ${label}`);
  }
  return run.runId;
}

function requireReviewRunId(review: ReviewVerdictFact | null, action: ChangeAction): string {
  if (review === null) throw new FlowkitError('RUN_PREPARATION_BINDING_MISSING', `${action} has no current review`);
  return review.reviewRunId;
}

function requireChangesRequested(
  review: ReviewVerdictFact | null,
  action: ChangeAction,
): 'changes-requested' {
  if (review === null || review.verdict !== 'changes-requested') {
    throw new FlowkitError('RUN_PREPARATION_BINDING_MISSING', `${action} requires a changes-requested source review`);
  }
  return 'changes-requested';
}

function requireApprovedReviewRunId(review: ReviewVerdictFact | null, action: ChangeAction): string {
  if (review === null || review.verdict !== 'approved') {
    throw new FlowkitError('RUN_PREPARATION_BINDING_MISSING', `${action} requires an approved source review`);
  }
  return review.reviewRunId;
}

async function collectContractRefs(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: ChangeAction,
  archiveOpenSpecContextOverride?: OpenSpecPreparedActionContextView,
): Promise<readonly VersionedAuthorityRef[]> {
  const refs: VersionedAuthorityRef[] = [];
  const c1Active = await isOpenSpecThinIntegrationActive(repoRoot, changeId);
  const archiveOverride = action === 'archive' ? archiveOpenSpecContextOverride : undefined;
  if (archiveOverride !== undefined && archiveOverride.changeId !== changeId) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'archive OpenSpec entry projection change identity mismatch', {
      expected: changeId, actual: archiveOverride.changeId,
    });
  }
  const status = c1Active && archiveOverride === undefined
    ? await new OpenSpecCliAdapter({ repoRoot }).getChangeStatus(changeId)
    : undefined;
  const changeRoot = archiveOverride?.changeRootLogical ?? status?.changeRootLogical ?? `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}`;
  const metadata = `${changeRoot}/.openspec.yaml`;
  const metadataRef = action === 'archive'
    ? await versionedActiveOrArchivedChangeFileRef(repoRoot, changeId, metadata, 'openspec-metadata')
    : (await isFile(join(repoRoot, metadata)))
      ? await versionedFileRef(repoRoot, metadata, 'openspec-metadata')
      : undefined;
  if (metadataRef !== undefined) refs.push(metadataRef);

  const stage = contractGenerationStage(action);
  if (stage === undefined) return sortRefs(refs);

  const producer = computeResetAwareLineage(snapshot, changeId, stage).artifact;
  if (producer === null) {
    throw new FlowkitError('RUN_PREPARATION_BINDING_MISSING', `${action} has no immutable ${stage} producer generation`);
  }
  const produced = await readProducedAuthorityRefs(repoRoot, deliveryId, changeId, producer.runId);
  const structuredArtifactPaths = archiveOverride !== undefined
    ? archiveOverride.artifactPaths
    : status !== undefined
      ? Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => [
          artifactId,
          status.artifactPaths[artifactId].logicalPaths,
        ])) as unknown as Readonly<Record<(typeof OPENSPEC_SUPPORTED_ARTIFACT_IDS)[number], readonly string[]>>
      : undefined;
  const stageIdentities = c1Active && structuredArtifactPaths !== undefined
    ? new Set(stage === 'explore'
      ? [`${changeRoot}/explore.md`]
      : [
          ...structuredArtifactPaths.proposal,
          ...structuredArtifactPaths.design,
          ...structuredArtifactPaths.tasks,
          ...structuredArtifactPaths.specs,
        ])
    : undefined;

  const currentTasksRef = c1Active && structuredArtifactPaths !== undefined
    ? requireExactlyOnePath(structuredArtifactPaths.tasks, changeId, 'tasks')
    : `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}/tasks.md`;

  // Apply execution consumes OpenSpec's structured contextFiles, not a second
  // Flowkit path graph. Exact producer refs still carry the immutable bytes.
  let applyContextSet: ReadonlySet<string> | undefined;
  if (c1Active && (action === 'apply' || action === 'revise-apply')) {
    const apply = await new OpenSpecCliAdapter({ repoRoot }).getApplyInstructions(changeId);
    applyContextSet = new Set(Object.values(apply.contextFiles).flat());
  }

  for (const ref of produced) {
    const relevant = stageIdentities !== undefined
      ? stageIdentities.has(ref.ref)
      : isContractRefForStage(ref, changeId, stage);
    if (!relevant) continue;
    if (applyContextSet !== undefined && stage === 'propose' && !applyContextSet.has(ref.ref)) continue;
    if ((action === 'review-apply' || action === 'archive') && ref.ref === currentTasksRef) continue;
    refs.push(ref);
  }

  if (action === 'review-apply') {
    if (await isFile(join(repoRoot, currentTasksRef))) refs.push(await versionedFileRef(repoRoot, currentTasksRef, 'openspec-contract'));
  } else if (action === 'archive') {
    const tasks = await versionedActiveOrArchivedChangeFileRef(repoRoot, changeId, currentTasksRef, 'openspec-contract');
    if (tasks !== undefined) refs.push(tasks);
  }

  await assertImmutableContractRefsForAction(repoRoot, refs, changeId, action, changeRoot);
  return sortRefs(refs);
}

function requireExactlyOnePath(paths: readonly string[], changeId: string, artifact: string): string {
  if (paths.length !== 1) {
    throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', `OpenSpec ${artifact} artifact must resolve to exactly one path`, { changeId, paths });
  }
  return paths[0]!;
}
function isActionOwnedMutableContractRef(
  action: ChangeAction,
  ref: VersionedAuthorityRef,
  changeId: string,
  structuredChangeRoot?: string,
): boolean {
  const root = `${structuredChangeRoot ?? `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}`}/`;
  switch (action) {
    case 'revise-explore':
      return ref.ref === `${root}explore.md`;
    case 'revise-propose':
      return ref.ref === `${root}proposal.md`
        || ref.ref === `${root}design.md`
        || ref.ref === `${root}tasks.md`
        || ref.ref.startsWith(`${root}specs/`);
    case 'apply':
    case 'revise-apply':
      return ref.ref === `${root}tasks.md`;
    case 'archive':
      return false;
    default:
      return false;
  }
}

async function assertImmutableContractRefsForAction(
  repoRoot: string,
  refs: readonly VersionedAuthorityRef[],
  changeId: string,
  action: ChangeAction,
  structuredChangeRoot?: string,
): Promise<void> {
  const changeRootPrefix = `${structuredChangeRoot ?? `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}`}/`;
  for (const ref of refs) {
    if (!ref.ref.startsWith(changeRootPrefix)) continue;
    if (ref.ref.endsWith('/.openspec.yaml')) continue;
    if (isActionOwnedMutableContractRef(action, ref, changeId, structuredChangeRoot)) continue;

    const current = action === 'archive'
      ? await readActiveOrArchivedChangeFile(repoRoot, changeId, ref.ref)
      : await readFileIfPresent(join(repoRoot, ref.ref));
    if (current === undefined) {
      throw new FlowkitError(
        'PENDING_INPUT_DRIFT',
        `Immutable ${action} contract path disappeared after entry generation: ${ref.ref}`,
      );
    }
    const currentFingerprint = sha256(current);
    if (currentFingerprint !== ref.versionFingerprint) {
      throw new FlowkitError(
        'PENDING_INPUT_DRIFT',
        `Immutable ${action} contract generation drifted at ${ref.ref}`,
        { expected: ref.versionFingerprint, current: currentFingerprint },
      );
    }
  }
}

function contractGenerationStage(
  action: ChangeAction,
): 'explore' | 'propose' | undefined {
  switch (action) {
    case 'explore':
      return undefined;
    case 'review-explore':
    case 'revise-explore':
    case 'propose':
      return 'explore';
    case 'review-propose':
    case 'revise-propose':
    case 'apply':
    case 'review-apply':
    case 'revise-apply':
    case 'archive':
      return 'propose';
  }
}

function isContractRefForStage(
  ref: VersionedAuthorityRef,
  changeId: string,
  stage: 'explore' | 'propose',
): boolean {
  const root = `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}/`;
  if (!ref.ref.startsWith(root)) return false;
  if (stage === 'explore') return ref.ref === `${root}explore.md`;
  return ref.ref === `${root}proposal.md`
    || ref.ref === `${root}design.md`
    || ref.ref === `${root}tasks.md`
    || (ref.ref.startsWith(`${root}specs/`) && ref.ref.endsWith('/spec.md'));
}

async function readProducedAuthorityRefs(
  repoRoot: string,
  deliveryId: string,
  changeId: string,
  runId: string,
): Promise<readonly VersionedAuthorityRef[]> {
  const path = join(repoRoot, RUNS_PREFIX, deliveryId, changeId, runId, 'result.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    throw new FlowkitError(
      'RUN_PREPARATION_BINDING_MISSING',
      `Cannot read producer result ${runId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
  const actionResult = (parsed as Record<string, unknown>)['actionResult'];
  if (typeof actionResult !== 'object' || actionResult === null || Array.isArray(actionResult)) return [];
  const raw = (actionResult as Record<string, unknown>)['producedResultRefs'];
  if (!Array.isArray(raw)) return [];
  const refs: VersionedAuthorityRef[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (
      typeof record['ref'] !== 'string'
      || typeof record['versionFingerprint'] !== 'string'
      || typeof record['kind'] !== 'string'
    ) continue;
    refs.push({
      ref: record['ref'],
      versionFingerprint: record['versionFingerprint'],
      kind: record['kind'],
    });
  }
  return sortRefs(refs);
}

async function collectHandoffRefs(
  repoRoot: string,
  deliveryId: string,
  changeId: string,
  descriptors: RunDescriptors,
): Promise<readonly VersionedAuthorityRef[]> {
  const ids = new Set<string>();
  if (descriptors.consumedRunId !== undefined) ids.add(descriptors.consumedRunId);
  if (descriptors.reviewedRunId !== undefined) ids.add(descriptors.reviewedRunId);
  if (descriptors.sourceReviewRun !== undefined) ids.add(descriptors.sourceReviewRun);
  const refs: VersionedAuthorityRef[] = [];
  for (const runId of [...ids].sort()) {
    refs.push(await runResultRef(repoRoot, deliveryId, changeId, runId));
  }
  return refs;
}

async function buildRelevantReviewView(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: ChangeAction,
  descriptors: RunDescriptors,
): Promise<ActionPackageReviewView | undefined> {
  if (action === 'review-explore' || action === 'review-propose' || action === 'review-apply') {
    const previousReviewRunId = await previousMatchingReviewRunIdForPackage(
      repoRoot,
      deliveryId,
      snapshot,
      changeId,
      action,
      descriptors.reviewedRunId,
    );
    return previousReviewRunId === undefined
      ? undefined
      : buildReviewViewForRunId(repoRoot, deliveryId, snapshot, changeId, previousReviewRunId);
  }
  let stage: 'explore' | 'propose' | 'apply' | undefined;
  switch (action) {
    case 'revise-explore':
    case 'propose':
      stage = 'explore';
      break;
    case 'revise-propose':
    case 'apply':
      stage = 'propose';
      break;
    case 'revise-apply':
    case 'archive':
      stage = 'apply';
      break;
    case 'explore':
      return undefined;
  }
  const review = computeResetAwareLineage(snapshot, changeId, stage).review;
  if (review === null) return undefined;
  return buildReviewViewForRunId(repoRoot, deliveryId, snapshot, changeId, review.reviewRunId);
}

async function buildReviewViewForRunId(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  changeId: string,
  reviewRunId: string,
): Promise<ActionPackageReviewView | undefined> {
  const review = snapshot.reviewVerdicts.find((verdict) => verdict.reviewRunId === reviewRunId);
  if (review === undefined) return undefined;
  const resultRef = await runResultRef(repoRoot, deliveryId, changeId, review.reviewRunId);
  const findings = await readReviewFindingView(repoRoot, deliveryId, changeId, review.reviewRunId);
  const convergence = await readReviewFindingConvergenceView(repoRoot, deliveryId, changeId, review.reviewRunId);
  return {
    reviewRunId: review.reviewRunId,
    verdict: review.verdict,
    resultRef,
    blockingAuthorities: [...review.blockingAuthorities],
    findings,
    ...(convergence.length > 0 && { convergence }),
  };
}

async function previousMatchingReviewRunIdForPackage(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: Extract<ChangeAction, `review-${string}`>,
  reviewedRunId: string | undefined,
): Promise<string | undefined> {
  if (reviewedRunId === undefined) return undefined;
  const reviewed = snapshot.runs.find((run) => run.runId === reviewedRunId);
  const resetRefs = currentContractResetRefs(snapshot.ownerDecisionFacts, changeId);
  if (
    reviewed !== undefined &&
    (reviewed.action === 'revise-explore' || reviewed.action === 'revise-propose' || reviewed.action === 'revise-apply') &&
    reviewed.sourceReviewRun !== undefined
  ) {
    const source = snapshot.runs.find((run) => run.runId === reviewed.sourceReviewRun);
    if (
      source !== undefined &&
      runMatchesContractResetIdentity(reviewed, resetRefs) &&
      runMatchesContractResetIdentity(source, resetRefs)
    ) {
      return reviewed.sourceReviewRun;
    }
    return undefined;
  }

  return snapshot.runs
    .filter((run) =>
      run.changeId === changeId &&
      run.status === 'completed' &&
      run.action === action &&
      run.reviewedRunId === reviewedRunId &&
      runMatchesContractResetIdentity(run, resetRefs)
    )
    .map((run) => run.runId)
    .sort((a, b) => b.localeCompare(a))[0];
}

function collectApplicableOwnerRefs(
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: ChangeAction,
): readonly OwnerAuthorizationRef[] {
  const requiredDecision = action === 'apply'
    ? 'authorize-apply'
    : action === 'archive'
      ? 'authorize-archive'
      : undefined;
  if (requiredDecision === undefined) return [];
  return snapshot.ownerAuthorizations
    .filter(
      (fact) =>
        fact.decision === requiredDecision &&
        fact.deliveryId === snapshot.deliveryId &&
        fact.changeId === changeId,
    )
    .map((fact) => ({
      ref: fact.ref,
      decision: fact.decision,
      deliveryId: fact.deliveryId,
      ...(fact.changeId !== undefined && { changeId: fact.changeId }),
      sourceRef: fact.sourceRef,
    }))
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

function collectApplicableOwnerFactRefs(
  snapshot: FormalFactSnapshot,
  changeId: string,
): readonly OwnerFactRef[] {
  return (snapshot.ownerDecisionFacts ?? [])
    .filter((fact) =>
      fact.decision === 'contract-reset' &&
      fact.deliveryId === snapshot.deliveryId &&
      fact.changeId === changeId
    )
    .filter((fact): fact is typeof fact & {
      readonly decision: 'contract-reset';
      readonly changeId: string;
      readonly scope: string;
      readonly requiredOutcomes: readonly string[];
    } => fact.changeId !== undefined && fact.scope !== undefined && fact.requiredOutcomes !== undefined)
    .map((fact) => ({
      ref: fact.ref,
      decision: 'contract-reset' as const,
      deliveryId: fact.deliveryId,
      changeId: fact.changeId,
      scope: fact.scope,
      requiredOutcomes: [...fact.requiredOutcomes],
      sourceRef: fact.sourceRef,
    }))
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

async function buildVerificationView(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: ChangeAction,
  descriptors: RunDescriptors,
): Promise<ActionPackageVerificationView | undefined> {
  if (action === 'apply') {
    // Apply owns verification progress/output. It is intentionally excluded
    // from immutable entry identity so same-pending continuation cannot
    // invalidate itself by producing verification.md.
    return undefined;
  }
  if (action === 'revise-apply') {
    if (descriptors.sourceReviewRun === undefined) return undefined;
    return readReviewVerificationView(
      repoRoot,
      deliveryId,
      changeId,
      descriptors.sourceReviewRun,
    );
  }
  if (action === 'archive') {
    if (descriptors.consumedRunId === undefined) return undefined;
    const view = await readReviewVerificationView(
      repoRoot,
      deliveryId,
      changeId,
      descriptors.consumedRunId,
    );
    if (view?.resultRef !== undefined) {
      await assertVersionedChangeRefCurrentOrArchived(repoRoot, changeId, view.resultRef);
    }
    return view;
  }
  if (action !== 'review-apply') return undefined;
  const relative = `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}/verification.md`;
  const resultRef = (await isFile(join(repoRoot, relative)))
    ? await versionedFileRef(repoRoot, relative, 'verification-summary')
    : undefined;
  return {
    status: snapshot.changeVerificationStatus ?? 'unavailable',
    ...(resultRef !== undefined && { resultRef }),
  };
}

async function readReviewVerificationView(
  repoRoot: string,
  deliveryId: string,
  changeId: string,
  reviewRunId: string,
): Promise<ActionPackageVerificationView | undefined> {
  const path = join(repoRoot, RUNS_PREFIX, deliveryId, changeId, reviewRunId, 'result.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const actionResult = (parsed as Record<string, unknown>)['actionResult'];
  if (typeof actionResult !== 'object' || actionResult === null || Array.isArray(actionResult)) return undefined;
  const raw = (actionResult as Record<string, unknown>)['verificationSummaryRef'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (
    typeof record['ref'] !== 'string'
    || typeof record['versionFingerprint'] !== 'string'
  ) return undefined;
  return {
    // The Review result is the immutable entry authority. The current
    // verification status/file may legitimately change during revise-apply.
    status: 'unavailable',
    resultRef: {
      ref: record['ref'],
      versionFingerprint: record['versionFingerprint'],
      kind: typeof record['kind'] === 'string' ? record['kind'] : 'verification-summary',
    },
  };
}

async function readReviewFindingView(
  repoRoot: string,
  deliveryId: string,
  changeId: string,
  reviewRunId: string,
): Promise<readonly ActionPackageFindingView[]> {
  const path = join(repoRoot, RUNS_PREFIX, deliveryId, changeId, reviewRunId, 'result.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
  const raw = (parsed as Record<string, unknown>)['reviewFindings'];
  if (!Array.isArray(raw)) return [];
  const result: ActionPackageFindingView[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const finding = item as Record<string, unknown>;
    if (typeof finding['id'] !== 'string' || (finding['severity'] !== 'blocking' && finding['severity'] !== 'non-blocking')) continue;
    const acceptance = Array.isArray(finding['acceptance'])
      ? finding['acceptance'].filter((value): value is string => typeof value === 'string')
      : undefined;
    result.push({
      id: finding['id'],
      severity: finding['severity'],
      ...(typeof finding['blockingAuthority'] === 'string' && {
        blockingAuthority: finding['blockingAuthority'] as ActionPackageFindingView['blockingAuthority'],
      }),
      ...(typeof finding['title'] === 'string' && { title: finding['title'] }),
      ...(typeof finding['problem'] === 'string' && { problem: finding['problem'] }),
      ...(typeof finding['contractRef'] === 'string' && { contractRef: finding['contractRef'] }),
      ...(typeof finding['invariant'] === 'string' && { invariant: finding['invariant'] }),
      ...(typeof finding['requiredOutcome'] === 'string'
        ? { requiredOutcome: finding['requiredOutcome'] }
        : typeof finding['requiredChange'] === 'string'
          ? { requiredOutcome: finding['requiredChange'] }
          : {}),
      ...(acceptance !== undefined && acceptance.length > 0 && { acceptance }),
    });
  }
  return result;
}

async function readReviewFindingConvergenceView(
  repoRoot: string,
  deliveryId: string,
  changeId: string,
  reviewRunId: string,
): Promise<readonly ActionPackageFindingConvergenceView[]> {
  const path = join(repoRoot, RUNS_PREFIX, deliveryId, changeId, reviewRunId, 'result.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];
  const raw = (parsed as Record<string, unknown>)['reviewFindingConvergence'];
  if (!Array.isArray(raw)) return [];
  const result: ActionPackageFindingConvergenceView[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    if (
      typeof entry['findingId'] !== 'string'
      || (entry['state'] !== 'new'
        && entry['state'] !== 'still-open'
        && entry['state'] !== 'resolved'
        && entry['state'] !== 'superseded')
    ) continue;
    result.push({
      findingId: entry['findingId'],
      state: entry['state'],
      ...(typeof entry['supersededByFindingId'] === 'string' && {
        supersededByFindingId: entry['supersededByFindingId'],
      }),
    });
  }
  return result.sort((a, b) => a.findingId.localeCompare(b.findingId));
}

async function runResultRef(
  repoRoot: string,
  deliveryId: string,
  changeId: string,
  runId: string,
): Promise<VersionedAuthorityRef> {
  const relative = `${RUNS_PREFIX}/${deliveryId}/${changeId}/${runId}/result.json`;
  return versionedFileRef(repoRoot, relative, 'run-result');
}

async function versionedActiveOrArchivedChangeFileRef(
  repoRoot: string,
  changeId: string,
  activeRelative: string,
  kind: string,
): Promise<VersionedAuthorityRef | undefined> {
  const content = await readActiveOrArchivedChangeFile(repoRoot, changeId, activeRelative);
  if (content === undefined) return undefined;
  return {
    ref: normalizeSeparators(activeRelative),
    kind,
    versionFingerprint: sha256(content),
  };
}

async function assertVersionedChangeRefCurrentOrArchived(
  repoRoot: string,
  changeId: string,
  ref: VersionedAuthorityRef,
): Promise<void> {
  const content = await readActiveOrArchivedChangeFile(repoRoot, changeId, ref.ref);
  if (content === undefined) {
    throw new FlowkitError(
      'PENDING_INPUT_DRIFT',
      `Immutable archive authority path disappeared: ${ref.ref}`,
    );
  }
  const current = sha256(content);
  if (current !== ref.versionFingerprint) {
    throw new FlowkitError(
      'PENDING_INPUT_DRIFT',
      `Immutable archive authority generation drifted at ${ref.ref}`,
      { expected: ref.versionFingerprint, current },
    );
  }
}

async function readActiveOrArchivedChangeFile(
  repoRoot: string,
  changeId: string,
  activeRelative: string,
): Promise<Uint8Array | undefined> {
  const active = await readFileIfPresent(join(repoRoot, activeRelative));
  if (active !== undefined) return active;

  const root = `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}/`;
  const normalized = normalizeSeparators(activeRelative);
  if (!normalized.startsWith(root)) return undefined;
  const suffix = normalized.slice(root.length);
  const archiveRoot = join(repoRoot, OPEN_SPEC_CHANGE_PREFIX, 'archive');
  let entries;
  try {
    entries = await readdir(archiveRoot, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(`-${changeId}`))
    .map((entry) => join(archiveRoot, entry.name, suffix));
  const existing: Uint8Array[] = [];
  for (const candidate of candidates) {
    const content = await readFileIfPresent(candidate);
    if (content !== undefined) existing.push(content);
  }
  if (existing.length > 1) {
    throw new FlowkitError(
      'PENDING_INPUT_DRIFT',
      `Archive continuation found multiple archived generations for ${activeRelative}`,
    );
  }
  return existing[0];
}

async function readFileIfPresent(path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}

async function versionedFileRef(
  repoRoot: string,
  relative: string,
  kind: string,
): Promise<VersionedAuthorityRef> {
  const normalized = normalizeSeparators(relative);
  const content = await readFile(join(repoRoot, normalized));
  return { ref: normalized, kind, versionFingerprint: sha256(content) };
}

function buildSemanticDescriptor(input: {
  readonly deliveryId: string;
  readonly changeId: string;
  readonly action: ChangeAction;
  readonly definition: ReturnType<typeof getActionDefinition>;
  readonly contractRefs: readonly VersionedAuthorityRef[];
  readonly handoffRefs: readonly VersionedAuthorityRef[];
  readonly reviewView?: ActionPackageReviewView;
  readonly ownerAuthorizationRefs: readonly OwnerAuthorizationRef[];
  readonly ownerFactRefs?: readonly OwnerFactRef[];
  readonly verificationView?: ActionPackageVerificationView;
  readonly externalContextFingerprint?: string;
}): unknown {
  return {
    schemaVersion: 1,
    deliveryId: input.deliveryId,
    changeId: input.changeId,
    action: input.action,
    actionDefinition: input.definition,
    contractRefs: sortRefs(input.contractRefs),
    handoffRefs: sortRefs(input.handoffRefs),
    reviewAuthority: input.reviewView === undefined
      ? null
      : {
          reviewRunId: input.reviewView.reviewRunId,
          verdict: input.reviewView.verdict,
          resultRef: input.reviewView.resultRef,
          blockingAuthorities: [...input.reviewView.blockingAuthorities].sort(),
        },
    verificationAuthority: input.verificationView ?? null,
    ownerAuthorizationRefs: [...input.ownerAuthorizationRefs].sort((a, b) => a.ref.localeCompare(b.ref)),
    ...(input.ownerFactRefs !== undefined && { ownerFactRefs: [...input.ownerFactRefs].sort((a, b) => a.ref.localeCompare(b.ref)) }),
    externalContextFingerprint: input.externalContextFingerprint ?? null,
  };
}

function fingerprintActionPackageSemantics(pkg: ActionPackage): string {
  const base = {
    deliveryId: pkg.run.deliveryId,
    changeId: pkg.run.changeId,
    action: pkg.run.action,
    definition: pkg.definition,
    contractRefs: pkg.contractRefs,
    handoffRefs: pkg.handoffRefs,
    ...(pkg.reviewView !== undefined && { reviewView: pkg.reviewView }),
    ownerAuthorizationRefs: pkg.ownerAuthorizationRefs,
    ...(pkg.ownerFactRefs !== undefined && { ownerFactRefs: pkg.ownerFactRefs }),
    ...(pkg.verificationView !== undefined && { verificationView: pkg.verificationView }),
    ...(pkg.externalContextFingerprint !== undefined && { externalContextFingerprint: pkg.externalContextFingerprint }),
  };
  const descriptor = pkg.schemaVersion === 2 && (pkg.run.action === 'apply' || pkg.run.action === 'revise-apply')
    ? (() => {
      const applyPackage = pkg as ActionPackageV2Apply;
      return buildV2ApplySemanticDescriptor({
      ...base,
      entryWorkspaceIdentity: applyPackage.entryWorkspaceIdentity,
      mutationDeclaration: applyPackage.mutationDeclaration,
      });
    })()
    : buildSemanticDescriptor(base);
  return sha256(stableStringify(descriptor));
}

function buildV2ApplySemanticDescriptor(input: Parameters<typeof buildSemanticDescriptor>[0] & {
  readonly entryWorkspaceIdentity: EntryWorkspaceIdentity;
  readonly mutationDeclaration: MutationDeclaration;
}): unknown {
  return {
    schemaVersion: 2,
    base: buildSemanticDescriptor(input),
    entryWorkspaceIdentity: input.entryWorkspaceIdentity,
    mutationDeclaration: input.mutationDeclaration,
  };
}

function sortRefs(refs: readonly VersionedAuthorityRef[]): readonly VersionedAuthorityRef[] {
  return [...refs].sort((a, b) =>
    `${a.ref}\u0000${a.kind}\u0000${a.versionFingerprint}`.localeCompare(
      `${b.ref}\u0000${b.kind}\u0000${b.versionFingerprint}`,
    ),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) result[key] = canonicalize(record[key]);
  return result;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readSnapshot(repoRoot: string, deliveryId: string): Promise<FormalFactSnapshot> {
  return readFormalFactSnapshot({
    repoRoot,
    deliveryId,
    runsPathPrefix: RUNS_PREFIX,
    openspecChangesPath: OPEN_SPEC_CHANGE_PREFIX,
    manifestPathPrefix: MANIFEST_PREFIX,
  });
}

function assertConflictFree(snapshot: FormalFactSnapshot): void {
  if (snapshot.conflicts.length === 0) return;
  throw new FlowkitError('FORMAL_FACT_CONFLICT', 'formal facts contain conflicts', {
    dimensions: snapshot.conflicts.map((conflict) => conflict.dimension),
  });
}

async function readContextFile(runDir: string): Promise<ContextFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(runDir, 'context.json'), 'utf8')) as unknown;
  } catch (error) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Cannot read pending context.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validateContextFile(parsed);
}

function constraintsForAction(action: ChangeAction): ContextFileConstraints {
  return {
    mayCreateProposalArtifacts: action === 'propose',
    mayWriteProductionCode: action === 'apply' || action === 'revise-apply',
    mayWriteTestCode: action === 'apply' || action === 'revise-apply',
    mayModifyProposalArtifacts: action === 'revise-propose',
    mayCheckpoint: false,
    mayFullTest: false,
    commitAllowed: false,
  };
}

function renderPreparedActionMd(input: {
  readonly runId: string;
  readonly deliveryId: string;
  readonly changeKey: string;
  readonly changeId: string;
  readonly action: ChangeAction;
  readonly role: 'author' | 'reviewer';
  readonly semanticInputFingerprint: string;
}): string {
  const definition = getActionDefinition(input.action);
  return `# Action: ${input.action}\n\n` +
    `- Run: \`${input.runId}\`\n` +
    `- Delivery: \`${input.deliveryId}\`\n` +
    `- Change: \`${input.changeKey} ${input.changeId}\`\n` +
    `- Role: \`${input.role}\`\n` +
    `- semanticInputFingerprint: \`${input.semanticInputFingerprint}\`\n\n` +
    `## Prepared boundary\n\n` +
    `- goalClass: \`${definition.goalClass}\`\n` +
    `- mutationClass: \`${definition.mutationClass}\`\n` +
    `- outputClass: \`${definition.outputClass}\`\n\n` +
    `该 Run 由 B1 deterministic preparation surface 创建；Policy 决定 Action，caller 不直接指定 Formal Action。\n`;
}

function validateLogicalResultInput(action: ChangeAction, input: LogicalActionResultInput): void {
  const isReview = action.startsWith('review-');
  if (isReview) {
    if (input.failureDiagnosis === undefined && input.cancellationReason === undefined) {
      if (input.reviewVerdict === undefined) {
        throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${action} completed logical result requires reviewVerdict`);
      }
    }
  } else if (input.reviewVerdict !== undefined || input.reviewFindings !== undefined || input.reviewFindingConvergence !== undefined) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${action} must not submit Reviewer verdict/findings`);
  }
  if (input.failureDiagnosis !== undefined && input.cancellationReason !== undefined) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'logical result cannot be both failed and cancelled');
  }
}

function logicalToCompleteRunInput(input: LogicalActionResultInput): CompleteRunInput {
  return {
    ...(input.executionStatus !== undefined && { executionStatus: input.executionStatus }),
    ...(input.summary !== undefined && { summary: input.summary }),
    ...(input.reviewVerdict !== undefined && { reviewVerdict: input.reviewVerdict }),
    ...(input.reviewFindings !== undefined && { reviewFindings: input.reviewFindings as readonly ReviewFinding[] }),
    ...(input.reviewFindingConvergence !== undefined && {
      reviewFindingConvergence: input.reviewFindingConvergence as CompleteRunInput['reviewFindingConvergence'],
    }),
    ...(input.failureDiagnosis !== undefined && { failureDiagnosis: input.failureDiagnosis }),
    ...(input.cancellationReason !== undefined && { cancellationReason: input.cancellationReason }),
  };
}
