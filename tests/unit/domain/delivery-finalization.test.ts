import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDeliveryFinalizationQualification,
  deliveryFinalCandidateRefFor,
  parseDeliveryFinalizationProjection,
} from '../../../src/domain/delivery-finalization.js';
import { FlowkitError } from '../../../src/shared/errors.js';

const deliveryId = '20991231-41-future-finalize';
const fullTestAuthorizationRef = `owner:${'a'.repeat(64)}`;
const fullTestResultRef = `verification:full-test:${'b'.repeat(64)}`;
const base = 'c'.repeat(40);

function qualification(overrides: Partial<Parameters<typeof buildDeliveryFinalizationQualification>[0]> = {}) {
  return buildDeliveryFinalizationQualification({
    deliveryId,
    fullTestAuthorizationRef,
    fullTestResultRef,
    qualifiedBaseRevision: base,
    architecture: { kind: 'not-applicable' },
    ...overrides,
  });
}

describe('F1 Delivery finalization deterministic identity', () => {
  it('changes when the Full Test occurrence or qualified Git boundary changes', () => {
    const a = qualification();
    const freshAuthorization = qualification({ fullTestAuthorizationRef: `owner:${'d'.repeat(64)}` });
    const freshBase = qualification({ qualifiedBaseRevision: 'e'.repeat(40) });
    assert.notEqual(a.qualificationRef, freshAuthorization.qualificationRef);
    assert.notEqual(a.qualificationRef, freshBase.qualificationRef);
  });

  it('binds accepted architecture cycle/Owner acceptance without conflating it with not-applicable', () => {
    const accepted = qualification({
      architecture: {
        kind: 'accepted',
        cycleRef: `architecture-cycle:${'f'.repeat(64)}`,
        ownerAcceptanceRef: `owner:${'1'.repeat(64)}`,
      },
    });
    assert.notEqual(accepted.qualificationRef, qualification().qualificationRef);
  });

  it('candidateRef is deterministic across caller file order and binds exact qualifiedBaseRevision', () => {
    const files = [
      { path: 'z.txt', sha256: '1'.repeat(64) },
      { path: 'a.txt', sha256: '2'.repeat(64) },
    ];
    const a = deliveryFinalCandidateRefFor({ deliveryId, qualifiedBaseRevision: base, files });
    const b = deliveryFinalCandidateRefFor({ deliveryId, qualifiedBaseRevision: base, files: [...files].reverse() });
    const c = deliveryFinalCandidateRefFor({ deliveryId, qualifiedBaseRevision: '9'.repeat(40), files });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it('parses only the closed persisted finalization projection', () => {
    const q = qualification();
    const value = {
      schemaVersion: 1,
      qualificationRef: q.qualificationRef,
      ownerAuthorizationRef: `owner:${'2'.repeat(64)}`,
      candidateRef: `delivery-final-candidate:${'3'.repeat(64)}`,
    };
    assert.deepEqual(parseDeliveryFinalizationProjection(value), value);
    assert.throws(
      () => parseDeliveryFinalizationProjection({ ...value, extra: true }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'DELIVERY_FINALIZATION_INVALID',
    );
  });
});
