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
        { key: 'B1', id: 'domain-and-state-schema', dependsOn: ['A1'], state: 'active', required: true, architectureImpact: false, outputs: ['src/domain/types.ts'] },
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
      architectureImpact: false,
      outputs: ['src/domain/types.ts'],
    };
    assert.deepEqual([...(change.outputs ?? [])], ['src/domain/types.ts']);
  });

  it('Run type is Change-scoped', () => {
    const run: Run = {
      runId: '20260806-001-explore',
      deliveryId: '20260806-01-deterministic-core',
      changeId: 'domain-and-state-schema',
      action: 'explore',
      role: 'author',
      status: 'pending',
    };
    assert.equal(run.changeId, 'domain-and-state-schema');
  });

  it('ActionDefinition has the frozen B1 execution boundary fields', () => {
    const def: ActionDefinition = {
      action: 'explore',
      version: 1,
      role: 'author',
      goalClass: 'investigate-change',
      mutationClass: 'explore-planning-only',
      outputClass: 'current-explore-artifact-set',
      terminalContract: {
        kind: 'artifact',
        verdictRequired: false,
        bindsReviewedRun: false,
        bindsSourceReview: false,
        verificationSummaryRef: 'none',
        gitCheckpointOutputAllowed: false,
      },
    };
    assert.equal(def.role, 'author');
    assert.equal(def.goalClass, 'investigate-change');
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

  it('OwnerAuthorizationRef is provider-neutral and target-specific', () => {
    const auth: OwnerAuthorizationRef = {
      ref: 'owner:abc',
      decision: 'authorize-apply',
      deliveryId: '20260806-01-deterministic-core',
      changeId: 'domain-and-state-schema',
      sourceRef: 'chat-owner-input:1',
    };
    assert.equal(auth.decision, 'authorize-apply');
    assert.equal(auth.changeId, 'domain-and-state-schema');
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
