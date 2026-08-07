import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectStage, completedRunsForChange } from '../../../src/policy/stage-detector.js';
import { buildRun } from './fixtures.js';

const CHANGE_ID = 'D1';

describe('stage-detector (task 3.1-3.9, 10.3)', () => {
  describe('detectStage', () => {
    it('returns explore when no completed Run exists (task 3.7)', () => {
      assert.equal(detectStage([], CHANGE_ID), 'explore');
    });

    it('returns explore for failed-only Runs (not completed)', () => {
      const failed = buildRun({ nnn: 1, action: 'explore', status: 'failed' });
      assert.equal(detectStage([failed], CHANGE_ID), 'explore');
    });

    it('detects explore stage from explore/revise-explore/review-explore (task 3.3)', () => {
      for (const action of ['explore', 'revise-explore', 'review-explore'] as const) {
        const role = action === 'review-explore' ? 'reviewer' : 'author';
        const run = buildRun({ nnn: 1, action, role });
        assert.equal(detectStage([run], CHANGE_ID), 'explore', `${action} → explore`);
      }
    });

    it('detects propose stage from propose/revise-propose/review-propose (task 3.4)', () => {
      for (const action of ['propose', 'revise-propose', 'review-propose'] as const) {
        const role = action === 'review-propose' ? 'reviewer' : 'author';
        const run = buildRun({ nnn: 1, action, role });
        assert.equal(detectStage([run], CHANGE_ID), 'propose', `${action} → propose`);
      }
    });

    it('detects apply stage from apply/revise-apply/review-apply (task 3.5)', () => {
      for (const action of ['apply', 'revise-apply', 'review-apply'] as const) {
        const role = action === 'review-apply' ? 'reviewer' : 'author';
        const run = buildRun({ nnn: 1, action, role });
        assert.equal(detectStage([run], CHANGE_ID), 'apply', `${action} → apply`);
      }
    });

    it('detects archive stage from archive (task 3.6)', () => {
      const run = buildRun({ nnn: 1, action: 'archive' });
      assert.equal(detectStage([run], CHANGE_ID), 'archive');
    });

    it('scans newest-first: a later explore Run overrides an earlier propose Run (task 3.2)', () => {
      const propose = buildRun({ nnn: 1, action: 'propose' });
      const reviewExplore = buildRun({ nnn: 5, action: 'review-explore', role: 'reviewer' });
      // newest completed is review-explore → explore stage
      assert.equal(detectStage([propose, reviewExplore], CHANGE_ID), 'explore');
    });

    it('progresses through stages as Runs accumulate', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      assert.equal(detectStage([explore], CHANGE_ID), 'explore');
      const reviewExplore = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      assert.equal(detectStage([explore, reviewExplore], CHANGE_ID), 'explore');
      const propose = buildRun({ nnn: 3, action: 'propose' });
      assert.equal(detectStage([explore, reviewExplore, propose], CHANGE_ID), 'propose');
      const apply = buildRun({ nnn: 4, action: 'apply' });
      assert.equal(detectStage([explore, reviewExplore, propose, apply], CHANGE_ID), 'apply');
      const archive = buildRun({ nnn: 5, action: 'archive' });
      assert.equal(detectStage([explore, reviewExplore, propose, apply, archive], CHANGE_ID), 'archive');
    });

    it('excludes other Changes and non-completed Runs', () => {
      const other = buildRun({ nnn: 9, action: 'archive', changeId: 'OTHER' });
      const pending = buildRun({ nnn: 1, action: 'explore', status: 'pending' });
      const explore = buildRun({ nnn: 2, action: 'explore' });
      assert.equal(detectStage([other, pending, explore], CHANGE_ID), 'explore');
    });
  });

  describe('completedRunsForChange', () => {
    it('returns only completed Runs of the Change, newest-first', () => {
      const r1 = buildRun({ nnn: 1, action: 'explore' });
      const r3 = buildRun({ nnn: 3, action: 'revise-explore' });
      const failed = buildRun({ nnn: 5, action: 'explore', status: 'failed' });
      const other = buildRun({ nnn: 2, action: 'explore', changeId: 'OTHER' });
      const result = completedRunsForChange([r1, r3, failed, other], CHANGE_ID);
      assert.equal(result.length, 2);
      assert.equal(result[0]?.runId, r3.runId); // newest first
      assert.equal(result[1]?.runId, r1.runId);
    });
  });

  describe('purity (task 3.9)', () => {
    it('does not mutate input', () => {
      const runs = [buildRun({ nnn: 1, action: 'explore' })];
      const copy = [...runs];
      detectStage(runs, CHANGE_ID);
      assert.deepEqual(runs, copy);
    });
  });
});
