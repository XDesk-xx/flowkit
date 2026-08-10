import type { ChangeFact, FormalFactSnapshot, OpenSpecArtifactFact, RunFact } from '../facts/formal-fact-snapshot.js';
import { computeLineage, currentArtifactRun } from '../policy/lineage.js';
import { detectStage, stageActions } from '../policy/stage-detector.js';
import type { Stage } from '../policy/stage-detector.js';
import type { PolicyResult } from '../policy/types.js';

export function escapeScalar(value: string): string {
  return value.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

export function line(key: string, value: string | number): string {
  return `${key}: ${escapeScalar(String(value))}`;
}

export function activeChange(snapshot: FormalFactSnapshot): ChangeFact | undefined {
  return snapshot.changes.find((change) => change.state === 'active');
}

export function newestRun(runs: readonly RunFact[], changeId?: string): RunFact | undefined {
  const filtered = changeId === undefined ? runs : runs.filter((run) => run.changeId === changeId);
  return [...filtered].sort((a, b) => b.runId.localeCompare(a.runId))[0];
}

export function currentStage(snapshot: FormalFactSnapshot, change: ChangeFact): Stage {
  return detectStage(snapshot.runs, change.id);
}

export function latestReviewValue(snapshot: FormalFactSnapshot, change: ChangeFact, stage: Stage): string {
  const lineage = computeLineage(snapshot.runs, snapshot.reviewVerdicts, change.id, stage);
  return lineage.review?.verdict ?? 'none';
}

function artifactKindsForStage(stage: Stage): readonly OpenSpecArtifactFact['kind'][] {
  switch (stage) {
    case 'explore':
      return ['change-explore'];
    case 'propose':
      return ['change-tasks', 'change-design', 'change-spec', 'change-proposal'];
    case 'apply':
    case 'archive':
      return ['change-verification', 'change-tasks'];
  }
}

function belongsToChange(artifact: OpenSpecArtifactFact, changeId: string): boolean {
  return artifact.path.startsWith(`openspec/changes/${changeId}/`);
}

export function lastFormalArtifact(
  snapshot: FormalFactSnapshot,
  change: ChangeFact,
  stage: Stage,
): string {
  for (const kind of artifactKindsForStage(stage)) {
    const artifact = snapshot.openSpecArtifacts.find(
      (candidate) => candidate.kind === kind && candidate.exists && belongsToChange(candidate, change.id),
    );
    if (artifact !== undefined) return artifact.path;
  }
  return 'none';
}

export function stageHasFormalArtifact(
  snapshot: FormalFactSnapshot,
  change: ChangeFact,
  stage: Stage,
): boolean {
  return lastFormalArtifact(snapshot, change, stage) !== 'none';
}

export function hasCompletedCurrentArtifactRun(
  snapshot: FormalFactSnapshot,
  change: ChangeFact,
  stage: Stage,
): boolean {
  return currentArtifactRun(snapshot.runs, change.id, stage) !== null;
}

export function isPendingRunResumable(
  snapshot: FormalFactSnapshot,
  change: ChangeFact,
  stage: Stage,
  run: RunFact,
  policy: PolicyResult,
): boolean {
  if (run.changeId !== change.id || run.status !== 'pending') return false;
  if ((stageActions(stage) as readonly string[]).includes(run.action)) return true;
  if (policy.kind === 'action' && policy.action === run.action) return true;
  if (policy.kind === 'owner-decision') {
    const actionByDecision: Partial<Record<typeof policy.decision, string>> = {
      'authorize-apply': 'apply',
      'authorize-archive': 'archive',
      'authorize-full-test': 'full-test',
      'authorize-delivery-finalize': 'delivery-finalize',
    };
    return actionByDecision[policy.decision] === run.action;
  }
  return false;
}

export function summarizePolicyResult(result: PolicyResult): string {
  switch (result.kind) {
    case 'action':
      return `action=${result.action}`;
    case 'owner-decision': {
      const parts = [`decision=${result.decision}`];
      if (result.context.changeKey !== undefined) parts.push(`change=${result.context.changeKey}`);
      if (result.context.deliveryFullTestStatus !== undefined) parts.push(`full-test=${result.context.deliveryFullTestStatus}`);
      if (result.context.detail !== undefined) parts.push(`detail=${escapeScalar(result.context.detail)}`);
      return parts.join('; ');
    }
    case 'blocked':
      return `reason=${result.diagnosis.reason}`;
  }
}
