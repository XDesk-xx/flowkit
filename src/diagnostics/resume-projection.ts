import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { MANAGED_TOOL_DESCRIPTORS, managedToolHomeExists, resolveManagedToolInvocation, type ManagedToolId } from '../integrations/external-tools/managed-tool.js';
import { next } from '../policy/next.js';
import type { PolicyResult } from '../policy/types.js';
import {
  activeChange,
  currentStage,
  lastFormalArtifact,
  latestReviewValue,
  newestRun,
  type PendingRunInspection,
} from './shared.js';

export type ArchitectureResumeAsset =
  | { readonly status: 'present'; readonly path: string; readonly sha256: string }
  | { readonly status: 'absent'; readonly path: string }
  | { readonly status: 'not-applicable'; readonly path: string };

export type ManagedToolResumeStatus =
  | { readonly status: 'ready'; readonly toolId: ManagedToolId; readonly version: string; readonly source: 'managed' }
  | { readonly status: 'unavailable'; readonly toolId: ManagedToolId; readonly version: string }
  | { readonly status: 'mismatch'; readonly toolId: ManagedToolId; readonly version: string; readonly detail: string };

export interface ResumeProjection {
  readonly deliveryId: string;
  readonly change: { readonly key: string; readonly id: string } | undefined;
  readonly stage: string;
  readonly lastArtifact: string;
  readonly lastRunId: string | undefined;
  readonly pending: PendingRunInspection;
  readonly review: string;
  readonly verification: string;
  readonly policy: PolicyResult;
  readonly architecture: {
    readonly current: ArchitectureResumeAsset;
    readonly planned: ArchitectureResumeAsset;
    readonly actual: ArchitectureResumeAsset;
  };
  readonly managedTools?: Readonly<Record<ManagedToolId, ManagedToolResumeStatus>>;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function architecturePath(deliveryId: string, kind: 'current' | 'planned' | 'actual'): string {
  return `architecture/${deliveryId}/json/${kind}.architecture.json`;
}

function projectArchitectureAsset(
  repoRoot: string,
  deliveryId: string,
  kind: 'current' | 'planned' | 'actual',
  applicable: boolean,
): ArchitectureResumeAsset {
  const path = architecturePath(deliveryId, kind);
  if (!applicable) return { status: 'not-applicable', path };
  const physical = join(repoRoot, path);
  if (!existsSync(physical)) return { status: 'absent', path };
  return { status: 'present', path, sha256: sha256(readFileSync(physical)) };
}

export function resolveResumeProjectionRepoRoot(startPath: string, deliveryId: string): string {
  let current = resolve(startPath);
  while (true) {
    if (existsSync(join(current, 'openspec', 'delivery-groups', `${deliveryId}.yaml`))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(startPath);
    current = parent;
  }
}

export function buildRepositoryStableResumeProjection(input: {
  readonly repoRoot: string;
  readonly snapshot: FormalFactSnapshot;
  readonly pending?: PendingRunInspection;
}): ResumeProjection {
  const change = activeChange(input.snapshot);
  let stage = 'delivery-level';
  let lastArtifact = 'none';
  let review = 'none';
  if (change !== undefined) {
    const changeStage = currentStage(input.snapshot, change);
    stage = changeStage;
    lastArtifact = lastFormalArtifact(input.snapshot, change, changeStage);
    review = latestReviewValue(input.snapshot, change, changeStage);
  }
  const policy = next(input.snapshot);
  const applicable = input.snapshot.deliveryArchitectureImpact !== false;
  return {
    deliveryId: input.snapshot.deliveryId,
    change: change === undefined ? undefined : { key: change.key, id: change.id },
    stage,
    lastArtifact,
    lastRunId: newestRun(input.snapshot.runs, change?.id)?.runId,
    pending: input.pending ?? { status: 'none' },
    review,
    verification: change === undefined ? 'not-applicable' : input.snapshot.changeVerificationStatus ?? 'unavailable',
    policy,
    architecture: {
      current: projectArchitectureAsset(input.repoRoot, input.snapshot.deliveryId, 'current', applicable),
      planned: projectArchitectureAsset(input.repoRoot, input.snapshot.deliveryId, 'planned', applicable),
      actual: projectArchitectureAsset(input.repoRoot, input.snapshot.deliveryId, 'actual', applicable),
    },
  };
}

async function projectManagedTool(toolId: ManagedToolId, env: NodeJS.ProcessEnv): Promise<ManagedToolResumeStatus> {
  const descriptor = MANAGED_TOOL_DESCRIPTORS[toolId];
  if (!(await managedToolHomeExists(toolId, env))) {
    return { status: 'unavailable', toolId, version: descriptor.version };
  }
  try {
    const invocation = await resolveManagedToolInvocation(toolId, { env });
    return { status: 'ready', toolId, version: descriptor.version, source: invocation.source as 'managed' };
  } catch (error) {
    return {
      status: 'mismatch',
      toolId,
      version: descriptor.version,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildResumeProjection(input: {
  readonly repoRoot: string;
  readonly snapshot: FormalFactSnapshot;
  readonly pending?: PendingRunInspection;
  readonly includeManagedTools?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ResumeProjection> {
  const stable = buildRepositoryStableResumeProjection(input);
  if (!input.includeManagedTools) return stable;
  const env = input.env ?? process.env;
  const [openspec, archify] = await Promise.all([
    projectManagedTool('openspec', env),
    projectManagedTool('archify', env),
  ]);
  return { ...stable, managedTools: { openspec, archify } };
}
