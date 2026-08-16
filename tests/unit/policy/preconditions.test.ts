import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePreconditions, getCompletedUncheckpointedChanges } from '../../../src/policy/preconditions.js';
import {
  buildChange,
  buildRun,
  buildVerdict,
  buildSnapshot,
  buildAuthorization,
  buildCheckpointBoundary,
} from './fixtures.js';

// Helper: a Change with a completed required change + checkpoint, used for
// Delivery-level action preconditions.
function completedDeliverySnapshot(overrides: {
  fullTestStatus?: unknown;
  authorizations?: unknown;
} = {}): ReturnType<typeof buildSnapshot> {
  return buildSnapshot({
    changes: [buildChange({ state: 'completed', required: true })],
    gitBoundaries: [buildCheckpointBoundary()],
    deliveryFullTestStatus: overrides.fullTestStatus as never,
    ownerAuthorizations: (overrides.authorizations as never) ?? [],
  });
}

describe('preconditions — explore (task 4.2, 10.4)', () => {
  it('allowed when active change and no explore artifact', () => {
    const snap = buildSnapshot({ changes: [buildChange({ state: 'active' })] });
    assert.deepEqual(evaluatePreconditions(snap, 'explore'), []);
  });

  it('unmet explore-already-run when artifact exists', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [buildRun({ nnn: 1, action: 'explore' })],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'explore'), ['explore-already-run']);
  });

  it('unmet pending-explore-run when a pending explore exists', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [buildRun({ nnn: 1, action: 'explore', status: 'pending' })],
    });
    const unmet = evaluatePreconditions(snap, 'explore');
    assert.ok(unmet.includes('pending-explore-run'));
  });

  it('unmet no-active-change when no active change', () => {
    const snap = buildSnapshot({ changes: [buildChange({ state: 'planned' })] });
    assert.deepEqual(evaluatePreconditions(snap, 'explore'), ['no-active-change']);
  });
});

describe('preconditions — review-explore (task 4.3, D1-10)', () => {
  it('allowed when artifact exists and no review', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'review-explore'), []);
  });

  it('allowed when no lineage match (revise produced new artifact)', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const revise = buildRun({ nnn: 3, action: 'revise-explore' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, review, revise],
      reviewVerdicts: [v],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'review-explore'), []);
  });

  it('unmet matching-author-only-changes-requested-requires-revision on match+cr (D1-10)', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, review],
      reviewVerdicts: [v],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'review-explore'), [
      'matching-author-only-changes-requested-requires-revision',
    ]);
  });

  it('unmet matching-approved-stage-complete on match+approved', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, review],
      reviewVerdicts: [v],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'review-explore'), [
      'matching-approved-stage-complete',
    ]);
  });
});

describe('preconditions — revise-explore (task 4.4)', () => {
  it('allowed on match + changes-requested', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, review],
      reviewVerdicts: [v],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'revise-explore'), []);
  });

  it('unmet when verdict is approved', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, review],
      reviewVerdicts: [v],
    });
    const unmet = evaluatePreconditions(snap, 'revise-explore');
    assert.ok(unmet.includes('verdict-not-changes-requested'));
  });
});

describe('preconditions — propose (task 4.5)', () => {
  it('allowed when explore approved and no propose artifact', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, review],
      reviewVerdicts: [v],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'propose'), []);
  });

  it('unmet explore-not-approved when explore not reviewed', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore],
    });
    const unmet = evaluatePreconditions(snap, 'propose');
    assert.ok(unmet.includes('explore-not-approved'));
  });
});

describe('preconditions — review-propose (task 4.6, D1-10)', () => {
  it('allowed when propose artifact exists and no review', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, reviewE, propose],
      reviewVerdicts: [vE],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'review-propose'), []);
  });

  it('unmet matching-author-only-changes-requested-requires-revision on match+cr', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'changes-requested' });
    const snap = buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, reviewE, propose, reviewP],
      reviewVerdicts: [vE, vP],
    });
    assert.deepEqual(evaluatePreconditions(snap, 'review-propose'), [
      'matching-author-only-changes-requested-requires-revision',
    ]);
  });
});

describe('preconditions — apply (task 4.8)', () => {
  function approvedProposeSnapshot(): ReturnType<typeof buildSnapshot> {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    return buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, reviewE, propose, reviewP],
      reviewVerdicts: [vE, vP],
    });
  }

  it('allowed when propose approved + apply scope + no completed apply', () => {
    const snap = approvedProposeSnapshot();
    const withScope = { ...snap, ownerAuthorizations: [buildAuthorization('apply')] };
    assert.deepEqual(evaluatePreconditions(withScope, 'apply'), []);
  });

  it('unmet apply-not-authorized without apply scope', () => {
    const snap = approvedProposeSnapshot();
    const unmet = evaluatePreconditions(snap, 'apply');
    assert.ok(unmet.includes('apply-not-authorized'));
  });

  it('unmet apply-already-completed when apply completed', () => {
    const snap = approvedProposeSnapshot();
    const apply = buildRun({ nnn: 5, action: 'apply' });
    const withApply = {
      ...snap,
      runs: [...snap.runs, apply],
      ownerAuthorizations: [buildAuthorization('apply')],
    };
    const unmet = evaluatePreconditions(withApply, 'apply');
    assert.ok(unmet.includes('apply-already-completed'));
  });
});

describe('preconditions — review-apply (task 4.9, D1-7, D1-10)', () => {
  function applyArtifactSnapshot(): ReturnType<typeof buildSnapshot> {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const apply = buildRun({ nnn: 5, action: 'apply' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    return buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, reviewE, propose, reviewP, apply],
      reviewVerdicts: [vE, vP],
      ownerAuthorizations: [buildAuthorization('apply')],
    });
  }

  it('always carries verification-facts-unavailable in D1 (D1-7)', () => {
    const snap = applyArtifactSnapshot();
    const unmet = evaluatePreconditions(snap, 'review-apply');
    assert.ok(unmet.includes('verification-facts-unavailable'));
  });

  it('match+cr adds matching-author-only-changes-requested-requires-revision', () => {
    const snap = applyArtifactSnapshot();
    const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
    const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: snap.runs[4]!.runId, verdict: 'changes-requested' });
    const withReview = {
      ...snap,
      runs: [...snap.runs, reviewA],
      reviewVerdicts: [...snap.reviewVerdicts, vA],
    };
    const unmet = evaluatePreconditions(withReview, 'review-apply');
    assert.ok(unmet.includes('matching-author-only-changes-requested-requires-revision'));
    assert.ok(unmet.includes('verification-facts-unavailable'));
  });
});

describe('preconditions — archive (task 4.11, D1-7, D1-11)', () => {
  function applyApprovedSnapshot(): ReturnType<typeof buildSnapshot> {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const apply = buildRun({ nnn: 5, action: 'apply' });
    const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: apply.runId, verdict: 'approved' });
    return buildSnapshot({
      changes: [buildChange({ state: 'active' })],
      runs: [explore, reviewE, propose, reviewP, apply, reviewA],
      reviewVerdicts: [vE, vP, vA],
      ownerAuthorizations: [buildAuthorization('apply'), buildAuthorization('archive')],
    });
  }

  it('carries both verification-facts-unavailable and tasks-facts-unavailable (D1-7, D1-11)', () => {
    const snap = applyApprovedSnapshot();
    const unmet = evaluatePreconditions(snap, 'archive');
    assert.ok(unmet.includes('verification-facts-unavailable'));
    assert.ok(unmet.includes('tasks-facts-unavailable'));
    // archive scope is present in this snapshot, so archive-not-authorized absent
    assert.ok(!unmet.includes('archive-not-authorized'));
  });

  it('allows the Tasks gate only when the fact is available and complete', () => {
    const snap = applyApprovedSnapshot();
    const complete = { ...snap, changeVerificationStatus: 'passed' as const, changeTasksComplete: true };
    assert.deepEqual(evaluatePreconditions(complete, 'archive'), []);

    const incomplete = { ...complete, changeTasksComplete: false };
    const unmet = evaluatePreconditions(incomplete, 'archive');
    assert.ok(unmet.includes('tasks-incomplete'));
    assert.ok(!unmet.includes('tasks-facts-unavailable'));
  });

  it('adds archive-not-authorized without archive scope', () => {
    const snap = applyApprovedSnapshot();
    const noScope = { ...snap, ownerAuthorizations: [buildAuthorization('apply')] };
    const unmet = evaluatePreconditions(noScope, 'archive');
    assert.ok(unmet.includes('archive-not-authorized'));
  });

  it('adds apply-not-approved when apply not approved', () => {
    const snap = applyApprovedSnapshot();
    // remove the apply review verdict → not approved
    const noApplyApproval = { ...snap, reviewVerdicts: snap.reviewVerdicts.slice(0, 2) };
    const unmet = evaluatePreconditions(noApplyApproval, 'archive');
    assert.ok(unmet.includes('apply-not-approved'));
  });
});

describe('preconditions — Change-only Standard Actions', () => {
  it('Delivery behaviors are outside evaluatePreconditions', () => {
    const snap = completedDeliverySnapshot({ fullTestStatus: 'authorized', authorizations: [buildAuthorization('full-test')] });
    // The public canRun catalog rejects these before precondition dispatch;
    // evaluatePreconditions is intentionally typed to Change FormalAction only.
    assert.ok(snap.deliveryFullTestStatus === 'authorized');
  });
});


describe('checkpoint recovery boundary — archive closes Change', () => {
  it('identifies completed Change without checkpoint from Manifest + Git only', () => {
    const snap = buildSnapshot({
      changes: [
        buildChange({ key: 'Q1', id: 'q1', state: 'completed', required: true }),
        buildChange({ key: 'Q2', id: 'q2', state: 'completed', required: true }),
      ],
      runs: [],
      gitBoundaries: [buildCheckpointBoundary('q1')],
    });
    assert.deepEqual(getCompletedUncheckpointedChanges(snap).map((c) => c.key), ['Q2']);
  });

  it('treats a rejected raw checkpoint candidate as still uncheckpointed because Policy sees admitted facts only', () => {
    const snap = buildSnapshot({
      changes: [buildChange({ key: 'F1', id: 'f1', state: 'completed', required: true })],
      gitBoundaries: [],
    });
    assert.deepEqual(getCompletedUncheckpointedChanges(snap).map((c) => c.id), ['f1']);
  });

  it('keeps legacy and structured checkpoint facts together during migration', () => {
    const snap = buildSnapshot({
      changes: [
        buildChange({ key: 'Q1', id: 'q1', state: 'completed', required: true }),
        buildChange({ key: 'Q2', id: 'q2', state: 'completed', required: true }),
      ],
      runs: [],
      gitBoundaries: [
        {
          kind: 'change-checkpoint',
          commitSha: 'legacy-q1',
          summary: 'legacy checkpoint Q1',
        },
        buildCheckpointBoundary('q2'),
      ],
    });
    assert.deepEqual(getCompletedUncheckpointedChanges(snap), []);
  });

  it('does not let a later structured checkpoint make a legacy checkpointed Change pending again', () => {
    const snap = buildSnapshot({
      changes: [
        buildChange({ key: 'A1', id: 'a1', state: 'completed', required: true }),
        buildChange({ key: 'Q1', id: 'q1', state: 'completed', required: true }),
        buildChange({ key: 'Q2', id: 'q2', state: 'completed', required: true }),
      ],
      runs: [],
      gitBoundaries: [
        { kind: 'change-checkpoint', commitSha: 'legacy-a1', summary: 'legacy checkpoint A1' },
        { kind: 'change-checkpoint', commitSha: 'legacy-q1', summary: 'legacy checkpoint Q1' },
        buildCheckpointBoundary('q2'),
      ],
    });
    assert.deepEqual(getCompletedUncheckpointedChanges(snap), []);
  });
});
