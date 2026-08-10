import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTION_CATALOG,
  CHANGE_ACTIONS,
  DELIVERY_ACTIONS,
  isChangeAction,
  isDeliveryAction,
  isFormalAction,
} from '../../../src/domain/actions.js';

describe('CHANGE_ACTIONS', () => {
  it('contains exactly ten Change Actions in lifecycle order', () => {
    assert.deepEqual([...CHANGE_ACTIONS], [
      'explore',
      'review-explore',
      'revise-explore',
      'propose',
      'review-propose',
      'revise-propose',
      'apply',
      'review-apply',
      'revise-apply',
      'archive',
    ]);
    assert.equal(CHANGE_ACTIONS.length, 10);
  });

  it('does not contain review, revise, or change-checkpoint', () => {
    const all = [...CHANGE_ACTIONS] as readonly string[];
    assert.equal(all.includes('review'), false);
    assert.equal(all.includes('revise'), false);
    assert.equal(all.includes('change-checkpoint'), false);
  });
});

describe('DELIVERY_ACTIONS', () => {
  it('contains exactly two Delivery Actions', () => {
    assert.deepEqual([...DELIVERY_ACTIONS], ['full-test', 'delivery-finalize']);
    assert.equal(DELIVERY_ACTIONS.length, 2);
  });

  it('does not contain review, revise, or change-checkpoint', () => {
    const all = [...DELIVERY_ACTIONS] as readonly string[];
    assert.equal(all.includes('review'), false);
    assert.equal(all.includes('revise'), false);
    assert.equal(all.includes('change-checkpoint'), false);
  });
});

describe('ACTION_CATALOG', () => {
  it('contains all twelve formal Actions', () => {
    assert.equal(ACTION_CATALOG.length, 12);
    assert.equal(ACTION_CATALOG.includes('explore'), true);
    assert.equal(ACTION_CATALOG.includes('archive'), true);
    assert.equal(ACTION_CATALOG.includes('full-test'), true);
    assert.equal(ACTION_CATALOG.includes('delivery-finalize'), true);
  });
});

describe('type guards', () => {
  it('isChangeAction recognizes Change Actions', () => {
    assert.equal(isChangeAction('explore'), true);
    assert.equal(isChangeAction('archive'), true);
    assert.equal(isChangeAction('full-test'), false);
    assert.equal(isChangeAction('review'), false);
    assert.equal(isChangeAction('unknown'), false);
  });

  it('isDeliveryAction recognizes Delivery Actions', () => {
    assert.equal(isDeliveryAction('full-test'), true);
    assert.equal(isDeliveryAction('delivery-finalize'), true);
    assert.equal(isDeliveryAction('explore'), false);
    assert.equal(isDeliveryAction('unknown'), false);
  });

  it('isFormalAction recognizes all formal Actions', () => {
    assert.equal(isFormalAction('explore'), true);
    assert.equal(isFormalAction('full-test'), true);
    assert.equal(isFormalAction('delivery-finalize'), true);
    assert.equal(isFormalAction('review'), false);
    assert.equal(isFormalAction('revise'), false);
    assert.equal(isFormalAction('change-checkpoint'), false);
    assert.equal(isFormalAction('unknown'), false);
  });
});
