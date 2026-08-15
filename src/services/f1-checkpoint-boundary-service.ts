import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { getCompletedUncheckpointedChanges } from '../policy/preconditions.js';
import { next } from '../policy/next.js';
import { FlowkitError } from '../shared/errors.js';

export interface CheckpointBoundaryHandoff {
  readonly deliveryId: string;
  readonly changeId: string;
  readonly ownerAuthorizationRef: string;
  readonly subject: string;
  readonly trailers: readonly string[];
  readonly preflight: readonly ['git diff --check', 'git diff --cached --check'];
}

/**
 * Prepare the deterministic Git handoff for the one completed/uncheckpointed
 * Change. This service is read-only: it never commits, pushes, creates a Run,
 * or persists a second checkpoint state.
 */
export async function prepareCheckpointBoundaryHandoff(
  repoRoot: string,
  deliveryId: string,
): Promise<CheckpointBoundaryHandoff> {
  const snapshot = await readFormalFactSnapshot({
    repoRoot,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
  assertConflictFree(snapshot);

  const target = getCompletedUncheckpointedChanges(snapshot);
  if (target.length !== 1) {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_TARGET_UNAVAILABLE',
      'Checkpoint handoff requires exactly one completed/uncheckpointed Change',
      { changeIds: target.map((change) => change.id) },
    );
  }
  const change = target[0]!;
  const policy = next(snapshot);
  if (policy.kind !== 'owner-decision' || policy.decision !== 'authorize-checkpoint') {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_NOT_ALLOWED',
      'Current Policy is not requesting authorize-checkpoint',
      { policyKind: policy.kind, ...(policy.kind === 'owner-decision' ? { decision: policy.decision } : {}) },
    );
  }

  const authorizations = snapshot.ownerAuthorizations.filter((fact) =>
    fact.decision === 'authorize-checkpoint' &&
    fact.deliveryId === deliveryId &&
    fact.changeId === change.id
  );
  if (authorizations.length !== 1) {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_AUTHORITY_UNAVAILABLE',
      'Checkpoint handoff requires exactly one matching authorize-checkpoint Owner fact',
      { deliveryId, changeId: change.id, ownerRefs: authorizations.map((fact) => fact.ref) },
    );
  }

  const owner = authorizations[0]!;
  return {
    deliveryId,
    changeId: change.id,
    ownerAuthorizationRef: owner.ref,
    subject: `chore(flowkit): checkpoint ${change.id}`,
    trailers: [
      `Flowkit-Delivery: ${deliveryId}`,
      `Flowkit-Change: ${change.id}`,
      'Flowkit-Boundary: change-checkpoint',
      `Owner-Authorization: ${owner.ref}`,
    ],
    preflight: ['git diff --check', 'git diff --cached --check'],
  };
}

function assertConflictFree(snapshot: FormalFactSnapshot): void {
  if (snapshot.conflicts.length > 0) {
    throw new FlowkitError('FORMAL_FACT_CONFLICT', 'formal facts contain conflicts', {
      dimensions: snapshot.conflicts.map((conflict) => conflict.dimension),
    });
  }
}
