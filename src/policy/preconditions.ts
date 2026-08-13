/**
 * D1 policy-engine: Action precondition matrix for the ten Change-only Standard Actions.
 *
 * Each formal Action has semantic preconditions evaluated against the
 * `FormalFactSnapshot`. `evaluatePreconditions(snapshot, action)` returns the
 * list of unmet preconditions (empty ⇒ allowed, assuming no conflicts).
 *
 * Key rules:
 *   - D1-7 + E1: Verification-gated actions consume the current active Change
 *     `changeVerificationStatus`; missing facts remain fail-closed. Policy MUST
 *     NOT infer Verification from Run history / OpenSpec artifact existence / chat.
 *   - D1-11 + E1 Owner reset: `archive` consumes `changeTasksComplete`; missing
 *     facts map to `tasks-facts-unavailable`, while a present false value maps
 *     to `tasks-incomplete`. Completion is never inferred from other authorities.
 *   - D1-10: `canRun(review-S)` is `allowed:false` when lineage match +
 *     changes-requested (`matching-changes-requested-requires-revision`); the
 *     only legal action then is `revise-S`.
 *   - D1-13: `full-test` requires `deliveryFullTestStatus = authorized`;
 *     `awaiting-user-decision`/`not-ready`/`undefined` → `full-test-not-authorized`,
 *     `failed` → `full-test-already-failed`, `passed` → `full-test-already-passed`.
 *   - D1-12: `delivery-finalize` requires `deliveryFullTestStatus = passed`;
 *     any non-`passed` value (incl. `undefined`) → `full-test-not-passed`. B1
 *     `FullTestStatus` has no `not-applicable`.
 *
 * All functions are pure — they read the snapshot only and return immutable
 * string arrays.
 */

import type { FormalAction } from '../domain/actions.js';
import type {
  ChangeFact,
  FormalFactSnapshot,
  RunFact,
} from '../facts/formal-fact-snapshot.js';
import { computeLineage } from './lineage.js';
import { type Stage } from './stage-detector.js';
import { projectCurrentContractResetLifecycle } from '../facts/generation-resolver.js';
import { hasOwnerAuthorization } from './owner-decision.js';
import {
  evaluateVerificationGate,
  verificationGateUnmet,
} from './verification-gate.js';

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

/**
 * Return the active Change (state=active), or `null`. When multiple Changes
 * are active the first is returned; `next` treats multiplicity as ambiguous.
 */
export function getActiveChange(
  snapshot: FormalFactSnapshot,
): ChangeFact | null {
  for (const c of snapshot.changes) {
    if (c.state === 'active') {
      return c;
    }
  }
  return null;
}

/**
 * Return the count of active Changes (used by `next` for ambiguity detection).
 */
export function countActiveChanges(snapshot: FormalFactSnapshot): number {
  return snapshot.changes.filter((c) => c.state === 'active').length;
}

/**
 * Return the required Changes.
 */
export function getRequiredChanges(
  snapshot: FormalFactSnapshot,
): readonly ChangeFact[] {
  return snapshot.changes.filter((c) => c.required);
}

/**
 * Returns `true` when every required Change has state `completed`.
 */
export function allRequiredCompleted(snapshot: FormalFactSnapshot): boolean {
  const required = getRequiredChanges(snapshot);
  if (required.length === 0) {
    return false;
  }
  return required.every((c) => c.state === 'completed');
}

/**
 * Return completed required Changes that do not yet have their Change
 * Checkpoint Git boundary.
 *
 * Archive closes the Change first. Checkpoint is the following Git/Flowkit
 * boundary, so this fact is recovered from Manifest Change state + Git
 * checkpoint identity, never by replaying the closed Change's Run corpus.
 */
export function getCompletedUncheckpointedChanges(
  snapshot: FormalFactSnapshot,
): readonly ChangeFact[] {
  const completed = getRequiredChanges(snapshot).filter(
    (c) => c.state === 'completed',
  );
  const checkpoints = snapshot.gitBoundaries.filter(
    (b) => b.kind === 'change-checkpoint',
  );
  const checkpointedChangeIds = new Set(
    checkpoints
      .filter((b) => b.changeId !== undefined)
      .map((b) => b.changeId as string),
  );

  // Legacy checkpoints carry no changeId. Keep their bounded count-based
  // compatibility even after newer structured boundaries appear: apply the
  // legacy count to the earliest completed Changes not already identified by
  // a structured boundary. This prevents a previously checkpointed legacy
  // Change from becoming pending again merely because a new structured
  // checkpoint was added later.
  const legacyCheckpointCount = checkpoints.filter(
    (b) => b.changeId === undefined,
  ).length;
  const legacyCheckpointedChangeIds = new Set(
    completed
      .filter((change) => !checkpointedChangeIds.has(change.id))
      .slice(0, legacyCheckpointCount)
      .map((change) => change.id),
  );

  return completed.filter(
    (change) =>
      !checkpointedChangeIds.has(change.id) &&
      !legacyCheckpointedChangeIds.has(change.id),
  );
}

/**
 * Returns `true` when every required Change is both closed (`completed`) and
 * represented by a Change Checkpoint Git boundary.
 */
export function allRequiredCheckpointed(snapshot: FormalFactSnapshot): boolean {
  const required = getRequiredChanges(snapshot);
  if (required.length === 0 || !required.every((c) => c.state === 'completed')) {
    return false;
  }
  return getCompletedUncheckpointedChanges(snapshot).length === 0;
}

/**
 * Returns `true` when the active Change Tasks completion fact is available.
 *
 * E1 owner contract reset projects this fact from the current active Change
 * canonical `tasks.md`. Undefined remains fail-closed and maps to
 * `tasks-facts-unavailable`.
 */
export function isTasksFactAvailable(
  snapshot: FormalFactSnapshot,
): boolean {
  return snapshot.changeTasksComplete !== undefined;
}

/**
 * Returns `true` only when the active Change Tasks fact is available and every
 * required task is complete.
 */
export function areTasksComplete(
  snapshot: FormalFactSnapshot,
): boolean {
  return snapshot.changeTasksComplete === true;
}

/**
 * Returns `true` when a pending (non-terminal) Run of `action` exists for the
 * Change.
 */
function hasPendingRun(
  runs: readonly RunFact[],
  changeId: string,
  action: FormalAction,
): boolean {
  return runs.some(
    (r) =>
      r.changeId === changeId &&
      r.action === action &&
      r.status === 'pending',
  );
}

/**
 * Returns `true` when a completed Run of `action` exists for the Change.
 */
function hasCompletedRun(
  runs: readonly RunFact[],
  changeId: string,
  action: FormalAction,
): boolean {
  return runs.some(
    (r) =>
      r.changeId === changeId &&
      r.action === action &&
      r.status === 'completed',
  );
}


function lineageForStage(
  snapshot: FormalFactSnapshot,
  changeId: string,
  stage: Stage,
): ReturnType<typeof computeLineage> {
  const current = projectCurrentContractResetLifecycle(snapshot, changeId);
  return computeLineage(current.runs, current.reviewVerdicts, changeId, stage);
}

function completedRunForCurrentStage(
  snapshot: FormalFactSnapshot,
  changeId: string,
  action: FormalAction,
): boolean {
  const current = projectCurrentContractResetLifecycle(snapshot, changeId);
  return hasCompletedRun(current.runs, changeId, action);
}

// ---------------------------------------------------------------------------
// Change-level action preconditions
// ---------------------------------------------------------------------------

/**
 * `explore`: Change state=active; explore stage Current Artifact Run=null;
 * no pending explore Run.
 */
function explorePreconditions(snapshot: FormalFactSnapshot): readonly string[] {
  const unmet: string[] = [];
  const change = getActiveChange(snapshot);
  if (change === null) {
    unmet.push('no-active-change');
    return unmet;
  }
  const lineage = lineageForStage(snapshot, change.id, 'explore');
  if (lineage.artifact !== null) {
    unmet.push('explore-already-run');
  }
  if (hasPendingRun(snapshot.runs, change.id, 'explore')) {
    unmet.push('pending-explore-run');
  }
  return unmet;
}

/**
 * `review-S` precondition core (D1-10): allowed iff Current Artifact Run ≠ null
 * AND (Current Review=null OR no lineage match) AND NOT (match +
 * changes-requested).
 *
 * `stage` is the stage being reviewed.
 */
function reviewSPreconditions(
  snapshot: FormalFactSnapshot,
  stage: Stage,
): readonly string[] {
  const unmet: string[] = [];
  const change = getActiveChange(snapshot);
  if (change === null) {
    unmet.push('no-active-change');
    return unmet;
  }
  const lineage = lineageForStage(snapshot, change.id, stage);
  if (lineage.artifact === null) {
    unmet.push(`${stage}-no-artifact`);
    return unmet;
  }
  if (lineage.match) {
    if (lineage.verdict === 'changes-requested') {
      const authorities = lineage.review?.blockingAuthorities ?? [];
      // Author-only blockers require an Author revision before another review.
      // Any non-author blocker keeps explicit same-stage re-review legal;
      // whether it is worth executing now is not a Policy prerequisite.
      if (authorities.length === 0 || authorities.every((authority) => authority === 'author')) {
        unmet.push(authorities.length === 0 ? 'blocking-authority-unavailable' : 'matching-author-only-changes-requested-requires-revision');
      }
    } else if (lineage.verdict === 'approved') {
      // match + approved → stage complete, no further review needed.
      unmet.push('matching-approved-stage-complete');
    }
  }
  // D1-7, D1-RA-002, D1-RA-003: review-apply requires Change Verification
  // facts available AND satisfied (passed or not-applicable). The gate is
  // status-aware and fail-closed, shared with `next` via
  // `evaluateVerificationGate`. In D1 the C1 snapshot carries no Verification
  // status, so the gate returns `unavailable` → unmet
  // `verification-facts-unavailable`. A future `failed`/`not-run` status maps
  // to its distinct unmet reason; a future `passed`/`not-applicable` status
  // satisfies the gate (frozen verification-model.md Section 3.3).
  if (stage === 'apply') {
    const vUnmet = verificationGateUnmet(evaluateVerificationGate(snapshot));
    if (vUnmet !== null) {
      unmet.push(vUnmet);
    }
  }
  return unmet;
}

/**
 * `revise-S` precondition: Current Review ≠ null; lineage match; Current
 * Verdict=changes-requested.
 */
function reviseSPreconditions(
  snapshot: FormalFactSnapshot,
  stage: Stage,
): readonly string[] {
  const unmet: string[] = [];
  const change = getActiveChange(snapshot);
  if (change === null) {
    unmet.push('no-active-change');
    return unmet;
  }
  const lineage = lineageForStage(snapshot, change.id, stage);
  if (lineage.review === null) {
    unmet.push('no-current-review');
  }
  if (!lineage.match) {
    unmet.push('no-lineage-match');
  }
  if (lineage.verdict !== 'changes-requested') {
    unmet.push('verdict-not-changes-requested');
  } else {
    const authorities = lineage.review?.blockingAuthorities ?? [];
    if (authorities.length === 0) {
      unmet.push('blocking-authority-unavailable');
    } else if (authorities.some((authority) => authority !== 'author')) {
      unmet.push('non-author-review-blocker');
    }
  }
  return unmet;
}

/**
 * `propose`: explore stage lineage match+approved; propose stage Current
 * Artifact Run=null.
 */
function proposePreconditions(snapshot: FormalFactSnapshot): readonly string[] {
  const unmet: string[] = [];
  const change = getActiveChange(snapshot);
  if (change === null) {
    unmet.push('no-active-change');
    return unmet;
  }
  const exploreLineage = lineageForStage(snapshot, change.id, 'explore');
  if (!(exploreLineage.match && exploreLineage.verdict === 'approved')) {
    unmet.push('explore-not-approved');
  }
  const proposeLineage = lineageForStage(snapshot, change.id, 'propose');
  if (proposeLineage.artifact !== null) {
    unmet.push('propose-already-run');
  }
  return unmet;
}

/**
 * `apply`: propose stage lineage match+approved; ownerAuthorizations 含 apply
 * scope; no completed apply Run.
 */
function applyPreconditions(snapshot: FormalFactSnapshot): readonly string[] {
  const unmet: string[] = [];
  const change = getActiveChange(snapshot);
  if (change === null) {
    unmet.push('no-active-change');
    return unmet;
  }
  const proposeLineage = lineageForStage(snapshot, change.id, 'propose');
  if (!(proposeLineage.match && proposeLineage.verdict === 'approved')) {
    unmet.push('propose-not-approved');
  }
  if (!hasOwnerAuthorization(snapshot.ownerAuthorizations, 'authorize-apply', snapshot.deliveryId, change.id)) {
    unmet.push('apply-not-authorized');
  }
  if (completedRunForCurrentStage(snapshot, change.id, 'apply')) {
    unmet.push('apply-already-completed');
  }
  return unmet;
}

/**
 * `archive`: apply stage lineage match+approved; blocking findings=0 (implied
 * by approved verdict); Verification facts available AND satisfied (passed or
 * not-applicable); Tasks facts available AND all completed; ownerAuthorizations
 * 含 archive scope.
 */
function archivePreconditions(snapshot: FormalFactSnapshot): readonly string[] {
  const unmet: string[] = [];
  const change = getActiveChange(snapshot);
  if (change === null) {
    unmet.push('no-active-change');
    return unmet;
  }
  const applyLineage = lineageForStage(snapshot, change.id, 'apply');
  // match + approved ⇒ blocking findings = 0 (an approved verdict carries no
  // blocking findings). Without match+approved, archive cannot proceed.
  if (!(applyLineage.match && applyLineage.verdict === 'approved')) {
    unmet.push('apply-not-approved');
  }
  // D1-7, D1-RA-002, D1-RA-003: Verification gate (status-aware, fail-closed,
  // shared with `next`). Only `satisfied` (passed or not-applicable) satisfies;
  // `unavailable` → unmet `verification-facts-unavailable`; `failed`/`not-run`
  // → distinct unmet.
  const vUnmet = verificationGateUnmet(evaluateVerificationGate(snapshot));
  if (vUnmet !== null) {
    unmet.push(vUnmet);
  }
  // D1-11 + E1 owner contract reset: archive requires a canonical Tasks
  // completion fact and every required task completed.
  if (!isTasksFactAvailable(snapshot)) {
    unmet.push('tasks-facts-unavailable');
  } else if (!areTasksComplete(snapshot)) {
    unmet.push('tasks-incomplete');
  }
  if (!hasOwnerAuthorization(snapshot.ownerAuthorizations, 'authorize-archive', snapshot.deliveryId, change.id)) {
    unmet.push('archive-not-authorized');
  }
  return unmet;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Evaluate the Action-specific preconditions for `action` against `snapshot`.
 *
 * Returns the list of unmet preconditions (empty ⇒ the action's preconditions
 * are satisfied). Conflict and unknown-action checks are handled by `canRun`,
 * not here. Pure: reads `snapshot` only.
 */
export function evaluatePreconditions(
  snapshot: FormalFactSnapshot,
  action: FormalAction,
): readonly string[] {
  switch (action) {
    case 'explore':
      return explorePreconditions(snapshot);
    case 'review-explore':
      return reviewSPreconditions(snapshot, 'explore');
    case 'revise-explore':
      return reviseSPreconditions(snapshot, 'explore');
    case 'propose':
      return proposePreconditions(snapshot);
    case 'review-propose':
      return reviewSPreconditions(snapshot, 'propose');
    case 'revise-propose':
      return reviseSPreconditions(snapshot, 'propose');
    case 'apply':
      return applyPreconditions(snapshot);
    case 'review-apply':
      return reviewSPreconditions(snapshot, 'apply');
    case 'revise-apply':
      return reviseSPreconditions(snapshot, 'apply');
    case 'archive':
      return archivePreconditions(snapshot);
  }
}
