/**
 * C1 formal-fact-reader-and-persistence: shared generation/lineage resolver.
 *
 * Q1-RA-002 / Q1-RA-003: supersession MUST be proven by EXACT persisted
 * lineage — never inferred from Run ID ordering. This module is the ONE
 * authority for generation classification, shared by:
 *   - Reader (`formal-fact-reader`) — classifies committed Runs into
 *     current / superseded / revision-window.
 *   - review-entry (`run-persistence.createRun`) — resolves the reviewed
 *     Run's current effective generation before publishing a review Run.
 *
 * Exact lineage proof (artifact generations, explore/propose stage):
 *   G0 = completed S/revise-S artifact Run
 *   R  = completed review-S, R.reviewedRunId == G0.runId,
 *        R.verdict == changes-requested
 *   G1 = revise-S Run (completed OR pending),
 *        G1.sourceReviewRun == R.runId,
 *        G1.sourceReviewVerdict == changes-requested
 *
 * Only when this chain holds does G1 legitimately supersede G0. Run IDs are
 * used ONLY for deterministic sort/presentation — never as lineage proof.
 *
 * Verification generation (review-apply → revise-apply) uses the same exact
 * `sourceReviewRun` / `sourceReviewVerdict` proof.
 */

import type { RunStatus, ReviewVerdictValue } from '../domain/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal lineage fact. {@link RunFact} satisfies this structurally, so Reader
 * passes its facts directly; review-entry builds lightweight facts by reading
 * sibling Run `context.json` files without running the full Reader.
 */
export interface LineageFact {
  readonly runId: string;
  readonly changeId?: string;
  readonly action: string;
  readonly status: RunStatus;
  /** Prior review addressed by a `revise-*` Run (from context.json). */
  readonly sourceReviewRun?: string;
  /** Verdict of the prior review addressed by a `revise-*` Run. */
  readonly sourceReviewVerdict?: ReviewVerdictValue;
  /** Run reviewed by a `review-*` Run (C1-AP-004 canonical linkage). */
  readonly reviewedRunId?: string;
}

/**
 * A review verdict augmented with its review Run's action + status, so the
 * lineage resolver can confirm the review is a completed `review-<stage>` of
 * the predecessor without re-reading filesystem state.
 */
export interface ReviewLineageFact {
  readonly reviewRunId: string;
  readonly verdict: ReviewVerdictValue;
  readonly reviewedRunId: string;
  readonly reviewAction: string;
  readonly reviewStatus: RunStatus;
  /** Change the review Run belongs to (used to scope lineage per-Change). */
  readonly changeId?: string;
}

/**
 * Artifact generation class (Q1-5.2).
 *   - `current`: producedResultRefs MUST match current canonical bytes.
 *   - `superseded`: a legitimate COMPLETED successor legally overwrote them;
 *     mutable refs are NOT re-validated.
 *   - `revision-window`: a legitimate PENDING successor is editing canonical
 *     artifacts; mutable refs may be in flux and MUST NOT produce false
 *     `artifact-replaced` conflicts. Immutable Run-result refs and review
 *     exact bindings remain strictly validated regardless of class.
 */
export type GenerationClass = 'current' | 'superseded' | 'revision-window';

// ---------------------------------------------------------------------------
// Stage helpers
// ---------------------------------------------------------------------------

/**
 * The artifact stage for an action: `explore`, `propose`, or `undefined` for
 * non-artifact actions. `review-<stage>` and `revise-<stage>` map to `<stage>`.
 */
export function artifactStage(action: string): 'explore' | 'propose' | undefined {
  if (action === 'explore' || action === 'revise-explore' || action === 'review-explore') {
    return 'explore';
  }
  if (action === 'propose' || action === 'revise-propose' || action === 'review-propose') {
    return 'propose';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Artifact generation lineage (explore / propose)
// ---------------------------------------------------------------------------

/**
 * Prove that `g1` is a legitimate successor of `g0` using EXACT lineage only.
 *
 * Requires a completed `review-<stage>` Run R with `R.reviewedRunId == g0.runId`
 * and `R.verdict == changes-requested`, AND `g1.action == revise-<stage>` with
 * `g1.sourceReviewRun == R.runId` and `g1.sourceReviewVerdict ==
 * changes-requested`. Run ID ordering is NOT consulted.
 */
export function isLegitimateArtifactSuccessor(
  g0: LineageFact,
  g1: LineageFact,
  reviews: readonly ReviewLineageFact[],
): boolean {
  const stage = artifactStage(g0.action);
  if (stage === undefined) {
    return false;
  }
  if (g1.action !== `revise-${stage}`) {
    return false;
  }
  const review = reviews.find(
    (r) =>
      r.reviewedRunId === g0.runId &&
      r.verdict === 'changes-requested' &&
      r.reviewAction === `review-${stage}` &&
      r.reviewStatus === 'completed',
  );
  if (review === undefined) {
    return false;
  }
  if (g1.sourceReviewRun !== review.reviewRunId) {
    return false;
  }
  if (g1.sourceReviewVerdict !== 'changes-requested') {
    return false;
  }
  return true;
}

/**
 * Classify artifact generations for a Change+stage group using exact lineage.
 *
 * `completedArtifactRuns` are the completed initial/revise artifact Runs.
 * `allReviseRuns` includes BOTH completed and PENDING revise Runs — pending
 * revise Runs open the bounded revision window without themselves being
 * validated (they have no terminal result yet).
 *
 * Returns a map from runId → GenerationClass for the completed artifact Runs.
 */
export function classifyArtifactGenerations(
  completedArtifactRuns: readonly LineageFact[],
  allReviseRuns: readonly LineageFact[],
  reviews: readonly ReviewLineageFact[],
): Map<string, GenerationClass> {
  const result = new Map<string, GenerationClass>();
  // Sort by runId for deterministic processing (presentation only — NOT lineage).
  const sorted = [...completedArtifactRuns].sort((a, b) => a.runId.localeCompare(b.runId));

  for (const g0 of sorted) {
    const stage = artifactStage(g0.action);
    if (stage === undefined) {
      continue;
    }
    // Successors: revise-<stage> Runs (completed OR pending) with exact lineage.
    const successors = allReviseRuns.filter(
      (g1) =>
        g1.changeId === g0.changeId &&
        g1.action === `revise-${stage}` &&
        isLegitimateArtifactSuccessor(g0, g1, reviews),
    );
    const hasCompletedSuccessor = successors.some((g1) => g1.status === 'completed');
    const hasPendingSuccessor = successors.some((g1) => g1.status === 'pending');
    if (hasCompletedSuccessor) {
      result.set(g0.runId, 'superseded');
    } else if (hasPendingSuccessor) {
      result.set(g0.runId, 'revision-window');
    } else {
      result.set(g0.runId, 'current');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Verification generation lineage (review-apply → revise-apply)
// ---------------------------------------------------------------------------

/**
 * Prove that `r0` (revise-apply) is a legitimate successor of `v0`
 * (review-apply) using EXACT lineage:
 *   - `v0` returned `changes-requested` (verified via `reviews`), AND
 *   - `r0.sourceReviewRun == v0.runId`, AND
 *   - `r0.sourceReviewVerdict == changes-requested`.
 *
 * Run ID ordering is NOT consulted.
 */
export function isLegitimateVerificationSuccessor(
  v0: LineageFact,
  r0: LineageFact,
  reviews: readonly ReviewLineageFact[],
): boolean {
  if (v0.action !== 'review-apply') {
    return false;
  }
  if (r0.action !== 'revise-apply') {
    return false;
  }
  // v0 must have returned changes-requested.
  const v0Verdict = reviews.find((rv) => rv.reviewRunId === v0.runId);
  if (v0Verdict === undefined || v0Verdict.verdict !== 'changes-requested') {
    return false;
  }
  if (r0.sourceReviewRun !== v0.runId) {
    return false;
  }
  if (r0.sourceReviewVerdict !== 'changes-requested') {
    return false;
  }
  return true;
}

/**
 * Classify review-apply verification generations for a Change using exact
 * revise-apply lineage. `completedReviewApplyRuns` are completed review-apply
 * Runs; `allReviseApplyRuns` includes completed AND pending revise-apply Runs
 * (pending opens the verification revision window).
 */
export function classifyVerificationGenerations(
  completedReviewApplyRuns: readonly LineageFact[],
  allReviseApplyRuns: readonly LineageFact[],
  reviews: readonly ReviewLineageFact[],
): Map<string, GenerationClass> {
  const result = new Map<string, GenerationClass>();
  const sorted = [...completedReviewApplyRuns].sort((a, b) => a.runId.localeCompare(b.runId));

  for (const v0 of sorted) {
    const successors = allReviseApplyRuns.filter(
      (r0) =>
        r0.changeId === v0.changeId &&
        isLegitimateVerificationSuccessor(v0, r0, reviews),
    );
    const hasCompletedSuccessor = successors.some((r0) => r0.status === 'completed');
    const hasPendingSuccessor = successors.some((r0) => r0.status === 'pending');
    if (hasCompletedSuccessor) {
      result.set(v0.runId, 'superseded');
    } else if (hasPendingSuccessor) {
      result.set(v0.runId, 'revision-window');
    } else {
      result.set(v0.runId, 'current');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Review-entry helper: classify a reviewed Run's generation
// ---------------------------------------------------------------------------

/**
 * Resolve the generation class of a reviewed artifact Run (Q1-RA-003).
 *
 * Used by review-entry to decide whether the reviewed Run is the current
 * effective generation (reviewable) or has been superseded / is in a revision
 * window (not reviewable). Returns `undefined` when the reviewed Run is not an
 * artifact Run (e.g. reviewing a non-artifact Run).
 *
 * @param reviewedRun - The Run being reviewed (must be completed + artifact).
 * @param completedArtifactRuns - All completed artifact Runs in the same Change.
 * @param allReviseRuns - All revise Runs (completed + pending) in the same Change.
 * @param reviews - All review lineage facts in the same Change.
 */
export function classifyReviewedArtifactGeneration(
  reviewedRun: LineageFact,
  completedArtifactRuns: readonly LineageFact[],
  allReviseRuns: readonly LineageFact[],
  reviews: readonly ReviewLineageFact[],
): GenerationClass | undefined {
  if (artifactStage(reviewedRun.action) === undefined) {
    return undefined;
  }
  const classification = classifyArtifactGenerations(
    completedArtifactRuns.filter((r) => r.changeId === reviewedRun.changeId),
    allReviseRuns.filter((r) => r.changeId === reviewedRun.changeId),
    reviews.filter((r) => r.changeId === reviewedRun.changeId),
  );
  return classification.get(reviewedRun.runId);
}
