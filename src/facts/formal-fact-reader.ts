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
import { validateContextFile } from '../persistence/serialization.js';
import type { ContextFile } from '../persistence/serialization.js';
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

  return {
    deliveryId: input.deliveryId,
    deliveryState: manifestResult.deliveryState,
    deliveryFullTestStatus: manifestResult.deliveryFullTestStatus,
    changes: manifestResult.changes,
    runs,
    openSpecArtifacts,
    gitBoundaries,
    ownerAuthorizations,
    reviewVerdicts,
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
  } catch {
    hasResult = false;
  }

  if (classification.kind === 'c1') {
    return readC1Run(classification.contextFile, runDir, runId, hasResult, parsedResult, conflicts);
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
  hasResult: boolean,
  parsedResult: unknown,
  conflicts: FactConflict[],
): SingleRunResult {
  // C1 Run: status from result.json existence (pending when absent; terminal
  // values from result.json.runStatus — C1 RunResultFile uses runStatus).
  let status: RunStatus = 'pending';
  let verdict: ReviewVerdictFact | undefined;

  if (hasResult && parsedResult !== null) {
    const obj = parsedResult as Record<string, unknown>;
    const runStatus = obj['runStatus'];
    if (typeof runStatus === 'string' && (runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled')) {
      status = runStatus;
    } else {
      conflicts.push({
        dimension: 'run-result-status',
        authority: runDir,
        message: `C1 result.json missing valid runStatus for Run ${runId}`,
      });
      return { conflicts };
    }
  }

  // Extract review verdict for review-* actions (C1-AP-004 canonical path).
  // C1 review-* Runs carry `reviewVerdict` in result.json and `reviewedRunId`
  // in context.json. Missing linkage → FactConflict (fail-closed).
  if (contextFile.action.startsWith('review-') && hasResult && parsedResult !== null) {
    const resultObj = parsedResult as Record<string, unknown>;
    const verdictValue = resultObj['reviewVerdict'];
    const reviewedRunId = contextFile.reviewedRunId;
    if (
      (verdictValue === 'approved' || verdictValue === 'changes-requested') &&
      typeof reviewedRunId === 'string' &&
      reviewedRunId.length > 0
    ) {
      verdict = {
        reviewRunId: contextFile.runId,
        verdict: verdictValue,
        reviewedRunId,
      };
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

function looksLikeChangeDir(name: string): boolean {
  if (looksLikeRunId(name)) {
    return false;
  }
  return !/^\d{8}-/.test(name);
}

// Re-export validateContextFile for downstream consumers that need to validate
// a ContextFile before projecting a Run (used by run-persistence).
export { validateContextFile };
