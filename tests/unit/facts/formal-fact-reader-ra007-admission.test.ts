import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';

async function writeManifest(root: string, deliveryId: string, activeId: string, completed: string[] = []): Promise<void> {
  const dir = join(root, '.flowkit', 'manifests');
  await mkdir(dir, { recursive: true });
  const changes = [
    ...completed.map((id, index) => `  - key: H${index + 1}\n    id: ${id}\n    state: completed\n    required: true\n    dependsOn: []`),
    `  - key: Q2\n    id: ${activeId}\n    state: active\n    required: true\n    dependsOn: []`,
  ].join('\n');
  await writeFile(join(dir, `${deliveryId}.yaml`), `id: ${deliveryId}\ndelivery:\n  state: active\n  fullTestStatus: not-ready\nchanges:\n${changes}\n`);
}

async function writeRawRun(root: string, deliveryId: string, changeId: string, runId: string, context: unknown, result?: unknown): Promise<void> {
  const dir = join(root, '.flowkit', 'runs', deliveryId, changeId, runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'context.json'), JSON.stringify(context, null, 2));
  await writeFile(join(dir, 'action.md'), `# ${runId}\n`);
  if (result !== undefined) await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2));
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

describe('Q2/v6 Reader current-lineage admission', () => {
  it('pending source-review consumer without source-review binding fails closed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-q2-reader-lineage-'));
    try {
      const deliveryId = 'D1';
      const changeId = 'active-q2';
      await writeManifest(root, deliveryId, changeId);
      await writeRawRun(root, deliveryId, changeId, '20260806-001-propose', {
        schemaVersion: 2,
        runId: '20260806-001-propose',
        deliveryId,
        changeKey: 'Q2',
        changeId,
        action: 'propose',
        role: 'author',
        ownerAuthorization: 'not-required',
        runPath: `.flowkit/runs/${deliveryId}/${changeId}/20260806-001-propose/`,
      });
      const snapshot = await read(root, deliveryId);
      assert.equal(snapshot.runs[0]?.status, 'pending');
      assert.ok(snapshot.conflicts.some((c) => c.dimension === 'immutable-ref-required'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('completed source-review consumer without source-review tuple fails closed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-q2-reader-completed-'));
    try {
      const deliveryId = 'D1';
      const changeId = 'active-q2';
      await writeManifest(root, deliveryId, changeId);
      await writeRawRun(root, deliveryId, changeId, '20260806-001-apply', {
        schemaVersion: 2,
        runId: '20260806-001-apply',
        deliveryId,
        changeKey: 'Q2',
        changeId,
        action: 'apply',
        role: 'author',
        ownerAuthorization: 'not-required',
        runPath: `.flowkit/runs/${deliveryId}/${changeId}/20260806-001-apply/`,
      }, {
        runStatus: 'completed',
        actionResult: { action: 'apply', executionStatus: 'completed', summary: 'bad persisted apply' },
      });
      const snapshot = await read(root, deliveryId);
      assert.ok(snapshot.conflicts.some((c) => c.dimension === 'immutable-ref-required'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('completed historical Change corpus is excluded before malformed Runs are parsed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-q2-reader-history-'));
    try {
      const deliveryId = 'D1';
      await writeManifest(root, deliveryId, 'active-q2', ['old-change']);
      await writeRawRun(root, deliveryId, 'old-change', '20260806-001-explore', { schemaVersion: 999, runId: 'broken-history' });
      const snapshot = await read(root, deliveryId);
      assert.equal(snapshot.conflicts.length, 0, JSON.stringify(snapshot.conflicts));
      assert.equal(snapshot.runs.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('unknown schemaVersion in active Change remains fail-closed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-q2-reader-active-schema-'));
    try {
      const deliveryId = 'D1';
      const changeId = 'active-q2';
      await writeManifest(root, deliveryId, changeId);
      await writeRawRun(root, deliveryId, changeId, '20260806-001-explore', { schemaVersion: 999, runId: 'broken-active' });
      const snapshot = await read(root, deliveryId);
      assert.ok(snapshot.conflicts.length > 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
