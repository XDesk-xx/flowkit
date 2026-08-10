/**
 * C1 formal-fact-reader-and-persistence: Run persistence — createRun (staging
 * + atomic publish) and writeRunResult (exclusive fs.link publish).
 *
 * createRun (D4): prepares action.md + context.json in a staging directory
 * `.tmp-<runId>/`, validates, then atomically publishes via directory rename.
 * Staging is invisible to Reader.
 *
 * Q1 execution-model-correction: Core-owned ResultRef authority. createRun
 * derives `context.inputRef` from typed descriptors (`consumedRunId` for normal
 * Runs, `reviewedRunId` for review-* Runs). Caller MUST NOT supply a
 * pre-built inputRef. For review-* actions, createRun verifies the reviewed
 * Run's result.json exists and is readable before staging publish (Q1-6).
 *
 * writeRunResult (D5): the SOLE terminal-result publish path. Uses temp-file +
 * `fs.link` for atomic create-if-not-exists (NOT `atomicWriteFile`, which is
 * atomic replace). First writer wins; subsequent writers get `RUN_TERMINAL`.
 *
 * Q1: writeRunResult performs completion preflight (Q1-8) — derives and
 * validates all Core-owned ResultRefs (producedResultRefs, consumedInputRefs,
 * reviewVerdictRef, verificationSummaryRef) before terminal publication.
 *
 * projectCurrentRun (D15): constructs the current Run from context.json as
 * `pending` — the deterministic current-Run projection source.
 */

import { link, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertMutable } from '../domain/terminal.js';
import { validateRun } from '../domain/schema-validator.js';
import type { Run, BlockingAuthority } from '../domain/types.js';
import { BLOCKING_AUTHORITIES } from '../domain/types.js';
import type { ChangeAction } from '../domain/actions.js';
import type { ExecutionStatus, ResultRef, ReviewVerdictValue, Role, RunStatus } from '../domain/types.js';
import { FlowkitError } from '../shared/errors.js';
import { atomicWriteFile } from '../shared/atomic-write.js';
import { normalizeSeparators } from '../shared/paths.js';
import {
  validateContextFile,
  validateContextFileIdentity,
  validateActionResultWithoutRunRef,
  validateRunResultFileCombination,
  validateReviewVerdictIntegrity,
  validateActionResultApplicability,
  admitC1RunResult,
  type ContextFile,
  type ContextFileConstraints,
  type RunResultFile,
  type ActionResultWithoutRunRef,
  type TerminalRunStatus,
} from './serialization.js';
import {
  buildRunResultRef,
  buildArtifactResultRef,
  computeResultFileHash,
  resolveRunResultPath,
  resolveSingletonArtifactRef,
  resolveVerificationSummaryRef,
  enumerateSpecsNamespace,
  readArtifactBytes,
  validateCurrentStageArtifactSet,
  validateRunIdDescriptor,
  validateReviewRunBinding,
  validateSourceReviewTuple,
  PRODUCED_ARTIFACT_KIND,
  VERIFICATION_SUMMARY_KIND,
} from './result-ref-adapter.js';
import {
  artifactStage,
  latestCompletedArtifactRunId,
  type LineageFact,
} from '../facts/generation-resolver.js';
import type { ReviewFinding } from './serialization.js';

// ---------------------------------------------------------------------------
// createRun
// ---------------------------------------------------------------------------

/**
 * Input to {@link createRun}. The caller supplies the Run identity, action.md
 * content, and the filesystem root. C1 computes runPath and the staging path.
 *
 * Q1: Caller provides typed target descriptors (`consumedRunId` for normal
 * Runs, `reviewedRunId` for review-* Runs). Core derives `context.inputRef`
 * from the referenced Run's actual `result.json` content. Caller MUST NOT
 * supply a pre-built `inputRef` — that authority belongs to Core.
 */
export interface CreateRunInput {
  readonly runId: string;
  readonly deliveryId: string;
  /** Every current Standard Run is Change-scoped. */
  readonly changeKey: string;
  readonly changeId: string;
  readonly action: ChangeAction;
  readonly role: Role;
  readonly ownerAuthorization: string;
  /**
   * Q1: Typed descriptor for the Run whose result.json is the input.
   * Core reads this Run's result.json and derives `context.inputRef`.
   * For review-* actions, `reviewedRunId` is used instead. When both are
   * absent, the Run has no input (inputRef is absent).
   */
  readonly consumedRunId?: string;
  readonly sourceReviewRun?: string;
  readonly sourceReviewVerdict?: ReviewVerdictValue;
  /** Required for review-* actions; MUST be absent for non-review (C1-AP-004). */
  readonly reviewedRunId?: string;
  readonly constraints?: ContextFileConstraints;
  /** Content of the action.md file. */
  readonly actionMd: string;
  /**
   * Absolute path to the Delivery's runs directory
   * (`<repoRoot>/.flowkit/runs/<deliveryId>/`).
   */
  readonly deliveryRunsDir: string;
  /**
   * Repository-relative path prefix for runs (e.g. `.flowkit/runs`). Used to
   * compute the `runPath` stored in context.json.
   */
  readonly runsPathPrefix: string;
  /**
   * Q1: Absolute path to the Git repository root. Required for Core to read
   * referenced Run result.json files when deriving inputRef.
   */
  readonly repoRoot: string;
}

/**
 * Create a Run by staging action.md + context.json, validating, then
 * atomically publishing via directory rename.
 *
 * Q1: Core derives `context.inputRef` from `consumedRunId` (normal Runs) or
 * `reviewedRunId` (review-* Runs) by reading the referenced Run's actual
 * `result.json` and computing its SHA-256. For review-* actions, createRun
 * verifies the reviewed result exists and is readable BEFORE staging publish
 * (Q1-6). A missing reviewed result throws `RESULT_REF_TARGET_MISSING` and
 * the Run is not created.
 *
 * @returns The absolute path to the published Run directory.
 * @throws {FlowkitError} on validation failure, staging error, or publish
 *   collision (an existing Run directory at the target path).
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when a referenced Run's
 *   result.json does not exist or is unreadable.
 */
export async function createRun(input: CreateRunInput): Promise<string> {
  // Q2/v6: verificationInputRef is Core-owned. Runtime callers (including
  // untyped JS) must not smuggle a prebuilt ref through an extra property.
  if ('verificationInputRef' in (input as unknown as Record<string, unknown>)) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      'Caller must not provide verificationInputRef; Core derives it at review-apply entry',
      { runId: input.runId, action: input.action },
    );
  }

  validateCreateRunDescriptors(input);

  // 1. Compute the target Run directory and runPath.
  const { runDir, runPath } = computeRunPaths(
    input.deliveryRunsDir,
    input.runsPathPrefix,
    input.deliveryId,
    input.changeId,
    input.runId,
  );

  // 2. Core derives all entry-time refs from typed descriptors / current bytes.
  //    Non-review source-review consumers fall back to sourceReviewRun when
  //    consumedRunId is omitted, so the source review result remains exact-bound
  //    without making the caller construct a ResultRef.
  const inputRef = await deriveInputRef(input);
  const verificationInputRef =
    input.action === 'review-apply'
      ? await deriveVerificationInputRef(input)
      : undefined;

  // 3. Build + validate the ContextFile before any staged publication.
  const contextFile = buildContextFile(input, runPath, inputRef, verificationInputRef);
  validateContextFile(contextFile);
  validateContextFileIdentity(contextFile, runDir);

  // 4. Q2/v6: strictness lives at the Action entry boundary, not in an
  //    all-history Reader replay. Reviews exact-bind their current target; every
  //    Action that consumes a source review validates that review and the
  //    predecessor/current artifacts it is about before the pending Run exists.
  if (input.action.startsWith('review-')) {
    await validateReviewEntry(input, contextFile);
  }
  if (isApprovedReviewConsumerAction(input.action)) {
    await validateConsumedReviewEntry(input, contextFile);
  }
  if (isRevisionAction(input.action)) {
    await validateRevisionEntry(input, contextFile);
  }

  // 5. Prepare staging directory `.tmp-<runId>/`.
  const stagingDir = join(input.deliveryRunsDir, `.tmp-${input.runId}`);
  await bestEffortClean(stagingDir);
  await mkdir(stagingDir, { recursive: true });

  try {
    // 6. Write action.md + context.json into staging via atomicWriteFile.
    const actionMdPath = join(stagingDir, 'action.md');
    const contextJsonPath = join(stagingDir, 'context.json');
    await atomicWriteFile(actionMdPath, input.actionMd);
    await atomicWriteFile(contextJsonPath, serializeContextFile(contextFile));

    // 7. Atomically publish via directory rename.
    //
    // Ensure the parent of runDir exists (e.g. the Change directory for
    // Change-level Runs). The Run directory itself must NOT pre-exist —
    // `rename` over an existing NON-EMPTY directory fails on most platforms
    // (EEXIST / ENOTEMPTY), which is the desired no-replace behavior.
    await mkdir(dirname(runDir), { recursive: true });
    try {
      await rename(stagingDir, runDir);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      // EEXIST/ENOTEMPTY on POSIX; EPERM on Windows when the target exists.
      if (code === 'EEXIST' || code === 'ENOTEMPTY' || code === 'EPERM') {
        // Verify the target actually exists (EPERM can also signal a real
        // permission error; only treat as RUN_DIRECTORY_EXISTS when the
        // directory is present).
        if (await existsDirectory(runDir)) {
          throw new FlowkitError(
            'RUN_DIRECTORY_EXISTS',
            `Run directory already exists: ${runDir}`,
            { runDir, runId: input.runId },
          );
        }
      }
      throw e;
    }
  } catch (e) {
    // Best-effort cleanup of staging on any failure.
    await bestEffortClean(stagingDir);
    throw e;
  }

  return runDir;
}

// ---------------------------------------------------------------------------
// Q1: Core-owned inputRef derivation
// ---------------------------------------------------------------------------

/**
 * Derive `context.inputRef` from typed descriptors.
 *
 * Q1-6: For review-* actions, `reviewedRunId` is REQUIRED. Core reads the
 * reviewed Run's actual `result.json`, computes its SHA-256, and constructs a
 * `run-result` ResultRef. The reviewed result MUST exist and be readable —
 * a missing result throws `RESULT_REF_TARGET_MISSING` BEFORE staging publish.
 *
 * For normal (non-review) actions, `consumedRunId` (when provided) is resolved
 * the same way. When neither descriptor is provided, inputRef is absent.
 *
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when the referenced Run's
 *   result.json does not exist or is unreadable.
 */
function validateCreateRunDescriptors(input: CreateRunInput): void {
  if (isRevisionAction(input.action)) {
    if (input.consumedRunId !== undefined) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `${input.action} uses sourceReviewRun for its review handoff; consumedRunId must be absent`,
        { action: input.action, consumedRunId: input.consumedRunId },
      );
    }
    if (input.sourceReviewRun === undefined || input.sourceReviewVerdict !== 'changes-requested') {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `${input.action} requires sourceReviewRun/sourceReviewVerdict=changes-requested`,
        { action: input.action, sourceReviewRun: input.sourceReviewRun, sourceReviewVerdict: input.sourceReviewVerdict },
      );
    }
  } else {
    if (input.sourceReviewRun !== undefined || input.sourceReviewVerdict !== undefined) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `sourceReviewRun/sourceReviewVerdict are reserved for revise-* Actions; forbidden on ${input.action}`,
        { action: input.action },
      );
    }
  }

  if (isApprovedReviewConsumerAction(input.action) && input.consumedRunId === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `${input.action} requires consumedRunId for its approved Review handoff`,
      { action: input.action },
    );
  }
}

async function deriveInputRef(input: CreateRunInput): Promise<ResultRef | undefined> {
  const isReviewAction = input.action.startsWith('review-');
  const targetRunId = isReviewAction
    ? input.reviewedRunId
    : isRevisionAction(input.action)
      ? input.sourceReviewRun
      : input.consumedRunId;

  if (targetRunId === undefined) {
    // review-* actions MUST have reviewedRunId — but that's enforced by
    // validateContextFile. Here we just return undefined (no inputRef).
    return undefined;
  }

  // Q1-RA-005: reject any path-shaped / non-Run-ID descriptor BEFORE it can
  // influence filesystem resolution. The formal Run-ID grammar is the only
  // legitimate Run descriptor.
  validateRunIdDescriptor(targetRunId);

  // Resolve the referenced Run's result.json filesystem path.
  // The referenced Run is in the same Delivery; it MAY be in a different
  // Change directory. Search both the same-Change path and the Delivery root.
  const resultContent = await readReferencedRunResult(
    input.deliveryRunsDir,
    input.changeId,
    targetRunId,
  );

  // Compute the repo-relative run directory path for buildRunResultRef.
  // resolveRunResultPath returns a path ending with result.json; buildRunResultRef
  // appends result.json itself, so we strip the trailing /result.json.
  const resultPath = resolveRunResultPath(
    input.runsPathPrefix,
    input.deliveryId,
    input.changeId,
    targetRunId,
  );
  const runDirRelative = resultPath.replace(/\/result\.json$/, '');

  return buildRunResultRef(runDirRelative, resultContent);
}

/**
 * Read a referenced Run's result.json content, searching both the same-Change
 * directory and the Delivery root.
 *
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when the result.json is
 *   not found in either location.
 */
async function readReferencedRunResult(
  deliveryRunsDir: string,
  changeId: string,
  runId: string,
): Promise<string> {
  validateRunIdDescriptor(runId);
  const candidate = join(deliveryRunsDir, changeId, runId, 'result.json');
  try {
    return await readFile(candidate, 'utf-8');
  } catch {
    throw new FlowkitError(
      'RESULT_REF_TARGET_MISSING',
      `Referenced Run ${runId} result.json not found or unreadable in Change ${changeId}`,
      { runId, changeId, candidate },
    );
  }
}


// ---------------------------------------------------------------------------
// Q2: local current-handoff entry validation
// ---------------------------------------------------------------------------

function isRevisionAction(action: string): boolean {
  return action === 'revise-explore' || action === 'revise-propose' || action === 'revise-apply';
}

function isApprovedReviewConsumerAction(action: string): boolean {
  return action === 'propose' || action === 'apply' || action === 'archive';
}

function expectedReviewHandoff(action: string): {
  readonly reviewAction: 'review-explore' | 'review-propose' | 'review-apply';
  readonly verdict: ReviewVerdictValue;
  readonly stage?: 'explore' | 'propose';
} | undefined {
  switch (action) {
    case 'propose':
      return { reviewAction: 'review-explore', verdict: 'approved', stage: 'explore' };
    case 'revise-explore':
      return { reviewAction: 'review-explore', verdict: 'changes-requested', stage: 'explore' };
    case 'apply':
      return { reviewAction: 'review-propose', verdict: 'approved', stage: 'propose' };
    case 'revise-propose':
      return { reviewAction: 'review-propose', verdict: 'changes-requested', stage: 'propose' };
    case 'archive':
      return { reviewAction: 'review-apply', verdict: 'approved' };
    case 'revise-apply':
      return { reviewAction: 'review-apply', verdict: 'changes-requested' };
    default:
      return undefined;
  }
}

/** Core-owned review-apply entry binding over the current verification.md. */
async function deriveVerificationInputRef(input: CreateRunInput): Promise<ResultRef> {
  if (input.changeId === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      'review-apply requires changeId to derive verificationInputRef',
      { action: input.action, runId: input.runId },
    );
  }
  const logicalRef = resolveVerificationSummaryRef(input.changeId);
  const content = await readArtifactBytes(input.repoRoot, logicalRef);
  return buildArtifactResultRef(logicalRef, content, VERIFICATION_SUMMARY_KIND);
}

interface AdmittedReviewDescriptor {
  readonly context: ContextFile;
  readonly verdict: ReviewVerdictValue;
  readonly resultContent: string;
  readonly result: RunResultFile;
}

/** Read and exact-bind one completed review Run. */
async function readAdmittedReviewDescriptor(
  repoRoot: string,
  runsPathPrefix: string,
  changeDir: string,
  reviewRunId: string,
): Promise<AdmittedReviewDescriptor> {
  validateRunIdDescriptor(reviewRunId);
  const runDir = join(changeDir, reviewRunId);
  let context: ContextFile;
  let resultContent: string;
  try {
    context = validateContextFile(JSON.parse(await readFile(join(runDir, 'context.json'), 'utf-8')));
    resultContent = await readFile(join(runDir, 'result.json'), 'utf-8');
  } catch (error) {
    if (error instanceof FlowkitError) throw error;
    throw new FlowkitError(
      'RESULT_REF_TARGET_MISSING',
      `Review ${reviewRunId} context/result is missing or unreadable`,
      { reviewRunId, changeDir },
    );
  }
  if (!context.action.startsWith('review-') || context.reviewedRunId === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Run ${reviewRunId} is not an admissible review Run`,
      { reviewRunId, action: context.action },
    );
  }
  const result = admitC1RunResult(resultContent, context.action);
  if (result.runStatus !== 'completed') {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Review ${reviewRunId} must be completed`,
      { reviewRunId, runStatus: result.runStatus },
    );
  }
  if (result.reviewVerdict !== 'approved' && result.reviewVerdict !== 'changes-requested') {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Review ${reviewRunId} has no terminal verdict`,
      { reviewRunId },
    );
  }
  await validateReviewRunBinding({
    runId: context.runId,
    deliveryId: context.deliveryId,
    changeId: context.changeId,
    action: context.action,
    reviewedRunId: context.reviewedRunId,
    inputRef: context.inputRef,
    runsPathPrefix,
    repoRoot,
  });
  return { context, verdict: result.reviewVerdict, resultContent, result };
}

function assertRefEquals(actual: ResultRef | undefined, expected: ResultRef, label: string): void {
  if (
    actual === undefined ||
    actual.kind !== expected.kind ||
    normalizeSeparators(actual.ref) !== normalizeSeparators(expected.ref) ||
    actual.versionFingerprint !== expected.versionFingerprint
  ) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `${label} does not equal the Core-derived expected ResultRef`,
      { label, actual, expected },
    );
  }
}

/** Read a single persisted Run as the minimal lineage fact needed at entry. */
async function readRunLineageFact(
  runDir: string,
  runId: string,
  changeId: string,
): Promise<LineageFact | undefined> {
  let contextRaw: string;
  try {
    contextRaw = await readFile(join(runDir, 'context.json'), 'utf-8');
  } catch {
    return undefined;
  }
  let context: Record<string, unknown>;
  try {
    context = JSON.parse(contextRaw) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  let status: RunStatus = 'pending';
  try {
    const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf-8')) as Record<string, unknown>;
    const terminal = result['runStatus'];
    if (terminal === 'completed' || terminal === 'failed' || terminal === 'cancelled') status = terminal;
  } catch {
    // result.json absent => pending
  }

  const action = typeof context['action'] === 'string' ? context['action'] : '';
  const sourceReviewRun = context['sourceReviewRun'];
  const sourceReviewVerdict = context['sourceReviewVerdict'];
  const reviewedRunId = context['reviewedRunId'];
  return {
    runId,
    changeId,
    action,
    status,
    ...(typeof sourceReviewRun === 'string' && { sourceReviewRun }),
    ...((sourceReviewVerdict === 'approved' || sourceReviewVerdict === 'changes-requested') && { sourceReviewVerdict }),
    ...(typeof reviewedRunId === 'string' && { reviewedRunId }),
  };
}

async function readSiblingLineageFacts(
  changeDir: string,
  excludeRunId: string,
  changeId: string,
): Promise<readonly LineageFact[]> {
  const entries = await readVisibleEntries(changeDir);
  const facts: LineageFact[] = [];
  for (const entry of entries) {
    if (entry === excludeRunId || !looksLikeRunIdEntry(entry)) continue;
    const runDir = join(changeDir, entry);
    if (!(await existsDirectory(runDir))) continue;
    const fact = await readRunLineageFact(runDir, entry, changeId);
    if (fact !== undefined) facts.push(fact);
  }
  return facts;
}

/** Read a producer Run's complete Core-owned producedResultRefs. */
async function readRunProducedResultRefs(runDir: string): Promise<ResultRef[]> {
  let content: string;
  try {
    content = await readFile(join(runDir, 'result.json'), 'utf-8');
  } catch (error) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Reviewed Run result.json missing or unreadable: ${(error as Error).message}`,
      { runDir },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Reviewed Run result.json is not valid JSON: ${(error as Error).message}`,
      { runDir },
    );
  }
  const actionResult = (parsed as Record<string, unknown>)['actionResult'];
  if (actionResult === undefined || typeof actionResult !== 'object' || actionResult === null) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'Reviewed producer has no actionResult', { runDir });
  }
  const refs = (actionResult as Record<string, unknown>)['producedResultRefs'];
  if (!Array.isArray(refs)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'Reviewed producer has no producedResultRefs array', { runDir });
  }
  return (refs as Array<Record<string, unknown>>).map((ref, index) => {
    if (typeof ref['ref'] !== 'string' || typeof ref['versionFingerprint'] !== 'string') {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `Reviewed producer producedResultRefs[${index}] is malformed`,
        { runDir, index },
      );
    }
    return {
      ref: ref['ref'] as string,
      versionFingerprint: ref['versionFingerprint'] as string,
      ...(typeof ref['kind'] === 'string' && { kind: ref['kind'] as ResultRef['kind'] }),
    };
  });
}

/**
 * Current-stage handoff check. It is local to entry/review completion and does
 * not persist a generation class or replay historical refs in future snapshots.
 */
async function validateReviewedStageCurrentBytes(
  repoRoot: string,
  changeDir: string,
  changeId: string,
  reviewedRunId: string,
  expectedStage: 'explore' | 'propose',
  excludeRunId = '',
): Promise<void> {
  const reviewedDir = join(changeDir, reviewedRunId);
  const reviewed = await readRunLineageFact(reviewedDir, reviewedRunId, changeId);
  if (
    reviewed === undefined ||
    reviewed.status !== 'completed' ||
    artifactStage(reviewed.action) !== expectedStage
  ) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `Reviewed Run ${reviewedRunId} is not a completed ${expectedStage} producer`,
      { reviewedRunId, expectedStage, action: reviewed?.action, status: reviewed?.status },
    );
  }

  const siblings = await readSiblingLineageFacts(changeDir, excludeRunId, changeId);
  const latest = latestCompletedArtifactRunId(siblings, changeId, expectedStage);
  if (latest !== reviewedRunId) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `Reviewed Run ${reviewedRunId} is not the latest completed ${expectedStage} producer`,
      { reviewedRunId, latestRunId: latest, expectedStage },
    );
  }

  const refs = await readRunProducedResultRefs(reviewedDir);
  const problems = await validateCurrentStageArtifactSet(repoRoot, changeId, expectedStage, refs);
  if (problems.length > 0) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `Reviewed ${expectedStage} producer ${reviewedRunId} no longer matches current OpenSpec bytes: ${problems.map((problem) => problem.message).join('; ')}`,
      { reviewedRunId, expectedStage, problems },
    );
  }
}

async function validateReviewedRunAction(
  changeDir: string,
  changeId: string,
  reviewedRunId: string,
  allowedActions: readonly string[],
): Promise<void> {
  const fact = await readRunLineageFact(join(changeDir, reviewedRunId), reviewedRunId, changeId);
  if (fact === undefined || fact.status !== 'completed' || !allowedActions.includes(fact.action)) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `Reviewed Run ${reviewedRunId} must be a completed ${allowedActions.join('/')} Run`,
      { reviewedRunId, action: fact?.action, status: fact?.status },
    );
  }
}

async function validateReviewVerificationSummaryCurrent(
  descriptor: AdmittedReviewDescriptor,
  repoRoot: string,
): Promise<void> {
  const ref = descriptor.result.actionResult?.verificationSummaryRef;
  if (ref === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `review-apply ${descriptor.context.runId} has no verificationSummaryRef`,
      { reviewRunId: descriptor.context.runId },
    );
  }
  await verifyArtifactRef(ref, repoRoot, descriptor.context.runId, 'verificationSummaryRef');
}

/** Review entry: exact-bind immutable target; artifact reviews also bind current bytes. */
async function validateReviewEntry(input: CreateRunInput, contextFile: ContextFile): Promise<void> {
  if (input.reviewedRunId === undefined || input.changeId === undefined) return;

  await validateReviewRunBinding({
    runId: contextFile.runId,
    deliveryId: contextFile.deliveryId,
    changeId: contextFile.changeId,
    action: contextFile.action,
    reviewedRunId: contextFile.reviewedRunId,
    inputRef: contextFile.inputRef,
    runsPathPrefix: input.runsPathPrefix,
    repoRoot: input.repoRoot,
  });

  const changeDir = join(input.deliveryRunsDir, input.changeId);
  if (input.action === 'review-explore' || input.action === 'review-propose') {
    await validateReviewedStageCurrentBytes(
      input.repoRoot,
      changeDir,
      input.changeId,
      input.reviewedRunId,
      input.action === 'review-explore' ? 'explore' : 'propose',
      input.runId,
    );
    return;
  }

  if (input.action === 'review-apply') {
    await validateReviewedRunAction(changeDir, input.changeId, input.reviewedRunId, ['apply', 'revise-apply']);
    if (contextFile.verificationInputRef === undefined) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'review-apply missing verificationInputRef', { runId: input.runId });
    }
    await verifyArtifactRef(contextFile.verificationInputRef, input.repoRoot, input.runId, 'verificationInputRef');
  }
}

/** Approved Review → propose/apply/archive one-shot entry handoff. */
async function validateConsumedReviewEntry(input: CreateRunInput, contextFile: ContextFile): Promise<void> {
  if (!isApprovedReviewConsumerAction(input.action)) return;
  const contract = expectedReviewHandoff(input.action)!;
  if (input.changeId === undefined || input.consumedRunId === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `${input.action} requires consumedRunId for its approved Review handoff`,
      { action: input.action, consumedRunId: input.consumedRunId },
    );
  }
  const changeDir = join(input.deliveryRunsDir, input.changeId);
  const review = await readAdmittedReviewDescriptor(
    input.repoRoot,
    input.runsPathPrefix,
    changeDir,
    input.consumedRunId,
  );
  if (review.context.action !== contract.reviewAction || review.verdict !== contract.verdict) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `${input.action} must consume ${contract.reviewAction}/${contract.verdict}`,
      { action: input.action, consumedRunId: input.consumedRunId, reviewAction: review.context.action, verdict: review.verdict },
    );
  }
  const expectedRef = buildRunResultRef(
    resolveRunResultPath(input.runsPathPrefix, input.deliveryId, input.changeId, input.consumedRunId).replace(/\/result\.json$/, ''),
    review.resultContent,
  );
  assertRefEquals(contextFile.inputRef, expectedRef, `${input.action}.inputRef/consumedRunId`);

  if (contract.stage !== undefined) {
    await validateReviewedStageCurrentBytes(
      input.repoRoot,
      changeDir,
      input.changeId,
      review.context.reviewedRunId!,
      contract.stage,
      input.runId,
    );
  } else {
    await validateReviewVerificationSummaryCurrent(review, input.repoRoot);
  }
}

/** Author-only changes-requested Review → revise-* entry handoff. */
async function validateRevisionEntry(input: CreateRunInput, contextFile: ContextFile): Promise<void> {
  if (!isRevisionAction(input.action)) return;
  const contract = expectedReviewHandoff(input.action)!;
  if (
    input.changeId === undefined ||
    input.sourceReviewRun === undefined ||
    input.sourceReviewVerdict !== 'changes-requested'
  ) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `${input.action} requires matching sourceReviewRun/sourceReviewVerdict=changes-requested`,
      { action: input.action, sourceReviewRun: input.sourceReviewRun, sourceReviewVerdict: input.sourceReviewVerdict },
    );
  }
  const changeDir = join(input.deliveryRunsDir, input.changeId);
  const review = await readAdmittedReviewDescriptor(
    input.repoRoot,
    input.runsPathPrefix,
    changeDir,
    input.sourceReviewRun,
  );
  if (
    review.context.action !== contract.reviewAction ||
    review.verdict !== 'changes-requested' ||
    contextFile.sourceReviewVerdict !== 'changes-requested'
  ) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `${input.action} source review must be ${contract.reviewAction}/changes-requested`,
      { action: input.action, sourceReviewRun: input.sourceReviewRun, reviewAction: review.context.action, verdict: review.verdict },
    );
  }
  const blockingAuthorities = deriveBlockingAuthoritiesFromReviewResult(review.result);
  if (blockingAuthorities.length === 0 || blockingAuthorities.some((authority) => authority !== 'author')) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `${input.action} requires an author-only changes-requested source review`,
      { action: input.action, sourceReviewRun: input.sourceReviewRun, blockingAuthorities },
    );
  }
  const expectedRef = buildRunResultRef(
    resolveRunResultPath(input.runsPathPrefix, input.deliveryId, input.changeId, input.sourceReviewRun).replace(/\/result\.json$/, ''),
    review.resultContent,
  );
  assertRefEquals(contextFile.inputRef, expectedRef, `${input.action}.inputRef/sourceReviewRun`);

  if (contract.stage !== undefined) {
    await validateReviewedStageCurrentBytes(
      input.repoRoot,
      changeDir,
      input.changeId,
      review.context.reviewedRunId!,
      contract.stage,
      input.runId,
    );
  } else {
    await validateReviewVerificationSummaryCurrent(review, input.repoRoot);
  }
}

function deriveBlockingAuthoritiesFromReviewResult(result: RunResultFile): readonly BlockingAuthority[] {
  if (result.reviewVerdict !== 'changes-requested') return [];
  const seen = new Set<BlockingAuthority>();
  for (const finding of result.reviewFindings ?? []) {
    if (finding.severity === 'blocking' && finding.blockingAuthority !== undefined) seen.add(finding.blockingAuthority);
  }
  return BLOCKING_AUTHORITIES.filter((authority) => seen.has(authority));
}

/** Read an admitted review verdict for source-review tuple completion validation. */
async function readRunVerdict(runDir: string): Promise<ReviewVerdictValue | undefined> {
  let content: string;
  try {
    content = await readFile(join(runDir, 'result.json'), 'utf-8');
  } catch {
    return undefined;
  }
  let context: ContextFile;
  try {
    context = validateContextFile(JSON.parse(await readFile(join(runDir, 'context.json'), 'utf-8')));
  } catch {
    return undefined;
  }
  if (!context.action.startsWith('review-') || context.reviewedRunId === undefined) return undefined;
  try {
    admitC1RunResult(content, context.action);
    await validateReviewRunBinding({
      runId: context.runId,
      deliveryId: context.deliveryId,
      changeId: context.changeId,
      action: context.action,
      reviewedRunId: context.reviewedRunId,
      inputRef: context.inputRef,
      runsPathPrefix: deriveRunsPathPrefix(context),
      repoRoot: deriveRepoRoot(runDir, context.runPath),
    });
  } catch {
    return undefined;
  }
  const verdict = (JSON.parse(content) as Record<string, unknown>)['reviewVerdict'];
  return verdict === 'approved' || verdict === 'changes-requested' ? verdict : undefined;
}

function looksLikeRunIdEntry(name: string): boolean {
  return /^\d{8}-\d{3}-[a-z][a-z-]*$/.test(name);
}

// ---------------------------------------------------------------------------
// projectCurrentRun (deterministic current-Run projection)
// ---------------------------------------------------------------------------

/**
 * Construct the current {@link Run} from a {@link ContextFile} as `pending`
 * (D15). The Run's `runId`, `deliveryId`, `changeId`, `action`, `role` come
 * from the ContextFile; `status` is `pending`; `inputRef` maps directly.
 *
 * The constructed Run MUST pass B1 `validateRun`.
 */
export function projectCurrentRun(contextFile: ContextFile): Run {
  const run: Run = {
    runId: contextFile.runId,
    deliveryId: contextFile.deliveryId,
    action: contextFile.action,
    role: contextFile.role,
    status: 'pending',
    changeId: contextFile.changeId,
    ...(contextFile.inputRef !== undefined && { inputRef: contextFile.inputRef }),
  };
  // MUST pass B1 validateRun.
  validateRun(run);
  return run;
}

// ---------------------------------------------------------------------------
// writeRunResult
// ---------------------------------------------------------------------------

/**
 * PRIVATE terminal-result publisher (Q1-RA-001).
 *
 * This is the low-level publish protocol (fs.link create-if-not-exists) shared
 * by the descriptor-driven {@link completeRun}. It is intentionally NOT
 * exported: an external caller must never be able to pass a caller-authored
 * {@link RunResultFile} (and therefore caller-built ResultRefs) into the
 * terminal publisher. All terminal completion MUST enter through the
 * descriptor-driven {@link completeRun}, where Core derives every ResultRef.
 *
 * Steps:
 *   1. Read context.json → validate C1 ContextFile + identity (C1-AP-002).
 *   2. Read existing result.json (if present) → reconstruct the CURRENT
 *      persisted Run status. `assertMutable` observes the real persisted
 *      state, not a freshly projected `pending` Run (C1-AP-002).
 *   3. `assertMutable(currentRun)` — rejects terminal Runs based on the
 *      persisted result.json, before any publication attempt.
 *   4. Validate RunResultFile combination + actionResult projection.
 *   5. Serialize to JSON (runRef omitted — it is ActionResultWithoutRunRef).
 *   6. Write temp file `.result-tmp-<pid>-<timestamp>.json`.
 *   7. `fs.link(temp, result.json)` — atomic create-if-not-exists (race-safe).
 *   8. EEXIST ⇒ delete temp ⇒ throw `RUN_TERMINAL` (concurrent writer won).
 *
 * The race-safe fs.link publication is preserved: even if two writers pass
 * assertMutable (both see no result.json), exactly one fs.link succeeds. The
 * assertMutable check is the fast-path rejection for the common single-writer
 * "Run already terminal" case; fs.link is the concurrency invariant.
 *
 * @param runDir - Absolute path to the Run directory.
 * @param result - The RunResultFile object (NOT a JSON string).
 * @throws {FlowkitError} `RUN_TERMINAL` when result.json already exists
 *   (detected by assertMutable on the persisted terminal status, or by fs.link
 *   EEXIST for the concurrent-writer race).
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on validation failure.
 */
async function writeRunResult(
  runDir: string,
  result: RunResultFile,
): Promise<void> {
  // 1. Read context.json → validate C1 schema + identity (C1-AP-002).
  const contextFile = await readContextFile(runDir);
  validateContextFileIdentity(contextFile, runDir);

  // 2. Delegate to the shared publish primitive.
  await publishTerminalResult(runDir, contextFile, result);
}

/**
 * Shared terminal-result publish primitive (Q1-RA-001).
 *
 * Performs the full publish sequence shared by the low-level
 * {@link writeRunResult} and the descriptor-driven {@link completeRun}:
 *   1. Reconstruct the CURRENT persisted Run status + `assertMutable`.
 *   2. Validate RunResultFile combination + actionResult projection.
 *   3. Validate review verdict integrity (C1-AP-006).
 *   4. Q1-8 completion preflight — validate Core-owned ResultRefs against
 *      actual file content.
 *   5. Serialize + temp-file + `fs.link` (atomic create-if-not-exists).
 *
 * The race-safe fs.link publication is preserved: even if two writers pass
 * assertMutable (both see no result.json), exactly one fs.link succeeds.
 *
 * @throws {FlowkitError} `RUN_TERMINAL` when result.json already exists.
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on validation failure.
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` / `RESULT_REF_MISMATCH`
 *   on preflight failure (Run stays pending).
 */
async function publishTerminalResult(
  runDir: string,
  contextFile: ContextFile,
  result: RunResultFile,
): Promise<void> {
  // 1. Reconstruct the CURRENT persisted Run status.
  //    - result.json absent → status=pending (projected from ContextFile).
  //    - result.json present → status=runStatus (terminal; reconstructed from
  //      the persisted RunResultFile so assertMutable observes the real
  //      persisted state, not a freshly projected pending Run — C1-AP-002).
  const currentRun = await reconstructCurrentRun(contextFile, runDir);

  // 2. assertMutable — rejects terminal Runs based on persisted state.
  //    Throws RUN_TERMINAL when result.json already exists with a terminal
  //    status, BEFORE any publication attempt.
  assertMutable(currentRun);

  // 3. Validate combination + actionResult projection.
  validateRunResultFileCombination(result);
  if (result.actionResult !== undefined) {
    validateActionResultWithoutRunRef(result.actionResult);
  }

  // 3b. Validate review verdict integrity before publication (C1-AP-006).
  //     completed review-* Runs MUST carry reviewVerdict; non-review or
  //     non-completed Runs MUST NOT. Detecting a missing verdict only at
  //     Reader time is too late — the result is already terminal and immutable.
  validateReviewVerdictIntegrity(contextFile.action, result);

  // 3c. Q1-8: Completion preflight — validate all Core-owned ResultRefs
  //     against actual file content before terminal publication. Target
  //     missing → RESULT_REF_TARGET_MISSING (Run stays pending). Hash
  //     mismatch → RESULT_REF_MISMATCH (Run stays pending). This allows
  //     retry after correction (Q1-6.8). assertMutable + fs.link create-once
  //     remains the terminal invariant (Q1-6.9).
  if (result.actionResult !== undefined) {
    const repoRoot = deriveRepoRoot(runDir, contextFile.runPath);
    await completionPreflight(contextFile, result.actionResult, repoRoot, result.runStatus);
  }

  // 4. Serialize (runRef already absent from ActionResultWithoutRunRef).
  const json = serializeRunResultFile(result);

  // 5. Write temp file.
  const tempPath = join(
    runDir,
    `.result-tmp-${process.pid}-${Date.now()}.json`,
  );
  await writeFile(tempPath, json, 'utf-8');

  // 6. fs.link — atomic create-if-not-exists.
  const resultPath = join(runDir, 'result.json');
  try {
    await link(tempPath, resultPath);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      // 7. Concurrent writer won the race — clean temp, throw RUN_TERMINAL.
      //    assertMutable and fs.link together cover both the single-writer
      //    fast path and the multi-writer race.
      await bestEffortUnlink(tempPath);
      throw new FlowkitError(
        'RUN_TERMINAL',
        `Run ${currentRun.runId} is already terminal (result.json exists)`,
        { runId: currentRun.runId, resultPath },
      );
    }
    // Other errors: clean temp then rethrow.
    await bestEffortUnlink(tempPath);
    throw e;
  }

  // 8. Success: temp is now linked as result.json; clean the temp name
  // (best-effort — the link created a second name for the same inode, removing
  // it leaves result.json intact).
  await bestEffortUnlink(tempPath);
}

// ---------------------------------------------------------------------------
// Q1-RA-001: completeRun — descriptor-driven terminal write (production API)
// ---------------------------------------------------------------------------

/**
 * Descriptor-driven terminal completion input.
 *
 * Q2: callers describe only terminal intent and immutable Run inputs. Core
 * derives every ResultRef from current authority bytes; callers cannot declare
 * artifact subsets or construct refs/fingerprints themselves.
 */
export interface CompleteRunInput {
  /** ActionResult.executionStatus. Required for `completed` Runs. */
  readonly executionStatus?: ExecutionStatus;
  /** ActionResult.summary. Required for `completed` Runs. */
  readonly summary?: string;
  /** Typed descriptors: Run IDs whose `result.json` is consumed as input. */
  readonly consumedRunIds?: readonly string[];
  /** Reviewer-owned verdict (completed `review-*` Runs only). */
  readonly reviewVerdict?: ReviewVerdictValue;
  /** Reviewer-owned findings (completed `review-*` Runs only). */
  readonly reviewFindings?: readonly ReviewFinding[];
  /** Present → `runStatus = failed` (no actionResult). */
  readonly failureDiagnosis?: string;
  /** Present → `runStatus = cancelled` (no actionResult). */
  readonly cancellationReason?: string;
}

/**
 * Descriptor-driven terminal completion.
 *
 * Artifact-producing Actions always persist a complete point-in-time output
 * set from current OpenSpec bytes. `review-apply` derives its terminal
 * verificationSummaryRef from the same verification.md generation frozen in
 * context.verificationInputRef at review entry.
 */
export async function completeRun(
  runDir: string,
  input: CompleteRunInput,
): Promise<void> {
  const contextFile = await readContextFile(runDir);
  validateContextFileIdentity(contextFile, runDir);
  validateCompleteRunInput(contextFile, input);
  const result = await buildRunResultFromDescriptors(contextFile, runDir, input);
  await writeRunResult(runDir, result);
}

/** Runtime-validate caller descriptors before filesystem resolution. */
function validateCompleteRunInput(
  contextFile: ContextFile,
  input: CompleteRunInput,
): void {
  // Q2 removes caller-owned changed-artifact bookkeeping entirely. Reject the
  // legacy field even from untyped JS callers instead of silently ignoring it.
  if ('producedArtifactTags' in (input as unknown as Record<string, unknown>)) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      'completeRun: producedArtifactTags is removed; Core derives the complete current artifact set',
      { action: contextFile.action, runId: contextFile.runId },
    );
  }

  if (input.consumedRunIds !== undefined) {
    for (const runId of input.consumedRunIds) {
      validateRunIdDescriptor(runId);
    }
  }
}

async function buildRunResultFromDescriptors(
  contextFile: ContextFile,
  runDir: string,
  input: CompleteRunInput,
): Promise<RunResultFile> {
  const action = contextFile.action;
  const isReviewAction = action.startsWith('review-');

  let runStatus: TerminalRunStatus;
  if (input.failureDiagnosis !== undefined) {
    runStatus = 'failed';
  } else if (input.cancellationReason !== undefined) {
    runStatus = 'cancelled';
  } else {
    runStatus = 'completed';
  }

  if (runStatus !== 'completed') {
    return {
      runStatus,
      ...(runStatus === 'failed' && { failureDiagnosis: input.failureDiagnosis }),
      ...(runStatus === 'cancelled' && { cancellationReason: input.cancellationReason }),
    };
  }

  if (input.executionStatus === undefined || input.summary === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `completeRun completed Run requires executionStatus and summary (action=${action})`,
      { action, runId: contextFile.runId },
    );
  }

  const repoRoot = deriveRepoRoot(runDir, contextFile.runPath);
  const actionResult = await deriveActionResult(contextFile, runDir, repoRoot, input);
  return {
    runStatus: 'completed',
    actionResult,
    ...(isReviewAction && input.reviewVerdict !== undefined && { reviewVerdict: input.reviewVerdict }),
    ...(isReviewAction && input.reviewFindings !== undefined && { reviewFindings: input.reviewFindings }),
  };
}

/** Derive the complete ActionResult from Core-owned authority bytes. */
async function deriveActionResult(
  contextFile: ContextFile,
  runDir: string,
  repoRoot: string,
  input: CompleteRunInput,
): Promise<ActionResultWithoutRunRef> {
  const action = contextFile.action;
  const isReviewAction = action.startsWith('review-');

  let producedResultRefs: readonly ResultRef[] | undefined;
  if (action === 'explore' || action === 'revise-explore') {
    producedResultRefs = await deriveExploreProducedRefs(contextFile, repoRoot);
  } else if (action === 'propose' || action === 'revise-propose') {
    producedResultRefs = await deriveProposeProducedRefs(contextFile, repoRoot);
  }

  let consumedInputRefs: readonly ResultRef[] | undefined;
  if (input.consumedRunIds !== undefined && input.consumedRunIds.length > 0) {
    consumedInputRefs = await deriveConsumedInputRefs(contextFile, runDir, input.consumedRunIds);
  }

  // sourceReviewRun belongs only to revise-* and is immutable lineage evidence.
  let reviewVerdictRef: ResultRef | undefined;
  if (!isReviewAction && isRevisionAction(action) && contextFile.sourceReviewRun !== undefined) {
    reviewVerdictRef = await deriveReviewVerdictRef(contextFile, runDir);
  }

  let verificationSummaryRef: ResultRef | undefined;
  if (action === 'review-apply') {
    verificationSummaryRef = await deriveVerificationSummaryArtifactRef(contextFile, repoRoot);
  }

  return {
    action: action as ChangeAction,
    executionStatus: input.executionStatus!,
    summary: input.summary!,
    ...(producedResultRefs !== undefined && { producedResultRefs }),
    ...(consumedInputRefs !== undefined && { consumedInputRefs }),
    ...(reviewVerdictRef !== undefined && { reviewVerdictRef }),
    ...(verificationSummaryRef !== undefined && { verificationSummaryRef }),
  };
}

/** Complete point-in-time output set for explore/revise-explore. */
async function deriveExploreProducedRefs(
  contextFile: ContextFile,
  repoRoot: string,
): Promise<ResultRef[]> {
  requireChangeId(contextFile, 'explore');
  const ref = await buildSingletonArtifactRef(
    contextFile.action,
    'explore',
    contextFile.changeId!,
    repoRoot,
  );
  return [ref];
}

/**
 * Complete point-in-time output set for propose/revise-propose.
 * No predecessor inheritance, changed-tag subset, or generation overlay exists.
 */
async function deriveProposeProducedRefs(
  contextFile: ContextFile,
  repoRoot: string,
): Promise<ResultRef[]> {
  requireChangeId(contextFile, contextFile.action);
  const changeId = contextFile.changeId!;
  const action = contextFile.action;
  const refs: ResultRef[] = [];
  refs.push(await buildSingletonArtifactRef(action, 'proposal', changeId, repoRoot));
  refs.push(await buildSingletonArtifactRef(action, 'design', changeId, repoRoot));
  refs.push(await buildSingletonArtifactRef(action, 'tasks', changeId, repoRoot));
  refs.push(...await enumerateSpecsNamespace(repoRoot, changeId));
  refs.sort((a, b) => a.ref.localeCompare(b.ref));
  return refs;
}

/**
 * Derive `consumedInputRefs` from typed Run IDs. Each Run's `result.json` is
 * read and a `run-result` ref is built from its current bytes.
 */
async function deriveConsumedInputRefs(
  contextFile: ContextFile,
  runDir: string,
  consumedRunIds: readonly string[],
): Promise<ResultRef[]> {
  const deliveryRunsDir = deriveDeliveryRunsDir(runDir);
  const runsPathPrefix = deriveRunsPathPrefix(contextFile);
  const refs: ResultRef[] = [];
  for (const runId of consumedRunIds) {
    const content = await readReferencedRunResult(
      deliveryRunsDir,
      contextFile.changeId,
      runId,
    );
    const runDirRelative = resolveRunResultPath(
      runsPathPrefix,
      contextFile.deliveryId,
      contextFile.changeId,
      runId,
    ).replace(/\/result\.json$/, '');
    refs.push(buildRunResultRef(runDirRelative, content));
  }
  return refs;
}

/**
 * Derive `reviewVerdictRef` from `context.sourceReviewRun` (the prior review
 * being addressed by a `revise-*` / `apply` Run). Reads that review Run's
 * `result.json` and builds a `run-result` ref from its current bytes.
 */
async function deriveReviewVerdictRef(
  contextFile: ContextFile,
  runDir: string,
): Promise<ResultRef> {
  if (contextFile.sourceReviewRun === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `completeRun cannot derive reviewVerdictRef: sourceReviewRun absent (action=${contextFile.action})`,
      { action: contextFile.action, runId: contextFile.runId },
    );
  }
  const deliveryRunsDir = deriveDeliveryRunsDir(runDir);
  const runsPathPrefix = deriveRunsPathPrefix(contextFile);
  const content = await readReferencedRunResult(
    deliveryRunsDir,
    contextFile.changeId,
    contextFile.sourceReviewRun,
  );
  const runDirRelative = resolveRunResultPath(
    runsPathPrefix,
    contextFile.deliveryId,
    contextFile.changeId,
    contextFile.sourceReviewRun,
  ).replace(/\/result\.json$/, '');
  return buildRunResultRef(runDirRelative, content);
}

/**
 * Derive `verificationSummaryRef` for `review-apply` from current
 * `verification.md`. Core resolves `openspec/changes/<changeId>/verification.md`
 * from the current canonical path, reads its bytes, and builds a
 * `verification-summary` ref. Missing/unreadable/ambiguous →
 * `RESULT_REF_TARGET_MISSING` (Run stays pending).
 */
async function deriveVerificationSummaryArtifactRef(
  contextFile: ContextFile,
  repoRoot: string,
): Promise<ResultRef> {
  requireChangeId(contextFile, 'review-apply');
  const logicalRef = resolveVerificationSummaryRef(contextFile.changeId!);
  const content = await readArtifactBytes(repoRoot, logicalRef);
  return buildArtifactResultRef(logicalRef, content, VERIFICATION_SUMMARY_KIND);
}

// ---------------------------------------------------------------------------
// Q1-RA-001 derivation helpers
// ---------------------------------------------------------------------------

/**
 * Build a singleton produced-artifact ref: resolve the tag → logical ref, read
 * current bytes, construct a `produced-artifact` ResultRef.
 */
async function buildSingletonArtifactRef(
  action: string,
  tag: 'explore' | 'proposal' | 'design' | 'tasks',
  changeId: string,
  repoRoot: string,
): Promise<ResultRef> {
  const logicalRef = resolveSingletonArtifactRef(action, tag, changeId);
  const content = await readArtifactBytes(repoRoot, logicalRef);
  return buildArtifactResultRef(logicalRef, content, PRODUCED_ARTIFACT_KIND);
}

/**
 * Require `context.changeId` for an action that produces Change artifacts.
 */
function requireChangeId(contextFile: ContextFile, action: string): void {
  if (contextFile.changeId === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `${action} Run requires changeId to derive produced artifacts (runId=${contextFile.runId})`,
      { action, runId: contextFile.runId },
    );
  }
}

/**
 * Derive the Delivery runs directory (parent of all Run directories for this
 * Delivery) from the absolute Run directory + ContextFile.
 *
 * Current ContextFile is Change-only, so `runDir` is always
 * `<deliveryRunsDir>/<changeId>/<runId>`. Historical Delivery-level layouts
 * are handled by bounded legacy readers, not by current result persistence.
 */
function deriveDeliveryRunsDir(runDir: string): string {
  return dirname(dirname(runDir));
}

/**
 * Derive the repo-relative runs path prefix (e.g. `.flowkit/runs`) from the
 * ContextFile `runPath`. `runPath = <prefix>/<deliveryId>/<changeId?>/<runId>/`.
 */
function deriveRunsPathPrefix(contextFile: ContextFile): string {
  const rp = normalizeSeparators(contextFile.runPath).replace(/\/+$/, '');
  const marker = `/${contextFile.deliveryId}/`;
  const idx = rp.indexOf(marker);
  return idx >= 0 ? rp.slice(0, idx) : '.flowkit/runs';
}

/**
 * Reconstruct the CURRENT persisted {@link Run} from `context.json` and, when
 * present, `result.json`. Used by {@link writeRunResult} so `assertMutable`
 * observes the real persisted status rather than a freshly projected `pending`
 * Run (C1-AP-002).
 *
 * - result.json absent → projected Run with `status: pending` (D15).
 * - result.json present → projected Run with `status` reconstructed from the
 *   persisted `RunResultFile.runStatus`. A malformed result.json (missing
 *   runStatus or invalid value) throws `SCHEMA_VALIDATION_FAILED` — the
 *   persisted state is inconsistent and MUST NOT be silently overwritten.
 */
async function reconstructCurrentRun(
  contextFile: ContextFile,
  runDir: string,
): Promise<Run> {
  const pendingRun = projectCurrentRun(contextFile);
  const resultPath = join(runDir, 'result.json');
  let existing: string;
  try {
    existing = await readFile(resultPath, 'utf-8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // result.json genuinely absent → current status is pending.
      return pendingRun;
    }
    // Non-ENOENT error (EACCES, EISDIR, etc.) — the persisted state is
    // inconsistent and MUST NOT be silently treated as absent (C1-AP-005).
    // Throwing SCHEMA_VALIDATION_FAILED prevents overwriting an unreadable
    // result.json that may genuinely exist with a terminal status.
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Cannot read existing result.json (errno=${code}): ${(e as Error).message}`,
      { runDir, resultPath, errno: code },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch (e) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `result.json is not valid JSON: ${(e as Error).message}`,
      { runDir, resultPath },
    );
  }
  const obj = parsed as Record<string, unknown>;
  const runStatus = obj['runStatus'];
  if (
    runStatus !== 'completed' &&
    runStatus !== 'failed' &&
    runStatus !== 'cancelled'
  ) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `result.json.runStatus must be completed|failed|cancelled for an existing terminal Run (got ${String(runStatus)})`,
      { runDir, runStatus },
    );
  }
  return { ...pendingRun, status: runStatus };
}

// ---------------------------------------------------------------------------
// Q1-8: Completion preflight
// ---------------------------------------------------------------------------

/**
 * Derive the repository root from the absolute Run directory path and the
 * repo-relative runPath stored in context.json.
 *
 * `runDir` = `<repoRoot>/<runPath-without-trailing-slash>`.
 * This function removes the runPath suffix from runDir to recover repoRoot.
 */
function deriveRepoRoot(runDir: string, runPath: string): string {
  const normalizedRunDir = normalizeSeparators(runDir).replace(/\/+$/, '');
  const normalizedRunPath = normalizeSeparators(runPath).replace(/\/+$/, '');
  // Remove runPath from the end of runDir.
  if (normalizedRunDir.endsWith(normalizedRunPath)) {
    const root = normalizedRunDir.slice(0, -normalizedRunPath.length).replace(/\/+$/, '');
    return root.length > 0 ? root : normalizedRunDir;
  }
  // Fallback: if runPath is not a suffix (shouldn't happen with valid data),
  // return the runDir's parent's parent as a best-effort repoRoot.
  return normalizedRunDir;
}

/**
 * Q1-8: Completion preflight — validate all Core-owned ResultRefs in the
 * actionResult against actual file content before terminal publication.
 *
 * Validations:
 *   1. **ResultRef content validation**: For each ResultRef present in
 *      producedResultRefs, consumedInputRefs, verificationSummaryRef,
 *      reviewVerdictRef — resolve to filesystem path, read actual content,
 *      verify SHA-256 matches. Missing → RESULT_REF_TARGET_MISSING.
 *      Mismatch → RESULT_REF_MISMATCH.
 *   2. **inputRef re-verification** (Q1-6): For review-* Runs, re-read the
 *      reviewed Run's result.json and verify context.inputRef still matches.
 *   3. **Initial artifact completeness** (Q1-5.0): For initial explore/propose,
 *      verify producedResultRefs covers the complete Core-enumerated expected
 *      set (explore.md for explore; proposal+design+tasks+specs/** for propose).
 *   4. **reviewVerdictRef self-reference rejection** (Q1-7): review-* Runs
 *      MUST NOT carry reviewVerdictRef.
 *   5. **verificationSummaryRef scope** (Q1-9): Only review-apply carries
 *      verificationSummaryRef; apply/revise-apply/archive MUST NOT.
 *
 * On any failure, this function throws and writeRunResult does NOT serialize
 * or publish — the Run stays pending and can be retried (Q1-6.8).
 *
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when a referenced file
 *   does not exist.
 * @throws {FlowkitError} `RESULT_REF_MISMATCH` when a referenced file's
 *   content hash does not match the stored fingerprint.
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on structural violations.
 */
/**
 * Q1-RA-007: Read the ADMITTED verdict of a referenced source review Run.
 *
 * Only a source review whose C1 result passed full closed-schema admission AND
 * whose exact binding (reviewedRunId ↔ inputRef target ↔ actual bytes) is proven
 * yields a verdict here (readRunVerdict returns `undefined` otherwise). The
 * shared source-review tuple validator treats an undefined result as
 * "source review not admitted" → conflict, never a silent skip.
 */
async function readAdmittedSourceReviewVerdicts(
  contextFile: ContextFile,
  repoRoot: string,
): Promise<readonly { reviewRunId: string; verdict: string; action: string }[]> {
  if (contextFile.sourceReviewRun === undefined) {
    return [];
  }
  const deliveryRunsDir = deriveDeliveryRunsDir(
    join(repoRoot, normalizeSeparators(contextFile.runPath)),
  );
  // The source review Run is in the same Change directory.
  const changeDir = contextFile.changeId === undefined
    ? deliveryRunsDir
    : join(deliveryRunsDir, contextFile.changeId);
  const runDir = join(changeDir, contextFile.sourceReviewRun);
  const verdict = await readRunVerdict(runDir);
  if (verdict === undefined) {
    return [];
  }
  // Q1-RA-007: also expose the source review Run's action so the shared tuple
  // validator can prove the matching review stage (revise-explore→review-explore,
  // revise-propose→review-propose, revise-apply→review-apply).
  let action = '';
  try {
    const ctxRaw = await readFile(join(runDir, 'context.json'), 'utf-8');
    const ctx = validateContextFile(JSON.parse(ctxRaw));
    action = ctx.action;
  } catch {
    // Context unreadable — the review is not admissible as evidence; the
    // validator's target-missing/source-review-not-admitted path handles it.
    return [];
  }
  return [{ reviewRunId: contextFile.sourceReviewRun, verdict, action }];
}


async function validateReviewCompletionArtifacts(
  contextFile: ContextFile,
  repoRoot: string,
): Promise<void> {
  if (contextFile.changeId === undefined || contextFile.reviewedRunId === undefined) return;
  const deliveryRunsDir = deriveDeliveryRunsDir(
    join(repoRoot, normalizeSeparators(contextFile.runPath)),
  );
  const changeDir = join(deliveryRunsDir, contextFile.changeId);

  if (contextFile.action === 'review-explore' || contextFile.action === 'review-propose') {
    await validateReviewedStageCurrentBytes(
      repoRoot,
      changeDir,
      contextFile.changeId,
      contextFile.reviewedRunId,
      contextFile.action === 'review-explore' ? 'explore' : 'propose',
      contextFile.runId,
    );
    return;
  }

  if (contextFile.action === 'review-apply') {
    if (contextFile.verificationInputRef === undefined) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `review-apply ${contextFile.runId} has no persisted verificationInputRef`,
        { runId: contextFile.runId },
      );
    }
    // Q2: this binding lives only for this review's entry→completion window.
    // It proves the Reviewer completes against the same verification.md bytes
    // it saw at entry; it is not replayed by future Actions.
    await verifyArtifactRef(
      contextFile.verificationInputRef,
      repoRoot,
      contextFile.runId,
      'verificationInputRef',
    );
  }
}

async function completionPreflight(
  contextFile: ContextFile,
  actionResult: ActionResultWithoutRunRef,
  repoRoot: string,
  runStatus?: string,
): Promise<void> {
  const action = contextFile.action;
  const isReviewAction = action.startsWith('review-');

  // Q1-RA-010: Action-owned ResultRef applicability — action identity +
  // required/forbidden field matrix keyed on the top-level runStatus. This is
  // the SAME validator used by admitC1RunResult/Reader, so the terminal writer
  // and the Reader share the applicability semantics.
  validateActionResultApplicability(action, runStatus, actionResult);

  // Q1-RA-006: unconditional shared review exact-binding proof. A schemaVersion 2
  // review-* Run MUST carry a Core-derived inputRef over reviewedRunId/result.json;
  // missing / wrong-kind / wrong-target (including a different readable result
  // with a matching hash) / unreadable / hash mismatch all fail closed.
  if (isReviewAction) {
    await validateReviewRunBinding({
      runId: contextFile.runId,
      deliveryId: contextFile.deliveryId,
      changeId: contextFile.changeId,
      action: contextFile.action,
      reviewedRunId: contextFile.reviewedRunId,
      inputRef: contextFile.inputRef,
      runsPathPrefix: deriveRunsPathPrefix(contextFile),
      repoRoot,
    });
  }

  // Q2/v6: repeat only the local current bindings that must remain stable
  // across the Action's own execution window. This replaces historical Reader
  // replay with explicit entry/completion boundaries.
  if (isReviewAction) {
    await validateReviewCompletionArtifacts(contextFile, repoRoot);
  }

  // Q1-RA-003: unconditional stage-aware effective-set completeness. For any
  // artifact-PRODUCING Action (explore/revise-explore/propose/revise-propose —
  // NOT review-* which produce a verdict, not artifacts), producedResultRefs
  // MUST exist and exactly satisfy the stage invariant. Absence/empty/partial/
  // extra/drift all fail closed REGARDLESS of whether the field is present —
  // requiredness comes from the Action, not field presence.
  const producingStage =
    action === 'explore' || action === 'revise-explore' || action === 'propose' || action === 'revise-propose'
      ? artifactStage(action)
      : undefined;
  const stage = producingStage;
  if (stage !== undefined) {
    const produced = actionResult.producedResultRefs;
    if (produced === undefined) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `${action} terminal Run REQUIRES producedResultRefs (complete Core-expected effective set missing)`,
        { action, runId: contextFile.runId },
      );
    }
    if (contextFile.changeId === undefined) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `${action} terminal Run requires changeId to validate the effective artifact set (runId=${contextFile.runId})`,
        { action, runId: contextFile.runId },
      );
    }
    const setProblems = await validateCurrentStageArtifactSet(
      repoRoot,
      contextFile.changeId,
      stage,
      produced,
    );
    if (setProblems.length > 0) {
      // Preserve the established error-code contract: a missing target is
      // RESULT_REF_TARGET_MISSING, a drift/ambiguity is RESULT_REF_MISMATCH,
      // and structural incompleteness is SCHEMA_VALIDATION_FAILED.
      const code =
        setProblems.some((p) => p.kind === 'missing-target')
          ? 'RESULT_REF_TARGET_MISSING'
          : setProblems.some((p) => p.kind === 'fingerprint-mismatch' || p.kind === 'ambiguous-target')
            ? 'RESULT_REF_MISMATCH'
            : 'SCHEMA_VALIDATION_FAILED';
      throw new FlowkitError(
        code,
        `${action} effective produced set does not satisfy the ${stage} invariant: ${setProblems.map((p) => p.message).join('; ')}`,
        { action, runId: contextFile.runId, problems: setProblems },
      );
    }
  }

  // Validate consumedInputRefs (immutable Run-result refs).
  if (actionResult.consumedInputRefs !== undefined) {
    for (let i = 0; i < actionResult.consumedInputRefs.length; i++) {
      const ref = actionResult.consumedInputRefs[i];
      await verifyRunResultRef(ref, repoRoot, contextFile.runId, `consumedInputRefs[${i}]`);
    }
  }

  // Q1-RA-007: shared source-review tuple validation. For schemaVersion 2
  // completed revise-* (revise-explore / revise-propose / revise-apply) the
  // complete source-review tuple is REQUIRED — requiredness comes from the
  // Action ALONE, never from whether sourceReviewRun happens to be present.
  // The tuple must be complete and mutually consistent; the referenced source
  // review MUST be admitted (readRunVerdict only yields a verdict after full C1
  // admission + exact binding proof); it MUST be the matching review stage
  // (revise-explore→review-explore, revise-propose→review-propose,
  // revise-apply→review-apply); and both its actual verdict and the persisted
  // sourceReviewVerdict MUST be changes-requested. Missing counterpart /
  // unadmitted source review / wrong stage / approved verdict / wrong target /
  // hash mismatch all fail closed — result.json MUST NOT publish.
  const tupleProblems = await validateSourceReviewTuple(
    {
      runId: contextFile.runId,
      deliveryId: contextFile.deliveryId,
      changeId: contextFile.changeId,
      action: contextFile.action,
      sourceReviewRun: contextFile.sourceReviewRun,
      sourceReviewVerdict: contextFile.sourceReviewVerdict,
      reviewVerdictRef: actionResult.reviewVerdictRef,
      runsPathPrefix: deriveRunsPathPrefix(contextFile),
      repoRoot,
    },
    {
      // Action decides requiredness. `&& sourceReviewRun !== undefined` is the
      // exact bypass 135 blocked — it must NOT be restored.
      requiresTuple: isRevisionAction(action),
      admittedSourceReviewVerdicts: await readAdmittedSourceReviewVerdicts(contextFile, repoRoot),
    },
  );
  if (tupleProblems.length > 0) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `${action} source-review tuple invalid: ${tupleProblems.map((p) => p.message).join('; ')}`,
      { action, runId: contextFile.runId, problems: tupleProblems },
    );
  }

  // Validate verificationSummaryRef (mutable Change artifact).
  if (actionResult.verificationSummaryRef !== undefined) {
    await verifyArtifactRef(actionResult.verificationSummaryRef, repoRoot, contextFile.runId, 'verificationSummaryRef');
  }
}

/**
 * Verify a run-result ResultRef against the actual result.json file content.
 *
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when the file does not exist.
 * @throws {FlowkitError} `RESULT_REF_MISMATCH` when the content hash mismatches.
 */
async function verifyRunResultRef(
  ref: ResultRef,
  repoRoot: string,
  runId: string,
  fieldLabel: string,
): Promise<void> {
  const filePath = join(repoRoot, normalizeSeparators(ref.ref));
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    throw new FlowkitError(
      'RESULT_REF_TARGET_MISSING',
      `ResultRef target missing: ${fieldLabel} → ${ref.ref} (Run ${runId})`,
      { ref, fieldLabel, runId, filePath },
    );
  }
  const actualHash = computeResultFileHash(content);
  if (actualHash !== ref.versionFingerprint) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `ResultRef fingerprint mismatch: ${fieldLabel} → ${ref.ref} (expected ${ref.versionFingerprint}, got ${actualHash})`,
      { ref, fieldLabel, runId, expected: ref.versionFingerprint, actual: actualHash },
    );
  }
}

/**
 * Verify a produced-artifact or verification-summary ResultRef against the
 * current canonical artifact file content. This is only used for current
 * Action handoff/completion and never searches OpenSpec archive locations.
 *
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when the file does not exist.
 * @throws {FlowkitError} `RESULT_REF_MISMATCH` when the content hash mismatches.
 */
async function verifyArtifactRef(
  ref: ResultRef,
  repoRoot: string,
  runId: string,
  fieldLabel: string,
): Promise<void> {
  let content: string;
  try {
    content = await readArtifactBytes(repoRoot, ref.ref);
  } catch (e) {
    if (e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING') {
      throw new FlowkitError(
        'RESULT_REF_TARGET_MISSING',
        `Artifact ResultRef target missing: ${fieldLabel} → ${ref.ref} (Run ${runId})`,
        { ref, fieldLabel, runId },
      );
    }
    throw e;
  }
  const actualHash = computeResultFileHash(content);
  if (actualHash !== ref.versionFingerprint) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `Artifact ResultRef fingerprint mismatch: ${fieldLabel} → ${ref.ref} (expected ${ref.versionFingerprint}, got ${actualHash})`,
      { ref, fieldLabel, runId, expected: ref.versionFingerprint, actual: actualHash },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeRunPaths(
  deliveryRunsDir: string,
  runsPathPrefix: string,
  deliveryId: string,
  changeId: string,
  runId: string,
): { runDir: string; runPath: string } {
  const segments = [deliveryId, changeId, runId];
  const relativePart = segments.join('/');
  const runDir = join(deliveryRunsDir, changeId, runId);
  const runPath = `${normalizeSeparators(runsPathPrefix).replace(/\/+$/, '')}/${relativePart}/`;
  return { runDir, runPath };
}

function buildContextFile(
  input: CreateRunInput,
  runPath: string,
  inputRef: ResultRef | undefined,
  verificationInputRef: ResultRef | undefined,
): ContextFile {
  const contextFile: ContextFile = {
    schemaVersion: 2,
    runId: input.runId,
    deliveryId: input.deliveryId,
    action: input.action,
    role: input.role,
    ownerAuthorization: input.ownerAuthorization,
    runPath,
    changeKey: input.changeKey,
    changeId: input.changeId,
    ...(inputRef !== undefined && { inputRef }),
    ...(verificationInputRef !== undefined && { verificationInputRef }),
    ...(input.sourceReviewRun !== undefined && { sourceReviewRun: input.sourceReviewRun }),
    ...(input.sourceReviewVerdict !== undefined && { sourceReviewVerdict: input.sourceReviewVerdict }),
    ...(input.reviewedRunId !== undefined && { reviewedRunId: input.reviewedRunId }),
    ...(input.constraints !== undefined && { constraints: input.constraints }),
  };
  return contextFile;
}

function serializeContextFile(contextFile: ContextFile): string {
  return `${JSON.stringify(contextFile, null, 2)}\n`;
}

function serializeRunResultFile(result: RunResultFile): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

async function readContextFile(runDir: string): Promise<ContextFile> {
  const contextPath = join(runDir, 'context.json');
  const content = await readFileContent(contextPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `context.json is not valid JSON: ${(e as Error).message}`,
      { runDir },
    );
  }
  // C1 Runs always use schemaVersion:2; writeRunResult only operates on C1
  // Runs (Bootstrap Runs are never written to by C1 — D16).
  return validateContextFile(parsed);
}

async function readFileContent(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  try {
    return await readFile(path, 'utf-8');
  } catch (e) {
    throw new FlowkitError(
      'RUN_CONTEXT_MISSING',
      `Cannot read context.json: ${(e as Error).message}`,
      { path },
    );
  }
}

async function bestEffortClean(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

async function bestEffortUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Staging visibility (task 3.6: staging invisible to Reader)
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a directory entry is a staging directory
 * (`.tmp-<runId>/`) or a temp result file (`.result-tmp-*.json`) that MUST be
 * invisible to Reader.
 */
export function isInvisibleEntry(name: string): boolean {
  return name.startsWith('.tmp-') || name.startsWith('.result-tmp-');
}

/**
 * Read the visible (non-staging, non-temp) entries of a directory. Used by
 * Reader to skip staging artifacts.
 */
export async function readVisibleEntries(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries.filter((e) => !isInvisibleEntry(e));
}

/**
 * Check whether a path exists as a directory.
 */
export async function existsDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
