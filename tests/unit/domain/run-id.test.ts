import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  allocateNextNnn,
  parseRunId,
  validateCandidateNnn,
  validateRunIdUniqueness,
} from '../../../src/domain/run-id.js';

describe('parseRunId', () => {
  it('parses a valid Run ID', () => {
    const parsed = parseRunId('20260806-001-explore');
    assert.equal(parsed.date, '20260806');
    assert.equal(parsed.nnn, 1);
    assert.equal(parsed.action, 'explore');
  });

  it('parses multi-segment action names', () => {
    const parsed = parseRunId('20260806-042-review-explore');
    assert.equal(parsed.nnn, 42);
    assert.equal(parsed.action, 'review-explore');
  });

  it('throws RUN_ID_INVALID_FORMAT for malformed strings', () => {
    const cases = [
      '2026086-001-explore', // 7-digit date
      '20260806-1-explore', // 1-digit NNN
      '20260806-0001-explore', // 4-digit NNN
      '20260806-001-Explore', // uppercase action
      '20260806-001-', // empty action
      '20260806-001', // missing action
      '', // empty
      'garbage',
    ];
    for (const c of cases) {
      assert.throws(
        () => parseRunId(c),
        (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_INVALID_FORMAT',
        `expected RUN_ID_INVALID_FORMAT for ${c}`,
      );
    }
  });
});

describe('validateRunIdUniqueness', () => {
  it('accepts a list with unique NNN values', () => {
    assert.doesNotThrow(() =>
      validateRunIdUniqueness([
        '20260806-001-explore',
        '20260806-002-review-explore',
        '20260806-003-revise-explore',
      ]),
    );
  });

  it('accepts an empty list', () => {
    assert.doesNotThrow(() => validateRunIdUniqueness([]));
  });

  it('rejects duplicate NNN across Change and _delivery sources', () => {
    assert.throws(
      () =>
        validateRunIdUniqueness([
          '20260806-001-explore',
          '20260806-002-full-test',
          '20260806-001-review-explore', // duplicate NNN 001
        ]),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_DUPLICATE_NNN',
    );
  });
});

describe('allocateNextNnn', () => {
  it('returns 1 for an empty list', () => {
    assert.equal(allocateNextNnn([]), 1);
  });

  it('returns max(NNN)+1 for a non-empty list', () => {
    assert.equal(
      allocateNextNnn([
        '20260806-001-explore',
        '20260806-005-review-explore',
        '20260806-003-revise-explore',
      ]),
      6,
    );
  });

  it('throws RUN_ID_NNN_EXHAUSTED when max(NNN)+1 > 999', () => {
    assert.throws(
      () => allocateNextNnn(['20260806-999-explore']),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_EXHAUSTED',
    );
  });

  it('validates uniqueness before allocating', () => {
    assert.throws(
      () =>
        allocateNextNnn([
          '20260806-001-explore',
          '20260806-001-review-explore',
        ]),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_DUPLICATE_NNN',
    );
  });
});

describe('validateCandidateNnn', () => {
  it('accepts a candidate greater than max(NNN) with a gap', () => {
    assert.doesNotThrow(() =>
      validateCandidateNnn(6, [
        '20260806-001-explore',
        '20260806-003-revise-explore', // gap at 002, allowed
      ]),
    );
  });

  it('rejects candidate <= max(NNN) as non-monotonic', () => {
    assert.throws(
      () => validateCandidateNnn(3, ['20260806-005-explore']),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_NOT_MONOTONIC',
    );
  });

  it('rejects a candidate equal to max(NNN)', () => {
    assert.throws(
      () => validateCandidateNnn(5, ['20260806-005-explore']),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_NOT_MONOTONIC',
    );
  });

  it('rejects 0 as out of range (B1-RE-008)', () => {
    assert.throws(
      () => validateCandidateNnn(0, []),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_OUT_OF_RANGE',
    );
  });

  it('rejects negative values as out of range (B1-RE-008)', () => {
    assert.throws(
      () => validateCandidateNnn(-1, []),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_OUT_OF_RANGE',
    );
  });

  it('rejects fractional values as out of range (B1-RE-008)', () => {
    assert.throws(
      () => validateCandidateNnn(3.5, []),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_OUT_OF_RANGE',
    );
  });

  it('rejects NaN as out of range (B1-RE-008)', () => {
    assert.throws(
      () => validateCandidateNnn(Number.NaN, []),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_OUT_OF_RANGE',
    );
  });

  it('rejects Infinity as out of range (B1-RE-008)', () => {
    assert.throws(
      () => validateCandidateNnn(Number.POSITIVE_INFINITY, []),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_OUT_OF_RANGE',
    );
  });

  it('rejects 1000 as out of range (B1-RE-008)', () => {
    assert.throws(
      () => validateCandidateNnn(1000, []),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_OUT_OF_RANGE',
    );
  });

  it('validates input range before monotonicity', () => {
    // 0 is out of range — should throw OUT_OF_RANGE, not NOT_MONOTONIC,
    // even when max(NNN) > 0.
    assert.throws(
      () => validateCandidateNnn(0, ['20260806-005-explore']),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_ID_NNN_OUT_OF_RANGE',
    );
  });

  it('accepts candidate 1 for an empty list', () => {
    assert.doesNotThrow(() => validateCandidateNnn(1, []));
  });
});
