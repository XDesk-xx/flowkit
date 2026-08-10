import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  isChangeState,
  isDeliveryState,
  isExecutionStatus,
  isRunStatus,
  rejectUnknownState,
  validateRun,
} from '../../../src/domain/schema-validator.js';

describe('type guards', () => {
  it('isDeliveryState recognizes valid states and rejects unknown', () => {
    assert.equal(isDeliveryState('active'), true);
    assert.equal(isDeliveryState('completed'), true);
    assert.equal(isDeliveryState('cancelled'), true);
    assert.equal(isDeliveryState('planned'), false);
    assert.equal(isDeliveryState('in-progress'), false);
    assert.equal(isDeliveryState(42), false);
    assert.equal(isDeliveryState(null), false);
  });

  it('isChangeState recognizes valid states and rejects unknown', () => {
    assert.equal(isChangeState('planned'), true);
    assert.equal(isChangeState('active'), true);
    assert.equal(isChangeState('completed'), true);
    assert.equal(isChangeState('cancelled'), true);
    assert.equal(isChangeState('in-progress'), false);
    assert.equal(isChangeState('not-a-state'), false);
  });

  it('isRunStatus recognizes valid statuses and rejects in-progress (B1-RE-005)', () => {
    assert.equal(isRunStatus('pending'), true);
    assert.equal(isRunStatus('completed'), true);
    assert.equal(isRunStatus('failed'), true);
    assert.equal(isRunStatus('cancelled'), true);
    assert.equal(isRunStatus('in-progress'), false);
    assert.equal(isRunStatus('blocked'), false);
  });

  it('isExecutionStatus recognizes in-progress', () => {
    assert.equal(isExecutionStatus('in-progress'), true);
    assert.equal(isExecutionStatus('completed'), true);
    assert.equal(isExecutionStatus('failed'), true);
    assert.equal(isExecutionStatus('blocked'), true);
    assert.equal(isExecutionStatus('pending'), false);
  });
});

describe('rejectUnknownState', () => {
  it('always throws FlowkitError with UNKNOWN_STATE code', () => {
    assert.throws(
      () => rejectUnknownState('bogus', ['a', 'b']),
      (err: unknown) => err instanceof FlowkitError && err.code === 'UNKNOWN_STATE',
    );
  });
});

describe('validateRun', () => {
  const validRun = {
    runId: '20260806-001-explore',
    deliveryId: '20260806-01-deterministic-core',
    changeId: 'domain-and-state-schema',
    action: 'explore',
    role: 'author',
    status: 'pending',
  };

  it('accepts a valid Run object', () => {
    const run = validateRun(validRun);
    assert.equal(run.runId, '20260806-001-explore');
    assert.equal(run.action, 'explore');
    assert.equal(run.status, 'pending');
  });

  it('rejects retired Delivery behavior as a current Run action', () => {
    assert.throws(
      () => validateRun({
        runId: '20260806-002-full-test',
        deliveryId: '20260806-01-deterministic-core',
        changeId: 'not-a-delivery-run',
        action: 'full-test',
        role: 'owner',
        status: 'pending',
      }),
      (err: unknown) => err instanceof FlowkitError && err.code === 'UNKNOWN_ACTION',
    );
  });

  it('requires changeId on every current Run', () => {
    const withoutChange = Object.fromEntries(Object.entries(validRun).filter(([key]) => key !== 'changeId'));
    assert.throws(
      () => validateRun(withoutChange),
      (err: unknown) => err instanceof FlowkitError && err.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts a Run with inputRef as ResultRef (B1-RA-003)', () => {
    const run = validateRun({
      ...validRun,
      inputRef: { ref: 'result.json', versionFingerprint: 'sha256:abc' },
    });
    assert.equal(run.inputRef?.ref, 'result.json');
    assert.equal(run.inputRef?.versionFingerprint, 'sha256:abc');
  });

  it('rejects inputRef as a bare string (B1-RA-003)', () => {
    assert.throws(
      () => validateRun({ ...validRun, inputRef: 'sha256:abc' }),
      (err: unknown) => err instanceof FlowkitError && err.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects in-progress as Run status (B1-RE-005)', () => {
    assert.throws(
      () => validateRun({ ...validRun, status: 'in-progress' }),
      (err: unknown) => err instanceof FlowkitError && err.code === 'UNKNOWN_STATE',
    );
  });

  it('rejects an unknown action', () => {
    assert.throws(
      () => validateRun({ ...validRun, action: 'review' }),
      (err: unknown) => err instanceof FlowkitError && err.code === 'UNKNOWN_ACTION',
    );
  });

  it('rejects a non-object value', () => {
    assert.throws(
      () => validateRun('not-an-object'),
      (err: unknown) => err instanceof FlowkitError && err.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects an array', () => {
    assert.throws(
      () => validateRun([1, 2, 3]),
      (err: unknown) => err instanceof FlowkitError && err.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects missing runId', () => {
    assert.throws(
      () => validateRun({ ...validRun, runId: 123 }),
      (err: unknown) => err instanceof FlowkitError && err.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects an invalid role', () => {
    assert.throws(
      () => validateRun({ ...validRun, role: 'bot' }),
      (err: unknown) => err instanceof FlowkitError && err.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});
