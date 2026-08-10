/**
 * D1 policy-engine: test fixtures.
 *
 * Builders for `FormalFactSnapshot` and its sub-types, used across the policy
 * unit tests. Each builder accepts overrides so tests can construct precise
 * snapshots without repeating boilerplate.
 */

import type { ChangeAction, DeliveryAction } from '../../../src/domain/actions.js';
import type {
  ChangeState,
  DeliveryState,
  FullTestStatus,
  VerificationStatus,
  ReviewVerdictValue,
  RunStatus,
} from '../../../src/domain/types.js';
import type {
  ChangeFact,
  FactConflict,
  FormalFactSnapshot,
  GitBoundaryFact,
  OpenSpecArtifactFact,
  OwnerAuthorizationFact,
  ReviewVerdictFact,
  RunFact,
} from '../../../src/facts/formal-fact-snapshot.js';

const DELIVERY_ID = '20260806-01-deterministic-core';
const CHANGE_ID = 'D1';

// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

export interface ChangeSpec {
  readonly key?: string;
  readonly id?: string;
  readonly state?: ChangeState;
  readonly required?: boolean;
  readonly dependsOn?: readonly string[];
}

export function buildChange(spec: ChangeSpec = {}): ChangeFact {
  return {
    key: spec.key ?? 'D1',
    id: spec.id ?? CHANGE_ID,
    state: spec.state ?? 'active',
    required: spec.required ?? true,
    dependsOn: spec.dependsOn ?? [],
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export interface RunSpec {
  readonly nnn: number;
  readonly action: ChangeAction | DeliveryAction;
  readonly status?: RunStatus;
  readonly changeId?: string;
  readonly role?: 'owner' | 'author' | 'reviewer';
}

/**
 * Build a RunFact with a `YYYYMMDD-NNN-action` runId. `changeId` defaults to
 * the D1 Change; pass `''` for a Delivery-level Run (no changeId).
 */
export function buildRun(spec: RunSpec): RunFact {
  const nnnStr = String(spec.nnn).padStart(3, '0');
  const action = String(spec.action);
  return {
    runId: `20260806-${nnnStr}-${action}`,
    deliveryId: DELIVERY_ID,
    ...(spec.changeId === undefined
      ? { changeId: CHANGE_ID }
      : spec.changeId === ''
        ? {}
        : { changeId: spec.changeId }),
    action: spec.action,
    role: spec.role ?? 'author',
    status: spec.status ?? 'completed',
  };
}

// ---------------------------------------------------------------------------
// Review verdict
// ---------------------------------------------------------------------------

export interface VerdictSpec {
  readonly reviewNnn: number;
  readonly reviewedRunId: string;
  readonly verdict?: ReviewVerdictValue;
}

export function buildVerdict(spec: VerdictSpec): ReviewVerdictFact {
  const nnnStr = String(spec.reviewNnn).padStart(3, '0');
  const action = `review-${deriveStageOf(spec.reviewedRunId)}`;
  return {
    reviewRunId: `20260806-${nnnStr}-${action}`,
    verdict: spec.verdict ?? 'approved',
    reviewedRunId: spec.reviewedRunId,
  };
}

function deriveStageOf(runId: string): string {
  if (runId.includes('explore')) {
    return 'explore';
  }
  if (runId.includes('propose')) {
    return 'propose';
  }
  if (runId.includes('apply')) {
    return 'apply';
  }
  return 'explore';
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

export function buildAuthorization(scope: string): OwnerAuthorizationFact {
  return { ref: `auth-${scope}`, scope };
}

// ---------------------------------------------------------------------------
// Git boundary
// ---------------------------------------------------------------------------

export function buildCheckpointBoundary(changeId: string = CHANGE_ID): GitBoundaryFact {
  return {
    kind: 'change-checkpoint',
    commitSha: `checkpoint-${changeId}`,
    summary: `chore(flowkit): checkpoint ${changeId}`,
    changeId,
  };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface SnapshotSpec {
  readonly deliveryState?: DeliveryState | undefined;
  readonly deliveryFullTestStatus?: FullTestStatus | undefined;
  readonly changeVerificationStatus?: VerificationStatus | undefined;
  readonly changeTasksComplete?: boolean | undefined;
  readonly changes?: readonly ChangeFact[];
  readonly runs?: readonly RunFact[];
  readonly reviewVerdicts?: readonly ReviewVerdictFact[];
  readonly ownerAuthorizations?: readonly OwnerAuthorizationFact[];
  readonly gitBoundaries?: readonly GitBoundaryFact[];
  readonly openSpecArtifacts?: readonly OpenSpecArtifactFact[];
  readonly conflicts?: readonly FactConflict[];
}

export function buildSnapshot(spec: SnapshotSpec = {}): FormalFactSnapshot {
  return {
    deliveryId: DELIVERY_ID,
    deliveryState: spec.deliveryState ?? 'active',
    deliveryFullTestStatus: spec.deliveryFullTestStatus ?? undefined,
    ...(spec.changeVerificationStatus !== undefined && { changeVerificationStatus: spec.changeVerificationStatus }),
    ...(spec.changeTasksComplete !== undefined && { changeTasksComplete: spec.changeTasksComplete }),
    changes: spec.changes ?? [buildChange()],
    runs: spec.runs ?? [],
    reviewVerdicts: spec.reviewVerdicts ?? [],
    ownerAuthorizations: spec.ownerAuthorizations ?? [],
    gitBoundaries: spec.gitBoundaries ?? [],
    openSpecArtifacts: spec.openSpecArtifacts ?? [],
    conflicts: spec.conflicts ?? [],
  };
}

/**
 * A snapshot with no active Delivery (deliveryState undefined).
 *
 * Built directly rather than via `buildSnapshot` so `deliveryState` stays
 * `undefined` — `buildSnapshot`'s `?? 'active'` default would otherwise mask
 * the intent and turn this into an active Delivery.
 */
export function noDeliverySnapshot(): FormalFactSnapshot {
  return {
    deliveryId: DELIVERY_ID,
    deliveryState: undefined,
    deliveryFullTestStatus: undefined,
    changes: [],
    runs: [],
    reviewVerdicts: [],
    ownerAuthorizations: [],
    gitBoundaries: [],
    openSpecArtifacts: [],
    conflicts: [],
  };
}

/**
 * A single conflict for fail-closed tests.
 */
export function buildConflict(dimension: string = 'yaml-parse'): FactConflict {
  return {
    dimension,
    authority: 'manifest.yaml',
    message: 'parse error',
  };
}
