/**
 * Q2 orchestration-authority-boundary-correction: local stage lineage helpers.
 *
 * This module deliberately does NOT model repository-wide artifact generations,
 * supersession, revision windows, verification generations, or archive
 * relocation. Mutable OpenSpec artifacts remain owned by OpenSpec. Flowkit only
 * needs a small current-stage helper while establishing a review handoff.
 */

import type { ReviewVerdictValue, RunStatus } from '../domain/types.js';

/** Minimal persisted lineage fact used by local entry validation. */
export interface LineageFact {
  readonly runId: string;
  readonly changeId?: string;
  readonly action: string;
  readonly status: RunStatus;
  readonly sourceReviewRun?: string;
  readonly sourceReviewVerdict?: ReviewVerdictValue;
  readonly reviewedRunId?: string;
}

export type ArtifactStage = 'explore' | 'propose';

/** Return the artifact stage produced by an Action, if any. */
export function artifactStage(action: string): ArtifactStage | undefined {
  switch (action) {
    case 'explore':
    case 'revise-explore':
      return 'explore';
    case 'propose':
    case 'revise-propose':
      return 'propose';
    default:
      return undefined;
  }
}

/**
 * Return the latest completed artifact-producing Run for one current Change
 * stage. Run IDs are Delivery-scoped monotonic execution identifiers; here they
 * are used only to choose the latest current-stage producer for an immediate
 * review handoff, never to infer historical supersession authority.
 */
export function latestCompletedArtifactRunId(
  runs: readonly LineageFact[],
  changeId: string,
  stage: ArtifactStage,
): string | undefined {
  const candidates = runs
    .filter(
      (run) =>
        run.changeId === changeId &&
        run.status === 'completed' &&
        artifactStage(run.action) === stage,
    )
    .map((run) => run.runId)
    .sort((a, b) => a.localeCompare(b));
  return candidates.at(-1);
}

/**
 * D1 bounded reset identity helper. This is not a generation registry: it only
 * compares the current Manifest-projected Contract Reset refs with the refs
 * frozen into one Run at preparation time.
 */
export function currentContractResetRefs(
  ownerDecisionFacts: readonly { readonly ref: string; readonly decision: string; readonly changeId?: string }[] | undefined,
  changeId: string,
): readonly string[] {
  return (ownerDecisionFacts ?? [])
    .filter((fact) => fact.decision === 'contract-reset' && fact.changeId === changeId)
    .map((fact) => fact.ref)
    .sort();
}

export function runMatchesContractResetIdentity(
  run: { readonly ownerFactRefs?: readonly { readonly ref: string; readonly decision: string }[] },
  currentRefs: readonly string[],
): boolean {
  if (currentRefs.length === 0) return true;
  const runRefs = (run.ownerFactRefs ?? [])
    .filter((fact) => fact.decision === 'contract-reset')
    .map((fact) => fact.ref)
    .sort();
  return JSON.stringify(runRefs) === JSON.stringify([...currentRefs].sort());
}
