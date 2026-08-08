import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
import { computeResultFileHash } from '../../../src/persistence/result-ref-adapter.js';

async function writeRun(
  root: string,
  deliveryId: string,
  runId: string,
  context: Record<string, unknown>,
  result?: Record<string, unknown>,
): Promise<void> {
  const runDir = join(root, '.flowkit', 'runs', deliveryId, 'C1', runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'context.json'), JSON.stringify(context, null, 2));
  await writeFile(join(runDir, 'action.md'), `# ${runId}\n`);
  if (result !== undefined) {
    await writeFile(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
  }
}

async function makeReviewApplyFixture(
  root: string,
  deliveryId: string,
): Promise<{ reviewId: string; reviewResult: Record<string, unknown> }> {
  const applyId = '20260806-201-apply';
  const reviewId = '20260806-202-review-apply';
  const verificationInitial = '# Verification\ninitial\n';
  const applyResult = {
    runStatus: 'completed',
    actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' },
  };

  await writeRun(root, deliveryId, applyId, {
    schemaVersion: 2,
    runId: applyId,
    deliveryId,
    changeKey: 'C1',
    changeId: 'C1',
    action: 'apply',
    role: 'author',
    ownerAuthorization: 'not-required',
    runPath: `.flowkit/runs/${deliveryId}/C1/${applyId}/`,
  }, applyResult);

  const changeDir = join(root, 'openspec', 'changes', 'C1');
  await mkdir(changeDir, { recursive: true });
  await writeFile(join(changeDir, 'verification.md'), verificationInitial);

  const reviewResult = {
    runStatus: 'completed',
    actionResult: {
      action: 'review-apply',
      executionStatus: 'completed',
      summary: 'changes requested',
      verificationSummaryRef: {
        ref: 'openspec/changes/C1/verification.md',
        versionFingerprint: computeResultFileHash(verificationInitial),
        kind: 'verification-summary',
      },
    },
    reviewVerdict: 'changes-requested',
    reviewFindings: [
      { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'x', requiredChange: 'revise' },
    ],
  };

  await writeRun(root, deliveryId, reviewId, {
    schemaVersion: 2,
    runId: reviewId,
    deliveryId,
    changeKey: 'C1',
    changeId: 'C1',
    action: 'review-apply',
    role: 'reviewer',
    ownerAuthorization: 'not-required',
    reviewedRunId: applyId,
    inputRef: {
      ref: `.flowkit/runs/${deliveryId}/C1/${applyId}/result.json`,
      versionFingerprint: computeResultFileHash(JSON.stringify(applyResult, null, 2)),
      kind: 'run-result',
    },
    runPath: `.flowkit/runs/${deliveryId}/C1/${reviewId}/`,
  }, reviewResult);

  // Replacement is legal only while an integrity-admitted revise-apply opens
  // the bounded verification revision window.
  await writeFile(join(changeDir, 'verification.md'), '# Verification\nrevised\n');
  return { reviewId, reviewResult };
}

async function makeReviewProposeFixture(
  root: string,
  deliveryId: string,
): Promise<void> {
  const proposeId = '20260806-211-propose';
  const reviewId = '20260806-212-review-propose';
  const changeDir = join(root, 'openspec', 'changes', 'C1');
  const specsDir = join(changeDir, 'specs', 'alpha');
  await mkdir(specsDir, { recursive: true });

  const artifacts = [
    { ref: 'openspec/changes/C1/proposal.md', path: join(changeDir, 'proposal.md'), content: '# Proposal\ninitial\n' },
    { ref: 'openspec/changes/C1/design.md', path: join(changeDir, 'design.md'), content: '# Design\ninitial\n' },
    { ref: 'openspec/changes/C1/tasks.md', path: join(changeDir, 'tasks.md'), content: '# Tasks\n- [ ] x\n' },
    { ref: 'openspec/changes/C1/specs/alpha/spec.md', path: join(specsDir, 'spec.md'), content: '# Spec\ninitial\n' },
  ];
  for (const artifact of artifacts) {
    await writeFile(artifact.path, artifact.content);
  }

  const proposeResult = {
    runStatus: 'completed',
    actionResult: {
      action: 'propose',
      executionStatus: 'completed',
      summary: 'P0',
      producedResultRefs: artifacts.map((artifact) => ({
        ref: artifact.ref,
        versionFingerprint: computeResultFileHash(artifact.content),
        kind: 'produced-artifact',
      })),
    },
  };

  await writeRun(root, deliveryId, proposeId, {
    schemaVersion: 2,
    runId: proposeId,
    deliveryId,
    changeKey: 'C1',
    changeId: 'C1',
    action: 'propose',
    role: 'author',
    ownerAuthorization: 'not-required',
    runPath: `.flowkit/runs/${deliveryId}/C1/${proposeId}/`,
  }, proposeResult);

  await writeRun(root, deliveryId, reviewId, {
    schemaVersion: 2,
    runId: reviewId,
    deliveryId,
    changeKey: 'C1',
    changeId: 'C1',
    action: 'review-propose',
    role: 'reviewer',
    ownerAuthorization: 'not-required',
    reviewedRunId: proposeId,
    inputRef: {
      ref: `.flowkit/runs/${deliveryId}/C1/${proposeId}/result.json`,
      versionFingerprint: computeResultFileHash(JSON.stringify(proposeResult, null, 2)),
      kind: 'run-result',
    },
    runPath: `.flowkit/runs/${deliveryId}/C1/${reviewId}/`,
  }, {
    runStatus: 'completed',
    actionResult: {
      action: 'review-propose',
      executionStatus: 'completed',
      summary: 'changes requested',
    },
    reviewVerdict: 'changes-requested',
    reviewFindings: [
      { id: 'B-002', severity: 'blocking', title: 'fix proposal', problem: 'x', requiredChange: 'revise' },
    ],
  });

  // An invalid/failed revise-propose MUST NOT hide this replacement.
  await writeFile(join(changeDir, 'proposal.md'), '# Proposal\nrevised\n');
}

async function read(root: string, deliveryId: string) {
  return readFormalFactSnapshot({
    repoRoot: root,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: '.flowkit/manifests',
  });
}

describe('Q1-RA-007 revise integrity admission', () => {
  it('valid pending revise-apply opens revision-window without terminal reviewVerdictRef', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra007-pending-'));
    const deliveryId = 'D-RA007-PENDING-VALID';
    try {
      await makeReviewApplyFixture(root, deliveryId);
      const reviseId = '20260806-203-revise-apply';
      await writeRun(root, deliveryId, reviseId, {
        schemaVersion: 2,
        runId: reviseId,
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-apply',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-202-review-apply',
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/C1/${reviseId}/`,
      });

      const snapshot = await read(root, deliveryId);
      assert.equal(
        snapshot.conflicts.some((c) => c.dimension === 'immutable-ref-required' && c.authority === reviseId),
        false,
        'pending revise must not require terminal-only reviewVerdictRef',
      );
      assert.equal(
        snapshot.conflicts.some((c) => c.dimension === 'verification-summary-replaced'),
        false,
        'valid pending revise must open verification revision-window',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pending revise with unadmitted predecessor does not open revision-window', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra007-pending-invalid-'));
    const deliveryId = 'D-RA007-PENDING-INVALID';
    try {
      await makeReviewApplyFixture(root, deliveryId);
      const reviseId = '20260806-203-revise-apply';
      await writeRun(root, deliveryId, reviseId, {
        schemaVersion: 2,
        runId: reviseId,
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-apply',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-299-review-apply',
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/C1/${reviseId}/`,
      });

      const snapshot = await read(root, deliveryId);
      assert.ok(snapshot.conflicts.some((c) => c.dimension === 'immutable-ref-source-unadmitted'));
      assert.ok(
        snapshot.conflicts.some((c) => c.dimension === 'verification-summary-replaced'),
        'invalid pending successor must leave predecessor current',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('completed revise with missing reviewVerdictRef cannot supersede predecessor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra007-completed-invalid-'));
    const deliveryId = 'D-RA007-COMPLETED-INVALID';
    try {
      await makeReviewApplyFixture(root, deliveryId);
      const reviseId = '20260806-203-revise-apply';
      await writeRun(root, deliveryId, reviseId, {
        schemaVersion: 2,
        runId: reviseId,
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-apply',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-202-review-apply',
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/C1/${reviseId}/`,
      }, {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-apply',
          executionStatus: 'completed',
          summary: 'missing terminal immutable source-review evidence',
        },
      });

      const snapshot = await read(root, deliveryId);
      assert.ok(
        snapshot.conflicts.some(
          (c) => c.dimension === 'immutable-ref-required' && c.authority === reviseId,
        ),
        'completed revise still requires reviewVerdictRef',
      );
      assert.ok(
        snapshot.conflicts.some((c) => c.dimension === 'verification-summary-replaced'),
        'invalid completed successor must not hide predecessor replacement conflict',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('failed revise-apply does not require terminal reviewVerdictRef and cannot open revision-window', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra007-failed-apply-'));
    const deliveryId = 'D-RA007-FAILED-APPLY';
    try {
      await makeReviewApplyFixture(root, deliveryId);
      const reviseId = '20260806-203-revise-apply';
      await writeRun(root, deliveryId, reviseId, {
        schemaVersion: 2,
        runId: reviseId,
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-apply',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-202-review-apply',
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/C1/${reviseId}/`,
      }, { runStatus: 'failed' });

      const snapshot = await read(root, deliveryId);
      assert.equal(
        snapshot.conflicts.some(
          (c) => c.dimension === 'immutable-ref-required' && c.authority === reviseId,
        ),
        false,
        'failed revise has no actionResult and must not be required to carry reviewVerdictRef',
      );
      assert.ok(
        snapshot.conflicts.some((c) => c.dimension === 'verification-summary-replaced'),
        'failed revise must never become a verification generation successor',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('cancelled revise-apply does not require terminal reviewVerdictRef and cannot open revision-window', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra007-cancelled-apply-'));
    const deliveryId = 'D-RA007-CANCELLED-APPLY';
    try {
      await makeReviewApplyFixture(root, deliveryId);
      const reviseId = '20260806-203-revise-apply';
      await writeRun(root, deliveryId, reviseId, {
        schemaVersion: 2,
        runId: reviseId,
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-apply',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-202-review-apply',
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/C1/${reviseId}/`,
      }, { runStatus: 'cancelled' });

      const snapshot = await read(root, deliveryId);
      assert.equal(
        snapshot.conflicts.some(
          (c) => c.dimension === 'immutable-ref-required' && c.authority === reviseId,
        ),
        false,
      );
      assert.ok(snapshot.conflicts.some((c) => c.dimension === 'verification-summary-replaced'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('failed revise-propose preserves predecessor current artifact validation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra007-failed-propose-'));
    const deliveryId = 'D-RA007-FAILED-PROPOSE';
    try {
      await makeReviewProposeFixture(root, deliveryId);
      const reviseId = '20260806-213-revise-propose';
      await writeRun(root, deliveryId, reviseId, {
        schemaVersion: 2,
        runId: reviseId,
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-propose',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-212-review-propose',
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/C1/${reviseId}/`,
      }, { runStatus: 'failed' });

      const snapshot = await read(root, deliveryId);
      assert.equal(
        snapshot.conflicts.some(
          (c) => c.dimension === 'immutable-ref-required' && c.authority === reviseId,
        ),
        false,
      );
      assert.ok(
        snapshot.conflicts.some((c) => c.dimension === 'artifact-replaced'),
        'failed revise-propose must not suppress predecessor canonical replacement validation',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pending revise with valid lineage but invalid context.inputRef cannot open revision-window', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra007-pending-inputref-'));
    const deliveryId = 'D-RA007-PENDING-BAD-INPUT';
    try {
      await makeReviewApplyFixture(root, deliveryId);
      const reviseId = '20260806-203-revise-apply';
      await writeRun(root, deliveryId, reviseId, {
        schemaVersion: 2,
        runId: reviseId,
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-apply',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-202-review-apply',
        sourceReviewVerdict: 'changes-requested',
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-299-apply/result.json`,
          versionFingerprint: 'deadbeef',
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/${reviseId}/`,
      });

      const snapshot = await read(root, deliveryId);
      assert.ok(
        snapshot.conflicts.some(
          (c) => c.dimension === 'immutable-ref-missing' && c.authority === reviseId,
        ),
      );
      assert.ok(
        snapshot.conflicts.some((c) => c.dimension === 'verification-summary-replaced'),
        'any applicable immutable failure on the pending successor must keep predecessor current',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('completed revise with valid tuple but invalid consumedInputRefs cannot supersede predecessor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra007-completed-consumed-'));
    const deliveryId = 'D-RA007-COMPLETED-BAD-CONSUMED';
    try {
      const { reviewId, reviewResult } = await makeReviewApplyFixture(root, deliveryId);
      const reviseId = '20260806-203-revise-apply';
      await writeRun(root, deliveryId, reviseId, {
        schemaVersion: 2,
        runId: reviseId,
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-apply',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: reviewId,
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/C1/${reviseId}/`,
      }, {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-apply',
          executionStatus: 'completed',
          summary: 'tuple valid, consumed ref invalid',
          reviewVerdictRef: {
            ref: `.flowkit/runs/${deliveryId}/C1/${reviewId}/result.json`,
            versionFingerprint: computeResultFileHash(JSON.stringify(reviewResult, null, 2)),
            kind: 'run-result',
          },
          consumedInputRefs: [
            {
              ref: `.flowkit/runs/${deliveryId}/C1/20260806-299-apply/result.json`,
              versionFingerprint: 'deadbeef',
              kind: 'run-result',
            },
          ],
        },
      });

      const snapshot = await read(root, deliveryId);
      assert.ok(
        snapshot.conflicts.some(
          (c) => c.dimension === 'immutable-ref-missing' && c.authority === reviseId,
        ),
      );
      assert.ok(
        snapshot.conflicts.some((c) => c.dimension === 'verification-summary-replaced'),
        'completed successor with any immutable failure must not supersede predecessor',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
