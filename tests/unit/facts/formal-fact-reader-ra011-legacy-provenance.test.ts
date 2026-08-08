import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';

async function writeLegacyRun(
  root: string,
  deliveryId: string,
  runId: string,
  action: string,
  result: Record<string, unknown> = { schemaVersion: 1, runId, status: 'completed' },
  extraContext: Record<string, unknown> = {},
): Promise<void> {
  const runDir = join(root, '.flowkit', 'runs', deliveryId, 'execution-model-correction', runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'context.json'), JSON.stringify({
    schemaVersion: 1,
    runId,
    deliveryId,
    changeKey: 'Q1',
    changeId: 'execution-model-correction',
    action,
    role: action.startsWith('review-') ? 'reviewer' : 'author',
    ...extraContext,
  }, null, 2));
  await writeFile(join(runDir, 'action.md'), `# ${runId}\n`);
  await writeFile(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
}

async function writeC1Run(
  root: string,
  deliveryId: string,
  runId: string,
  context: Record<string, unknown>,
  result?: Record<string, unknown>,
): Promise<void> {
  const runDir = join(root, '.flowkit', 'runs', deliveryId, 'execution-model-correction', runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'context.json'), JSON.stringify(context, null, 2));
  await writeFile(join(runDir, 'action.md'), `# ${runId}\n`);
  if (result !== undefined) {
    await writeFile(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
  }
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

describe('Q1-RA-011 bounded legacy provenance', () => {
  it('real-shape schemaVersion 1 completed revise Runs 136/138/140 do not require C1 source-review tuple evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra011-legacy-revise-'));
    const deliveryId = '20260806-01-deterministic-core';
    try {
      for (const runId of [
        '20260806-136-revise-apply',
        '20260806-138-revise-apply',
        '20260806-140-revise-apply',
      ]) {
        await writeLegacyRun(root, deliveryId, runId, 'revise-apply', {
          schemaVersion: 1,
          runId,
          status: 'completed',
          summary: 'Bootstrap-style author Run; no C1 actionResult projection exists.',
        }, {
          ownerAuthorization: 'owner-authorized',
          sourceReview: {
            runId: '20260806-135-review-apply',
            verdict: 'changes-requested',
            resultRef: 'content-sha256:legacy-bootstrap-evidence',
          },
        });
      }

      const snapshot = await read(root, deliveryId);
      for (const runId of [
        '20260806-136-revise-apply',
        '20260806-138-revise-apply',
        '20260806-140-revise-apply',
      ]) {
        assert.equal(snapshot.runs.find((r) => r.runId === runId)?.status, 'completed');
        assert.equal(
          snapshot.conflicts.some(
            (c) => c.authority === runId && c.dimension.startsWith('immutable-ref'),
          ),
          false,
          `${runId} is bounded legacy and must not be retroactively required to carry C1 ResultRefs`,
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('schemaVersion 1 explore/propose are not routed into C1 producedResultRefs/effective-set validation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra011-legacy-artifact-'));
    const deliveryId = 'D-RA011-LEGACY-ARTIFACT';
    try {
      await writeLegacyRun(root, deliveryId, '20260806-101-explore', 'explore');
      await writeLegacyRun(root, deliveryId, '20260806-102-propose', 'propose');

      const snapshot = await read(root, deliveryId);
      assert.equal(
        snapshot.conflicts.some((c) =>
          c.dimension === 'artifact-effective-set-incomplete' ||
          c.dimension === 'artifact-replaced' ||
          c.dimension === 'artifact-missing' ||
          c.dimension === 'artifact-specs-drift'),
        false,
        'bounded legacy artifact Runs do not promise C1 producedResultRefs',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('schemaVersion 1 review-apply does not become a C1 verification generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra011-legacy-review-'));
    const deliveryId = 'D-RA011-LEGACY-REVIEW';
    try {
      await writeLegacyRun(root, deliveryId, '20260806-110-apply', 'apply');
      await writeLegacyRun(root, deliveryId, '20260806-111-review-apply', 'review-apply', {
        schemaVersion: 1,
        runId: '20260806-111-review-apply',
        status: 'completed',
        verdict: 'approved',
      }, {
        reviewedRun: `.flowkit/runs/${deliveryId}/execution-model-correction/20260806-110-apply/`,
      });

      const snapshot = await read(root, deliveryId);
      assert.equal(
        snapshot.conflicts.some((c) =>
          c.authority === '20260806-111-review-apply' &&
          c.dimension.startsWith('verification-summary')),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('schemaVersion 2 completed revise still requires the full terminal source-review tuple', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra011-c1-strict-'));
    const deliveryId = 'D-RA011-C1-STRICT';
    try {
      const runId = '20260806-203-revise-apply';
      await writeC1Run(root, deliveryId, runId, {
        schemaVersion: 2,
        runId,
        deliveryId,
        changeKey: 'Q1',
        changeId: 'execution-model-correction',
        action: 'revise-apply',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-202-review-apply',
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/execution-model-correction/${runId}/`,
      }, {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-apply',
          executionStatus: 'completed',
          summary: 'intentionally missing reviewVerdictRef',
        },
      });

      const snapshot = await read(root, deliveryId);
      assert.ok(
        snapshot.conflicts.some(
          (c) => c.authority === runId && c.dimension === 'immutable-ref-required',
        ),
        'Q1-RA-011 must not weaken C1 completed-revise tuple strictness',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('unknown schemaVersion remains fail-closed instead of degrading to legacy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-ra011-unknown-schema-'));
    const deliveryId = 'D-RA011-UNKNOWN';
    try {
      const runId = '20260806-220-apply';
      const runDir = join(root, '.flowkit', 'runs', deliveryId, 'execution-model-correction', runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, 'context.json'), JSON.stringify({
        schemaVersion: 3,
        runId,
        deliveryId,
        changeKey: 'Q1',
        changeId: 'execution-model-correction',
        action: 'apply',
        role: 'author',
      }, null, 2));
      await writeFile(join(runDir, 'action.md'), `# ${runId}\n`);

      const snapshot = await read(root, deliveryId);
      assert.ok(
        snapshot.conflicts.some((c) => c.dimension === 'schema-version'),
        'unknown schema versions must still fail closed',
      );
      assert.equal(snapshot.runs.some((r) => r.runId === runId), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
