/**
 * C1 formal-fact-reader-and-persistence: formal-fact Reader (D1, D2, D3).
 *
 * Q2 orchestration-authority-boundary-correction:
 * - current Policy projection reads only Runs of the active Change;
 * - completed/checkpointed Change Run corpora remain Git history, not current
 *   mutable-artifact replay input;
 * - active schemaVersion 2 Runs keep strict identity, closed-schema and
 *   immutable run-result/source-review lineage validation;
 * - pending/failed/cancelled Runs are validated only for status-applicable facts.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeSeparators } from '../shared/paths.js';
import { isFormalAction } from '../domain/actions.js';
import { parseYaml } from './yaml-parser.js';
import { readGitBoundarySummaries } from './git-boundary-reader.js';
import { discriminateRunForReader, normalizeBootstrapRunStatus } from '../persistence/legacy-recognizer.js';
import type { LegacyRun } from '../persistence/legacy-recognizer.js';
import { validateContextFile, admitC1RunResultForReader } from '../persistence/serialization.js';
import type { ContextFile } from '../persistence/serialization.js';
import {
  resolveRunResultPath,
  computeResultFileHash,
  validateReviewRunBinding,
  validateSourceReviewTuple,
  expectedSourceReviewActionFor,
} from '../persistence/result-ref-adapter.js';
import { BLOCKING_AUTHORITIES } from '../domain/types.js';
import type { BlockingAuthority, ResultRef, RunStatus, VerificationStatus } from '../domain/types.js';
import { AUTHORIZATION_ONLY_OWNER_DECISIONS, OWNER_DECISION_RECORD_KINDS } from '../domain/a1-types.js';
import type { AuthorizationOnlyOwnerDecision, OwnerDecisionRecordKind } from '../domain/a1-types.js';
import { ownerDecisionRefFor } from '../domain/owner-provenance.js';
import { isPreA1LegacyArchitectureImpactIdentity } from './pre-a1-legacy-architecture-impact.js';
import { FlowkitError } from '../shared/errors.js';
import { OpenSpecCliAdapter } from '../integrations/openspec/openspec-cli-adapter.js';
import { isOpenSpecThinIntegrationActive } from '../integrations/openspec/openspec-integration-state.js';
import type {
  ChangeFact,
  FactConflict,
  FormalFactSnapshot,
  GitBoundaryFact,
  OpenSpecArtifactFact,
  ReviewVerdictFact,
  RunFact,
  OwnerAuthorizationFact,
} from './formal-fact-snapshot.js';

export interface ReadFormalFactSnapshotInput {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly runsPathPrefix: string;
  readonly openspecChangesPath: string;
  readonly manifestPathPrefix: string;
}

interface ImmutableValidationResult {
  readonly conflicts: readonly FactConflict[];
}

export async function readFormalFactSnapshot(
  input: ReadFormalFactSnapshotInput,
): Promise<FormalFactSnapshot> {
  const conflicts: FactConflict[] = [];
  const deliveryRunsDir = join(input.repoRoot, input.runsPathPrefix, input.deliveryId);

  const manifestResult = await readDeliveryManifest(input);
  const activeChangeId = manifestResult.changes.find((change) => change.state === 'active')?.id;
  const { runs, reviewVerdicts, c1RunIds, runConflicts } = await readRuns(deliveryRunsDir, activeChangeId);
  conflicts.push(...runConflicts);
  const openSpecArtifacts = await readOpenSpecArtifacts(input, manifestResult.changes);
  const verificationProjection = await readActiveChangeVerificationStatus(
    input,
    activeChangeId,
  );
  conflicts.push(...verificationProjection.conflicts);
  const tasksProjection = await readActiveChangeTasksCompletion(
    input,
    activeChangeId,
  );
  conflicts.push(...tasksProjection.conflicts);

  let gitBoundaries: GitBoundaryFact[] = [];
  try {
    gitBoundaries = await readGitBoundarySummaries(input.repoRoot, input.deliveryId);
  } catch {
    // Git boundaries are best-effort at Reader level.
  }

  const ownerAuthorizations = manifestResult.ownerAuthorizations;
  conflicts.push(...manifestResult.conflicts);

  const bindingResult = await validateReviewExactBindings(
    runs,
    reviewVerdicts,
    input.repoRoot,
    input.runsPathPrefix,
  );
  conflicts.push(...bindingResult.conflicts);
  const admittedReviewVerdicts = bindingResult.admittedVerdicts;

  // Immutable run-result and current source-review lineage remain fail-closed
  // for the Runs that participate in the current Policy projection.
  const immutableValidation = await validateImmutableRunResultRefs(
    runs,
    admittedReviewVerdicts,
    input.repoRoot,
    input.runsPathPrefix,
    c1RunIds,
  );
  conflicts.push(...immutableValidation.conflicts);



  return {
    deliveryId: input.deliveryId,
    deliveryState: manifestResult.deliveryState,
    deliveryFullTestStatus: manifestResult.deliveryFullTestStatus,
    ...(verificationProjection.status !== undefined && {
      changeVerificationStatus: verificationProjection.status,
    }),
    ...(tasksProjection.complete !== undefined && {
      changeTasksComplete: tasksProjection.complete,
    }),
    changes: manifestResult.changes,
    runs,
    openSpecArtifacts,
    gitBoundaries,
    ownerAuthorizations,
    reviewVerdicts: admittedReviewVerdicts,
    conflicts,
  };
}

interface ManifestResult {
  readonly deliveryState: FormalFactSnapshot['deliveryState'];
  readonly deliveryFullTestStatus: FormalFactSnapshot['deliveryFullTestStatus'];
  readonly changes: readonly ChangeFact[];
  readonly ownerAuthorizations: readonly OwnerAuthorizationFact[];
  readonly conflicts: readonly FactConflict[];
}

async function readDeliveryManifest(input: ReadFormalFactSnapshotInput): Promise<ManifestResult> {
  const conflicts: FactConflict[] = [];
  const manifestPath = join(input.repoRoot, input.manifestPathPrefix, `${input.deliveryId}.yaml`);
  if (!(await pathExists(manifestPath))) {
    return {
      deliveryState: undefined,
      deliveryFullTestStatus: undefined,
      changes: [],
      ownerAuthorizations: [],
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
      ownerAuthorizations: [],
      conflicts,
    };
  }

  const manifest = parseResult.value as Record<string, unknown>;
  const deliveryNode = manifest['delivery'];
  if (
    deliveryNode === undefined ||
    typeof deliveryNode !== 'object' ||
    deliveryNode === null ||
    Array.isArray(deliveryNode)
  ) {
    conflicts.push({
      dimension: 'delivery-manifest-shape',
      authority: manifestPath,
      message: 'Delivery Manifest missing required `delivery:` mapping (state and fullTestStatus live under `delivery:`)',
      detail: { manifestPath },
    });
    return {
      deliveryState: undefined,
      deliveryFullTestStatus: undefined,
      changes: readChangeFacts(input.deliveryId, manifest['changes'], conflicts, manifestPath),
      ownerAuthorizations: readOwnerAuthorizations(input.deliveryId, manifest['ownerDecisions'], manifest['changes'], conflicts, manifestPath),
      conflicts,
    };
  }

  const deliveryObj = deliveryNode as Record<string, unknown>;
  const validDeliveryStates: ReadonlySet<string> = new Set(['active', 'completed', 'cancelled']);
  const validFullTestStatuses: ReadonlySet<string> = new Set([
    'not-ready',
    'awaiting-user-decision',
    'authorized',
    'passed',
    'failed',
  ]);

  const stateRaw = deliveryObj['state'];
  let deliveryState: FormalFactSnapshot['deliveryState'];
  if (typeof stateRaw === 'string' && validDeliveryStates.has(stateRaw)) {
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

  const ftsRaw = deliveryObj['fullTestStatus'];
  let fullTestStatus: FormalFactSnapshot['deliveryFullTestStatus'];
  if (typeof ftsRaw === 'string' && validFullTestStatuses.has(ftsRaw)) {
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

  const changes = readChangeFacts(input.deliveryId, manifest['changes'], conflicts, manifestPath);
  const ownerAuthorizations = readOwnerAuthorizations(
    input.deliveryId,
    manifest['ownerDecisions'],
    manifest['changes'],
    conflicts,
    manifestPath,
  );

  return {
    deliveryState,
    deliveryFullTestStatus: fullTestStatus,
    changes,
    ownerAuthorizations,
    conflicts,
  };
}

function readChangeFacts(
  deliveryId: string,
  value: unknown,
  conflicts: FactConflict[],
  manifestPath: string,
): ChangeFact[] {
  if (!Array.isArray(value)) return [];
  const facts: ChangeFact[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const key = obj['key'];
    const id = obj['id'];
    if (typeof key !== 'string' || typeof id !== 'string') continue;
    const dependsOn = Array.isArray(obj['dependsOn'])
      ? (obj['dependsOn'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    const outputs = Array.isArray(obj['outputs'])
      ? (obj['outputs'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : undefined;

    let architectureImpact: ChangeFact['architectureImpact'];
    const architectureImpactRaw = obj['architectureImpact'];
    if (typeof architectureImpactRaw === 'boolean') {
      architectureImpact = architectureImpactRaw;
    } else if (
      architectureImpactRaw === undefined &&
      isPreA1LegacyArchitectureImpactIdentity(deliveryId, id)
    ) {
      architectureImpact = 'pre-a1-legacy-missing';
    } else {
      conflicts.push({
        dimension: 'change-architecture-impact',
        authority: manifestPath,
        message: `Change ${id} architectureImpact missing or invalid`,
        detail: { deliveryId, changeId: id, value: architectureImpactRaw },
      });
      continue;
    }

    facts.push({
      key,
      id,
      state: typeof obj['state'] === 'string' ? (obj['state'] as ChangeFact['state']) : 'planned',
      required: typeof obj['required'] === 'boolean' ? obj['required'] : false,
      dependsOn,
      architectureImpact,
      ...(outputs !== undefined && { outputs }),
    });
  }
  return facts;
}

function readOwnerAuthorizations(
  deliveryId: string,
  value: unknown,
  changesValue: unknown,
  conflicts: FactConflict[],
  manifestPath: string,
): OwnerAuthorizationFact[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    conflicts.push({
      dimension: 'owner-decisions-shape',
      authority: manifestPath,
      message: 'ownerDecisions must be a sequence',
    });
    return [];
  }

  const knownChangeIds = new Set<string>();
  if (Array.isArray(changesValue)) {
    for (const item of changesValue) {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const id = (item as Record<string, unknown>)['id'];
        if (typeof id === 'string') knownChangeIds.add(id);
      }
    }
  }

  const facts: OwnerAuthorizationFact[] = [];
  const seenRefs = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      conflicts.push({
        dimension: 'owner-decision-record',
        authority: manifestPath,
        message: 'ownerDecisions item must be a mapping',
      });
      continue;
    }
    const obj = item as Record<string, unknown>;
    const ref = obj['ref'];
    const decision = obj['decision'];
    const recordDeliveryId = obj['deliveryId'];
    const changeId = obj['changeId'];
    const sourceRef = obj['sourceRef'];
    if (
      typeof ref !== 'string' ||
      typeof decision !== 'string' ||
      typeof recordDeliveryId !== 'string' ||
      typeof sourceRef !== 'string' ||
      sourceRef.trim() === ''
    ) {
      conflicts.push({
        dimension: 'owner-decision-record',
        authority: manifestPath,
        message: 'ownerDecisions item missing required typed fields',
        detail: { ref, decision, deliveryId: recordDeliveryId, changeId, sourceRef },
      });
      continue;
    }
    if (recordDeliveryId !== deliveryId) {
      conflicts.push({
        dimension: 'owner-decision-applicability',
        authority: manifestPath,
        message: `Owner record ${ref} deliveryId does not match active Delivery`,
        detail: { recordDeliveryId, deliveryId },
      });
      continue;
    }
    if (!(OWNER_DECISION_RECORD_KINDS as readonly string[]).includes(decision)) {
      conflicts.push({
        dimension: 'owner-decision-record',
        authority: manifestPath,
        message: `Owner record ${ref} has unknown decision ${decision}`,
      });
      continue;
    }
    const typedRecordDecision = decision as OwnerDecisionRecordKind;
    const expectedRef = ownerDecisionRefFor({
      decision: typedRecordDecision,
      deliveryId: recordDeliveryId,
      sourceRef,
      ...(typeof changeId === 'string' ? { changeId } : {}),
    });
    if (ref !== expectedRef) {
      conflicts.push({
        dimension: 'owner-decision-ref',
        authority: manifestPath,
        message: `Owner record ${ref} does not match canonical tuple hash`,
        detail: { expectedRef },
      });
      continue;
    }

    const canonical = JSON.stringify({
      decision,
      deliveryId: recordDeliveryId,
      ...(typeof changeId === 'string' ? { changeId } : {}),
      sourceRef,
    });
    const prior = seenRefs.get(ref);
    if (prior !== undefined && prior !== canonical) {
      conflicts.push({
        dimension: 'owner-decision-ref-collision',
        authority: manifestPath,
        message: `Owner record ref ${ref} maps to different content`,
      });
      continue;
    }
    seenRefs.set(ref, canonical);

    const changeScopedRecord =
      typedRecordDecision === 'create-change' ||
      typedRecordDecision === 'activate-change' ||
      typedRecordDecision === 'authorize-apply' ||
      typedRecordDecision === 'authorize-archive' ||
      typedRecordDecision === 'authorize-checkpoint';
    if (changeScopedRecord) {
      if (typeof changeId !== 'string' || !knownChangeIds.has(changeId)) {
        conflicts.push({
          dimension: 'owner-decision-applicability',
          authority: manifestPath,
          message: `Owner record ${ref} requires a known changeId`,
          detail: { changeId },
        });
        continue;
      }
    } else if (changeId !== undefined) {
      conflicts.push({
        dimension: 'owner-decision-applicability',
        authority: manifestPath,
        message: `Delivery-scoped Owner record ${ref} must not carry changeId`,
        detail: { changeId },
      });
      continue;
    }

    if (!(AUTHORIZATION_ONLY_OWNER_DECISIONS as readonly string[]).includes(typedRecordDecision)) {
      // create-delivery/create-change/activate-change are provenance, not Policy authorization facts.
      continue;
    }
    const typedDecision = typedRecordDecision as AuthorizationOnlyOwnerDecision;
    facts.push({
      ref,
      decision: typedDecision,
      deliveryId,
      ...(typeof changeId === 'string' ? { changeId } : {}),
      sourceRef,
    });
  }
  return facts;
}

interface RunsResult {
  readonly runs: readonly RunFact[];
  readonly reviewVerdicts: readonly ReviewVerdictFact[];
  /** Internal Reader provenance: only these Runs were admitted through the schemaVersion 2/C1 path. */
  readonly c1RunIds: ReadonlySet<string>;
  readonly runConflicts: readonly FactConflict[];
}

async function readRuns(deliveryRunsDir: string, activeChangeId?: string): Promise<RunsResult> {
  const runs: RunFact[] = [];
  const reviewVerdicts: ReviewVerdictFact[] = [];
  const c1RunIds = new Set<string>();
  const conflicts: FactConflict[] = [];
  let entries: string[];
  try {
    entries = await readdir(deliveryRunsDir);
  } catch {
    return { runs, reviewVerdicts, c1RunIds, runConflicts: conflicts };
  }

  for (const entry of entries) {
    if (entry.startsWith('.tmp-') || entry.startsWith('.result-tmp-')) continue;
    const entryPath = join(deliveryRunsDir, entry);
    if (!(await isDirectory(entryPath))) continue;

    if (looksLikeChangeDir(entry)) {
      // v6/Q2: Change-level Runs are current Policy facts only for the one
      // active Change. Completed/cancelled/planned Change corpora remain Git
      // history and are deliberately not replayed into the current snapshot.
      if (activeChangeId !== undefined && entry === activeChangeId) {
        const nested = await readChangeRuns(entryPath);
        runs.push(...nested.runs);
        reviewVerdicts.push(...nested.reviewVerdicts);
        for (const runId of nested.c1RunIds) c1RunIds.add(runId);
        conflicts.push(...nested.runConflicts);
      }
      continue;
    }

    if (looksLikeRunId(entry)) {
      // Historical Delivery-level Run directories are retained only for
      // bounded legacy/NNN compatibility. They are not current Policy facts.
      continue;
    }
  }
  return { runs, reviewVerdicts, c1RunIds, runConflicts: conflicts };
}

async function readChangeRuns(changeDir: string): Promise<RunsResult> {
  const runs: RunFact[] = [];
  const reviewVerdicts: ReviewVerdictFact[] = [];
  const c1RunIds = new Set<string>();
  const conflicts: FactConflict[] = [];
  let entries: string[];
  try {
    entries = await readdir(changeDir);
  } catch {
    return { runs, reviewVerdicts, c1RunIds, runConflicts: conflicts };
  }

  for (const entry of entries) {
    if (entry.startsWith('.tmp-') || entry.startsWith('.result-tmp-') || !looksLikeRunId(entry)) continue;
    const entryPath = join(changeDir, entry);
    if (!(await isDirectory(entryPath))) continue;
    const result = await readSingleRun(entryPath, entry);
    if (result.run !== undefined) {
      runs.push(result.run);
      if (result.verdict !== undefined) reviewVerdicts.push(result.verdict);
      if (result.format === 'c1') c1RunIds.add(result.run.runId);
    }
    conflicts.push(...result.conflicts);
  }
  return { runs, reviewVerdicts, c1RunIds, runConflicts: conflicts };
}

interface SingleRunResult {
  readonly run?: RunFact;
  readonly verdict?: ReviewVerdictFact;
  /** Kept internal to the Reader so C1-only validators never consume bounded legacy projections. */
  readonly format?: 'c1' | 'c1-pre-q1-compat' | 'legacy';
  readonly conflicts: readonly FactConflict[];
}

async function readSingleRun(runDir: string, runId: string): Promise<SingleRunResult> {
  const conflicts: FactConflict[] = [];
  const contextPath = join(runDir, 'context.json');
  let contextContent: string;
  try {
    contextContent = await readFile(contextPath, 'utf-8');
  } catch {
    conflicts.push({ dimension: 'run-context', authority: runDir, message: `context.json missing for Run ${runId}` });
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

  const classification = discriminateRunForReader(contextContent, parsedContext, runDir);
  if (classification.kind === 'conflict') {
    conflicts.push({ ...classification.conflict, authority: runDir });
    return { conflicts };
  }

  const resultPath = join(runDir, 'result.json');
  let hasResult = false;
  let parsedResult: unknown = null;
  let rawResultContent: string | undefined;
  try {
    const resultContent = await readFile(resultPath, 'utf-8');
    rawResultContent = resultContent;
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
  }

  if (classification.kind === 'c1') {
    return readC1Run(
      classification.contextFile,
      runDir,
      runId,
      resultPath,
      hasResult,
      parsedResult,
      rawResultContent,
      conflicts,
      classification.readerCompatibility,
    );
  }

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
  rawResultContent: string | undefined,
  conflicts: FactConflict[],
  readerCompatibility?: 'pre-q1-revision-context',
): SingleRunResult {
  let status: RunStatus = 'pending';
  let verdict: ReviewVerdictFact | undefined;
  let consumedInputRefs: readonly ResultRef[] | undefined;
  let reviewVerdictRef: ResultRef | undefined;
  let admittedResult: import('../persistence/serialization.js').RunResultFile | undefined;

  if (hasResult && parsedResult !== null) {
    try {
      admittedResult = admitC1RunResultForReader(rawResultContent ?? JSON.stringify(parsedResult), contextFile.action, {
        runId: contextFile.runId,
        deliveryId: contextFile.deliveryId,
        changeId: contextFile.changeId,
      });
    } catch (e) {
      conflicts.push({
        dimension: 'run-result-schema',
        authority: resultPath,
        message: `C1 result.json failed closed physical validation (${(e as FlowkitError).code ?? 'error'}): ${(e as Error).message}`,
      });
      return { conflicts };
    }

    if (
      admittedResult!.runStatus === 'completed' ||
      admittedResult!.runStatus === 'failed' ||
      admittedResult!.runStatus === 'cancelled'
    ) {
      status = admittedResult!.runStatus;
    } else {
      conflicts.push({
        dimension: 'run-result-status',
        authority: runDir,
        message: `C1 result.json missing valid runStatus for Run ${runId}`,
      });
      return { conflicts };
    }

    consumedInputRefs = admittedResult!.actionResult?.consumedInputRefs;
    reviewVerdictRef = admittedResult!.actionResult?.reviewVerdictRef;
  }

  if (contextFile.action.startsWith('review-') && status === 'completed' && hasResult && parsedResult !== null) {
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
        const blockingAuthorities = deriveBlockingAuthorities(admittedResult);
        if (verdictValue === 'changes-requested' && blockingAuthorities.length === 0) {
          conflicts.push({
            dimension: 'review-blocking-authority',
            authority: runDir,
            message: `C1 review ${runId} has changes-requested without blocking authority projection`,
          });
        } else {
          verdict = { reviewRunId: contextFile.runId, verdict: verdictValue, reviewedRunId, blockingAuthorities };
        }
      }
    } else {
      conflicts.push({
        dimension: 'review-verdict-linkage',
        authority: runDir,
        message: `C1 review-* Run ${runId} missing canonical reviewVerdict (result.json) or reviewedRunId (context.json)`,
        detail: { reviewVerdict: verdictValue, reviewedRunId, action: contextFile.action },
      });
    }
  }

  const run: RunFact = {
    runId: contextFile.runId,
    deliveryId: contextFile.deliveryId,
    action: contextFile.action,
    role: contextFile.role,
    status,
    changeId: contextFile.changeId,
    ...(contextFile.semanticInputFingerprint !== undefined && {
      semanticInputFingerprint: contextFile.semanticInputFingerprint,
    }),
    ...(contextFile.inputRef !== undefined && { inputRef: contextFile.inputRef }),
    ...(consumedInputRefs !== undefined && { consumedInputRefs }),
    ...(reviewVerdictRef !== undefined && { reviewVerdictRef }),
    ...(contextFile.sourceReviewRun !== undefined && { sourceReviewRun: contextFile.sourceReviewRun }),
    ...(contextFile.sourceReviewVerdict !== undefined && { sourceReviewVerdict: contextFile.sourceReviewVerdict }),
    ...(contextFile.reviewedRunId !== undefined && { reviewedRunId: contextFile.reviewedRunId }),
  };
  return {
    run,
    verdict,
    format: readerCompatibility === 'pre-q1-revision-context' ? 'c1-pre-q1-compat' : 'c1',
    conflicts,
  };
}

function readLegacyRun(
  run: LegacyRun,
  runDir: string,
  runId: string,
  hasResult: boolean,
  parsedResult: unknown,
  parsedContext: unknown,
  conflicts: FactConflict[],
): SingleRunResult {
  if (run.changeId === undefined || !isFormalAction(run.action)) {
    // Historical Delivery-level legacy Runs stay outside current Policy.
    return { conflicts };
  }
  const statusResult = normalizeBootstrapRunStatus(parsedResult, hasResult);
  if (!statusResult.ok) {
    conflicts.push({ ...statusResult.conflict, authority: runDir });
    return { conflicts };
  }

  const runFact: RunFact = {
    runId: run.runId,
    deliveryId: run.deliveryId,
    action: run.action,
    role: run.role,
    status: statusResult.status,
    changeId: run.changeId,
  };

  let verdict: ReviewVerdictFact | undefined;
  if (run.action.startsWith('review-') && statusResult.status === 'completed' && hasResult && parsedResult !== null) {
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
        blockingAuthorities: verdictValue === 'changes-requested' ? ['author'] : [],
      };
    } else {
      conflicts.push({
        dimension: 'review-verdict-linkage',
        authority: runDir,
        message: `Bootstrap review-* Run ${runId} missing verdict (result.json) or reviewed-Run linkage (context.json)`,
        detail: { verdict: verdictValue, reviewedRunId, action: run.action },
      });
    }
  }
  return { run: runFact, verdict, format: 'legacy', conflicts };
}

function deriveBlockingAuthorities(
  result: import('../persistence/serialization.js').RunResultFile | undefined,
): readonly BlockingAuthority[] {
  if (result?.reviewVerdict !== 'changes-requested') return [];
  const seen = new Set<BlockingAuthority>();
  for (const finding of result.reviewFindings ?? []) {
    if (finding.severity === 'blocking' && finding.blockingAuthority !== undefined) seen.add(finding.blockingAuthority);
  }
  return BLOCKING_AUTHORITIES.filter((authority) => seen.has(authority));
}

function extractLegacyReviewedRunId(parsedContext: unknown): string | undefined {
  if (typeof parsedContext !== 'object' || parsedContext === null || Array.isArray(parsedContext)) return undefined;
  const ctx = parsedContext as Record<string, unknown>;
  const reviewedRunPath = ctx['reviewedRun'];
  if (typeof reviewedRunPath === 'string' && reviewedRunPath.length > 0) {
    const segments = reviewedRunPath.replace(/\/+$/, '').split('/').filter((s) => s.length > 0);
    const basename = segments.length > 0 ? segments[segments.length - 1] : '';
    if (basename.length > 0) return basename;
  }
  const inputNode = ctx['input'];
  if (typeof inputNode === 'object' && inputNode !== null && !Array.isArray(inputNode)) {
    const v = (inputNode as Record<string, unknown>)['reviewedRunId'];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  for (const field of [
    'sourceRevisionRun',
    'sourceApplyRun',
    'sourceExploreRun',
    'sourceProposeRun',
    'sourceReviseApplyRun',
    'sourceReviseProposeRun',
    'sourceReviseExploreRun',
  ]) {
    const v = ctx[field];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

async function readOpenSpecArtifacts(
  input: ReadFormalFactSnapshotInput,
  changes: readonly ChangeFact[],
): Promise<OpenSpecArtifactFact[]> {
  const artifacts: OpenSpecArtifactFact[] = [];
  for (const change of changes) {
    const integrationActive = await isOpenSpecThinIntegrationActive(input.repoRoot, change.id);
    if (integrationActive && change.state === 'active') {
      const status = await new OpenSpecCliAdapter({ repoRoot: input.repoRoot }).getChangeStatus(change.id);
      const structuredCandidates = [
        { kind: 'change-explore' as const, logical: `${status.changeRootLogical}/explore.md` },
        { kind: 'change-proposal' as const, logical: status.artifactPaths.proposal.logicalPaths[0] ?? '' },
        { kind: 'change-design' as const, logical: status.artifactPaths.design.logicalPaths[0] ?? '' },
        { kind: 'change-tasks' as const, logical: status.artifactPaths.tasks.logicalPaths[0] ?? '' },
        { kind: 'change-verification' as const, logical: `${status.changeRootLogical}/verification.md` },
      ];
      for (const candidate of structuredCandidates) {
        artifacts.push({
          kind: candidate.kind,
          path: candidate.logical,
          exists: candidate.logical !== '' && await pathExists(join(input.repoRoot, candidate.logical)),
        });
      }
      const specLogical = status.artifactPaths.specs.logicalPaths[0] ?? '';
      artifacts.push({
        kind: 'change-spec',
        path: specLogical,
        exists: specLogical !== '' && await pathExists(join(input.repoRoot, specLogical)),
      });
      continue;
    }

    // Bounded compatibility for pre-C1 facts and closed historical Changes.
    const changeDir = join(input.repoRoot, input.openspecChangesPath, change.id);
    for (const candidate of [
      { kind: 'change-explore' as const, path: join(changeDir, 'explore.md') },
      { kind: 'change-proposal' as const, path: join(changeDir, 'proposal.md') },
      { kind: 'change-design' as const, path: join(changeDir, 'design.md') },
      { kind: 'change-tasks' as const, path: join(changeDir, 'tasks.md') },
      { kind: 'change-verification' as const, path: join(changeDir, 'verification.md') },
    ]) {
      artifacts.push({
        kind: candidate.kind,
        path: normalizeSeparators(candidate.path.slice(input.repoRoot.length + 1)),
        exists: await pathExists(candidate.path),
      });
    }
    const specPath = await findSpecFile(changeDir);
    artifacts.push({
      kind: 'change-spec',
      path: specPath !== null ? normalizeSeparators(specPath.slice(input.repoRoot.length + 1)) : '',
      exists: specPath !== null,
    });
  }
  return artifacts;
}

interface VerificationProjectionResult {
  readonly status?: VerificationStatus;
  readonly conflicts: readonly FactConflict[];
}

const CHANGE_VERIFICATION_MARKER =
  /<!--\s*flowkit-change-verification-status:\s*([^\s>]+)\s*-->/g;
const VALID_VERIFICATION_STATUSES: ReadonlySet<string> = new Set([
  'not-run',
  'passed',
  'failed',
  'not-applicable',
]);

async function readActiveChangeVerificationStatus(
  input: ReadFormalFactSnapshotInput,
  activeChangeId: string | undefined,
): Promise<VerificationProjectionResult> {
  if (activeChangeId === undefined) {
    return { conflicts: [] };
  }

  const verificationPath = await resolveActiveOpenSpecOwnedPath(input, activeChangeId, 'verification');
  if (!(await pathExists(verificationPath))) {
    return { conflicts: [] };
  }

  let content: string;
  try {
    content = await readFile(verificationPath, 'utf-8');
  } catch (error) {
    return {
      conflicts: [
        {
          dimension: 'change-verification-status',
          authority: normalizeSeparators(
            verificationPath.slice(input.repoRoot.length + 1),
          ),
          message: `verification.md unreadable: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  const matches = [...content.matchAll(CHANGE_VERIFICATION_MARKER)];
  const authority = normalizeSeparators(
    verificationPath.slice(input.repoRoot.length + 1),
  );
  if (matches.length !== 1) {
    return {
      conflicts: [
        {
          dimension: 'change-verification-status',
          authority,
          message:
            matches.length === 0
              ? 'verification.md exists but has no flowkit-change-verification-status marker'
              : `verification.md must contain exactly one flowkit-change-verification-status marker (found ${matches.length})`,
        },
      ],
    };
  }

  const raw = matches[0]?.[1];
  if (raw === undefined || !VALID_VERIFICATION_STATUSES.has(raw)) {
    return {
      conflicts: [
        {
          dimension: 'change-verification-status',
          authority,
          message: `verification.md contains invalid flowkit-change-verification-status value: ${String(raw)}`,
        },
      ],
    };
  }

  return { status: raw as VerificationStatus, conflicts: [] };
}

interface TasksCompletionProjectionResult {
  readonly complete?: boolean;
  readonly conflicts: readonly FactConflict[];
}

const REQUIRED_TASK_LINE = /^\s*-\s+\[([ xX])\]/gm;

async function readActiveChangeTasksCompletion(
  input: ReadFormalFactSnapshotInput,
  activeChangeId: string | undefined,
): Promise<TasksCompletionProjectionResult> {
  if (activeChangeId === undefined) {
    return { conflicts: [] };
  }

  const tasksPath = await resolveActiveOpenSpecOwnedPath(input, activeChangeId, 'tasks');
  if (!(await pathExists(tasksPath))) {
    return { conflicts: [] };
  }

  let content: string;
  try {
    content = await readFile(tasksPath, 'utf-8');
  } catch (error) {
    return {
      conflicts: [
        {
          dimension: 'change-tasks-completion',
          authority: normalizeSeparators(tasksPath.slice(input.repoRoot.length + 1)),
          message: `tasks.md unreadable: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  const matches = [...content.matchAll(REQUIRED_TASK_LINE)];
  const complete = matches.every((match) => {
    const marker = match[1];
    return marker === 'x' || marker === 'X';
  });
  return { complete, conflicts: [] };
}

async function resolveActiveOpenSpecOwnedPath(
  input: ReadFormalFactSnapshotInput,
  changeId: string,
  kind: 'tasks' | 'verification',
): Promise<string> {
  if (!(await isOpenSpecThinIntegrationActive(input.repoRoot, changeId))) {
    return join(input.repoRoot, input.openspecChangesPath, changeId, `${kind}.md`);
  }
  const status = await new OpenSpecCliAdapter({ repoRoot: input.repoRoot }).getChangeStatus(changeId);
  if (kind === 'verification') return join(input.repoRoot, status.changeRootLogical, 'verification.md');
  const paths = status.artifactPaths.tasks.physicalPaths;
  if (paths.length !== 1) {
    throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', 'OpenSpec tasks artifact must resolve to exactly one file', { changeId, paths });
  }
  return paths[0]!;
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
    if (await pathExists(specPath)) return specPath;
  }
  return null;
}


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
    if (reviewRun === undefined) continue;
    if (reviewRun.status !== 'completed' || reviewRun.inputRef === undefined) {
      admitted.push(verdict);
      continue;
    }
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
        detail: { reviewRunId: reviewRun.runId, reviewedRunId: verdict.reviewedRunId, code: err.code },
      });
    }
  }
  return { conflicts, admittedVerdicts: admitted };
}

function isRevisionAction(action: string): boolean {
  return action === 'revise-explore' || action === 'revise-propose' || action === 'revise-apply';
}

function approvedReviewHandoffFor(action: string): 'review-explore' | 'review-propose' | 'review-apply' | undefined {
  switch (action) {
    case 'propose': return 'review-explore';
    case 'apply': return 'review-propose';
    case 'archive': return 'review-apply';
    default: return undefined;
  }
}

/**
 * Q2 current persisted handoff recovery. Forward Actions do not carry the
 * revise-only sourceReview tuple; their context.inputRef itself points at the
 * approved Review result consumed at entry. Reader validates only this current
 * immutable handoff, not any mutable OpenSpec bytes from historical Runs.
 */
function validateApprovedReviewHandoff(
  run: RunFact,
  runs: readonly RunFact[],
  admittedReviewVerdicts: readonly ReviewVerdictFact[],
): FactConflict[] {
  const expectedAction = approvedReviewHandoffFor(run.action);
  if (expectedAction === undefined) return [];
  if (run.inputRef === undefined) {
    return [{
      dimension: 'immutable-ref-required',
      authority: run.runId,
      message: `${run.status} ${run.action} Run ${run.runId} is missing its approved Review inputRef handoff`,
      detail: { runId: run.runId, action: run.action, expectedReviewAction: expectedAction },
    }];
  }
  const reviewRunId = extractRunIdFromResultRef(run.inputRef.ref);
  if (reviewRunId === undefined || run.inputRef.kind !== 'run-result') {
    return [{
      dimension: 'immutable-ref-target',
      authority: run.runId,
      message: `${run.action} Run ${run.runId} inputRef must target an immutable review result`,
      detail: { runId: run.runId, action: run.action, inputRef: run.inputRef },
    }];
  }
  const reviewRun = runs.find((candidate) => candidate.runId === reviewRunId);
  if (reviewRun === undefined || reviewRun.action !== expectedAction) {
    return [{
      dimension: 'immutable-ref-wrong-stage',
      authority: run.runId,
      message: `${run.action} Run ${run.runId} requires ${expectedAction}; got ${reviewRun?.action ?? 'missing'}`,
      detail: { runId: run.runId, action: run.action, reviewRunId, expectedAction, actualAction: reviewRun?.action },
    }];
  }
  const verdict = admittedReviewVerdicts.find((candidate) => candidate.reviewRunId === reviewRunId);
  if (verdict === undefined) {
    return [{
      dimension: 'immutable-ref-source-unadmitted',
      authority: run.runId,
      message: `${run.action} Run ${run.runId} consumes review ${reviewRunId}, but that review is not admitted`,
      detail: { runId: run.runId, action: run.action, reviewRunId },
    }];
  }
  if (verdict.verdict !== 'approved') {
    return [{
      dimension: 'immutable-ref-verdict-mismatch',
      authority: run.runId,
      message: `${run.action} Run ${run.runId} requires an approved ${expectedAction}; got ${verdict.verdict}`,
      detail: { runId: run.runId, action: run.action, reviewRunId, verdict: verdict.verdict },
    }];
  }
  return [];
}

/**
 * Validate predecessor facts available from context.json before terminal result
 * publication. Q2/v6 applies this to every source-review consumer, not only
 * revise-* Actions.
 */
function validateSourceReviewPredecessorLineage(
  run: RunFact,
  runs: readonly RunFact[],
  admittedReviewVerdicts: readonly ReviewVerdictFact[],
): FactConflict[] {
  const conflicts: FactConflict[] = [];
  const expectedAction = expectedSourceReviewActionFor(run.action);
  if (expectedAction === undefined) return conflicts;
  const expectedVerdict = 'changes-requested' as const;

  if (run.sourceReviewRun === undefined || run.sourceReviewVerdict === undefined || run.inputRef === undefined) {
    conflicts.push({
      dimension: 'immutable-ref-required',
      authority: run.runId,
      message: `${run.status} ${run.action} Run ${run.runId} is missing required source-review context binding`,
      detail: { runId: run.runId, action: run.action },
    });
    return conflicts;
  }

  if (run.sourceReviewVerdict !== expectedVerdict) {
    conflicts.push({
      dimension: 'immutable-ref-verdict-mismatch',
      authority: run.runId,
      message: `${run.status} ${run.action} Run ${run.runId} sourceReviewVerdict must be ${expectedVerdict}`,
      detail: { runId: run.runId, action: run.action, sourceReviewVerdict: run.sourceReviewVerdict },
    });
  }

  const sourceRunId = extractRunIdFromResultRef(run.inputRef.ref);
  if (sourceRunId !== run.sourceReviewRun || run.inputRef.kind !== 'run-result') {
    conflicts.push({
      dimension: 'immutable-ref-target',
      authority: run.runId,
      message: `${run.status} ${run.action} Run ${run.runId} inputRef must exact-bind sourceReviewRun ${run.sourceReviewRun}`,
      detail: { runId: run.runId, action: run.action, sourceReviewRun: run.sourceReviewRun, inputRef: run.inputRef.ref },
    });
  }

  const admittedVerdict = admittedReviewVerdicts.find((v) => v.reviewRunId === run.sourceReviewRun);
  if (admittedVerdict === undefined) {
    conflicts.push({
      dimension: 'immutable-ref-source-unadmitted',
      authority: run.runId,
      message: `${run.status} ${run.action} Run ${run.runId} source review ${run.sourceReviewRun} is not an exact-bound admitted review`,
      detail: { runId: run.runId, action: run.action, sourceReviewRun: run.sourceReviewRun },
    });
    return conflicts;
  }

  if (admittedVerdict.verdict !== expectedVerdict) {
    conflicts.push({
      dimension: 'immutable-ref-verdict-mismatch',
      authority: run.runId,
      message: `${run.status} ${run.action} Run ${run.runId} requires source review verdict ${expectedVerdict}; got ${admittedVerdict.verdict}`,
      detail: { runId: run.runId, action: run.action, reviewVerdict: admittedVerdict.verdict },
    });
  }

  const sourceReviewRun = runs.find((candidate) => candidate.runId === run.sourceReviewRun);
  if (sourceReviewRun === undefined || sourceReviewRun.action !== expectedAction) {
    conflicts.push({
      dimension: 'immutable-ref-wrong-stage',
      authority: run.runId,
      message: `${run.status} ${run.action} Run ${run.runId} requires source review action ${expectedAction}; got ${sourceReviewRun?.action ?? 'missing'}`,
      detail: {
        runId: run.runId,
        action: run.action,
        sourceReviewRun: run.sourceReviewRun,
        expectedAction,
        actualAction: sourceReviewRun?.action,
      },
    });
  }

  return conflicts;
}

function tupleProblemToConflict(run: RunFact, problem: { code: string; message: string }): FactConflict {
  const dimension =
    problem.code === 'missing-sourceReviewRun' ||
    problem.code === 'missing-sourceReviewVerdict' ||
    problem.code === 'missing-reviewVerdictRef'
      ? 'immutable-ref-required'
      : problem.code === 'source-review-not-admitted'
        ? 'immutable-ref-source-unadmitted'
        : problem.code === 'verdict-mismatch'
          ? 'immutable-ref-verdict-mismatch'
          : problem.code === 'wrong-review-stage'
            ? 'immutable-ref-wrong-stage'
            : problem.code === 'verdict-not-changes-requested'
              ? 'immutable-ref-verdict-not-cr'
              : problem.code === 'wrong-target'
                ? 'immutable-ref-target'
                : problem.code === 'wrong-kind'
                  ? 'immutable-ref-kind'
                  : problem.code === 'fingerprint-mismatch'
                    ? 'immutable-ref-mismatch'
                    : 'immutable-ref-missing';
  return {
    dimension,
    authority: run.runId,
    message: problem.message,
    detail: { runId: run.runId, action: run.action, code: problem.code },
  };
}

async function validateImmutableRunResultRefs(
  runs: readonly RunFact[],
  admittedReviewVerdicts: readonly ReviewVerdictFact[],
  repoRoot: string,
  runsPathPrefix: string,
  c1RunIds: ReadonlySet<string>,
): Promise<ImmutableValidationResult> {
  const conflicts: FactConflict[] = [];
  const admittedSourceReviewVerdicts = admittedReviewVerdicts.map((v) => ({
    reviewRunId: v.reviewRunId,
    verdict: v.verdict,
    action: runs.find((r) => r.runId === v.reviewRunId)?.action ?? '',
  }));

  for (const run of runs) {
    // C1 ResultRef/source-review physical invariants apply only to Runs that
    // retained schemaVersion 2 provenance through admission. Historical
    // completed-Change corpora are excluded before this validation boundary.
    if (!c1RunIds.has(run.runId)) continue;

    // Admission is per Run: accumulate every status-applicable immutable
    // problem for the current projection before deciding whether Policy can use
    // the fact.
    const runConflicts: FactConflict[] = [];

    // Context-level non-review inputRef exists independently of terminal state,
    // so validate it for pending/completed/failed/cancelled alike when present.
    if (!run.action.startsWith('review-') && run.inputRef !== undefined) {
      runConflicts.push(
        ...await validateSingleImmutableRef(
          run,
          'inputRef',
          run.inputRef,
          extractRunIdFromResultRef(run.inputRef.ref),
          repoRoot,
          runsPathPrefix,
        ),
      );
    }

    // consumedInputRefs can only be projected from an admitted actionResult,
    // but when present they are immutable evidence and participate in the same
    // per-Run admission decision.
    if (run.consumedInputRefs !== undefined) {
      for (let i = 0; i < run.consumedInputRefs.length; i++) {
        const ref = run.consumedInputRefs[i];
        runConflicts.push(
          ...await validateSingleImmutableRef(
            run,
            `consumedInputRefs[${i}]`,
            ref,
            extractRunIdFromResultRef(ref.ref),
            repoRoot,
            runsPathPrefix,
          ),
        );
      }
    }

    runConflicts.push(...validateApprovedReviewHandoff(run, runs, admittedReviewVerdicts));

    if (isRevisionAction(run.action)) {
      runConflicts.push(
        ...validateSourceReviewPredecessorLineage(run, runs, admittedReviewVerdicts),
      );

      if (run.status === 'pending') {
        conflicts.push(...runConflicts);
        continue;
      }

      if (run.status === 'completed') {
        // Only completed revise has an actionResult and therefore can carry the
        // terminal reviewVerdictRef. The complete tuple stays strict here.
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
            requiresTuple: true,
            admittedSourceReviewVerdicts,
          },
        );
        runConflicts.push(...tupleProblems.map((p) => tupleProblemToConflict(run, p)));

        // Eligibility requires ALL applicable immutable evidence to pass: the
        // source-review tuple AND inputRef/consumedInputRefs above.
        conflicts.push(...runConflicts);
        continue;
      }

      // failed/cancelled are legal terminal physical projections with NO
      // actionResult. Consequently terminal-only reviewVerdictRef is forbidden
      // by schema and MUST NOT be required here. They can never be successors.
      // If predecessor context evidence survived from createRun, validate only
      // that context lineage; absence is not turned into terminal tuple
      // requiredness at this Reader layer.
      if (run.status === 'failed' || run.status === 'cancelled') {
        // Terminal status does not add completed-only refs; the persisted entry
        // context still retains the source-review binding established at create.
        conflicts.push(...runConflicts);
        continue;
      }
    }

    // Actions that do not consume a review keep optional source-review
    // consistency for any legacy evidence that is actually present.
    // rule. requiresTuple=false means no tuple is invented merely from action,
    // while any evidence that is actually present must remain self-consistent.
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
        requiresTuple: false,
        admittedSourceReviewVerdicts,
      },
    );
    runConflicts.push(...tupleProblems.map((p) => tupleProblemToConflict(run, p)));

    if (
      run.reviewVerdictRef !== undefined &&
      run.sourceReviewRun === undefined &&
      tupleProblems.length === 0
    ) {
      runConflicts.push({
        dimension: 'immutable-ref-required',
        authority: run.runId,
        message: `Run ${run.runId} carries actionResult.reviewVerdictRef but context.sourceReviewRun is absent; reviewVerdictRef MUST be backed by the source-review tuple`,
        detail: { runId: run.runId, action: run.action },
      });
    }

    conflicts.push(...runConflicts);
  }

  return { conflicts };
}

async function validateSingleImmutableRef(
  run: RunFact,
  field: string,
  ref: ResultRef,
  targetRunId: string | undefined,
  repoRoot: string,
  runsPathPrefix: string,
): Promise<FactConflict[]> {
  const conflicts: FactConflict[] = [];
  if (ref.kind !== 'run-result') {
    conflicts.push({
      dimension: 'immutable-ref-kind',
      authority: run.runId,
      message: `Run ${run.runId} ${field} kind is ${String(ref.kind)}, expected run-result`,
      detail: { runId: run.runId, field, kind: ref.kind, ref: ref.ref },
    });
    return conflicts;
  }
  if (targetRunId === undefined) {
    conflicts.push({
      dimension: 'immutable-ref-target',
      authority: run.runId,
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
      authority: run.runId,
      message: `Run ${run.runId} ${field} ref (${normalizedActual}) does not match Core-allowed target (${expectedPath})`,
      detail: { runId: run.runId, field, expectedPath, actual: normalizedActual },
    });
    return conflicts;
  }
  let content: string;
  try {
    content = await readFile(join(repoRoot, normalizedActual), 'utf-8');
  } catch {
    conflicts.push({
      dimension: 'immutable-ref-missing',
      authority: run.runId,
      message: `Run ${run.runId} ${field} target result.json not found or unreadable: ${normalizedActual}`,
      detail: { runId: run.runId, field, path: normalizedActual },
    });
    return conflicts;
  }
  const actualHash = computeResultFileHash(content);
  if (actualHash !== ref.versionFingerprint) {
    conflicts.push({
      dimension: 'immutable-ref-mismatch',
      authority: run.runId,
      message: `Run ${run.runId} ${field} fingerprint mismatch: ${normalizedActual} (expected ${ref.versionFingerprint}, got ${actualHash})`,
      detail: { runId: run.runId, field, expected: ref.versionFingerprint, actual: actualHash },
    });
  }
  return conflicts;
}

function extractRunIdFromResultRef(ref: string): string | undefined {
  const normalized = normalizeSeparators(ref).replace(/\/+$/, '');
  const match = /\/(\d{8}-\d{3}-[a-z][a-z-]*)\/result\.json$/i.exec(normalized);
  return match === null ? undefined : match[1];
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
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

function isErrnoENOENT(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === 'ENOENT';
}

function errnoName(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as { code?: unknown }).code;
    return typeof code === 'string' ? code : 'unknown';
  }
  return 'unknown';
}

function looksLikeChangeDir(name: string): boolean {
  if (looksLikeRunId(name)) return false;
  return !/^\d{8}-/.test(name);
}

export { validateContextFile };
