import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapVerificationStatusToGate,
  evaluateVerificationGate,
  readChangeVerificationStatus,
  verificationGateUnmet,
  verificationGateDiagnosis,
} from '../../../src/policy/verification-gate.js';
import { buildSnapshot } from './fixtures.js';
import type { VerificationStatus } from '../../../src/domain/types.js';

// ---------------------------------------------------------------------------
// mapVerificationStatusToGate — pure status → gate mapping (D1-RA-002)
// ---------------------------------------------------------------------------

describe('mapVerificationStatusToGate — fail-closed status mapping (D1-RA-002, D1-RA-003)', () => {
  it('undefined (no field) → unavailable', () => {
    assert.deepEqual(mapVerificationStatusToGate(undefined), { kind: 'unavailable' });
  });

  it('passed → satisfied (gate satisfied)', () => {
    assert.deepEqual(mapVerificationStatusToGate('passed'), { kind: 'satisfied' });
  });

  it('not-applicable → satisfied (D1-RA-003: not-applicable satisfies the gate)', () => {
    // Frozen verification-model.md Section 3.3 permits `passed | not-applicable`
    // before review-apply; delivery-lifecycle.md Section 3.5 accepts both for
    // Archive. not-applicable is NOT fail-closed to not-run.
    assert.deepEqual(mapVerificationStatusToGate('not-applicable'), { kind: 'satisfied' });
  });

  it('failed → failed (distinct from unavailable)', () => {
    assert.deepEqual(mapVerificationStatusToGate('failed'), { kind: 'failed' });
  });

  it('not-run → not-run (distinct from unavailable and failed)', () => {
    assert.deepEqual(mapVerificationStatusToGate('not-run'), { kind: 'not-run' });
  });

  it('passed and not-applicable both release the gate (D1-RA-003)', () => {
    assert.equal(verificationGateUnmet(mapVerificationStatusToGate('passed')), null);
    assert.equal(verificationGateUnmet(mapVerificationStatusToGate('not-applicable')), null);
  });

  it('exhaustive: every VerificationStatus + undefined is handled', () => {
    const all: (VerificationStatus | undefined)[] = [
      undefined,
      'not-run',
      'passed',
      'failed',
      'not-applicable',
    ];
    for (const s of all) {
      const r = mapVerificationStatusToGate(s);
      assert.ok(
        r.kind === 'unavailable' || r.kind === 'satisfied' || r.kind === 'failed' || r.kind === 'not-run',
        `status ${s} produced an invalid gate kind`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// verificationGateUnmet — gate → canRun unmet precondition string
// ---------------------------------------------------------------------------

describe('verificationGateUnmet — gate → canRun unmet (D1-RA-002, D1-RA-003)', () => {
  it('satisfied → null (gate satisfied, no unmet)', () => {
    assert.equal(verificationGateUnmet({ kind: 'satisfied' }), null);
  });

  it('unavailable → verification-facts-unavailable', () => {
    assert.equal(
      verificationGateUnmet({ kind: 'unavailable' }),
      'verification-facts-unavailable',
    );
  });

  it('failed → verification-failed (distinct from unavailable)', () => {
    assert.equal(verificationGateUnmet({ kind: 'failed' }), 'verification-failed');
  });

  it('not-run → verification-not-run (distinct from unavailable and failed)', () => {
    assert.equal(verificationGateUnmet({ kind: 'not-run' }), 'verification-not-run');
  });
});

// ---------------------------------------------------------------------------
// verificationGateDiagnosis — gate → next() blocked diagnosis
// ---------------------------------------------------------------------------

describe('verificationGateDiagnosis — gate → next() blocked diagnosis (D1-RA-002)', () => {
  it('unavailable → verification-facts-unavailable diagnosis', () => {
    const d = verificationGateDiagnosis({ kind: 'unavailable' });
    assert.equal(d.reason, 'verification-facts-unavailable');
    assert.ok(d.unmetPreconditions.includes('verification-facts-unavailable'));
  });

  it('failed → verification-failed diagnosis (distinct reason)', () => {
    const d = verificationGateDiagnosis({ kind: 'failed' });
    assert.equal(d.reason, 'verification-failed');
    assert.ok(d.unmetPreconditions.includes('verification-failed'));
    assert.equal(d.unmetPreconditions.includes('verification-facts-unavailable'), false);
  });

  it('not-run → verification-not-run diagnosis (distinct reason)', () => {
    const d = verificationGateDiagnosis({ kind: 'not-run' });
    assert.equal(d.reason, 'verification-not-run');
    assert.ok(d.unmetPreconditions.includes('verification-not-run'));
    assert.equal(d.unmetPreconditions.includes('verification-facts-unavailable'), false);
  });
});

// ---------------------------------------------------------------------------
// readChangeVerificationStatus + evaluateVerificationGate — D1 current state
// ---------------------------------------------------------------------------

describe('evaluateVerificationGate — D1 current state (D1-7, D1-RA-002)', () => {
  it('readChangeVerificationStatus returns undefined (C1 snapshot has no field)', () => {
    const snap = buildSnapshot({});
    assert.equal(readChangeVerificationStatus(snap), undefined);
  });

  it('evaluateVerificationGate returns unavailable for a D1 snapshot', () => {
    // The C1 FormalFactSnapshot carries no Change Verification status field,
    // so the gate is always `unavailable` in D1. This is the fail-closed
    // behavior: review-apply/archive cannot proceed, mirroring canRun.
    const snap = buildSnapshot({});
    assert.deepEqual(evaluateVerificationGate(snap), { kind: 'unavailable' });
  });

  it('evaluateVerificationGate → unavailable → unmet verification-facts-unavailable (canRun consistency)', () => {
    const snap = buildSnapshot({});
    const gate = evaluateVerificationGate(snap);
    assert.equal(verificationGateUnmet(gate), 'verification-facts-unavailable');
  });

  it('evaluateVerificationGate → unavailable → diagnosis verification-facts-unavailable (next consistency)', () => {
    const snap = buildSnapshot({});
    const gate = evaluateVerificationGate(snap);
    assert.equal(gate.kind, 'unavailable');
    const d = verificationGateDiagnosis(gate);
    assert.equal(d.reason, 'verification-facts-unavailable');
  });
});
