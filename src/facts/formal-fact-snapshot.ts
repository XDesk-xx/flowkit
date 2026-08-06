/**
 * C1 formal-fact-reader-and-persistence: read-only formal-fact view.
 *
 * `FormalFactSnapshot` is the read-only fact view consumed by Policy (D1). Its
 * fields map the Policy input list documented in `docs/delivery-lifecycle.md`
 * Section 5:
 *   - active Delivery and Change;
 *   - Change dependencies;
 *   - OpenSpec artifacts;
 *   - committed Runs;
 *   - reviewer Verdict;
 *   - Change Verification;
 *   - Delivery `fullTestStatus`;
 *   - owner authorization facts;
 *   - Archive, Checkpoint and Git boundaries.
 *
 * The snapshot carries an explicit `conflicts: FactConflict[]` field so that
 * fail-closed conflict detection is structural (D1): Reader MUST NOT discard
 * conflicts or auto-pick one authority, and Policy MUST block when `conflicts`
 * is non-empty.
 */

import type {
  ChangeState,
  DeliveryState,
  FullTestStatus,
  ResultRef,
  ReviewVerdictValue,
  Role,
  RunStatus,
} from '../domain/types.js';
import type { ChangeAction, DeliveryAction } from '../domain/actions.js';

/**
 * A single conflict detected while reading formal facts.
 *
 * One fact has one authority (D2). When the same fact is contradicted across
 * authorities — or an authority is unreadable / malformed — Reader collects a
 * `FactConflict` rather than auto-resolving. Policy blocks on non-empty
 * `conflicts`.
 */
export interface FactConflict {
  /** Conflict dimension (e.g. `delivery-state`, `run-status`, `yaml-parse`). */
  readonly dimension: string;
  /** Authority / source identifier that produced the conflict. */
  readonly authority: string;
  /** Human-readable description of the conflict. */
  readonly message: string;
  /** Optional structured detail for diagnosis. */
  readonly detail?: unknown;
}

/**
 * Read-only summary of a Change within the active Delivery.
 */
export interface ChangeFact {
  readonly key: string;
  readonly id: string;
  readonly state: ChangeState;
  readonly required: boolean;
  readonly dependsOn: readonly string[];
  /** Conceptual product-artifact range, if declared. */
  readonly outputs?: readonly string[];
}

/**
 * Read-only summary of a committed Run.
 */
export interface RunFact {
  readonly runId: string;
  readonly deliveryId: string;
  /** Present for Change-level Runs; absent for Delivery-level Runs. */
  readonly changeId?: string;
  readonly action: ChangeAction | DeliveryAction;
  readonly role: Role;
  readonly status: RunStatus;
  /** Present when the Run consumed a prior result as input. */
  readonly inputRef?: ResultRef;
  /** Terminal result reference, present when `status` is terminal. */
  readonly resultRef?: ResultRef;
}

/**
 * Read-only summary of an OpenSpec artifact (existence + status hint).
 */
export interface OpenSpecArtifactFact {
  readonly kind:
    | 'change-proposal'
    | 'change-design'
    | 'change-spec'
    | 'change-tasks'
    | 'delivery-manifest';
  readonly path: string;
  readonly exists: boolean;
}

/**
 * Read-only summary of a Git formal boundary commit.
 */
export interface GitBoundaryFact {
  readonly kind: 'delivery-start' | 'change-checkpoint' | 'delivery-final';
  readonly commitSha: string;
  readonly summary: string;
}

/**
 * Read-only summary of an owner authorization fact.
 */
export interface OwnerAuthorizationFact {
  /** Provider-neutral reference to the authorization. */
  readonly ref: string;
  readonly scope: string;
}

/**
 * Read-only summary of a reviewer Verdict attached to a Run.
 */
export interface ReviewVerdictFact {
  readonly reviewRunId: string;
  readonly verdict: ReviewVerdictValue;
  /** Run reviewed by this review Run. */
  readonly reviewedRunId: string;
}

/**
 * The read-only formal-fact snapshot consumed by Policy.
 *
 * Every field maps a single Policy input authority (D2: one fact, one
 * authority). `conflicts` makes fail-closed explicit — when non-empty,
 * Policy MUST block.
 */
export interface FormalFactSnapshot {
  /** Delivery id of the active Delivery (empty string when none active). */
  readonly deliveryId: string;
  readonly deliveryState: DeliveryState | undefined;
  readonly deliveryFullTestStatus: FullTestStatus | undefined;
  /** Changes within the active Delivery. */
  readonly changes: readonly ChangeFact[];
  /** Committed Runs across the active Delivery. */
  readonly runs: readonly RunFact[];
  /** OpenSpec directory-structure facts (existence / status). */
  readonly openSpecArtifacts: readonly OpenSpecArtifactFact[];
  /** Git formal boundary summaries (read-only, not persisted). */
  readonly gitBoundaries: readonly GitBoundaryFact[];
  /** Owner authorization facts. */
  readonly ownerAuthorizations: readonly OwnerAuthorizationFact[];
  /** Reviewer Verdicts attached to Runs. */
  readonly reviewVerdicts: readonly ReviewVerdictFact[];
  /** Collected conflicts — non-empty ⇒ Policy MUST block. */
  readonly conflicts: readonly FactConflict[];
}
