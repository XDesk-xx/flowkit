import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';

import type { OpenSpecCliAdapter } from '../../../src/integrations/openspec/openspec-cli-adapter.js';
import { inspectPreparedRun, prepareNewExecution } from '../../../src/services/b1-run-execution-service.js';
import { runSingleActionAgent } from '../../../src/services/g1-single-action-agent-adapter.js';
import { FlowkitError } from '../../../src/shared/errors.js';
import { createTempDir } from '../../fixtures/helpers.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function adapter(root: string, changeId: string): OpenSpecCliAdapter {
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  return {
    createOperationProjection: async () => ({
      projectionVersion: 1 as const,
      version: '1.7.0',
      changeId,
      status: {
        changeId,
        schemaName: 'spec-driven' as const,
        root: { path: root },
        planningHome: { kind: 'repo' as const, root, changesDir: join(root, 'openspec', 'changes') },
        changeRoot,
        changeRootLogical: `openspec/changes/${changeId}`,
        archiveNamespaceRoot: join(root, 'openspec', 'changes', 'archive'),
        archiveNamespaceRootLogical: 'openspec/changes/archive',
        actionContext: { mode: 'repo-local' as const, sourceOfTruth: 'repo' as const, allowedEditRoots: [changeRoot] },
        artifactPaths: {
          proposal: { artifactId: 'proposal' as const, logicalPaths: [`openspec/changes/${changeId}/proposal.md`], physicalPaths: [join(changeRoot, 'proposal.md')] },
          design: { artifactId: 'design' as const, logicalPaths: [`openspec/changes/${changeId}/design.md`], physicalPaths: [join(changeRoot, 'design.md')] },
          tasks: { artifactId: 'tasks' as const, logicalPaths: [`openspec/changes/${changeId}/tasks.md`], physicalPaths: [join(changeRoot, 'tasks.md')] },
          specs: { artifactId: 'specs' as const, logicalPaths: [`openspec/changes/${changeId}/specs/flowkit-core-model/spec.md`], physicalPaths: [join(changeRoot, 'specs', 'flowkit-core-model', 'spec.md')] },
        },
        status: [],
      },
      invocationDiagnostics: [],
    }),
  } as unknown as OpenSpecCliAdapter;
}

async function initializeFutureFixture(): Promise<{ root: string; deliveryId: string; changeId: string }> {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20991231-01-future-self-host';
  const changeId = 'future-resume-adapter-proof';
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes', changeId), { recursive: true });
  await mkdir(join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await mkdir(join(root, 'architecture', deliveryId, 'json'), { recursive: true });
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: G1',
    `    id: ${changeId}`,
    '    goal: "future adapter proof"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
    '    architectureImpact: true',
    '    outputs: []',
    '',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'openspec', 'changes', changeId, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-12-31\n', 'utf8');
  await writeFile(join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'), '# active\n', 'utf8');
  await writeFile(join(root, 'architecture', deliveryId, 'json', 'current.architecture.json'), '{"kind":"current"}\n', 'utf8');
  await writeFile(join(root, 'architecture', deliveryId, 'json', 'planned.architecture.json'), '{"kind":"planned"}\n', 'utf8');
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base'], { cwd: root });
  return { root, deliveryId, changeId };
}

describe('G1 single-action Agent Adapter', () => {
  it('resumes one future-Delivery pending Action in a fresh checkout and returns control after one provider invocation', async () => {
    const fixture = await initializeFutureFixture();
    const prepared = await prepareNewExecution({ repoRoot: fixture.root, deliveryId: fixture.deliveryId, entry: 'next', openSpecAdapter: adapter(fixture.root, fixture.changeId) });
    assert.equal(prepared.kind, 'prepared');
    if (prepared.kind !== 'prepared') assert.fail('expected pending explore');
    const runId = prepared.package.run.runId;
    await execFileAsync('git', ['add', '.'], { cwd: fixture.root });
    await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'persist pending action'], { cwd: fixture.root });

    const clone = `${fixture.root}-clone`;
    roots.push(clone);
    await execFileAsync('git', ['clone', '--quiet', fixture.root, clone]);
    let calls = 0;
    const result = await runSingleActionAgent({
      repoRoot: clone,
      deliveryId: fixture.deliveryId,
      entry: 'next',
      openSpecAdapter: adapter(clone, fixture.changeId),
      execute: async (view) => {
        calls += 1;
        assert.equal(view.actionPackage.run.runId, runId);
        assert.equal(view.actionPackage.run.deliveryId, fixture.deliveryId);
        assert.equal(view.actionPackage.run.changeId, fixture.changeId);
        assert.equal(view.openSpecContext.changeId, fixture.changeId);
        assert.equal(view.resumeProjection.architecture.current.status, 'present');
        assert.equal(view.resumeProjection.architecture.planned.status, 'present');
        assert.equal(view.resumeProjection.architecture.actual.status, 'absent');
        await writeFile(join(clone, 'openspec', 'changes', fixture.changeId, 'explore.md'), '# Explore\n\nFuture proof.\n', 'utf8');
        return { executionStatus: 'completed', summary: 'explored once' };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.providerInvocations, 1);
    assert.equal(result.runId, runId);
    assert.equal(result.postPolicy.kind, 'action');
    if (result.postPolicy.kind !== 'action') assert.fail('expected review-explore next');
    assert.equal(result.postPolicy.action, 'review-explore');
    const runs = await readdir(join(clone, '.flowkit', 'runs', fixture.deliveryId, fixture.changeId));
    assert.deepEqual(runs, [runId]);
  });

  it('preserves the pending Run when the provider fails and never manufactures a terminal result', async () => {
    const fixture = await initializeFutureFixture();
    let calls = 0;
    await assert.rejects(
      runSingleActionAgent({
        repoRoot: fixture.root,
        deliveryId: fixture.deliveryId,
        entry: 'next',
        openSpecAdapter: adapter(fixture.root, fixture.changeId),
        execute: async () => {
          calls += 1;
          throw new Error('provider unavailable');
        },
      }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'AGENT_ADAPTER_PROVIDER_FAILED',
    );
    assert.equal(calls, 1);
    const pending = await inspectPreparedRun(fixture.root, fixture.deliveryId, adapter(fixture.root, fixture.changeId));
    assert.equal(pending.status, 'resumable');
  });
});
