import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
import type {
  FormalFactSnapshot,
  RunFact,
  ReviewVerdictFact,
  OwnerAuthorizationFact,
} from '../../../src/facts/formal-fact-snapshot.js';

// ---------------------------------------------------------------------------
// Helpers to build common lifecycle snapshots
// ---------------------------------------------------------------------------

function activeChangeSnapshot(
  runs: readonly RunFact[] = [],
  verdicts: readonly ReviewVerdictFact[] = [],
  auths: readonly OwnerAuthorizationFact[] = [],
): FormalFactSnapshot {
  return buildSnapshot({
    changes: [buildChange({ state: 'active' })],
    runs,
    reviewVerdicts: verdicts,
    ownerAuthorizations: auths,
  });
}

function exploreApprovedSnapshot(): FormalFactSnapshot {
  const explore = buildRun({ nnn: 1, action: 'explore' });
  const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
  const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
  return activeChangeSnapshot([explore, reviewE], [vE]);
}

function proposeApprovedSnapshot(
  auths: readonly OwnerAuthorizationFact[] = [],
): FormalFactSnapshot {
  const explore = buildRun({ nnn: 1, action: 'explore' });
  const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
  const propose = buildRun({ nnn: 3, action: 'propose' });
  const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
  const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
  const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
  return activeChangeSnapshot([explore, reviewE, propose, reviewP], [vE, vP], auths);
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

describe('next — blocked precedence (task 6.2, 6.3, 6.12, 10.16)', () => {
  it('conflicts → blocked formal-fact-conflict (overrides everything, D1-3)', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      conflicts: [buildConflict()],
    });
    const r = next(snap);
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'formal-fact-conflict');
      assert.equal(r.diagnosis.conflicts.length, 1);
    }
  });

  it('no active Delivery → blocked no-active-delivery', () => {
    const r = next(noDeliverySnapshot());
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'no-active-delivery');
    }
  });

  it('multiple active Changes → blocked ambiguous-state', () => {
    const snap = buildSnapshot({
      changes: [
        buildChange({ key: 'D1', state: 'active' }),
        buildChange({ key: 'D2', state: 'active' }),
      ],
    });
    const r = next(snap);
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'ambiguous-state');
    }
  });
});

describe('next — Archive closes Change, Checkpoint follows', () => {
  it('completed Change without checkpoint → owner-decision authorize-checkpoint', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ key: 'Q2', id: 'q2', state: 'completed', required: true })],
    });
    const r = next(snap);
    assert.equal(r.kind, 'owner-decision');
    if (r.kind === 'owner-decision') {
      assert.equal(r.decision, 'authorize-checkpoint');
      assert.equal(r.context.changeKey, 'Q2');
    }
  });

  it('crash/resume: closed Q2 stays checkpoint-pending without re-projecting Q2 Runs; after checkpoint E1 may activate', () => {
    const changes = [
      buildChange({ key: 'Q1', id: 'q1', state: 'completed', required: true }),
      buildChange({ key: 'Q2', id: 'q2', state: 'completed', required: true, dependsOn: ['q1'] }),
      buildChange({ key: 'E1', id: 'e1', state: 'planned', required: true, dependsOn: ['q2'] }),
    ];

    const beforeCheckpoint = next(buildSnapshot({
      changes,
      runs: [],
      gitBoundaries: [buildCheckpointBoundary('q1')],
    }));
    assert.equal(beforeCheckpoint.kind, 'owner-decision');
    if (beforeCheckpoint.kind === 'owner-decision') {
      assert.equal(beforeCheckpoint.decision, 'authorize-checkpoint');
      assert.equal(beforeCheckpoint.context.changeKey, 'Q2');
    }

    const afterCheckpoint = next(buildSnapshot({
      changes,
      runs: [],
      gitBoundaries: [buildCheckpointBoundary('q1'), buildCheckpointBoundary('q2')],
    }));
    assert.equal(afterCheckpoint.kind, 'owner-decision');
    if (afterCheckpoint.kind === 'owner-decision') {
      assert.equal(afterCheckpoint.decision, 'activate-change');
      assert.equal(afterCheckpoint.context.changeKey, 'E1');
    }
  });
});

describe('next — no active Change (task 6.4, 6.5, 10.16)', () => {
  it('planned required Change with deps met → owner-decision activate-change', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ key: 'D1', state: 'planned', required: true, dependsOn: [] })],
    });
    const r = next(snap);
    assert.equal(r.kind, 'owner-decision');
    if (r.kind === 'owner-decision') {
      assert.equal(r.decision, 'activate-change');
      assert.deepEqual(r.context.eligibleChangeKeys, ['D1']);
    }
  });

  it('planned required Change with unmet deps → blocked dependency-incomplete', () => {
    const snap = buildSnapshot({
      changes: [
        buildChange({ key: 'D1', id: 'D1', state: 'planned', required: true, dependsOn: ['B1'] }),
        buildChange({ key: 'B1', id: 'B1', state: 'cancelled', required: true }),
      ],
    });
    const r = next(snap);
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'dependency-incomplete');
    }
  });

  it('no planned required and not all completed → blocked no-actionable-change', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ key: 'D1', state: 'cancelled', required: true })],
    });
    const r = next(snap);
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'no-actionable-change');
    }
  });
});

describe('next — Q1→03 Delivery behavior bridge', () => {
  function allCompletedSnapshot(opts: { fullTestStatus?: unknown; auths?: unknown }): FormalFactSnapshot {
    return buildSnapshot({
      changes: [buildChange({ state: 'completed', required: true })],
      gitBoundaries: [buildCheckpointBoundary()],
      deliveryFullTestStatus: opts.fullTestStatus as never,
      ownerAuthorizations: (opts.auths as never) ?? [],
    });
  }

  it('awaiting-user-decision keeps Owner authorize-full-test decision', () => {
    const r = next(allCompletedSnapshot({ fullTestStatus: 'awaiting-user-decision' }));
    assert.equal(r.kind, 'owner-decision');
    if (r.kind === 'owner-decision') assert.equal(r.decision, 'authorize-full-test');
  });

  it('authorized blocks at Delivery behavior implementation boundary', () => {
    const r = next(allCompletedSnapshot({ fullTestStatus: 'authorized', auths: [buildAuthorization('full-test')] }));
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') assert.equal(r.diagnosis.reason, 'delivery-behavior-not-implemented');
  });

  it('passed without finalize authorization asks Owner', () => {
    const r = next(allCompletedSnapshot({ fullTestStatus: 'passed', auths: [] }));
    assert.equal(r.kind, 'owner-decision');
    if (r.kind === 'owner-decision') assert.equal(r.decision, 'authorize-delivery-finalize');
  });

  it('passed with finalize authorization blocks at Delivery behavior implementation boundary', () => {
    const r = next(allCompletedSnapshot({ fullTestStatus: 'passed', auths: [buildAuthorization('finalize')] }));
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') assert.equal(r.diagnosis.reason, 'delivery-behavior-not-implemented');
  });

  it('failed remains full-test-failed and never auto-runs', () => {
    const r = next(allCompletedSnapshot({ fullTestStatus: 'failed', auths: [buildAuthorization('full-test')] }));
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') assert.equal(r.diagnosis.reason, 'full-test-failed');
  });
});

describe('next — explore stage (task 6.7, 10.8)', () => {
  it('fresh active change (no runs) → action explore', () => {
    const r = next(activeChangeSnapshot());
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'explore');
    }
  });

  it('artifact exists, no review → action review-explore', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const r = next(activeChangeSnapshot([explore]));
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'review-explore');
    }
  });

  it('no match (revise produced new artifact) → action review-explore', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const revise = buildRun({ nnn: 3, action: 'revise-explore' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    const r = next(activeChangeSnapshot([explore, review, revise], [v]));
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'review-explore');
    }
  });

  it('match + approved → action propose', () => {
    const r = next(exploreApprovedSnapshot());
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'propose');
    }
  });

  it('match + changes-requested → action revise-explore', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    const r = next(activeChangeSnapshot([explore, review], [v]));
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'revise-explore');
    }
  });


  it('match + mixed non-author changes-requested stays blocked and never auto-selects re-review', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({
      reviewNnn: 2,
      reviewedRunId: explore.runId,
      verdict: 'changes-requested',
      blockingAuthorities: ['author', 'owner'],
    });
    const r = next(activeChangeSnapshot([explore, review], [v]));
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'non-author-review-blocker');
    }
  });
});

describe('next — propose stage (task 6.8, 10.8)', () => {
  it('propose artifact, no review → action review-propose', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const r = next(activeChangeSnapshot([explore, reviewE, propose], [vE]));
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'review-propose');
    }
  });

  it('match + approved + no apply scope → owner-decision authorize-apply', () => {
    const r = next(proposeApprovedSnapshot());
    assert.equal(r.kind, 'owner-decision');
    if (r.kind === 'owner-decision') {
      assert.equal(r.decision, 'authorize-apply');
    }
  });

  it('match + approved + apply scope → action apply', () => {
    const r = next(proposeApprovedSnapshot([buildAuthorization('apply')]));
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'apply');
    }
  });

  it('match + changes-requested → action revise-propose', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'changes-requested' });
    const r = next(activeChangeSnapshot([explore, reviewE, propose, reviewP], [vE, vP]));
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'revise-propose');
    }
  });
});

describe('next — apply stage (task 6.9, D1-7, 10.8)', () => {
  it('apply artifact, no review → blocked verification-facts-unavailable (D1-7)', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const apply = buildRun({ nnn: 5, action: 'apply' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    const r = next(
      activeChangeSnapshot([explore, reviewE, propose, reviewP, apply], [vE, vP], [
        buildAuthorization('apply'),
      ]),
    );
    // D1-7: review-apply requires Change Verification facts available; the C1
    // snapshot carries none, so `next` fails closed — never action: review-apply.
    // This mirrors canRun(review-apply), which also rejects with
    // verification-facts-unavailable (preconditions.test.ts).
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'verification-facts-unavailable');
    }
  });

  it('match + approved → blocked verification-facts-unavailable (D1-7)', () => {
    const r = next(applyApprovedSnapshot());
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'verification-facts-unavailable');
    }
  });

  it('approved + Verification passed + Tasks complete → authorize-archive', () => {
    const r = next({
      ...applyApprovedSnapshot(),
      changeVerificationStatus: 'passed',
      changeTasksComplete: true,
    });
    assert.equal(r.kind, 'owner-decision');
    if (r.kind === 'owner-decision') assert.equal(r.decision, 'authorize-archive');
  });

  it('approved + Verification passed + Tasks incomplete → blocked tasks-incomplete', () => {
    const r = next({
      ...applyApprovedSnapshot(),
      changeVerificationStatus: 'passed',
      changeTasksComplete: false,
    });
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') assert.equal(r.diagnosis.reason, 'tasks-incomplete');
  });

  it('approved + Verification passed + Tasks complete + archive authorization → archive', () => {
    const base = applyApprovedSnapshot();
    const r = next({
      ...base,
      changeVerificationStatus: 'passed',
      changeTasksComplete: true,
      ownerAuthorizations: [...base.ownerAuthorizations, buildAuthorization('archive')],
    });
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') assert.equal(r.action, 'archive');
  });

  it('match + changes-requested → action revise-apply', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const apply = buildRun({ nnn: 5, action: 'apply' });
    const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: apply.runId, verdict: 'changes-requested' });
    const r = next(
      activeChangeSnapshot([explore, reviewE, propose, reviewP, apply, reviewA], [vE, vP, vA], [
        buildAuthorization('apply'),
      ]),
    );
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'revise-apply');
    }
  });
});

describe('next — archive stage (task 6.10)', () => {
  it('archive Run completed while Change still active → blocked ambiguous-state', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const apply = buildRun({ nnn: 5, action: 'apply' });
    const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
    const archive = buildRun({ nnn: 7, action: 'archive' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: apply.runId, verdict: 'approved' });
    const r = next(
      activeChangeSnapshot(
        [explore, reviewE, propose, reviewP, apply, reviewA, archive],
        [vE, vP, vA],
        [buildAuthorization('apply'), buildAuthorization('archive')],
      ),
    );
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'ambiguous-state');
    }
  });
});

describe('next — failed/cancelled retry (task 6.11, 10.13)', () => {
  it('latest failed explore Run → retry explore (no re-authorization)', () => {
    const explore = buildRun({ nnn: 1, action: 'explore', status: 'failed' });
    const r = next(activeChangeSnapshot([explore]));
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'explore');
    }
  });

  it('latest cancelled review-explore → retry review-explore', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer', status: 'cancelled' });
    const r = next(activeChangeSnapshot([explore, review]));
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'review-explore');
    }
  });

  it('failed apply retry does not require owner re-authorization', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const apply = buildRun({ nnn: 5, action: 'apply', status: 'failed' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    const r = next(
      activeChangeSnapshot([explore, reviewE, propose, reviewP, apply], [vE, vP], [
        buildAuthorization('apply'),
      ]),
    );
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'apply');
    }
  });
});

describe('next — single-round lifecycle path (task 10.10)', () => {
  it('explore → review(approved) → propose → review(approved) → apply → verification gate (D1-7 boundary)', () => {
    const change = buildChange({ state: 'active' });
    // Step 1: fresh active change → explore
    let snap = buildSnapshot({ changes: [change] });
    let r = next(snap);
    assert.equal(r.kind === 'action' && r.action, 'explore');

    // Step 2: explore completed → review-explore
    const explore = buildRun({ nnn: 1, action: 'explore' });
    snap = buildSnapshot({ changes: [change], runs: [explore] });
    r = next(snap);
    assert.equal(r.kind === 'action' && r.action, 'review-explore');

    // Step 3: review-explore approved → propose
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    snap = buildSnapshot({ changes: [change], runs: [explore, reviewE], reviewVerdicts: [vE] });
    r = next(snap);
    assert.equal(r.kind === 'action' && r.action, 'propose');

    // Step 4: propose completed → review-propose
    const propose = buildRun({ nnn: 3, action: 'propose' });
    snap = buildSnapshot({
      changes: [change],
      runs: [explore, reviewE, propose],
      reviewVerdicts: [vE],
    });
    r = next(snap);
    assert.equal(r.kind === 'action' && r.action, 'review-propose');

    // Step 5: review-propose approved (no apply scope) → owner-decision authorize-apply
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    snap = buildSnapshot({
      changes: [change],
      runs: [explore, reviewE, propose, reviewP],
      reviewVerdicts: [vE, vP],
    });
    r = next(snap);
    assert.equal(r.kind === 'owner-decision' && r.decision, 'authorize-apply');

    // Step 6: apply authorized + completed → blocked verification-facts-unavailable
    // (D1-7 boundary). The lifecycle cannot reach review-apply or archive in D1
    // because the C1 snapshot carries no Change Verification status. `next`
    // fails closed at the review-apply verification gate — never returning
    // action: review-apply from unavailable facts — mirroring canRun(review-apply).
    const apply = buildRun({ nnn: 5, action: 'apply' });
    snap = buildSnapshot({
      changes: [change],
      runs: [explore, reviewE, propose, reviewP, apply],
      reviewVerdicts: [vE, vP],
      ownerAuthorizations: [buildAuthorization('apply')],
    });
    r = next(snap);
    assert.equal(r.kind, 'blocked');
    if (r.kind === 'blocked') {
      assert.equal(r.diagnosis.reason, 'verification-facts-unavailable');
    }
  });
});

describe('next — owner-decision vs blocked (task 10.15, 10.16)', () => {
  it('empty ownerAuthorizations yields owner-decision (not blocked) for gated actions', () => {
    const r = next(proposeApprovedSnapshot());
    assert.equal(r.kind, 'owner-decision');
    assert.notEqual(r.kind, 'blocked');
  });

  it('full-test-failed is blocked (not owner-decision) — multiple owner choices', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'completed', required: true })],
      gitBoundaries: [buildCheckpointBoundary()],
      deliveryFullTestStatus: 'failed',
    });
    const r = next(snap);
    assert.equal(r.kind, 'blocked');
    assert.notEqual(r.kind, 'owner-decision');
  });
});

describe('next — purity (task 6.13, 10.19)', () => {
  it('same snapshot yields same result; no currentAction persisted', () => {
    const snap = exploreApprovedSnapshot();
    const r1 = next(snap);
    const r2 = next(snap);
    assert.deepEqual(r1, r2);
  });
});
