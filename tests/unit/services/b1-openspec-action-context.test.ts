import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { OpenSpecCliAdapter } from '../../../src/integrations/openspec/openspec-cli-adapter.js';
import {
  buildOpenSpecPreparedActionContext,
  fingerprintOpenSpecPreparedActionContext,
} from '../../../src/services/b1-run-execution-service.js';
import type { RunCommandResult } from '../../../src/shared/external-command.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const commandResult = (stdout: string, exitCode = 0): RunCommandResult => ({
  stdout, stderr: '', exitCode, spawned: true, timedOut: false,
});

async function fixture() {
  const root = await createTempDir();
  roots.push(root);
  const changeId = 'post-c1-change';
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  await mkdir(join(changeRoot, 'specs', 'cap'), { recursive: true });
  for (const file of ['proposal.md', 'design.md', 'tasks.md']) await writeFile(join(changeRoot, file), `${file}\n`);
  await writeFile(join(changeRoot, 'specs', 'cap', 'spec.md'), 'spec\n');
  const marker = join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md');
  await mkdir(join(marker, '..'), { recursive: true });
  await writeFile(marker, '# C1 completed\n');

  const planningHome = { kind: 'repo', root, changesDir: join(root, 'openspec', 'changes') };
  const artifactPaths = {
    proposal: { resolvedOutputPath: join(changeRoot, 'proposal.md'), existingOutputPaths: [join(changeRoot, 'proposal.md')] },
    specs: { resolvedOutputPath: join(changeRoot, 'specs', '**', '*.md'), existingOutputPaths: [join(changeRoot, 'specs', 'cap', 'spec.md')] },
    design: { resolvedOutputPath: join(changeRoot, 'design.md'), existingOutputPaths: [join(changeRoot, 'design.md')] },
    tasks: { resolvedOutputPath: join(changeRoot, 'tasks.md'), existingOutputPaths: [join(changeRoot, 'tasks.md')] },
  };
  const status = {
    changeName: changeId, schemaName: 'spec-driven', root: { path: root }, planningHome, changeRoot, artifactPaths,
    actionContext: { mode: 'repo-local', sourceOfTruth: 'repo', allowedEditRoots: [root] }, status: [],
  };
  return { root, changeId, changeRoot, planningHome, artifactPaths, status };
}

function adapterFor(f: Awaited<ReturnType<typeof fixture>>, progress: { total: number; complete: number; remaining: number; state: string }) {
  const runner = async (_command: string, args: string[]) => {
    if (args[0] === '--version') return commandResult('1.8.0\n');
    if (args[0] === 'status') return commandResult(JSON.stringify(f.status));
    if (args[0] === 'validate') return commandResult(JSON.stringify({
      items: [{ id: f.changeId, type: 'change', valid: true, issues: [] }], status: [],
    }));
    if (args[0] === 'instructions' && args[1] === 'apply') return commandResult(JSON.stringify({
      changeName: f.changeId, schemaName: 'spec-driven', changeDir: f.changeRoot,
      contextFiles: {
        proposal: [join(f.changeRoot, 'proposal.md')],
        specs: [join(f.changeRoot, 'specs', 'cap', 'spec.md')],
        design: [join(f.changeRoot, 'design.md')],
        tasks: [join(f.changeRoot, 'tasks.md')],
      },
      progress: { total: progress.total, complete: progress.complete, remaining: progress.remaining },
      state: progress.state,
    }));
    if (args[0] === 'instructions') {
      const artifactId = args[1]! as keyof typeof f.artifactPaths;
      const path = f.artifactPaths[artifactId];
      return commandResult(JSON.stringify({
        changeName: f.changeId, artifactId, schemaName: 'spec-driven', changeDir: f.changeRoot,
        planningHome: f.planningHome,
        resolvedOutputPath: path.resolvedOutputPath,
        existingOutputPaths: path.existingOutputPaths,
        instruction: `instruction:${artifactId}`,
        template: `template:${artifactId}`,
        dependencies: [], unlocks: [],
      }));
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };
  return new OpenSpecCliAdapter({ repoRoot: f.root, runner });
}

describe('B1 OpenSpec production Action context', () => {
  it('keeps raw OpenSpec context for executors while action-sensitive fingerprints exclude Action-owned self mutation', async () => {
    const f = await fixture();
    const beforeAdapter = adapterFor(f, { total: 4, complete: 1, remaining: 3, state: 'ready' });

    const propose = await buildOpenSpecPreparedActionContext(f.root, f.changeId, 'propose', beforeAdapter);
    assert.ok(propose?.artifactInstructions !== undefined);
    assert.equal(propose.artifactInstructions.proposal.instruction, 'instruction:proposal');
    const proposeAfterSelfWrite = {
      ...propose,
      artifactPaths: { ...propose.artifactPaths, proposal: [...propose.artifactPaths.proposal, 'self-generated-proposal-path'] },
      artifactInstructions: {
        ...propose.artifactInstructions,
        proposal: {
          ...propose.artifactInstructions.proposal,
          existingOutputLogicalPaths: [...propose.artifactInstructions.proposal.existingOutputLogicalPaths, 'self-generated-proposal-path'],
        },
      },
    };
    assert.notEqual(
      fingerprintOpenSpecPreparedActionContext(propose),
      fingerprintOpenSpecPreparedActionContext(proposeAfterSelfWrite),
      'legacy/raw context digest still observes the full executor view',
    );
    assert.equal(
      fingerprintOpenSpecPreparedActionContext(propose, 'propose'),
      fingerprintOpenSpecPreparedActionContext(proposeAfterSelfWrite, 'propose'),
      'propose self-owned artifact existence/output-set changes must not drift semantic input',
    );

    const applyBefore = await buildOpenSpecPreparedActionContext(f.root, f.changeId, 'apply', beforeAdapter);
    assert.ok(applyBefore?.applyInstructions !== undefined);
    assert.deepEqual(applyBefore.applyInstructions.contextFiles.tasks, [`openspec/changes/${f.changeId}/tasks.md`]);
    const afterAdapter = adapterFor(f, { total: 4, complete: 2, remaining: 2, state: 'in-progress' });
    const applyAfter = await buildOpenSpecPreparedActionContext(f.root, f.changeId, 'apply', afterAdapter);
    assert.notEqual(
      fingerprintOpenSpecPreparedActionContext(applyBefore),
      fingerprintOpenSpecPreparedActionContext(applyAfter),
      'legacy/raw context digest still observes progress/state',
    );
    assert.equal(
      fingerprintOpenSpecPreparedActionContext(applyBefore, 'apply'),
      fingerprintOpenSpecPreparedActionContext(applyAfter, 'apply'),
      'apply self-owned progress/state must not drift semantic input',
    );

    const changedContextFiles = {
      ...applyAfter!,
      applyInstructions: {
        ...applyAfter!.applyInstructions!,
        contextFiles: {
          ...applyAfter!.applyInstructions!.contextFiles,
          tasks: ['openspec/changes/other/tasks.md'],
        },
      },
    };
    assert.notEqual(
      fingerprintOpenSpecPreparedActionContext(applyAfter, 'apply'),
      fingerprintOpenSpecPreparedActionContext(changedContextFiles, 'apply'),
      'external apply contextFiles remain semantic input and fail closed',
    );
  });

});
