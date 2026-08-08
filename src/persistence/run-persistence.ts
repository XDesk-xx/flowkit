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
import type { Run } from '../domain/types.js';
import type { ChangeAction, DeliveryAction } from '../domain/actions.js';
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
  admitC1RunResult,
  validateActionResultApplicability,
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
  validateStageEffectiveSet,
  validateRunIdDescriptor,
  validateReviewRunBinding,
  validateSourceReviewTuple,
  permittedProducedArtifactTags,
  PRODUCED_ARTIFACT_KIND,
  VERIFICATION_SUMMARY_KIND,
  type ProducedArtifactTag,
} from './result-ref-adapter.js';
import {
  classifyReviewedArtifactGeneration,
  artifactStage,
  type LineageFact,
  type ReviewLineageFact,
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
  /** Required for Change-level actions; MUST be absent for Delivery-level. */
  readonly changeKey?: string;
  /** Required for Change-level actions; MUST be absent for Delivery-level. */
  readonly changeId?: string;
  readonly action: ChangeAction | DeliveryAction;
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
  // 1. Compute the target Run directory and runPath.
  const { runDir, runPath } = computeRunPaths(
    input.deliveryRunsDir,
    input.runsPathPrefix,
    input.deliveryId,
    input.changeId,
    input.runId,
  );

  // 2. Q1: Core-derive inputRef from typed descriptors.
  //    - review-* actions: derive from reviewedRunId (REQUIRED).
  //    - normal actions: derive from consumedRunId (optional).
  //    - Neither: inputRef is absent (no input).
  const inputRef = await deriveInputRef(input);

  // 2b. Q1-RA-003: Review-entry validation for review-explore/review-propose.
  //     Before publishing, verify the reviewed Run is the current effective
  //     generation and its producedResultRefs match current canonical bytes.
  //     For review-propose, also verify specs namespace exact-set. On any
  //     failure, throw BEFORE staging publish — the review Run is not created.
  if (input.action === 'review-explore' || input.action === 'review-propose') {
    await validateReviewEntry(input);
  }

  // 3. Build the ContextFile object (inputRef is Core-derived, not caller-supplied).
  const contextFile = buildContextFile(input, runPath, inputRef);

  // 4. Validate schema + identity (before writing anything).
  validateContextFile(contextFile);
  validateContextFileIdentity(contextFile, runDir);

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
async function deriveInputRef(input: CreateRunInput): Promise<ResultRef | undefined> {
  const isReviewAction = input.action.startsWith('review-');
  const targetRunId = isReviewAction ? input.reviewedRunId : input.consumedRunId;

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
  changeId: string | undefined,
  runId: string,
): Promise<string> {
  // Q1-RA-005 (defense-in-depth): reject path-shaped / non-Run-ID descriptors
  // before they can inject path segments into the join below.
  validateRunIdDescriptor(runId);

  // Try same-Change directory first.
  const candidates: string[] = [];
  if (changeId !== undefined) {
    candidates.push(join(deliveryRunsDir, changeId, runId, 'result.json'));
  }
  // Try Delivery root (Delivery-level Run).
  candidates.push(join(deliveryRunsDir, runId, 'result.json'));

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, 'utf-8');
    } catch {
      // Try next candidate.
    }
  }

  throw new FlowkitError(
    'RESULT_REF_TARGET_MISSING',
    `Referenced Run ${runId} result.json not found or unreadable (searched ${candidates.length} locations)`,
    { runId, changeId, candidates },
  );
}

// ---------------------------------------------------------------------------
// Q1-RA-003: Review-entry validation (review-explore / review-propose)
// ---------------------------------------------------------------------------

/**
 * Q1-RA-003: Validate the reviewed Run's current effective generation before
 * publishing a review-explore/review-propose Run.
 *
 * Uses the SAME shared lineage/effective-set semantics as Reader
 * ({@link classifyReviewedArtifactGeneration} +
 * {@link validateEffectiveArtifactRefs} + {@link validateSpecsExactSet}) so the
 * review-entry boundary and Reader agree on "what is the current effective
 * artifact set".
 *
 * Steps:
 *   1. Read the reviewed Run's lineage fact + producedResultRefs.
 *   2. Read sibling Run lineage facts for generation classification.
 *   3. Classify the reviewed Run's generation — MUST be `current`.
 *   4. Validate producedResultRefs against current canonical bytes.
 *   5. For review-propose: exact-compare effective specs identities with
 *      current canonical specs/**.
 *
 * On any failure, throw BEFORE staging publish — the review Run is not created.
 *
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when the reviewed Run's
 *   context.json is missing/unreadable.
 * @throws {FlowkitError} `RESULT_REF_MISMATCH` when the reviewed Run is not the
 *   current effective generation, or its effective artifact set has drifted.
 */
async function validateReviewEntry(input: CreateRunInput): Promise<void> {
  if (input.reviewedRunId === undefined || input.changeId === undefined) {
    return; // Cannot validate without reviewedRunId or changeId.
  }
  const repoRoot = input.repoRoot;
  const changeId = input.changeId;
  const reviewedRunId = input.reviewedRunId;
  const changeDir = join(input.deliveryRunsDir, changeId);

  // 1. Read the reviewed Run's lineage fact + producedResultRefs.
  const reviewedRunDir = join(changeDir, reviewedRunId);
  const reviewedFact = await readRunLineageFact(reviewedRunDir, reviewedRunId, changeId);
  if (reviewedFact === undefined) {
    throw new FlowkitError(
      'RESULT_REF_TARGET_MISSING',
      `review-* entry: reviewed Run ${reviewedRunId} context.json missing or unreadable`,
      { reviewedRunId, changeDir },
    );
  }
  const producedRefs = await readRunProducedResultRefs(reviewedRunDir);

  // 2. Read sibling lineage facts for generation classification.
  //    Exclude the review Run being created (input.runId) — it is not on disk
  //    yet. The reviewed Run MUST be included so its generation can be classified.
  const { completedArtifactRuns, allReviseRuns, reviews } = await readSiblingLineageFacts(
    changeDir,
    input.runId,
    changeId,
  );

  // 3. Classify the reviewed Run's generation — MUST be `current`.
  const genClass = classifyReviewedArtifactGeneration(
    reviewedFact,
    completedArtifactRuns,
    allReviseRuns,
    reviews,
  );
  if (genClass !== 'current') {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `review-* entry: reviewed Run ${reviewedRunId} is not the current effective generation (class=${genClass ?? 'non-artifact'}); only the current generation can be reviewed`,
      { reviewedRunId, generationClass: genClass },
    );
  }

  // 4. Q1-RA-003: unconditional stage-aware effective-set completeness. The
  //    reviewed Run's produced set MUST exactly satisfy the stage invariant
  //    (explore → explore.md; propose → proposal+design+tasks+complete specs).
  //    A missing/empty/partial/drifted set rejects the review BEFORE publish —
  //    requiredness comes from the Action/stage, never from `length > 0`.
  const stage = artifactStage(reviewedFact.action);
  if (stage !== undefined) {
    const setProblems = await validateStageEffectiveSet(repoRoot, changeId, stage, producedRefs);
    if (setProblems.length > 0) {
      throw new FlowkitError(
        'RESULT_REF_MISMATCH',
        `review-* entry: reviewed Run ${reviewedRunId} effective artifact set does not satisfy the ${stage} invariant: ${setProblems.map((p) => p.message).join('; ')}`,
        { reviewedRunId, problems: setProblems },
      );
    }
  }
}

/**
 * Read a single Run's {@link LineageFact} from its context.json + result.json.
 *
 * Determines `status` from result.json existence (pending when absent; terminal
 * `runStatus` when present). Returns `undefined` when context.json is missing
 * or unreadable.
 */
async function readRunLineageFact(
  runDir: string,
  runId: string,
  changeId: string,
): Promise<LineageFact | undefined> {
  let ctxContent: string;
  try {
    ctxContent = await readFile(join(runDir, 'context.json'), 'utf-8');
  } catch {
    return undefined;
  }
  let ctx: Record<string, unknown>;
  try {
    ctx = JSON.parse(ctxContent) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const action = typeof ctx['action'] === 'string' ? ctx['action'] : '';

  // Determine status from result.json existence.
  let status: RunStatus = 'pending';
  try {
    const resultContent = await readFile(join(runDir, 'result.json'), 'utf-8');
    const result = JSON.parse(resultContent) as Record<string, unknown>;
    const runStatus = result['runStatus'];
    if (runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled') {
      status = runStatus;
    }
  } catch {
    // result.json missing → pending.
  }

  const sourceReviewRun = ctx['sourceReviewRun'];
  const sourceReviewVerdict = ctx['sourceReviewVerdict'];
  const reviewedRunId = ctx['reviewedRunId'];

  const fact: LineageFact = {
    runId,
    changeId,
    action,
    status,
    ...(typeof sourceReviewRun === 'string' && { sourceReviewRun }),
    ...((sourceReviewVerdict === 'approved' || sourceReviewVerdict === 'changes-requested') && {
      sourceReviewVerdict,
    }),
    ...(typeof reviewedRunId === 'string' && { reviewedRunId }),
  };
  return fact;
}

/**
 * Read all sibling Run lineage facts in a Change directory for generation
 * classification. Excludes staging/temp entries and the Run being created.
 *
 * Returns:
 *   - `completedArtifactRuns`: completed explore/revise-explore/propose/revise-propose.
 *   - `allReviseRuns`: all revise-explore/revise-propose (completed + pending).
 *   - `reviews`: completed review-* Run lineage facts (with verdict).
 */
async function readSiblingLineageFacts(
  changeDir: string,
  excludeRunId: string,
  changeId: string,
): Promise<{
  readonly completedArtifactRuns: readonly LineageFact[];
  readonly allReviseRuns: readonly LineageFact[];
  readonly reviews: readonly ReviewLineageFact[];
}> {
  const entries = await readVisibleEntries(changeDir);
  const facts: LineageFact[] = [];
  const reviewFacts: ReviewLineageFact[] = [];

  for (const entry of entries) {
    if (entry === excludeRunId) continue;
    if (!looksLikeRunIdEntry(entry)) continue;

    const runDir = join(changeDir, entry);
    if (!(await existsDirectory(runDir))) continue;

    const fact = await readRunLineageFact(runDir, entry, changeId);
    if (fact === undefined) continue;
    facts.push(fact);

    // If completed review-* Run with reviewedRunId, read verdict for lineage proof.
    if (
      fact.status === 'completed' &&
      fact.action.startsWith('review-') &&
      fact.reviewedRunId !== undefined
    ) {
      const verdict = await readRunVerdict(runDir);
      if (verdict !== undefined) {
        reviewFacts.push({
          reviewRunId: entry,
          verdict,
          reviewedRunId: fact.reviewedRunId,
          reviewAction: fact.action,
          reviewStatus: fact.status,
          changeId,
        });
      }
    }
  }

  const completedArtifactRuns = facts.filter(
    (f) =>
      f.status === 'completed' &&
      (f.action === 'explore' ||
        f.action === 'revise-explore' ||
        f.action === 'propose' ||
        f.action === 'revise-propose'),
  );
  const allReviseRuns = facts.filter(
    (f) => f.action === 'revise-explore' || f.action === 'revise-propose',
  );

  return { completedArtifactRuns, allReviseRuns, reviews: reviewFacts };
}

/**
 * Read a Run's `producedResultRefs` from its result.json.
 *
 * Q1-RA-003: this MUST NOT convert missing/malformed/wrong-schema formal
 * evidence into an empty array (that would treat "formal evidence missing" as
 * a legal empty namespace). A `producedResultRefs` field that is absent,
 * malformed, wrong-typed, or whose entries lack the required Core-owned fields
 * is a fail-closed error.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` when result.json is
 *   missing/unreadable/malformed or producedResultRefs is absent/invalid.
 */
async function readRunProducedResultRefs(runDir: string): Promise<ResultRef[]> {
  let content: string;
  try {
    content = await readFile(join(runDir, 'result.json'), 'utf-8');
  } catch (e) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Reviewed Run result.json missing or unreadable: ${(e as Error).message}`,
      { runDir },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Reviewed Run result.json is not valid JSON: ${(e as Error).message}`,
      { runDir },
    );
  }
  const result = parsed as Record<string, unknown>;
  const ar = result['actionResult'];
  if (ar === undefined || typeof ar !== 'object' || ar === null) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Reviewed Run result.json has no actionResult (formal evidence missing)`,
      { runDir },
    );
  }
  const arObj = ar as Record<string, unknown>;
  const refs = arObj['producedResultRefs'];
  if (!Array.isArray(refs)) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Reviewed Run producedResultRefs missing or not an array (formal evidence missing)`,
      { runDir },
    );
  }
  return (refs as Array<Record<string, unknown>>).map((r, i) => {
    if (typeof r['ref'] !== 'string' || typeof r['versionFingerprint'] !== 'string') {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `Reviewed Run producedResultRefs[${i}] missing ref or versionFingerprint`,
        { runDir, index: i },
      );
    }
    return {
      ref: r['ref'] as string,
      versionFingerprint: r['versionFingerprint'] as string,
      ...(typeof r['kind'] === 'string' && { kind: r['kind'] as ResultRef['kind'] }),
    };
  });
}

/**
 * Read a completed review-* Run's `reviewVerdict` from its result.json —
 * ONLY when the review's immutable evidence is exact-validated.
 *
 * Q1-RA-006: a review Run's verdict may be consumed as lineage proof ONLY
 * after (1) the complete result.json passes the closed physical validators
 * (validateRunResultFileCombination + validateActionResultWithoutRunRef +
 * validateReviewVerdictIntegrity) and (2) the review exact binding
 * (reviewedRunId ↔ context.inputRef ↔ actual reviewed result.json bytes) is
 * proven. Returns `undefined` (review NOT admitted as lineage) when any of
 * those checks fail — a broken review MUST NOT influence generation
 * classification.
 */
async function readRunVerdict(
  runDir: string,
): Promise<ReviewVerdictValue | undefined> {
  let content: string;
  try {
    content = await readFile(join(runDir, 'result.json'), 'utf-8');
  } catch {
    return undefined; // Missing result.json → not terminal.
  }

  // Read context for reviewedRunId + inputRef (exact binding proof).
  let ctx: ContextFile;
  try {
    ctx = validateContextFile(JSON.parse(await readFile(join(runDir, 'context.json'), 'utf-8')));
  } catch {
    return undefined; // Malformed context → not admitted.
  }
  if (!ctx.action.startsWith('review-') || ctx.reviewedRunId === undefined) {
    return undefined;
  }

  // Phase 1: shared closed-schema admission of the WHOLE result.json
  // (Q1-RA-006): validateRunResultFileCombination + actionResult projection +
  // review verdict integrity.
  try {
    admitC1RunResult(content, ctx.action);
  } catch {
    return undefined; // Malformed / closed-schema violation → not admitted.
  }

  // Phase 2: review exact binding — the SHARED fail-closed validator
  // (Q1-RA-006). Core re-derives the expected target from reviewedRunId;
  // missing / wrong-kind / wrong-target / unreadable / hash mismatch all fail
  // closed (no verdict → the review cannot enter sibling lineage).
  try {
    await validateReviewRunBinding({
      runId: ctx.runId,
      deliveryId: ctx.deliveryId,
      changeId: ctx.changeId,
      action: ctx.action,
      reviewedRunId: ctx.reviewedRunId,
      inputRef: ctx.inputRef,
      runsPathPrefix: deriveRunsPathPrefix(ctx),
      repoRoot: deriveRepoRoot(runDir, ctx.runPath),
    });
  } catch {
    return undefined; // Exact binding not provable → not admitted.
  }

  const verdict = (JSON.parse(content) as Record<string, unknown>)['reviewVerdict'];
  if (verdict === 'approved' || verdict === 'changes-requested') {
    return verdict;
  }
  return undefined;
}

/**
 * Check whether a directory entry looks like a Run ID (`YYYYMMDD-NNN-action`).
 */
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
    ...(contextFile.changeId !== undefined && { changeId: contextFile.changeId }),
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
 * Descriptor-driven terminal completion input (Q1-RA-001).
 *
 * This is the PRODUCTION terminal-write entry shape. The caller describes
 * intent with typed descriptors; Core derives every {@link ResultRef} from
 * actual target bytes. The caller MUST NOT supply `ResultRef` objects, paths,
 * kinds, or fingerprints — that authority belongs to Core alone.
 *
 * Field → Core-derived ResultRef mapping:
 *   - `consumedRunIds` → `consumedInputRefs` (kind `run-result`)
 *   - `context.sourceReviewRun` (non-review actions) → `reviewVerdictRef`
 *     (kind `run-result`)
 *   - `producedArtifactTags` (revise-* only) + Core-expected set →
 *     `producedResultRefs` (kind `produced-artifact`). Initial explore/propose
 *     ignore caller tags and unconditionally build the complete Core-expected
 *     set; revise-propose applies a subset overlay over the predecessor
 *     effective set.
 *   - `review-apply` action → `verificationSummaryRef` (kind
 *     `verification-summary`), Core-derived from current `verification.md`.
 *
 * Reviewer-owned payload (`reviewVerdict`, `reviewFindings`) is carried
 * verbatim for completed `review-*` Runs; Core validates its shape.
 */
export interface CompleteRunInput {
  /** ActionResult.executionStatus. Required for `completed` Runs. */
  readonly executionStatus?: ExecutionStatus;
  /** ActionResult.summary. Required for `completed` Runs. */
  readonly summary?: string;
  /** Typed descriptors: Run IDs whose `result.json` is consumed as input. */
  readonly consumedRunIds?: readonly string[];
  /**
   * Typed descriptors: produced-artifact tags the caller declares as changed.
   * Only meaningful for `revise-propose` (subset overlay). Ignored for initial
   * explore/propose, which Core builds unconditionally.
   */
  readonly producedArtifactTags?: readonly ProducedArtifactTag[];
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
 * Descriptor-driven terminal completion (Q1-RA-001 production API).
 *
 * Reads `context.json`, derives ALL applicable {@link ResultRef}s from typed
 * descriptors + actual target bytes, builds the {@link RunResultFile}
 * internally, then publishes via the shared {@link publishTerminalResult}.
 *
 * The caller never constructs a `ResultRef`. Initial explore/propose ALWAYS
 * derive the complete Core-expected produced set (ignoring caller tags);
 * missing target → `RESULT_REF_TARGET_MISSING` (Run stays pending, retryable).
 * `review-apply` ALWAYS derives `verificationSummaryRef` from current
 * `verification.md`; missing/unreadable/ambiguous → Run stays pending.
 *
 * @param runDir - Absolute path to the Run directory.
 * @param input - Descriptor-driven completion intent (no ResultRef objects).
 * @throws {FlowkitError} `RUN_TERMINAL` when result.json already exists.
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when a derived target is
 *   missing/unreadable (Run stays pending).
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on validation failure.
 */
export async function completeRun(
  runDir: string,
  input: CompleteRunInput,
): Promise<void> {
  // 1. Read context.json → validate C1 schema + identity (C1-AP-002).
  const contextFile = await readContextFile(runDir);
  validateContextFileIdentity(contextFile, runDir);

  // 1b. Q1-RA-005: runtime-validate every descriptor (Run IDs + artifact tags)
  //     BEFORE any derivation / filesystem resolution. The caller's descriptors
  //     are closed grammar — arbitrary tags / path-shaped Run IDs are rejected
  //     here, not silently ignored.
  validateCompleteRunInput(contextFile, input);

  // 2. Core-derive the full RunResultFile from typed descriptors.
  const result = await buildRunResultFromDescriptors(contextFile, runDir, input);

  // 3. Publish via the PRIVATE publisher (assertMutable + validate + preflight +
  //    fs.link). The preflight re-validates every Core-derived ref against
  //    current bytes as defense-in-depth and catches any drift between
  //    derivation and publish.
  await writeRunResult(runDir, result);
}

/**
 * Runtime-validate every descriptor in {@link CompleteRunInput} (Q1-RA-005).
 *
 * TypeScript's `ProducedArtifactTag` union and `string` Run IDs are compile-time
 * only; a JS/JSON/CLI caller can bypass them. Before ANY derivation or
 * filesystem resolution this function enforces the closed descriptor grammar:
 *
 *   - every `consumedRunIds[*]` MUST be a formal Run ID (reject path-shaped).
 *   - every `producedArtifactTags[*]` MUST be permitted for the Action.
 *   - a non-artifact Action (apply / revise-apply / archive / review-* /
 *     delivery-*) MUST NOT carry `producedArtifactTags` (nothing to produce).
 *   - `revise-propose` MUST carry a NON-EMPTY changed-tag subset (a no-op
 *     revise would wrongly supersede its predecessor — lineage correctness).
 *   - `revise-explore` MAY omit tags (Core knows it modifies `explore`); if
 *     supplied they MUST be exactly `['explore']`.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on the first descriptor
 *   violation.
 */
function validateCompleteRunInput(
  contextFile: ContextFile,
  input: CompleteRunInput,
): void {
  const action = contextFile.action;
  const isArtifactAction =
    action === 'explore' ||
    action === 'revise-explore' ||
    action === 'propose' ||
    action === 'revise-propose';

  // producedArtifactTags are only legal for artifact actions.
  if (input.producedArtifactTags !== undefined) {
    if (!isArtifactAction) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `completeRun: Action ${action} does not produce artifacts and MUST NOT carry producedArtifactTags`,
        { action, runId: contextFile.runId, producedArtifactTags: input.producedArtifactTags },
      );
    }
    // Every tag must be in the Action-permitted closed set.
    const permitted = permittedProducedArtifactTags(action);
    for (const tag of input.producedArtifactTags) {
      if (!(permitted as readonly string[]).includes(tag)) {
        throw new FlowkitError(
          'SCHEMA_VALIDATION_FAILED',
          `completeRun: produced-artifact tag ${tag} is not permitted for Action ${action} (permitted: [${permitted.join(', ')}])`,
          { action, runId: contextFile.runId, tag },
        );
      }
    }
  }

  // revise-propose MUST declare a non-empty changed-tag subset (no-op revise
  // would wrongly supersede the predecessor — lineage correctness).
  if (action === 'revise-propose') {
    const tags = input.producedArtifactTags;
    if (tags === undefined || tags.length === 0) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `completeRun: revise-propose MUST declare a non-empty producedArtifactTags changed subset (a no-op revise would wrongly supersede its predecessor)`,
        { action, runId: contextFile.runId, producedArtifactTags: tags },
      );
    }
  }

  // revise-explore: if tags are supplied they MUST be exactly ['explore'].
  if (action === 'revise-explore' && input.producedArtifactTags !== undefined) {
    if (input.producedArtifactTags.length !== 1 || input.producedArtifactTags[0] !== 'explore') {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `completeRun: revise-explore producedArtifactTags MUST be exactly ['explore']`,
        { action, runId: contextFile.runId, producedArtifactTags: input.producedArtifactTags },
      );
    }
  }

  // consumedRunIds: every entry MUST be a formal Run ID.
  if (input.consumedRunIds !== undefined) {
    for (const runId of input.consumedRunIds) {
      validateRunIdDescriptor(runId);
    }
  }
}

/**
 * Build a {@link RunResultFile} entirely from typed descriptors (Q1-RA-001).
 *
 * Determines `runStatus` from the input shape, then — for `completed` Runs —
 * derives every applicable ResultRef via the Core-owned constructors. No
 * caller-supplied ResultRef ever enters the persisted model.
 */
async function buildRunResultFromDescriptors(
  contextFile: ContextFile,
  runDir: string,
  input: CompleteRunInput,
): Promise<RunResultFile> {
  const action = contextFile.action;
  const isReviewAction = action.startsWith('review-');

  // Determine runStatus from the input shape.
  let runStatus: TerminalRunStatus;
  if (input.failureDiagnosis !== undefined) {
    runStatus = 'failed';
  } else if (input.cancellationReason !== undefined) {
    runStatus = 'cancelled';
  } else {
    runStatus = 'completed';
  }

  // failed / cancelled: no actionResult, no review payload.
  if (runStatus !== 'completed') {
    const failedResult: RunResultFile = {
      runStatus,
      ...(runStatus === 'failed' && { failureDiagnosis: input.failureDiagnosis }),
      ...(runStatus === 'cancelled' && { cancellationReason: input.cancellationReason }),
    };
    return failedResult;
  }

  // completed: actionResult required. Validate the caller supplied the
  // minimal intent fields.
  if (input.executionStatus === undefined || input.summary === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `completeRun completed Run requires executionStatus and summary (action=${action})`,
      { action, runId: contextFile.runId },
    );
  }

  const repoRoot = deriveRepoRoot(runDir, contextFile.runPath);
  const actionResult = await deriveActionResult(contextFile, runDir, repoRoot, input);

  const result: RunResultFile = {
    runStatus: 'completed',
    actionResult,
    // Reviewer-owned payload (completed review-* Runs only). Non-review Runs
    // MUST NOT carry these (validateReviewVerdictIntegrity enforces).
    ...(isReviewAction && input.reviewVerdict !== undefined && { reviewVerdict: input.reviewVerdict }),
    ...(isReviewAction && input.reviewFindings !== undefined && { reviewFindings: input.reviewFindings }),
  };
  return result;
}

/**
 * Derive the complete {@link ActionResultWithoutRunRef} from typed descriptors.
 *
 * Core owns every ResultRef:
 *   - `producedResultRefs`: explore/revise-explore/propose/revise-propose only.
 *   - `consumedInputRefs`: from `consumedRunIds`.
 *   - `reviewVerdictRef`: from `context.sourceReviewRun` (non-review actions).
 *   - `verificationSummaryRef`: `review-apply` only, from `verification.md`.
 */
async function deriveActionResult(
  contextFile: ContextFile,
  runDir: string,
  repoRoot: string,
  input: CompleteRunInput,
): Promise<ActionResultWithoutRunRef> {
  const action = contextFile.action;
  const isReviewAction = action.startsWith('review-');

  // producedResultRefs — Core-expected complete set for artifact actions.
  let producedResultRefs: readonly ResultRef[] | undefined;
  if (action === 'explore' || action === 'revise-explore') {
    producedResultRefs = await deriveExploreProducedRefs(contextFile, repoRoot);
  } else if (action === 'propose') {
    producedResultRefs = await deriveProposeProducedRefs(contextFile, repoRoot);
  } else if (action === 'revise-propose') {
    producedResultRefs = await deriveReviseProposeProducedRefs(
      contextFile,
      repoRoot,
      input.producedArtifactTags,
    );
  }
  // apply / revise-apply / archive / review-* / delivery-* → no producedResultRefs.

  // consumedInputRefs — from typed Run IDs.
  let consumedInputRefs: readonly ResultRef[] | undefined;
  if (input.consumedRunIds !== undefined && input.consumedRunIds.length > 0) {
    consumedInputRefs = await deriveConsumedInputRefs(contextFile, runDir, input.consumedRunIds);
  }

  // reviewVerdictRef — from context.sourceReviewRun (non-review actions only).
  // review-* Runs MUST NOT carry reviewVerdictRef (self-reference, Q1-7).
  let reviewVerdictRef: ResultRef | undefined;
  if (!isReviewAction && contextFile.sourceReviewRun !== undefined) {
    reviewVerdictRef = await deriveReviewVerdictRef(contextFile, runDir);
  }

  // verificationSummaryRef — review-apply only, Core-derived from verification.md.
  let verificationSummaryRef: ResultRef | undefined;
  if (action === 'review-apply') {
    verificationSummaryRef = await deriveVerificationSummaryArtifactRef(contextFile, repoRoot);
  }

  const actionResult: ActionResultWithoutRunRef = {
    action: action as ChangeAction | DeliveryAction,
    executionStatus: input.executionStatus!,
    summary: input.summary!,
    ...(producedResultRefs !== undefined && { producedResultRefs }),
    ...(consumedInputRefs !== undefined && { consumedInputRefs }),
    ...(reviewVerdictRef !== undefined && { reviewVerdictRef }),
    ...(verificationSummaryRef !== undefined && { verificationSummaryRef }),
  };
  return actionResult;
}

/**
 * Derive the produced-artifact ref set for `explore` / `revise-explore`.
 *
 * Core unconditionally resolves `explore.md` and builds a single
 * `produced-artifact` ref from its current bytes. Caller tags are ignored —
 * there is exactly one explore artifact. Missing `explore.md` →
 * `RESULT_REF_TARGET_MISSING` (Run stays pending).
 */
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
 * Derive the COMPLETE Core-expected produced set for initial `propose`.
 *
 * Core unconditionally builds: `proposal.md` + `design.md` + `tasks.md` + the
 * complete current `specs/**` namespace. Caller tags are ignored — the initial
 * set is not shrinkable. Any missing target → `RESULT_REF_TARGET_MISSING`.
 */
async function deriveProposeProducedRefs(
  contextFile: ContextFile,
  repoRoot: string,
): Promise<ResultRef[]> {
  requireChangeId(contextFile, 'propose');
  const changeId = contextFile.changeId!;
  const refs: ResultRef[] = [];
  refs.push(await buildSingletonArtifactRef('propose', 'proposal', changeId, repoRoot));
  refs.push(await buildSingletonArtifactRef('propose', 'design', changeId, repoRoot));
  refs.push(await buildSingletonArtifactRef('propose', 'tasks', changeId, repoRoot));
  const specsRefs = await enumerateSpecsNamespace(repoRoot, changeId);
  refs.push(...specsRefs);
  refs.sort((a, b) => a.ref.localeCompare(b.ref));
  return refs;
}

/**
 * Derive the effective produced set for `revise-propose` via subset overlay.
 *
 * `successor effective set = predecessor effective set, with declared tags
 * replaced`. Declared singletons (proposal/design/tasks) replace the
 * predecessor ref of the same logical identity with a fresh Core-derived ref
 * (current bytes). Declared `specs` replaces ALL predecessor specs refs with a
 * fresh Core-enumerated canonical namespace. Non-declared refs are inherited
 * as-is from the predecessor (their fingerprint is preserved; the preflight
 * validates they still match current bytes, catching undeclared drift).
 *
 * Caller supplies ONLY changed tags — Core enumerates and hashes.
 */
async function deriveReviseProposeProducedRefs(
  contextFile: ContextFile,
  repoRoot: string,
  declaredTags: readonly ProducedArtifactTag[] | undefined,
): Promise<ResultRef[]> {
  requireChangeId(contextFile, 'revise-propose');
  const changeId = contextFile.changeId!;
  const declared = new Set(declaredTags ?? []);

  // Fresh Core-derived refs for declared tags.
  const freshRefs: ResultRef[] = [];
  const freshLogicalRefs = new Set<string>();
  if (declared.has('proposal')) {
    const r = await buildSingletonArtifactRef('revise-propose', 'proposal', changeId, repoRoot);
    freshRefs.push(r);
    freshLogicalRefs.add(r.ref);
  }
  if (declared.has('design')) {
    const r = await buildSingletonArtifactRef('revise-propose', 'design', changeId, repoRoot);
    freshRefs.push(r);
    freshLogicalRefs.add(r.ref);
  }
  if (declared.has('tasks')) {
    const r = await buildSingletonArtifactRef('revise-propose', 'tasks', changeId, repoRoot);
    freshRefs.push(r);
    freshLogicalRefs.add(r.ref);
  }
  const declaredSpecs = declared.has('specs');
  if (declaredSpecs) {
    const specsRefs = await enumerateSpecsNamespace(repoRoot, changeId);
    freshRefs.push(...specsRefs);
    for (const r of specsRefs) {
      freshLogicalRefs.add(r.ref);
    }
  }

  // Inherit predecessor refs not overwritten by declared tags.
  const predecessorRefs = await resolvePredecessorProducedRefs(contextFile, repoRoot);
  const inherited: ResultRef[] = [];
  for (const predRef of predecessorRefs) {
    const isSpec = predRef.ref.includes('/specs/');
    // Declared 'specs' overwrites ALL predecessor specs refs.
    if (isSpec && declaredSpecs) {
      continue;
    }
    // Declared singleton overwrites the predecessor ref of the same logical ref.
    if (freshLogicalRefs.has(predRef.ref)) {
      continue;
    }
    inherited.push(predRef);
  }

  const all = [...inherited, ...freshRefs];
  all.sort((a, b) => a.ref.localeCompare(b.ref));
  return all;
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
  const deliveryRunsDir = deriveDeliveryRunsDir(runDir, contextFile);
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
  const deliveryRunsDir = deriveDeliveryRunsDir(runDir, contextFile);
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
 * via archive-aware resolution, reads its bytes, and builds a
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
 * current bytes (archive-aware), construct a `produced-artifact` ResultRef.
 */
async function buildSingletonArtifactRef(
  action: string,
  tag: Exclude<ProducedArtifactTag, 'specs'>,
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
 * - Change-level Run (`changeId` present): `runDir = <deliveryRunsDir>/<changeId>/<runId>`.
 * - Delivery-level Run: `runDir = <deliveryRunsDir>/<runId>`.
 */
function deriveDeliveryRunsDir(runDir: string, contextFile: ContextFile): string {
  return contextFile.changeId !== undefined
    ? dirname(dirname(runDir))
    : dirname(runDir);
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
    contextFile,
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
    const setProblems = await validateStageEffectiveSet(
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
      requiresTuple: action === 'revise-explore' || action === 'revise-propose' || action === 'revise-apply',
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
 * actual artifact file content. Uses archive-aware resolution for non-Run
 * artifacts.
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
  let filePath: string;
  try {
    // Use archive-aware resolver for non-Run artifacts.
    const { resolveArchiveAwareArtifactPath } = await import('./result-ref-adapter.js');
    filePath = await resolveArchiveAwareArtifactPath(repoRoot, ref.ref);
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
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    throw new FlowkitError(
      'RESULT_REF_TARGET_MISSING',
      `Artifact ResultRef target unreadable: ${fieldLabel} → ${ref.ref} (Run ${runId})`,
      { ref, fieldLabel, runId, filePath },
    );
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

/**
 * Resolve the predecessor's full `producedResultRefs` by tracing the
 * review/revise lineage: `sourceReviewRun` → review context.json
 * `reviewedRunId` → predecessor result.json `producedResultRefs`.
 *
 * Returns `[]` when the lineage cannot be traced (missing review/predecessor
 * result). The caller treats an empty predecessor set as "no inherited refs",
 * which keeps the specs namespace exact-set check correct (empty effective
 * specs ≠ non-empty canonical → fail-closed).
 */
async function resolvePredecessorProducedRefs(
  contextFile: ContextFile,
  repoRoot: string,
): Promise<ResultRef[]> {
  if (contextFile.sourceReviewRun === undefined) {
    return [];
  }

  // Read review Run's context.json to get reviewedRunId (predecessor).
  const reviewRunDir = resolveSiblingRunDir(repoRoot, contextFile.runPath, contextFile.sourceReviewRun);
  let reviewedRunId: string | undefined;
  try {
    const reviewCtxContent = await readFile(join(reviewRunDir, 'context.json'), 'utf-8');
    const reviewCtx = JSON.parse(reviewCtxContent) as Record<string, unknown>;
    reviewedRunId = typeof reviewCtx['reviewedRunId'] === 'string' ? reviewCtx['reviewedRunId'] : undefined;
  } catch {
    return [];
  }
  if (reviewedRunId === undefined) {
    return [];
  }

  // Read predecessor's result.json → producedResultRefs.
  const predecessorRunDir = resolveSiblingRunDir(repoRoot, contextFile.runPath, reviewedRunId);
  try {
    const predResultContent = await readFile(join(predecessorRunDir, 'result.json'), 'utf-8');
    const predResult = JSON.parse(predResultContent) as Record<string, unknown>;
    const ar = predResult['actionResult'];
    if (ar === undefined || typeof ar !== 'object' || ar === null) {
      return [];
    }
    const arObj = ar as Record<string, unknown>;
    const refs = arObj['producedResultRefs'];
    if (!Array.isArray(refs)) {
      return [];
    }
    return (refs as Array<Record<string, unknown>>)
      .filter((r) => typeof r['ref'] === 'string' && typeof r['versionFingerprint'] === 'string')
      .map((r) => ({
        ref: r['ref'] as string,
        versionFingerprint: r['versionFingerprint'] as string,
        ...(typeof r['kind'] === 'string' && { kind: r['kind'] as ResultRef['kind'] }),
      }));
  } catch {
    return [];
  }
}

/**
 * Resolve a sibling Run's directory (same delivery/change directory as the
 * current Run) from `runPath` + `siblingRunId`. `runPath` ends with
 * `/<currentRunId>/`; this strips the last segment and appends `siblingRunId`.
 */
function resolveSiblingRunDir(repoRoot: string, runPath: string, siblingRunId: string): string {
  const normalized = normalizeSeparators(runPath).replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  const base = idx >= 0 ? normalized.slice(0, idx) : normalized;
  return join(repoRoot, base, siblingRunId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeRunPaths(
  deliveryRunsDir: string,
  runsPathPrefix: string,
  deliveryId: string,
  changeId: string | undefined,
  runId: string,
): { runDir: string; runPath: string } {
  const segments = [deliveryId];
  if (changeId !== undefined) {
    segments.push(changeId);
  }
  segments.push(runId);

  const relativePart = segments.join('/');
  const runDir = join(deliveryRunsDir, ...(changeId !== undefined ? [changeId, runId] : [runId]));
  const runPath = `${normalizeSeparators(runsPathPrefix).replace(/\/+$/, '')}/${relativePart}/`;
  return { runDir, runPath };
}

function buildContextFile(
  input: CreateRunInput,
  runPath: string,
  inputRef: ResultRef | undefined,
): ContextFile {
  const contextFile: ContextFile = {
    schemaVersion: 2,
    runId: input.runId,
    deliveryId: input.deliveryId,
    action: input.action,
    role: input.role,
    ownerAuthorization: input.ownerAuthorization,
    runPath,
    ...(input.changeKey !== undefined && { changeKey: input.changeKey }),
    ...(input.changeId !== undefined && { changeId: input.changeId }),
    ...(inputRef !== undefined && { inputRef }),
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
