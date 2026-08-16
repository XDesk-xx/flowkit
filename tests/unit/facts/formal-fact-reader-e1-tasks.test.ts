import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createTempDir } from '../../fixtures/helpers.js';
import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';

let roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function fixture(tasks?: string): Promise<{ root: string; deliveryId: string }> {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20260806-01-test';
  const changeDir = join(root, 'openspec', 'changes', 'diagnostic-cli');
  await mkdir(join(root, '.flowkit', 'runs', deliveryId), { recursive: true });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(changeDir, 'specs', 'cap'), { recursive: true });
  await writeFile(
    join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`),
    [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: E1',
      '    id: diagnostic-cli',
      '    state: active',
        '    architectureImpact: false',
      '    required: true',
      '    dependsOn: []',
    ].join('\n'),
  );
  await writeFile(join(changeDir, 'explore.md'), '# Explore\n');
  await writeFile(join(changeDir, 'proposal.md'), '# Proposal\n');
  await writeFile(join(changeDir, 'design.md'), '# Design\n');
  await writeFile(join(changeDir, 'specs', 'cap', 'spec.md'), '# Spec\n');
  await writeFile(join(changeDir, 'verification.md'), '<!-- flowkit-change-verification-status: passed -->\n');
  if (tasks !== undefined) await writeFile(join(changeDir, 'tasks.md'), tasks);
  return { root, deliveryId };
}

async function read(root: string, deliveryId: string) {
  return readFormalFactSnapshot({
    repoRoot: root,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
}

describe('E1 active Change Tasks completion projection', () => {
  it('projects true when every required Markdown checkbox is completed', async () => {
    const { root, deliveryId } = await fixture('# Tasks\n- [x] 1.1 done\n- [X] 1.2 done\n');
    const snapshot = await read(root, deliveryId);
    assert.equal(snapshot.changeTasksComplete, true);
    assert.equal(snapshot.conflicts.some((c) => c.dimension === 'change-tasks-completion'), false);
  });

  it('projects false when any required task remains unchecked', async () => {
    const { root, deliveryId } = await fixture('# Tasks\n- [x] 1.1 done\n- [ ] 1.2 required\n');
    const snapshot = await read(root, deliveryId);
    assert.equal(snapshot.changeTasksComplete, false);
  });

  it('treats absent tasks.md as unavailable without inventing completion', async () => {
    const { root, deliveryId } = await fixture();
    const snapshot = await read(root, deliveryId);
    assert.equal(snapshot.changeTasksComplete, undefined);
    assert.equal(snapshot.openSpecArtifacts.find((a) => a.kind === 'change-tasks')?.exists, false);
  });

  it('does not require numbered task text and treats no required checkboxes as vacuously complete', async () => {
    const { root, deliveryId } = await fixture('# Tasks\n当前 Change 没有 required task checkbox。\n');
    const snapshot = await read(root, deliveryId);
    assert.equal(snapshot.changeTasksComplete, true);
  });
});
