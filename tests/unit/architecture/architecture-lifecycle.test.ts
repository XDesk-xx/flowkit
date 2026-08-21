import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  acceptedSourceMatchesCycle,
  acceptedSystemSourceFor,
  actualArchitectureRefFor,
  architectureCompareRefFor,
  buildCurrentArchitectureCycle,
  parseCurrentArchitectureCycle,
} from '../../../src/architecture/architecture-lifecycle.js';
import { ownerDecisionRefFor } from '../../../src/domain/owner-provenance.js';

const deliveryId = '20990101-01-source';
const revision = 'a'.repeat(40);
const actual = actualArchitectureRefFor({ deliveryId, jsonBytes: '{"x":1}\n', repositoryRevision: revision });
const compareRef = architectureCompareRefFor({
  plannedPath: `architecture/${deliveryId}/json/planned.architecture.json`,
  actualArchitectureRef: actual,
  compareResult: { ok: true, summary: { changed: 0 } },
});
const fullTestResultRef = `verification:full-test:${'b'.repeat(64)}`;

function cycle(authHex: string) {
  return buildCurrentArchitectureCycle({
    fullTestAuthorizationRef: `owner:${authHex.repeat(64).slice(0, 64)}`,
    fullTestResultRef,
    actualArchitectureRef: actual,
    compareRef,
  });
}

describe('E1 architecture lifecycle identities', () => {
  it('makes a fresh Full Test authorization occurrence produce a fresh cycle even when technical evidence is identical', () => {
    const first = cycle('1');
    const second = cycle('2');
    assert.notEqual(first.fullTestAuthorizationRef, second.fullTestAuthorizationRef);
    assert.equal(first.fullTestResultRef, second.fullTestResultRef);
    assert.deepEqual(first.actualArchitectureRef, second.actualArchitectureRef);
    assert.equal(first.compareRef, second.compareRef);
    assert.notEqual(first.cycleRef, second.cycleRef);
  });

  it('recomputes cycle identity and rejects stale/forged cycle refs', () => {
    const current = cycle('3');
    assert.deepEqual(parseCurrentArchitectureCycle(current, deliveryId), current);
    assert.throws(
      () => parseCurrentArchitectureCycle({ ...current, cycleRef: `architecture-cycle:${'0'.repeat(64)}` }, deliveryId),
      /does not match canonical identity/,
    );
  });

  it('binds accepted source to exact accepted cycle and Owner acceptance', () => {
    const awaiting = cycle('4');
    const ownerAcceptanceRef = ownerDecisionRefFor({
      decision: 'accept-architecture',
      deliveryId,
      architectureCycleRef: awaiting.cycleRef,
      sourceRef: 'owner:test-accept',
    });
    const accepted = { ...awaiting, acceptance: { status: 'accepted' as const, ownerDecisionRef: ownerAcceptanceRef } };
    const source = acceptedSystemSourceFor({ sourceDeliveryId: deliveryId, cycle: accepted, ownerAcceptanceRef });
    assert.equal(acceptedSourceMatchesCycle(source, accepted), true);
    assert.equal(acceptedSourceMatchesCycle({ ...source, compareRef: `architecture-compare:${'0'.repeat(64)}` }, accepted), false);
  });

  it('preserves legacy Owner ref bytes when architectureCycleRef is absent and changes relevant E1 refs only when present', () => {
    const legacyInput = {
      decision: 'create-change' as const,
      deliveryId,
      changeId: 'remediation',
      sourceRef: 'owner:legacy-compatible',
    };
    const legacyBefore = ownerDecisionRefFor(legacyInput);
    const legacyAfter = ownerDecisionRefFor({ ...legacyInput });
    const bound = ownerDecisionRefFor({ ...legacyInput, architectureCycleRef: cycle('5').cycleRef });
    assert.equal(legacyAfter, legacyBefore);
    assert.notEqual(bound, legacyBefore);
  });
});
