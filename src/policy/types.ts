/**
 * D1 policy-engine: Policy-specific types.
 *
 * Defines the result shapes emitted by the three pure Policy functions
 * `canRun`, `next`, `diagnose`: `CanRunResult`, `PolicyResult` (a mutually
 * exclusive discriminated union), `OwnerDecision`, `OwnerDecisionContext`,
 * `BlockedDiagnosis` and `BlockedReason`.
 *
 * Every type is `readonly` — Policy produces immutable results (D1-1). No
 * runtime dependency is introduced; union types use the `as const` + `typeof`
 * extraction pattern established by B1 (`actions.ts`), never `enum`.
 */

import type { FormalAction } from '../domain/actions.js';
import type { FullTestStatus } from '../domain/types.js';
import type { FactConflict } from '../facts/formal-fact-snapshot.js';

// ---------------------------------------------------------------------------
// OwnerDecision
// ---------------------------------------------------------------------------

/**
 * The five Action-level owner decisions plus the Git-boundary
 * `authorize-checkpoint` decision.
 *
 * `owner-decision` means "the system has determined the single required
 * action, but the owner must authorize it" (D1-5, D1-9). It is strictly
 * distinct from `blocked` — blocked means the system cannot determine a
 * unique action.
 *
 * The five Action authorizations + `activate-change` are listed in task 1.3.
 * `authorize-checkpoint` is added per task 6.10: the archive stage advances to
 * the Change Checkpoint Git boundary, which is a formal Git boundary (not a
 * formal Action) and requires owner authorization (AGENTS.md rule #7).
 */
export const OWNER_DECISIONS = [
  'activate-change',
  'authorize-apply',
  'authorize-archive',
  'authorize-full-test',
  'authorize-delivery-finalize',
  'authorize-checkpoint',
] as const;

/**
 * Union type of all owner decisions.
 */
export type OwnerDecision = (typeof OWNER_DECISIONS)[number];

/**
 * Returns `true` when `value` is a recognized `OwnerDecision`.
 */
export function isOwnerDecision(value: string): value is OwnerDecision {
  return (OWNER_DECISIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// BlockedReason
// ---------------------------------------------------------------------------

/**
 * The set of reasons the Policy may be `blocked`.
 *
 * `tasks-facts-unavailable` (archive gate) is strictly distinct from
 * `verification-facts-unavailable` (review-apply/archive gate) — they are
 * different fact dimensions and MUST NOT be conflated (D1-11).
 *
 * `full-test-failed` follows frozen `verification-model.md` Section 6:
 * `fullTestStatus` stays `failed`; Policy MUST NOT auto-create a corrective
 * Change or auto-retry `full-test` (D1-13).
 */
export const BLOCKED_REASONS = [
  'formal-fact-conflict',
  'no-active-delivery',
  'no-actionable-change',
  'verification-facts-unavailable',
  'verification-failed',
  'verification-not-run',
  'tasks-facts-unavailable',
  'ambiguous-state',
  'dependency-incomplete',
  'full-test-failed',
] as const;

/**
 * Union type of all blocked reasons.
 */
export type BlockedReason = (typeof BLOCKED_REASONS)[number];

/**
 * Returns `true` when `value` is a recognized `BlockedReason`.
 */
export function isBlockedReason(value: string): value is BlockedReason {
  return (BLOCKED_REASONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// CanRunResult
// ---------------------------------------------------------------------------

/**
 * Result of `canRun(snapshot, action)`.
 *
 * `allowed` is `true` if and only if `unmetPreconditions` is empty and
 * `conflictDimensions` is empty. `conflictDimensions` lists the dimensions of
 * `snapshot.conflicts` (fail-closed: non-empty conflicts block every action).
 */
export interface CanRunResult {
  /** The action being checked. */
  readonly action: FormalAction;
  /** `true` iff `unmetPreconditions` and `conflictDimensions` are both empty. */
  readonly allowed: boolean;
  /** Action-specific unmet preconditions (e.g. `unknown-action`). */
  readonly unmetPreconditions: readonly string[];
  /** Conflict dimensions from `snapshot.conflicts` (empty when no conflicts). */
  readonly conflictDimensions: readonly string[];
}

// ---------------------------------------------------------------------------
// OwnerDecisionContext
// ---------------------------------------------------------------------------

/**
 * Context attached to an `owner-decision` result, providing the owner the
 * information needed to authorize (D1-5).
 *
 * All fields optional — different decisions populate different fields.
 */
export interface OwnerDecisionContext {
  /** Change key the decision concerns (e.g. the change to activate). */
  readonly changeKey?: string;
  /** Current Delivery Full Test status (for full-test / finalize decisions). */
  readonly deliveryFullTestStatus?: FullTestStatus;
  /** Eligible planned required change keys (for `activate-change`). */
  readonly eligibleChangeKeys?: readonly string[];
  /** Free-form detail explaining why the decision is requested. */
  readonly detail?: string;
}

// ---------------------------------------------------------------------------
// BlockedDiagnosis
// ---------------------------------------------------------------------------

/**
 * Diagnosis emitted by `diagnose(snapshot)` and carried by the `blocked`
 * variant of `PolicyResult`.
 *
 * `suggestedOwnerActions` lists owner actions that could relieve the block
 * (e.g. authorize a corrective Change for `full-test-failed`). For blocks not
 * relievable by owner action, it is empty.
 */
export interface BlockedDiagnosis {
  /** Why the Policy is blocked. */
  readonly reason: BlockedReason;
  /** Unmet preconditions contributing to the block. */
  readonly unmetPreconditions: readonly string[];
  /** Conflicts from `snapshot.conflicts` (for `formal-fact-conflict`). */
  readonly conflicts: readonly FactConflict[];
  /** Owner actions that could relieve the block, if any. */
  readonly suggestedOwnerActions: readonly string[];
}

// ---------------------------------------------------------------------------
// PolicyResult (mutually exclusive discriminated union)
// ---------------------------------------------------------------------------

/**
 * The `action` variant: the system has determined the single legal next
 * formal Action and it may be executed.
 */
export interface PolicyActionResult {
  readonly kind: 'action';
  readonly action: FormalAction;
}

/**
 * The `owner-decision` variant: the system has determined the single required
 * action, but the owner must authorize it (D1-5). MUST NOT auto-advance.
 */
export interface PolicyOwnerDecisionResult {
  readonly kind: 'owner-decision';
  readonly decision: OwnerDecision;
  readonly context: OwnerDecisionContext;
}

/**
 * The `blocked` variant: the system cannot determine a unique legal next
 * action (conflict, missing facts, ambiguity, dependency incomplete, full-test
 * failed). Distinct from `owner-decision` (D1-9).
 */
export interface PolicyBlockedResult {
  readonly kind: 'blocked';
  readonly diagnosis: BlockedDiagnosis;
}

/**
 * The mutually exclusive result of `next(snapshot)`.
 *
 * A `PolicyResult` is exactly one of:
 *   - `{ kind: 'action', action }`
 *   - `{ kind: 'owner-decision', decision, context }`
 *   - `{ kind: 'blocked', diagnosis }`
 *
 * It MUST NOT carry more than one `kind` at once.
 */
export type PolicyResult =
  | PolicyActionResult
  | PolicyOwnerDecisionResult
  | PolicyBlockedResult;

// ---------------------------------------------------------------------------
// Constructors (pure helpers for building immutable results)
// ---------------------------------------------------------------------------

/**
 * Build an `action` PolicyResult.
 */
export function actionResult(action: FormalAction): PolicyActionResult {
  return { kind: 'action', action };
}

/**
 * Build an `owner-decision` PolicyResult.
 */
export function ownerDecisionResult(
  decision: OwnerDecision,
  context: OwnerDecisionContext = {},
): PolicyOwnerDecisionResult {
  return { kind: 'owner-decision', decision, context };
}

/**
 * Build a `blocked` PolicyResult.
 */
export function blockedResult(diagnosis: BlockedDiagnosis): PolicyBlockedResult {
  return { kind: 'blocked', diagnosis };
}
