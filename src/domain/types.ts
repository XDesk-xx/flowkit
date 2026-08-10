/**
 * B1 domain-and-state-schema: domain object type definitions.
 *
 * Defines TypeScript `interface`/`type` for the eleven Flowkit domain objects
 * and the frozen state union types. Domain objects are pure data shapes —
 * behavior lives in standalone functions (states, actions, run-id, terminal,
 * schema-validator), not on the objects themselves.
 */

import type { ChangeAction, DeliveryAction } from './actions.js';

// ---------------------------------------------------------------------------
// Frozen state union types
// ---------------------------------------------------------------------------

/**
 * Delivery lifecycle state.
 * Frozen source: core-model spec + delivery-lifecycle.md Section 2.
 */
export type DeliveryState = 'active' | 'completed' | 'cancelled';

/**
 * Change lifecycle state.
 * Frozen source: core-model spec + delivery-lifecycle.md Section 3.
 */
export type ChangeState = 'planned' | 'active' | 'completed' | 'cancelled';

/**
 * Run lifecycle status.
 * Frozen source: core-model.md Section 3.3.
 * Does NOT include `in-progress` — that value belongs only to ExecutionStatus.
 */
export type RunStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

/**
 * Execution status of an ActionResult.
 * Independent of RunStatus; `in-progress` lives here, not on Run.
 */
export type ExecutionStatus =
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'blocked';

/**
 * Delivery-level Full Test validation substate.
 * Frozen source: core-model spec.
 */
export type FullTestStatus =
  | 'not-ready'
  | 'awaiting-user-decision'
  | 'authorized'
  | 'passed'
  | 'failed';

/**
 * Verification check status.
 * Frozen source: core-model spec + verification-model.md.
 */
export type VerificationStatus =
  | 'not-run'
  | 'passed'
  | 'failed'
  | 'not-applicable';

/**
 * Formal role assumed by an actor for a given Action.
 */
export type Role = 'owner' | 'author' | 'reviewer';

/**
 * Review verdict value emitted by a review Action.
 */
export type ReviewVerdictValue = 'approved' | 'changes-requested';

/**
 * Finding severity.
 */
export type FindingSeverity = 'blocking' | 'non-blocking';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/**
 * Archify impact metadata on a Delivery.
 * Minimal field set — does NOT include `archifyStatus`.
 */
export interface ArchitectureInfo {
  /** Whether the Delivery introduces architecture-level impact. */
  readonly impact: boolean;
  /** Whether an Archify plan is required for this Delivery. */
  readonly archifyPlan: 'required' | 'not-required' | 'deferred';
}

/**
 * Lightweight Change reference embedded in a Delivery.
 */
export interface ChangeSummary {
  readonly key: string;
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly state: ChangeState;
  readonly required: boolean;
  readonly outputs?: readonly string[];
}

// ---------------------------------------------------------------------------
// Domain objects 1–3: Delivery, Change, Run
// ---------------------------------------------------------------------------

/**
 * A Delivery group — the top-level unit of coordinated Change delivery.
 *
 * B1 owns the complete type. C1 owns persistence.
 */
export interface Delivery {
  readonly id: string;
  readonly state: DeliveryState;
  readonly createdAt: string;
  readonly branch: string;
  readonly fullTestStatus: FullTestStatus;
  readonly architecture: ArchitectureInfo;
  readonly changes: readonly ChangeSummary[];
}

/**
 * A Change within a Delivery.
 *
 * B1 owns the complete type. C1 owns persistence.
 *
 * `outputs` is a conceptual range of stable product artifacts the Change
 * promises to create or update. It is NOT a complete file whitelist, NOT the
 * Git actualChangeSet, and NOT the Flowkit control-artifacts list.
 */
export interface Change {
  readonly key: string;
  readonly id: string;
  readonly goal: string;
  readonly required: boolean;
  readonly dependsOn: readonly string[];
  readonly state: ChangeState;
  /** Conceptual product-artifact range. Not a file whitelist. */
  readonly outputs?: readonly string[];
}

/**
 * A Run — the execution record of a single formal Action.
 *
 * B1 owns the complete type. C1 owns persistence.
 */
export interface Run {
  readonly runId: string;
  readonly deliveryId: string;
  /** Present when the Run is bound to a Change; absent for Delivery-level Runs. */
  readonly changeId?: string;
  readonly action: ChangeAction | DeliveryAction;
  readonly role: Role;
  readonly status: RunStatus;
  readonly inputRef?: ResultRef;
}

// ---------------------------------------------------------------------------
// Domain objects 4–5: ActionDefinition, ActionResult
// ---------------------------------------------------------------------------

/**
 * Immutable definition of a formal Action.
 *
 * B1 owns the complete type. The catalog is fixed and immutable — no
 * transport/persistence needs.
 * Field contract aligned with integration-boundaries.md Section 3.1.
 */
export interface ActionDefinition {
  readonly action: ChangeAction | DeliveryAction;
  readonly role: Role;
  readonly goal: string;
  readonly preconditions: readonly string[];
  readonly allowedOutputs: readonly string[];
  readonly completionConditions: readonly string[];
}

/**
 * Result of executing a single Action Run.
 *
 * B1 owns the logical minimal field set. C1 defines the physical transport
 * schema and serialization.
 */
export interface ActionResult {
  readonly runRef: ResultRef;
  readonly action: ChangeAction | DeliveryAction;
  readonly executionStatus: ExecutionStatus;
  readonly summary: string;
  readonly producedResultRefs?: readonly ResultRef[];
  readonly consumedInputRefs?: readonly ResultRef[];
  readonly verificationSummaryRef?: ResultRef;
  readonly reviewVerdictRef?: ResultRef;
  readonly failureDiagnosis?: string;
  readonly nextActionRecommendation?: string;
}

// ---------------------------------------------------------------------------
// Domain objects 6–9: ResultRef, ReviewVerdict, FindingSummary, VerificationSummary
// ---------------------------------------------------------------------------

/**
 * Provider-neutral logical reference to a result artifact.
 *
 * B1 owns the complete type. The reference is provider-neutral: it uniquely
 * identifies the referenced result, can determine whether the result was
 * replaced or invalidated, and lets the receiver read or locate the result.
 * `runPath` is NOT a mandatory field (B1-RE-002).
 * C1 defines adapter mappings to physical transports.
 */
export interface ResultRef {
  readonly ref: string;
  readonly versionFingerprint: string;
  readonly kind?: string;
}

/**
 * Summary of a single review finding.
 */
export interface FindingSummary {
  readonly id: string;
  readonly title: string;
  readonly severity: FindingSeverity;
  readonly resolution?: string;
}

/**
 * Verdict emitted by a review Action.
 *
 * B1 owns the complete type. C1 owns persistence.
 */
export interface ReviewVerdict {
  readonly verdict: ReviewVerdictValue;
  readonly blockingFindings: readonly FindingSummary[];
  readonly nonBlockingFindings: readonly FindingSummary[];
  readonly reviewedResultRef: ResultRef;
}

/**
 * A single verification check entry.
 * Field contract aligned with verification-model.md Section 7.
 */
export interface VerificationCheck {
  readonly name: string;
  readonly scope: string;
  readonly applicability: 'applicable' | 'not-applicable';
  readonly commands: readonly string[];
  readonly status: VerificationStatus;
  readonly summary: string;
}

/**
 * Aggregate verification summary for a Run.
 *
 * B1 owns the complete type. C1 owns persistence.
 */
export interface VerificationSummary {
  readonly checks: readonly VerificationCheck[];
  readonly overallStatus: VerificationStatus;
}

// ---------------------------------------------------------------------------
// Domain objects 10–11: OwnerAuthorizationRef, ContinuationContext
// ---------------------------------------------------------------------------

/**
 * Provider-neutral reference to an owner authorization.
 *
 * B1 owns the logical reference. C1/D1 define authorization storage.
 */
export interface OwnerAuthorizationRef {
  readonly ref: string;
  readonly scope: string;
  readonly authorizedAt?: string;
}

/**
 * Logical context for resuming a Delivery after a session break.
 *
 * B1 owns the logical minimal field set. C1 defines serialization and
 * recovery. `nextAllowedAction` is computed by Policy (D1) — ContinuationContext
 * MUST NOT fill it itself.
 */
export interface ContinuationContext {
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly lastCompletedAction?: ChangeAction | DeliveryAction;
  readonly lastActionResultRef?: ResultRef;
  readonly activeVerdict?: ReviewVerdictValue;
  readonly pendingNonBlockingFindings: readonly FindingSummary[];
  readonly validOwnerAuthorizations: readonly OwnerAuthorizationRef[];
  readonly currentConstraints: Readonly<Record<string, unknown>>;
  /** Computed by Policy (D1), not by ContinuationContext itself. */
  readonly nextAllowedAction: ChangeAction | DeliveryAction;
  readonly nextActionInputRefs: readonly ResultRef[];
}
