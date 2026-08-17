import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveFullTestFailureFinding,
  fullTestFailureFindingIdFor,
  fullTestResultRefFor,
} from '../../../src/domain/full-test.js';

describe('B1 Full Test failure occurrence identity', () => {
  it('separates Verification content identity from authorization occurrence identity', () => {
    const payload = {
      schemaVersion: 1 as const,
      status: 'failed' as const,
      summary: 'same failure',
      totalDurationMs: 7,
      checks: [{ id: 'full', status: 'failed' as const, durationMs: 7 }],
    };
    const result = { ...payload, resultRef: fullTestResultRefFor(payload) };
    const first = deriveFullTestFailureFinding({ deliveryId: 'D1', authorizationRef: `owner:${'1'.repeat(64)}`, result });
    const second = deriveFullTestFailureFinding({ deliveryId: 'D1', authorizationRef: `owner:${'2'.repeat(64)}`, result });
    assert.equal(first.sourceResultRef, second.sourceResultRef);
    assert.notEqual(first.findingId, second.findingId);
    assert.equal(first.findingId, fullTestFailureFindingIdFor({ deliveryId: 'D1', authorizationRef: first.authorizationRef, sourceResultRef: result.resultRef }));
  });
});
