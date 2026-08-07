import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  currentArtifactRun,
  currentReview,
  lineageMatch,
  computeLineage,
} from '../../../src/policy/lineage.js';
import { buildRun, buildVerdict, buildChange } from './fixtures.js';

const CHANGE_ID = 'D1';

describe('lineage (task 2.1-2.6, 10.2, 10.12)', () => {
  describe('currentArtifactRun', () => {
    it('returns null when stage has not started (task 2.6)', () => {
      const runs = [buildRun({ nnn: 1, action: 'explore', status: 'failed' })];
      assert.equal(currentArtifactRun(runs, CHANGE_ID, 'explore'), null);
    });

    it('returns the latest completed explore Run (task 2.2)', () => {
      const r1 = buildRun({ nnn: 1, action: 'explore' });
      const r2 = buildRun({ nnn: 3, action: 'revise-explore' });
      const runs = [r1, r2];
      const artifact = currentArtifactRun(runs, CHANGE_ID, 'explore');
      assert.equal(artifact?.runId, r2.runId);
    });

    it('excludes review-explore (not an artifact producer)', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const runs = [explore, review];
      const artifact = currentArtifactRun(runs, CHANGE_ID, 'explore');
      assert.equal(artifact?.runId, explore.runId);
    });

    it('excludes failed/cancelled Runs and other Changes (task 2.5, 2.6)', () => {
      const failedRevise = buildRun({ nnn: 5, action: 'revise-explore', status: 'failed' });
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const otherChange = buildRun({ nnn: 2, action: 'explore', changeId: 'OTHER' });
      const runs = [failedRevise, explore, otherChange];
      const artifact = currentArtifactRun(runs, CHANGE_ID, 'explore');
      assert.equal(artifact?.runId, explore.runId);
    });

    it('picks the newest by runId when multiple artifacts exist', () => {
      const r1 = buildRun({ nnn: 1, action: 'explore' });
      const r5 = buildRun({ nnn: 5, action: 'revise-explore' });
      const r3 = buildRun({ nnn: 3, action: 'revise-explore' });
      const runs = [r1, r3, r5];
      const artifact = currentArtifactRun(runs, CHANGE_ID, 'explore');
      assert.equal(artifact?.runId, r5.runId);
    });
  });

  describe('currentReview', () => {
    it('returns null when no completed review-S Run exists (task 2.6)', () => {
      const runs = [buildRun({ nnn: 1, action: 'explore' })];
      assert.equal(currentReview(runs, [], CHANGE_ID, 'explore'), null);
    });

    it('returns the verdict of the latest completed review-S Run (task 2.3)', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const verdict = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
      const result = currentReview([explore, review], [verdict], CHANGE_ID, 'explore');
      assert.equal(result?.verdict, 'changes-requested');
      assert.equal(result?.reviewedRunId, explore.runId);
    });

    it('skips a completed review Run with no matching verdict (malformed)', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const reviewNoVerdict = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const result = currentReview([explore, reviewNoVerdict], [], CHANGE_ID, 'explore');
      assert.equal(result, null);
    });

    it('picks the newest review-S Run', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review2 = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const review5 = buildRun({ nnn: 5, action: 'review-explore', role: 'reviewer' });
      const v2 = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
      const v5 = buildVerdict({ reviewNnn: 5, reviewedRunId: explore.runId, verdict: 'approved' });
      const result = currentReview([explore, review2, review5], [v2, v5], CHANGE_ID, 'explore');
      assert.equal(result?.reviewRunId, v5.reviewRunId);
      assert.equal(result?.verdict, 'approved');
    });
  });

  describe('lineageMatch', () => {
    it('returns true when reviewedRunId matches artifact runId (task 2.4)', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const verdict = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId });
      assert.equal(lineageMatch(verdict, explore), true);
    });

    it('returns false when reviewedRunId differs (no match)', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const revise = buildRun({ nnn: 3, action: 'revise-explore' });
      // old review pointed at the original explore; artifact is now revise → no match
      const verdict = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId });
      assert.equal(lineageMatch(verdict, revise), false);
    });

    it('returns false when either argument is null', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const verdict = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId });
      assert.equal(lineageMatch(null, explore), false);
      assert.equal(lineageMatch(verdict, null), false);
      assert.equal(lineageMatch(null, null), false);
    });
  });

  describe('computeLineage (bundled view)', () => {
    it('bundles artifact, review, match, verdict for a stage', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const verdict = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
      const state = computeLineage([explore, review], [verdict], CHANGE_ID, 'explore');
      assert.equal(state.stage, 'explore');
      assert.equal(state.artifact?.runId, explore.runId);
      assert.equal(state.review?.verdict, 'approved');
      assert.equal(state.match, true);
      assert.equal(state.verdict, 'approved');
    });

    it('match is false after revise-S produces a new artifact (task 10.12)', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const revise = buildRun({ nnn: 3, action: 'revise-explore' });
      // review pointed at explore; artifact is now revise → no match
      const verdict = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
      const state = computeLineage([explore, review, revise], [verdict], CHANGE_ID, 'explore');
      assert.equal(state.artifact?.runId, revise.runId);
      assert.equal(state.match, false);
      assert.equal(state.verdict, 'changes-requested');
    });

    it('match is true after review(approved) covers the latest artifact', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const verdict = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
      const state = computeLineage([explore, review], [verdict], CHANGE_ID, 'explore');
      assert.equal(state.match, true);
      assert.equal(state.verdict, 'approved');
    });
  });

  describe('purity (task 2.5)', () => {
    it('does not mutate input arrays', () => {
      const explore = buildRun({ nnn: 1, action: 'explore' });
      const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
      const verdict = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId });
      const runs = [explore, review];
      const verdicts = [verdict];
      const runsCopy = [...runs];
      const verdictsCopy = [...verdicts];
      computeLineage(runs, verdicts, CHANGE_ID, 'explore');
      assert.deepEqual(runs, runsCopy);
      assert.deepEqual(verdicts, verdictsCopy);
    });
  });
});

describe('lineage multi-round revise→review loop (task 10.11, 10.12)', () => {
  it('correctly tracks lineage across cr → revise → cr → revise → approved', () => {
    const change = buildChange();
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review1 = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v1 = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    const revise1 = buildRun({ nnn: 3, action: 'revise-explore' });
    const review2 = buildRun({ nnn: 4, action: 'review-explore', role: 'reviewer' });
    const v2 = buildVerdict({ reviewNnn: 4, reviewedRunId: revise1.runId, verdict: 'changes-requested' });
    const revise2 = buildRun({ nnn: 5, action: 'revise-explore' });
    const review3 = buildRun({ nnn: 6, action: 'review-explore', role: 'reviewer' });
    const v3 = buildVerdict({ reviewNnn: 6, reviewedRunId: revise2.runId, verdict: 'approved' });

    const runs = [explore, review1, revise1, review2, revise2, review3];
    const verdicts = [v1, v2, v3];

    // After review1 (cr) on explore: match + cr
    let state = computeLineage(
      [explore, review1],
      [v1],
      change.id,
      'explore',
    );
    assert.equal(state.match, true);
    assert.equal(state.verdict, 'changes-requested');

    // After revise1: artifact=revise1, review1 still points at explore → no match
    state = computeLineage([explore, review1, revise1], [v1], change.id, 'explore');
    assert.equal(state.artifact?.runId, revise1.runId);
    assert.equal(state.match, false);

    // After review2 (cr) on revise1: match + cr
    state = computeLineage(
      [explore, review1, revise1, review2],
      [v1, v2],
      change.id,
      'explore',
    );
    assert.equal(state.match, true);
    assert.equal(state.verdict, 'changes-requested');

    // After revise2 + review3 (approved) on revise2: match + approved → stage complete
    state = computeLineage(runs, verdicts, change.id, 'explore');
    assert.equal(state.match, true);
    assert.equal(state.verdict, 'approved');
  });
});
