import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { next } from '../policy/next.js';
import {
  activeChange,
  currentStage,
  lastFormalArtifact,
  latestReviewValue,
  line,
  newestRun,
  summarizePolicyResult,
} from './shared.js';

export function renderResumeContext(snapshot: FormalFactSnapshot): string {
  const policy = next(snapshot);
  const change = activeChange(snapshot);
  if (change === undefined) {
    return `${[
      line('delivery', snapshot.deliveryId),
      line('change', 'none'),
      line('stage', 'delivery-level'),
      line('last-artifact', 'none'),
      line('last-run', newestRun(snapshot.runs)?.runId ?? 'none'),
      line('review', 'none'),
      line('verification', 'not-applicable'),
      line('next-kind', policy.kind),
      line('next-detail', summarizePolicyResult(policy)),
    ].join('\n')}\n`;
  }
  const stage = currentStage(snapshot, change);
  return `${[
    line('delivery', snapshot.deliveryId),
    line('change', `${change.key} ${change.id}`),
    line('stage', stage),
    line('last-artifact', lastFormalArtifact(snapshot, change, stage)),
    line('last-run', newestRun(snapshot.runs, change.id)?.runId ?? 'none'),
    line('review', latestReviewValue(snapshot, change, stage)),
    line('verification', snapshot.changeVerificationStatus ?? 'unavailable'),
    line('next-kind', policy.kind),
    line('next-detail', summarizePolicyResult(policy)),
  ].join('\n')}\n`;
}
