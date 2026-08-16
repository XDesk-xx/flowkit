import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assertPathWithin,
  assertRequestedChangeRoot,
  computeOpenSpecArchiveMutationSurfaceV1,
  physicalToRepoLogical,
} from '../../../src/integrations/openspec/openspec-paths.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const root = await createTempDir();
  roots.push(root);
  const changeRoot = join(root, 'openspec', 'changes', 'c1');
  const archiveRoot = join(root, 'openspec', 'changes', 'archive');
  await mkdir(join(changeRoot, 'specs', 'cap'), { recursive: true });
  await mkdir(join(root, 'openspec', 'specs', 'base'), { recursive: true });
  await mkdir(archiveRoot, { recursive: true });
  await writeFile(join(changeRoot, 'proposal.md'), 'proposal\n');
  await writeFile(join(changeRoot, 'specs', 'cap', 'spec.md'), 'delta\n');
  await writeFile(join(root, 'openspec', 'specs', 'base', 'spec.md'), 'canonical\n');
  return { root, changeRoot, archiveRoot };
}

describe('OpenSpec path authority and archive mutation surface', () => {
  it('converts only contained absolute physical paths to logical refs', async () => {
    const { root, changeRoot } = await fixture();
    assert.equal(physicalToRepoLogical(root, join(changeRoot, 'proposal.md'), 'proposal'), 'openspec/changes/c1/proposal.md');
    assert.equal(assertPathWithin(root, changeRoot, 'changeRoot'), changeRoot);
    assert.equal(assertRequestedChangeRoot(root, join(root, 'openspec', 'changes'), changeRoot, 'c1').logical, 'openspec/changes/c1');
    assert.throws(() => physicalToRepoLogical(root, join(root, '..', 'escape.md'), 'escape'), /escapes its authority root/);
    assert.throws(() => assertRequestedChangeRoot(root, join(root, 'openspec', 'changes'), changeRoot, 'other'), /requested Change identity/);
  });

  it('hashes only A+B+C and ignores .git/node_modules/dist/unrelated repo drift', async () => {
    const { root, changeRoot, archiveRoot } = await fixture();
    const first = await computeOpenSpecArchiveMutationSurfaceV1({ repoRoot: root, changeRoot, archiveNamespaceRoot: archiveRoot });
    for (const path of ['.git/HEAD', 'node_modules/pkg/x', 'dist/x.js', 'docs/unrelated.md']) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), `changed ${path}\n`);
    }
    const ignored = await computeOpenSpecArchiveMutationSurfaceV1({ repoRoot: root, changeRoot, archiveNamespaceRoot: archiveRoot });
    assert.equal(ignored, first);

    await writeFile(join(changeRoot, 'proposal.md'), 'proposal changed\n');
    const aDrift = await computeOpenSpecArchiveMutationSurfaceV1({ repoRoot: root, changeRoot, archiveNamespaceRoot: archiveRoot });
    assert.notEqual(aDrift, first);
  });

  it('represents archived changeRoot absence and immediate archive collision as post-state drift', async () => {
    const { root, changeRoot, archiveRoot } = await fixture();
    const first = await computeOpenSpecArchiveMutationSurfaceV1({ repoRoot: root, changeRoot, archiveNamespaceRoot: archiveRoot });
    await rm(changeRoot, { recursive: true, force: true });
    await mkdir(join(archiveRoot, '20990101-c1'), { recursive: true });
    const post = await computeOpenSpecArchiveMutationSurfaceV1({ repoRoot: root, changeRoot, archiveNamespaceRoot: archiveRoot });
    assert.notEqual(post, first);
  });
});
