/**
 * D1 policy-engine: stage detection from Run history.
 *
 * The active stage is inferred from the active Change's completed Runs: scan
 * all completed Runs in descending Run-ID order; the first Run belonging to a
 * stage's action set determines the stage. With no completed Run, the Change
 * was just activated → `explore` stage (spec: "阶段识别从 Run 历史").
 *
 * Stage detection is a pure function — it only reads `RunFact[]` and never
 * mutates input or calls I/O.
 */

import type { ChangeAction } from '../domain/actions.js';
import type { FormalFactSnapshot, RunFact } from '../facts/formal-fact-snapshot.js';
import { projectCurrentContractResetLifecycle } from '../facts/generation-resolver.js';

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

/**
 * The four lifecycle stages of a Change, in progression order.
 *
 * `review`/`revise` are unified entry points, not stages — each stage S has a
 * `review-S` and `revise-S` action that stay within stage S.
 */
export const STAGES = ['explore', 'propose', 'apply', 'archive'] as const;

/**
 * Union type of the four stages.
 */
export type Stage = (typeof STAGES)[number];

/**
 * Action sets per stage. A Run's action belongs to exactly one stage's set:
 *   - explore  : { explore, revise-explore, review-explore }
 *   - propose  : { propose, revise-propose, review-propose }
 *   - apply    : { apply, revise-apply, review-apply }
 *   - archive  : { archive }
 */
const STAGE_ACTION_SETS: Record<Stage, readonly ChangeAction[]> = {
  explore: ['explore', 'revise-explore', 'review-explore'],
  propose: ['propose', 'revise-propose', 'review-propose'],
  apply: ['apply', 'revise-apply', 'review-apply'],
  archive: ['archive'],
};

// ---------------------------------------------------------------------------
// Run ordering
// ---------------------------------------------------------------------------

/**
 * Compare two Run IDs in descending lexicographic order.
 *
 * Run IDs follow `YYYYMMDD-NNN-action`. Because the date and NNN prefixes are
 * fixed-width and zero-padded, lexicographic order matches chronological
 * order, so descending string comparison yields newest-first ordering.
 */
function compareRunIdDesc(a: string, b: string): number {
  if (a < b) {
    return 1;
  }
  if (a > b) {
    return -1;
  }
  return 0;
}

/**
 * Return the completed Runs of the active Change, newest-first.
 *
 * Historical Delivery-level Runs are excluded by the formal-fact Reader; Runs
 * of other Changes are excluded here. Only `completed` Runs participate in stage detection —
 * `failed`/`cancelled` Runs do not advance the stage.
 */
export function completedRunsForChange(
  runs: readonly RunFact[],
  changeId: string,
): readonly RunFact[] {
  return runs
    .filter((r) => r.changeId === changeId && r.status === 'completed')
    .sort((a, b) => compareRunIdDesc(a.runId, b.runId));
}

// ---------------------------------------------------------------------------
// Stage detection
// ---------------------------------------------------------------------------

/**
 * Detect the current active stage for a Change from its Run history.
 *
 * Scans the Change's completed Runs newest-first; the first Run whose action
 * belongs to a stage's action set determines the stage. With no completed
 * Run, returns `explore` (the Change was just activated).
 *
 * Pure: reads `runs` only, mutates nothing.
 */
export function detectStage(
  runs: readonly RunFact[],
  changeId: string,
): Stage {
  const completed = completedRunsForChange(runs, changeId);
  for (const run of completed) {
    for (const stage of STAGES) {
      const actions = STAGE_ACTION_SETS[stage];
      if ((actions as readonly string[]).includes(run.action)) {
        return stage;
      }
    }
  }
  // No completed Run → Change just activated → explore stage.
  return 'explore';
}



/**
 * Detect the current lifecycle stage using the same bounded Contract Reset
 * projection consumed by Policy/preparation. A reset starts a fresh Proposal
 * generation while preserving the approved Explore discovery, so when the
 * projected Runs contain only Explore lineage the current stage is `propose`.
 */
export function detectCurrentStage(
  snapshot: Pick<FormalFactSnapshot, 'runs' | 'reviewVerdicts' | 'ownerDecisionFacts'>,
  changeId: string,
): Stage {
  const current = projectCurrentContractResetLifecycle(snapshot, changeId);
  const stage = detectStage(current.runs, changeId);
  if (current.resetRefs.length === 0 || stage !== 'explore') return stage;

  const completedExplore = completedRunsForChange(current.runs, changeId)
    .find((run) => run.action === 'explore' || run.action === 'revise-explore');
  if (completedExplore === undefined) return 'explore';
  const approvedExploreReview = completedRunsForChange(current.runs, changeId)
    .filter((run) => run.action === 'review-explore')
    .map((run) => current.reviewVerdicts.find((verdict) => verdict.reviewRunId === run.runId))
    .find((verdict) => verdict !== undefined);
  if (
    approvedExploreReview?.verdict === 'approved'
    && approvedExploreReview.reviewedRunId === completedExplore.runId
  ) {
    return 'propose';
  }
  return 'explore';
}

/**
 * Return the action set for a stage (used by lineage to find Current Artifact
 * Run and Current Review).
 */
export function stageActions(stage: Stage): readonly ChangeAction[] {
  return STAGE_ACTION_SETS[stage];
}

/**
 * Return the artifact-producing actions for a stage: { S, revise-S }.
 *
 * `review-S` does not produce an artifact (it reviews one), so it is excluded
 * from the Current Artifact Run search.
 */
export function artifactActions(stage: Stage): readonly ChangeAction[] {
  switch (stage) {
    case 'explore':
      return ['explore', 'revise-explore'];
    case 'propose':
      return ['propose', 'revise-propose'];
    case 'apply':
      return ['apply', 'revise-apply'];
    case 'archive':
      return ['archive'];
  }
}

/**
 * Return the review action for a stage: `review-S`.
 */
export function reviewAction(stage: Stage): ChangeAction {
  return `review-${stage}` as ChangeAction;
}

/**
 * Return the revise action for a stage: `revise-S`.
 */
export function reviseAction(stage: Stage): ChangeAction {
  return `revise-${stage}` as ChangeAction;
}
