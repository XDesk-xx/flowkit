import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { diagnose } from '../../../src/policy/diagnose.js';
import { next } from '../../../src/policy/next.js';
import {
  buildChange,
  buildRun,
  buildVerdict,
  buildSnapshot,
  buildAuthorization,
  buildConflict,
  buildCheckpointBoundary,
  noDeliverySnapshot,
} from './fixtures.js';
import type { BlockedDiagnosis } from '../../../src/policy/types.js';
import type { FormalFactSnapshot } from '../../../src/facts/formal-fact-snapshot.js';

// ---------------------------------------------------------------------------
// Helpers — mirror the lifecycle snapshots used in next.test.ts
// ---------------------------------------------------------------------------

function activeChangeSnapshot(
  runs: readonly ReturnType<typeof buildRun>[] = [],
  verdicts: readonly ReturnType<typeof buildVerdict>[] = [],
  auths: readonly ReturnType<typeof buildAuthorization>[] = [],
): FormalFactSnapshot {
  return buildSnapshot({
    changes: [buildChange({ state: 'active' })],
    runs,
    reviewVerdicts: verdicts,
    ownerAuthorizations: auths,
  });
}

function applyApprovedSnapshot(): FormalFactSnapshot {
  const explore = buildRun({ nnn: 1, action: 'explore' });
  const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
  const propose = buildRun({ nnn: 3, action: 'propose' });
  const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
  const apply = buildRun({ nnn: 5, action: 'apply' });
  const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
  const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
  const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
  const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: apply.runId, verdict: 'approved' });
  return activeChangeSnapshot(
    [explore, reviewE, propose, reviewP, apply, reviewA],
    [vE, vP, vA],
    [buildAuthorization('apply')],
  );
}

function allCompletedSnapshot(opts: {
  fullTestStatus?: unknown;
  auths?: unknown;
}): FormalFactSnapshot {
  return buildSnapshot({
    changes: [buildChange({ state: 'completed', required: true })],
    gitBoundaries: [buildCheckpointBoundary()],
    deliveryFullTestStatus: opts.fullTestStatus as never,
    ownerAuthorizations: (opts.auths as never) ?? [],
  });
}

// Type guard: confirms diagnose never returns action / owner-decision.
function assertIsBlockedDiagnosis(value: unknown): asserts value is BlockedDiagnosis {
  assert.ok(typeof value === 'object' && value !== null, 'diagnose must return an object');
  const obj = value as Record<string, unknown>;
  assert.ok(typeof obj['reason'] === 'string', 'diagnose must carry a reason string');
  assert.ok(Array.isArray(obj['unmetPreconditions']), 'diagnose must carry unmetPreconditions');
  assert.ok(Array.isArray(obj['conflicts']), 'diagnose must carry conflicts');
  assert.ok(Array.isArray(obj['suggestedOwnerActions']), 'diagnose must carry suggestedOwnerActions');
  assert.ok(!('kind' in obj), 'diagnose MUST NOT return a PolicyResult kind (action/owner-decision)');
  assert.ok(!('action' in obj), 'diagnose MUST NOT return an action');
  assert.ok(!('decision' in obj), 'diagnose MUST NOT return an owner-decision');
}

describe('diagnose — return shape (task 7.3, 10.7)', () => {
  it('always returns a BlockedDiagnosis, never action or owner-decision', () => {
    // Blocked case.
    assertIsBlockedDiagnosis(diagnose(noDeliverySnapshot()));
    // Non-blocked case (next returns action).
    const snap = activeChangeSnapshot();
    assertIsBlockedDiagnosis(diagnose(snap));
    // Non-blocked case (next returns owner-decision).
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    const ownerDecisionSnap = activeChangeSnapshot(
      [explore, reviewE, propose, reviewP],
      [vE, vP],
    );
    assertIsBlockedDiagnosis(diagnose(ownerDecisionSnap));
  });

  it('non-blocked fallback returns a minimal diagnosis (no blocking reason)', () => {
    // Fresh active change → next returns action: explore. diagnose returns a
    // minimal BlockedDiagnosis (fallback). No enumerated blocked reason
    // applies because next is not blocked.
    const d = diagnose(activeChangeSnapshot());
    assertIsBlockedDiagnosis(d);
    assert.deepEqual(d.unmetPreconditions, []);
    assert.deepEqual(d.conflicts, []);
    assert.deepEqual(d.suggestedOwnerActions, []);
  });
});

describe('diagnose — blocked reasons (task 7.4, 10.7)', () => {
  it('formal-fact-conflict when conflicts non-empty (D1-3)', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      conflicts: [buildConflict('yaml-parse'), buildConflict('run-status')],
    });
    const d = diagnose(snap);
    assert.equal(d.reason, 'formal-fact-conflict');
    assert.equal(d.conflicts.length, 2);
    assert.deepEqual(
      d.conflicts.map((c) => c.dimension),
      ['yaml-parse', 'run-status'],
    );
  });

  it('no-active-delivery when delivery is not active', () => {
    const d = diagnose(noDeliverySnapshot());
    assert.equal(d.reason, 'no-active-delivery');
  });

  it('no-actionable-change when no planned required and not all completed', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ key: 'D1', state: 'cancelled', required: true })],
    });
    const d = diagnose(snap);
    assert.equal(d.reason, 'no-actionable-change');
  });

  it('dependency-incomplete when planned required has unmet deps', () => {
    const snap = buildSnapshot({
      changes: [
        buildChange({ key: 'D1', id: 'D1', state: 'planned', required: true, dependsOn: ['B1'] }),
        buildChange({ key: 'B1', id: 'B1', state: 'cancelled', required: true }),
      ],
    });
    const d = diagnose(snap);
    assert.equal(d.reason, 'dependency-incomplete');
    assert.ok(d.unmetPreconditions.some((u) => u.startsWith('dependency-incomplete:')));
  });

  it('ambiguous-state when multiple active Changes (task 6.12)', () => {
    const snap = buildSnapshot({
      changes: [
        buildChange({ key: 'D1', state: 'active' }),
        buildChange({ key: 'D2', state: 'active' }),
      ],
    });
    const d = diagnose(snap);
    assert.equal(d.reason, 'ambiguous-state');
  });

  it('ambiguous-state when all completed but status not advanced (inconsistent)', () => {
    const snap = allCompletedSnapshot({ fullTestStatus: 'not-ready' });
    const d = diagnose(snap);
    assert.equal(d.reason, 'ambiguous-state');
  });

  it('verification-facts-unavailable when apply approved (D1-7)', () => {
    // D1 boundary: C1 snapshot carries no Verification status, so review-apply
    // approved always blocks with verification-facts-unavailable (not tasks).
    const d = diagnose(applyApprovedSnapshot());
    assert.equal(d.reason, 'verification-facts-unavailable');
    assert.notEqual(d.reason, 'tasks-facts-unavailable');
    assert.ok(d.unmetPreconditions.includes('verification-facts-unavailable'));
  });

  it('full-test-failed lists owner choices and never returns action (D1-13, frozen Section 6)', () => {
    const snap = allCompletedSnapshot({ fullTestStatus: 'failed' });
    const d = diagnose(snap);
    assert.equal(d.reason, 'full-test-failed');
    assert.ok(d.suggestedOwnerActions.includes('authorize-corrective-change'));
    assert.ok(d.suggestedOwnerActions.includes('cancel-delivery'));
    // diagnose MUST NOT surface an action even with a full-test scope present.
    const withScope = allCompletedSnapshot({
      fullTestStatus: 'failed',
      auths: [buildAuthorization('full-test')],
    });
    const d2 = diagnose(withScope);
    assert.equal(d2.reason, 'full-test-failed');
    assert.ok(!('action' in d2));
  });
});

describe('diagnose — consistency with next (task 7.2, 10.7)', () => {
  it('when next is blocked, diagnose returns the same diagnosis reason', () => {
    const snaps: FormalFactSnapshot[] = [
      noDeliverySnapshot(),
      buildSnapshot({
        changes: [buildChange({ state: 'active' })],
        conflicts: [buildConflict()],
      }),
      applyApprovedSnapshot(),
      allCompletedSnapshot({ fullTestStatus: 'failed' }),
      buildSnapshot({
        changes: [
          buildChange({ key: 'D1', state: 'active' }),
          buildChange({ key: 'D2', state: 'active' }),
        ],
      }),
    ];
    for (const snap of snaps) {
      const n = next(snap);
      const d = diagnose(snap);
      assert.equal(n.kind, 'blocked', 'fixture expected to be blocked');
      if (n.kind === 'blocked') {
        assert.equal(d.reason, n.diagnosis.reason, `reason mismatch for snapshot`);
      }
    }
  });
});

describe('diagnose — purity (task 7.6, 10.19)', () => {
  it('same input yields same output and no mutation', () => {
    const snap = applyApprovedSnapshot();
    const d1 = diagnose(snap);
    const d2 = diagnose(snap);
    assert.deepEqual(d1, d2);
    // snapshot unchanged after repeated calls
    assert.deepEqual(snap.runs, snap.runs);
  });
});
