/**
 * C1 formal-fact-reader-and-persistence: Run persistence — createRun (staging
 * + atomic publish) and writeRunResult (exclusive fs.link publish).
 *
 * createRun (D4): prepares action.md + context.json in a staging directory
 * `.tmp-<runId>/`, validates, then atomically publishes via directory rename.
 * Staging is invisible to Reader.
 *
 * writeRunResult (D5): the SOLE terminal-result publish path. Uses temp-file +
 * `fs.link` for atomic create-if-not-exists (NOT `atomicWriteFile`, which is
 * atomic replace). First writer wins; subsequent writers get `RUN_TERMINAL`.
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
} from './serialization.js';

// ---------------------------------------------------------------------------
// createRun
// ---------------------------------------------------------------------------

/**
 * Input to {@link createRun}. The caller supplies the Run identity, action.md
 * content, and the filesystem root. C1 computes runPath and the staging path.
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
  readonly inputRef?: ResultRef;
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
}

/**
 * Create a Run by staging action.md + context.json, validating, then
 * atomically publishing via directory rename.
 *
 * @returns The absolute path to the published Run directory.
 * @throws {FlowkitError} on validation failure, staging error, or publish
 *   collision (an existing Run directory at the target path).
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

  // 2. Build the ContextFile object.
  const contextFile = buildContextFile(input, runPath);

  // 3. Validate schema + identity (before writing anything).
  validateContextFile(contextFile);
  validateContextFileIdentity(contextFile, runDir);

  // 4. Prepare staging directory `.tmp-<runId>/`.
  const stagingDir = join(input.deliveryRunsDir, `.tmp-${input.runId}`);
  await bestEffortClean(stagingDir);
  await mkdir(stagingDir, { recursive: true });

  try {
    // 5. Write action.md + context.json into staging via atomicWriteFile.
    const actionMdPath = join(stagingDir, 'action.md');
    const contextJsonPath = join(stagingDir, 'context.json');
    await atomicWriteFile(actionMdPath, input.actionMd);
    await atomicWriteFile(contextJsonPath, serializeContextFile(contextFile));

    // 6. Atomically publish via directory rename.
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

function buildContextFile(input: CreateRunInput, runPath: string): ContextFile {
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
    ...(input.inputRef !== undefined && { inputRef: input.inputRef }),
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
