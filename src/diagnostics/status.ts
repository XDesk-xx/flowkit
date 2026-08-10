import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { activeChange, currentStage, latestReviewValue, line, newestRun } from './shared.js';

export function renderStatus(snapshot: FormalFactSnapshot): string {
  const change = activeChange(snapshot);
  if (change === undefined) {
    const lastRun = newestRun(snapshot.runs);
    return `${[
      line('delivery', snapshot.deliveryId),
      line('delivery-state', snapshot.deliveryState ?? 'unavailable'),
      line('change', 'none'),
      line('change-state', 'none'),
      line('stage', 'delivery-level'),
      line('last-run', lastRun?.runId ?? 'none'),
      line('review', 'none'),
      line('verification', 'not-applicable'),
      line('full-test', snapshot.deliveryFullTestStatus ?? 'unavailable'),
      line('conflicts', snapshot.conflicts.length),
    ].join('\n')}\n`;
  }

  const stage = currentStage(snapshot, change);
  const lastRun = newestRun(snapshot.runs, change.id);
  return `${[
    line('delivery', snapshot.deliveryId),
    line('delivery-state', snapshot.deliveryState ?? 'unavailable'),
    line('change', `${change.key} ${change.id}`),
    line('change-state', change.state),
    line('stage', stage),
    line('last-run', lastRun?.runId ?? 'none'),
    line('review', latestReviewValue(snapshot, change, stage)),
    line('verification', snapshot.changeVerificationStatus ?? 'unavailable'),
    line('full-test', snapshot.deliveryFullTestStatus ?? 'unavailable'),
    line('conflicts', snapshot.conflicts.length),
  ].join('\n')}\n`;
}
