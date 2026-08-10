import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FlowkitError } from '../../../src/shared/errors.js';
import { assertMutable, isTerminal } from '../../../src/domain/terminal.js';
import type { Run } from '../../../src/domain/types.js';

function makeRun(status: Run['status']): Run {
  return {
    runId: '20260806-001-explore',
    deliveryId: '20260806-01-deterministic-core',
    changeId: 'domain-and-state-schema',
    action: 'explore',
    role: 'author',
    status,
  };
}

describe('isTerminal', () => {
  it('returns true for completed, failed, and cancelled', () => {
    assert.equal(isTerminal('completed'), true);
    assert.equal(isTerminal('failed'), true);
    assert.equal(isTerminal('cancelled'), true);
  });

  it('returns false for pending', () => {
    assert.equal(isTerminal('pending'), false);
  });
});

describe('assertMutable', () => {
  it('does not throw for a pending Run', () => {
    assert.doesNotThrow(() => assertMutable(makeRun('pending')));
  });

  it('throws RUN_TERMINAL for a completed Run', () => {
    assert.throws(
      () => assertMutable(makeRun('completed')),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_TERMINAL',
    );
  });

  it('throws RUN_TERMINAL for a failed Run', () => {
    assert.throws(
      () => assertMutable(makeRun('failed')),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_TERMINAL',
    );
  });

  it('throws RUN_TERMINAL for a cancelled Run', () => {
    assert.throws(
      () => assertMutable(makeRun('cancelled')),
      (err: unknown) => err instanceof FlowkitError && err.code === 'RUN_TERMINAL',
    );
  });
});
