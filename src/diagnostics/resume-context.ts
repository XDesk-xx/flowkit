import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import {
  buildRepositoryStableResumeProjection,
  resolveResumeProjectionRepoRoot,
  type ArchitectureResumeAsset,
} from './resume-projection.js';
import {
  line,
  summarizePolicyResult,
  type PendingRunInspection,
} from './shared.js';

function renderArchitecture(asset: ArchitectureResumeAsset): string {
  if (asset.status === 'present') return `present; path=${asset.path}; sha256=${asset.sha256}`;
  return `${asset.status}; path=${asset.path}`;
}

export function renderResumeContext(
  snapshot: FormalFactSnapshot,
  pending?: PendingRunInspection,
  options: { readonly repoRoot?: string } = {},
): string {
  const repoRoot = options.repoRoot ?? resolveResumeProjectionRepoRoot(process.cwd(), snapshot.deliveryId);
  const projection = buildRepositoryStableResumeProjection({ repoRoot, snapshot, ...(pending !== undefined && { pending }) });
  const lines = [
    line('delivery', projection.deliveryId),
    line('change', projection.change === undefined ? 'none' : `${projection.change.key} ${projection.change.id}`),
    line('stage', projection.stage),
    line('last-artifact', projection.lastArtifact),
    line('last-run', projection.lastRunId ?? 'none'),
  ];
  if (projection.change !== undefined || pending?.runId !== undefined) {
    lines.push(
      line('pending-run', projection.pending.runId ?? 'none'),
      line('pending-action', projection.pending.action ?? 'none'),
      line('pending-role', projection.pending.role ?? 'none'),
      line('pending-resume', projection.pending.status),
    );
  }
  lines.push(
    line('review', projection.review),
    line('verification', projection.verification),
    line('architecture-current', renderArchitecture(projection.architecture.current)),
    line('architecture-planned', renderArchitecture(projection.architecture.planned)),
    line('architecture-actual', renderArchitecture(projection.architecture.actual)),
    line('next-kind', projection.policy.kind),
    line('next-detail', summarizePolicyResult(projection.policy)),
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
