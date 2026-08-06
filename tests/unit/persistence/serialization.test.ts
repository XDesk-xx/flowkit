import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  validateActionResultWithoutRunRef,
  validateResultRefProjection,
  validateContextFile,
  validateContextFileIdentity,
  validateRunResultFileCombination,
  validateReviewVerdictIntegrity,
  type ContextFile,
  type RunResultFile,
} from '../../../src/persistence/serialization.js';

// ---------------------------------------------------------------------------
// validateResultRefProjection (tasks 6.9-6.11)
// ---------------------------------------------------------------------------

describe('validateResultRefProjection', () => {
  it('accepts a valid ResultRef with ref + versionFingerprint', () => {
    const ref = validateResultRefProjection({
      ref: 'result.json',
      versionFingerprint: 'abc123',
    });
    assert.equal(ref.ref, 'result.json');
    assert.equal(ref.versionFingerprint, 'abc123');
    assert.equal(ref.kind, undefined);
  });

  it('accepts a ResultRef with optional kind', () => {
    const ref = validateResultRefProjection({
      ref: 'result.json',
      versionFingerprint: 'abc123',
      kind: 'run-result',
    });
    assert.equal(ref.kind, 'run-result');
  });

  it('rejects empty ref string (task 6.10)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: '  ', versionFingerprint: 'abc' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects empty versionFingerprint string (task 6.10)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: 'r', versionFingerprint: '' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects non-string kind (task 6.11)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: 'r', versionFingerprint: 'v', kind: 42 }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects a non-object', () => {
    assert.throws(
      () => validateResultRefProjection('not-a-ref'),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// validateActionResultWithoutRunRef (tasks 6.1-6.8, 12.25-12.29)
// ---------------------------------------------------------------------------

describe('validateActionResultWithoutRunRef', () => {
  const valid = {
    action: 'explore',
    executionStatus: 'completed',
    summary: 'explore done',
  };

  it('accepts a valid projection (task 6.1-6.4)', () => {
    const ar = validateActionResultWithoutRunRef(valid);
    assert.equal(ar.action, 'explore');
    assert.equal(ar.executionStatus, 'completed');
    assert.equal(ar.summary, 'explore done');
  });

  it('rejects runRef field (task 6.8, 12.28)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ ...valid, runRef: { ref: 'r', versionFingerprint: 'v' } }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects invalid action (task 6.2, 12.26)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ ...valid, action: 'not-an-action' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'UNKNOWN_ACTION',
    );
  });

  it('rejects invalid executionStatus (task 6.3, 12.26)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ ...valid, executionStatus: 'pending' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects empty summary (task 6.4, 12.25)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ ...valid, summary: '  ' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects missing action/executionStatus/summary (task 12.25)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ summary: 'x' }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects actionResult that is not an object (task 12.29)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef('not-an-object'),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('validates nested ResultRef arrays (task 6.5, 12.27)', () => {
    const ar = validateActionResultWithoutRunRef({
      ...valid,
      producedResultRefs: [{ ref: 'a', versionFingerprint: 'v1' }],
      consumedInputRefs: [{ ref: 'b', versionFingerprint: 'v2' }],
    });
    assert.equal(ar.producedResultRefs?.length, 1);
    assert.equal(ar.consumedInputRefs?.length, 1);
  });

  it('rejects nested ResultRef missing fields (task 12.27)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({
        ...valid,
        producedResultRefs: [{ ref: 'a' }],
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('validates optional single ResultRefs (task 6.6)', () => {
    const ar = validateActionResultWithoutRunRef({
      ...valid,
      verificationSummaryRef: { ref: 'v', versionFingerprint: 'vf' },
      reviewVerdictRef: { ref: 'r', versionFingerprint: 'rf' },
    });
    assert.equal(ar.verificationSummaryRef?.ref, 'v');
    assert.equal(ar.reviewVerdictRef?.ref, 'r');
  });

  it('validates optional string fields (task 6.7)', () => {
    const ar = validateActionResultWithoutRunRef({
      ...valid,
      failureDiagnosis: 'diag',
      nextActionRecommendation: 'next',
    });
    assert.equal(ar.failureDiagnosis, 'diag');
    assert.equal(ar.nextActionRecommendation, 'next');
  });
});

// ---------------------------------------------------------------------------
// validateRunResultFileCombination (tasks 5.2-5.8, 12.14-12.15)
// ---------------------------------------------------------------------------

describe('validateRunResultFileCombination', () => {
  it('accepts completed + actionResult(completed) (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({
        runStatus: 'completed',
        actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
      }),
    );
  });

  it('accepts completed + actionResult(failed) (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({
        runStatus: 'completed',
        actionResult: { action: 'explore', executionStatus: 'failed', summary: 'done' },
      }),
    );
  });

  it('accepts completed + actionResult(blocked) (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({
        runStatus: 'completed',
        actionResult: { action: 'explore', executionStatus: 'blocked', summary: 'done' },
      }),
    );
  });

  it('accepts failed + no actionResult (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({ runStatus: 'failed', failureDiagnosis: 'err' }),
    );
  });

  it('accepts cancelled + no actionResult (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({ runStatus: 'cancelled', cancellationReason: 'r' }),
    );
  });

  it('rejects top-level executionStatus field (task 12.15)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'completed',
          executionStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'x' },
        } as unknown as RunResultFile),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects completed + no actionResult (task 12.15)', () => {
    assert.throws(
      () => validateRunResultFileCombination({ runStatus: 'completed' }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects completed + actionResult(in-progress) (task 12.15)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'in-progress', summary: 'x' },
        }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects failed + actionResult (task 12.15)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'failed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'x' },
        }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects cancelled + actionResult (task 12.15)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'cancelled',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'x' },
        }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });
});

// ---------------------------------------------------------------------------
// validateContextFile (tasks 10.1-10.8, 12.16-12.18, 12.31-12.38)
// ---------------------------------------------------------------------------

const validChangeContext = {
  schemaVersion: 2,
  runId: '20260806-001-explore',
  deliveryId: '20260806-01-deterministic-core',
  changeKey: 'C1',
  changeId: 'formal-fact-reader-and-persistence',
  action: 'explore',
  role: 'author',
  ownerAuthorization: 'required',
  runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-001-explore/',
};

const validDeliveryContext = {
  schemaVersion: 2,
  runId: '20260806-002-full-test',
  deliveryId: '20260806-01-deterministic-core',
  action: 'full-test',
  role: 'owner',
  ownerAuthorization: 'required',
  runPath: '.flowkit/runs/20260806-01-deterministic-core/20260806-002-full-test/',
};

describe('validateContextFile', () => {
  it('accepts a valid Change-level ContextFile (task 10.1-10.3)', () => {
    const cf = validateContextFile(validChangeContext);
    assert.equal(cf.schemaVersion, 2);
    assert.equal(cf.runId, '20260806-001-explore');
    assert.equal(cf.changeKey, 'C1');
    assert.equal(cf.changeId, 'formal-fact-reader-and-persistence');
  });

  it('accepts a valid Delivery-level ContextFile (task 10.5, 12.34)', () => {
    const cf = validateContextFile(validDeliveryContext);
    assert.equal(cf.changeId, undefined);
    assert.equal(cf.changeKey, undefined);
  });

  it('rejects schemaVersion !== 2 (task 12.16)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, schemaVersion: 1 }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects missing required fields (task 12.17)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, runId: undefined }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects action not in B1 Action Catalog (task 12.18)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, action: 'review' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'UNKNOWN_ACTION',
    );
  });

  it('rejects invalid role type (task 12.31)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, role: 'bot' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects Delivery action carrying changeId (task 10.5, 12.32)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validDeliveryContext,
          changeId: 'some-change',
          changeKey: 'X',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects Change action missing changeId (task 10.5, 12.33)', () => {
    assert.throws(
      () => {
        const { changeId, changeKey, ...rest } = validChangeContext;
        void changeId;
        void changeKey;
        return validateContextFile(rest);
      },
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts inputRef as ResultRef object (task 10.6, 12.35)', () => {
    const cf = validateContextFile({
      ...validChangeContext,
      inputRef: { ref: 'result.json', versionFingerprint: 'sha256:abc' },
    });
    assert.equal(cf.inputRef?.ref, 'result.json');
  });

  it('rejects inputRef as string (task 10.6, 12.36)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, inputRef: 'sha256:abc' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts missing inputRef (task 12.37)', () => {
    const cf = validateContextFile(validChangeContext);
    assert.equal(cf.inputRef, undefined);
  });

  it('rejects inputRef ResultRef missing versionFingerprint (task 12.38)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, inputRef: { ref: 'r' } }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts optional constraints (task 10.3)', () => {
    const cf = validateContextFile({
      ...validChangeContext,
      constraints: { mayWriteProductionCode: true },
    });
    assert.equal(cf.constraints?.mayWriteProductionCode, true);
  });

  // -------------------------------------------------------------------------
  // Review-scope rules (C1-AP-004): review-* MUST carry reviewedRunId;
  // non-review MUST NOT carry reviewedRunId.
  // -------------------------------------------------------------------------

  it('accepts review-* Run with reviewedRunId (C1-AP-004)', () => {
    const cf = validateContextFile({
      ...validChangeContext,
      runId: '20260806-010-review-apply',
      action: 'review-apply',
      role: 'reviewer',
      reviewedRunId: '20260806-009-apply',
      runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-010-review-apply/',
    });
    assert.equal(cf.reviewedRunId, '20260806-009-apply');
  });

  it('rejects review-* Run missing reviewedRunId (C1-AP-004)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-011-review-apply',
          action: 'review-apply',
          role: 'reviewer',
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-011-review-apply/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects non-review Run carrying reviewedRunId (C1-AP-004)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          reviewedRunId: '20260806-009-apply',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// validateContextFileIdentity (tasks 10.9-10.16, 12.39-12.43)
// ---------------------------------------------------------------------------

describe('validateContextFileIdentity', () => {
  const cf: ContextFile = {
    schemaVersion: 2,
    runId: '20260806-001-explore',
    deliveryId: '20260806-01-deterministic-core',
    changeKey: 'C1',
    changeId: 'formal-fact-reader-and-persistence',
    action: 'explore',
    role: 'author',
    ownerAuthorization: 'required',
    runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-001-explore/',
  };

  it('accepts matching identity (Change-level)', () => {
    assert.doesNotThrow(() =>
      validateContextFileIdentity(
        cf,
        '/repo/.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-001-explore',
      ),
    );
  });

  it('rejects runId not matching directory name (task 12.39)', () => {
    assert.throws(
      () =>
        validateContextFileIdentity(
          cf,
          '/repo/.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-099-explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects deliveryId not matching path segment (task 12.40)', () => {
    assert.throws(
      () =>
        validateContextFileIdentity(
          cf,
          '/repo/.flowkit/runs/20260806-99-other/formal-fact-reader-and-persistence/20260806-001-explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects changeId not matching path segment (task 12.41)', () => {
    assert.throws(
      () =>
        validateContextFileIdentity(
          cf,
          '/repo/.flowkit/runs/20260806-01-deterministic-core/other-change/20260806-001-explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('skips changeId check for Delivery-level Run (task 12.42)', () => {
    const deliveryCf: ContextFile = {
      schemaVersion: 2,
      runId: '20260806-002-full-test',
      deliveryId: '20260806-01-deterministic-core',
      action: 'full-test',
      role: 'owner',
      ownerAuthorization: 'required',
      runPath: '.flowkit/runs/20260806-01-deterministic-core/20260806-002-full-test/',
    };
    assert.doesNotThrow(() =>
      validateContextFileIdentity(
        deliveryCf,
        '/repo/.flowkit/runs/20260806-01-deterministic-core/20260806-002-full-test',
      ),
    );
  });

  it('rejects runPath inconsistent with filesystem (task 12.43)', () => {
    const badCf: ContextFile = {
      ...cf,
      runPath: '.flowkit/runs/OTHER/20260806-001-explore/',
    };
    assert.throws(
      () =>
        validateContextFileIdentity(
          badCf,
          '/repo/.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-001-explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// validateReviewVerdictIntegrity (C1-AP-006)
// ---------------------------------------------------------------------------

describe('validateReviewVerdictIntegrity', () => {
  it('accepts completed review-* Run with reviewVerdict (C1-AP-006)', () => {
    validateReviewVerdictIntegrity('review-apply', {
      runStatus: 'completed',
      actionResult: { action: 'review-apply', executionStatus: 'completed', summary: 'approved' },
      reviewVerdict: 'approved',
    });
    // No throw ⇒ pass.
  });

  it('rejects completed review-* Run missing reviewVerdict (C1-AP-006)', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('review-apply', {
          runStatus: 'completed',
          actionResult: { action: 'review-apply', executionStatus: 'completed', summary: 'no verdict' },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects non-review Run carrying reviewVerdict (C1-AP-006)', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('explore', {
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
          reviewVerdict: 'approved',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects failed review-* Run carrying reviewVerdict (C1-AP-006)', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('review-apply', {
          runStatus: 'failed',
          failureDiagnosis: 'broken',
          reviewVerdict: 'approved',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts failed review-* Run without reviewVerdict (C1-AP-006)', () => {
    validateReviewVerdictIntegrity('review-apply', {
      runStatus: 'failed',
      failureDiagnosis: 'broken',
    });
    // No throw ⇒ pass.
  });

  it('accepts non-review Run without reviewVerdict (C1-AP-006)', () => {
    validateReviewVerdictIntegrity('explore', {
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
    });
    // No throw ⇒ pass.
  });
});
