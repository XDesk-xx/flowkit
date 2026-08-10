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
 *   - active Change required Tasks completion;
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
  VerificationStatus,
  ResultRef,
  ReviewVerdictValue,
  Role,
  RunStatus,
  BlockingAuthority,
} from '../domain/types.js';
import type { ArchitectureImpactFact, AuthorizationOnlyOwnerDecision } from '../domain/a1-types.js';
import type { FormalAction } from '../domain/actions.js';

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
  readonly architectureImpact: ArchitectureImpactFact;
  /** Conceptual product-artifact range, if declared. */
  readonly outputs?: readonly string[];
}

/**
 * Read-only summary of a committed Run.
 *
 * Current/near-neighbour lineage facts (`sourceReviewRun`,
 * `sourceReviewVerdict`, `reviewedRunId`) are carried on `RunFact` so Policy
 * and Reader can validate exact source/review bindings without treating Run ID
 * ordering or historical mutable artifact bytes as authority. These are read
 * directly from `context.json` (one fact, one authority).
 */
export interface RunFact {
  readonly runId: string;
  readonly deliveryId: string;
  /** Every current Standard Run is bound to a Change. */
  readonly changeId: string;
  readonly action: FormalAction;
  readonly role: Role;
  readonly status: RunStatus;
  /** Present when the Run consumed a prior result as input. */
  readonly inputRef?: ResultRef;
  /** Terminal result reference, present when `status` is terminal. */
  readonly resultRef?: ResultRef;
  /** Result refs consumed as inputs by this Run (from validated actionResult). */
  readonly consumedInputRefs?: readonly ResultRef[];
  /** Result ref of the reviewed Run (from validated actionResult, review-* only). */
  readonly reviewVerdictRef?: ResultRef;
  /** Prior review being addressed by a `revise-*` Run (from context.json). */
  readonly sourceReviewRun?: string;
  /** Verdict of the prior review addressed by a `revise-*` Run. */
  readonly sourceReviewVerdict?: ReviewVerdictValue;
  /** Run being reviewed by a `review-*` Run (C1-AP-004 canonical linkage). */
  readonly reviewedRunId?: string;
}

/**
 * Read-only summary of an OpenSpec artifact (existence + status hint).
 */
export interface OpenSpecArtifactFact {
  readonly kind:
    | 'change-explore'
    | 'change-proposal'
    | 'change-design'
    | 'change-spec'
    | 'change-tasks'
    | 'change-verification'
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
  /**
   * Change identity carried by a Change Checkpoint commit subject
   * (`chore(flowkit): checkpoint <change-id>`). Absent for Delivery-level
   * boundaries and legacy/unstructured checkpoint subjects.
   */
  readonly changeId?: string;
}

/**
 * Read-only summary of an owner authorization fact.
 */
export interface OwnerAuthorizationFact {
  /** Provider-neutral reference to the authorization. */
  readonly ref: string;
  readonly decision: AuthorizationOnlyOwnerDecision;
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly sourceRef: string;
}

/**
 * Read-only summary of a reviewer Verdict attached to a Run.
 */
export interface ReviewVerdictFact {
  readonly reviewRunId: string;
  readonly verdict: ReviewVerdictValue;
  /** Run reviewed by this review Run. */
  readonly reviewedRunId: string;
  /** Fixed-order, deduplicated authority projection for blocking findings. */
  readonly blockingAuthorities: readonly BlockingAuthority[];
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
  /** Current active Change Verification status projected from verification.md. */
  readonly changeVerificationStatus?: VerificationStatus;
  /**
   * Whether every required task checkbox in the active Change canonical
   * tasks.md is completed. Undefined means the completion fact is unavailable.
   */
  readonly changeTasksComplete?: boolean;
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
