import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHANGE_STATE_TRANSITIONS,
  DELIVERY_STATE_TRANSITIONS,
  RUN_STATE_TRANSITIONS,
  canTransition,
} from '../../../src/domain/states.js';
import type {
  ChangeState,
  DeliveryState,
  RunStatus,
} from '../../../src/domain/types.js';

describe('DELIVERY_STATE_TRANSITIONS', () => {
  const allDeliveryStates: DeliveryState[] = [
    'active',
    'completed',
    'cancelled',
  ];

  it('allows active -> completed and active -> cancelled', () => {
    assert.equal(canTransition(DELIVERY_STATE_TRANSITIONS, 'active', 'completed'), true);
    assert.equal(canTransition(DELIVERY_STATE_TRANSITIONS, 'active', 'cancelled'), true);
  });

  it('exhaustive matrix: only active->completed and active->cancelled are valid', () => {
    for (const from of allDeliveryStates) {
      for (const to of allDeliveryStates) {
        const result = canTransition(DELIVERY_STATE_TRANSITIONS, from, to);
        if (from === 'active' && (to === 'completed' || to === 'cancelled')) {
          assert.equal(result, true, `expected ${from}->${to} to be valid`);
        } else {
          assert.equal(result, false, `expected ${from}->${to} to be invalid`);
        }
      }
    }
  });

  it('terminal states have no outgoing edges', () => {
    assert.equal(DELIVERY_STATE_TRANSITIONS.completed.length, 0);
    assert.equal(DELIVERY_STATE_TRANSITIONS.cancelled.length, 0);
  });
});

describe('CHANGE_STATE_TRANSITIONS', () => {
  const allChangeStates: ChangeState[] = [
    'planned',
    'active',
    'completed',
    'cancelled',
  ];

  it('exhaustive matrix covers all State x State combinations', () => {
    const validTransitions = new Set([
      'planned->active',
      'planned->cancelled',
      'active->completed',
      'active->cancelled',
    ]);
    for (const from of allChangeStates) {
      for (const to of allChangeStates) {
        const result = canTransition(CHANGE_STATE_TRANSITIONS, from, to);
        const key = `${from}->${to}`;
        if (validTransitions.has(key)) {
          assert.equal(result, true, `expected ${key} to be valid`);
        } else {
          assert.equal(result, false, `expected ${key} to be invalid`);
        }
      }
    }
  });

  it('terminal states have no outgoing edges', () => {
    assert.equal(CHANGE_STATE_TRANSITIONS.completed.length, 0);
    assert.equal(CHANGE_STATE_TRANSITIONS.cancelled.length, 0);
  });
});

describe('RUN_STATE_TRANSITIONS', () => {
  const allRunStatuses: RunStatus[] = [
    'pending',
    'completed',
    'failed',
    'cancelled',
  ];

  it('exhaustive matrix covers all State x State combinations', () => {
    const validTransitions = new Set([
      'pending->completed',
      'pending->failed',
      'pending->cancelled',
    ]);
    for (const from of allRunStatuses) {
      for (const to of allRunStatuses) {
        const result = canTransition(RUN_STATE_TRANSITIONS, from, to);
        const key = `${from}->${to}`;
        if (validTransitions.has(key)) {
          assert.equal(result, true, `expected ${key} to be valid`);
        } else {
          assert.equal(result, false, `expected ${key} to be invalid`);
        }
      }
    }
  });

  it('terminal states have no outgoing edges', () => {
    assert.equal(RUN_STATE_TRANSITIONS.completed.length, 0);
    assert.equal(RUN_STATE_TRANSITIONS.failed.length, 0);
    assert.equal(RUN_STATE_TRANSITIONS.cancelled.length, 0);
  });
});

describe('canTransition (generic)', () => {
  it('returns false for self-transitions', () => {
    assert.equal(canTransition(DELIVERY_STATE_TRANSITIONS, 'active', 'active'), false);
    assert.equal(canTransition(CHANGE_STATE_TRANSITIONS, 'planned', 'planned'), false);
  });

  it('works with a custom table', () => {
    const customTable: Record<'a' | 'b' | 'c', readonly ('a' | 'b' | 'c')[]> = {
      a: ['b'],
      b: ['c'],
      c: [],
    };
    assert.equal(canTransition(customTable, 'a', 'b'), true);
    assert.equal(canTransition(customTable, 'a', 'c'), false);
    assert.equal(canTransition(customTable, 'b', 'c'), true);
    assert.equal(canTransition(customTable, 'c', 'a'), false);
  });
});
