import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  recognizeLegacyRun,
  normalizeBootstrapRunStatus,
  discriminateRun,
  discriminateRunForReader,
} from '../../../src/persistence/legacy-recognizer.js';

// ---------------------------------------------------------------------------
// Three-way discriminator (tasks 12.47-12.51)
// ---------------------------------------------------------------------------

describe('discriminateRun — three-way discriminator', () => {
  const runDir = '/repo/.flowkit/runs/D1/C1/20260806-001-explore';

  const c1Context = {
    schemaVersion: 2,
    runId: '20260806-001-explore',
    deliveryId: 'D1',
    changeKey: 'C1',
    changeId: 'C1',
    action: 'explore',
    role: 'author',
    ownerAuthorization: 'required',
    runPath: '.flowkit/runs/D1/C1/20260806-001-explore/',
  };

  it('schemaVersion === 2 → C1 Run path (task 12.47)', () => {
    const result = discriminateRun(c1Context, runDir);
    assert.equal(result.kind, 'c1');
    if (result.kind === 'c1') {
      assert.equal(result.contextFile.runId, '20260806-001-explore');
    }
  });

  it('schemaVersion === 2 but validateContextFile fails → FactConflict (task 12.48)', () => {
    const badC1 = { ...c1Context, action: 'not-an-action' };
    const result = discriminateRun(badC1, runDir);
    assert.equal(result.kind, 'conflict');
    if (result.kind === 'conflict') {
      assert.equal(result.conflict.dimension, 'context-schema');
    }
  });

  it('schemaVersion === 2 but identity fails → FactConflict, not degraded (task 12.48)', () => {
    const result = discriminateRun(c1Context, '/repo/.flowkit/runs/D1/C1/20260806-099-other');
    assert.equal(result.kind, 'conflict');
    if (result.kind === 'conflict') {
      assert.equal(result.conflict.dimension, 'context-identity');
    }
  });

  it('reader-only exact Q1 pre-contract revise context compatibility is byte-bounded', () => {
    const repoRoot = process.cwd();
    const historicalRunDir = join(
      repoRoot,
      '.flowkit/runs/20260810-01-change-execution-loop/core-contract-alignment/20260810-003-revise-explore',
    );
    const raw = readFileSync(join(historicalRunDir, 'context.json'), 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    const strict = discriminateRun(parsed, historicalRunDir);
    assert.equal(strict.kind, 'conflict');

    const compatible = discriminateRunForReader(raw, parsed, historicalRunDir);
    assert.equal(compatible.kind, 'c1');
    if (compatible.kind === 'c1') {
      assert.equal(compatible.contextFile.sourceReviewRun, '20260810-002-review-explore');
      assert.equal(compatible.contextFile.sourceReviewVerdict, 'changes-requested');
    }

    // Same semantic shape with any byte mutation is NOT historical provenance.
    const mutatedRaw = `${raw} `;
    const mutated = discriminateRunForReader(mutatedRaw, parsed, historicalRunDir);
    assert.equal(mutated.kind, 'conflict');
  });

  it('schemaVersion === 1 → legacy path, does not call validateContextFile (task 12.49)', () => {
    const legacy = {
      schemaVersion: 1,
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      action: 'explore',
      role: 'author',
    };
    const result = discriminateRun(legacy, runDir);
    assert.equal(result.kind, 'legacy');
  });

  it('schemaVersion missing → legacy path (task 12.50)', () => {
    const noVersion = {
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      action: 'explore',
      role: 'author',
    };
    const result = discriminateRun(noVersion, runDir);
    assert.equal(result.kind, 'legacy');
  });

  it('schemaVersion === 0 / 3 / negative → FactConflict (task 12.51)', () => {
    for (const sv of [0, 3, -1]) {
      const result = discriminateRun({
        schemaVersion: sv,
        runId: '20260806-001-explore',
        deliveryId: 'D1',
        action: 'explore',
        role: 'author',
      }, runDir);
      assert.equal(result.kind, 'conflict', `schemaVersion ${sv} should be conflict`);
    }
  });
});

// ---------------------------------------------------------------------------
// recognizeLegacyRun (tasks 12.52-12.56)
// ---------------------------------------------------------------------------

describe('recognizeLegacyRun', () => {
  // Real corpus shapes from 054/055/056 Bootstrap Runs.

  it('accepts 054-propose shape: schemaVersion=1, full fields (task 12.52)', () => {
    const context054 = {
      schemaVersion: 1,
      runId: '20260806-054-propose',
      deliveryId: '20260806-01-deterministic-core',
      changeKey: 'C1',
      changeId: 'formal-fact-reader-and-persistence',
      action: 'propose',
      role: 'author',
      ownerAuthorization: 'not-required',
      inputRef: 'd4b1ea6fa1c30f2a55c8a1225dfb3cdc3822073e8da40d1978c773e3d495f0c7',
      sourceReviewRun: '20260806-053-review-explore',
      sourceReviewVerdict: 'approved',
      constraints: {
        mayCreateProposalArtifacts: true,
        mayWriteProductionCode: false,
        commitAllowed: false,
      },
      runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-054-propose/',
    };
    const result = recognizeLegacyRun(context054);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.run.runId, '20260806-054-propose');
      assert.equal(result.run.action, 'propose');
      assert.equal(result.run.status, 'pending');
    }
  });

  it('accepts 055-review-propose shape: missing changeKey/ownerAuthorization/inputRef/runPath (task 12.53)', () => {
    const context055 = {
      schemaVersion: 1,
      runId: '20260806-055-review-propose',
      deliveryId: '20260806-01-deterministic-core',
      changeId: 'formal-fact-reader-and-persistence',
      action: 'review-propose',
      role: 'reviewer',
      status: 'pending',
      input: {
        reviewedRunId: '20260806-054-propose',
        reviewedAction: 'propose',
      },
      constraints: {
        fullTestAuthorized: false,
        reviewScope: 'proposal artifacts',
      },
    };
    const result = recognizeLegacyRun(context055);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.run.role, 'reviewer');
      assert.equal(result.run.changeId, 'formal-fact-reader-and-persistence');
    }
  });

  it('accepts 056-revise-propose shape: contains unknown `findings` field (task 12.54)', () => {
    const context056 = {
      schemaVersion: 1,
      runId: '20260806-056-revise-propose',
      deliveryId: '20260806-01-deterministic-core',
      changeKey: 'C1',
      changeId: 'formal-fact-reader-and-persistence',
      action: 'revise-propose',
      role: 'author',
      ownerAuthorization: 'not-required',
      inputRef: 'b755df42a70a5990a84bb07e767ab460f454adaa0a1fdae1b0a107a0ec444f6e',
      findings: ['C1-PR-001', 'C1-PR-002', 'C1-PR-003'],
      constraints: { mayModifyProposalArtifacts: true },
      runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-056-revise-propose/',
    };
    const result = recognizeLegacyRun(context056);
    assert.equal(result.ok, true);
  });

  it('rejects minimal shape missing runId (task 12.55)', () => {
    const result = recognizeLegacyRun({
      deliveryId: 'D1',
      action: 'explore',
      role: 'author',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.conflict.dimension, 'legacy-run-id');
    }
  });

  it('rejects minimal shape missing action (task 12.55)', () => {
    const result = recognizeLegacyRun({
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      role: 'author',
    });
    assert.equal(result.ok, false);
  });

  it('string-form inputRef → Run.inputRef = undefined (task 12.56)', () => {
    const result = recognizeLegacyRun({
      schemaVersion: 1,
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      action: 'explore',
      role: 'author',
      inputRef: 'some-hash-string',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.run.inputRef, undefined);
    }
  });

  it('rejects invalid action not in catalog', () => {
    const result = recognizeLegacyRun({
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      action: 'review',
      role: 'author',
    });
    assert.equal(result.ok, false);
  });

  it('rejects invalid role', () => {
    const result = recognizeLegacyRun({
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      action: 'explore',
      role: 'bot',
    });
    assert.equal(result.ok, false);
  });
});

// ---------------------------------------------------------------------------
// normalizeBootstrapRunStatus (tasks 12.57-12.59)
// ---------------------------------------------------------------------------

describe('normalizeBootstrapRunStatus', () => {
  it('result.json absent → pending (task 12.58)', () => {
    const result = normalizeBootstrapRunStatus(null, false);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'pending');
    }
  });

  it('result.json status=completed → completed (task 12.57)', () => {
    const result = normalizeBootstrapRunStatus({ status: 'completed' }, true);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'completed');
    }
  });

  it('result.json status=failed → failed (task 12.57)', () => {
    const result = normalizeBootstrapRunStatus({ status: 'failed' }, true);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'failed');
    }
  });

  it('result.json status=cancelled → cancelled (task 12.57)', () => {
    const result = normalizeBootstrapRunStatus({ status: 'cancelled' }, true);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'cancelled');
    }
  });

  it('result.json status missing → FactConflict (task 12.59)', () => {
    const result = normalizeBootstrapRunStatus({ summary: 'no status' }, true);
    assert.equal(result.ok, false);
  });

  it('result.json status invalid value → FactConflict (task 12.59)', () => {
    const result = normalizeBootstrapRunStatus({ status: 'terminal' }, true);
    assert.equal(result.ok, false);
  });

  it('does not degrade to bare "terminal" (task 11.9)', () => {
    // Verify the status is one of completed/failed/cancelled, never "terminal".
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      const result = normalizeBootstrapRunStatus({ status }, true);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.notEqual(result.status, 'terminal');
        assert.notEqual(result.status, 'pending');
      }
    }
  });
});
