/**
 * D1 policy-engine: Review/Revision lineage by reviewed Run (D1-8).
 *
 * The lineage model tracks the Review/Revision loop per stage S using
 * `ReviewVerdictFact.reviewedRunId`:
 *   - Current Artifact Run = latest completed Run with action ∈ {S, revise-S}
 *   - Current Review       = latest completed `review-S` Run (carries the
 *                            verdict + `reviewedRunId`)
 *   - Lineage match        = Current Review ≠ null AND
 *                            Current Review.reviewedRunId == Current
 *                            Artifact Run.runId
 *
 * Match + approved  → stage complete (advance)
 * Match + cr        → revise-S
 * No match          → review-S (new artifact not yet reviewed)
 *
 * This replaces the old "no completed review-S Run" existence rule, which
 * broke the authority-aware `changes-requested → (revise | blocked/re-review)` loop. All functions are pure
 * and read only snapshot fields.
 */

import type { ReviewVerdictValue } from '../domain/types.js';
import type {
  RunFact,
  ReviewVerdictFact,
} from '../facts/formal-fact-snapshot.js';
import {
  artifactActions,
  completedRunsForChange,
  reviewAction,
} from './stage-detector.js';
import type { Stage } from './stage-detector.js';

// ---------------------------------------------------------------------------
// Current Artifact Run
// ---------------------------------------------------------------------------

/**
 * Find the Current Artifact Run for stage `stage`: the latest completed Run
 * (newest-first) whose action ∈ {S, revise-S}.
 *
 * Returns `null` when the stage has not started (no completed artifact Run).
 */
export function currentArtifactRun(
  runs: readonly RunFact[],
  changeId: string,
  stage: Stage,
): RunFact | null {
  const completed = completedRunsForChange(runs, changeId);
  const actions = artifactActions(stage);
  for (const run of completed) {
    if ((actions as readonly string[]).includes(run.action)) {
      return run;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Current Review
// ---------------------------------------------------------------------------

/**
 * Find the Current Review for stage `stage`: the latest completed `review-S`
 * Run, paired with its `ReviewVerdictFact`.
 *
 * Returns `null` when no completed `review-S` Run exists, or when the latest
 * such Run has no matching verdict fact (malformed snapshot — treated as
 * "not yet reviewed" so Policy does not infer a verdict).
 */
export function currentReview(
  runs: readonly RunFact[],
  reviewVerdicts: readonly ReviewVerdictFact[],
  changeId: string,
  stage: Stage,
): ReviewVerdictFact | null {
  const completed = completedRunsForChange(runs, changeId);
  const rAction = reviewAction(stage);
  for (const run of completed) {
    if (run.action !== rAction) {
      continue;
    }
    // Find the verdict fact emitted by this review Run.
    const verdict = reviewVerdicts.find((v) => v.reviewRunId === run.runId);
    if (verdict !== undefined) {
      return verdict;
    }
    // A completed review-S Run without a verdict fact is a malformed snapshot.
    // Continue to older review-S Runs rather than inferring a verdict.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lineage match
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `review.reviewedRunId` matches `artifact.runId`.
 *
 * Both arguments may be `null`; the match is `false` when either is `null`.
 */
export function lineageMatch(
  review: ReviewVerdictFact | null,
  artifact: RunFact | null,
): boolean {
  if (review === null || artifact === null) {
    return false;
  }
  return review.reviewedRunId === artifact.runId;
}

// ---------------------------------------------------------------------------
// Lineage snapshot (bundled view for decision trees)
// ---------------------------------------------------------------------------

/**
 * Bundled lineage view for a single stage, computed once and consumed by the
 * `next`/`canRun` decision trees.
 */
export interface LineageState {
  readonly stage: Stage;
  readonly artifact: RunFact | null;
  readonly review: ReviewVerdictFact | null;
  /** True iff `review.reviewedRunId === artifact.runId` (both non-null). */
  readonly match: boolean;
  /** The current verdict value, or `null` when no review exists. */
  readonly verdict: ReviewVerdictValue | null;
}

/**
 * Compute the full `LineageState` for `stage` from the snapshot fields.
 *
 * Pure: reads `runs` and `reviewVerdicts` only.
 */
export function computeLineage(
  runs: readonly RunFact[],
  reviewVerdicts: readonly ReviewVerdictFact[],
  changeId: string,
  stage: Stage,
): LineageState {
  const artifact = currentArtifactRun(runs, changeId, stage);
  const review = currentReview(runs, reviewVerdicts, changeId, stage);
  const match = lineageMatch(review, artifact);
  const verdict = review === null ? null : review.verdict;
  return { stage, artifact, review, match, verdict };
}
