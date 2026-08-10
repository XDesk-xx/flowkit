import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  OWNER_DECISIONS,
  BLOCKED_REASONS,
  isOwnerDecision,
  isBlockedReason,
  actionResult,
  ownerDecisionResult,
  blockedResult,
} from '../../../src/policy/types.js';
import type {
  CanRunResult,
  PolicyResult,
  OwnerDecision,
  BlockedReason,
  BlockedDiagnosis,
} from '../../../src/policy/types.js';

describe('policy types (task 1.1-1.7, 10.1)', () => {
  describe('OwnerDecision', () => {
    it('contains the five Action decisions + authorize-checkpoint (task 1.3, 6.10)', () => {
      const expected: readonly OwnerDecision[] = [
        'activate-change',
        'authorize-apply',
        'authorize-archive',
        'authorize-full-test',
        'authorize-delivery-finalize',
        'authorize-checkpoint',
      ];
      assert.deepEqual([...OWNER_DECISIONS], [...expected]);
    });

    it('isOwnerDecision guards recognized values', () => {
      assert.equal(isOwnerDecision('authorize-apply'), true);
      assert.equal(isOwnerDecision('authorize-checkpoint'), true);
      assert.equal(isOwnerDecision('not-a-decision'), false);
      assert.equal(isOwnerDecision(''), false);
    });
  });

  describe('BlockedReason', () => {
    it('contains all current blocked reasons (task 1.6)', () => {
      const expected: readonly BlockedReason[] = [
        'formal-fact-conflict',
        'no-active-delivery',
        'no-actionable-change',
        'verification-facts-unavailable',
        'verification-failed',
        'verification-not-run',
        'tasks-facts-unavailable',
        'tasks-incomplete',
        'ambiguous-state',
        'dependency-incomplete',
        'full-test-failed',
        'non-author-review-blocker',
        'delivery-behavior-not-implemented',
      ];
      assert.deepEqual([...BLOCKED_REASONS], [...expected]);
    });

    it('isBlockedReason guards recognized values', () => {
      assert.equal(isBlockedReason('full-test-failed'), true);
      assert.equal(isBlockedReason('tasks-facts-unavailable'), true);
      assert.equal(isBlockedReason('tasks-incomplete'), true);
      assert.equal(isBlockedReason('not-a-reason'), false);
    });

    it('tasks-facts-unavailable is distinct from verification-facts-unavailable', () => {
      // Both are recognized blocked reasons (the type guard accepts each)...
      assert.equal(isBlockedReason('tasks-facts-unavailable'), true);
      assert.equal(isBlockedReason('verification-facts-unavailable'), true);
      // ...but they are distinct reason strings (different fact dimensions, D1-11).
      assert.notEqual('tasks-facts-unavailable', 'verification-facts-unavailable');
    });
  });

  describe('CanRunResult', () => {
    it('is constructible with all readonly fields (task 1.1)', () => {
      const result: CanRunResult = {
        action: 'explore',
        allowed: true,
        unmetPreconditions: [],
        conflictDimensions: [],
      };
      assert.equal(result.action, 'explore');
      assert.equal(result.allowed, true);
      assert.deepEqual(result.unmetPreconditions, []);
      assert.deepEqual(result.conflictDimensions, []);
    });
  });

  describe('PolicyResult discriminated union (task 1.2)', () => {
    it('actionResult builds the action variant', () => {
      const r: PolicyResult = actionResult('explore');
      assert.equal(r.kind, 'action');
      if (r.kind === 'action') {
        assert.equal(r.action, 'explore');
      }
    });

    it('ownerDecisionResult builds the owner-decision variant with context', () => {
      const r: PolicyResult = ownerDecisionResult('authorize-apply', {
        detail: 'waiting',
      });
      assert.equal(r.kind, 'owner-decision');
      if (r.kind === 'owner-decision') {
        assert.equal(r.decision, 'authorize-apply');
        assert.equal(r.context.detail, 'waiting');
      }
    });

    it('ownerDecisionResult context defaults to empty', () => {
      const r = ownerDecisionResult('activate-change');
      assert.deepEqual(r.context, {});
    });

    it('blockedResult builds the blocked variant', () => {
      const diagnosis: BlockedDiagnosis = {
        reason: 'no-active-delivery',
        unmetPreconditions: [],
        conflicts: [],
        suggestedOwnerActions: [],
      };
      const r: PolicyResult = blockedResult(diagnosis);
      assert.equal(r.kind, 'blocked');
      if (r.kind === 'blocked') {
        assert.equal(r.diagnosis.reason, 'no-active-delivery');
      }
    });

    it('the three kinds are mutually exclusive (task 1.2)', () => {
      const action = actionResult('explore');
      const owner = ownerDecisionResult('authorize-apply');
      const blocked = blockedResult({
        reason: 'ambiguous-state',
        unmetPreconditions: [],
        conflicts: [],
        suggestedOwnerActions: [],
      });
      const actionKinds = new Set([action.kind]);
      const ownerKinds = new Set([owner.kind]);
      const blockedKinds = new Set([blocked.kind]);
      assert.equal(actionKinds.has('action'), true);
      assert.equal(ownerKinds.has('owner-decision'), true);
      assert.equal(blockedKinds.has('blocked'), true);
      // Each variant carries exactly one kind.
      assert.equal(Object.keys(action).includes('action'), true);
      assert.equal(Object.keys(action).includes('diagnosis'), false);
      assert.equal(Object.keys(owner).includes('decision'), true);
      assert.equal(Object.keys(owner).includes('action'), false);
      assert.equal(Object.keys(blocked).includes('diagnosis'), true);
      assert.equal(Object.keys(blocked).includes('decision'), false);
    });
  });

  describe('immutability (task 1.7)', () => {
    it('constructed objects expose only readonly fields', () => {
      const r = actionResult('explore');
      // TypeScript readonly is a compile-time guarantee; at runtime we verify
      // the shape is the expected minimal set.
      assert.deepEqual(Object.keys(r).sort(), ['action', 'kind']);
    });

    it('BlockedDiagnosis carries all four required fields', () => {
      const d: BlockedDiagnosis = {
        reason: 'full-test-failed',
        unmetPreconditions: ['full-test-already-failed'],
        conflicts: [],
        suggestedOwnerActions: ['authorize-corrective-change', 'cancel-delivery'],
      };
      assert.equal(d.reason, 'full-test-failed');
      assert.equal(d.unmetPreconditions.length, 1);
      assert.equal(d.suggestedOwnerActions.length, 2);
    });
  });
});
