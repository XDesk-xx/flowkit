/**
 * D1 policy-engine: `next(snapshot)` decision tree.
 *
 * `next` computes the unique legal next step from the `FormalFactSnapshot`,
 * returning a `PolicyResult`:
 *   - `{ kind: 'action', action }` — the single legal formal Action
 *   - `{ kind: 'owner-decision', decision, context }` — owner must authorize
 *   - `{ kind: 'blocked', diagnosis }` — no unique action (D1-9)
 *
 * Decision order:
 *   1. conflicts non-empty → blocked `formal-fact-conflict` (D1-3, overrides all)
 *   2. no active Delivery → blocked `no-active-delivery`
 *   3. multiple active Changes → blocked `ambiguous-state`
 *   4. active Change exists → retry failed/cancelled Run (6.11), else stage tree
 *   5. no active Change → Delivery-level Full Test / finalize path, or
 *      activate-change / dependency-incomplete / no-actionable-change
 *
 * Pure: reads `snapshot` only, never persists `currentAction` (D1-2).
 */

import type { FormalAction } from '../domain/actions.js';
import type {
  ChangeFact,
  FormalFactSnapshot,
  RunFact,
} from '../facts/formal-fact-snapshot.js';
import {
  type PolicyResult,
  actionResult,
  ownerDecisionResult,
  deliveryBehaviorResult,
  blockedResult,
} from './types.js';
import { computeLineage } from './lineage.js';
import { detectCurrentStage } from './stage-detector.js';
import { projectCurrentContractResetLifecycle } from '../facts/generation-resolver.js';
import {
  allRequiredCompleted,
  countActiveChanges,
  getActiveChange,
  getCompletedUncheckpointedChanges,
  getRequiredChanges,
  isTasksFactAvailable,
  areTasksComplete,
} from './preconditions.js';
import { hasOwnerAuthorization } from './owner-decision.js';
import {
  evaluateVerificationGate,
  verificationGateDiagnosis,
} from './verification-gate.js';
import {
  ambiguousStateDiagnosis,
  conflictDiagnosis,
  dependencyIncompleteDiagnosis,
  fullTestFailedDiagnosis,
  fullTestExecutionOutcomeUnknownDiagnosis,
  nonAuthorReviewBlockerDiagnosis,
  deliveryBehaviorNotImplementedDiagnosis,
  noActionableChangeDiagnosis,
  noActiveDeliveryDiagnosis,
  tasksFactsUnavailableDiagnosis,
  tasksIncompleteDiagnosis,
  archiveTerminalRecoveryRequiredDiagnosis,
} from './blocked-diagnosis.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the latest Run (newest by Run ID) for `changeId`, regardless of
 * status. Returns `null` when the Change has no Run.
 */
function latestRunForChange(
  runs: readonly RunFact[],
  changeId: string,
): RunFact | null {
  let latest: RunFact | null = null;
  for (const r of runs) {
    if (r.changeId !== changeId) {
      continue;
    }
    if (latest === null || r.runId > latest.runId) {
      latest = r;
    }
  }
  return latest;
}

/**
 * Returns `true` when every dependency id of `change` has a completed Change
 * in `snapshot`.
 */
function dependenciesMet(
  change: ChangeFact,
  snapshot: FormalFactSnapshot,
): boolean {
  if (change.dependsOn.length === 0) {
    return true;
  }
  return change.dependsOn.every((depId) =>
    snapshot.changes.some((c) => c.id === depId && c.state === 'completed'),
  );
}

/**
 * Return the planned required Changes whose dependencies are all completed.
 */
function eligibleChangesToActivate(
  snapshot: FormalFactSnapshot,
): readonly ChangeFact[] {
  return getRequiredChanges(snapshot).filter(
    (c) => c.state === 'planned' && dependenciesMet(c, snapshot),
  );
}

// ---------------------------------------------------------------------------
// Active-Change branch: stage-based decision tree
// ---------------------------------------------------------------------------

/**
 * Decide the next step within an active Change using the lineage model.
 */
function decideActiveChange(
  snapshot: FormalFactSnapshot,
  change: ChangeFact,
): PolicyResult {
  const current = projectCurrentContractResetLifecycle(snapshot, change.id);
  const currentRuns = current.runs;
  const currentVerdicts = current.reviewVerdicts;
  // 6.11: retry the latest failed/cancelled Run (scope persists; owner need
  // not re-authorize). Lineage agrees because failed/cancelled Runs are not
  // "completed" and thus do not become Current Artifact/Review.
  const latest = latestRunForChange(currentRuns, change.id);
  if (latest !== null && (latest.status === 'failed' || latest.status === 'cancelled')) {
    return actionResult(latest.action);
  }

  const stage = detectCurrentStage(snapshot, change.id);
  const lineage = computeLineage(
    currentRuns,
    currentVerdicts,
    change.id,
    stage,
  );

  switch (stage) {
    case 'explore':
      return decideExploreStage(snapshot, change, lineage);
    case 'propose':
      return decideProposeStage(snapshot, change, lineage);
    case 'apply':
      return decideApplyStage(snapshot, change, lineage);
    case 'archive':
      // OpenSpec archive success closes the Change. Seeing a completed archive
      // Run while the Manifest still says active is therefore an inconsistent
      // intermediate snapshot, not the Checkpoint state. Checkpoint is decided
      // only after the Change is completed and no longer active.
      return blockedResult(
        ambiguousStateDiagnosis(
          `archive completed for ${change.key} but Change is still active; archive success must close the Change before Checkpoint`,
        ),
      );
  }
}

function decideChangesRequested(
  stage: 'explore' | 'propose' | 'apply',
  lineage: ReturnType<typeof computeLineage>,
): PolicyResult {
  const authorities = lineage.review?.blockingAuthorities ?? [];
  if (authorities.length === 0) {
    return blockedResult(ambiguousStateDiagnosis(`changes-requested ${stage} review has no blocking authority projection`));
  }
  if (authorities.every((authority) => authority === 'author')) {
    const revise: Record<typeof stage, FormalAction> = {
      explore: 'revise-explore',
      propose: 'revise-propose',
      apply: 'revise-apply',
    };
    return actionResult(revise[stage]);
  }
  return blockedResult(nonAuthorReviewBlockerDiagnosis(authorities));
}

/**
 * explore stage: null artifact → explore; no match → review-explore;
 * match+approved → propose; match+cr → revise-explore.
 */
function decideExploreStage(
  _snapshot: FormalFactSnapshot,
  _change: ChangeFact,
  lineage: ReturnType<typeof computeLineage>,
): PolicyResult {
  if (lineage.artifact === null) {
    return actionResult('explore');
  }
  if (!lineage.match) {
    return actionResult('review-explore');
  }
  if (lineage.verdict === 'approved') {
    return actionResult('propose');
  }
  return decideChangesRequested('explore', lineage);
}

/**
 * propose stage: null artifact → propose; no match → review-propose;
 * match+approved → authorize-apply (or action: apply when scope present);
 * match+cr → revise-propose.
 */
function decideProposeStage(
  snapshot: FormalFactSnapshot,
  _change: ChangeFact,
  lineage: ReturnType<typeof computeLineage>,
): PolicyResult {
  if (lineage.artifact === null) {
    return actionResult('propose');
  }
  if (!lineage.match) {
    return actionResult('review-propose');
  }
  if (lineage.verdict === 'approved') {
    if (hasOwnerAuthorization(snapshot.ownerAuthorizations, 'authorize-apply', snapshot.deliveryId, _change.id)) {
      return actionResult('apply');
    }
    return ownerDecisionResult('authorize-apply', {
      detail: 'review-propose approved; apply awaits owner authorization',
    });
  }
  return decideChangesRequested('propose', lineage);
}

/**
 * apply stage: null artifact → apply; no match → review-apply;
 * match+approved → verification gate (blocked when facts unavailable;
 * authorize-archive or action: archive when satisfied); match+cr → revise-apply.
 */
function decideApplyStage(
  snapshot: FormalFactSnapshot,
  _change: ChangeFact,
  lineage: ReturnType<typeof computeLineage>,
): PolicyResult {
  if (lineage.artifact === null) {
    return actionResult('apply');
  }
  if (!lineage.match) {
    // D1-7, D1-RA-002, D1-RA-003: review-apply requires Change Verification
    // facts available AND satisfied (passed or not-applicable). The gate is
    // status-aware and fail-closed, shared with canRun(review-apply) via
    // `evaluateVerificationGate`, so `next` and `canRun` enforce the same
    // boundary. In D1 the C1 snapshot carries no Verification status → gate
    // `unavailable` → blocked `verification-facts-unavailable`. A future
    // `failed`/`not-run` status maps to its distinct blocked reason; a future
    // `passed`/`not-applicable` status satisfies the gate (frozen
    // verification-model.md Section 3.3). The gate is NOT hoisted above the
    // revise-apply branch because canRun(revise-apply) requires no
    // Verification facts.
    const vGate = evaluateVerificationGate(snapshot);
    if (vGate.kind !== 'satisfied') {
      return blockedResult(verificationGateDiagnosis(vGate));
    }
    return actionResult('review-apply');
  }
  if (lineage.verdict === 'changes-requested') {
    return decideChangesRequested('apply', lineage);
  }
  // verdict === 'approved' → verification gate (D1-7, D1-RA-002, D1-RA-003).
  // Status-aware and fail-closed, shared with canRun(archive) via
  // `evaluateVerificationGate`. In D1 → gate `unavailable` → blocked
  // `verification-facts-unavailable`.
  const vGate = evaluateVerificationGate(snapshot);
  if (vGate.kind !== 'satisfied') {
    return blockedResult(verificationGateDiagnosis(vGate));
  }
  // D1-11 + E1 owner contract reset: archive consumes the minimal Tasks
  // completion fact projected from the active Change canonical tasks.md.
  if (!isTasksFactAvailable(snapshot)) {
    return blockedResult(tasksFactsUnavailableDiagnosis());
  }
  if (!areTasksComplete(snapshot)) {
    return blockedResult(tasksIncompleteDiagnosis());
  }
  // Verification satisfied + all required Tasks completed → archive owner
  // authorization boundary.
  if (hasOwnerAuthorization(snapshot.ownerAuthorizations, 'authorize-archive', snapshot.deliveryId, _change.id)) {
    return actionResult('archive');
  }
  return ownerDecisionResult('authorize-archive', {
    detail: 'review-apply approved and Verification satisfied; archive awaits owner authorization',
  });
}

// ---------------------------------------------------------------------------
// No-active-Change branch: Delivery-level Full Test / finalize path
// ---------------------------------------------------------------------------

/**
 * Decide the next step when no Change is active.
 *
 * When all required Changes are completed, the Delivery moves through the Full
 * Test lifecycle (`awaiting-user-decision` → `authorized` → `passed`/`failed`)
 * and finally `delivery-finalize`. Otherwise the owner must activate the next
 * eligible Change.
 */
function decideNoActiveChange(snapshot: FormalFactSnapshot): PolicyResult {
  // OpenSpec archive success closes the Change. The next Flowkit/Git boundary
  // is Checkpoint, recovered from Manifest completed state + Git boundary facts
  // without re-projecting the closed Change's historical Runs.
  const checkpointPending = getCompletedUncheckpointedChanges(snapshot);
  if (checkpointPending.length === 1) {
    const change = checkpointPending[0]!;
    const archiveTerminal = snapshot.checkpointArchiveTerminal;
    if (
      archiveTerminal === undefined
      || archiveTerminal.changeId !== change.id
      || archiveTerminal.status !== 'completed'
    ) {
      return blockedResult(archiveTerminalRecoveryRequiredDiagnosis(
        change.id,
        archiveTerminal?.status ?? 'missing',
        archiveTerminal?.runId,
      ));
    }
    return ownerDecisionResult('authorize-checkpoint', {
      changeKey: change.key,
      detail: 'Change is closed by OpenSpec archive and its archive Run is terminal; Change Checkpoint Git boundary awaits owner authorization',
    });
  }
  if (checkpointPending.length > 1) {
    return blockedResult(
      ambiguousStateDiagnosis(
        `multiple completed Changes await Checkpoint: ${checkpointPending.map((c) => c.key).join(', ')}`,
      ),
    );
  }

  if (allRequiredCompleted(snapshot)) {
    return decideFullTestLifecycle(snapshot);
  }
  return decideNextChangeActivation(snapshot);
}

/**
 * Delivery-level Full Test / finalize decision based on
 * `deliveryFullTestStatus` (D1-12, D1-13).
 */
function decideFullTestLifecycle(snapshot: FormalFactSnapshot): PolicyResult {
  const status = snapshot.deliveryFullTestStatus;
  switch (status) {
    case 'failed':
      // D1-13 / frozen Section 6: keep failed; owner chooses corrective Change
      // or cancel. Policy MUST NOT auto-retry or auto-create corrective Change.
      return blockedResult(fullTestFailedDiagnosis());

    case 'passed':
      if (hasOwnerAuthorization(snapshot.ownerAuthorizations, 'authorize-delivery-finalize', snapshot.deliveryId)) {
        return blockedResult(deliveryBehaviorNotImplementedDiagnosis('delivery-finalize'));
      }
      return ownerDecisionResult('authorize-delivery-finalize', {
        deliveryFullTestStatus: status,
        detail: 'Full Test passed; Delivery Finalize awaits owner authorization',
      });

    case 'authorized':
      if (snapshot.deliveryFullTestExecution === undefined) {
        return blockedResult(deliveryBehaviorNotImplementedDiagnosis('full-test'));
      }
      if (snapshot.deliveryFullTestExecutionBlock?.reason === 'outcome-unknown') {
        return blockedResult(fullTestExecutionOutcomeUnknownDiagnosis());
      }
      if (!hasOwnerAuthorization(snapshot.ownerAuthorizations, 'authorize-full-test', snapshot.deliveryId)) {
        return blockedResult(ambiguousStateDiagnosis('authorized Full Test is missing matching delivery-scoped Owner authorization'));
      }
      return deliveryBehaviorResult('full-test', {
        deliveryFullTestStatus: status,
        detail: 'Owner-authorized Delivery Full Test behavior is ready for one explicit execution',
      });

    case 'awaiting-user-decision':
      // Pre-authorization state: owner must authorize full-test (D1-13).
      return ownerDecisionResult('authorize-full-test', {
        deliveryFullTestStatus: status,
        detail: 'all required Changes completed; Full Test awaits owner authorization',
      });

    case 'not-ready':
    case undefined:
      if (snapshot.deliveryFullTestExecution === undefined) {
        return blockedResult(deliveryBehaviorNotImplementedDiagnosis('full-test'));
      }
      return blockedResult(
        ambiguousStateDiagnosis(
          'all required Changes completed but deliveryFullTestStatus has not advanced to awaiting-user-decision',
        ),
      );
  }
}

/**
 * Decide whether to activate the next planned required Change or block.
 */
function decideNextChangeActivation(snapshot: FormalFactSnapshot): PolicyResult {
  const eligible = eligibleChangesToActivate(snapshot);
  if (eligible.length > 0) {
    return ownerDecisionResult('activate-change', {
      eligibleChangeKeys: eligible.map((c) => c.key),
      changeKey: eligible[0]?.key,
      detail: 'planned required Change with satisfied dependencies ready to activate',
    });
  }
  // Planned required Changes exist but dependencies unmet → blocked.
  const plannedRequired = getRequiredChanges(snapshot).filter(
    (c) => c.state === 'planned',
  );
  if (plannedRequired.length > 0) {
    const unmet = plannedRequired
      .filter((c) => !dependenciesMet(c, snapshot))
      .map((c) => c.key);
    return blockedResult(dependencyIncompleteDiagnosis(unmet));
  }
  return blockedResult(noActionableChangeDiagnosis());
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Compute the unique legal next step from `snapshot`.
 *
 * Pure: reads `snapshot` only; never persists `currentAction` (D1-2). The same
 * snapshot always yields the same result.
 */
export function next(snapshot: FormalFactSnapshot): PolicyResult {
  // 6.2: conflicts first (D1-3 fail-closed overrides everything).
  if (snapshot.conflicts.length > 0) {
    return blockedResult(
      conflictDiagnosis(
        snapshot.conflicts,
        snapshot.conflicts.map((c) => c.dimension),
      ),
    );
  }

  // 6.3: no active Delivery.
  if (snapshot.deliveryState !== 'active') {
    return blockedResult(noActiveDeliveryDiagnosis());
  }

  // 6.12: multiple active Changes → ambiguous.
  if (countActiveChanges(snapshot) > 1) {
    return blockedResult(
      ambiguousStateDiagnosis('multiple active Changes'),
    );
  }

  const activeChange = getActiveChange(snapshot);
  if (activeChange !== null) {
    return decideActiveChange(snapshot, activeChange);
  }
  return decideNoActiveChange(snapshot);
}

/**
 * Re-export `FormalAction` type for callers that import from this module.
 */
export type { FormalAction };
