import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  prepareFutureCurrentArchitectureSource,
  readAcceptedSystemSource,
} from '../../src/architecture/architecture-lifecycle.js';
import { runCli } from '../../src/cli/main.js';
import { fullTestResultRefFor } from '../../src/domain/full-test.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import { ArchifyCliAdapter } from '../../src/integrations/archify/archify-cli-adapter.js';
import { DeliveryManifestDocument, renderOwnerDecisionRecord } from '../../src/persistence/delivery-manifest-document.js';
import { buildOwnerDecisionRecord, createChange, recordOwnerDecision } from '../../src/services/a1-write-service.js';
import { runCommand } from '../../src/shared/external-command.js';
import { createTempDir } from '../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await runCommand('git', [...args], { cwd: root });
  assert.equal(result.kind, 'exited');
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout.trim();
}

async function snapshot(root: string, deliveryId: string) {
  return readFormalFactSnapshot({
    repoRoot: root,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
}

async function writeArchitecturePair(root: string, deliveryId: string, revision: string): Promise<void> {
  const jsonRoot = join(root, 'architecture', deliveryId, 'json');
  await mkdir(jsonRoot, { recursive: true });
  const planned = JSON.parse(
    await readFile(join(process.cwd(), 'architecture', '20260817-01-delivery-execution-loop', 'json', 'planned.architecture.json'), 'utf8'),
  ) as Record<string, unknown>;
  const plannedMeta = planned['meta'] as Record<string, unknown>;
  plannedMeta['title'] = 'E1 disposable Planned Architecture';
  plannedMeta['repository'] = { url: 'https://github.com/XDesk-xx/flowkit', revision };
  for (const component of (planned['components'] as Array<Record<string, unknown>>)) {
    const sources = component['sources'];
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (typeof source !== 'object' || source === null || Array.isArray(source)) continue;
      const sourceObj = source as Record<string, unknown>;
      if (sourceObj['path'] === 'openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml') {
        sourceObj['path'] = `openspec/delivery-groups/${deliveryId}.yaml`;
      }
    }
  }
  await writeFile(join(jsonRoot, 'planned.architecture.json'), `${JSON.stringify(planned, null, 2)}\n`, 'utf8');

  const actual = structuredClone(planned);
  const actualMeta = actual['meta'] as Record<string, unknown>;
  actualMeta['title'] = 'E1 disposable Actual Architecture';
  actualMeta['repository'] = { url: 'https://github.com/XDesk-xx/flowkit', revision };
  const components = actual['components'] as Array<Record<string, unknown>>;
  if (components.length > 0) components[0]!['sublabel'] = 'E1 final observation';
  await writeFile(join(jsonRoot, 'actual.architecture.json'), `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
}

async function fixture() {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20991231-31-e1-architecture-finalization';
  const completedChange = 'completed-before-architecture';
  const manifestPath = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const childPath = join(root, 'full-test-child.mjs');
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'flowkit@example.test']);
  await git(root, ['config', 'user.name', 'Flowkit Test']);
  await git(root, ['remote', 'add', 'origin', 'https://github.com/XDesk-xx/flowkit']);

  for (const source of [
    'src/cli/change-action.ts',
    'src/facts/formal-fact-reader.ts',
    'src/policy/unified-entry.ts',
  ]) {
    const target = join(root, source);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, `// E1 disposable repository evidence for ${source}\n`, 'utf8');
  }

  await writeFile(childPath, [
    "import { writeFileSync } from 'node:fs';",
    "const payload={schemaVersion:1,status:'passed',summary:'same deterministic pass',totalDurationMs:5,checks:[{id:'full',status:'passed',durationMs:5}]};",
    "writeFileSync(process.env.FLOWKIT_FULL_TEST_RESULT_PATH, JSON.stringify(payload));",
    'process.exit(0);',
    '',
  ].join('\n'), 'utf8');

  const checkpoint = buildOwnerDecisionRecord({
    decision: 'authorize-checkpoint', deliveryId, changeId: completedChange, sourceRef: 'owner:test:e1:checkpoint-1',
  });
  const render = (state: 'planned' | 'completed', owners: readonly string[]) => [
    `id: ${deliveryId}`,
    'delivery:', '  state: active', '  fullTestStatus: not-ready',
    'architecture:', '  impact: true', '  archifyPlan: "fixture"',
    'changes:',
    '  - key: X1', `    id: ${completedChange}`, '    goal: "completed before architecture"', '    required: true', '    dependsOn: []', `    state: ${state}`, '    architectureImpact: true', '    outputs: []',
    ...(owners.length > 0 ? ['ownerDecisions:', ...owners] : []),
    'verification:', '  fullTest:', '    requiresOwnerAuthorization: true',
    '    execution:', '      id: "e1-fixture-full-test"', '      kind: command', `      command: ${JSON.stringify(process.execPath)}`, '      args:', `        - ${JSON.stringify(childPath)}`, '      launcherMode: direct', '      scope: delivery', '      timeoutMs: 30000', '      resultProtocol: flowkit-full-test-result-v1', '      resultAuthority: verification', '      expectedTerminalStatuses:', '        - "passed"', '        - "failed"',
    '',
  ].join('\n');
  await writeFile(manifestPath, render('planned', []), 'utf8');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', `chore(flowkit): start ${deliveryId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`]);
  await writeFile(manifestPath, render('completed', renderOwnerDecisionRecord(checkpoint)), 'utf8');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', `chore(flowkit): checkpoint ${completedChange}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Change: ${completedChange}\nFlowkit-Boundary: change-checkpoint\nOwner-Authorization: ${checkpoint.ref}`]);

  const revision = await git(root, ['rev-parse', 'HEAD']);
  await writeArchitecturePair(root, deliveryId, revision);
  const authorization = await recordOwnerDecision(root, {
    decision: 'authorize-full-test', sourceRef: 'owner:test:e1:full-test-1',
  });
  const full = await runCli({ argv: ['delivery', 'full-test'], cwd: root });
  assert.equal(full.exitCode, 0, full.stderr);
  const passed = await snapshot(root, deliveryId);
  assert.equal(passed.conflicts.length, 0);
  assert.equal(passed.deliveryFullTestStatus, 'passed');
  assert.equal(passed.architectureCurrentCycle, undefined);
  return { root, deliveryId, completedChange, manifestPath, authorization };
}

async function publishCycle(f: Awaited<ReturnType<typeof fixture>>) {
  const renderActual = await runCli({ argv: ['architecture', 'render', 'actual'], cwd: f.root });
  assert.equal(renderActual.exitCode, 0, renderActual.stderr);
  const compare = await runCli({ argv: ['architecture', 'compare', 'planned', 'actual'], cwd: f.root });
  assert.equal(compare.exitCode, 0, compare.stderr);
  const current = await snapshot(f.root, f.deliveryId);
  assert.equal(current.conflicts.length, 0);
  assert.equal(current.architectureCurrentCycle?.acceptance.status, 'awaiting-owner-decision');
  assert.equal(current.architectureCurrentCycle?.fullTestAuthorizationRef, f.authorization.ownerDecisionRef);
  assert.equal(current.architectureCurrentCycle?.fullTestResultRef, current.deliveryFullTestResult?.resultRef);
  return current.architectureCurrentCycle!;
}

describe('E1 Actual / Compare / acceptance / promotion', { concurrency: false }, () => {
  it('keeps current 03 Actual delayed, then physically closes Actual→Compare→Owner acceptance→future-Delivery source on a disposable final-shaped Delivery', async () => {
    if (process.env['FLOWKIT_TEST_FORCE_E1_ARCHITECTURE_FAILURE'] === '1') {
      assert.fail('E1 architecture selected target sentinel');
    }
    await assert.rejects(
      () => readFile(join(process.cwd(), 'architecture', '20260817-01-delivery-execution-loop', 'json', 'actual.architecture.json'), 'utf8'),
      /ENOENT/,
    );

    const f = await fixture();
    await publishCycle(f);
    const beforeAccept = await runCli({ argv: ['next'], cwd: f.root });
    assert.equal(beforeAccept.exitCode, 0, beforeAccept.stderr);
    assert.match(beforeAccept.stdout, /decision: accept-architecture/);

    const accepted = await recordOwnerDecision(f.root, {
      decision: 'accept-architecture', sourceRef: 'owner:test:e1:accept-architecture',
    });
    const after = await snapshot(f.root, f.deliveryId);
    assert.equal(after.conflicts.length, 0);
    assert.equal(after.architectureCurrentCycle?.acceptance.status, 'accepted');
    assert.equal(after.acceptedSystemSource?.ownerAcceptanceRef, accepted.ownerDecisionRef);
    assert.equal(after.runs.length, 0);

    const source = await readAcceptedSystemSource({ repoRoot: f.root, sourceDeliveryId: f.deliveryId });
    assert.equal(source.ownerAcceptanceRef, accepted.ownerDecisionRef);
    const futureDeliveryId = '20991231-32-future-consumer';
    const futureRepo = await createTempDir();
    roots.push(futureRepo);
    await git(futureRepo, ['init']);
    await git(futureRepo, ['config', 'user.email', 'flowkit@example.test']);
    await git(futureRepo, ['config', 'user.name', 'Flowkit Test']);
    await git(futureRepo, ['remote', 'add', 'origin', 'https://github.com/XDesk-xx/flowkit']);
    for (const sourcePath of [
      'src/cli/change-action.ts',
      'src/facts/formal-fact-reader.ts',
      'src/policy/unified-entry.ts',
      `openspec/delivery-groups/${f.deliveryId}.yaml`,
    ]) {
      const target = join(futureRepo, sourcePath);
      await mkdir(join(target, '..'), { recursive: true });
      if (sourcePath.startsWith('openspec/')) {
        await writeFile(target, await readFile(f.manifestPath, 'utf8'), 'utf8');
      } else {
        await writeFile(target, `// future Delivery repository evidence for ${sourcePath}\n`, 'utf8');
      }
    }
    await git(futureRepo, ['add', '.']);
    await git(futureRepo, ['commit', '-m', `chore(flowkit): start ${futureDeliveryId}`, '-m', `Flowkit-Delivery: ${futureDeliveryId}\nFlowkit-Boundary: delivery-start`]);
    const futureRevision = await git(futureRepo, ['rev-parse', 'HEAD']);
    const future = await prepareFutureCurrentArchitectureSource({
      repoRoot: f.root,
      sourceDeliveryId: f.deliveryId,
      futureDeliveryId,
      futureRepositoryRevision: futureRevision,
    });
    assert.equal(future.futureDeliveryId, futureDeliveryId);
    assert.equal(future.futureRepositoryRevision, futureRevision);
    assert.equal(future.targetPath, `architecture/${futureDeliveryId}/json/current.architecture.json`);

    const futureCurrent = structuredClone(future.sourceArchitecture);
    const meta = futureCurrent['meta'] as Record<string, unknown>;
    meta['title'] = 'Future Delivery Current from accepted prior Actual';
    meta['repository'] = { url: 'https://github.com/XDesk-xx/flowkit', revision: futureRevision };
    const futurePath = join(futureRepo, future.targetPath);
    await mkdir(join(futurePath, '..'), { recursive: true });
    await writeFile(futurePath, `${JSON.stringify(futureCurrent, null, 2)}\n`, 'utf8');
    const adapter = new ArchifyCliAdapter({ repoRoot: futureRepo, env: process.env });
    assert.equal((await adapter.validate('architecture', futurePath, { repositoryRoot: futureRepo }))['ok'], true);
    const output = join(futureRepo, 'architecture', futureDeliveryId, 'html', 'current.html');
    await mkdir(join(output, '..'), { recursive: true });
    assert.equal((await adapter.deliver('architecture', futurePath, output, { repositoryRoot: futureRepo }))['ok'], true);

    const finalNext = await runCli({ argv: ['next'], cwd: f.root });
    assert.equal(finalNext.exitCode, 0, finalNext.stderr);
    assert.match(finalNext.stdout, /decision: authorize-delivery-finalize/);
  });

  it('atomically invalidates a passed architecture cycle for exact Owner remediation and requires a fresh Full Test occurrence before a new cycle', async () => {
    const f = await fixture();
    const oldCycle = await publishCycle(f);
    const baseInput = {
      key: 'R1', id: 'architecture-remediation', goal: 'Correct architecture drift.', required: true,
      dependsOn: [f.completedChange], outputs: [], architectureImpact: true,
    };
    const before = await readFile(f.manifestPath, 'utf8');
    await assert.rejects(
      () => createChange(f.root, { ...baseInput, architectureRemediation: { cycleRef: `architecture-cycle:${'0'.repeat(64)}` } }, 'owner:test:e1:stale-remediation'),
      /architecture remediation binding does not match current cycle/g,
    );
    assert.equal(await readFile(f.manifestPath, 'utf8'), before);

    const created = await createChange(
      f.root,
      { ...baseInput, architectureRemediation: { cycleRef: oldCycle.cycleRef } },
      'owner:test:e1:create-remediation',
    );
    const invalidated = await snapshot(f.root, f.deliveryId);
    assert.equal(invalidated.conflicts.length, 0);
    assert.equal(invalidated.deliveryFullTestRawStatus, 'not-ready');
    assert.equal(invalidated.deliveryFullTestResult, undefined);
    assert.equal(invalidated.architectureCurrentCycle, undefined);
    assert.equal(invalidated.currentDeliveryFullTestFinding, undefined);
    assert.equal(invalidated.changes.find((change) => change.id === baseInput.id)?.state, 'planned');
    assert.match(created.ownerDecisionRef, /^owner:[0-9a-f]{64}$/);

    const checkpoint2 = buildOwnerDecisionRecord({
      decision: 'authorize-checkpoint', deliveryId: f.deliveryId, changeId: baseInput.id, sourceRef: 'owner:test:e1:checkpoint-2',
    });
    const doc = DeliveryManifestDocument.parse(await readFile(f.manifestPath, 'utf8'));
    doc.updateChangeState(baseInput.id, 'planned', 'completed');
    doc.appendOwnerDecision(checkpoint2);
    await writeFile(f.manifestPath, doc.toString(), 'utf8');
    await git(f.root, ['add', '.']);
    await git(f.root, ['commit', '-m', `chore(flowkit): checkpoint ${baseInput.id}`, '-m', `Flowkit-Delivery: ${f.deliveryId}\nFlowkit-Change: ${baseInput.id}\nFlowkit-Boundary: change-checkpoint\nOwner-Authorization: ${checkpoint2.ref}`]);

    const ready = await snapshot(f.root, f.deliveryId);
    assert.equal(ready.conflicts.length, 0);
    assert.equal(ready.deliveryFullTestStatus, 'awaiting-user-decision');
    const authorization2 = await recordOwnerDecision(f.root, {
      decision: 'authorize-full-test', sourceRef: 'owner:test:e1:full-test-2',
    });
    assert.notEqual(authorization2.ownerDecisionRef, f.authorization.ownerDecisionRef);
    const full2 = await runCli({ argv: ['delivery', 'full-test'], cwd: f.root });
    assert.equal(full2.exitCode, 0, full2.stderr);
    const passed2 = await snapshot(f.root, f.deliveryId);
    assert.equal(passed2.deliveryFullTestResult?.resultRef, fullTestResultRefFor({ schemaVersion: 1, status: 'passed', summary: 'same deterministic pass', totalDurationMs: 5, checks: [{ id: 'full', status: 'passed', durationMs: 5 }] }));

    const revision2 = await git(f.root, ['rev-parse', 'HEAD']);
    await writeArchitecturePair(f.root, f.deliveryId, revision2);
    const cycle2 = await publishCycle({ ...f, authorization: authorization2 });
    assert.notEqual(cycle2.cycleRef, oldCycle.cycleRef);
    assert.equal(cycle2.fullTestAuthorizationRef, authorization2.ownerDecisionRef);
    await assert.rejects(
      () => createChange(f.root, { key: 'R2', id: 'stale-second-remediation', goal: 'stale', required: true, dependsOn: [baseInput.id], outputs: [], architectureImpact: true, architectureRemediation: { cycleRef: oldCycle.cycleRef } }, 'owner:test:e1:stale-old-cycle'),
      /architecture remediation binding does not match current cycle/g,
    );
  });
});
