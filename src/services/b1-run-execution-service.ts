import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, open, readFile, readdir, rm, stat, unlink } from 'node:fs/promises';
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
  CurrentCompactApplyActionPackage,
  ApplyActionPackageLike,
  ActionPackageV2NonApply,
  ActionPackageFindingConvergenceView,
  ActionPackageFindingView,
  ActionPackageReviewView,
  ActionPackageVerificationView,
  LogicalActionResultInput,
  OwnerAuthorizationRef,
  OwnerFactRef,
  EntryWorkspaceIdentity,
  CompactEntryWorkspaceIdentity,
  MutationDeclaration,
  VersionedAuthorityRef,
} from '../domain/types.js';
import { readFormalFactSnapshot, readFormalFactSnapshotOperation, resolveOriginalStrictE2Checkpoint, type FormalFactReadOperation } from '../facts/formal-fact-reader.js';
import { parseYaml } from '../facts/yaml-parser.js';
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
  type RunResultFile,
  type RunTerminalBinding,
} from '../persistence/serialization.js';
import { FlowkitError } from '../shared/errors.js';
import { runCommand } from '../shared/external-command.js';
import { normalizeSeparators } from '../shared/paths.js';
import { OpenSpecCliAdapter } from '../integrations/openspec/openspec-cli-adapter.js';
import {
  OPENSPEC_SUPPORTED_ARTIFACT_IDS,
  type ArchiveEntryOpenSpecProjection,
  type OpenSpecPreparedActionContextView,
  type OpenSpecOperationProjection,
} from '../integrations/openspec/openspec-types.js';
import { isOpenSpecThinIntegrationActive } from '../integrations/openspec/openspec-integration-state.js';
import { inspectOpenSpecArchiveRecovery } from '../integrations/openspec/openspec-archive-service.js';
import { deriveMutationDeclaration } from '../verification/change-selection/mutation-declaration.js';
import {
  captureEntryWorkspaceSnapshot,
  captureCompactEntryWorkspaceIdentity,
  validateCompactEntryWorkspaceIdentity,
  validateEntryWorkspaceSnapshotRecord,
} from '../verification/change-selection/entry-snapshot.js';
import { deriveActualChangeSetFromCanonicalBase, derivePostActionChangeObservation, deriveCompactPostActionChangeObservation } from '../verification/change-selection/actual-change-set.js';
import { buildVerificationSelection } from '../verification/change-selection/selection.js';
import {
  buildVerificationSelectionPublication,
  publishVerificationSelection,
  publishCurrentVerificationMarkdown,
  validatePendingVerificationSelection,
  validateTerminalVerificationSelectionBinding,
  type VerificationSelectionBinding,
} from '../verification/change-selection/publication.js';
import {
  executeVerificationSelection,
  readVerificationEvidenceRecord,
  validateVerificationEvidenceForSelection,
  type VerificationSelectionExecutor,
} from '../verification/change-selection/evidence.js';

export type RunPreparationEntry = 'next' | 'review';

export interface PrepareActionExecutionInput {
  readonly repoRoot: string;
  readonly deliveryId: string;
  /** Unified execution intent. Caller MUST NOT name a concrete formal Action. */
  readonly entry: RunPreparationEntry;
  readonly now?: () => Date;
  /** Bounded OpenSpec adapter injection; production callers normally omit it. */
  readonly openSpecAdapter?: OpenSpecCliAdapter;
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
  /** Bounded OpenSpec adapter injection for exact external semantic revalidation. */
  readonly openSpecAdapter?: OpenSpecCliAdapter;
}

export type ExactResumeOutcome =
  | { readonly kind: 'pending'; readonly package: ActionPackageV2 }
  | { readonly kind: 'already-terminal'; readonly runId: string; readonly result: RunResultFile };

/**
 * Exact v5 continuation surface. It intentionally reads only the persisted
 * Run identity; it does not re-enter Policy or allocate a replacement Run.
 */
export async function resumeRun(input: ResumeRunInput): Promise<ExactResumeOutcome> {
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
  const context = await readContextFile(runDir);
  validateContextFileIdentity(context, runDir);
  if (context.schemaVersion !== 5) {
    throw new FlowkitError('EXACT_RESUME_V5_CONTEXT_REQUIRED', 'Exact resume requires a persisted v5 ActionPackage', {
      expectedRunId: input.expectedRunId,
      schemaVersion: context.schemaVersion,
    });
  }
  if (await isFile(resultPath)) {
    const raw = await readFile(resultPath, 'utf8');
    const result = admitC1RunResultForReader(raw, context.action, { runId: context.runId, deliveryId: context.deliveryId, changeId: context.changeId });
    if (result.terminalBinding === undefined) {
      throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'v5 terminal result is missing its exact replay binding', { expectedRunId: input.expectedRunId });
    }
    if (result.runStatus === 'completed' && (context.action === 'apply' || context.action === 'revise-apply')) {
      if ('compactEntryWorkspaceIdentity' in context && context.compactEntryWorkspaceIdentity !== undefined) {
        if (result.terminalBinding.currentVerification === undefined) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'completed post-E2 Apply terminal is missing current verification binding', { expectedRunId: input.expectedRunId });
        await validateCurrentVerificationTerminalBinding(input.repoRoot, context.changeId, result.terminalBinding.currentVerification);
      } else {
        if (result.terminalBinding.verificationSelection === undefined) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'completed legacy v5 Apply terminal is missing verification-selection binding', { expectedRunId: input.expectedRunId });
        await validateTerminalVerificationSelectionBinding({ runDir, binding: result.terminalBinding.verificationSelection, producingRunId: context.runId, producingSemanticInputFingerprint: context.semanticInputFingerprint ?? '', logicalDescriptorDigest: result.terminalBinding.logicalDescriptorDigest });
      }
    }
    return { kind: 'already-terminal', runId: context.runId, result };
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
  await validateV5ExactResumeExternalSemantics(input, context, actionPackage);
  if (actionPackage.run.action === 'apply' || actionPackage.run.action === 'revise-apply') {
    const applyPackage = actionPackage as ApplyActionPackageLike;
    if ('compactEntryWorkspaceIdentity' in applyPackage && applyPackage.compactEntryWorkspaceIdentity !== undefined) {
      const entry = validateCompactEntryWorkspaceIdentity(applyPackage.compactEntryWorkspaceIdentity);
      const currentWorkspace = await captureCompactEntryWorkspaceIdentity(input.repoRoot);
      deriveCompactPostActionChangeObservation(entry, currentWorkspace, applyPackage.mutationDeclaration);
    } else {
      const legacy = applyPackage as ActionPackageV2Apply;
      let entrySnapshot: unknown;
      try { entrySnapshot = JSON.parse(await readFile(join(runDir, 'entry-workspace.json'), 'utf8')) as unknown; }
      catch (error) { throw new FlowkitError('EXACT_RESUME_ENTRY_SNAPSHOT_MISSING', 'legacy v5 Apply exact resume requires its immutable entry workspace record', { expectedRunId: input.expectedRunId, detail: error instanceof Error ? error.message : String(error) }); }
      const validatedEntrySnapshot = validateEntryWorkspaceSnapshotRecord(entrySnapshot);
      if (validatedEntrySnapshot.canonicalBase !== legacy.entryWorkspaceIdentity.canonicalBase || validatedEntrySnapshot.workspaceFingerprint !== legacy.entryWorkspaceIdentity.workspaceFingerprint) throw new FlowkitError('EXACT_RESUME_ENTRY_SNAPSHOT_MISMATCH', 'legacy v5 Apply entry workspace record does not match persisted ActionPackage', { expectedRunId: input.expectedRunId });
      const currentWorkspace = await captureEntryWorkspaceSnapshot(input.repoRoot);
      derivePostActionChangeObservation(validatedEntrySnapshot, validatedEntrySnapshot, currentWorkspace, legacy.mutationDeclaration);
    }
  }
  return { kind: 'pending', package: actionPackage };
}

async function validateV5ExactResumeExternalSemantics(
  input: ResumeRunInput,
  context: Extract<ContextFile, { readonly schemaVersion: 5 }>,
  actionPackage: ActionPackageV2,
): Promise<void> {
  const adapter = input.openSpecAdapter ?? new OpenSpecCliAdapter({ repoRoot: input.repoRoot });
  const operation = await readSnapshotOperation(input.repoRoot, input.deliveryId, adapter);
  const snapshot = operation.snapshot;
  assertConflictFree(snapshot);
  const activeChange = getActiveChange(snapshot);
  if (activeChange === null || activeChange.id !== context.changeId) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'Exact resume target is no longer bound to the active Change', { runId: context.runId });
  }

  const persistedOwnerFacts = [...(actionPackage.ownerFactRefs ?? [])].sort((a, b) => a.ref.localeCompare(b.ref));
  const currentOwnerFacts = [...collectApplicableOwnerFactRefs(snapshot, context.changeId)].sort((a, b) => a.ref.localeCompare(b.ref));
  if (stableStringify(persistedOwnerFacts) !== stableStringify(currentOwnerFacts)) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'Applicable Owner facts changed after v5 Action entry', { runId: context.runId, dimension: 'owner-facts' });
  }
  const persistedOwnerAuthorizations = [...actionPackage.ownerAuthorizationRefs].sort((a, b) => a.ref.localeCompare(b.ref));
  const currentOwnerAuthorizations = [...collectApplicableOwnerRefs(snapshot, context.changeId, context.action)].sort((a, b) => a.ref.localeCompare(b.ref));
  if (stableStringify(persistedOwnerAuthorizations) !== stableStringify(currentOwnerAuthorizations)) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'Applicable Owner authorization changed after v5 Action entry', { runId: context.runId, dimension: 'owner-authorization' });
  }

  const openSpecContext = await buildOpenSpecPreparedActionContext(
    input.repoRoot,
    context.changeId,
    context.action,
    adapter,
    operation.openSpecProjection,
  );
  const externalContextFingerprint = fingerprintOpenSpecPreparedActionContext(openSpecContext, context.action);
  if ((actionPackage.externalContextFingerprint ?? undefined) !== (externalContextFingerprint ?? undefined)) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'External structured Action context changed after v5 Action entry', { runId: context.runId, dimension: 'external-context' });
  }

  await assertImmutableContractRefsForAction(
    input.repoRoot,
    actionPackage.contractRefs,
    context.changeId,
    context.action,
    openSpecContext?.changeRootLogical,
  );
  await assertVersionedAuthorityRefsCurrent(input.repoRoot, actionPackage.handoffRefs, 'handoff');
  if (actionPackage.verificationView?.resultRef !== undefined) {
    await assertVersionedAuthorityRefsCurrent(input.repoRoot, [actionPackage.verificationView.resultRef], 'verification');
  }
}

async function assertVersionedAuthorityRefsCurrent(
  repoRoot: string,
  refs: readonly VersionedAuthorityRef[],
  dimension: string,
): Promise<void> {
  for (const ref of refs) {
    const content = await readFileIfPresent(join(repoRoot, ref.ref));
    if (content === undefined) {
      throw new FlowkitError('PENDING_INPUT_DRIFT', `Persisted ${dimension} authority disappeared after Action entry: ${ref.ref}`, { ref: ref.ref });
    }
    const current = sha256(content);
    if (current !== ref.versionFingerprint) {
      throw new FlowkitError('PENDING_INPUT_DRIFT', `Persisted ${dimension} authority drifted after Action entry: ${ref.ref}`, { ref: ref.ref, expected: ref.versionFingerprint, current });
    }
  }
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
    if (context.schemaVersion === 5) {
      try {
        const resumed = await resumeRun({ repoRoot, deliveryId, expectedRunId: run.runId });
        return { ...base, status: resumed.kind === 'pending' ? 'resumable' : 'not-resumable' };
      } catch {
        if (await isContractResetOnlyPendingDrift(repoRoot, deliveryId, snapshot, change.id, context)) {
          return { ...base, status: 'recovery-required' };
        }
        return { ...base, status: 'input-drift' };
      }
    }
    if (await isContractResetOnlyPendingDrift(repoRoot, deliveryId, snapshot, change.id, context)) {
      return { ...base, status: 'recovery-required' };
    }
  } catch {
    // Continue with the historical resumability diagnostic. A malformed or otherwise
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
  /** Focused Verification seam; production executes the exact selected scopes. */
  readonly verificationExecutor?: VerificationSelectionExecutor;
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
  const operation = await readSnapshotOperation(input.repoRoot, input.deliveryId, input.openSpecAdapter);
  const snapshot = operation.snapshot;
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
    undefined,
    operation.openSpecProjection,
    input.openSpecAdapter,
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
  return withPreparationLock(input.repoRoot, input.deliveryId, async () => {
  const operation = await readSnapshotOperation(input.repoRoot, input.deliveryId, input.openSpecAdapter);
  const snapshot = operation.snapshot;
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
  const baseSemantic = await deriveSemanticInputs(input.repoRoot, input.deliveryId, snapshot, change.id, action, descriptors, undefined, operation.openSpecProjection, input.openSpecAdapter);
  const postE2Writer = await isPostE2ThreeFileWriterActive(input.repoRoot);
  const entrySnapshot = postE2Writer ? undefined : await captureEntryWorkspaceSnapshot(input.repoRoot);
  const compactEntry = postE2Writer ? await captureCompactEntryWorkspaceIdentity(input.repoRoot) : undefined;
  const entryWorkspaceIdentity = entrySnapshot === undefined ? compactEntry! : toEntryWorkspaceIdentity(entrySnapshot);
  let mutationDeclaration: MutationDeclaration | undefined;
  let semantic = baseSemantic;
  if (action === 'apply' || action === 'revise-apply') {
    mutationDeclaration = await deriveMutationDeclaration(input.repoRoot, action, baseSemantic.contractRefs);
    semantic = withMutationDeclaration(baseSemantic, input.deliveryId, change.id, action, mutationDeclaration, entryWorkspaceIdentity);
  }
  const allocated = await allocateNextRunId(join(input.repoRoot, RUNS_PREFIX, input.deliveryId), (input.now ?? (() => new Date()))().toISOString().slice(0, 10).replaceAll('-', ''), action);
  const actionPackage = buildActionPackageV2(
    input.deliveryId, change.id, allocated.runId, action, semantic, mutationDeclaration,
    mutationDeclaration === undefined ? undefined : (postE2Writer ? undefined : entryWorkspaceIdentity),
    mutationDeclaration === undefined ? undefined : (postE2Writer ? compactEntry : undefined),
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
    canonicalBase: entryWorkspaceIdentity.canonicalBase,
    applicableFactRefs: sortRefs([...semantic.contractRefs, ...semantic.handoffRefs]),
    actionPackage,
    ...(mutationDeclaration !== undefined && !postE2Writer && {
      entryWorkspaceIdentity: entryWorkspaceIdentity as EntryWorkspaceIdentity,
      entryWorkspaceSnapshot: entrySnapshot!,
      mutationDeclaration,
    }),
    ...(mutationDeclaration !== undefined && postE2Writer && {
      compactEntryWorkspaceIdentity: compactEntry!,
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
  });
}

const E2_MIGRATION_DELIVERY_ID = '20260810-01-change-execution-loop';

async function isPostE2ThreeFileWriterActive(repoRoot: string): Promise<boolean> {
  const gitHistory = await runCommand('git', ['log', '--all', '--format=%s'], { cwd: repoRoot });
  if (gitHistory.kind !== 'exited' || gitHistory.exitCode !== 0) {
    throw new FlowkitError('POST_E2_WRITER_ACTIVATION_UNRESOLVED', 'Could not inspect Git history for the bounded E2 self-migration lineage', {
      outcomeKind: gitHistory.kind,
      exitCode: gitHistory.exitCode,
    });
  }

  const migrationStartSubject = `chore(flowkit): start ${E2_MIGRATION_DELIVERY_ID}`;
  const hasMigrationLineage = gitHistory.stdout.split('\n').some((subject) => subject.trim() === migrationStartSubject);
  if (!hasMigrationLineage) {
    // Fresh/downstream repositories running the current implementation have no
    // Flowkit-internal pre-E2 migration history. Current source is therefore
    // the writer authority and prospective three-file Runs are the default.
    return true;
  }

  const anchor = await resolveOriginalStrictE2Checkpoint(repoRoot);
  if (anchor === undefined) return false;
  const ancestry = await runCommand('git', ['merge-base', '--is-ancestor', anchor, 'HEAD'], { cwd: repoRoot });
  if (ancestry.kind === 'exited' && ancestry.exitCode === 0) return true;
  if (ancestry.kind === 'exited' && ancestry.exitCode === 1) return false;
  throw new FlowkitError('POST_E2_WRITER_ACTIVATION_UNRESOLVED', 'Could not prove whether the strict-admitted E2 cutover belongs to current Git HEAD history', {
    checkpoint: anchor,
    outcomeKind: ancestry.kind,
    exitCode: ancestry.exitCode,
  });
}

async function withPreparationLock<T>(repoRoot: string, deliveryId: string, operation: () => Promise<T>): Promise<T> {
  const lockPath = join(repoRoot, RUNS_PREFIX, deliveryId, '.prepare-new-execution.lock');
  await mkdir(join(repoRoot, RUNS_PREFIX, deliveryId), { recursive: true });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let handle;
    try {
      handle = await open(lockPath, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
      continue;
    }
    try { return await operation(); }
    finally { await handle.close(); await unlink(lockPath).catch(() => undefined); }
  }
  throw new FlowkitError('RUN_PREPARATION_CONCURRENT_CONFLICT', 'Could not acquire the Core new-execution preparation boundary', { deliveryId });
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
  const terminalBinding: RunTerminalBinding | undefined = context.schemaVersion === 5
    ? { schemaVersion: 1, logicalDescriptorDigest: fingerprintLogicalResult({ cancellationReason }) }
    : undefined;
  await completeRun(runDir, { cancellationReason, ...(terminalBinding !== undefined && { terminalBinding }) });
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
      { runId: context.runId, stored: context.semanticInputFingerprint, packageSemanticFingerprint },
    );
  }

  validateLogicalResultInput(pkg.run.action, input.result);
  const logicalDescriptorDigest = fingerprintLogicalResult(input.result);
  const existingResultPath = join(runDir, 'result.json');
  if (await isFile(existingResultPath)) {
    if (context.schemaVersion !== 5) {
      throw new FlowkitError('RUN_TERMINAL', `Historical Run ${context.runId} is already terminal`);
    }
    const raw = await readFile(existingResultPath, 'utf8');
    const persisted = admitC1RunResultForReader(raw, context.action, { runId: context.runId, deliveryId: context.deliveryId, changeId: context.changeId });
    if (persisted.terminalBinding?.logicalDescriptorDigest !== logicalDescriptorDigest) {
      throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'Repeated terminal admission uses a conflicting logical descriptor', { runId: context.runId });
    }
    if (persisted.runStatus === 'completed' && (context.action === 'apply' || context.action === 'revise-apply')) {
      if ('compactEntryWorkspaceIdentity' in context && context.compactEntryWorkspaceIdentity !== undefined) {
        const binding = persisted.terminalBinding.currentVerification;
        if (binding === undefined) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'completed post-E2 Apply terminal is missing current verification binding', { runId: context.runId });
        await validateCurrentVerificationTerminalBinding(input.repoRoot, context.changeId, binding);
      } else {
        const binding = persisted.terminalBinding.verificationSelection;
        if (binding === undefined) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'completed legacy v5 Apply terminal is missing verification-selection binding', { runId: context.runId });
        await validateTerminalVerificationSelectionBinding({ runDir, binding, producingRunId: context.runId, producingSemanticInputFingerprint: context.semanticInputFingerprint, logicalDescriptorDigest });
      }
    }
    return;
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

  let verificationSelectionBinding: VerificationSelectionBinding | undefined;
  let currentVerificationBinding: RunTerminalBinding['currentVerification'];
  if (context.schemaVersion === 5 && (pkg.run.action === 'apply' || pkg.run.action === 'revise-apply')
      && input.result.failureDiagnosis === undefined && input.result.cancellationReason === undefined) {
    if ('compactEntryWorkspaceIdentity' in context && context.compactEntryWorkspaceIdentity !== undefined) {
      currentVerificationBinding = await publishCompactApplyVerification({
        repoRoot: input.repoRoot, runDir, context, actionPackage: pkg as CurrentCompactApplyActionPackage, openSpecAdapter,
        deliveryFullTestStatus: snapshot.deliveryFullTestStatus, verificationExecutor: input.verificationExecutor ?? executeVerificationSelection,
      });
    } else {
      verificationSelectionBinding = await publishV5ApplyVerificationSelection({
        repoRoot: input.repoRoot, runDir, context, actionPackage: pkg as ActionPackageV2Apply, openSpecAdapter, logicalDescriptorDigest,
        deliveryFullTestStatus: snapshot.deliveryFullTestStatus, verificationExecutor: input.verificationExecutor ?? executeVerificationSelection,
      });
    }
  }

  const terminalBinding: RunTerminalBinding | undefined = context.schemaVersion === 5
    ? { schemaVersion: 1, logicalDescriptorDigest, ...(verificationSelectionBinding !== undefined && { verificationSelection: verificationSelectionBinding }), ...(currentVerificationBinding !== undefined && { currentVerification: currentVerificationBinding }) }
    : undefined;
  await completeRun(runDir, logicalToCompleteRunInput(input.result, terminalBinding));
}

async function publishCompactApplyVerification(input: {
  readonly repoRoot: string;
  readonly runDir: string;
  readonly context: ContextFile;
  readonly actionPackage: CurrentCompactApplyActionPackage;
  readonly openSpecAdapter: OpenSpecCliAdapter;
  readonly deliveryFullTestStatus: import('../domain/types.js').FullTestStatus | undefined;
  readonly verificationExecutor: VerificationSelectionExecutor;
}): Promise<NonNullable<RunTerminalBinding['currentVerification']>> {
  const entry = validateCompactEntryWorkspaceIdentity(input.actionPackage.compactEntryWorkspaceIdentity);
  const postAction = await captureCompactEntryWorkspaceIdentity(input.repoRoot);
  const verificationLogicalRef = `openspec/changes/${input.context.changeId}/verification.md`;
  const observed = deriveCompactPostActionChangeObservation(entry, postAction, input.actionPackage.mutationDeclaration, new Set([verificationLogicalRef]));
  const projection = await input.openSpecAdapter.createOperationProjection(input.context.changeId);
  const selection = buildVerificationSelection(observed.actualChangeSet, projection.status.artifactPaths.specs.logicalPaths);
  if (input.deliveryFullTestStatus === undefined) throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Change Verification publication requires Delivery Full Test status projection');
  const evidence = await input.verificationExecutor({
    repoRoot: input.repoRoot, changeId: input.context.changeId, runDir: input.runDir, producingRunId: input.context.runId, selection,
    fullTestStatus: input.deliveryFullTestStatus, openSpecAdapter: input.openSpecAdapter, resultRefBase: verificationLogicalRef,
  });
  validateVerificationEvidenceForSelection(evidence, selection, input.context.runId);
  const binding = await publishCurrentVerificationMarkdown({
    canonicalVerificationPath: join(projection.status.changeRoot, 'verification.md'),
    model: { producingRunId: input.context.runId, canonicalBase: entry.canonicalBase, postActionWorkspaceFingerprint: postAction.workspaceFingerprint, actualChangeSet: observed.actualChangeSet, selection, verificationStatus: evidence.overallStatus },
    evidence,
  });
  return binding;
}

async function validateCurrentVerificationTerminalBinding(
  repoRoot: string, changeId: string, binding: NonNullable<RunTerminalBinding['currentVerification']>,
): Promise<void> {
  const logicalRef = `openspec/changes/${changeId}/verification.md`;
  if (binding.logicalRef !== logicalRef) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'current verification binding targets wrong logical path', { expected: logicalRef, actual: binding.logicalRef });
  let bytes: string;
  try { bytes = await readFile(join(repoRoot, logicalRef), 'utf8'); }
  catch (error) { throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'current verification binding target is unavailable', { logicalRef, detail: error instanceof Error ? error.message : String(error) }); }
  if (sha256(bytes) !== binding.versionFingerprint) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'current verification binding fingerprint does not match persisted verification.md');
  const statusMatch = /<!--\s*flowkit-change-verification-status:\s*([^\s>]+)\s*-->/.exec(bytes)?.[1];
  if (statusMatch !== binding.status) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'current verification status marker does not match terminal binding', { statusMatch, bindingStatus: binding.status });
  const selectionMatch = /- selectionFingerprint: `([0-9a-f]{64})`/.exec(bytes)?.[1];
  if (selectionMatch !== binding.selectionFingerprint) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'current verification selection fingerprint does not match terminal binding');
}

async function publishV5ApplyVerificationSelection(input: {
  readonly repoRoot: string;
  readonly runDir: string;
  readonly context: ContextFile;
  readonly actionPackage: ActionPackageV2Apply;
  readonly openSpecAdapter: OpenSpecCliAdapter;
  readonly logicalDescriptorDigest: string;
  readonly deliveryFullTestStatus: import('../domain/types.js').FullTestStatus | undefined;
  readonly verificationExecutor: VerificationSelectionExecutor;
}): Promise<VerificationSelectionBinding> {
  const expectedVerificationPath = join(input.repoRoot, 'openspec', 'changes', input.context.changeId, 'verification.md');
  const existingBinding = await validatePendingVerificationSelection({
    runDir: input.runDir,
    canonicalVerificationPath: expectedVerificationPath,
    producingRunId: input.context.runId,
    producingSemanticInputFingerprint: input.actionPackage.run.semanticInputFingerprint,
    logicalDescriptorDigest: input.logicalDescriptorDigest,
  });
  if (existingBinding !== undefined) return existingBinding;
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
  const verificationLogicalRef = `openspec/changes/${input.context.changeId}/verification.md`;
  const reservedCoreOwnedPaths = new Set([verificationLogicalRef]);
  const observed = derivePostActionChangeObservation(
    entry,
    entry,
    postAction,
    input.actionPackage.mutationDeclaration,
    reservedCoreOwnedPaths,
  );
  const actualChangeSet = await deriveActualChangeSetFromCanonicalBase(
    input.repoRoot,
    entry.canonicalBase,
    postAction,
    reservedCoreOwnedPaths,
  );
  const projection = await input.openSpecAdapter.createOperationProjection(input.context.changeId);
  const selection = buildVerificationSelection(actualChangeSet, projection.status.artifactPaths.specs.logicalPaths);
  if (input.deliveryFullTestStatus === undefined) {
    throw new FlowkitError('VERIFICATION_EVIDENCE_CONFLICT', 'Change Verification publication requires a Delivery Full Test status projection');
  }
  const existingEvidence = await readVerificationEvidenceRecord(input.runDir, false);
  const evidence = existingEvidence === undefined
    ? await input.verificationExecutor({
        repoRoot: input.repoRoot,
        changeId: input.context.changeId,
        runDir: input.runDir,
        producingRunId: input.context.runId,
        selection,
        fullTestStatus: input.deliveryFullTestStatus,
        openSpecAdapter: input.openSpecAdapter,
      })
    : existingEvidence.record;
  validateVerificationEvidenceForSelection(evidence, selection, input.context.runId);
  // `observed` is intentionally evaluated for declaration enforcement even though
  // the publication stores the canonical base-to-post actualChangeSet.
  void observed;
  const record = buildVerificationSelectionPublication({
    producingRunId: input.context.runId,
    producingSemanticInputFingerprint: input.actionPackage.run.semanticInputFingerprint,
    logicalDescriptorDigest: input.logicalDescriptorDigest,
    canonicalBase: entry.canonicalBase,
    entryWorkspaceIdentity: { schemaVersion: 1, canonicalBase: entry.canonicalBase, workspaceFingerprint: entry.workspaceFingerprint },
    postActionWorkspaceFingerprint: postAction.workspaceFingerprint,
    actualChangeSet,
    selection,
    verificationMarkdownLogicalRef: verificationLogicalRef,
  }, evidence);
  return publishVerificationSelection({
    runDir: input.runDir,
    canonicalVerificationPath: join(projection.status.changeRoot, 'verification.md'),
    record,
    evidence,
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
  if (context.schemaVersion === 5) {
    return isV5ContractResetOnlyPendingDrift(repoRoot, deliveryId, snapshot, context);
  }

  return isHistoricalContractResetOnlyPendingDrift(repoRoot, deliveryId, snapshot, context);
}


async function isHistoricalContractResetOnlyPendingDrift(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  context: Extract<ContextFile, { readonly schemaVersion: 2 | 3 | 4 }>,
): Promise<boolean> {
  const frozenOwnerFacts = [...(context.ownerFactRefs ?? [])].sort((a, b) => a.ref.localeCompare(b.ref));
  const currentOwnerFacts = [...collectApplicableOwnerFactRefs(snapshot, context.changeId)].sort((a, b) => a.ref.localeCompare(b.ref));
  if (!hasExactlyOneNewContractReset(frozenOwnerFacts, currentOwnerFacts)) return false;
  if ((context.action === 'apply' || context.action === 'revise-apply') && context.inputRef === undefined) return false;

  try {
    const historicalOwnerAuthorizations = await collectHistoricalOwnerAuthorizationsForReset(
      repoRoot,
      deliveryId,
      snapshot,
      context,
      frozenOwnerFacts,
      currentOwnerFacts[0]!,
    );
    const historicalSnapshot: FormalFactSnapshot = {
      ...snapshot,
      ownerAuthorizations: historicalOwnerAuthorizations,
      ownerDecisionFacts: [
        ...(snapshot.ownerDecisionFacts ?? []).filter((fact) => fact.decision !== 'contract-reset'),
        ...frozenOwnerFacts,
      ],
    };
    const semantic = await deriveSemanticInputs(
      repoRoot,
      deliveryId,
      historicalSnapshot,
      context.changeId,
      context.action,
      descriptorsFromContext(context),
    );
    if (semantic.semanticInputFingerprint !== context.semanticInputFingerprint) return false;

    // Historical continuation is anchored to persisted handoff lineage. The
    // reconstructed package must still bind the exact persisted input ref; a
    // missing, ambiguous or rewritten producer/review result therefore fails
    // closed instead of falling back to the post-reset current generation.
    if (context.inputRef !== undefined) {
      const matches = semantic.handoffRefs.filter((ref) => ref.ref === context.inputRef!.ref);
      if (matches.length !== 1 || stableStringify(matches[0]) !== stableStringify(context.inputRef)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function collectHistoricalOwnerAuthorizationsForReset(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  context: Extract<ContextFile, { readonly schemaVersion: 2 | 3 | 4 }>,
  frozenOwnerFacts: readonly OwnerFactRef[],
  currentReset: OwnerFactRef,
): Promise<FormalFactSnapshot['ownerAuthorizations']> {
  const requiredDecision = context.action === 'apply'
    ? 'authorize-apply'
    : context.action === 'archive'
      ? 'authorize-archive'
      : undefined;
  if (requiredDecision === undefined) {
    if (context.ownerAuthorization === 'explicit') {
      throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Historical Run claims unexpected explicit Owner authorization');
    }
    return [];
  }
  if (context.ownerAuthorization !== 'explicit') {
    throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Historical Run is missing its required explicit Owner authorization');
  }

  const manifestPath = join(repoRoot, MANIFEST_PREFIX, `${deliveryId}.yaml`);
  const parsed = parseYaml(await readFile(manifestPath, 'utf8'));
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Cannot reconstruct historical Owner authorization ordering');
  }
  const decisions = (parsed.value as Record<string, unknown>)['ownerDecisions'];
  if (!Array.isArray(decisions)) {
    throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Delivery Manifest ownerDecisions is unavailable for historical recovery');
  }
  const refs = decisions.map((item) =>
    typeof item === 'object' && item !== null && !Array.isArray(item) && typeof (item as Record<string, unknown>)['ref'] === 'string'
      ? (item as Record<string, unknown>)['ref'] as string
      : undefined
  );
  const currentResetIndex = refs.indexOf(currentReset.ref);
  if (currentResetIndex < 0 || refs.lastIndexOf(currentReset.ref) !== currentResetIndex) {
    throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Current Contract Reset ref is missing or ambiguous in Owner provenance');
  }
  let frozenResetIndex = -1;
  if (frozenOwnerFacts.length > 0) {
    if (frozenOwnerFacts.length !== 1) throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Historical Contract Reset lineage is ambiguous');
    frozenResetIndex = refs.indexOf(frozenOwnerFacts[0]!.ref);
    if (frozenResetIndex < 0 || refs.lastIndexOf(frozenOwnerFacts[0]!.ref) !== frozenResetIndex || frozenResetIndex >= currentResetIndex) {
      throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Historical Contract Reset ref is missing, ambiguous or ordered after current Reset');
    }
  }

  const validated = new Map(
    (snapshot.ownerDecisionFacts ?? [])
      .filter((fact) => fact.decision === requiredDecision && fact.changeId === context.changeId)
      .map((fact) => [fact.ref, fact] as const),
  );
  const selected: Array<FormalFactSnapshot['ownerAuthorizations'][number]> = decisions.slice(frozenResetIndex + 1, currentResetIndex).flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (record['decision'] !== requiredDecision || record['changeId'] !== context.changeId || typeof record['ref'] !== 'string') return [];
    const fact = validated.get(record['ref']);
    if (fact === undefined) throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Historical Owner authorization ref is not a validated manifest fact');
    return [{
      ref: fact.ref,
      decision: requiredDecision,
      deliveryId: fact.deliveryId,
      ...(fact.changeId !== undefined && { changeId: fact.changeId }),
      sourceRef: fact.sourceRef,
    }];
  });
  if (selected.length === 0) {
    throw new FlowkitError('RESET_PENDING_RECOVERY_NOT_ALLOWED', 'Historical Run has no reconstructable Owner authorization before Contract Reset');
  }
  return selected;
}
async function isV5ContractResetOnlyPendingDrift(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  context: Extract<ContextFile, { readonly schemaVersion: 5 }>,
): Promise<boolean> {
  const pkg = context.actionPackage;
  if (fingerprintActionPackageSemantics(pkg) !== context.semanticInputFingerprint) return false;
  const frozenOwnerFacts = [...(pkg.ownerFactRefs ?? [])].sort((a, b) => a.ref.localeCompare(b.ref));
  const currentOwnerFacts = [...collectApplicableOwnerFactRefs(snapshot, context.changeId)].sort((a, b) => a.ref.localeCompare(b.ref));
  if (!hasExactlyOneNewContractReset(frozenOwnerFacts, currentOwnerFacts)) return false;

  try {
    const adapter = new OpenSpecCliAdapter({ repoRoot });
    const operation = await readSnapshotOperation(repoRoot, deliveryId, adapter);
    const currentSnapshot = operation.snapshot;
    assertConflictFree(currentSnapshot);
    const activeChange = getActiveChange(currentSnapshot);
    if (activeChange === null || activeChange.id !== context.changeId) return false;
    const openSpecContext = await buildOpenSpecPreparedActionContext(
      repoRoot,
      context.changeId,
      context.action,
      adapter,
      operation.openSpecProjection,
    );
    const currentExternal = fingerprintOpenSpecPreparedActionContext(openSpecContext, context.action);
    if ((pkg.externalContextFingerprint ?? undefined) !== (currentExternal ?? undefined)) return false;
    await assertImmutableContractRefsForAction(repoRoot, pkg.contractRefs, context.changeId, context.action, openSpecContext?.changeRootLogical);
    await assertVersionedAuthorityRefsCurrent(repoRoot, pkg.handoffRefs, 'handoff');
    if (pkg.verificationView?.resultRef !== undefined) {
      await assertVersionedAuthorityRefsCurrent(repoRoot, [pkg.verificationView.resultRef], 'verification');
    }
    if (context.action === 'apply' || context.action === 'revise-apply') {
      const entryRaw = JSON.parse(await readFile(join(repoRoot, context.runPath, 'entry-workspace.json'), 'utf8')) as unknown;
      const entry = validateEntryWorkspaceSnapshotRecord(entryRaw);
      const currentWorkspace = await captureEntryWorkspaceSnapshot(repoRoot);
      // Contract Reset authority is persisted in the Delivery Manifest itself.
      // For reset-only recovery, neutralize exactly that authority-owned path
      // before checking the Action-owned mutation surface; every other path
      // remains subject to the persisted declaration and therefore fails closed.
      const manifestLogicalPath = `openspec/delivery-groups/${deliveryId}.yaml`;
      const entryManifest = entry.files.find((file) => file.path === manifestLogicalPath);
      const resetNeutralWorkspace = entryManifest === undefined
        ? currentWorkspace
        : {
            ...currentWorkspace,
            files: currentWorkspace.files
              .filter((file) => file.path !== manifestLogicalPath)
              .concat(entryManifest)
              .sort((left, right) => left.path.localeCompare(right.path)),
          };
      derivePostActionChangeObservation(entry, entry, resetNeutralWorkspace, (pkg as ActionPackageV2Apply).mutationDeclaration);
    }
    return true;
  } catch {
    return false;
  }
}

function hasExactlyOneNewContractReset(
  frozen: readonly OwnerFactRef[],
  current: readonly OwnerFactRef[],
): boolean {
  // Owner fact projection is currentness-aware: a later Contract Reset replaces
  // the previous reset in the current projection rather than appending beside it.
  // Recovery therefore accepts exactly one current Reset that differs from the
  // persisted entry Reset (or is the first Reset for an entry with none).
  if (current.length !== 1 || current[0]!.decision !== 'contract-reset') return false;
  if (frozen.length === 0) return true;
  if (frozen.length !== 1 || frozen[0]!.decision !== 'contract-reset') return false;
  return stableStringify(frozen[0]) !== stableStringify(current[0]);
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
  compactEntryWorkspaceIdentity?: CompactEntryWorkspaceIdentity,
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
    if (mutationDeclaration === undefined || (entryWorkspaceIdentity === undefined) === (compactEntryWorkspaceIdentity === undefined)) {
      throw new FlowkitError('ACTION_PACKAGE_SCHEMA_MISMATCH', 'Apply package requires exactly one legacy or compact entry identity and mutation declaration');
    }
    if (compactEntryWorkspaceIdentity !== undefined) return { ...common(action), compactEntryWorkspaceIdentity, mutationDeclaration } as CurrentCompactApplyActionPackage;
    return { ...common(action), entryWorkspaceIdentity: entryWorkspaceIdentity!, mutationDeclaration } as ActionPackageV2Apply;
  }
  if (mutationDeclaration !== undefined || entryWorkspaceIdentity !== undefined || compactEntryWorkspaceIdentity !== undefined) {
    throw new FlowkitError('ACTION_PACKAGE_SCHEMA_MISMATCH', 'non-Apply package must not carry Apply authority');
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
  baseProjection?: OpenSpecOperationProjection,
): Promise<OpenSpecPreparedActionContextView | undefined> {
  if (!(await isOpenSpecThinIntegrationActive(repoRoot, changeId))) return undefined;

  const projection = await adapter.createOperationProjection(changeId, {
    ...(action === 'propose' || action === 'revise-propose'
      ? { artifactInstructionIds: OPENSPEC_SUPPORTED_ARTIFACT_IDS }
      : {}),
    ...(action === 'apply' || action === 'revise-apply'
      ? { includeStrictValidation: true, includeApplyInstructions: true }
      : {}),
    ...(baseProjection !== undefined && { baseProjection }),
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
  operationProjection?: OpenSpecOperationProjection,
  openSpecAdapter?: OpenSpecCliAdapter,
): Promise<SemanticInputs> {
  const definition = getActionDefinition(action);
  const openSpecContext = archiveOpenSpecContextOverride ?? await buildOpenSpecPreparedActionContext(
    repoRoot, changeId, action, openSpecAdapter ?? new OpenSpecCliAdapter({ repoRoot }), operationProjection,
  );
  const contractRefs = await collectContractRefs(
    repoRoot,
    deliveryId,
    snapshot,
    changeId,
    action,
    openSpecContext,
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
  openSpecContext?: OpenSpecPreparedActionContextView,
): Promise<readonly VersionedAuthorityRef[]> {
  const refs: VersionedAuthorityRef[] = [];
  const c1Active = await isOpenSpecThinIntegrationActive(repoRoot, changeId);
  if (openSpecContext !== undefined && openSpecContext.changeId !== changeId) {
    throw new FlowkitError('PENDING_INPUT_DRIFT', 'OpenSpec operation projection change identity mismatch', {
      expected: changeId, actual: openSpecContext.changeId,
    });
  }
  const changeRoot = openSpecContext?.changeRootLogical ?? `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}`;
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
  const structuredArtifactPaths = openSpecContext?.artifactPaths;
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
    const apply = openSpecContext?.applyInstructions;
    if (apply === undefined) {
      throw new FlowkitError('OPENSPEC_OPERATION_PROJECTION_INCOMPLETE', 'OpenSpec Apply operation projection omitted apply instructions', { changeId, action });
    }
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
      const applyPackage = pkg as ApplyActionPackageLike;
      const entryWorkspaceIdentity = 'compactEntryWorkspaceIdentity' in applyPackage && applyPackage.compactEntryWorkspaceIdentity !== undefined
        ? applyPackage.compactEntryWorkspaceIdentity
        : (applyPackage as ActionPackageV2Apply).entryWorkspaceIdentity;
      return buildV2ApplySemanticDescriptor({ ...base, entryWorkspaceIdentity, mutationDeclaration: applyPackage.mutationDeclaration });
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

async function readSnapshotOperation(repoRoot: string, deliveryId: string, openSpecAdapter?: OpenSpecCliAdapter): Promise<FormalFactReadOperation> {
  return readFormalFactSnapshotOperation({
    repoRoot,
    deliveryId,
    runsPathPrefix: RUNS_PREFIX,
    openspecChangesPath: OPEN_SPEC_CHANGE_PREFIX,
    manifestPathPrefix: MANIFEST_PREFIX,
    ...(openSpecAdapter !== undefined && { openSpecAdapter }),
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

function logicalToCompleteRunInput(input: LogicalActionResultInput, terminalBinding?: RunTerminalBinding): CompleteRunInput {
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
    ...(terminalBinding !== undefined && { terminalBinding }),
  };
}

function fingerprintLogicalResult(input: LogicalActionResultInput): string {
  return sha256(stableStringify(input));
}
