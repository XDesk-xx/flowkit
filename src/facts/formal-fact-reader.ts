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

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeSeparators } from '../shared/paths.js';
import { isFormalAction } from '../domain/actions.js';
import { parseYaml } from './yaml-parser.js';
import { readGitBoundaryProjection, type GitCheckpointBoundaryCandidate, type GitDeliveryFinalBoundaryCandidate } from './git-boundary-reader.js';
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
import {
  deriveFullTestFailureFinding,
  FULL_TEST_BOUNDED_RESOLVER_IDS,
  fullTestFailureFindingIdFor,
  fullTestResultRefFor,
} from '../domain/full-test.js';
import type { BlockingAuthority, ResultRef, RunStatus, VerificationStatus } from '../domain/types.js';
import { AUTHORIZATION_ONLY_OWNER_DECISIONS, OWNER_DECISION_RECORD_KINDS } from '../domain/a1-types.js';
import type { AuthorizationOnlyOwnerDecision, OwnerDecisionRecordKind } from '../domain/a1-types.js';
import type {
  FullTestCheckResult,
  FullTestExecutionBlock,
  FullTestExecutionContract,
  FullTestFailureFinding,
  FullTestTerminalResult,
  ResolvedFullTestFailureFinding,
} from '../domain/full-test.js';
import { ownerDecisionRefFor } from '../domain/owner-provenance.js';
import { acceptedSourceMatchesCycle, parseAcceptedSystemSource, parseCurrentArchitectureCycle } from '../architecture/architecture-lifecycle.js';
import { buildDeliveryFinalizationQualification, parseDeliveryFinalizationProjection, type DeliveryFinalizationProjection, type DeliveryFinalizationQualification } from '../domain/delivery-finalization.js';
import type { AcceptedSystemSource, CurrentArchitectureCycle } from '../architecture/architecture-lifecycle.js';
import { isPreA1LegacyArchitectureImpactIdentity } from './pre-a1-legacy-architecture-impact.js';
import { FlowkitError } from '../shared/errors.js';
import { runCommand } from '../shared/external-command.js';
import { OpenSpecCliAdapter } from '../integrations/openspec/openspec-cli-adapter.js';
import { computeLineage } from '../policy/lineage.js';
import { projectCurrentContractResetLifecycle } from './generation-resolver.js';
import { validateCurrentReverificationChain, validateTerminalVerificationSelectionBinding } from '../verification/change-selection/publication.js';
import { DeliveryManifestDocument } from '../persistence/delivery-manifest-document.js';
import { deliveryFinalCandidateRefFor } from '../domain/delivery-finalization.js';
import { isOpenSpecThinIntegrationActive } from '../integrations/openspec/openspec-integration-state.js';
import type { OpenSpecOperationProjection } from '../integrations/openspec/openspec-types.js';
import type {
  ChangeFact,
  FactConflict,
  FormalFactSnapshot,
  GitBoundaryFact,
  ArchiveTerminalFact,
  OpenSpecArtifactFact,
  ReviewVerdictFact,
  RunFact,
  OwnerAuthorizationFact,
  OwnerDecisionFact,
} from './formal-fact-snapshot.js';

export interface ReadFormalFactSnapshotInput {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly runsPathPrefix: string;
  readonly openspecChangesPath: string;
  readonly manifestPathPrefix: string;
  /** Optional bounded adapter injection for one formal read operation/test harness. */
  readonly openSpecAdapter?: OpenSpecCliAdapter;
}

interface ImmutableValidationResult {
  readonly conflicts: readonly FactConflict[];
}

export interface FormalFactReadOperation {
  readonly snapshot: FormalFactSnapshot;
  readonly openSpecProjection?: OpenSpecOperationProjection;
}

export async function readFormalFactSnapshot(input: ReadFormalFactSnapshotInput): Promise<FormalFactSnapshot> {
  return (await readFormalFactSnapshotOperation(input)).snapshot;
}

export async function readFormalFactSnapshotOperation(
  input: ReadFormalFactSnapshotInput,
): Promise<FormalFactReadOperation> {
  const conflicts: FactConflict[] = [];
  const deliveryRunsDir = join(input.repoRoot, input.runsPathPrefix, input.deliveryId);

  const manifestResult = await readDeliveryManifest(input);
  const activeChangeId = manifestResult.changes.find((change) => change.state === 'active')?.id;
  let openSpecProjection: OpenSpecOperationProjection | undefined;
  if (activeChangeId !== undefined && await isOpenSpecThinIntegrationActive(input.repoRoot, activeChangeId)) {
    openSpecProjection = await (input.openSpecAdapter ?? new OpenSpecCliAdapter({ repoRoot: input.repoRoot })).createOperationProjection(activeChangeId);
  }
  const { runs, reviewVerdicts, c1RunIds, runConflicts } = await readRuns(deliveryRunsDir, activeChangeId);
  conflicts.push(...runConflicts);
  const openSpecArtifacts = await readOpenSpecArtifacts(input, manifestResult.changes, openSpecProjection);
  const verificationProjection = await readActiveChangeVerificationStatus(input, activeChangeId, runs, reviewVerdicts, manifestResult.ownerDecisionFacts, openSpecProjection);
  conflicts.push(...verificationProjection.conflicts);
  const tasksProjection = await readActiveChangeTasksCompletion(
    input,
    activeChangeId,
    openSpecProjection,
  );
  conflicts.push(...tasksProjection.conflicts);

  let gitBoundaries: GitBoundaryFact[] = [];
  try {
    gitBoundaries = await readAdmittedGitBoundaries(input);
  } catch {
    // Git boundaries are best-effort at Reader level. Invalid/unbound checkpoint
    // candidates fail closed by absence; Policy therefore keeps the Owner gate.
  }

  let checkpointArchiveTerminal: ArchiveTerminalFact | undefined;
  if (activeChangeId === undefined) {
    const checkpointCandidates = completedUncheckpointedChangesForReader(manifestResult.changes, gitBoundaries);
    if (checkpointCandidates.length === 1) {
      const projection = await readCheckpointArchiveTerminal(deliveryRunsDir, checkpointCandidates[0]!.id);
      checkpointArchiveTerminal = projection.fact;
      conflicts.push(...projection.conflicts);
    }
  }

  const ownerAuthorizations = manifestResult.ownerAuthorizations;
  const ownerDecisionFacts = manifestResult.ownerDecisionFacts;
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



  const rawFullTestStatus = manifestResult.deliveryFullTestStatus;
  const effectiveFullTestStatus = rawFullTestStatus === 'not-ready'
    && activeChangeId === undefined
    && manifestResult.deliveryFullTestExecution !== undefined
    && conflicts.length === 0
    && allRequiredCheckpointedForEffective(manifestResult.changes, gitBoundaries)
    ? 'awaiting-user-decision'
    : rawFullTestStatus;

  let deliveryFinalizationQualification: DeliveryFinalizationQualification | undefined;
  try {
    deliveryFinalizationQualification = await deriveCurrentFinalizationQualification(input.repoRoot, input.deliveryId, {
      ...manifestResult,
      deliveryFullTestStatus: effectiveFullTestStatus,
      gitBoundaries,
    });
  } catch (error) {
    conflicts.push({ dimension: 'delivery-finalization-qualification', authority: input.deliveryId, message: error instanceof Error ? error.message : String(error) });
  }
  if (manifestResult.deliveryFinalization !== undefined) {
    if (deliveryFinalizationQualification === undefined || manifestResult.deliveryFinalization.qualificationRef !== deliveryFinalizationQualification.qualificationRef) {
      conflicts.push({ dimension: 'delivery-finalization', authority: input.deliveryId, message: 'persisted finalization does not bind the current exact qualification' });
    }
    const owner = manifestResult.ownerDecisionFacts.find((fact) => fact.ref === manifestResult.deliveryFinalization!.ownerAuthorizationRef);
    if (owner?.decision !== 'authorize-delivery-finalize' || owner.finalizationQualificationRef !== manifestResult.deliveryFinalization.qualificationRef) {
      conflicts.push({ dimension: 'delivery-finalization', authority: input.deliveryId, message: 'persisted finalization Owner authorization does not bind the same qualification' });
    }
  }

  const snapshot: FormalFactSnapshot = {
    deliveryId: input.deliveryId,
    deliveryState: manifestResult.deliveryState,
    deliveryFullTestStatus: effectiveFullTestStatus,
    ...(rawFullTestStatus !== undefined && { deliveryFullTestRawStatus: rawFullTestStatus }),
    ...(manifestResult.deliveryFullTestExecution !== undefined && { deliveryFullTestExecution: manifestResult.deliveryFullTestExecution }),
    ...(manifestResult.deliveryFullTestExecutionBlock !== undefined && { deliveryFullTestExecutionBlock: manifestResult.deliveryFullTestExecutionBlock }),
    ...(manifestResult.deliveryFullTestResult !== undefined && { deliveryFullTestResult: manifestResult.deliveryFullTestResult }),
    deliveryFullTestFailureHistory: manifestResult.deliveryFullTestFailureHistory,
    deliveryFullTestFindings: manifestResult.deliveryFullTestFindings,
    ...(manifestResult.deliveryArchitectureImpact !== undefined && { deliveryArchitectureImpact: manifestResult.deliveryArchitectureImpact }),
    ...(manifestResult.architectureCurrentCycle !== undefined && { architectureCurrentCycle: manifestResult.architectureCurrentCycle }),
    ...(manifestResult.acceptedSystemSource !== undefined && { acceptedSystemSource: manifestResult.acceptedSystemSource }),
    ...(deliveryFinalizationQualification !== undefined && { deliveryFinalizationQualification }),
    ...(manifestResult.deliveryFinalization !== undefined && { deliveryFinalization: manifestResult.deliveryFinalization }),
    ...(manifestResult.currentDeliveryFullTestFinding !== undefined && {
      currentDeliveryFullTestFinding: manifestResult.currentDeliveryFullTestFinding,
    }),
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
    ...(checkpointArchiveTerminal !== undefined && { checkpointArchiveTerminal }),
    ownerAuthorizations,
    ownerDecisionFacts,
    reviewVerdicts: admittedReviewVerdicts,
    conflicts,
  };
  return { snapshot, ...(openSpecProjection !== undefined && { openSpecProjection }) };
}

interface ManifestResult {
  readonly deliveryState: FormalFactSnapshot['deliveryState'];
  readonly deliveryFullTestStatus: FormalFactSnapshot['deliveryFullTestStatus'];
  readonly deliveryFullTestExecution?: FullTestExecutionContract;
  readonly deliveryFullTestExecutionBlock?: FullTestExecutionBlock;
  readonly deliveryFullTestResult?: FullTestTerminalResult;
  readonly deliveryFullTestFailureHistory: readonly FullTestTerminalResult[];
  readonly deliveryFullTestFindings: readonly ResolvedFullTestFailureFinding[];
  readonly currentDeliveryFullTestFinding?: FullTestFailureFinding;
  readonly deliveryArchitectureImpact?: boolean;
  readonly architectureCurrentCycle?: CurrentArchitectureCycle;
  readonly acceptedSystemSource?: AcceptedSystemSource;
  readonly deliveryFinalization?: DeliveryFinalizationProjection;
  readonly changes: readonly ChangeFact[];
  readonly ownerAuthorizations: readonly OwnerAuthorizationFact[];
  readonly ownerDecisionFacts: readonly OwnerDecisionFact[];
  readonly conflicts: readonly FactConflict[];
}


function manifestObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readFullTestExecution(value: unknown, conflicts: FactConflict[], authority: string): FullTestExecutionContract | undefined {
  if (value === undefined) return undefined;
  const obj = manifestObject(value);
  const conflict = (message: string): undefined => {
    conflicts.push({ dimension: 'delivery-full-test-execution', authority, message });
    return undefined;
  };
  if (obj === undefined) return conflict('verification.fullTest.execution must be a mapping');
  const id = obj['id'];
  if (typeof id !== 'string' || id.trim() === '') return conflict('verification.fullTest.execution id must be a non-empty string');
  if (obj['scope'] !== 'delivery') return conflict('verification.fullTest.execution scope is invalid');
  if (obj['resultProtocol'] !== 'flowkit-full-test-result-v1' || obj['resultAuthority'] !== 'verification') return conflict('verification.fullTest.execution result protocol/authority is invalid');
  const statuses = obj['expectedTerminalStatuses'];
  if (!Array.isArray(statuses) || statuses.length !== 2 || statuses[0] !== 'passed' || statuses[1] !== 'failed') return conflict('verification.fullTest.execution expectedTerminalStatuses must be [passed, failed]');
  if (obj['kind'] === 'command') {
    const keys = Object.keys(obj).sort();
    const expected = ['args','command','expectedTerminalStatuses','id','kind','launcherMode','resultAuthority','resultProtocol','scope','timeoutMs'];
    if (JSON.stringify(keys) !== JSON.stringify(expected)) return conflict('verification.fullTest.execution has unsupported command fields');
    const command = obj['command']; const args = obj['args']; const timeoutMs = obj['timeoutMs'];
    if (typeof command !== 'string' || command.trim() === '') return conflict('verification.fullTest.execution command must be a non-empty string');
    if (!Array.isArray(args) || args.some((item) => typeof item !== 'string' || item.trim() === '')) return conflict('verification.fullTest.execution args must be an array of non-empty strings');
    if (obj['launcherMode'] !== 'direct' && obj['launcherMode'] !== 'npm-shim') return conflict('verification.fullTest.execution launcherMode is invalid');
    if (obj['launcherMode'] === 'npm-shim' && command !== 'npm') return conflict('verification.fullTest.execution npm-shim requires command=npm');
    if (!Number.isInteger(timeoutMs) || typeof timeoutMs !== 'number' || timeoutMs <= 0) return conflict('verification.fullTest.execution timeoutMs must be a positive integer');
    return { id, kind: 'command', command, args: args as string[], launcherMode: obj['launcherMode'], scope: 'delivery', timeoutMs, resultProtocol: 'flowkit-full-test-result-v1', resultAuthority: 'verification', expectedTerminalStatuses: ['passed','failed'] };
  }
  if (obj['kind'] !== 'bounded-command-plan') return conflict('verification.fullTest.execution kind is invalid');
  const keys = Object.keys(obj).sort();
  const expected = ['expectedTerminalStatuses','id','kind','logicalChecks','resultAuthority','resultProtocol','scope'];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) return conflict('verification.fullTest.execution has unsupported bounded fields');
  const rawChecks = obj['logicalChecks'];
  if (!Array.isArray(rawChecks) || rawChecks.length === 0) return conflict('verification.fullTest.execution logicalChecks must be a non-empty sequence');
  const ids = new Set<string>();
  const allowedResolvers = new Set<string>(FULL_TEST_BOUNDED_RESOLVER_IDS);
  const logicalChecks: { id: string; resolverId: (typeof FULL_TEST_BOUNDED_RESOLVER_IDS)[number]; perTargetTimeoutMs: number }[] = [];
  for (const [index, raw] of rawChecks.entries()) {
    const check = manifestObject(raw);
    if (check === undefined || JSON.stringify(Object.keys(check).sort()) !== JSON.stringify(['id','perTargetTimeoutMs','resolverId'])) return conflict(`verification.fullTest.execution logicalChecks[${index}] has unsupported shape`);
    const checkId = check['id']; const resolverId = check['resolverId']; const timeout = check['perTargetTimeoutMs'];
    if (typeof checkId !== 'string' || checkId.trim() === '' || ids.has(checkId)) return conflict(`verification.fullTest.execution logicalChecks[${index}].id is invalid/duplicate`);
    if (typeof resolverId !== 'string' || !allowedResolvers.has(resolverId)) return conflict(`verification.fullTest.execution logicalChecks[${index}].resolverId is unknown`);
    if (!Number.isInteger(timeout) || typeof timeout !== 'number' || timeout <= 0) return conflict(`verification.fullTest.execution logicalChecks[${index}].perTargetTimeoutMs must be a positive integer`);
    ids.add(checkId);
    logicalChecks.push({ id: checkId, resolverId: resolverId as (typeof FULL_TEST_BOUNDED_RESOLVER_IDS)[number], perTargetTimeoutMs: timeout });
  }
  return { id, kind: 'bounded-command-plan', logicalChecks, scope: 'delivery', resultProtocol: 'flowkit-full-test-result-v1', resultAuthority: 'verification', expectedTerminalStatuses: ['passed','failed'] };
}

function readFullTestExecutionBlock(value: unknown, conflicts: FactConflict[], authority: string): FullTestExecutionBlock | undefined {
  if (value === undefined) return undefined;
  const obj = manifestObject(value);
  const conflict = (message: string): undefined => { conflicts.push({ dimension: 'delivery-full-test-execution-block', authority, message }); return undefined; };
  if (obj === undefined) return conflict('verification.fullTest.executionBlock must be a mapping');
  if (JSON.stringify(Object.keys(obj).sort()) !== JSON.stringify(['reason','schemaVersion','summary'])) return conflict('verification.fullTest.executionBlock has unsupported fields');
  if (obj['schemaVersion'] !== 1 || obj['reason'] !== 'outcome-unknown' || typeof obj['summary'] !== 'string' || obj['summary'].trim() === '') return conflict('verification.fullTest.executionBlock is invalid');
  return { schemaVersion: 1, reason: 'outcome-unknown', summary: obj['summary'] };
}

function readFullTestResult(value: unknown, conflicts: FactConflict[], authority: string): FullTestTerminalResult | undefined {
  if (value === undefined) return undefined;
  const obj = manifestObject(value);
  const conflict = (message: string): undefined => { conflicts.push({ dimension: 'delivery-full-test-result', authority, message }); return undefined; };
  if (obj === undefined) return conflict('verification.fullTest.result must be a mapping');
  const expected = ['checks','resultRef','schemaVersion','status','summary','totalDurationMs'];
  if (JSON.stringify(Object.keys(obj).sort()) !== JSON.stringify(expected)) return conflict('verification.fullTest.result has unsupported fields');
  if (obj['schemaVersion'] !== 1 || (obj['status'] !== 'passed' && obj['status'] !== 'failed') || typeof obj['summary'] !== 'string' || obj['summary'].trim() === '') return conflict('verification.fullTest.result header is invalid');
  if (!Number.isInteger(obj['totalDurationMs']) || typeof obj['totalDurationMs'] !== 'number' || obj['totalDurationMs'] < 0) return conflict('verification.fullTest.result totalDurationMs must be a non-negative integer');
  if (!Array.isArray(obj['checks'])) return conflict('verification.fullTest.result checks must be an array');
  const checks: FullTestCheckResult[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of obj['checks'].entries()) {
    const check = manifestObject(raw);
    if (check === undefined || JSON.stringify(Object.keys(check).sort()) !== JSON.stringify(['durationMs','id','status'])) return conflict(`verification.fullTest.result checks[${index}] is invalid`);
    if (typeof check['id'] !== 'string' || check['id'].trim() === '' || ids.has(check['id'])) return conflict(`verification.fullTest.result checks[${index}].id is invalid/duplicate`);
    if (check['status'] !== 'passed' && check['status'] !== 'failed') return conflict(`verification.fullTest.result checks[${index}].status is invalid`);
    if (!Number.isInteger(check['durationMs']) || typeof check['durationMs'] !== 'number' || check['durationMs'] < 0) return conflict(`verification.fullTest.result checks[${index}].durationMs is invalid`);
    ids.add(check['id']);
    checks.push({ id: check['id'], status: check['status'], durationMs: check['durationMs'] });
  }
  if (typeof obj['resultRef'] !== 'string') return conflict('verification.fullTest.result resultRef must be a string');
  const status = obj['status'] as 'passed' | 'failed';
  const payload = { schemaVersion: 1 as const, status, summary: obj['summary'], totalDurationMs: obj['totalDurationMs'], checks };
  const expectedRef = fullTestResultRefFor(payload);
  if (obj['resultRef'] !== expectedRef) return conflict('verification.fullTest.result resultRef does not match canonical payload');
  return { ...payload, resultRef: obj['resultRef'] };
}

function validateBoundedCurrentFullTestResult(
  execution: FullTestExecutionContract | undefined,
  result: FullTestTerminalResult | undefined,
  conflicts: FactConflict[],
  authority: string,
): FullTestTerminalResult | undefined {
  if (execution?.kind !== 'bounded-command-plan' || result === undefined) return result;
  const expected = execution.logicalChecks.map((check) => check.id);
  const ids = result.checks.map((check) => check.id);
  const exactPrefix = ids.every((id, index) => id === expected[index]);
  const priorPassed = result.checks.slice(0, -1).every((check) => check.status === 'passed');
  const validPassed = result.status === 'passed' && ids.length === expected.length && exactPrefix && result.checks.every((check) => check.status === 'passed');
  const validFailed = result.status === 'failed' && ids.length > 0 && ids.length <= expected.length && exactPrefix && priorPassed && result.checks.at(-1)?.status === 'failed';
  if (!validPassed && !validFailed) {
    conflicts.push({ dimension: 'delivery-full-test-result', authority, message: 'bounded Full Test result does not match persisted logical plan semantics' });
    return undefined;
  }
  return result;
}

function readFullTestFailureHistory(
  value: unknown,
  conflicts: FactConflict[],
  authority: string,
): readonly FullTestTerminalResult[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    conflicts.push({
      dimension: 'delivery-full-test-failure-history',
      authority,
      message: 'verification.fullTest.failureHistory must be a sequence',
    });
    return [];
  }
  const results: FullTestTerminalResult[] = [];
  const refs = new Set<string>();
  for (const [index, raw] of value.entries()) {
    const local: FactConflict[] = [];
    const result = readFullTestResult(raw, local, authority);
    if (result === undefined || local.length > 0) {
      conflicts.push({
        dimension: 'delivery-full-test-failure-history',
        authority,
        message: `verification.fullTest.failureHistory[${index}] is invalid`,
        detail: { causes: local.map((item) => item.message) },
      });
      continue;
    }
    if (result.status !== 'failed') {
      conflicts.push({
        dimension: 'delivery-full-test-failure-history',
        authority,
        message: `verification.fullTest.failureHistory[${index}] must have status=failed`,
      });
      continue;
    }
    if (refs.has(result.resultRef)) {
      conflicts.push({
        dimension: 'delivery-full-test-failure-history',
        authority,
        message: `duplicate retained Full Test resultRef ${result.resultRef}`,
      });
      continue;
    }
    refs.add(result.resultRef);
    results.push(result);
  }
  return results;
}

function latestFullTestAuthorizationRef(
  deliveryId: string,
  ownerDecisionFacts: readonly OwnerDecisionFact[],
): string | undefined {
  return [...ownerDecisionFacts]
    .reverse()
    .find((fact) =>
      fact.deliveryId === deliveryId
      && fact.decision === 'authorize-full-test'
      && fact.changeId === undefined,
    )?.ref;
}

function readResolvedFullTestFindings(input: {
  readonly deliveryId: string;
  readonly value: unknown;
  readonly history: readonly FullTestTerminalResult[];
  readonly ownerDecisionFacts: readonly OwnerDecisionFact[];
  readonly changes: readonly ChangeFact[];
  readonly conflicts: FactConflict[];
  readonly authority: string;
}): readonly ResolvedFullTestFailureFinding[] {
  if (input.value === undefined) return [];
  if (!Array.isArray(input.value)) {
    input.conflicts.push({
      dimension: 'delivery-full-test-findings',
      authority: input.authority,
      message: 'delivery.fullTestFindings must be a sequence',
    });
    return [];
  }
  const byResultRef = new Map(input.history.map((result) => [result.resultRef, result] as const));
  const ownerByRef = new Map(input.ownerDecisionFacts.map((fact) => [fact.ref, fact] as const));
  const changeIds = new Set(input.changes.map((change) => change.id));
  const findingIds = new Set<string>();
  const authorizationRefs = new Set<string>();
  const findings: ResolvedFullTestFailureFinding[] = [];
  const expectedKeys = [
    'affectedScope',
    'authorizationRef',
    'findingId',
    'requiredOwnerDecision',
    'resolution',
    'schemaVersion',
    'severity',
    'sourceResultRef',
    'summary',
  ];
  const expectedResolutionKeys = ['changeId', 'kind', 'ownerDecisionRef'];
  for (const [index, raw] of input.value.entries()) {
    const obj = manifestObject(raw);
    const fail = (message: string): void => {
      input.conflicts.push({
        dimension: 'delivery-full-test-findings',
        authority: input.authority,
        message: `delivery.fullTestFindings[${index}] ${message}`,
      });
    };
    if (obj === undefined || JSON.stringify(Object.keys(obj).sort()) !== JSON.stringify(expectedKeys)) {
      fail('has unsupported shape');
      continue;
    }
    const resolution = manifestObject(obj['resolution']);
    if (resolution === undefined || JSON.stringify(Object.keys(resolution).sort()) !== JSON.stringify(expectedResolutionKeys)) {
      fail('resolution has unsupported shape');
      continue;
    }
    const findingId = obj['findingId'];
    const authorizationRef = obj['authorizationRef'];
    const sourceResultRef = obj['sourceResultRef'];
    const summary = obj['summary'];
    const changeId = resolution['changeId'];
    const ownerDecisionRef = resolution['ownerDecisionRef'];
    if (
      obj['schemaVersion'] !== 1
      || typeof findingId !== 'string'
      || typeof authorizationRef !== 'string'
      || typeof sourceResultRef !== 'string'
      || obj['severity'] !== 'blocking'
      || typeof summary !== 'string'
      || summary.trim() === ''
      || obj['affectedScope'] !== 'delivery'
      || obj['requiredOwnerDecision'] !== 'corrective-change-or-cancel-delivery'
      || resolution['kind'] !== 'corrective-change-created'
      || typeof changeId !== 'string'
      || typeof ownerDecisionRef !== 'string'
    ) {
      fail('contains invalid fields');
      continue;
    }
    if (findingIds.has(findingId)) {
      fail(`duplicates findingId ${findingId}`);
      continue;
    }
    if (authorizationRefs.has(authorizationRef)) {
      fail(`duplicates authorizationRef occurrence ${authorizationRef}`);
      continue;
    }
    const authorization = ownerByRef.get(authorizationRef);
    if (authorization?.decision !== 'authorize-full-test' || authorization.deliveryId !== input.deliveryId || authorization.changeId !== undefined) {
      fail(`authorizationRef ${authorizationRef} does not resolve to a delivery-scoped authorize-full-test Owner fact`);
      continue;
    }
    const source = byResultRef.get(sourceResultRef);
    if (source === undefined) {
      fail(`sourceResultRef ${sourceResultRef} does not resolve to retained failed Verification result`);
      continue;
    }
    const expectedFindingId = fullTestFailureFindingIdFor({
      deliveryId: input.deliveryId,
      authorizationRef,
      sourceResultRef,
    });
    if (findingId !== expectedFindingId) {
      fail(`findingId does not match canonical occurrence tuple`);
      continue;
    }
    if (summary !== source.summary) {
      fail('summary does not exactly match retained Verification result summary');
      continue;
    }
    if (!changeIds.has(changeId)) {
      fail(`resolution.changeId ${changeId} does not resolve to current Delivery Change`);
      continue;
    }
    const createOwner = ownerByRef.get(ownerDecisionRef);
    if (createOwner?.decision !== 'create-change' || createOwner.deliveryId !== input.deliveryId || createOwner.changeId !== changeId) {
      fail(`resolution.ownerDecisionRef ${ownerDecisionRef} does not resolve to matching create-change Owner fact`);
      continue;
    }
    findingIds.add(findingId);
    authorizationRefs.add(authorizationRef);
    findings.push({
      schemaVersion: 1,
      findingId,
      authorizationRef,
      sourceResultRef,
      severity: 'blocking',
      summary,
      affectedScope: 'delivery',
      requiredOwnerDecision: 'corrective-change-or-cancel-delivery',
      resolution: {
        kind: 'corrective-change-created',
        changeId,
        ownerDecisionRef,
      },
    });
  }
  return findings;
}

function allRequiredCheckpointedForEffective(changes: readonly ChangeFact[], boundaries: readonly GitBoundaryFact[]): boolean {
  const required = changes.filter((change) => change.required);
  if (required.length === 0 || !required.every((change) => change.state === 'completed')) return false;
  const checkpoints = boundaries.filter((boundary) => boundary.kind === 'change-checkpoint');
  const structured = new Set(checkpoints.flatMap((boundary) => boundary.changeId === undefined ? [] : [boundary.changeId]));
  const legacyCount = checkpoints.filter((boundary) => boundary.changeId === undefined).length;
  const legacyCovered = new Set(required.filter((change) => !structured.has(change.id)).slice(0, legacyCount).map((change) => change.id));
  return required.every((change) => structured.has(change.id) || legacyCovered.has(change.id));
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
      ownerDecisionFacts: [],
      deliveryFullTestFailureHistory: [],
      deliveryFullTestFindings: [],
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
      ownerDecisionFacts: [],
      deliveryFullTestFailureHistory: [],
      deliveryFullTestFindings: [],
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
      ownerAuthorizations: [],
      ownerDecisionFacts: [],
      deliveryFullTestFailureHistory: [],
      deliveryFullTestFindings: [],
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

  const verificationObj = manifestObject(manifest['verification']);
  const fullTestObj = verificationObj === undefined ? undefined : manifestObject(verificationObj['fullTest']);
  const execution = readFullTestExecution(fullTestObj?.['execution'], conflicts, manifestPath);
  const executionBlock = readFullTestExecutionBlock(fullTestObj?.['executionBlock'], conflicts, manifestPath);
  const result = validateBoundedCurrentFullTestResult(execution, readFullTestResult(fullTestObj?.['result'], conflicts, manifestPath), conflicts, manifestPath);
  const failureHistory = readFullTestFailureHistory(fullTestObj?.['failureHistory'], conflicts, manifestPath);
  if ((fullTestStatus === 'passed' || fullTestStatus === 'failed')) {
    if (result === undefined) conflicts.push({ dimension: 'delivery-full-test-result', authority: manifestPath, message: `terminal delivery.fullTestStatus=${fullTestStatus} requires verification.fullTest.result` });
    else if (result.status !== fullTestStatus) conflicts.push({ dimension: 'delivery-full-test-result', authority: manifestPath, message: 'terminal Full Test status/result mismatch' });
  } else if (result !== undefined) {
    conflicts.push({ dimension: 'delivery-full-test-result', authority: manifestPath, message: 'non-terminal Full Test status must not carry verification.fullTest.result' });
  }
  if (executionBlock !== undefined && fullTestStatus !== 'authorized') {
    conflicts.push({ dimension: 'delivery-full-test-execution-block', authority: manifestPath, message: 'executionBlock is only valid while raw Full Test status is authorized' });
  }

  const changes = readChangeFacts(input.deliveryId, manifest['changes'], conflicts, manifestPath);
  const ownerDecisionFacts: OwnerDecisionFact[] = [];
  const ownerAuthorizations = readOwnerAuthorizations(
    input.deliveryId,
    manifest['ownerDecisions'],
    manifest['changes'],
    conflicts,
    manifestPath,
    ownerDecisionFacts,
  );
  const currentOwnerDecisionFacts = latestCurrentOwnerDecisionFacts(ownerDecisionFacts);
  const findings = readResolvedFullTestFindings({
    deliveryId: input.deliveryId,
    value: deliveryObj['fullTestFindings'],
    history: failureHistory,
    ownerDecisionFacts: currentOwnerDecisionFacts,
    changes,
    conflicts,
    authority: manifestPath,
  });
  let currentFinding: FullTestFailureFinding | undefined;
  if (fullTestStatus === 'failed' && result !== undefined) {
    const authorizationRef = latestFullTestAuthorizationRef(input.deliveryId, currentOwnerDecisionFacts);
    if (authorizationRef === undefined) {
      conflicts.push({
        dimension: 'delivery-full-test-finding',
        authority: manifestPath,
        message: 'failed Full Test result requires a delivery-scoped authorize-full-test Owner fact',
      });
    } else {
      currentFinding = deriveFullTestFailureFinding({
        deliveryId: input.deliveryId,
        authorizationRef,
        result,
      });
      if (findings.some((finding) => finding.authorizationRef === authorizationRef)) {
        conflicts.push({
          dimension: 'delivery-full-test-finding',
          authority: manifestPath,
          message: 'current failed Full Test occurrence is already present in resolved historical findings',
        });
      }
    }
  }

  let deliveryFinalization: DeliveryFinalizationProjection | undefined;
  if (deliveryObj['finalization'] !== undefined) {
    try { deliveryFinalization = parseDeliveryFinalizationProjection(deliveryObj['finalization']); }
    catch (error) { conflicts.push({ dimension: 'delivery-finalization', authority: manifestPath, message: error instanceof Error ? error.message : String(error) }); }
  }

  let deliveryArchitectureImpact: boolean | undefined;
  let architectureCurrentCycle: CurrentArchitectureCycle | undefined;
  let acceptedSystemSource: AcceptedSystemSource | undefined;
  const architectureObj = manifestObject(manifest['architecture']);
  if (architectureObj !== undefined) {
    if (typeof architectureObj['impact'] === 'boolean') {
      deliveryArchitectureImpact = architectureObj['impact'];
    } else {
      conflicts.push({ dimension: 'delivery-architecture', authority: manifestPath, message: 'architecture.impact must be boolean' });
    }
    try {
      if (architectureObj['currentCycle'] !== undefined) {
        architectureCurrentCycle = parseCurrentArchitectureCycle(architectureObj['currentCycle'], input.deliveryId);
        const latestAuthorizationRef = latestFullTestAuthorizationRef(input.deliveryId, currentOwnerDecisionFacts);
        if (fullTestStatus !== 'passed' || result === undefined) {
          throw new FlowkitError('ARCHITECTURE_CYCLE_QUALIFICATION_MISMATCH', 'current architecture cycle requires current passed Full Test result');
        }
        if (architectureCurrentCycle.fullTestResultRef !== result.resultRef || architectureCurrentCycle.fullTestAuthorizationRef !== latestAuthorizationRef) {
          throw new FlowkitError('ARCHITECTURE_CYCLE_QUALIFICATION_MISMATCH', 'current architecture cycle does not bind current Full Test authorization/result occurrence');
        }
        const actualBytes = await readFile(join(input.repoRoot, architectureCurrentCycle.actualArchitectureRef.path));
        const actualSha = createHash('sha256').update(actualBytes).digest('hex');
        if (actualSha !== architectureCurrentCycle.actualArchitectureRef.sha256) {
          throw new FlowkitError('ARCHITECTURE_REF_MISMATCH', 'current architecture Actual fingerprint does not match durable JSON');
        }
      }
      if (architectureObj['acceptedSystemSource'] !== undefined) {
        acceptedSystemSource = parseAcceptedSystemSource(architectureObj['acceptedSystemSource'], input.deliveryId);
        if (!acceptedSourceMatchesCycle(acceptedSystemSource, architectureCurrentCycle)) {
          throw new FlowkitError('ARCHITECTURE_SOURCE_MISMATCH', 'acceptedSystemSource must match accepted current architecture cycle');
        }
        const cycle = architectureCurrentCycle!;
        const ownerRef = cycle.acceptance.status === 'accepted' ? cycle.acceptance.ownerDecisionRef : undefined;
        const ownerFact = currentOwnerDecisionFacts.find((fact) => fact.ref === acceptedSystemSource!.ownerAcceptanceRef);
        if (ownerRef !== acceptedSystemSource.ownerAcceptanceRef || ownerFact?.decision !== 'accept-architecture' || ownerFact.architectureCycleRef !== cycle.cycleRef) {
          throw new FlowkitError('ARCHITECTURE_ACCEPTANCE_MISMATCH', 'acceptedSystemSource Owner acceptance does not bind the same architecture cycle');
        }
      } else if (architectureCurrentCycle?.acceptance.status === 'accepted') {
        throw new FlowkitError('ARCHITECTURE_SOURCE_MISSING', 'accepted current architecture cycle requires acceptedSystemSource');
      }
    } catch (error) {
      conflicts.push({
        dimension: 'delivery-architecture-lifecycle',
        authority: manifestPath,
        message: error instanceof Error ? error.message : String(error),
      });
      architectureCurrentCycle = undefined;
      acceptedSystemSource = undefined;
    }
  }

  return {
    deliveryState,
    deliveryFullTestStatus: fullTestStatus,
    ...(execution !== undefined && { deliveryFullTestExecution: execution }),
    ...(executionBlock !== undefined && { deliveryFullTestExecutionBlock: executionBlock }),
    ...(result !== undefined && { deliveryFullTestResult: result }),
    deliveryFullTestFailureHistory: failureHistory,
    deliveryFullTestFindings: findings,
    ...(currentFinding !== undefined && { currentDeliveryFullTestFinding: currentFinding }),
    ...(deliveryArchitectureImpact !== undefined && { deliveryArchitectureImpact }),
    ...(architectureCurrentCycle !== undefined && { architectureCurrentCycle }),
    ...(acceptedSystemSource !== undefined && { acceptedSystemSource }),
    ...(deliveryFinalization !== undefined && { deliveryFinalization }),
    changes,
    ownerAuthorizations,
    ownerDecisionFacts: currentOwnerDecisionFacts,
    conflicts,
  };
}

async function deriveCurrentFinalizationQualification(
  repoRoot: string,
  deliveryId: string,
  input: ManifestResult & { readonly gitBoundaries: readonly GitBoundaryFact[] },
): Promise<DeliveryFinalizationQualification | undefined> {
  if (input.deliveryFullTestStatus !== 'passed' || input.deliveryFullTestResult === undefined) return undefined;
  if (input.changes.some((change) => change.required && change.state !== 'completed')) return undefined;
  const authorizationRef = latestFullTestAuthorizationRef(deliveryId, input.ownerDecisionFacts);
  if (authorizationRef === undefined) return undefined;
  const candidates = input.gitBoundaries.filter((boundary) => boundary.kind === 'change-checkpoint' || boundary.kind === 'delivery-start');
  if (candidates.length === 0) return undefined;
  const maximal: GitBoundaryFact[] = [];
  for (const candidate of candidates) {
    let ancestorOfOther = false;
    for (const other of candidates) {
      if (candidate.commitSha === other.commitSha) continue;
      const rel = await runCommand('git', ['merge-base', '--is-ancestor', candidate.commitSha, other.commitSha], { cwd: repoRoot });
      if (rel.kind === 'exited' && rel.exitCode === 0) { ancestorOfOther = true; break; }
    }
    if (!ancestorOfOther) maximal.push(candidate);
  }
  if (maximal.length !== 1) throw new FlowkitError('FINALIZATION_QUALIFIED_BASE_AMBIGUOUS', 'cannot derive a unique latest admitted pre-final Git boundary');
  const qualifiedBaseRevision = maximal[0]!.commitSha;
  if (input.deliveryArchitectureImpact === true) {
    const cycle = input.architectureCurrentCycle;
    if (cycle?.acceptance.status !== 'accepted' || input.acceptedSystemSource === undefined) return undefined;
    if (!acceptedSourceMatchesCycle(input.acceptedSystemSource, cycle)) return undefined;
    if (cycle.actualArchitectureRef.repositoryRevision !== qualifiedBaseRevision) {
      throw new FlowkitError('FINALIZATION_ARCHITECTURE_REVISION_MISMATCH', 'accepted Actual repositoryRevision does not match qualifiedBaseRevision');
    }
    return buildDeliveryFinalizationQualification({
      deliveryId,
      fullTestAuthorizationRef: authorizationRef,
      fullTestResultRef: input.deliveryFullTestResult.resultRef,
      qualifiedBaseRevision,
      architecture: { kind: 'accepted', cycleRef: cycle.cycleRef, ownerAcceptanceRef: cycle.acceptance.ownerDecisionRef },
    });
  }
  if (input.deliveryArchitectureImpact === false) {
    return buildDeliveryFinalizationQualification({
      deliveryId,
      fullTestAuthorizationRef: authorizationRef,
      fullTestResultRef: input.deliveryFullTestResult.resultRef,
      qualifiedBaseRevision,
      architecture: { kind: 'not-applicable' },
    });
  }
  return undefined;
}

function latestCurrentOwnerDecisionFacts(facts: readonly OwnerDecisionFact[]): readonly OwnerDecisionFact[] {
  const latestByScope = new Map<string, OwnerDecisionFact>();
  const passthrough: OwnerDecisionFact[] = [];
  for (const fact of facts) {
    if (fact.decision !== 'contract-reset') {
      passthrough.push(fact);
      continue;
    }
    latestByScope.set(`${fact.deliveryId}\0${fact.changeId ?? ''}\0${fact.scope ?? ''}`, fact);
  }
  return [...passthrough, ...latestByScope.values()];
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
  ownerDecisionFacts: OwnerDecisionFact[] = [],
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

  const authorizationCandidates: Array<{ readonly index: number; readonly fact: OwnerAuthorizationFact }> = [];
  const latestResetIndexByChange = new Map<string, number>();
  const seenRefs = new Map<string, string>();
  for (const [index, item] of value.entries()) {
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
    const scope = obj['scope'];
    const requiredOutcomes = obj['requiredOutcomes'];
    const architectureCycleRef = obj['architectureCycleRef'];
    const finalizationQualificationRef = obj['finalizationQualificationRef'];
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
    let normalizedRequiredOutcomes: readonly string[] | undefined;
    if (typedRecordDecision === 'contract-reset') {
      if (typeof changeId !== 'string' || typeof scope !== 'string' || scope.trim() === '' ||
          !Array.isArray(requiredOutcomes) || requiredOutcomes.length === 0 ||
          requiredOutcomes.some((outcome) => typeof outcome !== 'string' || outcome.trim() === '')) {
        conflicts.push({
          dimension: 'owner-decision-record',
          authority: manifestPath,
          message: `Owner contract-reset ${ref} missing structured scope/requiredOutcomes/changeId`,
        });
        continue;
      }
      normalizedRequiredOutcomes = [...new Set((requiredOutcomes as string[]).map((outcome) => outcome.trim()))].sort();
    } else if (scope !== undefined || requiredOutcomes !== undefined) {
      conflicts.push({
        dimension: 'owner-decision-record',
        authority: manifestPath,
        message: `Owner record ${ref} carries contract-reset-only fields`,
      });
      continue;
    }
    if (architectureCycleRef !== undefined) {
      if (typeof architectureCycleRef !== 'string' || !/^architecture-cycle:[0-9a-f]{64}$/.test(architectureCycleRef)) {
        conflicts.push({ dimension: 'owner-decision-record', authority: manifestPath, message: `Owner record ${ref} has invalid architectureCycleRef` });
        continue;
      }
      if (typedRecordDecision !== 'accept-architecture' && typedRecordDecision !== 'create-change') {
        conflicts.push({ dimension: 'owner-decision-record', authority: manifestPath, message: `Owner record ${ref} carries architectureCycleRef for unsupported decision` });
        continue;
      }
    } else if (typedRecordDecision === 'accept-architecture') {
      conflicts.push({ dimension: 'owner-decision-record', authority: manifestPath, message: `Owner accept-architecture ${ref} requires architectureCycleRef` });
      continue;
    }
    if (finalizationQualificationRef !== undefined) {
      if (typeof finalizationQualificationRef !== 'string' || !/^delivery-finalization-qualification:[0-9a-f]{64}$/.test(finalizationQualificationRef)) {
        conflicts.push({ dimension: 'owner-decision-record', authority: manifestPath, message: `Owner record ${ref} has invalid finalizationQualificationRef` });
        continue;
      }
      if (typedRecordDecision !== 'authorize-delivery-finalize') {
        conflicts.push({ dimension: 'owner-decision-record', authority: manifestPath, message: `Owner record ${ref} carries finalizationQualificationRef for unsupported decision` });
        continue;
      }
    }
    const expectedRef = ownerDecisionRefFor({
      decision: typedRecordDecision,
      deliveryId: recordDeliveryId,
      sourceRef,
      ...(typeof changeId === 'string' ? { changeId } : {}),
      ...(typeof scope === 'string' ? { scope } : {}),
      ...(normalizedRequiredOutcomes !== undefined ? { requiredOutcomes: normalizedRequiredOutcomes } : {}),
      ...(typeof architectureCycleRef === 'string' ? { architectureCycleRef } : {}),
      ...(typeof finalizationQualificationRef === 'string' ? { finalizationQualificationRef } : {}),
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
      ...(typeof scope === 'string' ? { scope } : {}),
      ...(normalizedRequiredOutcomes !== undefined ? { requiredOutcomes: normalizedRequiredOutcomes } : {}),
      ...(typeof architectureCycleRef === 'string' ? { architectureCycleRef } : {}),
      ...(typeof finalizationQualificationRef === 'string' ? { finalizationQualificationRef } : {}),
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
      typedRecordDecision === 'contract-reset' ||
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

    ownerDecisionFacts.push({
      ref,
      decision: typedRecordDecision,
      deliveryId,
      ...(typeof changeId === 'string' ? { changeId } : {}),
      ...(typeof scope === 'string' ? { scope } : {}),
      ...(normalizedRequiredOutcomes !== undefined ? { requiredOutcomes: normalizedRequiredOutcomes } : {}),
      ...(typeof architectureCycleRef === 'string' ? { architectureCycleRef } : {}),
      ...(typeof finalizationQualificationRef === 'string' ? { finalizationQualificationRef } : {}),
      sourceRef,
    });

    if (typedRecordDecision === 'contract-reset' && typeof changeId === 'string') {
      latestResetIndexByChange.set(changeId, index);
    }

    if (!(AUTHORIZATION_ONLY_OWNER_DECISIONS as readonly string[]).includes(typedRecordDecision)) {
      // Non-authorization Owner decisions remain formal facts but are not Policy authorization gates.
      continue;
    }
    const typedDecision = typedRecordDecision as AuthorizationOnlyOwnerDecision;
    authorizationCandidates.push({
      index,
      fact: {
        ref,
        decision: typedDecision,
        deliveryId,
        ...(typeof changeId === 'string' ? { changeId } : {}),
        ...(typeof scope === 'string' ? { scope } : {}),
        ...(normalizedRequiredOutcomes !== undefined ? { requiredOutcomes: normalizedRequiredOutcomes } : {}),
        ...(typeof finalizationQualificationRef === 'string' ? { finalizationQualificationRef } : {}),
        sourceRef,
      },
    });
  }

  // D2 Contract Reset currentness: Change-scoped apply/archive/checkpoint
  // authorizations recorded before the latest reset are historical authority
  // facts, not current gates for the fresh proposal generation. Manifest order
  // is the existing append-only provenance; no generation registry is added.
  return authorizationCandidates
    .filter(({ index, fact }) => {
      if (fact.changeId === undefined) return true;
      const resetIndex = latestResetIndexByChange.get(fact.changeId);
      return resetIndex === undefined || index > resetIndex;
    })
    .map(({ fact }) => fact);
}

const F1_MIGRATION_DELIVERY_ID = '20260810-01-change-execution-loop';
const F1_STRICT_ANCHOR_CHANGE_ID = 'change-verification-generalization-and-lean-run-normalization';

/**
 * Resolve the one historical E2 cutover that is both strict-admitted and the
 * ancestor of every other strict-admitted E2 checkpoint candidate. This is a
 * narrow migration projection shared by legacy checkpoint admission and the
 * post-E2 Run writer. Git shape alone is intentionally insufficient: every
 * candidate is checked against the checkpoint-time Owner authorization fact.
 */
export async function resolveOriginalStrictE2Checkpoint(repoRoot: string): Promise<string | undefined> {
  const projection = await readGitBoundaryProjection(repoRoot, F1_MIGRATION_DELIVERY_ID);
  const input: ReadFormalFactSnapshotInput = {
    repoRoot,
    deliveryId: F1_MIGRATION_DELIVERY_ID,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  };
  const strictE2: GitCheckpointBoundaryCandidate[] = [];
  for (const candidate of projection.checkpointCandidates) {
    if (candidate.subjectChangeId !== F1_STRICT_ANCHOR_CHANGE_ID) continue;
    if (!candidate.formalIdentityValid || candidate.ownerAuthorizationTrailer === undefined) continue;
    if (await checkpointAuthorizationExistedAtBoundary(input, candidate)) strictE2.push(candidate);
  }
  if (strictE2.length === 0) return undefined;

  const originals: GitCheckpointBoundaryCandidate[] = [];
  for (const candidate of strictE2) {
    let ancestorOfAll = true;
    for (const other of strictE2) {
      if (candidate.commitSha === other.commitSha) continue;
      if (!(await gitIsAncestor(repoRoot, candidate.commitSha, other.commitSha))) {
        ancestorOfAll = false;
        break;
      }
    }
    if (ancestorOfAll) originals.push(candidate);
  }
  return originals.length === 1 ? originals[0]!.commitSha : undefined;
}

async function readAdmittedGitBoundaries(
  input: ReadFormalFactSnapshotInput,
): Promise<GitBoundaryFact[]> {
  const projection = await readGitBoundaryProjection(input.repoRoot, input.deliveryId);
  const strict = new Map<string, GitBoundaryFact>();

  for (const candidate of projection.checkpointCandidates) {
    const fact = await admitStrictCheckpointCandidate(input, candidate);
    if (fact !== undefined) strict.set(candidate.commitSha, fact);
  }

  const cutoverShas = await resolveRecognizedF1FinalizeCheckpoints(input.repoRoot);
  const strictFinalizeActive = cutoverShas.length > 0;
  const legacyBoundaries: GitBoundaryFact[] = [];
  for (const boundary of projection.boundaries) {
    if (boundary.kind !== 'delivery-final'
      || !strictFinalizeActive
      || await isAncestorOfEvery(input.repoRoot, boundary.commitSha, cutoverShas)) {
      legacyBoundaries.push(boundary);
    }
  }
  const strictFinals: GitBoundaryFact[] = [];
  if (strictFinalizeActive) {
    for (const candidate of projection.deliveryFinalCandidates) {
      if (await isAncestorOfEvery(input.repoRoot, candidate.commitSha, cutoverShas)) continue;
      const admitted = await admitStrictDeliveryFinalCandidate(input, candidate, [...legacyBoundaries, ...strict.values()]);
      if (admitted !== undefined) strictFinals.push(admitted);
    }
  }
  const facts: GitBoundaryFact[] = [...legacyBoundaries, ...strict.values(), ...strictFinals];
  if (input.deliveryId !== F1_MIGRATION_DELIVERY_ID) return facts;

  const anchorSha = await resolveOriginalStrictE2Checkpoint(input.repoRoot);
  if (anchorSha === undefined) return facts;
  const anchorCandidate = projection.checkpointCandidates.find((candidate) => candidate.commitSha === anchorSha);
  if (anchorCandidate === undefined || !strict.has(anchorCandidate.commitSha)) return facts;

  // Historical Flowkit checkpoints before the E2 strict anchor remain readable
  // without rewriting Git. The exemption is ancestry-bounded and cannot apply
  // to the anchor itself or any descendant/fresh repository checkpoint.
  for (const candidate of projection.checkpointCandidates) {
    if (strict.has(candidate.commitSha) || candidate.commitSha === anchorCandidate.commitSha) continue;
    if (!candidate.legacyCheckpointSubject) continue;
    if (!(await gitIsAncestor(input.repoRoot, candidate.commitSha, anchorCandidate.commitSha))) continue;
    facts.push({
      kind: 'change-checkpoint',
      commitSha: candidate.commitSha,
      summary: candidate.summary,
      ...(candidate.subjectChangeId !== undefined ? { changeId: candidate.subjectChangeId } : {}),
    });
  }
  return facts;
}

const F1_FINALIZE_CHANGE_ID = 'delivery-finalize-and-git-boundary';
const F1_FINALIZE_ACTIVATION_DELIVERY_ID = '20260817-01-delivery-execution-loop';

async function isAncestorOfEvery(repoRoot: string, commitSha: string, descendants: readonly string[]): Promise<boolean> {
  for (const descendant of descendants) {
    if (!(await gitIsAncestor(repoRoot, commitSha, descendant))) return false;
  }
  return true;
}

/**
 * F1 strict Delivery Final semantics are a one-way repository migration.
 * Only the formal F1 checkpoint from the bootstrap 03 Delivery can activate
 * the cutover; future Deliveries may reuse the same Change id without
 * becoming additional activation authorities. Multiple valid 03 candidates
 * (for example a retained divergent ref) keep strict mode active. A boundary
 * is legacy-compatible only when it provably predates every recognized
 * activation candidate, so added refs can never downgrade strict semantics.
 */
async function resolveRecognizedF1FinalizeCheckpoints(repoRoot: string): Promise<readonly string[]> {
  const log = await runCommand('git', ['log', '--all', '--format=%H%x1f%s%x1f%B%x1e'], { cwd: repoRoot });
  if (log.kind !== 'exited' || log.exitCode !== 0) return [];
  const admitted = new Set<string>();
  for (const raw of log.stdout.split('\x1e')) {
    const rec = raw.replace(/^\n+|\n+$/g, ''); if (!rec) continue;
    const [sha='', subject='', ...bodyParts] = rec.split('\x1f'); const body=bodyParts.join('\x1f');
    if (subject !== `chore(flowkit): checkpoint ${F1_FINALIZE_CHANGE_ID}`) continue;
    const vals=(name:string)=>body.split('\n').map((l)=>l.trim()).filter((l)=>l.toLowerCase().startsWith(`${name.toLowerCase()}:`)).map((l)=>l.slice(l.indexOf(':')+1).trim());
    const ds=vals('Flowkit-Delivery'), cs=vals('Flowkit-Change'), bs=vals('Flowkit-Boundary'), os=vals('Owner-Authorization');
    if(ds.length!==1||cs.length!==1||bs.length!==1||os.length!==1
      ||ds[0]!==F1_FINALIZE_ACTIVATION_DELIVERY_ID
      ||cs[0]!==F1_FINALIZE_CHANGE_ID||bs[0]!=='change-checkpoint'||!/^owner:[0-9a-f]{64}$/.test(os[0]!)) continue;
    const manifestRef=`openspec/delivery-groups/${ds[0]}.yaml`;
    const shown=await runCommand('git',['show',`${sha}:${manifestRef}`],{cwd:repoRoot}); if(shown.kind!=='exited'||shown.exitCode!==0) continue;
    const parsed=parseYaml(shown.stdout); if(!parsed.ok||typeof parsed.value!=='object'||parsed.value===null||Array.isArray(parsed.value)) continue;
    const m=parsed.value as Record<string,unknown>; const conflicts:FactConflict[]=[]; const facts:OwnerDecisionFact[]=[];
    const auth=readOwnerAuthorizations(ds[0]!,m['ownerDecisions'],m['changes'],conflicts,`${sha}:${manifestRef}`,facts);
    if(conflicts.length===0&&auth.some((f)=>f.decision==='authorize-checkpoint'&&f.changeId===F1_FINALIZE_CHANGE_ID&&f.ref===os[0])) admitted.add(sha);
  }
  return [...admitted].sort();
}

async function admitStrictDeliveryFinalCandidate(input: ReadFormalFactSnapshotInput, candidate: GitDeliveryFinalBoundaryCandidate, admittedPreFinal: readonly GitBoundaryFact[]): Promise<GitBoundaryFact | undefined> {
  if(!candidate.formalIdentityValid||candidate.parents.length!==1||candidate.ownerAuthorizationTrailer===undefined) return undefined;
  const parent=candidate.parents[0]!;
  const pre=admittedPreFinal.filter((b)=>b.kind==='delivery-start'||b.kind==='change-checkpoint');
  const ancestors:GitBoundaryFact[]=[]; for(const b of pre){ if(await gitIsAncestor(input.repoRoot,b.commitSha,parent)) ancestors.push(b); }
  const maximal:GitBoundaryFact[]=[]; for(const c of ancestors){ let older=false; for(const o of ancestors){ if(c.commitSha!==o.commitSha&&await gitIsAncestor(input.repoRoot,c.commitSha,o.commitSha)){older=true;break;} } if(!older) maximal.push(c); }
  if(maximal.length!==1||maximal[0]!.commitSha!==parent) return undefined;
  const qualifiedBaseRevision=parent;
  const manifestRef=normalizeSeparators(`${input.manifestPathPrefix}/${input.deliveryId}.yaml`);
  const shown=await runCommand('git',['show',`${candidate.commitSha}:${manifestRef}`],{cwd:input.repoRoot}); if(shown.kind!=='exited'||shown.exitCode!==0) return undefined;
  const parsed=parseYaml(shown.stdout); if(!parsed.ok||typeof parsed.value!=='object'||parsed.value===null||Array.isArray(parsed.value)) return undefined;
  const manifest=parsed.value as Record<string,unknown>; const delivery=manifestObject(manifest['delivery']); if(delivery?.['state']!=='completed'||delivery['fullTestStatus']!=='passed') return undefined;
  let finalization:DeliveryFinalizationProjection; try{ finalization=parseDeliveryFinalizationProjection(delivery['finalization']); }catch{return undefined;}
  if(finalization.ownerAuthorizationRef!==candidate.ownerAuthorizationTrailer) return undefined;
  const conflicts:FactConflict[]=[]; const ownerFacts:OwnerDecisionFact[]=[]; readOwnerAuthorizations(input.deliveryId,manifest['ownerDecisions'],manifest['changes'],conflicts,`${candidate.commitSha}:${manifestRef}`,ownerFacts); if(conflicts.length) return undefined;
  const ftObj=manifestObject(manifestObject(manifest['verification'])?.['fullTest']); const result=readFullTestResult(ftObj?.['result'],conflicts,`${candidate.commitSha}:${manifestRef}`); if(!result||result.status!=='passed') return undefined;
  const fullAuth=latestFullTestAuthorizationRef(input.deliveryId,ownerFacts); if(!fullAuth) return undefined;
  const arch=manifestObject(manifest['architecture']); if(!arch||typeof arch['impact']!=='boolean') return undefined;
  let disposition: {kind:'accepted';cycleRef:string;ownerAcceptanceRef:string}|{kind:'not-applicable'};
  if(arch['impact']===true){
    let cycle:CurrentArchitectureCycle, source:AcceptedSystemSource; try{cycle=parseCurrentArchitectureCycle(arch['currentCycle'],input.deliveryId);source=parseAcceptedSystemSource(arch['acceptedSystemSource'],input.deliveryId);}catch{return undefined;}
    if(cycle.acceptance.status!=='accepted'||!acceptedSourceMatchesCycle(source,cycle)||cycle.actualArchitectureRef.repositoryRevision!==qualifiedBaseRevision) return undefined;
    disposition={kind:'accepted',cycleRef:cycle.cycleRef,ownerAcceptanceRef:cycle.acceptance.ownerDecisionRef};
  }else disposition={kind:'not-applicable'};
  const qual=buildDeliveryFinalizationQualification({deliveryId:input.deliveryId,fullTestAuthorizationRef:fullAuth,fullTestResultRef:result.resultRef,qualifiedBaseRevision,architecture:disposition});
  if(qual.qualificationRef!==finalization.qualificationRef) return undefined;
  const owner=ownerFacts.find((f)=>f.ref===finalization.ownerAuthorizationRef&&f.decision==='authorize-delivery-finalize'&&f.finalizationQualificationRef===qual.qualificationRef); if(!owner) return undefined;
  let active:string; try{active=DeliveryManifestDocument.parse(shown.stdout).inverseFinalization();}catch{return undefined;}
  const files=[{path:manifestRef,sha256:createHash('sha256').update(active).digest('hex')}];
  if(arch['impact']===true){const actualRel=`architecture/${input.deliveryId}/json/actual.architecture.json`; const ab=await runCommand('git',['show',`${candidate.commitSha}:${actualRel}`],{cwd:input.repoRoot}); if(ab.kind!=='exited'||ab.exitCode!==0)return undefined; files.push({path:actualRel,sha256:createHash('sha256').update(ab.stdout).digest('hex')});}
  const ref=deliveryFinalCandidateRefFor({deliveryId:input.deliveryId,qualifiedBaseRevision,files}); if(ref!==finalization.candidateRef) return undefined;
  const changed=await runCommand('git',['diff-tree','--no-commit-id','--name-only','-r',candidate.commitSha],{cwd:input.repoRoot}); if(changed.kind!=='exited'||changed.exitCode!==0)return undefined;
  const actualPaths=changed.stdout.split('\n').filter(Boolean).sort(); const expected=files.map((f)=>f.path).sort(); if(JSON.stringify(actualPaths)!==JSON.stringify(expected)) return undefined;
  return {kind:'delivery-final',commitSha:candidate.commitSha,summary:candidate.summary};
}

async function admitStrictCheckpointCandidate(
  input: ReadFormalFactSnapshotInput,
  candidate: GitCheckpointBoundaryCandidate,
): Promise<GitBoundaryFact | undefined> {
  if (
    !candidate.formalIdentityValid ||
    candidate.subjectChangeId === undefined ||
    candidate.ownerAuthorizationTrailer === undefined
  ) return undefined;

  const authorized = await checkpointAuthorizationExistedAtBoundary(input, candidate);
  if (!authorized) return undefined;
  return {
    kind: 'change-checkpoint',
    commitSha: candidate.commitSha,
    summary: candidate.summary,
    changeId: candidate.subjectChangeId,
  };
}

async function checkpointAuthorizationExistedAtBoundary(
  input: ReadFormalFactSnapshotInput,
  candidate: GitCheckpointBoundaryCandidate,
): Promise<boolean> {
  const manifestRef = normalizeSeparators(`${input.manifestPathPrefix}/${input.deliveryId}.yaml`);
  const shown = await runCommand('git', ['show', `${candidate.commitSha}:${manifestRef}`], { cwd: input.repoRoot });
  if (shown.kind !== 'exited' || shown.exitCode !== 0) return false;

  const parsed = parseYaml(shown.stdout);
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    return false;
  }
  const manifest = parsed.value as Record<string, unknown>;
  if (manifest['id'] !== input.deliveryId) return false;

  const conflicts: FactConflict[] = [];
  const pointInTimeFacts: OwnerDecisionFact[] = [];
  const authorizations = readOwnerAuthorizations(
    input.deliveryId,
    manifest['ownerDecisions'],
    manifest['changes'],
    conflicts,
    `${candidate.commitSha}:${manifestRef}`,
    pointInTimeFacts,
  );
  if (conflicts.length > 0) return false;
  return authorizations.some((fact) =>
    fact.decision === 'authorize-checkpoint' &&
    fact.deliveryId === input.deliveryId &&
    fact.changeId === candidate.subjectChangeId &&
    fact.ref === candidate.ownerAuthorizationTrailer
  );
}

async function gitIsAncestor(repoRoot: string, ancestor: string, descendant: string): Promise<boolean> {
  const result = await runCommand('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repoRoot });
  return result.kind === 'exited' && result.exitCode === 0;
}

function completedUncheckpointedChangesForReader(
  changes: readonly ChangeFact[],
  gitBoundaries: readonly GitBoundaryFact[],
): readonly ChangeFact[] {
  const completed = changes.filter((change) => change.required && change.state === 'completed');
  const checkpoints = gitBoundaries.filter((boundary) => boundary.kind === 'change-checkpoint');
  const structured = new Set(checkpoints.flatMap((boundary) => boundary.changeId === undefined ? [] : [boundary.changeId]));
  const legacyCount = checkpoints.filter((boundary) => boundary.changeId === undefined).length;
  const legacyCovered = new Set(
    completed.filter((change) => !structured.has(change.id)).slice(0, legacyCount).map((change) => change.id),
  );
  return completed.filter((change) => !structured.has(change.id) && !legacyCovered.has(change.id));
}

async function readCheckpointArchiveTerminal(
  deliveryRunsDir: string,
  changeId: string,
): Promise<{ readonly fact: ArchiveTerminalFact; readonly conflicts: readonly FactConflict[] }> {
  const changeDir = join(deliveryRunsDir, changeId);
  const conflicts: FactConflict[] = [];
  let entries: string[];
  try {
    entries = await readdir(changeDir);
  } catch {
    return { fact: { changeId, status: 'missing' }, conflicts };
  }

  const archives: Array<{ readonly runId: string; readonly status: RunStatus }> = [];
  for (const runId of entries.filter((entry) => looksLikeRunId(entry) && entry.endsWith('-archive')).sort()) {
    const runDir = join(changeDir, runId);
    if (!(await isDirectory(runDir))) continue;
    let context: ContextFile;
    try {
      context = validateContextFile(JSON.parse(await readFile(join(runDir, 'context.json'), 'utf8')) as unknown);
    } catch (error) {
      conflicts.push({
        dimension: 'archive-terminal-context',
        authority: runDir,
        message: `archive Run context is unreadable for checkpoint projection: ${(error as Error).message}`,
      });
      continue;
    }
    if (context.action !== 'archive' || context.changeId !== changeId) {
      conflicts.push({
        dimension: 'archive-terminal-context',
        authority: runDir,
        message: 'archive-suffixed Run does not carry matching archive Change identity',
      });
      continue;
    }

    let status: RunStatus = 'pending';
    try {
      const raw = await readFile(join(runDir, 'result.json'), 'utf8');
      const result = admitC1RunResultForReader(raw, 'archive', {
        runId: context.runId,
        deliveryId: context.deliveryId,
        changeId: context.changeId,
      });
      status = result.runStatus;
    } catch (error) {
      if (!isErrnoENOENT(error)) {
        conflicts.push({
          dimension: 'archive-terminal-result',
          authority: join(runDir, 'result.json'),
          message: `archive result is unreadable for checkpoint projection: ${(error as Error).message}`,
        });
        continue;
      }
    }
    archives.push({ runId: context.runId, status });
  }

  if (archives.length === 0) return { fact: { changeId, status: 'missing' }, conflicts };
  const pending = archives.filter((archive) => archive.status === 'pending');
  if (pending.length > 1) return { fact: { changeId, status: 'ambiguous' }, conflicts };
  const latest = archives.sort((a, b) => b.runId.localeCompare(a.runId))[0]!;
  return { fact: { changeId, runId: latest.runId, status: latest.status }, conflicts };
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
    ...(contextFile.ownerFactRefs !== undefined && { ownerFactRefs: contextFile.ownerFactRefs }),
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
  operationProjection?: OpenSpecOperationProjection,
): Promise<OpenSpecArtifactFact[]> {
  const artifacts: OpenSpecArtifactFact[] = [];
  for (const change of changes) {
    const integrationActive = await isOpenSpecThinIntegrationActive(input.repoRoot, change.id);
    if (integrationActive && change.state === 'active') {
      const status = operationProjection?.changeId === change.id
        ? operationProjection.status
        : await new OpenSpecCliAdapter({ repoRoot: input.repoRoot }).getChangeStatus(change.id);
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
  runs: readonly RunFact[],
  reviewVerdicts: readonly ReviewVerdictFact[],
  ownerDecisionFacts: readonly OwnerDecisionFact[],
  operationProjection?: OpenSpecOperationProjection,
): Promise<VerificationProjectionResult> {
  if (activeChangeId === undefined) return { conflicts: [] };

  const verificationPath = await resolveActiveOpenSpecOwnedPath(input, activeChangeId, 'verification', operationProjection);
  const authority = normalizeSeparators(verificationPath.slice(input.repoRoot.length + 1));
  let content: string | undefined;
  try { content = await readFile(verificationPath, 'utf-8'); }
  catch { content = undefined; }

  const projection = projectCurrentContractResetLifecycle({ runs, reviewVerdicts, ownerDecisionFacts }, activeChangeId);
  const currentApply = computeLineage(projection.runs, projection.reviewVerdicts, activeChangeId, 'apply').artifact;
  const pendingApply = projection.runs
    .filter((run) => run.changeId === activeChangeId && (run.action === 'apply' || run.action === 'revise-apply') && run.status === 'pending')
    .sort((left, right) => right.runId.localeCompare(left.runId))[0];

  if (pendingApply !== undefined) {
    const pendingDir = join(input.repoRoot, input.runsPathPrefix, input.deliveryId, activeChangeId, pendingApply.runId);
    let pendingSchema: unknown;
    try { pendingSchema = (JSON.parse(await readFile(join(pendingDir, 'context.json'), 'utf8')) as Record<string, unknown>)['schemaVersion']; }
    catch { pendingSchema = undefined; }
    if (pendingSchema === 5) {
      // A current v5 Apply/revise-apply owns the verification publication
      // window from immutable entry until terminal CAS. During that window the
      // canonical Markdown may still be the previous producer, Action-mutated
      // pre-publication bytes, Markdown-only publication, or record+pending.
      // None is current terminal authority yet, so never compare a previous
      // terminal record to successor-window bytes.
      return { conflicts: [] };
    }
  }

  if (content === undefined) return { conflicts: [] };
  const status = parseVerificationStatusMarker(content, authority);
  if ('conflict' in status) return { conflicts: [status.conflict] };

  if (currentApply === null) return { status: status.value, conflicts: [] };
  const producerDir = join(input.repoRoot, input.runsPathPrefix, input.deliveryId, activeChangeId, currentApply.runId);
  let context: ContextFile;
  try { context = validateContextFile(JSON.parse(await readFile(join(producerDir, 'context.json'), 'utf8')) as unknown); }
  catch (error) { return { conflicts: [{ dimension: 'change-verification-selection', authority, message: `current verification producer context unavailable: ${error instanceof Error ? error.message : String(error)}` }] }; }
  if (context.schemaVersion !== 5) return { status: status.value, conflicts: [] };

  let resultRaw: string;
  try { resultRaw = await readFile(join(producerDir, 'result.json'), 'utf8'); }
  catch (error) { return { conflicts: [{ dimension: 'change-verification-selection', authority, message: `current verification producer result unavailable: ${error instanceof Error ? error.message : String(error)}` }] }; }
  let result: ReturnType<typeof admitC1RunResultForReader>;
  try { result = admitC1RunResultForReader(resultRaw, context.action, { runId: context.runId, deliveryId: context.deliveryId, changeId: context.changeId }); }
  catch (error) { return { conflicts: [{ dimension: 'change-verification-selection', authority, message: `current verification producer result invalid: ${error instanceof Error ? error.message : String(error)}` }] }; }
  if (result.runStatus !== 'completed' || result.terminalBinding === undefined || context.semanticInputFingerprint === undefined) {
    return { conflicts: [{ dimension: 'change-verification-selection', authority, message: 'current verification producer lacks completed terminal binding' }] };
  }
  try {
    if ('compactEntryWorkspaceIdentity' in context && context.compactEntryWorkspaceIdentity !== undefined) {
      const binding = result.terminalBinding.currentVerification;
      if (binding === undefined) throw new Error('post-E2 current verification binding missing');
      if (binding.logicalRef !== `openspec/changes/${activeChangeId}/verification.md`) throw new Error('post-E2 current verification logicalRef mismatch');
      const currentFingerprint = createHash('sha256').update(content).digest('hex');
      const selection = /- selectionFingerprint: `([0-9a-f]{64})`/.exec(content)?.[1];
      if (currentFingerprint === binding.versionFingerprint) {
        if (binding.status !== status.value) throw new Error('post-E2 current verification status mismatch');
        if (selection !== binding.selectionFingerprint) throw new Error('post-E2 current verification selection fingerprint mismatch');
        return { status: status.value, conflicts: [] };
      }
      await validateCurrentReverificationChain({
        canonicalVerificationPath: verificationPath,
        currentMarkdown: content,
        originRunId: context.runId,
        originBinding: binding,
      });
      if (selection !== binding.selectionFingerprint) throw new Error('re-verification selection fingerprint differs from producing Apply terminal binding');
      return { status: status.value, conflicts: [] };
    }
    const binding = result.terminalBinding.verificationSelection;
    if (binding === undefined) throw new Error('legacy verification-selection binding missing');
    const record = await validateTerminalVerificationSelectionBinding({ runDir: producerDir, binding, producingRunId: context.runId, producingSemanticInputFingerprint: context.semanticInputFingerprint, logicalDescriptorDigest: result.terminalBinding.logicalDescriptorDigest });
    if (record.verificationMarkdownFingerprint !== createHash('sha256').update(content).digest('hex')) throw new Error('legacy record does not exact-bind verification.md');
    if (record.verificationStatus !== status.value) throw new Error('legacy status differs from selection record');
    return { status: status.value, conflicts: [] };
  } catch (error) {
    return { conflicts: [{ dimension: 'change-verification-selection', authority, message: `current verification producer binding invalid: ${error instanceof Error ? error.message : String(error)}` }] };
  }
}

function parseVerificationStatusMarker(content: string, authority: string): { readonly value: VerificationStatus } | { readonly conflict: FactConflict } {
  const matches = [...content.matchAll(CHANGE_VERIFICATION_MARKER)];
  if (matches.length !== 1) return { conflict: { dimension: 'change-verification-status', authority, message: matches.length === 0 ? 'verification.md exists but has no flowkit-change-verification-status marker' : `verification.md must contain exactly one flowkit-change-verification-status marker (found ${matches.length})` } };
  const raw = matches[0]?.[1];
  if (raw === undefined || !VALID_VERIFICATION_STATUSES.has(raw)) return { conflict: { dimension: 'change-verification-status', authority, message: `verification.md contains invalid flowkit-change-verification-status value: ${String(raw)}` } };
  return { value: raw as VerificationStatus };
}

interface TasksCompletionProjectionResult {
  readonly complete?: boolean;
  readonly conflicts: readonly FactConflict[];
}

const REQUIRED_TASK_LINE = /^\s*-\s+\[([ xX])\]/gm;

async function readActiveChangeTasksCompletion(
  input: ReadFormalFactSnapshotInput,
  activeChangeId: string | undefined,
  operationProjection?: OpenSpecOperationProjection,
): Promise<TasksCompletionProjectionResult> {
  if (activeChangeId === undefined) {
    return { conflicts: [] };
  }

  const tasksPath = await resolveActiveOpenSpecOwnedPath(input, activeChangeId, 'tasks', operationProjection);
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
  operationProjection?: OpenSpecOperationProjection,
): Promise<string> {
  if (!(await isOpenSpecThinIntegrationActive(input.repoRoot, changeId))) {
    return join(input.repoRoot, input.openspecChangesPath, changeId, `${kind}.md`);
  }
  const status = operationProjection?.changeId === changeId ? operationProjection.status : await new OpenSpecCliAdapter({ repoRoot: input.repoRoot }).getChangeStatus(changeId);
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
