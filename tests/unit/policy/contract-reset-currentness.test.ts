import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { OwnerFactRef } from '../../../src/domain/types.js';
import type {
  FormalFactSnapshot,
  OwnerDecisionFact,
  ReviewVerdictFact,
  RunFact,
} from '../../../src/facts/formal-fact-snapshot.js';
import { projectCurrentContractResetLifecycle } from '../../../src/facts/generation-resolver.js';
import { next } from '../../../src/policy/next.js';
import { detectCurrentStage } from '../../../src/policy/stage-detector.js';
import { buildAuthorization, buildChange, buildSnapshot } from './fixtures.js';

const DELIVERY_ID = '20260806-01-deterministic-core';
const CHANGE_ID = 'D1';

const resetA: OwnerFactRef = {
  ref: 'owner:reset-a',
  decision: 'contract-reset',
  deliveryId: DELIVERY_ID,
  changeId: CHANGE_ID,
  scope: 'archive-sync',
  requiredOutcomes: ['preserve scenario identity'],
  sourceRef: 'owner:reset-a',
};
const resetB: OwnerFactRef = {
  ref: 'owner:reset-b',
  decision: 'contract-reset',
  deliveryId: DELIVERY_ID,
  changeId: CHANGE_ID,
  scope: 'reset-currentness',
  requiredOutcomes: ['fresh proposal generation'],
  sourceRef: 'owner:reset-b',
};
const ownerDecisionFacts: readonly OwnerDecisionFact[] = [resetA, resetB];
const currentResetRefs = [resetA, resetB] as const;

function run(runId: string, action: RunFact['action'], ownerFactRefs?: readonly OwnerFactRef[]): RunFact {
  return {
    runId,
    deliveryId: DELIVERY_ID,
    changeId: CHANGE_ID,
    action,
    role: action.startsWith('review-') ? 'reviewer' : 'author',
    status: 'completed',
    ...(ownerFactRefs !== undefined ? { ownerFactRefs } : {}),
  };
}

function verdict(reviewRunId: string, reviewedRunId: string, value: ReviewVerdictFact['verdict']): ReviewVerdictFact {
  return {
    reviewRunId,
    reviewedRunId,
    verdict: value,
    blockingAuthorities: value === 'changes-requested' ? ['author'] : [],
  };
}

function snapshot(runs: readonly RunFact[], reviewVerdicts: readonly ReviewVerdictFact[], overrides: Partial<FormalFactSnapshot> = {}): FormalFactSnapshot {
  return buildSnapshot({
    changes: [buildChange({ id: CHANGE_ID, key: 'D1', state: 'active' })],
    runs,
    reviewVerdicts,
    ownerDecisionFacts,
    ...overrides,
  });
}

describe('D2 Contract Reset current lifecycle projection', () => {
  it('preserves approved Explore but excludes historical revise-propose/revise-apply/apply Runs from current stage and lineage', () => {
    const explore = run('20260812-086-explore', 'explore');
    const reviewExplore = run('20260812-087-review-explore', 'review-explore');
    const oldRevisePropose = run('20260812-090-revise-propose', 'revise-propose');
    const oldReviewPropose = run('20260812-091-review-propose', 'review-propose');
    const oldReviseApply = run('20260812-094-revise-apply', 'revise-apply');
    const oldReviewApply = run('20260812-095-review-apply', 'review-apply');
    const partialResetApply = run('20260812-097-apply', 'apply', [resetA]);
    const runs = [explore, reviewExplore, oldRevisePropose, oldReviewPropose, oldReviseApply, oldReviewApply, partialResetApply];
    const verdicts = [
      verdict(reviewExplore.runId, explore.runId, 'approved'),
      verdict(oldReviewPropose.runId, oldRevisePropose.runId, 'approved'),
      verdict(oldReviewApply.runId, oldReviseApply.runId, 'approved'),
    ];
    const snap = snapshot(runs, verdicts);

    const current = projectCurrentContractResetLifecycle(snap, CHANGE_ID);
    assert.deepEqual(current.runs.filter((candidate) => candidate.changeId === CHANGE_ID).map((candidate) => candidate.runId), [
      explore.runId,
      reviewExplore.runId,
    ]);
    assert.deepEqual(current.reviewVerdicts.map((candidate) => candidate.reviewRunId), [reviewExplore.runId]);
    assert.equal(detectCurrentStage(snap, CHANGE_ID), 'propose');
    assert.deepEqual(next(snap), { kind: 'action', action: 'propose' });
  });

  it('treats current revise-propose as the current proposal producer and never reuses the old proposal review', () => {
    const explore = run('20260812-086-explore', 'explore');
    const reviewExplore = run('20260812-087-review-explore', 'review-explore');
    const oldReviewPropose = run('20260812-091-review-propose', 'review-propose');
    const currentPropose = run('20260812-098-propose', 'propose', currentResetRefs);
    const currentReviewRequested = run('20260812-099-review-propose', 'review-propose', currentResetRefs);
    const currentRevise = run('20260812-100-revise-propose', 'revise-propose', currentResetRefs);
    const runs = [explore, reviewExplore, oldReviewPropose, currentPropose, currentReviewRequested, currentRevise];
    const verdicts = [
      verdict(reviewExplore.runId, explore.runId, 'approved'),
      verdict(oldReviewPropose.runId, '20260812-090-revise-propose', 'approved'),
      verdict(currentReviewRequested.runId, currentPropose.runId, 'changes-requested'),
    ];
    const snap = snapshot(runs, verdicts);

    assert.equal(detectCurrentStage(snap, CHANGE_ID), 'propose');
    assert.deepEqual(next(snap), { kind: 'action', action: 'review-propose' });
  });

  it('treats current revise-apply as the current apply producer while historical 094/095 stay non-current', () => {
    const explore = run('20260812-086-explore', 'explore');
    const reviewExplore = run('20260812-087-review-explore', 'review-explore');
    const currentPropose = run('20260812-100-revise-propose', 'revise-propose', currentResetRefs);
    const currentReviewPropose = run('20260812-101-review-propose', 'review-propose', currentResetRefs);
    const oldReviseApply = run('20260812-094-revise-apply', 'revise-apply');
    const oldReviewApply = run('20260812-095-review-apply', 'review-apply');
    const currentApply = run('20260812-102-apply', 'apply', currentResetRefs);
    const currentReviewRequested = run('20260812-103-review-apply', 'review-apply', currentResetRefs);
    const currentReviseApply = run('20260812-104-revise-apply', 'revise-apply', currentResetRefs);
    const runs = [
      explore,
      reviewExplore,
      currentPropose,
      currentReviewPropose,
      oldReviseApply,
      oldReviewApply,
      currentApply,
      currentReviewRequested,
      currentReviseApply,
    ];
    const verdicts = [
      verdict(reviewExplore.runId, explore.runId, 'approved'),
      verdict(currentReviewPropose.runId, currentPropose.runId, 'approved'),
      verdict(oldReviewApply.runId, oldReviseApply.runId, 'approved'),
      verdict(currentReviewRequested.runId, currentApply.runId, 'changes-requested'),
    ];
    const snap = snapshot(runs, verdicts, {
      changeVerificationStatus: 'passed',
      ownerAuthorizations: [buildAuthorization('apply')],
    });

    assert.equal(detectCurrentStage(snap, CHANGE_ID), 'apply');
    assert.deepEqual(next(snap), { kind: 'action', action: 'review-apply' });
  });
});
