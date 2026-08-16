import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_CATALOG, CHANGE_ACTIONS, isChangeAction, isFormalAction } from '../../../src/domain/actions.js';

describe('Change-only Standard Action Catalog', () => {
  it('contains exactly ten Change lifecycle Actions in order', () => {
    assert.deepEqual([...CHANGE_ACTIONS], [
      'explore', 'review-explore', 'revise-explore',
      'propose', 'review-propose', 'revise-propose',
      'apply', 'review-apply', 'revise-apply', 'archive',
    ]);
    assert.deepEqual([...ACTION_CATALOG], [...CHANGE_ACTIONS]);
    assert.equal(ACTION_CATALOG.length, 10);
  });

  it('does not treat Delivery behaviors or Git boundaries as FormalAction', () => {
    for (const value of ['full-test', 'delivery-finalize', 'change-checkpoint', 'review', 'revise']) {
      assert.equal(isChangeAction(value), false);
      assert.equal(isFormalAction(value), false);
    }
    assert.equal(isFormalAction('explore'), true);
    assert.equal(isFormalAction('archive'), true);
  });
});
