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
import type { ResultRef, ReviewVerdictValue, Role } from '../domain/types.js';
import { FlowkitError } from '../shared/errors.js';
import { atomicWriteFile } from '../shared/atomic-write.js';
import { normalizeSeparators } from '../shared/paths.js';
import {
  validateContextFile,
  validateContextFileIdentity,
  validateActionResultWithoutRunRef,
  validateRunResultFileCombination,
  validateReviewVerdictIntegrity,
  type ContextFile,
  type ContextFileConstraints,
  type RunResultFile,
  type ActionResultWithoutRunRef,
} from './serialization.js';
import {
  buildRunResultRef,
  computeResultFileHash,
  resolveRunResultPath,
  resolveSingletonArtifactRef,
  enumerateSpecsNamespace,
  extractSpecsLogicalIdentities,
} from './result-ref-adapter.js';

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
 * Write a Run's terminal result.json using the exclusive fs.link publish
 * protocol (D5).
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
export async function writeRunResult(
  runDir: string,
  result: RunResultFile,
): Promise<void> {
  // 1. Read context.json → validate C1 schema + identity (C1-AP-002).
  const contextFile = await readContextFile(runDir);
  validateContextFileIdentity(contextFile, runDir);

  // 2. Reconstruct the CURRENT persisted Run status.
  //    - result.json absent → status=pending (projected from ContextFile).
  //    - result.json present → status=runStatus (terminal; reconstructed from
  //      the persisted RunResultFile so assertMutable observes the real
  //      persisted state, not a freshly projected pending Run — C1-AP-002).
  const currentRun = await reconstructCurrentRun(contextFile, runDir);

  // 3. assertMutable — rejects terminal Runs based on persisted state.
  //    Throws RUN_TERMINAL when result.json already exists with a terminal
  //    status, BEFORE any publication attempt.
  assertMutable(currentRun);

  // 4. Validate combination + actionResult projection.
  validateRunResultFileCombination(result);
  if (result.actionResult !== undefined) {
    validateActionResultWithoutRunRef(result.actionResult);
  }

  // 4b. Validate review verdict integrity before publication (C1-AP-006).
  //     completed review-* Runs MUST carry reviewVerdict; non-review or
  //     non-completed Runs MUST NOT. Detecting a missing verdict only at
  //     Reader time is too late — the result is already terminal and immutable.
  validateReviewVerdictIntegrity(contextFile.action, result);

  // 4c. Q1-8: Completion preflight — validate all Core-owned ResultRefs
  //     against actual file content before terminal publication. Target
  //     missing → RESULT_REF_TARGET_MISSING (Run stays pending). Hash
  //     mismatch → RESULT_REF_MISMATCH (Run stays pending). This allows
  //     retry after correction (Q1-6.8). assertMutable + fs.link create-once
  //     remains the terminal invariant (Q1-6.9).
  if (result.actionResult !== undefined) {
    const repoRoot = deriveRepoRoot(runDir, contextFile.runPath);
    await completionPreflight(contextFile, result.actionResult, repoRoot);
  }

  // 5. Serialize (runRef already absent from ActionResultWithoutRunRef).
  const json = serializeRunResultFile(result);

  // 6. Write temp file.
  const tempPath = join(
    runDir,
    `.result-tmp-${process.pid}-${Date.now()}.json`,
  );
  await writeFile(tempPath, json, 'utf-8');

  // 7. fs.link — atomic create-if-not-exists.
  const resultPath = join(runDir, 'result.json');
  try {
    await link(tempPath, resultPath);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      // 8. Concurrent writer won the race — clean temp, throw RUN_TERMINAL.
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

  // 9. Success: temp is now linked as result.json; clean the temp name
  // (best-effort — the link created a second name for the same inode, removing
  // it leaves result.json intact).
  await bestEffortUnlink(tempPath);
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
async function completionPreflight(
  contextFile: ContextFile,
  actionResult: ActionResultWithoutRunRef,
  repoRoot: string,
): Promise<void> {
  const action = contextFile.action;
  const isReviewAction = action.startsWith('review-');

  // Q1-7: review-* Runs MUST NOT carry reviewVerdictRef (self-reference).
  if (isReviewAction && actionResult.reviewVerdictRef !== undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `review-* Run MUST NOT carry reviewVerdictRef (self-reference, action=${action})`,
      { action, runId: contextFile.runId },
    );
  }

  // Q1-9: verificationSummaryRef scope — only review-apply carries it.
  const isReviewApply = action === 'review-apply';
  if (!isReviewApply && actionResult.verificationSummaryRef !== undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `verificationSummaryRef is only allowed on review-apply (action=${action})`,
      { action, runId: contextFile.runId },
    );
  }

  // Q1-6: Re-verify inputRef for review-* Runs (reviewed result may have changed).
  if (isReviewAction && contextFile.inputRef !== undefined && contextFile.reviewedRunId !== undefined) {
    await verifyRunResultRef(contextFile.inputRef, repoRoot, contextFile.runId, 'inputRef');
  }

  // Validate producedResultRefs (mutable Change artifacts).
  if (actionResult.producedResultRefs !== undefined) {
    for (let i = 0; i < actionResult.producedResultRefs.length; i++) {
      const ref = actionResult.producedResultRefs[i];
      await verifyArtifactRef(ref, repoRoot, contextFile.runId, `producedResultRefs[${i}]`);
    }
  }

  // Validate consumedInputRefs (immutable Run-result refs).
  if (actionResult.consumedInputRefs !== undefined) {
    for (let i = 0; i < actionResult.consumedInputRefs.length; i++) {
      const ref = actionResult.consumedInputRefs[i];
      await verifyRunResultRef(ref, repoRoot, contextFile.runId, `consumedInputRefs[${i}]`);
    }
  }

  // Validate reviewVerdictRef (immutable Run-result ref to another review Run).
  if (actionResult.reviewVerdictRef !== undefined) {
    await verifyRunResultRef(actionResult.reviewVerdictRef, repoRoot, contextFile.runId, 'reviewVerdictRef');
  }

  // Validate verificationSummaryRef (mutable Change artifact).
  if (actionResult.verificationSummaryRef !== undefined) {
    await verifyArtifactRef(actionResult.verificationSummaryRef, repoRoot, contextFile.runId, 'verificationSummaryRef');
  }

  // Q1-5.0: Initial artifact completeness check.
  // Only validate when producedResultRefs is explicitly present — Core
  // auto-derivation of the complete expected set is handled by the
  // publishRunResult entry point (Q1-6.2/6.4). When producedResultRefs is
  // absent, the preflight skips the completeness check (the result has no
  // produced-artifact claims to validate).
  if ((action === 'explore' || action === 'propose') && actionResult.producedResultRefs !== undefined) {
    await validateInitialArtifactCompleteness(contextFile, actionResult, repoRoot);
  }

  // Q1-5.3.1 / Q1-RP-006: revise-propose specs namespace exact-set comparison.
  // The effective specs logical-ref set MUST exactly equal the current canonical
  // specs/** namespace. Namespace drift (new/deleted spec) without declaring
  // `specs` → mismatch → Run stays pending.
  if (action === 'revise-propose') {
    await validateReviseProposeEffectiveSet(contextFile, actionResult, repoRoot);
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
 * Q1-5.0: Validate that an initial explore/propose Run's producedResultRefs
 * covers the complete Core-enumerated expected set.
 *
 * - initial explore: MUST include exactly `openspec/changes/<changeId>/explore.md`
 * - initial propose: MUST include `proposal.md`, `design.md`, `tasks.md` +
 *   all files in `specs/**` namespace
 *
 * Missing expected refs or extra unexpected refs are rejected.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on completeness violation.
 */
async function validateInitialArtifactCompleteness(
  contextFile: ContextFile,
  actionResult: ActionResultWithoutRunRef,
  repoRoot: string,
): Promise<void> {
  if (contextFile.changeId === undefined) {
    return; // Cannot validate without changeId.
  }
  const changeId = contextFile.changeId;
  const action = contextFile.action;
  const produced = actionResult.producedResultRefs ?? [];

  // Build the Core-enumerated expected set.
  const expectedRefs: string[] = [];
  if (action === 'explore') {
    expectedRefs.push(resolveSingletonArtifactRef('explore', 'explore', changeId));
  } else if (action === 'propose') {
    expectedRefs.push(resolveSingletonArtifactRef('propose', 'proposal', changeId));
    expectedRefs.push(resolveSingletonArtifactRef('propose', 'design', changeId));
    expectedRefs.push(resolveSingletonArtifactRef('propose', 'tasks', changeId));
    // Enumerate specs namespace.
    const specsRefs = await enumerateSpecsNamespace(repoRoot, changeId);
    expectedRefs.push(...specsRefs.map((r) => r.ref));
  }

  // Compare produced refs with expected set (exact match).
  const producedSet = new Set(produced.map((r) => r.ref));
  const expectedSet = new Set(expectedRefs);

  const missing = expectedRefs.filter((r) => !producedSet.has(r));
  const extra = produced.filter((r) => !expectedSet.has(r.ref)).map((r) => r.ref);

  if (missing.length > 0 || extra.length > 0) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Initial ${action} producedResultRefs does not match Core-expected complete set (missing: [${missing.join(', ')}], extra: [${extra.join(', ')}])`,
      { action, runId: contextFile.runId, missing, extra },
    );
  }
}

/**
 * Q1-5.3 / Q1-5.3.1 / Q1-5.6 / Q1-RP-006: For revise-propose, build the
 * effective artifact set (predecessor overlay successor) and validate it at
 * terminal preflight.
 *
 * 1. **Inherited refs**: predecessor `producedResultRefs` whose logical ref is
 *    NOT overwritten by a successor declared ref MUST still match current
 *    canonical bytes. An undeclared singleton/spec content change → inherited
 *    fingerprint mismatch → Run stays pending (Q1-5.3 / task 5.11).
 * 2. **Specs namespace exact-set**: the effective specs logical-ref identities
 *    MUST exactly equal the current canonical `specs/**` namespace. Namespace
 *    drift (new/deleted spec) without declaring `specs` → mismatch → Run stays
 *    pending (Q1-5.3.1 / Q1-RP-006 / task 5.13).
 *
 * Successor declared refs are already validated by the main preflight loop
 * (`verifyArtifactRef`); this function only validates INHERITED refs and the
 * specs namespace invariant.
 *
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` / `RESULT_REF_MISMATCH`
 *   when an inherited ref's target is missing or its content hash no longer
 *   matches current canonical bytes.
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on specs namespace mismatch.
 */
async function validateReviseProposeEffectiveSet(
  contextFile: ContextFile,
  actionResult: ActionResultWithoutRunRef,
  repoRoot: string,
): Promise<void> {
  if (contextFile.changeId === undefined) {
    return; // Cannot validate without changeId.
  }
  const changeId = contextFile.changeId;
  const produced = actionResult.producedResultRefs ?? [];
  const successorRefSet = new Set(produced.map((r) => r.ref));

  // Resolve predecessor's full producedResultRefs via review/revise lineage.
  const predecessorRefs = await resolvePredecessorProducedRefs(contextFile, repoRoot);

  // 1. Validate inherited refs (predecessor refs not overwritten by successor).
  for (const predRef of predecessorRefs) {
    if (successorRefSet.has(predRef.ref)) {
      continue; // Overwritten by successor — already validated as a declared ref.
    }
    await verifyArtifactRef(predRef, repoRoot, contextFile.runId, `inherited(${predRef.ref})`);
  }

  // 2. Specs namespace exact-set comparison.
  const successorSpecsRefs = produced.filter((r) => r.ref.includes('/specs/'));
  let effectiveSpecsIdentities: readonly string[];
  if (successorSpecsRefs.length > 0) {
    // Successor declared specs → effective = successor's specs refs.
    effectiveSpecsIdentities = extractSpecsLogicalIdentities(successorSpecsRefs);
  } else {
    // Successor did not declare specs → inherit predecessor's specs refs.
    const predecessorSpecsRefs = predecessorRefs.filter((r) => r.ref.includes('/specs/'));
    effectiveSpecsIdentities = extractSpecsLogicalIdentities(predecessorSpecsRefs);
  }

  const canonicalRefs = await enumerateSpecsNamespace(repoRoot, changeId);
  const canonicalIdentities = extractSpecsLogicalIdentities(canonicalRefs);

  if (effectiveSpecsIdentities.join(',') !== canonicalIdentities.join(',')) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `revise-propose effective specs namespace mismatch: expected [${canonicalIdentities.join(', ')}], got [${effectiveSpecsIdentities.join(', ')}]; declare 'specs' tag to re-enumerate after namespace change`,
      { runId: contextFile.runId, effective: effectiveSpecsIdentities, canonical: canonicalIdentities },
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
