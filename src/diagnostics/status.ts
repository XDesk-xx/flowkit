import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { activeChange, currentStage, latestReviewValue, line, newestRun, type PendingRunInspection } from './shared.js';

export function renderStatus(snapshot: FormalFactSnapshot, pending?: PendingRunInspection): string {
  const change = activeChange(snapshot);
  if (change === undefined) {
    const lastRun = newestRun(snapshot.runs);
    const lines = [
      line('delivery', snapshot.deliveryId),
      line('delivery-state', snapshot.deliveryState ?? 'unavailable'),
      line('change', 'none'),
      line('change-state', 'none'),
      line('stage', 'delivery-level'),
      line('last-run', lastRun?.runId ?? 'none'),
    ];
    if (pending?.runId !== undefined) {
      lines.push(
        line('pending-run', pending.runId),
        line('pending-action', pending.action ?? 'none'),
        line('pending-role', pending.role ?? 'none'),
        line('pending-resume', pending.status),
      );
    }
    lines.push(
      line('review', 'none'),
      line('verification', 'not-applicable'),
      line('full-test', snapshot.deliveryFullTestStatus ?? 'unavailable'),
      line('conflicts', snapshot.conflicts.length),
    );
    if (snapshot.currentDeliveryFullTestFinding !== undefined) {
      lines.push(
        line('finding-id', snapshot.currentDeliveryFullTestFinding.findingId),
        line('authorization-ref', snapshot.currentDeliveryFullTestFinding.authorizationRef),
        line('source-result-ref', snapshot.currentDeliveryFullTestFinding.sourceResultRef),
      );
    }
    return `${lines.join('\n')}\n`;
  }

  const stage = currentStage(snapshot, change);
  const lastRun = newestRun(snapshot.runs, change.id);
  const lines = [
    line('delivery', snapshot.deliveryId),
    line('delivery-state', snapshot.deliveryState ?? 'unavailable'),
    line('change', `${change.key} ${change.id}`),
    line('change-state', change.state),
    line('stage', stage),
    line('last-run', lastRun?.runId ?? 'none'),
    line('pending-run', pending?.runId ?? 'none'),
    line('pending-resume', pending?.status ?? 'none'),
    line('review', latestReviewValue(snapshot, change, stage)),
    line('verification', snapshot.changeVerificationStatus ?? 'unavailable'),
    line('full-test', snapshot.deliveryFullTestStatus ?? 'unavailable'),
    line('conflicts', snapshot.conflicts.length),
  ];
  if (snapshot.currentDeliveryFullTestFinding !== undefined) {
    lines.push(
      line('finding-id', snapshot.currentDeliveryFullTestFinding.findingId),
      line('authorization-ref', snapshot.currentDeliveryFullTestFinding.authorizationRef),
      line('source-result-ref', snapshot.currentDeliveryFullTestFinding.sourceResultRef),
    );
  }
  return `${lines.join('\n')}\n`;
}
