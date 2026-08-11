import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getActionDefinition,
  expectedRoleForAction,
  type ChangeAction,
} from '../domain/actions.js';
import type {
  ActionPackage,
  ActionPackageFindingView,
  ActionPackageReviewView,
  ActionPackageVerificationView,
  LogicalActionResultInput,
  OwnerAuthorizationRef,
  VersionedAuthorityRef,
} from '../domain/types.js';
import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import type {
  FormalFactSnapshot,
  ReviewVerdictFact,
  RunFact,
} from '../facts/formal-fact-snapshot.js';
import { computeLineage } from '../policy/lineage.js';
import { next } from '../policy/next.js';
import { getActiveChange } from '../policy/preconditions.js';
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
  type ContextFile,
  type ContextFileConstraints,
  type ReviewFinding,
} from '../persistence/serialization.js';
import { FlowkitError } from '../shared/errors.js';
import { normalizeSeparators } from '../shared/paths.js';
import { OpenSpecCliAdapter } from '../integrations/openspec/openspec-cli-adapter.js';
import { OPENSPEC_SUPPORTED_ARTIFACT_IDS, type OpenSpecPreparedActionContextView } from '../integrations/openspec/openspec-types.js';
import { isOpenSpecThinIntegrationActive } from '../integrations/openspec/openspec-integration-state.js';
import { inspectOpenSpecArchiveRecovery } from '../integrations/openspec/openspec-archive-service.js';

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
    const persistedArchive = await findPersistedPendingArchive(repoRoot, deliveryId);
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
  readonly verificationView?: ActionPackageVerificationView;
  readonly openSpecContext?: OpenSpecPreparedActionContextView;
  readonly externalContextFingerprint?: string;
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

  const pendingArchive = await findPersistedPendingArchive(input.repoRoot, input.deliveryId);
  if (pendingArchive !== undefined) {
    if (input.entry !== 'next') {
      throw new FlowkitError(
        'RUN_PREPARATION_NOT_ALLOWED',
        'A persisted pending archive may only resume through the normal next entry',
      );
    }
    return resumePendingArchive(input, snapshot, pendingArchive);
  }

  const change = getActiveChange(snapshot);
  if (change === null) {
    throw new FlowkitError('RUN_PREPARATION_NOT_ALLOWED', 'B1 preparation requires one active Change');
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


async function findPersistedPendingArchive(
  repoRoot: string,
  deliveryId: string,
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

  const archives = pending.filter((context) => context.action === 'archive');
  if (archives.length === 0) return undefined;
  if (pending.length !== 1 || archives.length !== 1) {
    throw new FlowkitError(
      'AMBIGUOUS_PENDING_RUNS',
      `Delivery has multiple persisted pending Runs while archive recovery is required: ${pending.map((run) => run.runId).sort().join(', ')}`,
    );
  }
  return archives[0];
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
  const semantic = await deriveSemanticInputs(
    repoRoot,
    deliveryId,
    recoverySnapshot,
    existing.changeId,
    'archive',
    descriptors,
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
export async function admitActionResult(input: AdmitActionResultInput): Promise<void> {
  const pkg = input.actionPackage;
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

  const c1OpenSpecActive = await isOpenSpecThinIntegrationActive(input.repoRoot, pkg.run.changeId);
  if (c1OpenSpecActive && (pkg.run.action === 'propose' || pkg.run.action === 'revise-propose')
      && input.result.failureDiagnosis === undefined && input.result.cancellationReason === undefined) {
    const validation = await new OpenSpecCliAdapter({ repoRoot: input.repoRoot }).validateChange(pkg.run.changeId, true);
    if (!validation.valid) {
      throw new FlowkitError('OPENSPEC_STRICT_VALIDATION_FAILED', `OpenSpec strict validation failed before ${pkg.run.action} terminal admission`, {
        changeId: pkg.run.changeId, issues: validation.issues, status: validation.status,
      });
    }
  }

  if (pkg.run.action === 'archive') {
    const persistedArchive = await findPersistedPendingArchive(input.repoRoot, input.deliveryId);
    if (
      persistedArchive === undefined
      || persistedArchive.runId !== pkg.run.runId
      || persistedArchive.changeId !== pkg.run.changeId
    ) {
      throw new FlowkitError(
        'RUN_NOT_PENDING',
        `Run ${pkg.run.runId} is not the persisted pending archive execution`,
      );
    }
    const recovered = await recoverPersistedPendingArchive(
      input.repoRoot,
      input.deliveryId,
      snapshot,
      persistedArchive,
    );
    assertRecoveredArchiveFingerprint(persistedArchive, recovered.semantic);
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

function buildActionPackage(
  deliveryId: string,
  changeId: string,
  runId: string,
  action: ChangeAction,
  semantic: SemanticInputs,
): ActionPackage {
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
    ...(semantic.verificationView !== undefined && { verificationView: semantic.verificationView }),
    ...(semantic.externalContextFingerprint !== undefined && { externalContextFingerprint: semantic.externalContextFingerprint }),
    requiredResultContract: definition.terminalContract,
  };
}

export async function buildOpenSpecPreparedActionContext(
  repoRoot: string,
  changeId: string,
  action: ChangeAction,
  adapter: OpenSpecCliAdapter = new OpenSpecCliAdapter({ repoRoot }),
): Promise<OpenSpecPreparedActionContextView | undefined> {
  if (!(await isOpenSpecThinIntegrationActive(repoRoot, changeId))) return undefined;

  const version = await adapter.getVersion();
  const status = await adapter.getChangeStatus(changeId);
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
    const artifactInstructions = Object.fromEntries(await Promise.all(
      OPENSPEC_SUPPORTED_ARTIFACT_IDS.map(async (artifactId) => [artifactId, await adapter.getArtifactInstructions(changeId, artifactId)] as const),
    )) as Readonly<Record<(typeof OPENSPEC_SUPPORTED_ARTIFACT_IDS)[number], Awaited<ReturnType<OpenSpecCliAdapter['getArtifactInstructions']>>>>;
    return { ...base, artifactInstructions };
  }

  if (action === 'apply' || action === 'revise-apply') {
    const validation = await adapter.validateChange(changeId, true);
    if (!validation.valid) {
      throw new FlowkitError('OPENSPEC_STRICT_VALIDATION_FAILED', `OpenSpec strict validation failed before ${action}`, {
        changeId, issues: validation.issues, status: validation.status,
      });
    }
    return { ...base, applyInstructions: await adapter.getApplyInstructions(changeId) };
  }

  return base;
}


export function fingerprintOpenSpecPreparedActionContext(
  view: OpenSpecPreparedActionContextView | undefined,
): string | undefined {
  return view === undefined ? undefined : sha256(stableStringify(view));
}

async function deriveSemanticInputs(
  repoRoot: string,
  deliveryId: string,
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: ChangeAction,
  descriptors: RunDescriptors,
): Promise<SemanticInputs> {
  const definition = getActionDefinition(action);
  const contractRefs = await collectContractRefs(
    repoRoot,
    deliveryId,
    snapshot,
    changeId,
    action,
  );
  const handoffRefs = await collectHandoffRefs(repoRoot, deliveryId, changeId, descriptors);
  const reviewView = await buildRelevantReviewView(repoRoot, deliveryId, snapshot, changeId, action);
  const ownerAuthorizationRefs = collectApplicableOwnerRefs(snapshot, changeId, action);
  const verificationView = await buildVerificationView(
    repoRoot,
    deliveryId,
    snapshot,
    changeId,
    action,
    descriptors,
  );
  const openSpecContext = await buildOpenSpecPreparedActionContext(repoRoot, changeId, action);
  const externalContextFingerprint = fingerprintOpenSpecPreparedActionContext(openSpecContext);

  const semanticInputFingerprint = sha256(stableStringify(buildSemanticDescriptor({
    deliveryId,
    changeId,
    action,
    definition,
    contractRefs,
    handoffRefs,
    reviewView,
    ownerAuthorizationRefs,
    verificationView,
    externalContextFingerprint,
  })));
  return {
    contractRefs,
    handoffRefs,
    ...(reviewView !== undefined && { reviewView }),
    ownerAuthorizationRefs,
    ...(verificationView !== undefined && { verificationView }),
    ...(openSpecContext !== undefined && { openSpecContext }),
    ...(externalContextFingerprint !== undefined && { externalContextFingerprint }),
    semanticInputFingerprint,
  };
}

function deriveRunDescriptors(
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: ChangeAction,
): RunDescriptors {
  const lineageFor = (stage: 'explore' | 'propose' | 'apply') =>
    computeLineage(snapshot.runs, snapshot.reviewVerdicts, changeId, stage);

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
): Promise<readonly VersionedAuthorityRef[]> {
  const refs: VersionedAuthorityRef[] = [];
  const c1Active = await isOpenSpecThinIntegrationActive(repoRoot, changeId);
  const status = c1Active ? await new OpenSpecCliAdapter({ repoRoot }).getChangeStatus(changeId) : undefined;
  const changeRoot = status?.changeRootLogical ?? `${OPEN_SPEC_CHANGE_PREFIX}/${changeId}`;
  const metadata = `${changeRoot}/.openspec.yaml`;
  const metadataRef = action === 'archive'
    ? await versionedActiveOrArchivedChangeFileRef(repoRoot, changeId, metadata, 'openspec-metadata')
    : (await isFile(join(repoRoot, metadata)))
      ? await versionedFileRef(repoRoot, metadata, 'openspec-metadata')
      : undefined;
  if (metadataRef !== undefined) refs.push(metadataRef);

  const stage = contractGenerationStage(action);
  if (stage === undefined) return sortRefs(refs);

  const producer = computeLineage(snapshot.runs, snapshot.reviewVerdicts, changeId, stage).artifact;
  if (producer === null) {
    throw new FlowkitError('RUN_PREPARATION_BINDING_MISSING', `${action} has no immutable ${stage} producer generation`);
  }
  const produced = await readProducedAuthorityRefs(repoRoot, deliveryId, changeId, producer.runId);
  const stageIdentities = c1Active && status !== undefined
    ? new Set(stage === 'explore'
      ? [`${status.changeRootLogical}/explore.md`]
      : [
          ...status.artifactPaths.proposal.logicalPaths,
          ...status.artifactPaths.design.logicalPaths,
          ...status.artifactPaths.tasks.logicalPaths,
          ...status.artifactPaths.specs.logicalPaths,
        ])
    : undefined;

  const currentTasksRef = c1Active && status !== undefined
    ? requireExactlyOnePath(status.artifactPaths.tasks.logicalPaths, changeId, 'tasks')
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

  await assertImmutableContractRefsForAction(repoRoot, refs, changeId, action, status?.changeRootLogical);
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
): Promise<ActionPackageReviewView | undefined> {
  let stage: 'explore' | 'propose' | 'apply' | undefined;
  switch (action) {
    case 'review-explore':
    case 'revise-explore':
    case 'propose':
      stage = 'explore';
      break;
    case 'review-propose':
    case 'revise-propose':
    case 'apply':
      stage = 'propose';
      break;
    case 'review-apply':
    case 'revise-apply':
    case 'archive':
      stage = 'apply';
      break;
    case 'explore':
      return undefined;
  }
  const review = computeLineage(snapshot.runs, snapshot.reviewVerdicts, changeId, stage).review;
  if (review === null) return undefined;
  const resultRef = await runResultRef(repoRoot, deliveryId, changeId, review.reviewRunId);
  const findings = await readReviewFindingView(repoRoot, deliveryId, changeId, review.reviewRunId);
  return {
    reviewRunId: review.reviewRunId,
    verdict: review.verdict,
    resultRef,
    blockingAuthorities: [...review.blockingAuthorities],
    findings,
  };
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
    result.push({
      id: finding['id'],
      severity: finding['severity'],
      ...(typeof finding['blockingAuthority'] === 'string' && {
        blockingAuthority: finding['blockingAuthority'] as ActionPackageFindingView['blockingAuthority'],
      }),
      ...(typeof finding['title'] === 'string' && { title: finding['title'] }),
      ...(typeof finding['requiredChange'] === 'string' && { requiredOutcome: finding['requiredChange'] }),
    });
  }
  return result;
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
    externalContextFingerprint: input.externalContextFingerprint ?? null,
  };
}

function fingerprintActionPackageSemantics(pkg: ActionPackage): string {
  return sha256(stableStringify(buildSemanticDescriptor({
    deliveryId: pkg.run.deliveryId,
    changeId: pkg.run.changeId,
    action: pkg.run.action,
    definition: pkg.definition,
    contractRefs: pkg.contractRefs,
    handoffRefs: pkg.handoffRefs,
    ...(pkg.reviewView !== undefined && { reviewView: pkg.reviewView }),
    ownerAuthorizationRefs: pkg.ownerAuthorizationRefs,
    ...(pkg.verificationView !== undefined && { verificationView: pkg.verificationView }),
    ...(pkg.externalContextFingerprint !== undefined && { externalContextFingerprint: pkg.externalContextFingerprint }),
  })));
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
  } else if (input.reviewVerdict !== undefined || input.reviewFindings !== undefined) {
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
    ...(input.failureDiagnosis !== undefined && { failureDiagnosis: input.failureDiagnosis }),
    ...(input.cancellationReason !== undefined && { cancellationReason: input.cancellationReason }),
  };
}
