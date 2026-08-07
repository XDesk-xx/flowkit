/**
 * D1 policy-engine: Change Verification gate (D1-7, D1-RA-002, D1-RA-003).
 *
 * A status-aware, fail-closed gate used consistently by `canRun`
 * (preconditions) and `next` (decision tree). A Change Verification result of
 * `passed` or `not-applicable` SATISFIES the gate for verification-gated
 * actions (`review-apply`, `archive`); every other state blocks with its
 * distinct reason.
 *
 * Frozen contract alignment (D1-RA-003):
 *   - `docs/verification-model.md` Section 3.3: before `review-apply`, every
 *     applicable check MUST be `passed | not-applicable`; `not-run | failed`
 *     blocks.
 *   - `docs/delivery-lifecycle.md` Section 3.4/3.5: `review-apply` bars only
 *     `failed | not-run`; Archive accepts `passed | not-applicable`.
 * `not-applicable` is therefore a SATISFIED result, not a blocked one. The
 * prior implementation (091) fail-closed `not-applicable` to `not-run`, which
 * diverged from the frozen lifecycle and blocked valid Changes; D1-RA-003
 * corrects this by mapping `not-applicable` → `satisfied`.
 *
 * D1 current state: C1 `FormalFactSnapshot` carries no Change Verification
 * status field, so `evaluateVerificationGate` always returns `unavailable`. A
 * future change that extends the snapshot with a verification status field
 * updates ONLY `readChangeVerificationStatus` — the rest of D1 becomes correct
 * automatically. Status MUST NOT be inferred from Run history, OpenSpec
 * artifacts, or chat (D1-7).
 *
 * D1-RA-002 root cause: the prior gate exposed only `isVerificationFactAvailable`
 * (availability), so `canRun`/`next` treated any present Verification field as
 * sufficient — including a future `failed`/`not-run` status — violating the
 * fail-closed contract at the extension boundary. This module replaces that
 * with a single status-aware gate shared by both code paths.
 */

import type { VerificationStatus } from '../domain/types.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import type { BlockedDiagnosis } from './types.js';
import {
  verificationFactsUnavailableDiagnosis,
  verificationFailedDiagnosis,
  verificationNotRunDiagnosis,
} from './blocked-diagnosis.js';

// ---------------------------------------------------------------------------
// Gate result
// ---------------------------------------------------------------------------

/**
 * The result of evaluating the Change Verification gate.
 *
 * Fail-closed per frozen `verification-model.md` Section 3.3 and
 * `delivery-lifecycle.md` Section 3.4/3.5:
 *   - `satisfied` — `passed` or `not-applicable`; releases the gate.
 *   - `unavailable` — the snapshot carries no Verification status field
 *     (D1 current state); blocks `verification-facts-unavailable`.
 *   - `failed` — available but failed; blocks `verification-failed`.
 *   - `not-run` — available but not run; blocks `verification-not-run`.
 *
 * `not-applicable` is NOT a blocked state: the frozen contract explicitly
 * permits it before `review-apply` and `archive` (D1-RA-003).
 */
export type VerificationGateResult =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'satisfied' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'not-run' };

// ---------------------------------------------------------------------------
// Pure mapping (independently testable — D1-RA-002/D1-RA-003 boundary coverage)
// ---------------------------------------------------------------------------

/**
 * Map a `VerificationStatus | undefined` to a `VerificationGateResult`.
 *
 * Pure and independently testable. Encodes the fail-closed contract from the
 * frozen `verification-model.md` Section 3.3 and `delivery-lifecycle.md`
 * Section 3.4/3.5:
 *   - `undefined` (no field) → `unavailable`
 *   - `passed` → `satisfied`
 *   - `not-applicable` → `satisfied` (D1-RA-003: not-applicable satisfies the
 *     gate; it is NOT fail-closed to `not-run`)
 *   - `failed` → `failed`
 *   - `not-run` → `not-run`
 */
export function mapVerificationStatusToGate(
  status: VerificationStatus | undefined,
): VerificationGateResult {
  switch (status) {
    case undefined:
      return { kind: 'unavailable' };
    case 'passed':
    case 'not-applicable':
      return { kind: 'satisfied' };
    case 'failed':
      return { kind: 'failed' };
    case 'not-run':
      return { kind: 'not-run' };
  }
}

// ---------------------------------------------------------------------------
// Snapshot reading (single forward-compatibility point)
// ---------------------------------------------------------------------------

/**
 * Read the Change Verification status from the snapshot, if present.
 *
 * D1-7: C1 `FormalFactSnapshot` carries no Change Verification status field.
 * Returns `undefined` in D1. A future change that extends the snapshot with a
 * verification status field updates ONLY this function. MUST NOT infer status
 * from Run history, OpenSpec artifacts, or chat.
 */
export function readChangeVerificationStatus(
  _snapshot: FormalFactSnapshot,
): VerificationStatus | undefined {
  // Parameter reserved for the future change that extends the snapshot with a
  // Change Verification status field (D1-7).
  void _snapshot;
  return undefined;
}

/**
 * Evaluate the Change Verification gate against the snapshot.
 *
 * Single entry point used by both `canRun` (preconditions) and `next`
 * (decision tree), ensuring they enforce the same gate (D1-RA-002).
 */
export function evaluateVerificationGate(
  snapshot: FormalFactSnapshot,
): VerificationGateResult {
  return mapVerificationStatusToGate(readChangeVerificationStatus(snapshot));
}

// ---------------------------------------------------------------------------
// Gate → canRun unmet precondition
// ---------------------------------------------------------------------------

/**
 * Map a `VerificationGateResult` to the unmet precondition string used by
 * `canRun`, or `null` when the gate is satisfied (`passed` or `not-applicable`).
 */
export function verificationGateUnmet(
  gate: VerificationGateResult,
): string | null {
  switch (gate.kind) {
    case 'satisfied':
      return null;
    case 'unavailable':
      return 'verification-facts-unavailable';
    case 'failed':
      return 'verification-failed';
    case 'not-run':
      return 'verification-not-run';
  }
}

// ---------------------------------------------------------------------------
// Gate → next() blocked diagnosis
// ---------------------------------------------------------------------------

/**
 * A non-satisfied `VerificationGateResult`, narrowing `satisfied` out so the
 * diagnosis mapping is total.
 */
export type NonSatisfiedVerificationGate = Exclude<
  VerificationGateResult,
  { kind: 'satisfied' }
>;

/**
 * Map a non-satisfied `VerificationGateResult` to a `BlockedDiagnosis` for `next`.
 *
 * The caller MUST ensure the gate is not `satisfied` (the `next` decision tree
 * only reaches the diagnosis when `gate.kind !== 'satisfied'`).
 */
export function verificationGateDiagnosis(
  gate: NonSatisfiedVerificationGate,
): BlockedDiagnosis {
  switch (gate.kind) {
    case 'unavailable':
      return verificationFactsUnavailableDiagnosis();
    case 'failed':
      return verificationFailedDiagnosis();
    case 'not-run':
      return verificationNotRunDiagnosis();
  }
}
