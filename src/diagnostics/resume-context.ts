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
  type PendingRunInspection,
} from './shared.js';

export function renderResumeContext(snapshot: FormalFactSnapshot, pending?: PendingRunInspection): string {
  const policy = next(snapshot);
  const change = activeChange(snapshot);
  if (change === undefined) {
    const lines = [
      line('delivery', snapshot.deliveryId),
      line('change', 'none'),
      line('stage', 'delivery-level'),
      line('last-artifact', 'none'),
      line('last-run', newestRun(snapshot.runs)?.runId ?? 'none'),
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
      line('next-kind', policy.kind),
      line('next-detail', summarizePolicyResult(policy)),
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
  const lines = [
    line('delivery', snapshot.deliveryId),
    line('change', `${change.key} ${change.id}`),
    line('stage', stage),
    line('last-artifact', lastFormalArtifact(snapshot, change, stage)),
    line('last-run', newestRun(snapshot.runs, change.id)?.runId ?? 'none'),
    line('pending-run', pending?.runId ?? 'none'),
    line('pending-action', pending?.action ?? 'none'),
    line('pending-role', pending?.role ?? 'none'),
    line('pending-resume', pending?.status ?? 'none'),
    line('review', latestReviewValue(snapshot, change, stage)),
    line('verification', snapshot.changeVerificationStatus ?? 'unavailable'),
    line('next-kind', policy.kind),
    line('next-detail', summarizePolicyResult(policy)),
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
