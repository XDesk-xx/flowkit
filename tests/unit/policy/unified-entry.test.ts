import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveReview, resolveRevise } from '../../../src/policy/unified-entry.js';
import { canRun } from '../../../src/policy/can-run.js';
import {
  buildChange,
  buildRun,
  buildVerdict,
  buildSnapshot,
  buildAuthorization,
} from './fixtures.js';
import type { Stage } from '../../../src/policy/stage-detector.js';
import type { ChangeAction } from '../../../src/domain/actions.js';
import type { FormalFactSnapshot } from '../../../src/facts/formal-fact-snapshot.js';

// ---------------------------------------------------------------------------
// Per-stage snapshot builders
// ---------------------------------------------------------------------------
//
// `review`/`revise` are unified entry points, not formal Actions. The fixtures
// below construct precise per-stage lineage states so the resolver tests can
// pin the active stage and lineage match/verdict independently.

type RunSpec = ReturnType<typeof buildRun>;
type VerdictSpec = ReturnType<typeof buildVerdict>;

function activeChange(
  runs: readonly RunSpec[],
  verdicts: readonly VerdictSpec[] = [],
  auths: readonly ReturnType<typeof buildAuthorization>[] = [],
): FormalFactSnapshot {
  return buildSnapshot({
    changes: [buildChange({ state: 'active' })],
    runs,
    reviewVerdicts: verdicts,
    ownerAuthorizations: auths,
  });
}

/**
 * Build the Runs/verdicts that put the Change in stage `stage` with a matching
 * `changes-requested` verdict on the stage's current artifact (lineage match +
 * changes-requested). Used by the D1-10 table-driven tests.
 */
function matchChangesRequested(stage: Stage): {
  runs: readonly RunSpec[];
  verdicts: readonly VerdictSpec[];
  artifactRunId: string;
} {
  if (stage === 'explore') {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    return { runs: [explore, review], verdicts: [v], artifactRunId: explore.runId };
  }
  if (stage === 'propose') {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'changes-requested' });
    return { runs: [explore, reviewE, propose, reviewP], verdicts: [vE, vP], artifactRunId: propose.runId };
  }
  // apply
  const explore = buildRun({ nnn: 1, action: 'explore' });
  const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
  const propose = buildRun({ nnn: 3, action: 'propose' });
  const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
  const apply = buildRun({ nnn: 5, action: 'apply' });
  const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
  const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
  const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
  const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: apply.runId, verdict: 'changes-requested' });
  return {
    runs: [explore, reviewE, propose, reviewP, apply, reviewA],
    verdicts: [vE, vP, vA],
    artifactRunId: apply.runId,
  };
}

/**
 * Build the Runs/verdicts where revise-S just completed, producing a new
 * artifact that the prior review does not cover (no lineage match). For
 * explore/propose this makes `canRun(review-S)` allowed again.
 *
 * For `apply`, the D1-7 boundary applies: `canRun(review-apply)` always
 * carries `verification-facts-unavailable` (C1 snapshot has no Verification
 * status), so it stays `allowed: false` even after revise-apply.
 */
function afterRevise(stage: Stage): {
  runs: readonly RunSpec[];
  verdicts: readonly VerdictSpec[];
} {
  const base = matchChangesRequested(stage);
  const nnn = base.runs.length + 1;
  const revise = buildRun({ nnn, action: `revise-${stage}` as ChangeAction });
  // The prior review still points at the old artifact; the new revise-S Run is
  // now the Current Artifact Run → no lineage match.
  return { runs: [...base.runs, revise], verdicts: base.verdicts };
}

// ---------------------------------------------------------------------------
// resolveReview
// ---------------------------------------------------------------------------

describe('resolveReview — basic resolution (task 9.1, 10.17)', () => {
  it('resolves to review-explore when artifact exists and no review', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const snap = activeChange([explore]);
    const r = resolveReview(snap);
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'review-explore');
    }
  });

  it('resolves to review-propose when propose artifact exists and no review', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const snap = activeChange([explore, reviewE, propose], [vE]);
    const r = resolveReview(snap);
    assert.equal(r.kind, 'action');
    if (r.kind === 'action') {
      assert.equal(r.action, 'review-propose');
    }
  });

  it('review/revise resolve to formal review-S / revise-S, never to themselves', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const snap = activeChange([explore]);
    const rr = resolveReview(snap);
    if (rr.kind === 'action') {
      assert.equal(rr.action, 'review-explore');
      // 'review' alone is not a formal Action
      assert.notEqual(rr.action, 'review');
    }
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    const rv = resolveRevise(activeChange([explore, review], [v]));
    if (rv.kind === 'action') {
      assert.equal(rv.action, 'revise-explore');
      assert.notEqual(rv.action, 'revise');
    }
  });
});

describe('resolveReview — blocked cases (task 9.3, 10.17)', () => {
  it('blocked when no active Change', () => {
    const snap = buildSnapshot({ changes: [buildChange({ state: 'planned' })] });
    const r = resolveReview(snap);
    assert.equal(r.kind, 'blocked');
  });

  it('blocked when no artifact in explore stage (fresh change)', () => {
    const snap = activeChange([]);
    const r = resolveReview(snap);
    assert.equal(r.kind, 'blocked');
  });

  it('blocked when stage is archive (no review action)', () => {
    // Build a snapshot whose latest completed Run is archive → stage archive.
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const apply = buildRun({ nnn: 5, action: 'apply' });
    const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
    const archive = buildRun({ nnn: 7, action: 'archive' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: apply.runId, verdict: 'approved' });
    const snap = activeChange(
      [explore, reviewE, propose, reviewP, apply, reviewA, archive],
      [vE, vP, vA],
      [buildAuthorization('apply'), buildAuthorization('archive')],
    );
    const r = resolveReview(snap);
    assert.equal(r.kind, 'blocked');
  });
});

// ---------------------------------------------------------------------------
// D1-10 table-driven: match + changes-requested blocks review (task 9.5, 10.20)
// ---------------------------------------------------------------------------

describe('resolveReview — authority-aware matching changes-requested (task 10.20)', () => {
  for (const stage of ['explore', 'propose', 'apply'] as const) {
    it(`canRun(review-${stage}) allowed:false and unified review blocked on match+cr`, () => {
      const { runs, verdicts } = matchChangesRequested(stage);
      const snap = activeChange(runs, verdicts, stage === 'apply' ? [buildAuthorization('apply')] : []);
      // canRun(review-S) MUST be allowed:false (D1-10).
      const cr = canRun(snap, `review-${stage}` as ChangeAction);
      assert.equal(cr.allowed, false);
      assert.ok(
        cr.unmetPreconditions.includes('matching-author-only-changes-requested-requires-revision'),
        `review-${stage} must carry matching-author-only-changes-requested-requires-revision`,
      );
      // Unified review entry MUST be blocked.
      const r = resolveReview(snap);
      assert.equal(r.kind, 'blocked');
    });
  }
});

describe('resolveReview — D1-10 revise-S restores review-S (task 10.20)', () => {
  // For explore/propose: revise-S produces a new artifact (no match) →
  // canRun(review-S) allowed:true → unified review resolves to review-S.
  for (const stage of ['explore', 'propose'] as const) {
    it(`revise-${stage} completes → no match → resolveReview resolves to review-${stage}`, () => {
      const { runs, verdicts } = afterRevise(stage);
      const snap = activeChange(runs, verdicts, []);
      const cr = canRun(snap, `review-${stage}` as ChangeAction);
      assert.equal(cr.allowed, true, `review-${stage} should be allowed after revise-${stage}`);
      const r = resolveReview(snap);
      assert.equal(r.kind, 'action');
      if (r.kind === 'action') {
        assert.equal(r.action, `review-${stage}`);
      }
    });
  }

  it('apply stage stays blocked after revise-apply (D1-7 boundary: verification-facts-unavailable)', () => {
    // D1 boundary: C1 snapshot carries no Verification status, so
    // canRun(review-apply) always carries verification-facts-unavailable,
    // even after revise-apply produces a new artifact. Unified review for the
    // apply stage therefore stays blocked in D1.
    const { runs, verdicts } = afterRevise('apply');
    const snap = activeChange(runs, verdicts, [buildAuthorization('apply')]);
    const cr = canRun(snap, 'review-apply');
    assert.equal(cr.allowed, false);
    assert.ok(cr.unmetPreconditions.includes('verification-facts-unavailable'));
    assert.ok(!cr.unmetPreconditions.includes('matching-author-only-changes-requested-requires-revision'));
    const r = resolveReview(snap);
    assert.equal(r.kind, 'blocked');
  });
});

// ---------------------------------------------------------------------------
// resolveRevise
// ---------------------------------------------------------------------------

describe('resolveRevise — basic resolution (task 9.2, 10.17)', () => {
  for (const stage of ['explore', 'propose', 'apply'] as const) {
    it(`resolves to revise-${stage} on match + changes-requested`, () => {
      const { runs, verdicts } = matchChangesRequested(stage);
      const snap = activeChange(runs, verdicts, stage === 'apply' ? [buildAuthorization('apply')] : []);
      const r = resolveRevise(snap);
      assert.equal(r.kind, 'action');
      if (r.kind === 'action') {
        assert.equal(r.action, `revise-${stage}`);
      }
    });
  }
});

describe('resolveRevise — blocked cases (task 9.3, 10.17)', () => {
  it('blocked when no active Change', () => {
    const snap = buildSnapshot({ changes: [buildChange({ state: 'planned' })] });
    const r = resolveRevise(snap);
    assert.equal(r.kind, 'blocked');
  });

  it('blocked when verdict is approved (no changes-requested)', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const r = resolveRevise(activeChange([explore, review], [v]));
    assert.equal(r.kind, 'blocked');
  });

  it('blocked when no review verdict exists yet', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const r = resolveRevise(activeChange([explore]));
    assert.equal(r.kind, 'blocked');
  });

  it('blocked when verdict superseded (revise produced new artifact, no match)', () => {
    const { runs, verdicts } = afterRevise('explore');
    const r = resolveRevise(activeChange(runs, verdicts));
    // No lineage match → revise entry cannot resolve.
    assert.equal(r.kind, 'blocked');
  });

  it('blocked when stage is archive (no revise action)', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const reviewE = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const propose = buildRun({ nnn: 3, action: 'propose' });
    const reviewP = buildRun({ nnn: 4, action: 'review-propose', role: 'reviewer' });
    const apply = buildRun({ nnn: 5, action: 'apply' });
    const reviewA = buildRun({ nnn: 6, action: 'review-apply', role: 'reviewer' });
    const archive = buildRun({ nnn: 7, action: 'archive' });
    const vE = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'approved' });
    const vP = buildVerdict({ reviewNnn: 4, reviewedRunId: propose.runId, verdict: 'approved' });
    const vA = buildVerdict({ reviewNnn: 6, reviewedRunId: apply.runId, verdict: 'approved' });
    const snap = activeChange(
      [explore, reviewE, propose, reviewP, apply, reviewA, archive],
      [vE, vP, vA],
      [buildAuthorization('apply'), buildAuthorization('archive')],
    );
    const r = resolveRevise(snap);
    assert.equal(r.kind, 'blocked');
  });
});

describe('resolveReview / resolveRevise — purity (task 10.19)', () => {
  it('same input yields same output', () => {
    const explore = buildRun({ nnn: 1, action: 'explore' });
    const snap = activeChange([explore]);
    assert.deepEqual(resolveReview(snap), resolveReview(snap));

    const review = buildRun({ nnn: 2, action: 'review-explore', role: 'reviewer' });
    const v = buildVerdict({ reviewNnn: 2, reviewedRunId: explore.runId, verdict: 'changes-requested' });
    const snap2 = activeChange([explore, review], [v]);
    assert.deepEqual(resolveRevise(snap2), resolveRevise(snap2));
  });
});
