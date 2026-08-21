import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCli } from '../../src/cli/main.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import { DeliveryManifestDocument, renderOwnerDecisionRecord } from '../../src/persistence/delivery-manifest-document.js';
import { buildOwnerDecisionRecord } from '../../src/services/a1-write-service.js';
import { runCommand } from '../../src/shared/external-command.js';
import { createTempDir } from '../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function git(root: string, args: string[]): Promise<void> {
  const result = await runCommand('git', args, { cwd: root });
  assert.equal(result.kind, 'exited', result.stderr);
  assert.equal(result.exitCode, 0, result.stderr);
}

async function snapshot(root: string, deliveryId: string) {
  return readFormalFactSnapshot({ repoRoot: root, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups' });
}

async function failedFixture() {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20991231-21-b1-corrective';
  const completedChange = 'completed-input';
  const checkpoint = buildOwnerDecisionRecord({ decision: 'authorize-checkpoint', deliveryId, changeId: completedChange, sourceRef: 'owner:test:b1:checkpoint' });
  const fullTest = buildOwnerDecisionRecord({ decision: 'authorize-full-test', deliveryId, sourceRef: 'owner:test:b1:full-test-1' });
  const manifestPath = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const childPath = join(root, 'full-test-child.mjs');
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'flowkit@example.test']);
  await git(root, ['config', 'user.name', 'Flowkit Test']);
  await writeFile(childPath, [
    "import { writeFileSync } from 'node:fs';",
    "const payload={schemaVersion:1,status:'failed',summary:'same deterministic failure',totalDurationMs:5,checks:[{id:'full',status:'failed',durationMs:5}]};",
    "writeFileSync(process.env.FLOWKIT_FULL_TEST_RESULT_PATH, JSON.stringify(payload));",
    'process.exit(7);',
    '',
  ].join('\n'), 'utf8');
  await writeFile(manifestPath, [
    `id: ${deliveryId}`,
    'delivery:', '  state: active', '  fullTestStatus: not-ready',
    'changes:',
    '  - key: X1', `    id: ${completedChange}`, '    goal: "completed"', '    required: true', '    dependsOn: []', '    state: planned', '    architectureImpact: false', '    outputs: []',
    'verification:', '  fullTest:', '    requiresOwnerAuthorization: true', '',
  ].join('\n'), 'utf8');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', `chore(flowkit): start ${deliveryId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`]);
  await writeFile(manifestPath, [
    `id: ${deliveryId}`,
    'delivery:', '  state: active', '  fullTestStatus: authorized',
    'changes:',
    '  - key: X1', `    id: ${completedChange}`, '    goal: "completed"', '    required: true', '    dependsOn: []', '    state: completed', '    architectureImpact: false', '    outputs: []',
    'ownerDecisions:', ...renderOwnerDecisionRecord(checkpoint), ...renderOwnerDecisionRecord(fullTest),
    'verification:', '  fullTest:', '    requiresOwnerAuthorization: true',
    '    execution:', '      id: "fixture"', '      kind: command', `      command: ${JSON.stringify(process.execPath)}`, '      args:', `        - ${JSON.stringify(childPath)}`, '      launcherMode: direct', '      scope: delivery', '      timeoutMs: 30000', '      resultProtocol: flowkit-full-test-result-v1', '      resultAuthority: verification', '      expectedTerminalStatuses:', '        - "passed"', '        - "failed"', '',
  ].join('\n'), 'utf8');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', `chore(flowkit): checkpoint ${completedChange}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Change: ${completedChange}\nFlowkit-Boundary: change-checkpoint\nOwner-Authorization: ${checkpoint.ref}`]);
  const run = await runCli({ argv: ['delivery', 'full-test'], cwd: root });
  assert.equal(run.exitCode, 1, run.stderr);
  return { root, deliveryId, manifestPath, fullTest };
}

describe('B1 Delivery Finding and corrective Change public route', () => {
  it('binds exact current occurrence and atomically consumes failure into retained authority + ordinary planned Change', async () => {
    const f = await failedFixture();
    const before = await snapshot(f.root, f.deliveryId);
    assert.equal(before.conflicts.length, 0);
    assert.equal(before.deliveryFullTestRawStatus, 'failed');
    const finding = before.currentDeliveryFullTestFinding;
    assert.ok(finding);
    assert.equal(finding.authorizationRef, f.fullTest.ref);

    const next = await runCli({ argv: ['next'], cwd: f.root });
    assert.equal(next.exitCode, 0, next.stderr);
    assert.match(next.stdout, new RegExp(`finding-id: ${finding.findingId}`));
    assert.match(next.stdout, new RegExp(`authorization-ref: ${finding.authorizationRef}`));
    assert.match(next.stdout, new RegExp(`source-result-ref: ${finding.sourceResultRef}`));

    for (const argv of [['status'], ['resume-context']] as const) {
      const view = await runCli({ argv: [...argv], cwd: f.root });
      assert.equal(view.exitCode, 0, view.stderr);
      assert.match(view.stdout, new RegExp(`finding-id: ${finding.findingId}`));
      assert.match(view.stdout, new RegExp(`authorization-ref: ${finding.authorizationRef}`));
      assert.match(view.stdout, new RegExp(`source-result-ref: ${finding.sourceResultRef}`));
    }

    const inputPath = join(f.root, 'corrective.json');
    const baseInput = {
      key: 'Q1', id: 'correct-full-test-failure', goal: 'Correct failed delivery verification.', required: true,
      dependsOn: ['completed-input'], outputs: [], architectureImpact: false,
    };
    await writeFile(inputPath, JSON.stringify({ ...baseInput, corrective: { ...finding, sourceResultRef: `verification:full-test:${'0'.repeat(64)}` } }), 'utf8');
    const manifestBeforeStale = await readFile(f.manifestPath, 'utf8');
    const stale = await runCli({ argv: ['create', 'change', '--input', inputPath, '--source-ref', 'owner:test:b1:stale'], cwd: f.root });
    assert.equal(stale.exitCode, 2);
    assert.equal(await readFile(f.manifestPath, 'utf8'), manifestBeforeStale);

    await writeFile(inputPath, JSON.stringify({
      ...baseInput,
      corrective: {
        findingId: finding.findingId,
        authorizationRef: finding.authorizationRef,
        sourceResultRef: finding.sourceResultRef,
        summary: 'caller must not own summary',
      },
    }), 'utf8');
    const closedSchema = await runCli({ argv: ['create', 'change', '--input', inputPath, '--source-ref', 'owner:test:b1:extra-field'], cwd: f.root });
    assert.equal(closedSchema.exitCode, 2);
    assert.equal(await readFile(f.manifestPath, 'utf8'), manifestBeforeStale);

    await writeFile(inputPath, JSON.stringify({
      ...baseInput,
      corrective: { findingId: finding.findingId, authorizationRef: finding.authorizationRef, sourceResultRef: finding.sourceResultRef },
    }), 'utf8');
    const created = await runCli({ argv: ['create', 'change', '--input', inputPath, '--source-ref', 'owner:test:b1:create-corrective'], cwd: f.root });
    assert.equal(created.exitCode, 0, created.stderr);

    const after = await snapshot(f.root, f.deliveryId);
    assert.equal(after.conflicts.length, 0);
    assert.equal(after.deliveryFullTestRawStatus, 'not-ready');
    assert.equal(after.deliveryFullTestResult, undefined);
    assert.equal(after.currentDeliveryFullTestFinding, undefined);
    assert.equal(after.deliveryFullTestFailureHistory?.length, 1);
    assert.equal(after.deliveryFullTestFailureHistory?.[0]?.resultRef, finding.sourceResultRef);
    assert.equal(after.deliveryFullTestFindings?.length, 1);
    assert.equal(after.deliveryFullTestFindings?.[0]?.findingId, finding.findingId);
    assert.equal(after.deliveryFullTestFindings?.[0]?.summary, 'same deterministic failure');
    assert.equal(after.changes.find((change) => change.id === 'correct-full-test-failure')?.state, 'planned');
    assert.equal(after.runs.length, 0);

    const afterNext = await runCli({ argv: ['next'], cwd: f.root });
    assert.doesNotMatch(afterNext.stdout, /reason: full-test-failed/);
    assert.match(afterNext.stdout, /decision: activate-change/);

    // Fixture the ordinary corrective lifecycle terminal/checkpoint boundary,
    // then prove the old authorization does not auto-authorize the new candidate.
    const checkpoint2 = buildOwnerDecisionRecord({
      decision: 'authorize-checkpoint', deliveryId: f.deliveryId, changeId: 'correct-full-test-failure', sourceRef: 'owner:test:b1:checkpoint-2',
    });
    const doc = DeliveryManifestDocument.parse(await readFile(f.manifestPath, 'utf8'));
    doc.updateChangeState('correct-full-test-failure', 'planned', 'completed');
    doc.appendOwnerDecision(checkpoint2);
    await writeFile(f.manifestPath, doc.toString(), 'utf8');
    await git(f.root, ['add', '.']);
    await git(f.root, ['commit', '-m', 'chore(flowkit): checkpoint correct-full-test-failure', '-m', `Flowkit-Delivery: ${f.deliveryId}\nFlowkit-Change: correct-full-test-failure\nFlowkit-Boundary: change-checkpoint\nOwner-Authorization: ${checkpoint2.ref}`]);

    const ready = await snapshot(f.root, f.deliveryId);
    assert.equal(ready.conflicts.length, 0);
    assert.equal(ready.deliveryFullTestStatus, 'awaiting-user-decision');
    const readyNext = await runCli({ argv: ['next'], cwd: f.root });
    assert.match(readyNext.stdout, /decision: authorize-full-test/);

    const authorize2 = await runCli({ argv: ['owner', 'record', '--decision', 'authorize-full-test', '--source-ref', 'owner:test:b1:full-test-2'], cwd: f.root });
    assert.equal(authorize2.exitCode, 0, authorize2.stderr);
    const secondRun = await runCli({ argv: ['delivery', 'full-test'], cwd: f.root });
    assert.equal(secondRun.exitCode, 1, secondRun.stderr);
    const secondFailed = await snapshot(f.root, f.deliveryId);
    assert.equal(secondFailed.conflicts.length, 0);
    const secondFinding = secondFailed.currentDeliveryFullTestFinding!;
    assert.equal(secondFinding.sourceResultRef, finding.sourceResultRef);
    assert.notEqual(secondFinding.authorizationRef, finding.authorizationRef);
    assert.notEqual(secondFinding.findingId, finding.findingId);

    const input2 = join(f.root, 'corrective-2.json');
    await writeFile(input2, JSON.stringify({
      key: 'Q2', id: 'correct-same-failure-again', goal: 'Correct repeated failure.', required: true,
      dependsOn: ['correct-full-test-failure'], outputs: [], architectureImpact: false,
      corrective: { findingId: secondFinding.findingId, authorizationRef: secondFinding.authorizationRef, sourceResultRef: secondFinding.sourceResultRef },
    }), 'utf8');
    const created2 = await runCli({ argv: ['create', 'change', '--input', input2, '--source-ref', 'owner:test:b1:create-corrective-2'], cwd: f.root });
    assert.equal(created2.exitCode, 0, created2.stderr);
    const final = await snapshot(f.root, f.deliveryId);
    assert.equal(final.conflicts.length, 0);
    assert.equal(final.deliveryFullTestFailureHistory?.length, 1, 'content-addressed failed result is retained once');
    assert.equal(final.deliveryFullTestFindings?.length, 2, 'two failure occurrences retain distinct resolved provenance');
    assert.deepEqual(final.deliveryFullTestFindings?.map((item) => item.sourceResultRef), [finding.sourceResultRef, finding.sourceResultRef]);
    assert.notEqual(final.deliveryFullTestFindings?.[0]?.findingId, final.deliveryFullTestFindings?.[1]?.findingId);
  });

  it('keeps a pre-B1 createChange-only failed Manifest unconsumed and current', async () => {
    const f = await failedFixture();
    const doc = DeliveryManifestDocument.parse(await readFile(f.manifestPath, 'utf8'));
    const historicalCreate = buildOwnerDecisionRecord({
      decision: 'create-change', deliveryId: f.deliveryId, changeId: 'historical-corrective', sourceRef: 'owner:test:b1:historical-create-only',
    });
    doc.appendChange({
      key: 'Q0', id: 'historical-corrective', goal: 'Historical pre-B1 create-only shape.', required: true,
      dependsOn: ['completed-input'], outputs: [], architectureImpact: false, state: 'planned',
    });
    doc.appendOwnerDecision(historicalCreate);
    await writeFile(f.manifestPath, doc.toString(), 'utf8');

    const read = await snapshot(f.root, f.deliveryId);
    assert.equal(read.conflicts.length, 0);
    assert.equal(read.deliveryFullTestRawStatus, 'failed');
    assert.ok(read.deliveryFullTestResult);
    assert.ok(read.currentDeliveryFullTestFinding);
    assert.equal(read.deliveryFullTestFailureHistory?.length, 0);
    assert.equal(read.deliveryFullTestFindings?.length, 0);
  });

  it('fails closed when persisted historical Finding summary drifts from retained Verification result', async () => {
    const f = await failedFixture();
    const before = await snapshot(f.root, f.deliveryId);
    const finding = before.currentDeliveryFullTestFinding!;
    const inputPath = join(f.root, 'corrective.json');
    await writeFile(inputPath, JSON.stringify({
      key: 'Q1', id: 'correct-summary', goal: 'Correct failure.', required: true, dependsOn: ['completed-input'], outputs: [], architectureImpact: false,
      corrective: { findingId: finding.findingId, authorizationRef: finding.authorizationRef, sourceResultRef: finding.sourceResultRef },
    }), 'utf8');
    const created = await runCli({ argv: ['create', 'change', '--input', inputPath, '--source-ref', 'owner:test:b1:summary'], cwd: f.root });
    assert.equal(created.exitCode, 0, created.stderr);
    const text = await readFile(f.manifestPath, 'utf8');
    await writeFile(f.manifestPath, text.replace('      summary: "same deterministic failure"\n      affectedScope:', '      summary: "drifted finding"\n      affectedScope:'), 'utf8');
    const after = await snapshot(f.root, f.deliveryId);
    assert.ok(after.conflicts.some((conflict) => conflict.dimension === 'delivery-full-test-findings'));
  });

  it('fails closed when persisted Finding sourceResultRef becomes dangling', async () => {
    const f = await failedFixture();
    const before = await snapshot(f.root, f.deliveryId);
    const finding = before.currentDeliveryFullTestFinding!;
    const inputPath = join(f.root, 'corrective.json');
    await writeFile(inputPath, JSON.stringify({
      key: 'Q1', id: 'correct-dangling', goal: 'Correct failure.', required: true, dependsOn: ['completed-input'], outputs: [], architectureImpact: false,
      corrective: { findingId: finding.findingId, authorizationRef: finding.authorizationRef, sourceResultRef: finding.sourceResultRef },
    }), 'utf8');
    const created = await runCli({ argv: ['create', 'change', '--input', inputPath, '--source-ref', 'owner:test:b1:dangling'], cwd: f.root });
    assert.equal(created.exitCode, 0, created.stderr);
    const text = await readFile(f.manifestPath, 'utf8');
    await writeFile(f.manifestPath, text.replace(
      `      sourceResultRef: "${finding.sourceResultRef}"`,
      `      sourceResultRef: "verification:full-test:${'0'.repeat(64)}"`,
    ), 'utf8');
    const after = await snapshot(f.root, f.deliveryId);
    assert.ok(after.conflicts.some((conflict) => conflict.dimension === 'delivery-full-test-findings'));
  });
});
