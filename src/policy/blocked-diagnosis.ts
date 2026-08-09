/**
 * D1 policy-engine: blocked diagnosis construction (D1-9, task 8.2).
 *
 * Pure constructor helpers that build `BlockedDiagnosis` objects for each
 * `BlockedReason`. `diagnose(snapshot)` (see `diagnose.ts`) delegates here.
 *
 * `suggestedOwnerActions` is populated only for blocks that an owner action
 * can relieve — most notably `full-test-failed`, where the owner may authorize
 * a corrective Change or cancel the Delivery (frozen `verification-model.md`
 * Section 6; D1-13). Policy MUST NOT auto-create the corrective Change.
 */

import type { FactConflict } from '../facts/formal-fact-snapshot.js';
import type { BlockedDiagnosis, BlockedReason } from './types.js';

// ---------------------------------------------------------------------------
// Suggested owner actions for full-test-failed (frozen Section 6)
// ---------------------------------------------------------------------------

/**
 * The owner's legal choices when `deliveryFullTestStatus = failed` (D1-13,
 * frozen `verification-model.md` Section 6).
 *
 * Policy MUST NOT auto-create a corrective Change or auto-retry `full-test`;
 * it only lists the choices for the owner.
 */
export const FULL_TEST_FAILED_OWNER_ACTIONS: readonly string[] = [
  'authorize-corrective-change',
  'cancel-delivery',
];

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/**
 * Build a `BlockedDiagnosis` with the given reason, unmet preconditions and
 * conflicts. `suggestedOwnerActions` defaults to empty.
 */
export function blockedDiagnosis(
  reason: BlockedReason,
  unmetPreconditions: readonly string[] = [],
  conflicts: readonly FactConflict[] = [],
  suggestedOwnerActions: readonly string[] = [],
): BlockedDiagnosis {
  return { reason, unmetPreconditions, conflicts, suggestedOwnerActions };
}

/**
 * Diagnosis for `formal-fact-conflict` (non-empty `snapshot.conflicts`).
 */
export function conflictDiagnosis(
  conflicts: readonly FactConflict[],
  conflictDimensions: readonly string[],
): BlockedDiagnosis {
  return blockedDiagnosis(
    'formal-fact-conflict',
    conflictDimensions,
    conflicts,
  );
}

/**
 * Diagnosis for `no-active-delivery`.
 */
export function noActiveDeliveryDiagnosis(): BlockedDiagnosis {
  return blockedDiagnosis('no-active-delivery');
}

/**
 * Diagnosis for `no-actionable-change`.
 */
export function noActionableChangeDiagnosis(): BlockedDiagnosis {
  return blockedDiagnosis('no-actionable-change');
}

/**
 * Diagnosis for `verification-facts-unavailable` — the snapshot carries no
 * Change Verification status field (D1 current state; D1-7).
 */
export function verificationFactsUnavailableDiagnosis(): BlockedDiagnosis {
  return blockedDiagnosis('verification-facts-unavailable', [
    'verification-facts-unavailable',
  ]);
}

/**
 * Diagnosis for `verification-failed` — Verification facts are available but
 * the result is `failed`. Distinct from `verification-facts-unavailable`
 * (facts missing) and `verification-not-run` (facts present, not run).
 * (D1-RA-002; reachable only after a future change extends the snapshot.)
 */
export function verificationFailedDiagnosis(): BlockedDiagnosis {
  return blockedDiagnosis('verification-failed', ['verification-failed']);
}

/**
 * Diagnosis for `verification-not-run` — Verification facts are available but
 * the result is `not-run`. Distinct from `verification-facts-unavailable`
 * (facts missing) and `verification-failed` (result failed). `not-applicable`
 * does NOT map here — it satisfies the gate (D1-RA-003; frozen
 * verification-model.md Section 3.3 permits `passed | not-applicable` before
 * review-apply/archive).
 * (D1-RA-002; reachable only after a future change extends the snapshot.)
 */
export function verificationNotRunDiagnosis(): BlockedDiagnosis {
  return blockedDiagnosis('verification-not-run', ['verification-not-run']);
}

/**
 * Diagnosis for `tasks-facts-unavailable`.
 */
export function tasksFactsUnavailableDiagnosis(): BlockedDiagnosis {
  return blockedDiagnosis('tasks-facts-unavailable', [
    'tasks-facts-unavailable',
  ]);
}

export function tasksIncompleteDiagnosis(): BlockedDiagnosis {
  return blockedDiagnosis('tasks-incomplete', ['tasks-incomplete']);
}

/**
 * Diagnosis for `ambiguous-state`.
 */
export function ambiguousStateDiagnosis(
  detail?: string,
): BlockedDiagnosis {
  return blockedDiagnosis(
    'ambiguous-state',
    detail === undefined ? [] : [detail],
  );
}

/**
 * Diagnosis for `dependency-incomplete`.
 */
export function dependencyIncompleteDiagnosis(
  unmetChangeKeys: readonly string[],
): BlockedDiagnosis {
  return blockedDiagnosis(
    'dependency-incomplete',
    unmetChangeKeys.map((k) => `dependency-incomplete:${k}`),
  );
}

/**
 * Diagnosis for `full-test-failed` (frozen Section 6). Lists the owner's legal
 * choices; Policy MUST NOT auto-create a corrective Change or auto-retry.
 */
export function fullTestFailedDiagnosis(): BlockedDiagnosis {
  return blockedDiagnosis(
    'full-test-failed',
    ['full-test-already-failed'],
    [],
    FULL_TEST_FAILED_OWNER_ACTIONS,
  );
}
