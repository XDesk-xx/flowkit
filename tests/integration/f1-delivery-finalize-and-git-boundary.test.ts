import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCli } from '../../src/cli/main.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import { renderOwnerDecisionRecord } from '../../src/persistence/delivery-manifest-document.js';
import { buildOwnerDecisionRecord, createChange, recordOwnerDecision } from '../../src/services/a1-write-service.js';
import { buildDeliveryFinalHandoff } from '../../src/services/delivery-final-boundary-service.js';
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

const F1_ACTIVATION_DELIVERY_ID = '20260817-01-delivery-execution-loop';

async function commitLegacyHistoricalFinal(root: string): Promise<{ readonly deliveryId: string; readonly commitSha: string }> {
  const deliveryId = '20990101-01-pre-f1-legacy-final';
  const manifestPath = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const renderHistorical = (state: 'active' | 'completed') => [
    `id: ${deliveryId}`,
    'delivery:',
    `  state: ${state}`,
    '  fullTestStatus: not-ready',
    'changes: []',
    '',
  ].join('\n');
  await writeFile(manifestPath, renderHistorical('active'), 'utf8');
  await git(root, ['add', manifestPath]);
  await git(root, ['commit', '-m', `chore(flowkit): start ${deliveryId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`]);
  await writeFile(manifestPath, renderHistorical('completed'), 'utf8');
  await git(root, ['add', manifestPath]);
  await git(root, ['commit', '-m', `notes finalize ${deliveryId} historical loose boundary`]);
  return { deliveryId, commitSha: await git(root, ['rev-parse', 'HEAD']) };
}

async function commitStrictF1Activation(root: string, sourceRef: string): Promise<{ readonly base: string; readonly checkpoint: string }> {
  const changeId = 'delivery-finalize-and-git-boundary';
  const base = await git(root, ['rev-parse', 'HEAD']);
  const owner = buildOwnerDecisionRecord({
    decision: 'authorize-checkpoint',
    deliveryId: F1_ACTIVATION_DELIVERY_ID,
    changeId,
    sourceRef,
  });
  const manifestPath = join(root, 'openspec', 'delivery-groups', `${F1_ACTIVATION_DELIVERY_ID}.yaml`);
  await writeFile(manifestPath, [
    `id: ${F1_ACTIVATION_DELIVERY_ID}`,
    'delivery:',
    '  state: completed',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: F1',
    `    id: ${changeId}`,
    '    goal: "Activate strict Delivery Final semantics"',
    '    required: true',
    '    dependsOn: []',
    '    state: completed',
    '    architectureImpact: false',
    '    outputs: []',
    'ownerDecisions:',
    ...renderOwnerDecisionRecord(owner),
    '',
  ].join('\n'), 'utf8');
  await git(root, ['add', manifestPath]);
  await git(root, ['commit', '-m', `chore(flowkit): checkpoint ${changeId}`, '-m', `Flowkit-Delivery: ${F1_ACTIVATION_DELIVERY_ID}\nFlowkit-Change: ${changeId}\nFlowkit-Boundary: change-checkpoint\nOwner-Authorization: ${owner.ref}`]);
  return { base, checkpoint: await git(root, ['rev-parse', 'HEAD']) };
}

async function writeArchitecturePair(root: string, deliveryId: string, revision: string): Promise<void> {
  const jsonRoot = join(root, 'architecture', deliveryId, 'json');
  await mkdir(jsonRoot, { recursive: true });
  const planned = JSON.parse(
    await readFile(join(process.cwd(), 'architecture', '20260817-01-delivery-execution-loop', 'json', 'planned.architecture.json'), 'utf8'),
  ) as Record<string, unknown>;
  const plannedMeta = planned['meta'] as Record<string, unknown>;
  plannedMeta['title'] = 'F1 disposable Planned Architecture';
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
  actualMeta['title'] = 'F1 disposable Actual Architecture';
  actualMeta['repository'] = { url: 'https://github.com/XDesk-xx/flowkit', revision };
  await writeFile(join(jsonRoot, 'actual.architecture.json'), `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
}

async function fixture(architectureImpact = false) {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20991231-51-f1-finalize-fixture';
  const changeId = 'delivery-finalize-and-git-boundary';
  const manifestPath = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const childPath = join(root, 'full-test-child.mjs');
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'flowkit@example.test']);
  await git(root, ['config', 'user.name', 'Flowkit Test']);
  await git(root, ['remote', 'add', 'origin', 'https://github.com/XDesk-xx/flowkit']);

  for (const source of ['src/cli/change-action.ts', 'src/facts/formal-fact-reader.ts', 'src/policy/unified-entry.ts']) {
    const target = join(root, source);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, `// F1 disposable repository evidence for ${source}\n`, 'utf8');
  }

  await writeFile(childPath, [
    "import { writeFileSync } from 'node:fs';",
    "const payload={schemaVersion:1,status:'passed',summary:'f1 deterministic pass',totalDurationMs:7,checks:[{id:'full',status:'passed',durationMs:7}]};",
    "writeFileSync(process.env.FLOWKIT_FULL_TEST_RESULT_PATH, JSON.stringify(payload));",
    'process.exit(0);',
    '',
  ].join('\n'), 'utf8');

  const checkpoint = buildOwnerDecisionRecord({
    decision: 'authorize-checkpoint', deliveryId, changeId, sourceRef: 'owner:test:f1:checkpoint',
  });
  const render = (state: 'planned' | 'completed', owners: readonly string[]) => [
    `id: ${deliveryId}`,
    'delivery:', '  state: active', '  fullTestStatus: not-ready',
    'architecture:', `  impact: ${architectureImpact ? 'true' : 'false'}`, `  archifyPlan: ${architectureImpact ? '"fixture"' : '"not-required"'}`,
    'changes:',
    '  - key: F1', `    id: ${changeId}`, '    goal: "Finalize capability checkpoint fixture"', '    required: true', '    dependsOn: []', `    state: ${state}`, `    architectureImpact: ${architectureImpact ? 'true' : 'false'}`, '    outputs: []',
    ...(owners.length > 0 ? ['ownerDecisions:', ...owners] : []),
    'verification:', '  fullTest:', '    requiresOwnerAuthorization: true',
    '    execution:', '      id: "f1-fixture-full-test"', '      kind: command', `      command: ${JSON.stringify(process.execPath)}`, '      args:', `        - ${JSON.stringify(childPath)}`, '      launcherMode: direct', '      scope: delivery', '      timeoutMs: 30000', '      resultProtocol: flowkit-full-test-result-v1', '      resultAuthority: verification', '      expectedTerminalStatuses:', '        - "passed"', '        - "failed"',
    '',
  ].join('\n');

  await writeFile(manifestPath, render('planned', []), 'utf8');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', `chore(flowkit): start ${deliveryId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`]);
  const activation = await commitStrictF1Activation(root, 'owner:test:f1:strict-activation');
  await writeFile(manifestPath, render('completed', renderOwnerDecisionRecord(checkpoint)), 'utf8');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', `chore(flowkit): checkpoint ${changeId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Change: ${changeId}\nFlowkit-Boundary: change-checkpoint\nOwner-Authorization: ${checkpoint.ref}`]);
  const checkpointRevision = await git(root, ['rev-parse', 'HEAD']);
  if (architectureImpact) await writeArchitecturePair(root, deliveryId, checkpointRevision);

  const ready = await snapshot(root, deliveryId);
  assert.equal(ready.conflicts.length, 0);
  assert.equal(ready.deliveryFullTestStatus, 'awaiting-user-decision');
  const fullAuth = await recordOwnerDecision(root, { decision: 'authorize-full-test', sourceRef: 'owner:test:f1:full-test' });
  const full = await runCli({ argv: ['delivery', 'full-test'], cwd: root });
  assert.equal(full.exitCode, 0, full.stderr);
  const passed = await snapshot(root, deliveryId);
  assert.equal(passed.conflicts.length, 0);
  assert.equal(passed.deliveryFullTestStatus, 'passed');
  if (architectureImpact) {
    assert.equal(passed.deliveryFinalizationQualification, undefined);
    const rendered = await runCli({ argv: ['architecture', 'render', 'actual'], cwd: root });
    assert.equal(rendered.exitCode, 0, rendered.stderr);
    const compared = await runCli({ argv: ['architecture', 'compare', 'planned', 'actual'], cwd: root });
    assert.equal(compared.exitCode, 0, compared.stderr);
    const accepted = await recordOwnerDecision(root, { decision: 'accept-architecture', sourceRef: 'owner:test:f1:accept-architecture' });
    assert.match(accepted.ownerDecisionRef, /^owner:[0-9a-f]{64}$/);
  }
  const qualified = await snapshot(root, deliveryId);
  assert.equal(qualified.deliveryFinalizationQualification?.qualifiedBaseRevision, checkpointRevision);
  assert.equal(qualified.deliveryFinalizationQualification?.fullTestAuthorizationRef, fullAuth.ownerDecisionRef);
  const finalizeAuth = await recordOwnerDecision(root, { decision: 'authorize-delivery-finalize', sourceRef: 'owner:test:f1:finalize' });
  const finalizeRetry = await recordOwnerDecision(root, { decision: 'authorize-delivery-finalize', sourceRef: 'owner:test:f1:finalize' });
  assert.equal(finalizeRetry.ownerDecisionRef, finalizeAuth.ownerDecisionRef);
  assert.equal(finalizeRetry.idempotent, true);
  const authorized = await snapshot(root, deliveryId);
  assert.equal(authorized.conflicts.length, 0);
  assert.equal(finalizeAuth.ownerDecisionRef, authorized.ownerAuthorizations.find((f) => f.decision === 'authorize-delivery-finalize')?.ref);
  assert.equal(authorized.ownerAuthorizations.find((f) => f.decision === 'authorize-delivery-finalize')?.finalizationQualificationRef, authorized.deliveryFinalizationQualification?.qualificationRef);
  return { root, deliveryId, changeId, manifestPath, checkpointRevision, finalizeAuth, activation };
}

describe('F1 Delivery Finalize / Delivery Final Git boundary', { concurrency: false }, () => {
  it('fails before Manifest mutation when a clean post-qualification ordinary commit moves HEAD beyond the admitted qualified base', async () => {
    if (process.env['FLOWKIT_TEST_FORCE_F1_FINALIZE_FAILURE'] === '1') {
      assert.fail('F1 delivery-finalize selected target sentinel');
    }
    const f = await fixture();
    await writeFile(join(f.root, 'ordinary-after-qualification.txt'), 'clean but unqualified commit\n', 'utf8');
    await git(f.root, ['add', '.']);
    await git(f.root, ['commit', '-m', 'ordinary clean commit after qualification']);
    const head = await git(f.root, ['rev-parse', 'HEAD']);
    assert.notEqual(head, f.checkpointRevision);
    const before = await readFile(f.manifestPath, 'utf8');
    const result = await runCli({ argv: ['delivery', 'finalize', '--delivery', f.deliveryId], cwd: f.root });
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /qualifiedBaseRevision|qualified base|HEAD/i);
    assert.equal(await readFile(f.manifestPath, 'utf8'), before);
    assert.match(before, /state: active/);
    assert.doesNotMatch(before, /finalization:/);
  });

  it('publishes Finalize with no Run, resumes the same handoff after crash, blocks unrelated drift, then strictly admits the exact Delivery Final commit', async () => {
    const f = await fixture();
    const beforeRunDirs = await readFile(f.manifestPath, 'utf8');
    const finalized = await runCli({ argv: ['delivery', 'finalize', '--delivery', f.deliveryId], cwd: f.root });
    assert.equal(finalized.exitCode, 0, finalized.stderr);
    const manifest = await readFile(f.manifestPath, 'utf8');
    assert.match(manifest, /state: completed/);
    assert.match(manifest, /finalization:/);
    assert.notEqual(manifest, beforeRunDirs);

    const afterFinalize = await snapshot(f.root, f.deliveryId);
    assert.equal(afterFinalize.conflicts.length, 0);
    assert.equal(afterFinalize.deliveryState, 'completed');
    assert.ok(afterFinalize.deliveryFinalization);
    assert.equal(afterFinalize.runs.length, 0);

    const handoffCli = await runCli({ argv: ['delivery', 'final-handoff', '--delivery', f.deliveryId], cwd: f.root });
    assert.equal(handoffCli.exitCode, 0, handoffCli.stderr);
    assert.equal(handoffCli.stdout.includes(`finalize ${f.deliveryId}`), true);
    const handoffA = await buildDeliveryFinalHandoff(f.root, f.deliveryId);
    const handoffB = await buildDeliveryFinalHandoff(f.root, f.deliveryId);
    assert.deepEqual(handoffB, handoffA);
    assert.equal(handoffA.qualifiedBaseRevision, f.checkpointRevision);
    assert.equal(handoffA.subject, `chore(flowkit): finalize ${f.deliveryId}`);
    assert.deepEqual(handoffA.paths, [`openspec/delivery-groups/${f.deliveryId}.yaml`]);

    const drift = join(f.root, 'unrelated-after-finalize.txt');
    await writeFile(drift, 'must block Delivery Final commit handoff\n', 'utf8');
    await assert.rejects(() => buildDeliveryFinalHandoff(f.root, f.deliveryId), /drift|candidate|path/i);
    await unlink(drift);
    const resumed = await buildDeliveryFinalHandoff(f.root, f.deliveryId);
    assert.deepEqual(resumed, handoffA);

    await git(f.root, ['add', ...resumed.paths]);
    const stagedCheck = await runCommand('git', ['diff', '--cached', '--check'], { cwd: f.root });
    assert.equal(stagedCheck.kind, 'exited');
    assert.equal(stagedCheck.exitCode, 0, stagedCheck.stderr);
    await git(f.root, ['commit', '-m', resumed.subject, '-m', resumed.trailers.join('\n')]);
    const finalSha = await git(f.root, ['rev-parse', 'HEAD']);
    assert.notEqual(finalSha, f.checkpointRevision);
    assert.equal(await git(f.root, ['rev-parse', 'HEAD^']), f.checkpointRevision);

    const closed = await snapshot(f.root, f.deliveryId);
    assert.equal(closed.conflicts.length, 0);
    assert.equal(closed.deliveryState, 'completed');
    const deliveryFinal = closed.gitBoundaries.find((boundary) => boundary.kind === 'delivery-final');
    assert.equal(deliveryFinal?.commitSha, finalSha);

    await git(f.root, ['branch', 'delivery-f1-final', finalSha]);
    await git(f.root, ['checkout', '-b', 'integration-main', f.checkpointRevision]);
    await git(f.root, ['merge', '--no-ff', 'delivery-f1-final', '-m', 'Merge F1 Delivery Final fixture']);
    await git(f.root, ['branch', '-D', 'delivery-f1-final']);
    const mergeHead = await git(f.root, ['rev-parse', 'HEAD']);
    const ancestor = await runCommand('git', ['merge-base', '--is-ancestor', finalSha, mergeHead], { cwd: f.root });
    assert.equal(ancestor.kind, 'exited');
    assert.equal(ancestor.exitCode, 0, ancestor.stderr);
  });

  it('post-pass required Change creation atomically invalidates Full Test qualification before Finalize can reuse it', async () => {
    const f = await fixture();
    const prior = await snapshot(f.root, f.deliveryId);
    assert.equal(prior.deliveryFullTestStatus, 'passed');
    assert.ok(prior.deliveryFinalizationQualification);
    await createChange(f.root, {
      key: 'R1', id: 'post-pass-required-work', goal: 'Required work after qualification.', required: true,
      dependsOn: [f.changeId], outputs: [], architectureImpact: false,
    }, 'owner:test:f1:post-pass-required-work');
    const invalidated = await snapshot(f.root, f.deliveryId);
    assert.equal(invalidated.conflicts.length, 0);
    assert.equal(invalidated.deliveryFullTestRawStatus, 'not-ready');
    assert.equal(invalidated.deliveryFullTestResult, undefined);
    assert.equal(invalidated.deliveryFinalizationQualification, undefined);
    const next = await runCli({ argv: ['next'], cwd: f.root });
    assert.equal(next.exitCode, 0, next.stderr);
    assert.match(next.stdout, /activate-change|post-pass-required-work/);
  });
  it('keeps strict Final semantics active when a divergent valid bootstrap F1 checkpoint ref exists', async () => {
    const f = await fixture();
    const targetBranch = 'future-final-target';
    await git(f.root, ['checkout', '-b', targetBranch]);
    await git(f.root, ['add', f.manifestPath]);
    await git(f.root, ['commit', '-m', 'persist qualified future Delivery facts for cutover regression']);
    await git(f.root, ['commit', '--allow-empty', '-m', `notes finalize ${f.deliveryId} without formal trailers`]);
    const malformedFinal = await git(f.root, ['rev-parse', 'HEAD']);

    await git(f.root, ['checkout', '-b', 'divergent-f1-activation', f.activation.base]);
    const divergent = await commitStrictF1Activation(f.root, 'owner:test:f1:strict-activation-divergent');
    assert.notEqual(divergent.checkpoint, f.activation.checkpoint);
    const relation = await runCommand('git', ['merge-base', '--is-ancestor', f.activation.checkpoint, divergent.checkpoint], { cwd: f.root });
    assert.equal(relation.kind, 'exited');
    assert.notEqual(relation.exitCode, 0);

    await git(f.root, ['checkout', targetBranch]);
    const projected = await snapshot(f.root, f.deliveryId);
    assert.equal(projected.gitBoundaries.some((boundary) => boundary.kind === 'delivery-final' && boundary.commitSha === malformedFinal), false);
    assert.equal(projected.conflicts.length, 0);
  });

  it('preserves bounded pre-activation legacy Final compatibility across divergent bootstrap activation refs', async () => {
    const root = await createTempDir();
    roots.push(root);
    await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
    await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
    await git(root, ['init']);
    await git(root, ['config', 'user.email', 'flowkit@example.test']);
    await git(root, ['config', 'user.name', 'Flowkit Test']);

    const historical = await commitLegacyHistoricalFinal(root);
    const original = await commitStrictF1Activation(root, 'owner:test:f1:strict-activation-historical');
    const canonicalBranch = await git(root, ['branch', '--show-current']);
    await git(root, ['checkout', '-b', 'divergent-f1-activation-historical', original.base]);
    const divergent = await commitStrictF1Activation(root, 'owner:test:f1:strict-activation-historical-divergent');
    assert.notEqual(divergent.checkpoint, original.checkpoint);
    await git(root, ['checkout', canonicalBranch]);

    const projected = await snapshot(root, historical.deliveryId);
    assert.equal(projected.conflicts.length, 0);
    assert.equal(projected.gitBoundaries.some((boundary) => boundary.kind === 'delivery-final' && boundary.commitSha === historical.commitSha), true);
  });

  it('post-pass required Change invalidates an already accepted architecture qualification as well as Full Test', async () => {
    const f = await fixture(true);
    const prior = await snapshot(f.root, f.deliveryId);
    assert.equal(prior.deliveryFullTestStatus, 'passed');
    assert.equal(prior.architectureCurrentCycle?.acceptance.status, 'accepted');
    assert.ok(prior.acceptedSystemSource);
    assert.ok(prior.deliveryFinalizationQualification);
    await createChange(f.root, {
      key: 'R2', id: 'post-pass-after-accepted-architecture', goal: 'Required work after accepted architecture.', required: true,
      dependsOn: [f.changeId], outputs: [], architectureImpact: true,
    }, 'owner:test:f1:post-pass-after-accepted-architecture');
    const invalidated = await snapshot(f.root, f.deliveryId);
    assert.equal(invalidated.conflicts.length, 0);
    assert.equal(invalidated.deliveryFullTestRawStatus, 'not-ready');
    assert.equal(invalidated.deliveryFullTestResult, undefined);
    assert.equal(invalidated.architectureCurrentCycle, undefined);
    assert.equal(invalidated.acceptedSystemSource, undefined);
    assert.equal(invalidated.deliveryFinalizationQualification, undefined);
  });

});
