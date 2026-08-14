import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { derivePostActionChangeObservation } from '../../src/verification/change-selection/actual-change-set.js';
import { captureEntryWorkspaceSnapshot } from '../../src/verification/change-selection/entry-snapshot.js';
import { buildVerificationSelection } from '../../src/verification/change-selection/selection.js';
import { buildVerificationSelectionPublication, publishVerificationSelection, validatePublishedVerificationSelection } from '../../src/verification/change-selection/publication.js';
import { createTempDir } from '../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function git(root: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', [...args], { cwd: root, windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} exited ${code}`)));
  });
}

describe('E1 disposable v5 bootstrap evidence', () => {
  it('derives base-to-post facts and deterministic selection from a real Git workspace', async () => {
    const root = await createTempDir();
    roots.push(root);
    await mkdir(join(root, 'src', 'domain'), { recursive: true });
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const base = 1;\n');
    await git(root, ['init']);
    await git(root, ['add', '.']);
    await git(root, ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base']);
    const base = await captureEntryWorkspaceSnapshot(root);
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const base = 2;\n');
    const post = await captureEntryWorkspaceSnapshot(root);
    const observed = derivePostActionChangeObservation(base, base, post, {
      schemaVersion: 1,
      action: 'apply',
      designRef: {
        ref: 'openspec/changes/e1/design.md',
        kind: 'design',
        versionFingerprint: 'a'.repeat(64),
      },
      selectors: [{ kind: 'prefix', path: 'src' }],
    });
    assert.deepEqual(observed.actualChangeSet.map(({ path, kind }) => ({ path, kind })), [{ path: 'src/domain/types.ts', kind: 'modify' }]);
    const selection = buildVerificationSelection(observed.actualChangeSet, [
      'openspec/changes/e1/specs/flowkit-core-model/spec.md',
    ]);
    assert.deepEqual(selection.seedModuleIds, ['core-model']);
    const runDir = join(root, '.flowkit', 'runs', 'd1', 'e1', '20990101-001-apply');
    await mkdir(runDir, { recursive: true });
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    const record = buildVerificationSelectionPublication({
      producingRunId: '20990101-001-apply',
      producingSemanticInputFingerprint: 'b'.repeat(64),
      canonicalBase: base.canonicalBase,
      entryWorkspaceIdentity: { schemaVersion: 1, canonicalBase: base.canonicalBase, workspaceFingerprint: base.workspaceFingerprint },
      postActionWorkspaceFingerprint: post.workspaceFingerprint,
      actualChangeSet: observed.actualChangeSet,
      selection,
      verificationMarkdownLogicalRef: 'openspec/changes/e1/verification.md',
    });
    await publishVerificationSelection({ runDir, canonicalVerificationPath: markdown, record });
    assert.equal(await validatePublishedVerificationSelection({ runDir, canonicalVerificationPath: markdown, producingRunId: record.producingRunId }), true);
  });
});
