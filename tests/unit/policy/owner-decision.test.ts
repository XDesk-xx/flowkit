import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hasOwnerAuthorization } from '../../../src/policy/owner-decision.js';
import type { OwnerAuthorizationFact } from '../../../src/facts/formal-fact-snapshot.js';

describe('A1 typed Owner authorization applicability', () => {
  const fact: OwnerAuthorizationFact = {
    ref: 'owner:test',
    decision: 'authorize-apply',
    deliveryId: 'D1',
    changeId: 'change-a',
    sourceRef: 'owner:message:1',
  };

  it('matches exact decision + Delivery + Change.id only', () => {
    assert.equal(hasOwnerAuthorization([fact], 'authorize-apply', 'D1', 'change-a'), true);
    assert.equal(hasOwnerAuthorization([fact], 'authorize-apply', 'D1', 'change-b'), false);
    assert.equal(hasOwnerAuthorization([fact], 'authorize-apply', 'D2', 'change-a'), false);
    assert.equal(hasOwnerAuthorization([fact], 'authorize-archive', 'D1', 'change-a'), false);
  });

  it('Delivery-scoped authorization does not leak across Delivery or Change', () => {
    const fullTest: OwnerAuthorizationFact = {
      ref: 'owner:full',
      decision: 'authorize-full-test',
      deliveryId: 'D1',
      sourceRef: 'owner:message:2',
    };
    assert.equal(hasOwnerAuthorization([fullTest], 'authorize-full-test', 'D1'), true);
    assert.equal(hasOwnerAuthorization([fullTest], 'authorize-full-test', 'D2'), false);
    assert.equal(hasOwnerAuthorization([fullTest], 'authorize-full-test', 'D1', 'change-a'), false);
  });
});
