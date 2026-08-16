import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  captureEntryWorkspaceSnapshot,
  captureCompactEntryWorkspaceIdentity,
  captureCompactReverificationCandidateIdentity,
  validateCompactEntryWorkspaceIdentity,
  validateEntryWorkspaceSnapshotRecord,
} from '../../../../src/verification/change-selection/entry-snapshot.js';
import { createTempDir } from '../../../fixtures/helpers.js';

const exec = promisify(execFile);

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

  it('captures post-E2 compact identity from only the Git dirty delta', async () => {
    const compact = await captureCompactEntryWorkspaceIdentity(process.cwd());
    assert.match(compact.canonicalBase, /^[0-9a-f]{40,64}$/);
    assert.match(compact.workspaceFingerprint, /^[0-9a-f]{64}$/);
    assert.deepEqual(validateCompactEntryWorkspaceIdentity(compact), compact);
    assert.equal(compact.entries.some((entry) => entry.path.startsWith('.flowkit/')), false);
    assert.equal(compact.entries.length < (await captureEntryWorkspaceSnapshot(process.cwd())).files.length, true);
  });
  it('reconstructs the origin post-action identity while excluding current Verification/history bytes', async () => {
    const root = await createTempDir();
    await mkdir(join(root, 'openspec', 'changes', 'e1'), { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    await exec('git', ['init'], { cwd: root });
    await exec('git', ['add', '.'], { cwd: root });
    await exec('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base'], { cwd: root });
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 2;\n');
    await writeFile(join(root, 'openspec', 'changes', 'e1', 'verification.md'), 'origin verification\n');
    const originEntry = await captureCompactEntryWorkspaceIdentity(root);
    const originPost = await captureCompactEntryWorkspaceIdentity(root);

    await writeFile(join(root, 'openspec', 'changes', 'e1', 'verification.md'), 'current failed verification\n');
    await mkdir(join(root, 'openspec', 'changes', 'e1', 'verification-history'), { recursive: true });
    await writeFile(join(root, 'openspec', 'changes', 'e1', 'verification-history', 'a'.repeat(64) + '.md'), 'history\n');
    const reconstructed = await captureCompactReverificationCandidateIdentity(root, originEntry, 'openspec/changes/e1/verification.md');
    assert.equal(reconstructed.workspaceFingerprint, originPost.workspaceFingerprint);
    assert.equal(reconstructed.entries.some((entry) => entry.path.includes('/verification-history/')), false);
    assert.equal(reconstructed.entries.find((entry) => entry.path.endsWith('/verification.md'))?.contentFingerprint, originEntry.entries.find((entry) => entry.path.endsWith('/verification.md'))?.contentFingerprint);
    await rm(root, { recursive: true, force: true });
  });

});
