/**
 * B1 domain-and-state-schema: domain object type definitions.
 *
 * Defines TypeScript `interface`/`type` for the eleven Flowkit domain objects
 * and the frozen state union types. Domain objects are pure data shapes —
 * behavior lives in standalone functions (states, actions, run-id, terminal,
 * schema-validator), not on the objects themselves.
 */

import type { FormalAction } from './actions.js';
import type { ArchitectureImpactFact } from './a1-types.js';

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

export const BLOCKING_AUTHORITIES = ['author', 'owner', 'verification', 'external'] as const;
export type BlockingAuthority = (typeof BLOCKING_AUTHORITIES)[number];

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
  readonly architectureImpact: ArchitectureImpactFact;
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
  readonly architectureImpact: ArchitectureImpactFact;
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
  /** Every current Standard Run is bound to a Change. */
  readonly changeId: string;
  readonly action: FormalAction;
  readonly role: Role;
  readonly status: RunStatus;
  readonly semanticInputFingerprint?: string;
  readonly inputRef?: ResultRef;
}

// ---------------------------------------------------------------------------
// Domain objects 4–5: ActionDefinition, ActionResult
// ---------------------------------------------------------------------------

/**
 * Immutable definition of one Standard Change Action.
 *
 * B1 owns the complete static catalog. The five fields below are the normative
 * execution boundary reviewed in B1 Proposal: role, goal class, mutation
 * class, output class and terminal contract. The catalog is compile-time
 * constant data — no Registry/Router/dynamic discovery.
 */
export interface ActionTerminalContract {
  readonly kind: 'artifact' | 'review' | 'implementation' | 'archive';
  readonly verdictRequired: boolean;
  readonly bindsReviewedRun: boolean;
  readonly bindsSourceReview: boolean;
  readonly verificationSummaryRef: 'none' | 'core-derived';
  readonly gitCheckpointOutputAllowed: false;
}

export interface ActionDefinition {
  readonly action: FormalAction;
  readonly version: 1;
  readonly role: Exclude<Role, 'owner'>;
  readonly goalClass: string;
  readonly mutationClass: string;
  readonly outputClass: string;
  readonly terminalContract: ActionTerminalContract;
}

/** Exact versioned authority reference used by a logical Action Package. */
export interface VersionedAuthorityRef {
  readonly ref: string;
  readonly kind: string;
  readonly versionFingerprint: string;
}

export interface ActionPackageFindingView {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly blockingAuthority?: BlockingAuthority;
  readonly title?: string;
  readonly problem?: string;
  readonly contractRef?: string;
  readonly invariant?: string;
  readonly requiredOutcome?: string;
  readonly acceptance?: readonly string[];
}

export interface ActionPackageFindingConvergenceView {
  readonly findingId: string;
  readonly state: 'new' | 'still-open' | 'resolved' | 'superseded';
  readonly supersededByFindingId?: string;
}

export interface ActionPackageReviewView {
  readonly reviewRunId: string;
  readonly verdict: ReviewVerdictValue;
  readonly resultRef: VersionedAuthorityRef;
  readonly blockingAuthorities: readonly BlockingAuthority[];
  readonly findings: readonly ActionPackageFindingView[];
  readonly convergence?: readonly ActionPackageFindingConvergenceView[];
}

export interface ActionPackageVerificationView {
  readonly status: VerificationStatus | 'unavailable';
  readonly resultRef?: VersionedAuthorityRef;
}

export interface MutationSelector {
  readonly kind: 'exact' | 'prefix';
  readonly path: string;
}

/**
 * Core-derived, Design-bound allowed mutation boundary for an Apply Action.
 * It constrains observed writes; it is deliberately not a candidate manifest.
 */
export interface MutationDeclaration {
  readonly schemaVersion: 1;
  readonly action: 'apply' | 'revise-apply';
  readonly designRef: VersionedAuthorityRef;
  readonly selectors: readonly MutationSelector[];
}

export interface EntryWorkspaceIdentity {
  readonly canonicalBase: string;
  readonly workspaceFingerprint: string;
}

export interface CompactEntryWorkspacePath {
  readonly path: string;
  readonly state: 'added' | 'modified' | 'deleted' | 'untracked';
  readonly contentFingerprint?: string;
}

/** Post-E2 current entry identity: canonical Git Base plus only the lexical dirty delta. */
export interface CompactEntryWorkspaceIdentity extends EntryWorkspaceIdentity {
  readonly entries: readonly CompactEntryWorkspacePath[];
}

interface ActionPackageBase {
  readonly run: {
    readonly deliveryId: string;
    readonly changeId: string;
    readonly runId: string;
    readonly action: FormalAction;
    readonly role: Exclude<Role, 'owner'>;
    readonly semanticInputFingerprint: string;
  };
  readonly definition: ActionDefinition;
  readonly contractRefs: readonly VersionedAuthorityRef[];
  readonly handoffRefs: readonly VersionedAuthorityRef[];
  readonly reviewView?: ActionPackageReviewView;
  readonly ownerAuthorizationRefs: readonly OwnerAuthorizationRef[];
  /** Bootstrap/D1 bounded applicable Owner facts; authority remains Manifest.ownerDecisions. */
  readonly ownerFactRefs?: readonly OwnerFactRef[];
  readonly verificationView?: ActionPackageVerificationView;
  /** Bounded digest of external structured execution context participating in same-Run drift protection. */
  readonly externalContextFingerprint?: string;
  readonly requiredResultContract: ActionTerminalContract;
}

/** Historical ActionPackage contract. Immutable contexts v2/v3/v4 reconstruct only this form. */
export interface ActionPackageV1 extends ActionPackageBase {
  readonly schemaVersion: 1;
}

interface ActionPackageV2Common extends ActionPackageBase {
  readonly schemaVersion: 2;
}

/** Pre-E2 persisted Apply package: full entry identity and declaration are mandatory. */
export interface ActionPackageV2Apply extends ActionPackageV2Common {
  readonly run: ActionPackageBase['run'] & { readonly action: 'apply' | 'revise-apply' };
  readonly entryWorkspaceIdentity: EntryWorkspaceIdentity;
  readonly mutationDeclaration: MutationDeclaration;
}

/** Other current Actions must not synthesize Apply-only authority. */
export interface ActionPackageV2NonApply extends ActionPackageV2Common {
  readonly run: ActionPackageBase['run'] & { readonly action: Exclude<FormalAction, 'apply' | 'revise-apply'> };
  readonly entryWorkspaceIdentity?: never;
  readonly mutationDeclaration?: never;
}

/** Post-E2 current Apply package: structurally compact entry identity under the existing bounded serialization discriminator. */
export interface CurrentCompactApplyActionPackage extends ActionPackageV2Common {
  readonly run: ActionPackageBase['run'] & { readonly action: 'apply' | 'revise-apply' };
  readonly compactEntryWorkspaceIdentity: CompactEntryWorkspaceIdentity;
  readonly entryWorkspaceIdentity?: never;
  readonly mutationDeclaration: MutationDeclaration;
}

export type ApplyActionPackageLike = ActionPackageV2Apply | CurrentCompactApplyActionPackage;
export type ActionPackageV2 = ActionPackageV2Apply | CurrentCompactApplyActionPackage | ActionPackageV2NonApply;
export type ActionPackage = ActionPackageV1 | ActionPackageV2;

/**
 * Provider/executor-owned logical terminal descriptor. Core derives physical
 * ResultRefs, reviewed/source-review bindings and verification refs.
 */
export interface LogicalActionResultInput {
  readonly executionStatus?: ExecutionStatus;
  readonly summary?: string;
  readonly reviewVerdict?: ReviewVerdictValue;
  readonly reviewFindings?: readonly unknown[];
  readonly reviewFindingConvergence?: readonly unknown[];
  readonly failureDiagnosis?: string;
  readonly cancellationReason?: string;
}

/**
 * Result of executing a single Action Run.
 *
 * B1 owns the logical minimal field set. C1 defines the physical transport
 * schema and serialization.
 */
export interface ActionResult {
  readonly runRef: ResultRef;
  readonly action: FormalAction;
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
  readonly decision: string;
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly sourceRef: string;
}

/** Bounded, non-authoritative projection of an Owner decision for role handoff. */
export interface OwnerFactRef {
  readonly ref: string;
  readonly decision: 'contract-reset';
  readonly deliveryId: string;
  readonly changeId: string;
  readonly scope: string;
  readonly requiredOutcomes: readonly string[];
  readonly sourceRef: string;
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
  readonly lastCompletedAction?: FormalAction;
  readonly lastActionResultRef?: ResultRef;
  readonly activeVerdict?: ReviewVerdictValue;
  readonly pendingNonBlockingFindings: readonly FindingSummary[];
  readonly validOwnerAuthorizations: readonly OwnerAuthorizationRef[];
  readonly currentConstraints: Readonly<Record<string, unknown>>;
  /** Computed by Policy (D1), not by ContinuationContext itself. */
  readonly nextAllowedAction: FormalAction;
  readonly nextActionInputRefs: readonly ResultRef[];
}
