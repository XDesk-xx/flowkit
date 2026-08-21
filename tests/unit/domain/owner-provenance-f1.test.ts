import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ownerDecisionRefFor } from '../../../src/domain/owner-provenance.js';

describe('F1 Owner Finalize provenance compatibility', () => {
  const legacy = {
    decision: 'authorize-delivery-finalize' as const,
    deliveryId: '20991231-61-future-delivery',
    sourceRef: 'owner:test:f1:finalize',
  };

  it('keeps the legacy absent-field canonical ref byte-for-byte stable', () => {
    assert.equal(ownerDecisionRefFor(legacy), ownerDecisionRefFor({ ...legacy }));
  });

  it('binds fresh Finalize Owner authority to the exact qualification ref', () => {
    const a = ownerDecisionRefFor({ ...legacy, finalizationQualificationRef: `delivery-finalization-qualification:${'a'.repeat(64)}` });
    const b = ownerDecisionRefFor({ ...legacy, finalizationQualificationRef: `delivery-finalization-qualification:${'b'.repeat(64)}` });
    assert.notEqual(a, ownerDecisionRefFor(legacy));
    assert.notEqual(a, b);
  });
});
