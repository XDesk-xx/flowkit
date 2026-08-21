import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { OpenSpecCliAdapter } from '../../src/integrations/openspec/openspec-cli-adapter.js';
import { buildResumeProjection } from '../../src/diagnostics/resume-projection.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import { prepareNewExecution, resumeRun } from '../../src/services/b1-run-execution-service.js';
import { runSingleActionAgent } from '../../src/services/g1-single-action-agent-adapter.js';
import { FlowkitError } from '../../src/shared/errors.js';
import { validateVerificationEvidenceForSelection, validateVerificationEvidenceRecord } from '../../src/verification/change-selection/evidence.js';
import { validateVerificationSelectionRecord } from '../../src/verification/change-selection/publication.js';
import { currentVerificationCatalogFingerprint, validateVerificationSelection } from '../../src/verification/change-selection/selection.js';
import { createTempDir } from '../fixtures/helpers.js';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function fakeAdapter(root: string, changeId: string): OpenSpecCliAdapter {
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

async function futureFixture(): Promise<{ root: string; deliveryId: string; changeId: string }> {
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
    '    goal: "future consumer"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
    '    architectureImpact: true',
    '    outputs: []',
    '',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'openspec', 'changes', changeId, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-12-31\n', 'utf8');
  await cp(join(projectRoot, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'), join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'));
  await writeFile(join(root, 'architecture', deliveryId, 'json', 'current.architecture.json'), '{"kind":"current"}\n', 'utf8');
  await writeFile(join(root, 'architecture', deliveryId, 'json', 'planned.architecture.json'), '{"kind":"planned"}\n', 'utf8');
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base'], { cwd: root });
  return { root, deliveryId, changeId };
}

async function f1HistoricalFixture(): Promise<{ root: string; deliveryId: string; changeId: string; runId: string; archiveRoot: string }> {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20260817-01-delivery-execution-loop';
  const changeId = 'delivery-finalize-and-git-boundary';
  const runId = '20260818-084-revise-apply';
  const targetRun = join(root, '.flowkit', 'runs', deliveryId, changeId, runId);
  const archiveRoot = join(root, 'openspec', 'changes', 'archive', `2026-08-18-${changeId}`);
  await mkdir(dirname(targetRun), { recursive: true });
  await mkdir(dirname(archiveRoot), { recursive: true });
  await cp(join(projectRoot, '.flowkit', 'runs', deliveryId, changeId, runId), targetRun, { recursive: true });
  await cp(join(projectRoot, 'openspec', 'changes', 'archive', `2026-08-18-${changeId}`), archiveRoot, { recursive: true });
  return { root, deliveryId, changeId, runId, archiveRoot };
}

describe('G1 sync/resume/single-action integration', () => {
  it('replays the real F1 retry+archive terminal and fails closed on ambiguous/corrupt archived authority', async () => {
    const fixture = await f1HistoricalFixture();
    const replay = await resumeRun({ repoRoot: fixture.root, deliveryId: fixture.deliveryId, expectedRunId: fixture.runId });
    assert.equal(replay.kind, 'already-terminal');
    if (replay.kind !== 'already-terminal') assert.fail('expected F1 terminal replay');
    assert.equal(replay.result.runStatus, 'completed');

    const duplicate = join(fixture.root, 'openspec', 'changes', 'archive', `2026-08-19-${fixture.changeId}`);
    await cp(fixture.archiveRoot, duplicate, { recursive: true });
    await assert.rejects(
      resumeRun({ repoRoot: fixture.root, deliveryId: fixture.deliveryId, expectedRunId: fixture.runId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'TERMINAL_REPLAY_CONFLICT',
    );
    await rm(duplicate, { recursive: true, force: true });

    const current = await readFile(join(fixture.archiveRoot, 'verification.md'), 'utf8');
    const predecessor = /previousVerificationFingerprint: `([0-9a-f]{64})`/.exec(current)?.[1];
    assert.ok(predecessor, 'expected retry predecessor fingerprint');
    await writeFile(join(fixture.archiveRoot, 'verification-history', `${predecessor}.md`), 'tampered\n', 'utf8');
    await assert.rejects(
      resumeRun({ repoRoot: fixture.root, deliveryId: fixture.deliveryId, expectedRunId: fixture.runId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'TERMINAL_REPLAY_CONFLICT',
    );
  });

  it('keeps historical E1 selection/evidence point-in-time even when the current Catalog fingerprint differs', async () => {
    const runRoot = join(projectRoot, 'tests', 'fixtures', 'e2-change-verification-generalization', 'historical-e1', '127');
    const selectionRaw = await readFile(join(runRoot, 'verification-selection.json'), 'utf8');
    const evidenceRaw = await readFile(join(runRoot, 'verification-evidence.json'), 'utf8');
    const selectionRecord = validateVerificationSelectionRecord(JSON.parse(selectionRaw) as unknown);
    const historical = validateVerificationSelection(selectionRecord.selection);
    const evidence = validateVerificationEvidenceRecord(JSON.parse(evidenceRaw) as unknown);
    validateVerificationEvidenceForSelection(evidence, historical, selectionRecord.producingRunId);
    assert.notEqual(historical.moduleMapFingerprint, currentVerificationCatalogFingerprint());
    assert.equal(createHash('sha256').update(selectionRaw).digest('hex').length, 64);
  });

  it('fresh-clones a different future Delivery, resumes one exact pending Action, rebuilds context, and does not auto-next', async () => {
    assert.ok(process.env['FLOWKIT_HOME'] || process.env['FLOWKIT_OPENSPEC_BIN'], 'managed/compatible OpenSpec runtime is required for G1 physical integration');
    const fixture = await futureFixture();
    const prepared = await prepareNewExecution({ repoRoot: fixture.root, deliveryId: fixture.deliveryId, entry: 'next', openSpecAdapter: fakeAdapter(fixture.root, fixture.changeId) });
    assert.equal(prepared.kind, 'prepared');
    if (prepared.kind !== 'prepared') assert.fail('expected future pending explore');
    const runId = prepared.package.run.runId;
    await execFileAsync('git', ['add', '.'], { cwd: fixture.root });
    await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'persist pending'], { cwd: fixture.root });
    const clone = `${fixture.root}-clone`;
    roots.push(clone);
    await execFileAsync('git', ['clone', '--quiet', fixture.root, clone]);

    const clonedSnapshot = await readFormalFactSnapshot({ repoRoot: clone, deliveryId: fixture.deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups', openSpecAdapter: fakeAdapter(clone, fixture.changeId) });
    const projection = await buildResumeProjection({ repoRoot: clone, snapshot: clonedSnapshot, includeManagedTools: false });
    assert.equal(projection.architecture.current.status, 'present');
    assert.equal(projection.architecture.planned.status, 'present');
    assert.equal(projection.architecture.actual.status, 'absent');

    let calls = 0;
    const result = await runSingleActionAgent({
      repoRoot: clone,
      deliveryId: fixture.deliveryId,
      entry: 'next',
      openSpecAdapter: fakeAdapter(clone, fixture.changeId),
      execute: async (view) => {
        calls += 1;
        assert.equal(view.actionPackage.run.runId, runId);
        assert.equal(view.actionPackage.run.deliveryId, fixture.deliveryId);
        assert.equal(view.actionPackage.run.changeId, fixture.changeId);
        assert.equal(view.openSpecContext.changeId, fixture.changeId);
        await writeFile(join(clone, 'openspec', 'changes', fixture.changeId, 'explore.md'), '# Explore\n\nFuture integration proof.\n', 'utf8');
        return { executionStatus: 'completed', summary: 'exactly one action' };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.providerInvocations, 1);
    assert.equal(result.postPolicy.kind, 'action');
    if (result.postPolicy.kind !== 'action') assert.fail('expected review-explore');
    assert.equal(result.postPolicy.action, 'review-explore');
    assert.deepEqual(await readdir(join(clone, '.flowkit', 'runs', fixture.deliveryId, fixture.changeId)), [runId]);
  });
});
