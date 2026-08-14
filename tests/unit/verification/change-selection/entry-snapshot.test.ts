import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureEntryWorkspaceSnapshot,
  validateEntryWorkspaceSnapshotRecord,
} from '../../../../src/verification/change-selection/entry-snapshot.js';

describe('E1 entry workspace snapshot', () => {
  it('captures a deterministic file-backed identity for the current repository', async () => {
    const first = await captureEntryWorkspaceSnapshot(process.cwd());
    const second = await captureEntryWorkspaceSnapshot(process.cwd());
    assert.match(first.canonicalBase, /^[0-9a-f]{40,64}$/);
    assert.match(first.workspaceFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(first.schemaVersion, 1);
    assert.equal(first.workspaceFingerprint, second.workspaceFingerprint);
    assert.equal(first.files.some((file) => file.path === 'src/domain/types.ts'), true);
    assert.equal(first.files.some((file) => file.path.startsWith('.flowkit/')), false);
  });

  it('rejects a persisted snapshot whose file list does not match its identity fingerprint', async () => {
    const snapshot = await captureEntryWorkspaceSnapshot(process.cwd());
    assert.deepEqual(validateEntryWorkspaceSnapshotRecord(snapshot), snapshot);
    assert.throws(() => validateEntryWorkspaceSnapshotRecord({
      ...snapshot,
      files: [...snapshot.files, { path: 'src/extra.ts', contentFingerprint: 'a'.repeat(64) }],
    }));
  });
});
