/**
 * C1 formal-fact-reader-and-persistence: formal-fact Reader (D1, D2, D3).
 *
 * Reads formal facts from the filesystem into a {@link FormalFactSnapshot}.
 * Each fact has one authority (D2): the Reader does not cross-infer across
 * authorities. Conflicts are collected as {@link FactConflict}[] — the Reader
 * never auto-picks one authority, and Policy MUST block when `conflicts` is
 * non-empty.
 *
 * Authorities:
 *   - Delivery Manifest (YAML): delivery state, fullTestStatus, change list.
 *   - `.flowkit/runs/<deliveryId>/`: committed Runs, review verdicts.
 *   - `openspec/changes/<changeId>/`: OpenSpec artifact existence.
 *   - Git log: formal boundary summaries (delegated to git-boundary-reader).
 *
 * The Reader does NOT call the OpenSpec CLI (D3). Staging directories
 * (`.tmp-<runId>/`) and temp files (`.result-tmp-*.json`) are ignored.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeSeparators } from '../shared/paths.js';
import { parseYaml } from './yaml-parser.js';
import { readGitBoundarySummaries } from './git-boundary-reader.js';
import { discriminateRun, normalizeBootstrapRunStatus } from '../persistence/legacy-recognizer.js';
import {
  validateContextFile,
  admitC1RunResult,
} from '../persistence/serialization.js';
import type { ContextFile } from '../persistence/serialization.js';
import {
  resolveArchiveAwareArtifactPath,
  validateStageEffectiveSet,
  resolveRunResultPath,
  computeResultFileHash,
  resolveVerificationSummaryRef,
  validateReviewRunBinding,
  validateSourceReviewTuple,
  VERIFICATION_SUMMARY_KIND,
} from '../persistence/result-ref-adapter.js';
import {
  classifyArtifactGenerations,
  classifyVerificationGenerations,
  artifactStage,
  type ReviewLineageFact,
} from './generation-resolver.js';
import type { ResultRef } from '../domain/types.js';
import { FlowkitError } from '../shared/errors.js';
import type {
  ChangeFact,
  FactConflict,
  FormalFactSnapshot,
  GitBoundaryFact,
  OpenSpecArtifactFact,
  ReviewVerdictFact,
  RunFact,
} from './formal-fact-snapshot.js';
import type { RunStatus } from '../domain/types.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ReadFormalFactSnapshotInput {
  /** Absolute path to the Git repository root. */
  readonly repoRoot: string;
  /** The Delivery id to read facts for. */
  readonly deliveryId: string;
  /** Repo-relative path to the runs root (e.g. `.flowkit/runs`). */
  readonly runsPathPrefix: string;
  /** Repo-relative path to OpenSpec changes (e.g. `openspec/changes`). */
  readonly openspecChangesPath: string;
  /** Repo-relative path to the delivery manifest directory (e.g. `.flowkit/manifests`). */
  readonly manifestPathPrefix: string;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Read a {@link FormalFactSnapshot} for a Delivery. Collects conflicts rather
 * than throwing — Policy blocks on non-empty `conflicts`.
 */
export async function readFormalFactSnapshot(
  input: ReadFormalFactSnapshotInput,
): Promise<FormalFactSnapshot> {
  const conflicts: FactConflict[] = [];

  const deliveryRunsDir = join(input.repoRoot, input.runsPathPrefix, input.deliveryId);

  // 1. Delivery Manifest (YAML).
  const manifestResult = await readDeliveryManifest(input);

  // 2. Committed Runs + review verdicts.
  const { runs, reviewVerdicts, runConflicts } = await readRuns(deliveryRunsDir);
  conflicts.push(...runConflicts);

  // 3. OpenSpec artifacts.
  const openSpecArtifacts = await readOpenSpecArtifacts(input, manifestResult.changes);

  // 4. Git boundaries (read-only, delegated).
  let gitBoundaries: GitBoundaryFact[] = [];
  try {
    gitBoundaries = await readGitBoundarySummaries(input.repoRoot, input.deliveryId);
  } catch {
    // Git unavailable — Git boundaries are best-effort; not a hard conflict.
  }

  // 5. Owner authorization facts (from Run context.json ownerAuthorization).
  const ownerAuthorizations = collectOwnerAuthorizations(runs);

  // 6. Manifest conflicts.
  conflicts.push(...manifestResult.conflicts);

  // 7. Q1: Review exact binding validation (tasks 4.5-4.6 / Q1-RA-006).
  //    For each completed review-* Run, verify inputRef.ref ↔ reviewedRunId
  //    result.json path and inputRef.versionFingerprint ↔ actual SHA-256.
  //    A review whose binding is broken is NOT admitted into reviewVerdicts:
  //    it cannot be consumed as lineage by generation classification.
  const bindingResult = await validateReviewExactBindings(
    runs,
    reviewVerdicts,
    input.repoRoot,
    input.runsPathPrefix,
  );
  conflicts.push(...bindingResult.conflicts);
  const admittedReviewVerdicts = bindingResult.admittedVerdicts;

  // 7b. Q1-RA-007: Strict validation of immutable Run-result refs. This runs
  //     BEFORE mutable-artifact generation classification so a tampered
  //     consumed/input/reviewVerdict reference can never hide behind a healthy
  //     mutable artifact set. Review inputRef is covered by step 7
  //     (validateReviewExactBindings); non-review inputRef, consumedInputRefs
  //     and reviewVerdictRef are validated here for every generation class.
  conflicts.push(
    ...await validateImmutableRunResultRefs(
      runs,
      admittedReviewVerdicts,
      input.repoRoot,
      input.runsPathPrefix,
    ),
  );

  // 8. Q1: Generation-aware mutable artifact validation (tasks 5.1-5.8).
  //    Classify artifact generations and validate only the current effective
  //    generation's producedResultRefs against current canonical bytes.
  //    ONLY exact-bound reviews are used as lineage (Q1-RA-006).
  conflicts.push(
    ...await validateGenerationAwareArtifacts(
      runs,
      admittedReviewVerdicts,
      input.repoRoot,
    ),
  );

  // 9. Q1: Verification generation-aware validation (tasks 7.4-7.7 / Q1-9).
  //    verification.md is a mutable Change artifact. Classify review-apply
  //    verification generations and validate ONLY the current review-apply's
  //    verificationSummaryRef against current verification.md bytes. Superseded
  //    review-apply summary refs (legitimate changes-requested → revise-apply
  //    → review-apply lineage) are not re-validated. No-lineage replacement of
  //    verification.md fails closed.
  conflicts.push(
    ...await validateVerificationGenerationAware(
      runs,
      admittedReviewVerdicts,
      input.repoRoot,
    ),
  );

  return {
    deliveryId: input.deliveryId,
    deliveryState: manifestResult.deliveryState,
    deliveryFullTestStatus: manifestResult.deliveryFullTestStatus,
    changes: manifestResult.changes,
    runs,
    openSpecArtifacts,
    gitBoundaries,
    ownerAuthorizations,
    reviewVerdicts: admittedReviewVerdicts,
    conflicts,
  };
}

// ---------------------------------------------------------------------------
// Delivery Manifest (YAML)
// ---------------------------------------------------------------------------

interface ManifestResult {
  readonly deliveryState: FormalFactSnapshot['deliveryState'];
  readonly deliveryFullTestStatus: FormalFactSnapshot['deliveryFullTestStatus'];
  readonly changes: readonly ChangeFact[];
  readonly conflicts: readonly FactConflict[];
}

async function readDeliveryManifest(
  input: ReadFormalFactSnapshotInput,
): Promise<ManifestResult> {
  const conflicts: FactConflict[] = [];
  const manifestPath = join(
    input.repoRoot,
    input.manifestPathPrefix,
    `${input.deliveryId}.yaml`,
  );

  let exists = false;
  try {
    await stat(manifestPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (!exists) {
    // No manifest — return empty state. Not a conflict per se; the Delivery
    // may be bootstrap-only. Policy decides whether to block.
    return {
      deliveryState: undefined,
      deliveryFullTestStatus: undefined,
      changes: [],
      conflicts,
    };
  }

  const content = await readFile(manifestPath, 'utf-8');
  const parseResult = parseYaml(content);
  if (!parseResult.ok) {
    conflicts.push({
      dimension: 'yaml-parse',
      authority: manifestPath,
      message: parseResult.error,
      ...(parseResult.line !== undefined && { detail: { line: parseResult.line } }),
    });
    return {
      deliveryState: undefined,
      deliveryFullTestStatus: undefined,
      changes: [],
      conflicts,
    };
  }

  const manifest = parseResult.value as Record<string, unknown>;

  // C1-AP-003: the active Delivery Manifest stores delivery state and
  // full-test status under the nested `delivery:` mapping (see
  // openspec/delivery-groups/20260806-01-deterministic-core.yaml). Reading
  // top-level `state`/`fullTestStatus` yields undefined on the real manifest,
  // so Policy cannot determine the active Delivery or Full Test gate.
  const deliveryNode = manifest['delivery'];
  if (deliveryNode === undefined || typeof deliveryNode !== 'object' || deliveryNode === null || Array.isArray(deliveryNode)) {
    conflicts.push({
      dimension: 'delivery-manifest-shape',
      authority: manifestPath,
      message: 'Delivery Manifest missing required `delivery:` mapping (state and fullTestStatus live under `delivery:`)',
      detail: { manifestPath },
    });
    return {
      deliveryState: undefined,
      deliveryFullTestStatus: undefined,
      changes: readChangeFacts(manifest['changes']),
      conflicts,
    };
  }
  const deliveryObj = deliveryNode as Record<string, unknown>;

  // C1-AP-003: fail closed for missing/invalid required delivery fields
  // rather than silently returning undefined. The active Delivery's state and
  // fullTestStatus are required Policy inputs; undefined here would let Policy
  // mis-route the lifecycle.
  const VALID_DELIVERY_STATES: ReadonlySet<string> = new Set(['active', 'completed', 'cancelled']);
  const VALID_FULL_TEST_STATUSES: ReadonlySet<string> = new Set([
    'not-ready',
    'awaiting-user-decision',
    'authorized',
    'passed',
    'failed',
  ]);

  let deliveryState: FormalFactSnapshot['deliveryState'];
  const stateRaw = deliveryObj['state'];
  if (typeof stateRaw === 'string' && VALID_DELIVERY_STATES.has(stateRaw)) {
    deliveryState = stateRaw as FormalFactSnapshot['deliveryState'];
  } else {
    conflicts.push({
      dimension: 'delivery-state',
      authority: manifestPath,
      message: `Delivery Manifest delivery.state missing or invalid (got ${String(stateRaw)})`,
      detail: { field: 'delivery.state', value: stateRaw },
    });
    deliveryState = undefined;
  }

  let fullTestStatus: FormalFactSnapshot['deliveryFullTestStatus'];
  const ftsRaw = deliveryObj['fullTestStatus'];
  if (typeof ftsRaw === 'string' && VALID_FULL_TEST_STATUSES.has(ftsRaw)) {
    fullTestStatus = ftsRaw as FormalFactSnapshot['deliveryFullTestStatus'];
  } else {
    conflicts.push({
      dimension: 'delivery-full-test-status',
      authority: manifestPath,
      message: `Delivery Manifest delivery.fullTestStatus missing or invalid (got ${String(ftsRaw)})`,
      detail: { field: 'delivery.fullTestStatus', value: ftsRaw },
    });
    fullTestStatus = undefined;
  }

  const changes = readChangeFacts(manifest['changes']);

  return {
    deliveryState,
    deliveryFullTestStatus: fullTestStatus,
    changes,
    conflicts,
  };
}

function readChangeFacts(value: unknown): ChangeFact[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const facts: ChangeFact[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const obj = item as Record<string, unknown>;
    const key = obj['key'];
    const id = obj['id'];
    if (typeof key !== 'string' || typeof id !== 'string') {
      continue;
    }
    const state = obj['state'];
    const required = obj['required'];
    const dependsOn = Array.isArray(obj['dependsOn'])
      ? (obj['dependsOn'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    const outputs = Array.isArray(obj['outputs'])
      ? (obj['outputs'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : undefined;
    facts.push({
      key,
      id,
      state: typeof state === 'string' ? (state as ChangeFact['state']) : 'planned',
      required: typeof required === 'boolean' ? required : false,
      dependsOn,
      ...(outputs !== undefined && { outputs }),
    });
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Runs (committed)
// ---------------------------------------------------------------------------

interface RunsResult {
  readonly runs: readonly RunFact[];
  readonly reviewVerdicts: readonly ReviewVerdictFact[];
  readonly runConflicts: readonly FactConflict[];
}

async function readRuns(deliveryRunsDir: string): Promise<RunsResult> {
  const runs: RunFact[] = [];
  const reviewVerdicts: ReviewVerdictFact[] = [];
  const conflicts: FactConflict[] = [];

  let topEntries: string[];
  try {
    topEntries = await readdir(deliveryRunsDir);
  } catch {
    // No runs directory — no Runs.
    return { runs, reviewVerdicts, runConflicts: conflicts };
  }

  for (const entry of topEntries) {
    // Skip staging dirs and temp files (task 1.12).
    if (entry.startsWith('.tmp-') || entry.startsWith('.result-tmp-')) {
      continue;
    }
    const entryPath = join(deliveryRunsDir, entry);
    const isDir = await isDirectory(entryPath);
    if (!isDir) {
      continue;
    }

    // Change-level Runs: entry is a Change directory.
    if (looksLikeChangeDir(entry)) {
      const { runs: changeRuns, reviewVerdicts: changeVerdicts, runConflicts: changeConflicts } =
        await readChangeRuns(entryPath);
      runs.push(...changeRuns);
      reviewVerdicts.push(...changeVerdicts);
      conflicts.push(...changeConflicts);
      continue;
    }

    // Delivery-level Run: entry is a Run directory.
    if (looksLikeRunId(entry)) {
      const result = await readSingleRun(entryPath, entry);
      if (result.run) {
        runs.push(result.run);
        if (result.verdict) {
          reviewVerdicts.push(result.verdict);
        }
      }
      conflicts.push(...result.conflicts);
    }
  }

  return { runs, reviewVerdicts, runConflicts: conflicts };
}

async function readChangeRuns(
  changeDir: string,
): Promise<RunsResult> {
  const runs: RunFact[] = [];
  const reviewVerdicts: ReviewVerdictFact[] = [];
  const conflicts: FactConflict[] = [];

  let entries: string[];
  try {
    entries = await readdir(changeDir);
  } catch {
    return { runs, reviewVerdicts, runConflicts: conflicts };
  }

  for (const entry of entries) {
    if (entry.startsWith('.tmp-') || entry.startsWith('.result-tmp-')) {
      continue;
    }
    if (!looksLikeRunId(entry)) {
      continue;
    }
    const entryPath = join(changeDir, entry);
    const isDir = await isDirectory(entryPath);
    if (!isDir) {
      continue;
    }
    const result = await readSingleRun(entryPath, entry);
    if (result.run) {
      runs.push(result.run);
      if (result.verdict) {
        reviewVerdicts.push(result.verdict);
      }
    }
    conflicts.push(...result.conflicts);
  }

  return { runs, reviewVerdicts, runConflicts: conflicts };
}

interface SingleRunResult {
  readonly run?: RunFact;
  readonly verdict?: ReviewVerdictFact;
  readonly conflicts: readonly FactConflict[];
}

async function readSingleRun(
  runDir: string,
  runId: string,
): Promise<SingleRunResult> {
  const conflicts: FactConflict[] = [];
  const contextPath = join(runDir, 'context.json');

  // Read context.json.
  let contextContent: string;
  try {
    contextContent = await readFile(contextPath, 'utf-8');
  } catch {
    conflicts.push({
      dimension: 'run-context',
      authority: runDir,
      message: `context.json missing for Run ${runId}`,
    });
    return { conflicts };
  }

  let parsedContext: unknown;
  try {
    parsedContext = JSON.parse(contextContent);
  } catch (e) {
    conflicts.push({
      dimension: 'run-context',
      authority: contextPath,
      message: `context.json is not valid JSON: ${(e as Error).message}`,
    });
    return { conflicts };
  }

  // Discriminate: C1 vs legacy vs conflict.
  const classification = discriminateRun(parsedContext, runDir);
  if (classification.kind === 'conflict') {
    conflicts.push({
      ...classification.conflict,
      authority: runDir,
    });
    return { conflicts };
  }

  // Read result.json (if exists).
  //
  // Q1-RA-006: an ABSENT result.json is a pending Run; any OTHER read failure
  // (EACCES, EISDIR, EIO, ...) is an inconsistent terminal authority and MUST
  // surface as a FactConflict — it MUST NOT be silently treated as absence.
  const resultPath = join(runDir, 'result.json');
  let hasResult = false;
  let parsedResult: unknown = null;
  try {
    const resultContent = await readFile(resultPath, 'utf-8');
    hasResult = true;
    try {
      parsedResult = JSON.parse(resultContent);
    } catch (e) {
      conflicts.push({
        dimension: 'run-result',
        authority: resultPath,
        message: `result.json is not valid JSON: ${(e as Error).message}`,
      });
      return { conflicts };
    }
  } catch (e) {
    if (!isErrnoENOENT(e)) {
      conflicts.push({
        dimension: 'run-result',
        authority: resultPath,
        message: `result.json unreadable (${errnoName(e)}): ${(e as Error).message}; a terminal authority that cannot be read MUST fail closed, not project pending`,
      });
      return { conflicts };
    }
    hasResult = false;
  }

  if (classification.kind === 'c1') {
    return readC1Run(classification.contextFile, runDir, runId, resultPath, hasResult, parsedResult, conflicts);
  }

  // Legacy Bootstrap Run. Pass parsedContext so the legacy review-verdict
  // extractor can read the reviewed-Run linkage from context.json (C1-AP-004).
  return readLegacyRun(
    classification.run,
    runDir,
    runId,
    hasResult,
    parsedResult,
    parsedContext,
    conflicts,
  );
}

function readC1Run(
  contextFile: ContextFile,
  runDir: string,
  runId: string,
  resultPath: string,
  hasResult: boolean,
  parsedResult: unknown,
  conflicts: FactConflict[],
): SingleRunResult {
  // Q1-RA-006: C1 result admission is TWO-PHASE and fail-closed.
  //   Phase 1 — physical validation: the complete RunResultFile projection and
  //   action-specific review verdict integrity MUST pass
  //   (validateRunResultFileCombination + validateActionResultWithoutRunRef +
  //   validateReviewVerdictIntegrity) BEFORE any formal fact is promoted.
  //   Phase 2 — exact binding: the review exact binding (reviewedRunId ↔
  //   inputRef target ↔ actual bytes) is proven in validateReviewExactBindings
  //   BEFORE the verdict may be consumed; readC1Run only ADMITS a verdict when
  //   Phase 1 passed. A review with wrong/missing target or fingerprint
  //   mismatch therefore never becomes a valid ReviewVerdictFact.
  let status: RunStatus = 'pending';
  let verdict: ReviewVerdictFact | undefined;
  // Immutable Run-result refs from the VALIDATED actionResult (RA-007).
  let consumedInputRefs: readonly ResultRef[] | undefined;
  let reviewVerdictRef: ResultRef | undefined;

  if (hasResult && parsedResult !== null) {
    // ---- Phase 1: complete closed-schema admission of the WHOLE result. ----
    // Shared C1 admission pipeline (Q1-RA-006): validateRunResultFileCombination
    // + validateActionResultWithoutRunRef + validateReviewVerdictIntegrity.
    let admittedResult: import('../persistence/serialization.js').RunResultFile;
    try {
      admittedResult = admitC1RunResult(
        JSON.stringify(parsedResult),
        contextFile.action,
      );
    } catch (e) {
      conflicts.push({
        dimension: 'run-result-schema',
        authority: resultPath,
        message: `C1 result.json failed closed physical validation (${(e as FlowkitError).code ?? 'error'}): ${(e as Error).message}`,
      });
      return { conflicts };
    }

    // Phase 1 passed — promote only now.
    const runStatus = admittedResult.runStatus;
    if (runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled') {
      status = runStatus;
    } else {
      conflicts.push({
        dimension: 'run-result-status',
        authority: runDir,
        message: `C1 result.json missing valid runStatus for Run ${runId}`,
      });
      return { conflicts };
    }

    // Carry the validated immutable refs (RA-007).
    const admittedActionResult = admittedResult.actionResult;
    consumedInputRefs = admittedActionResult?.consumedInputRefs;
    reviewVerdictRef = admittedActionResult?.reviewVerdictRef;
  }

  // ---- Phase 2: review verdict admission (C1-AP-004 canonical path). ----
  // ONLY after Phase 1 passed may a reviewVerdict become a ReviewVerdictFact.
  // C1 review-* Runs carry `reviewVerdict` in result.json, `reviewedRunId` in
  // context.json, and `inputRef` over the reviewed Run's result.json.
  // Q1-RA-006: a completed C1 review without inputRef cannot be exact-bound and
  // MUST NOT be admitted as a ReviewVerdictFact (fail-closed).
  if (contextFile.action.startsWith('review-') && hasResult && parsedResult !== null) {
    const resultObj = parsedResult as Record<string, unknown>;
    const verdictValue = resultObj['reviewVerdict'];
    const reviewedRunId = contextFile.reviewedRunId;
    if (
      (verdictValue === 'approved' || verdictValue === 'changes-requested') &&
      typeof reviewedRunId === 'string' &&
      reviewedRunId.length > 0
    ) {
      if (contextFile.inputRef === undefined) {
        conflicts.push({
          dimension: 'review-binding-missing',
          authority: runDir,
          message: `C1 review-* Run ${runId} has no inputRef; its verdict cannot be exact-bound and is not admitted`,
          detail: { runId, action: contextFile.action },
        });
      } else {
        verdict = {
          reviewRunId: contextFile.runId,
          verdict: verdictValue,
          reviewedRunId,
        };
      }
    } else {
      conflicts.push({
        dimension: 'review-verdict-linkage',
        authority: runDir,
        message: `C1 review-* Run ${runId} missing canonical reviewVerdict (result.json) or reviewedRunId (context.json)`,
        detail: {
          reviewVerdict: verdictValue,
          reviewedRunId,
          action: contextFile.action,
        },
      });
    }
  }

  const run: RunFact = {
    runId: contextFile.runId,
    deliveryId: contextFile.deliveryId,
    action: contextFile.action,
    role: contextFile.role,
    status,
    ...(contextFile.changeId !== undefined && { changeId: contextFile.changeId }),
    ...(contextFile.inputRef !== undefined && { inputRef: contextFile.inputRef }),
    ...(consumedInputRefs !== undefined && { consumedInputRefs }),
    ...(reviewVerdictRef !== undefined && { reviewVerdictRef }),
    // Q1-RA-002: carry exact persisted lineage facts so generation
    // classification can prove review/revise lineage without Run-ID inference.
    ...(contextFile.sourceReviewRun !== undefined && { sourceReviewRun: contextFile.sourceReviewRun }),
    ...(contextFile.sourceReviewVerdict !== undefined && { sourceReviewVerdict: contextFile.sourceReviewVerdict }),
    ...(contextFile.reviewedRunId !== undefined && { reviewedRunId: contextFile.reviewedRunId }),
  };

  return { run, verdict, conflicts };
}

function readLegacyRun(
  run: import('../domain/types.js').Run,
  runDir: string,
  runId: string,
  hasResult: boolean,
  parsedResult: unknown,
  parsedContext: unknown,
  conflicts: FactConflict[],
): SingleRunResult {
  // Bootstrap Run: normalize runStatus from result.json.status (D16).
  const statusResult = normalizeBootstrapRunStatus(parsedResult, hasResult);
  if (!statusResult.ok) {
    conflicts.push({
      ...statusResult.conflict,
      authority: runDir,
    });
    return { conflicts };
  }

  const runFact: RunFact = {
    runId: run.runId,
    deliveryId: run.deliveryId,
    action: run.action,
    role: run.role,
    status: statusResult.status,
    ...(run.changeId !== undefined && { changeId: run.changeId }),
  };

  // Extract review verdict for review-* actions (C1-AP-004 legacy path).
  // Bootstrap review Runs carry `verdict` at top level of result.json and
  // the reviewed-Run reference in context.json under varying field names.
  // Missing linkage → FactConflict (fail-closed).
  let verdict: ReviewVerdictFact | undefined;
  if (run.action.startsWith('review-') && hasResult && parsedResult !== null) {
    const resultObj = parsedResult as Record<string, unknown>;
    const verdictValue = resultObj['verdict'];
    const reviewedRunId = extractLegacyReviewedRunId(parsedContext);
    if (
      (verdictValue === 'approved' || verdictValue === 'changes-requested') &&
      reviewedRunId !== undefined
    ) {
      verdict = {
        reviewRunId: runId,
        verdict: verdictValue,
        reviewedRunId,
      };
    } else {
      conflicts.push({
        dimension: 'review-verdict-linkage',
        authority: runDir,
        message: `Bootstrap review-* Run ${runId} missing verdict (result.json) or reviewed-Run linkage (context.json)`,
        detail: {
          verdict: verdictValue,
          reviewedRunId,
          action: run.action,
        },
      });
    }
  }

  return { run: runFact, verdict, conflicts };
}

/**
 * Extract the reviewed-Run ID from a legacy Bootstrap review-Run context.json
 * (C1-AP-004). Bootstrap review Runs use varying field names across vintages:
 *
 *   - `reviewedRun` (path string) — early review-explore; extract Run ID from
 *     the path basename.
 *   - `input.reviewedRunId` (Run ID string) — some review-propose Runs.
 *   - `sourceRevisionRun` (Run ID) — review-revise-* and review-propose for
 *     revised propose.
 *   - `sourceApplyRun` (Run ID) — review-apply.
 *   - `sourceExploreRun` / `sourceProposeRun` (Run ID) — variant names.
 *
 * Returns `undefined` when no linkage is found (caller emits a FactConflict).
 */
function extractLegacyReviewedRunId(parsedContext: unknown): string | undefined {
  if (typeof parsedContext !== 'object' || parsedContext === null || Array.isArray(parsedContext)) {
    return undefined;
  }
  const ctx = parsedContext as Record<string, unknown>;

  // `reviewedRun` (path string) — extract Run ID from basename.
  const reviewedRunPath = ctx['reviewedRun'];
  if (typeof reviewedRunPath === 'string' && reviewedRunPath.length > 0) {
    const trimmed = reviewedRunPath.replace(/\/+$/, '');
    const segments = trimmed.split('/').filter((s) => s.length > 0);
    const basename = segments.length > 0 ? segments[segments.length - 1] : '';
    if (basename.length > 0) {
      return basename;
    }
  }

  // `input.reviewedRunId` (Run ID string).
  const inputNode = ctx['input'];
  if (typeof inputNode === 'object' && inputNode !== null && !Array.isArray(inputNode)) {
    const inputObj = inputNode as Record<string, unknown>;
    const v = inputObj['reviewedRunId'];
    if (typeof v === 'string' && v.length > 0) {
      return v;
    }
  }

  // Direct Run-ID fields used by various review vintages.
  const directFields = [
    'sourceRevisionRun',
    'sourceApplyRun',
    'sourceExploreRun',
    'sourceProposeRun',
    'sourceReviseApplyRun',
    'sourceReviseProposeRun',
    'sourceReviseExploreRun',
  ];
  for (const field of directFields) {
    const v = ctx[field];
    if (typeof v === 'string' && v.length > 0) {
      return v;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// OpenSpec artifacts
// ---------------------------------------------------------------------------

async function readOpenSpecArtifacts(
  input: ReadFormalFactSnapshotInput,
  changes: readonly ChangeFact[],
): Promise<OpenSpecArtifactFact[]> {
  const artifacts: OpenSpecArtifactFact[] = [];
  for (const change of changes) {
    const changeDir = join(input.repoRoot, input.openspecChangesPath, change.id);
    const candidates: Array<{ kind: OpenSpecArtifactFact['kind']; path: string }> = [
      { kind: 'change-proposal', path: join(changeDir, 'proposal.md') },
      { kind: 'change-design', path: join(changeDir, 'design.md') },
      { kind: 'change-tasks', path: join(changeDir, 'tasks.md') },
    ];
    for (const c of candidates) {
      const exists = await pathExists(c.path);
      artifacts.push({
        kind: c.kind,
        path: normalizeSeparators(c.path.slice(input.repoRoot.length + 1)),
        exists,
      });
    }
    // Spec file: openspec/changes/<changeId>/specs/**/spec.md
    const specPath = await findSpecFile(changeDir);
    artifacts.push({
      kind: 'change-spec',
      path: specPath !== null ? normalizeSeparators(specPath.slice(input.repoRoot.length + 1)) : '',
      exists: specPath !== null,
    });
  }
  return artifacts;
}

async function findSpecFile(changeDir: string): Promise<string | null> {
  const specsDir = join(changeDir, 'specs');
  let entries: string[];
  try {
    entries = await readdir(specsDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const specPath = join(specsDir, entry, 'spec.md');
    if (await pathExists(specPath)) {
      return specPath;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Owner authorization facts
// ---------------------------------------------------------------------------

function collectOwnerAuthorizations(runs: readonly RunFact[]): {
  ref: string;
  scope: string;
}[] {
  // Owner authorization facts are derived from Runs that required owner
  // authorization. For now, this is a placeholder — the full authorization
  // record model belongs to a later Change. The Reader exposes the empty set
  // until D1 defines the authorization store.
  void runs;
  return [];
}

// ---------------------------------------------------------------------------
// Q1: Review exact binding validation (tasks 4.5-4.6)
// ---------------------------------------------------------------------------

/**
 * Q1-6 / Q1-RA-006: Validate review-* Run exact content binding and ADMIT only
 * exact-bound reviews as `ReviewVerdictFact`s.
 *
 * For each completed review-* Run with `inputRef` and `reviewedRunId`:
 *   - Verify `inputRef.ref` matches the reviewed Run's result.json path.
 *   - Verify `inputRef.versionFingerprint` matches the actual SHA-256 of the
 *     reviewed Run's result.json content.
 *
 * A broken binding produces a `FactConflict` AND the verdict is NOT admitted
 * (it is removed from the returned `admittedVerdicts`). This satisfies
 * Q1-RA-006: an invalid review MUST NOT become a valid ReviewVerdictFact and
 * MUST NOT be consumed as lineage by generation classification.
 *
 * This binding is **permanently valid** — it is NOT affected by mutable
 * artifact generation supersession (Q1-6: "该 exact Run-result binding 永久有效").
 */
async function validateReviewExactBindings(
  runs: readonly RunFact[],
  reviewVerdicts: readonly ReviewVerdictFact[],
  repoRoot: string,
  runsPathPrefix: string,
): Promise<{ conflicts: readonly FactConflict[]; admittedVerdicts: readonly ReviewVerdictFact[] }> {
  const conflicts: FactConflict[] = [];
  const admitted: ReviewVerdictFact[] = [];

  for (const verdict of reviewVerdicts) {
    const reviewRun = runs.find((r) => r.runId === verdict.reviewRunId);
    if (reviewRun === undefined) {
      // Missing review Run is already a conflict from readC1Run; its verdict
      // must not be admitted either.
      continue;
    }

    // A completed C1 review Run MUST carry inputRef for exact binding proof.
    // Bootstrap (legacy) reviews have no ResultRef — they are admitted as-is
    // (D16: Bootstrap string-form inputRef → undefined). C1 reviews without
    // inputRef are already rejected in readC1Run (Q1-RA-006) and in
    // validateContextFile (Q1-RA-006 structural requiredness), so here we only
    // validate reviews that DO carry an inputRef.
    if (reviewRun.status !== 'completed' || reviewRun.inputRef === undefined) {
      admitted.push(verdict);
      continue;
    }

    // Q1-RA-006: SHARED review exact-binding validator — the SAME rule used by
    // terminal preflight and sibling-lineage admission. Core re-derives the
    // expected target from reviewedRunId; a different readable result with a
    // matching hash is STILL a binding violation.
    try {
      await validateReviewRunBinding({
        runId: reviewRun.runId,
        deliveryId: reviewRun.deliveryId,
        changeId: reviewRun.changeId,
        action: reviewRun.action,
        reviewedRunId: verdict.reviewedRunId,
        inputRef: reviewRun.inputRef,
        runsPathPrefix,
        repoRoot,
      });
      admitted.push(verdict);
    } catch (e) {
      const err = e as FlowkitError;
      const dimension =
        err.code === 'RESULT_REF_TARGET_MISSING'
          ? 'review-binding-missing'
          : err.code === 'SCHEMA_VALIDATION_FAILED'
            ? 'review-binding-schema'
            : 'review-binding-mismatch';
      conflicts.push({
        dimension,
        authority: reviewRun.runId,
        message: `review-* Run ${reviewRun.runId} exact-binding proof failed (${err.code}): ${err.message}`,
        detail: {
          reviewRunId: reviewRun.runId,
          reviewedRunId: verdict.reviewedRunId,
          code: err.code,
        },
      });
    }
  }

  return { conflicts, admittedVerdicts: admitted };
}

// ---------------------------------------------------------------------------
// Q1-RA-007: Strict validation of immutable Run-result references
// ---------------------------------------------------------------------------

/**
 * Strictly validate every immutable Run-result reference on a schemaVersion 2
 * Run, INDEPENDENTLY of mutable artifact generation class.
 *
 * The approved Q1 generation contract keeps immutable Run-result refs strict
 * across current, revision-window and superseded mutable generations. Reader
 * MUST NOT rely on the mutable-artifact validation looking healthy.
 *
 * Validated references (all must be `run-result` kind pointing at an existing,
 * readable result.json whose actual SHA-256 matches the fingerprint):
 *   - non-review `inputRef` (review inputRef is validated by
 *     {@link validateReviewExactBindings} with the reviewedRunId relationship);
 *   - `consumedInputRefs[*]`;
 *   - `reviewVerdictRef`.
 *
 * For every ref the Reader:
 *   1. enforces `kind === run-result`;
 *   2. reconstructs the Core-allowed canonical target
 *      `<runsPathPrefix>/<deliveryId>/<changeId?>/<runId>/result.json` from the
 *      Run ID embedded in the ref (any other target is a conflict);
 *   3. checks the target exists and is readable;
 *   4. checks the actual content SHA-256 equals the ref fingerprint.
 *
 * @returns FactConflicts (empty ⇒ all immutable refs are valid).
 */
async function validateImmutableRunResultRefs(
  runs: readonly RunFact[],
  admittedReviewVerdicts: readonly ReviewVerdictFact[],
  repoRoot: string,
  runsPathPrefix: string,
): Promise<FactConflict[]> {
  const conflicts: FactConflict[] = [];

  for (const run of runs) {
    // Non-review inputRef.
    if (!run.action.startsWith('review-') && run.inputRef !== undefined) {
      const targetRunId = extractRunIdFromResultRef(run.inputRef.ref);
      conflicts.push(
        ...await validateSingleImmutableRef(
          run,
          'inputRef',
          run.inputRef,
          targetRunId,
          repoRoot,
          runsPathPrefix,
        ),
      );
    }

    // consumedInputRefs.
    if (run.consumedInputRefs !== undefined) {
      for (let i = 0; i < run.consumedInputRefs.length; i++) {
        const ref = run.consumedInputRefs[i];
        const targetRunId = extractRunIdFromResultRef(ref.ref);
        conflicts.push(
          ...await validateSingleImmutableRef(
            run,
            `consumedInputRefs[${i}]`,
            ref,
            targetRunId,
            repoRoot,
            runsPathPrefix,
          ),
        );
      }
    }

    // Q1-RA-007: SHARED source-review tuple validator. Any source-review
    // evidence (sourceReviewRun / sourceReviewVerdict / reviewVerdictRef) must
    // be a complete, mutually-consistent immutable tuple; a missing counterpart,
    // a non-admitted source review, a wrong target, or a verdict mismatch is a
    // CONFLICT — never a silent skip. Immutable refs stay strict across
    // superseded / revision-window generations because this validation is
    // independent of mutable generation classification.
    const requiresSourceReview =
      run.action === 'revise-explore' || run.action === 'revise-propose' || run.action === 'revise-apply';
    const tupleProblems = await validateSourceReviewTuple(
      {
        runId: run.runId,
        deliveryId: run.deliveryId,
        changeId: run.changeId,
        action: run.action,
        sourceReviewRun: run.sourceReviewRun,
        sourceReviewVerdict: run.sourceReviewVerdict,
        reviewVerdictRef: run.reviewVerdictRef,
        runsPathPrefix,
        repoRoot,
      },
      {
        requiresTuple: requiresSourceReview && run.sourceReviewRun !== undefined,
        admittedSourceReviewVerdicts: admittedReviewVerdicts.map((v) => ({
          reviewRunId: v.reviewRunId,
          verdict: v.verdict,
        })),
      },
    );
    for (const p of tupleProblems) {
      const dimension =
        p.code === 'missing-sourceReviewRun' || p.code === 'missing-sourceReviewVerdict' || p.code === 'missing-reviewVerdictRef'
          ? 'immutable-ref-required'
          : p.code === 'source-review-not-admitted'
            ? 'immutable-ref-source-unadmitted'
            : p.code === 'verdict-mismatch'
              ? 'immutable-ref-verdict-mismatch'
              : p.code === 'wrong-target'
                ? 'immutable-ref-target'
                : p.code === 'wrong-kind'
                  ? 'immutable-ref-kind'
                  : p.code === 'fingerprint-mismatch'
                    ? 'immutable-ref-mismatch'
                    : 'immutable-ref-missing';
      conflicts.push({
        dimension,
        authority: run.runId,
        message: p.message,
        detail: { runId: run.runId, action: run.action, code: p.code },
      });
    }

    // Fallback: a reviewVerdictRef with NO source-review evidence at all is a
    // requiredness violation (orphaned immutable evidence).
    if (run.reviewVerdictRef !== undefined && run.sourceReviewRun === undefined && tupleProblems.length === 0) {
      conflicts.push({
        dimension: 'immutable-ref-required',
        authority: run.runId,
        message: `Run ${run.runId} carries actionResult.reviewVerdictRef but context.sourceReviewRun is absent; reviewVerdictRef MUST be backed by the source-review tuple`,
        detail: { runId: run.runId, action: run.action },
      });
    }
  }

  return conflicts;
}

/**
 * Validate a single immutable Run-result ref.
 *
 * `targetRunId` is the Run ID parsed from the ref's path tail; when the ref is
 * not a canonical `.../<runId>/result.json` path, `targetRunId` is `undefined`
 * and the ref is reported as non-Core-allowed.
 */
async function validateSingleImmutableRef(
  run: RunFact,
  field: string,
  ref: ResultRef,
  targetRunId: string | undefined,
  repoRoot: string,
  runsPathPrefix: string,
): Promise<FactConflict[]> {
  const conflicts: FactConflict[] = [];
  const authority = run.runId;

  // 1. Exact kind.
  if (ref.kind !== 'run-result') {
    conflicts.push({
      dimension: 'immutable-ref-kind',
      authority,
      message: `Run ${run.runId} ${field} kind is ${String(ref.kind)}, expected run-result`,
      detail: { runId: run.runId, field, kind: ref.kind, ref: ref.ref },
    });
    return conflicts;
  }

  // 2. Core-allowed canonical target.
  if (targetRunId === undefined) {
    conflicts.push({
      dimension: 'immutable-ref-target',
      authority,
      message: `Run ${run.runId} ${field} does not point at a canonical result.json path`,
      detail: { runId: run.runId, field, ref: ref.ref },
    });
    return conflicts;
  }
  const expectedPath = resolveRunResultPath(
    runsPathPrefix,
    run.deliveryId,
    run.changeId,
    targetRunId,
  );
  const normalizedActual = normalizeSeparators(ref.ref);
  if (normalizedActual !== expectedPath) {
    conflicts.push({
      dimension: 'immutable-ref-target',
      authority,
      message: `Run ${run.runId} ${field} ref (${normalizedActual}) does not match Core-allowed target (${expectedPath})`,
      detail: { runId: run.runId, field, expectedPath, actual: normalizedActual },
    });
    return conflicts;
  }

  // 3. Target exists and is readable.
  const targetPath = join(repoRoot, normalizedActual);
  let content: string;
  try {
    content = await readFile(targetPath, 'utf-8');
  } catch {
    conflicts.push({
      dimension: 'immutable-ref-missing',
      authority,
      message: `Run ${run.runId} ${field} target result.json not found or unreadable: ${normalizedActual}`,
      detail: { runId: run.runId, field, path: normalizedActual },
    });
    return conflicts;
  }

  // 4. Actual SHA-256.
  const actualHash = computeResultFileHash(content);
  if (actualHash !== ref.versionFingerprint) {
    conflicts.push({
      dimension: 'immutable-ref-mismatch',
      authority,
      message: `Run ${run.runId} ${field} fingerprint mismatch: ${normalizedActual} (expected ${ref.versionFingerprint}, got ${actualHash})`,
      detail: { runId: run.runId, field, expected: ref.versionFingerprint, actual: actualHash },
    });
  }

  return conflicts;
}

/**
 * Extract the Run ID from a canonical result ref path
 * `<runsPathPrefix>/<deliveryId>/<changeId?>/<runId>/result.json`.
 *
 * Returns `undefined` when the ref does not end in `/<runId>/result.json` with
 * a formal Run ID.
 */
function extractRunIdFromResultRef(ref: string): string | undefined {
  const normalized = normalizeSeparators(ref).replace(/\/+$/, '');
  const match = /\/(\d{8}-\d{3}-[a-z][a-z-]*)\/result\.json$/i.exec(normalized);
  if (match === null) {
    return undefined;
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Q1: Generation-aware mutable artifact validation (tasks 5.1-5.8)
// ---------------------------------------------------------------------------

/**
 * Q1-RA-002: Validate mutable Change artifact refs using generation-aware rules.
 *
 * Reader classifies artifact generations using EXACT review/revise lineage
 * (delegated to {@link classifyArtifactGenerations}), then decides which
 * mutable artifact refs need replacement validation against current canonical
 * bytes.
 *
 * Rules:
 *   - `current` generation: producedResultRefs MUST match current canonical bytes.
 *   - `superseded` generation: producedResultRefs are NOT re-validated against
 *     current canonical bytes (a COMPLETED legitimate successor legally
 *     overwrote them).
 *   - `revision-window`: a PENDING legitimate successor is editing canonical
 *     artifacts; mutable refs MAY be in flux and MUST NOT produce false
 *     `artifact-replaced` conflicts.
 *
 * Immutable Run-result refs (inputRef, consumedInputRefs, reviewVerdictRef)
 * and review exact bindings are ALWAYS strictly validated (in
 * {@link validateReviewExactBindings}), regardless of generation class.
 *
 * Supersession is proven ONLY by exact lineage (Q1-RA-002 I3):
 *   R = completed review-<stage>, R.reviewedRunId == G0.runId,
 *   R.verdict == changes-requested,
 *   G1 = revise-<stage> (completed OR pending),
 *   G1.sourceReviewRun == R.runId, G1.sourceReviewVerdict == changes-requested.
 * Run ID ordering is NEVER used as lineage proof.
 */
async function validateGenerationAwareArtifacts(
  runs: readonly RunFact[],
  reviewVerdicts: readonly ReviewVerdictFact[],
  repoRoot: string,
): Promise<FactConflict[]> {
  const conflicts: FactConflict[] = [];

  // Completed artifact Runs (G0 candidates): explore/revise-explore/propose/revise-propose.
  const completedArtifactRuns = runs.filter(
    (r) =>
      r.status === 'completed' &&
      r.changeId !== undefined &&
      (r.action === 'explore' ||
        r.action === 'revise-explore' ||
        r.action === 'propose' ||
        r.action === 'revise-propose'),
  );

  // ALL revise Runs (completed AND pending) — pending revise Runs open the
  // bounded revision window without themselves being validated (they have no
  // terminal result yet).
  const allReviseRuns = runs.filter(
    (r) =>
      r.changeId !== undefined &&
      (r.action === 'revise-explore' || r.action === 'revise-propose'),
  );

  // Build review lineage facts for exact successor proof.
  const reviewLineageFacts = buildReviewLineageFacts(runs, reviewVerdicts);

  // Classify using EXACT lineage only (Q1-RA-002).
  const classification = classifyArtifactGenerations(
    completedArtifactRuns,
    allReviseRuns,
    reviewLineageFacts,
  );

  // Validate only the current generation's producedResultRefs.
  for (const run of completedArtifactRuns) {
    if (classification.get(run.runId) === 'current') {
      const runConflicts = await validateCurrentGenerationRefs(run, repoRoot);
      conflicts.push(...runConflicts);
    }
    // superseded / revision-window: skip mutable artifact ref validation.
    // Immutable refs (inputRef, review bindings) are validated separately.
  }

  return conflicts;
}

/**
 * Build {@link ReviewLineageFact}[] from committed Runs + review verdicts.
 *
 * Each completed review-* Run's verdict is augmented with its action + status
 * + changeId so the lineage resolver can prove exact review→revise chains
 * without re-reading filesystem state.
 */
function buildReviewLineageFacts(
  runs: readonly RunFact[],
  reviewVerdicts: readonly ReviewVerdictFact[],
): ReviewLineageFact[] {
  const facts: ReviewLineageFact[] = [];
  for (const verdict of reviewVerdicts) {
    const reviewRun = runs.find((r) => r.runId === verdict.reviewRunId);
    if (reviewRun === undefined) continue;
    facts.push({
      reviewRunId: verdict.reviewRunId,
      verdict: verdict.verdict,
      reviewedRunId: verdict.reviewedRunId,
      reviewAction: reviewRun.action,
      reviewStatus: reviewRun.status,
      ...(reviewRun.changeId !== undefined && { changeId: reviewRun.changeId }),
    });
  }
  return facts;
}

/**
 * Validate the current generation's producedResultRefs against current
 * canonical bytes.
 *
 * Q1-5.2: "没有合法 successor 时，G0 是 current generation，其 effective refs
 * MUST 严格验证当前 canonical bytes"
 *
 * Reads the Run's result.json actionResult.producedResultRefs and verifies
 * each ref against the actual artifact file content.
 */
async function validateCurrentGenerationRefs(
  run: RunFact,
  repoRoot: string,
): Promise<FactConflict[]> {
  const conflicts: FactConflict[] = [];

  // Q1-RA-003: the stage MUST be derivable for an artifact current generation.
  // If not (malformed RunFact), fail closed — a current artifact generation
  // without a stage cannot be validated.
  const stage = artifactStage(run.action);
  if (stage === undefined) {
    return conflicts; // Non-artifact Run — nothing to validate (no produced set).
  }
  if (run.changeId === undefined) {
    conflicts.push({
      dimension: 'artifact-effective-set-incomplete',
      authority: run.runId,
      message: `Current generation ${run.runId} (${run.action}) has no changeId; cannot validate the required ${stage} effective artifact set`,
      detail: { runId: run.runId, action: run.action },
    });
    return conflicts;
  }

  // Read the Run's result.json to get producedResultRefs.
  const runDir = resolveRunDir(repoRoot, run);
  const resultPath = join(runDir, 'result.json');
  let content: string;
  try {
    content = await readFile(resultPath, 'utf-8');
  } catch {
    // If result.json is missing, the Run isn't actually completed — skip.
    // (readC1Run already surfaces a missing terminal result as a conflict.)
    return conflicts;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return conflicts; // Malformed result.json is already a conflict from readC1Run.
  }

  const obj = parsed as Record<string, unknown>;
  const actionResult = obj['actionResult'];
  if (actionResult === undefined || typeof actionResult !== 'object' || actionResult === null) {
    // Formal evidence missing: an artifact current generation MUST carry an
    // actionResult. Fail closed (Q1-RA-003).
    conflicts.push({
      dimension: 'artifact-effective-set-incomplete',
      authority: run.runId,
      message: `Current ${stage} generation ${run.runId} has no actionResult (required produced evidence missing)`,
      detail: { runId: run.runId, action: run.action },
    });
    return conflicts;
  }
  const ar = actionResult as Record<string, unknown>;
  const producedRefsRaw = ar['producedResultRefs'];
  if (!Array.isArray(producedRefsRaw)) {
    // producedResultRefs missing/not an array → required evidence absent.
    conflicts.push({
      dimension: 'artifact-effective-set-incomplete',
      authority: run.runId,
      message: `Current ${stage} generation ${run.runId} has no producedResultRefs (required effective artifact set missing)`,
      detail: { runId: run.runId, action: run.action },
    });
    return conflicts;
  }

  // Translate raw produced refs into typed ResultRef[] for the shared validator.
  const producedRefs: ResultRef[] = [];
  for (let i = 0; i < producedRefsRaw.length; i++) {
    const r = producedRefsRaw[i] as Record<string, unknown>;
    if (typeof r['ref'] !== 'string' || typeof r['versionFingerprint'] !== 'string') {
      conflicts.push({
        dimension: 'artifact-effective-set-incomplete',
        authority: run.runId,
        message: `Current ${stage} generation ${run.runId} producedResultRefs[${i}] missing ref or versionFingerprint`,
        detail: { runId: run.runId, index: i },
      });
      continue;
    }
    producedRefs.push({
      ref: r['ref'] as string,
      versionFingerprint: r['versionFingerprint'] as string,
      ...(typeof r['kind'] === 'string' && { kind: r['kind'] as ResultRef['kind'] }),
    });
  }

  // Q1-RA-003: run the ONE shared stage-aware effective-set validator. It
  // checks exact identity coverage (explore.md / proposal+design+tasks+specs),
  // kind, byte/fingerprint, target resolution and the specs namespace — all
  // fail closed. The Reader does not modify state; it only surfaces FactConflicts.
  const setProblems = await validateStageEffectiveSet(repoRoot, run.changeId, stage, producedRefs);
  for (const p of setProblems) {
    const dimension =
      p.kind === 'fingerprint-mismatch'
        ? 'artifact-replaced'
        : p.kind === 'ambiguous-target'
          ? 'artifact-archive-ambiguous'
          : p.kind === 'missing-target'
            ? 'artifact-missing'
            : p.kind === 'specs-mismatch'
              ? 'artifact-specs-drift'
              : 'artifact-effective-set-incomplete';
    conflicts.push({
      dimension,
      authority: run.runId,
      message: `Current ${stage} generation ${run.runId} effective artifact set problem (${p.kind}): ${p.message}`,
      detail: { runId: run.runId, kind: p.kind, ref: p.ref },
    });
  }

  return conflicts;
}

/**
 * Resolve a Run's directory path from repoRoot + RunFact.
 */
function resolveRunDir(repoRoot: string, run: RunFact): string {
  const segments = [repoRoot, '.flowkit', 'runs', run.deliveryId];
  if (run.changeId !== undefined) {
    segments.push(run.changeId);
  }
  segments.push(run.runId);
  return join(...segments);
}

// ---------------------------------------------------------------------------
// Q1-9: Verification generation-aware validation (tasks 7.4-7.7)
// ---------------------------------------------------------------------------

/**
 * Q1-9: `verification.md` is a mutable Change artifact. A `review-apply` Run
 * carries a `verificationSummaryRef` over the then-current `verification.md`
 * bytes. When a `review-apply` returns `changes-requested` and a legitimate
 * `revise-apply` follows, the verification revision window opens: the old
 * review-apply's `verificationSummaryRef` may be legally superseded by the
 * next review-apply, and updating `verification.md` MUST NOT produce a
 * historical false FactConflict.
 *
 * This function classifies review-apply verification generations and strictly
 * validates ONLY the current generation's `verificationSummaryRef` against the
 * current `verification.md` bytes. Superseded generations are skipped. When
 * `verification.md` is replaced without a legitimate `changes-requested →
 * revise-apply` lineage, the current review-apply's ref no longer matches and a
 * FactConflict is collected (fail-closed, task 7.7).
 *
 * Historical review-apply review result, reviewedRun exact binding and verdict
 * continue to be strictly validated by {@link validateReviewExactBindings}
 * regardless of generation class.
 */
async function validateVerificationGenerationAware(
  runs: readonly RunFact[],
  reviewVerdicts: readonly ReviewVerdictFact[],
  repoRoot: string,
): Promise<FactConflict[]> {
  const conflicts: FactConflict[] = [];

  // Completed review-apply Runs (V0 candidates).
  const completedReviewApplyRuns = runs.filter(
    (r) => r.status === 'completed' && r.changeId !== undefined && r.action === 'review-apply',
  );

  // ALL revise-apply Runs (completed AND pending) — pending revise-apply opens
  // the verification revision window (Q1-RA-002).
  const allReviseApplyRuns = runs.filter(
    (r) => r.changeId !== undefined && r.action === 'revise-apply',
  );

  // Build review lineage facts for exact successor proof.
  const reviewLineageFacts = buildReviewLineageFacts(runs, reviewVerdicts);

  // Classify using EXACT review-apply → revise-apply lineage (Q1-RA-002):
  // supersession requires V0.verdict == changes-requested,
  // R0.sourceReviewRun == V0.runId, R0.sourceReviewVerdict == changes-requested.
  const classification = classifyVerificationGenerations(
    completedReviewApplyRuns,
    allReviseApplyRuns,
    reviewLineageFacts,
  );

  for (const run of completedReviewApplyRuns) {
    if (classification.get(run.runId) === 'current') {
      conflicts.push(...await validateCurrentVerificationSummaryRef(run, repoRoot));
    }
    // superseded: skip verificationSummaryRef re-validation (legitimate
    // revise-apply lineage superseded it). Immutable review binding/verdict
    // remain validated by validateReviewExactBindings.
  }

  return conflicts;
}

/**
 * Validate the current review-apply's `verificationSummaryRef` against the
 * current `verification.md` bytes (task 7.6 / Q1-RA-009).
 *
 * Q1-RA-009 fail-closed: for EVERY current review-apply generation the Reader
 * REQUIRES a valid actionResult and a well-formed `verificationSummaryRef` of
 * kind `verification-summary` whose logical ref EXACTLY equals the Core-derived
 * canonical identity `openspec/changes/<run.changeId>/verification.md`. The
 * referenced file MUST resolve uniquely (archive-aware), exist, be readable,
 * and its current SHA-256 MUST equal the ref fingerprint.
 *
 * Missing, malformed, wrong-kind, wrong-path, missing-target, ambiguous-target
 * and fingerprint mismatch each produce a distinct FactConflict — recovery of a
 * tampered/missing current verification summary NEVER fails open.
 */
async function validateCurrentVerificationSummaryRef(
  run: RunFact,
  repoRoot: string,
): Promise<FactConflict[]> {
  const conflicts: FactConflict[] = [];
  const authority = run.runId;
  const changeId = run.changeId;

  // A current review-apply generation without a changeId cannot be verified.
  if (changeId === undefined) {
    conflicts.push({
      dimension: 'verification-summary-missing',
      authority,
      message: `Current review-apply ${run.runId} has no changeId; cannot validate the required verification summary ref`,
      detail: { runId: run.runId },
    });
    return conflicts;
  }

  const runDir = resolveRunDir(repoRoot, run);
  const resultPath = join(runDir, 'result.json');
  let content: string;
  try {
    content = await readFile(resultPath, 'utf-8');
  } catch {
    // result.json unreadable — readC1Run already reported the authoritative
    // conflict; do not double-report here.
    return conflicts;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return conflicts; // Malformed result.json already a conflict from readC1Run.
  }

  // ---- 1. REQUIRED actionResult (Q1-RA-009: missing ⇒ fail closed). ----
  const obj = parsed as Record<string, unknown>;
  const actionResult = obj['actionResult'];
  if (actionResult === undefined || typeof actionResult !== 'object' || actionResult === null) {
    conflicts.push({
      dimension: 'verification-summary-missing',
      authority,
      message: `Current review-apply ${run.runId} has no actionResult; the required verificationSummaryRef cannot be recovered`,
      detail: { runId: run.runId },
    });
    return conflicts;
  }

  // ---- 2. REQUIRED verificationSummaryRef (missing ⇒ fail closed). ----
  const ar = actionResult as Record<string, unknown>;
  const summaryRef = ar['verificationSummaryRef'];
  if (summaryRef === undefined || typeof summaryRef !== 'object' || summaryRef === null) {
    conflicts.push({
      dimension: 'verification-summary-missing',
      authority,
      message: `Current review-apply ${run.runId} actionResult has no verificationSummaryRef (required for a current verification generation)`,
      detail: { runId: run.runId },
    });
    return conflicts;
  }
  const ref = summaryRef as Record<string, unknown>;
  const refPath = ref['ref'];
  const refFingerprint = ref['versionFingerprint'];
  const refKind = ref['kind'];
  if (typeof refPath !== 'string' || typeof refFingerprint !== 'string') {
    conflicts.push({
      dimension: 'verification-summary-malformed',
      authority,
      message: `Current review-apply ${run.runId} verificationSummaryRef missing string ref/versionFingerprint`,
      detail: { runId: run.runId, refPath, versionFingerprint: refFingerprint },
    });
    return conflicts;
  }

  // ---- 3. EXACT kind (Q1-RA-009: must be verification-summary). ----
  if (refKind !== VERIFICATION_SUMMARY_KIND) {
    conflicts.push({
      dimension: 'verification-summary-kind',
      authority,
      message: `Current review-apply ${run.runId} verificationSummaryRef kind is ${String(refKind)}, expected ${VERIFICATION_SUMMARY_KIND}`,
      detail: { runId: run.runId, kind: refKind, refPath },
    });
    return conflicts;
  }

  // ---- 4. EXACT Core-derived logical identity (Q1-RA-009: wrong path ⇒ fail closed). ----
  const canonicalPath = resolveVerificationSummaryRef(changeId);
  if (normalizeSeparators(refPath) !== canonicalPath) {
    conflicts.push({
      dimension: 'verification-summary-path',
      authority,
      message: `Current review-apply ${run.runId} verificationSummaryRef path (${refPath}) does not equal the Core-derived canonical path (${canonicalPath})`,
      detail: { runId: run.runId, canonicalPath, actual: refPath },
    });
    return conflicts;
  }

  // ---- 5. Archive-aware physical resolution (missing/ambiguous ⇒ fail closed). ----
  let artifactPath: string;
  try {
    artifactPath = await resolveArchiveAwareArtifactPath(repoRoot, refPath);
  } catch (e) {
    const dimension =
      e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED'
        ? 'verification-summary-archive-ambiguous'
        : 'verification-summary-missing';
    conflicts.push({
      dimension,
      authority,
      message: `Current review-apply ${run.runId} verificationSummaryRef target ${dimension}: ${refPath}`,
      detail: { runId: run.runId, refPath },
    });
    return conflicts;
  }
  let artifactContent: string;
  try {
    artifactContent = await readFile(artifactPath, 'utf-8');
  } catch {
    conflicts.push({
      dimension: 'verification-summary-missing',
      authority,
      message: `Current review-apply ${run.runId} verificationSummaryRef target unreadable: ${refPath}`,
      detail: { runId: run.runId, refPath, artifactPath },
    });
    return conflicts;
  }

  // ---- 6. Actual SHA-256 (mismatch ⇒ fail closed). ----
  const actualHash = computeResultFileHash(artifactContent);
  if (actualHash !== refFingerprint) {
    conflicts.push({
      dimension: 'verification-summary-replaced',
      authority,
      message: `Current review-apply ${run.runId} verificationSummaryRef fingerprint mismatch: ${refPath} (expected ${refFingerprint}, got ${actualHash}); no legitimate revise-apply lineage superseded it`,
      detail: { runId: run.runId, refPath, expected: refFingerprint, actual: actualHash },
    });
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function looksLikeRunId(name: string): boolean {
  return /^\d{8}-\d{3}-[a-z][a-z-]*$/.test(name);
}

/** True when the error is a Node ENOENT (file/dir absent). */
function isErrnoENOENT(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === 'ENOENT'
  );
}

/** Best-effort errno code for a read error, for conflict messaging. */
function errnoName(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as { code?: unknown }).code;
    return typeof code === 'string' ? code : 'unknown';
  }
  return 'unknown';
}

function looksLikeChangeDir(name: string): boolean {
  if (looksLikeRunId(name)) {
    return false;
  }
  return !/^\d{8}-/.test(name);
}

// Re-export validateContextFile for downstream consumers that need to validate
// a ContextFile before projecting a Run (used by run-persistence).
export { validateContextFile };
