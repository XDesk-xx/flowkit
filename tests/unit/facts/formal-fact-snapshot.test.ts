import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  FormalFactSnapshot,
  FactConflict,
  ChangeFact,
  RunFact,
  OpenSpecArtifactFact,
  GitBoundaryFact,
} from '../../../src/facts/formal-fact-snapshot.js';

describe('FormalFactSnapshot', () => {
  it('can be constructed with conflicts field (task 1.1, 1.3, 12.1)', () => {
    const snapshot: FormalFactSnapshot = {
      deliveryId: '20260806-01-deterministic-core',
      deliveryState: 'active',
      deliveryFullTestStatus: 'not-ready',
      changes: [],
      runs: [],
      openSpecArtifacts: [],
      gitBoundaries: [],
      ownerAuthorizations: [],
      reviewVerdicts: [],
      conflicts: [],
    };
    assert.equal(snapshot.deliveryId, '20260806-01-deterministic-core');
    assert.deepEqual(snapshot.conflicts, []);
  });

  it('conflicts may be non-empty (fail-closed)', () => {
    const conflict: FactConflict = {
      dimension: 'yaml-parse',
      authority: 'manifest.yaml',
      message: 'parse error',
    };
    const snapshot: FormalFactSnapshot = {
      deliveryId: 'D1',
      deliveryState: undefined,
      deliveryFullTestStatus: undefined,
      changes: [],
      runs: [],
      openSpecArtifacts: [],
      gitBoundaries: [],
      ownerAuthorizations: [],
      reviewVerdicts: [],
      conflicts: [conflict],
    };
    assert.equal(snapshot.conflicts.length, 1);
    assert.equal(snapshot.conflicts[0]?.dimension, 'yaml-parse');
  });

  it('fields map Policy input list (task 1.2)', () => {
    const change: ChangeFact = {
      key: 'C1',
      id: 'formal-fact-reader-and-persistence',
      state: 'active',
      required: true,
      dependsOn: ['B1'],
    };
    const run: RunFact = {
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      status: 'pending',
    };
    const artifact: OpenSpecArtifactFact = {
      kind: 'change-proposal',
      path: 'openspec/changes/C1/proposal.md',
      exists: true,
    };
    const boundary: GitBoundaryFact = {
      kind: 'delivery-start',
      commitSha: 'abc123',
      summary: 'chore(flowkit): start D1',
    };
    const snapshot: FormalFactSnapshot = {
      deliveryId: 'D1',
      deliveryState: 'active',
      deliveryFullTestStatus: 'not-ready',
      changes: [change],
      runs: [run],
      openSpecArtifacts: [artifact],
      gitBoundaries: [boundary],
      ownerAuthorizations: [{ ref: 'auth-1', scope: 'apply' }],
      reviewVerdicts: [],
      conflicts: [],
    };
    assert.equal(snapshot.changes.length, 1);
    assert.equal(snapshot.runs.length, 1);
    assert.equal(snapshot.openSpecArtifacts.length, 1);
    assert.equal(snapshot.gitBoundaries.length, 1);
    assert.equal(snapshot.ownerAuthorizations.length, 1);
  });
});
