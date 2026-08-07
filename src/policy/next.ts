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
  blockedResult,
} from './types.js';
import { computeLineage } from './lineage.js';
import { detectStage } from './stage-detector.js';
import {
  allRequiredCompleted,
  countActiveChanges,
  getActiveChange,
  getRequiredChanges,
  isTasksFactAvailable,
} from './preconditions.js';
import { hasAuthorizationScope } from './owner-decision.js';
import {
  evaluateVerificationGate,
  verificationGateDiagnosis,
} from './verification-gate.js';
import {
  ambiguousStateDiagnosis,
  conflictDiagnosis,
  dependencyIncompleteDiagnosis,
  fullTestFailedDiagnosis,
  noActionableChangeDiagnosis,
  noActiveDeliveryDiagnosis,
  tasksFactsUnavailableDiagnosis,
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
 * Returns `true` when every dependency key of `change` has a completed Change
 * in `snapshot`.
 */
function dependenciesMet(
  change: ChangeFact,
  snapshot: FormalFactSnapshot,
): boolean {
  if (change.dependsOn.length === 0) {
    return true;
  }
  return change.dependsOn.every((depKey) =>
    snapshot.changes.some((c) => c.key === depKey && c.state === 'completed'),
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
  // 6.11: retry the latest failed/cancelled Run (scope persists; owner need
  // not re-authorize). Lineage agrees because failed/cancelled Runs are not
  // "completed" and thus do not become Current Artifact/Review.
  const latest = latestRunForChange(snapshot.runs, change.id);
  if (latest !== null && (latest.status === 'failed' || latest.status === 'cancelled')) {
    return actionResult(latest.action);
  }

  const stage = detectStage(snapshot.runs, change.id);
  const lineage = computeLineage(
    snapshot.runs,
    snapshot.reviewVerdicts,
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
      // Archive completed → advance to the Change Checkpoint Git boundary
      // (6.10). The checkpoint is a formal Git boundary, not a formal Action,
      // and requires owner authorization.
      return ownerDecisionResult('authorize-checkpoint', {
        changeKey: change.key,
        detail: 'archive stage complete; Change Checkpoint Git boundary awaits owner authorization',
      });
  }
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
  // verdict === 'changes-requested'
  return actionResult('revise-explore');
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
    if (hasAuthorizationScope(snapshot.ownerAuthorizations, 'apply')) {
      return actionResult('apply');
    }
    return ownerDecisionResult('authorize-apply', {
      detail: 'review-propose approved; apply awaits owner authorization',
    });
  }
  // verdict === 'changes-requested'
  return actionResult('revise-propose');
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
    return actionResult('revise-apply');
  }
  // verdict === 'approved' → verification gate (D1-7, D1-RA-002, D1-RA-003).
  // Status-aware and fail-closed, shared with canRun(archive) via
  // `evaluateVerificationGate`. In D1 → gate `unavailable` → blocked
  // `verification-facts-unavailable`.
  const vGate = evaluateVerificationGate(snapshot);
  if (vGate.kind !== 'satisfied') {
    return blockedResult(verificationGateDiagnosis(vGate));
  }
  // D1-11 tasks gate (forward-compatible): when a future change makes
  // Verification facts available and they satisfy the gate, the archive gate
  // additionally requires Tasks completion facts. In D1 this is unreachable
  // because Verification facts are always unavailable (the check above returns
  // first) and `isTasksFactAvailable` is also always `false`. Included so the
  // forward-compatible path returns `blocked: tasks-facts-unavailable` per the
  // spec scenario "Tasks 完成事实不可用时 archive blocked" (D1-11), keeping
  // `tasks-facts-unavailable` strictly distinct from `verification-facts-
  // unavailable` (different fact dimensions).
  if (!isTasksFactAvailable(snapshot)) {
    return blockedResult(tasksFactsUnavailableDiagnosis());
  }
  // Forward-compatible branch: Verification satisfied + Tasks completed →
  // advance to archive authorization. In D1 this is unreachable (facts always
  // unavailable). Verification not-satisfied would block here; that path is
  // also unreachable in D1.
  if (hasAuthorizationScope(snapshot.ownerAuthorizations, 'archive')) {
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
      if (hasAuthorizationScope(snapshot.ownerAuthorizations, 'finalize')) {
        return actionResult('delivery-finalize');
      }
      return ownerDecisionResult('authorize-delivery-finalize', {
        deliveryFullTestStatus: status,
        detail: 'Full Test passed; delivery-finalize awaits owner authorization',
      });

    case 'authorized':
      // owner has authorized; if scope present, run full-test; else defensive
      // owner-decision (D1-13 fail-closed on fact inconsistency).
      if (hasAuthorizationScope(snapshot.ownerAuthorizations, 'full-test')) {
        return actionResult('full-test');
      }
      return ownerDecisionResult('authorize-full-test', {
        deliveryFullTestStatus: status,
        detail: 'deliveryFullTestStatus=authorized but full-test scope absent; defensive fail-closed',
      });

    case 'awaiting-user-decision':
      // Pre-authorization state: owner must authorize full-test (D1-13).
      return ownerDecisionResult('authorize-full-test', {
        deliveryFullTestStatus: status,
        detail: 'all required Changes completed; Full Test awaits owner authorization',
      });

    case 'not-ready':
    case undefined:
      // All required Changes completed but status has not advanced to
      // awaiting-user-decision — inconsistent snapshot. D1 cannot advance the
      // status itself; block as ambiguous.
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
