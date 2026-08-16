import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canRun } from '../../../src/policy/can-run.js';
import {
  buildChange,
  buildRun,
  buildVerdict,
  buildSnapshot,
  buildAuthorization,
  buildConflict,
} from './fixtures.js';
import type { FormalAction } from '../../../src/domain/actions.js';

describe('canRun (task 5.1-5.6, 10.5, 10.9)', () => {
  describe('conflicts fail-closed (task 5.2, 10.9)', () => {
    it('returns allowed:false with conflictDimensions when conflicts non-empty', () => {
      const snap = buildSnapshot({
        changes: [buildChange({ state: 'active' })],
        conflicts: [buildConflict('yaml-parse'), buildConflict('run-status')],
      });
      const result = canRun(snap, 'explore');
      assert.equal(result.allowed, false);
      assert.deepEqual(result.conflictDimensions, ['yaml-parse', 'run-status']);
      assert.deepEqual(result.unmetPreconditions, []);
    });

    it('conflicts block every action regardless of preconditions', () => {
      const snap = buildSnapshot({
        changes: [buildChange({ state: 'active' })],
        conflicts: [buildConflict()],
      });
      for (const action of ['explore', 'archive'] as const) {
        assert.equal(canRun(snap, action).allowed, false, `${action} should be blocked by conflict`);
      }
      assert.equal(canRun(snap, 'full-test' as FormalAction).allowed, false, 'retired Delivery behavior should still fail closed under conflict');
    });

    it('conflictDimensions empty when no conflicts', () => {
      const snap = buildSnapshot({ changes: [buildChange({ state: 'active' })] });
      assert.deepEqual(canRun(snap, 'explore').conflictDimensions, []);
    });
  });

  describe('unknown action (task 5.3)', () => {
    it('returns allowed:false with unknown-action for non-catalog action', () => {
      const snap = buildSnapshot({ changes: [buildChange({ state: 'active' })] });
      const result = canRun(snap, 'not-an-action' as FormalAction);
      assert.equal(result.allowed, false);
      assert.deepEqual(result.unmetPreconditions, ['unknown-action']);
    });
  });

  describe('preconditions satisfied → allowed (task 5.4, 5.5)', () => {
    it('explore allowed on a fresh active change', () => {
      const snap = buildSnapshot({ changes: [buildChange({ state: 'active' })] });
      const result = canRun(snap, 'explore');
      assert.equal(result.allowed, true);
      assert.deepEqual(result.unmetPreconditions, []);
    });

    it('review-explore allowed when artifact exists and no review', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const snap = buildSnapshot({
        changes: [buildChange({ state: 'active' })],
        runs: [explore],
      });
      assert.equal(canRun(snap, 'review-explore').allowed, true);
    });

    it('retired Delivery behavior is not a Standard canRun Action', () => {
      const snap = buildSnapshot({ changes: [buildChange({ state: 'completed', required: true })] });
      const result = canRun(snap, 'full-test' as FormalAction);
      assert.equal(result.allowed, false);
      assert.deepEqual(result.unmetPreconditions, ['unknown-action']);
    });
  });

  describe('preconditions unmet → not allowed (task 5.5)', () => {
    it('explore not allowed when already run', () => {
      const snap = buildSnapshot({
        changes: [buildChange({ state: 'active' })],
        runs: [buildRun({ nnn: 1, action: 'explore' })],
      });
      const result = canRun(snap, 'explore');
      assert.equal(result.allowed, false);
      assert.ok(result.unmetPreconditions.includes('explore-already-run'));
    });

    it('review-explore not allowed on author-only match+changes-requested', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
      const snap = buildSnapshot({
        changes: [buildChange({ state: 'active' })],
        runs: [explore, review],
        reviewVerdicts: [v],
      });
      const result = canRun(snap, 'review-explore');
      assert.equal(result.allowed, false);
      assert.ok(result.unmetPreconditions.includes('matching-author-only-changes-requested-requires-revision'));
    });

    it('explicit review-explore is allowed on matching non-author blocker', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested', blockingAuthorities: ['owner'] });
      const snap = buildSnapshot({ changes: [buildChange({ state: 'active' })], runs: [explore, review], reviewVerdicts: [v] });
      assert.equal(canRun(snap, 'review-explore').allowed, true);
      const revise = canRun(snap, 'revise-explore');
      assert.equal(revise.allowed, false);
      assert.ok(revise.unmetPreconditions.includes('non-author-review-blocker'));
    });

    it('explicit review-explore is allowed on mixed author/non-author blockers while revise stays forbidden', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const v = buildVerdict({
        reviewNnn: 2,
        reviewedRunId: explore.runId,
        verdict: 'changes-requested',
        blockingAuthorities: ['author', 'verification'],
      });
      const snap = buildSnapshot({ changes: [buildChange({ state: 'active' })], runs: [explore, review], reviewVerdicts: [v] });
      assert.equal(canRun(snap, 'review-explore').allowed, true);
      const revise = canRun(snap, 'revise-explore');
      assert.equal(revise.allowed, false);
      assert.ok(revise.unmetPreconditions.includes('non-author-review-blocker'));
    });

    it('archive always not allowed in D1 (verification+tasks unavailable)', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const propose = buildRun({ nnn: 3, action: 'propose' });
      const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
      const apply = buildRun({ nnn: 5, action: 'apply' });
      const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
      const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
      const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
      const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: apply.runId, verdict: 'approved' });
      const snap = buildSnapshot({
        changes: [buildChange({ state: 'active' })],
        runs: [explore, reviewE, propose, reviewP, apply, reviewA],
        reviewVerdicts: [vE, vP, vA],
        ownerAuthorizations: [buildAuthorization('archive')],
      });
      const result = canRun(snap, 'archive');
      assert.equal(result.allowed, false);
      assert.ok(result.unmetPreconditions.includes('verification-facts-unavailable'));
      assert.ok(result.unmetPreconditions.includes('tasks-facts-unavailable'));
    });
  });

  describe('purity (task 5.6, 10.19)', () => {
    it('same input yields same output and no mutation', () => {
      const snap = buildSnapshot({ changes: [buildChange({ state: 'active' })] });
      const r1 = canRun(snap, 'explore');
      const r2 = canRun(snap, 'explore');
      assert.deepEqual(r1, r2);
    });
  });
});
