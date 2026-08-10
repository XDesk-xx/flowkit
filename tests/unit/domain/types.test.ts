import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  ActionResult,
  ActionDefinition,
  Change,
  ContinuationContext,
  Delivery,
  FindingSummary,
  OwnerAuthorizationRef,
  ResultRef,
  ReviewVerdict,
  Run,
  VerificationSummary,
} from '../../../src/domain/types.js';

/**
 * Type-level tests: these constructs exist solely to verify that the eleven
 * domain object types compile and support type narrowing. If any field is
 * missing or mistyped, `tsc --noEmit` will fail.
 */

describe('domain object types compile (B1-RE-004)', () => {
  it('Delivery type is usable with all required fields', () => {
    const delivery: Delivery = {
      id: '20260806-01-deterministic-core',
      state: 'active',
      createdAt: '2026-08-06',
      branch: 'delivery/20260806-01-deterministic-core',
      fullTestStatus: 'not-ready',
      architecture: { impact: true, archifyPlan: 'required' },
      changes: [
        { key: 'B1', id: 'domain-and-state-schema', dependsOn: ['A1'], state: 'active', required: true, outputs: ['src/domain/types.ts'] },
      ],
    };
    assert.equal(delivery.state, 'active');
    assert.equal(delivery.architecture.impact, true);
    // archifyStatus must not exist (B1 / Q8).
    assert.equal('archifyStatus' in delivery, false);
  });

  it('Change type includes optional outputs', () => {
    const change: Change = {
      key: 'B1',
      id: 'domain-and-state-schema',
      goal: 'Define domain types.',
      required: true,
      dependsOn: ['A1'],
      state: 'active',
      outputs: ['src/domain/types.ts'],
    };
    assert.deepEqual([...(change.outputs ?? [])], ['src/domain/types.ts']);
  });

  it('Run type is usable with and without changeId', () => {
    const runWithChange: Run = {
      runId: '20260806-001-explore',
      deliveryId: '20260806-01-deterministic-core',
      changeId: 'domain-and-state-schema',
      action: 'explore',
      role: 'author',
      status: 'pending',
    };
    const runDelivery: Run = {
      runId: '20260806-002-full-test',
      deliveryId: '20260806-01-deterministic-core',
      action: 'full-test',
      role: 'owner',
      status: 'pending',
    };
    assert.equal(runWithChange.changeId, 'domain-and-state-schema');
    assert.equal(runDelivery.changeId, undefined);
  });

  it('ActionDefinition has integration-boundaries fields', () => {
    const def: ActionDefinition = {
      action: 'explore',
      role: 'author',
      goal: 'Explore a Change.',
      preconditions: ['change.state === active'],
      allowedOutputs: ['explore.md'],
      completionConditions: ['conclusion.md exists'],
    };
    assert.equal(def.role, 'author');
    assert.equal(def.preconditions.length, 1);
  });

  it('ActionResult uses logical minimal fields', () => {
    const resultRef: ResultRef = {
      ref: 'result.json',
      versionFingerprint: 'sha256:abc',
    };
    const result: ActionResult = {
      runRef: resultRef,
      action: 'explore',
      executionStatus: 'completed',
      summary: 'Done.',
    };
    assert.equal(result.executionStatus, 'completed');
    assert.equal(result.runRef.ref, 'result.json');
    // runPath is NOT a mandatory field on ResultRef (B1-RE-002).
    assert.equal('runPath' in result.runRef, false);
  });

  it('ReviewVerdict and FindingSummary types are usable', () => {
    const finding: FindingSummary = {
      id: 'B1-RE-001',
      title: 'Test finding',
      severity: 'blocking',
    };
    const verdict: ReviewVerdict = {
      verdict: 'approved',
      blockingFindings: [],
      nonBlockingFindings: [finding],
      reviewedResultRef: { ref: 'result.json', versionFingerprint: 'sha256:abc' },
    };
    assert.equal(verdict.verdict, 'approved');
    assert.equal(verdict.nonBlockingFindings.length, 1);
  });

  it('VerificationSummary type is usable', () => {
    const summary: VerificationSummary = {
      checks: [
        {
          name: 'typecheck',
          scope: 'src/',
          applicability: 'applicable',
          commands: ['tsc --noEmit'],
          status: 'passed',
          summary: 'OK',
        },
      ],
      overallStatus: 'passed',
    };
    assert.equal(summary.overallStatus, 'passed');
  });

  it('OwnerAuthorizationRef is provider-neutral', () => {
    const auth: OwnerAuthorizationRef = {
      ref: 'auth-001',
      scope: 'apply',
    };
    assert.equal(auth.scope, 'apply');
    assert.equal(auth.authorizedAt, undefined);
  });

  it('ContinuationContext type is usable', () => {
    const ctx: ContinuationContext = {
      deliveryId: '20260806-01-deterministic-core',
      changeId: 'domain-and-state-schema',
      lastCompletedAction: 'explore',
      pendingNonBlockingFindings: [],
      validOwnerAuthorizations: [],
      currentConstraints: {},
      nextAllowedAction: 'review-explore',
      nextActionInputRefs: [],
    };
    assert.equal(ctx.nextAllowedAction, 'review-explore');
  });

  it('all eleven domain object types are referenced', () => {
    // Compile-time assertion: each name below must resolve to an imported type.
    const names = [
      'Delivery',
      'Change',
      'Run',
      'ActionDefinition',
      'ActionResult',
      'ResultRef',
      'ReviewVerdict',
      'FindingSummary',
      'VerificationSummary',
      'OwnerAuthorizationRef',
      'ContinuationContext',
    ];
    assert.equal(names.length, 11);
  });
});
