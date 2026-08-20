import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCli } from '../../src/cli/main.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import { renderOwnerDecisionRecord } from '../../src/persistence/delivery-manifest-document.js';
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

async function fixture(status: 'passed' | 'failed' = 'passed', ownerAuthorized = true) {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = `20991231-0${status === 'passed' ? '3' : '4'}-a1-public-cli`;
  const changeId = 'future-change';
  const checkpointOwner = buildOwnerDecisionRecord({ decision: 'authorize-checkpoint', deliveryId, changeId, sourceRef: `owner:test:${status}:checkpoint` });
  const fullTestOwner = buildOwnerDecisionRecord({ decision: 'authorize-full-test', deliveryId, sourceRef: `owner:test:${status}:full-test` });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  const manifestPath = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const childPath = join(root, 'full-test-child.mjs');

  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'flowkit@example.test']);
  await git(root, ['config', 'user.name', 'Flowkit Test']);
  await writeFile(manifestPath, [
    `id: ${deliveryId}`,
    'delivery:', '  state: active', '  fullTestStatus: not-ready',
    'changes:', '  - key: X1', `    id: ${changeId}`, '    goal: "future fixture"', '    required: true', '    dependsOn: []', '    state: planned', '    architectureImpact: false', '    outputs: []',
    'verification:', '  fullTest:', '    requiresOwnerAuthorization: true', '',
  ].join('\n'), 'utf8');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', `chore(flowkit): start ${deliveryId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`]);

  await writeFile(childPath, [
    "import { writeFileSync } from 'node:fs';",
    `const status = ${JSON.stringify(status)};`,
    "const checks = [{ id: 'future-full', status, durationMs: 3 }];",
    "const payload = { schemaVersion: 1, status, summary: status === 'passed' ? 'future Delivery Full Test passed' : 'future Delivery Full Test failed', totalDurationMs: 3, checks };",
    "writeFileSync(process.env.FLOWKIT_FULL_TEST_RESULT_PATH, JSON.stringify(payload));",
    "process.exit(status === 'passed' ? 0 : 7);",
    '',
  ].join('\n'), 'utf8');
  await writeFile(manifestPath, [
    `id: ${deliveryId}`,
    'delivery:', '  state: active', `  fullTestStatus: ${ownerAuthorized ? 'authorized' : 'not-ready'}`,
    'changes:', '  - key: X1', `    id: ${changeId}`, '    goal: "future fixture"', '    required: true', '    dependsOn: []', '    state: completed', '    architectureImpact: false', '    outputs: []',
    'ownerDecisions:', ...renderOwnerDecisionRecord(checkpointOwner), ...(ownerAuthorized ? renderOwnerDecisionRecord(fullTestOwner) : []),
    'verification:',
    '  fullTest:',
    '    requiresOwnerAuthorization: true',
    '    execution:',
    '      id: "future-delivery-full-test"',
    '      kind: command',
    `      command: ${JSON.stringify(process.execPath)}`,
    '      args:',
    `        - ${JSON.stringify(childPath)}`,
    '      launcherMode: direct',
    '      scope: delivery',
    '      timeoutMs: 30000',
    '      resultProtocol: flowkit-full-test-result-v1',
    '      resultAuthority: verification',
    '      expectedTerminalStatuses:', '        - "passed"', '        - "failed"',
    '',
  ].join('\n'), 'utf8');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', `chore(flowkit): checkpoint ${changeId}`, '-m', [
    `Flowkit-Delivery: ${deliveryId}`, `Flowkit-Change: ${changeId}`, 'Flowkit-Boundary: change-checkpoint', `Owner-Authorization: ${checkpointOwner.ref}`,
  ].join('\n')]);
  return { root, deliveryId, manifestPath };
}

async function readSnapshot(root: string, deliveryId: string) {
  return readFormalFactSnapshot({ repoRoot: root, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups' });
}

describe('A1 public Delivery Full Test behavior', () => {
  it('flowkit delivery full-test physically executes the persisted future-Delivery binding and publishes passed without creating a Run', async () => {
    const f = await fixture('passed');
    const before = await readSnapshot(f.root, f.deliveryId);
    assert.equal(before.conflicts.length, 0);
    assert.equal(before.deliveryFullTestStatus, 'authorized');
    assert.equal(before.runs.length, 0);

    const cli = await runCli({ argv: ['delivery', 'full-test'], cwd: f.root });
    assert.equal(cli.exitCode, 0, cli.stderr);
    assert.match(cli.stdout, /"executionStatus":"passed"/);

    const after = await readSnapshot(f.root, f.deliveryId);
    assert.equal(after.conflicts.length, 0);
    assert.equal(after.deliveryFullTestStatus, 'passed');
    assert.equal(after.deliveryFullTestResult?.status, 'passed');
    assert.equal(after.runs.length, 0);
    assert.doesNotMatch(await readFile(f.manifestPath, 'utf8'), /executionBlock:/);
  });

  it('a valid Verification-owned failed protocol is the only public path that publishes Full Test failed', async () => {
    const f = await fixture('failed');
    const cli = await runCli({ argv: ['delivery', 'full-test'], cwd: f.root });
    assert.equal(cli.exitCode, 1, cli.stderr);
    assert.match(cli.stdout, /"executionStatus":"failed"/);
    const after = await readSnapshot(f.root, f.deliveryId);
    assert.equal(after.conflicts.length, 0);
    assert.equal(after.deliveryFullTestStatus, 'failed');
    assert.equal(after.deliveryFullTestResult?.status, 'failed');
    assert.match(after.deliveryFullTestResult?.resultRef ?? '', /^verification:full-test:[0-9a-f]{64}$/);
    assert.equal(after.runs.length, 0);
  });

  it('projects raw not-ready as awaiting read-only, then Owner record atomically publishes authorization + raw authorized', async () => {
    const f = await fixture('passed', false);
    const beforeText = await readFile(f.manifestPath, 'utf8');
    const before = await readSnapshot(f.root, f.deliveryId);
    assert.equal(before.conflicts.length, 0);
    assert.equal(before.deliveryFullTestRawStatus, 'not-ready');
    assert.equal(before.deliveryFullTestStatus, 'awaiting-user-decision');
    assert.equal(await readFile(f.manifestPath, 'utf8'), beforeText);

    const record = await runCli({ argv: ['owner', 'record', '--decision', 'authorize-full-test', '--source-ref', 'owner:test:public-authorize'], cwd: f.root });
    assert.equal(record.exitCode, 0, record.stderr);
    assert.match(record.stdout, /"ownerDecisionRef":"owner:[0-9a-f]{64}"/);
    const after = await readSnapshot(f.root, f.deliveryId);
    assert.equal(after.conflicts.length, 0);
    assert.equal(after.deliveryFullTestRawStatus, 'authorized');
    assert.equal(after.deliveryFullTestStatus, 'authorized');
    assert.equal(after.ownerAuthorizations.some((fact) => fact.decision === 'authorize-full-test'), true);
  });


  it('keeps the current 03 bootstrap migration as one bounded instance of the generic execution contract', async () => {
    const manifest = await readFile(join(process.cwd(), 'openspec', 'delivery-groups', '20260817-01-delivery-execution-loop.yaml'), 'utf8');
    assert.match(manifest, /execution:\n {6}id: "project-full-verification"/);
    assert.match(manifest, /kind: bounded-command-plan/);
    assert.match(manifest, /logicalChecks:\n {8}- id: "quality"[\s\S]*- id: "full"/);
    for (const resolverId of ['flowkit-quality', 'flowkit-typecheck', 'flowkit-lint', 'flowkit-build', 'flowkit-openspec-all', 'flowkit-full-tests']) {
      assert.match(manifest, new RegExp(`resolverId: ${resolverId}`));
    }
    assert.equal((manifest.match(/perTargetTimeoutMs: 120000/g) ?? []).length, 6);
    assert.doesNotMatch(manifest, /command: "npm"|launcherMode: npm-shim/);
    assert.match(manifest, /resultProtocol: flowkit-full-test-result-v1/);
  });


  it('physically executes a persisted bounded typecheck plan through the public CLI without creating Run/NNN state', async () => {
    const root = await createTempDir();
    roots.push(root);
    const deliveryId = '20991231-06-bounded-public-cli';
    const changeId = 'bounded-ready';
    const checkpointOwner = buildOwnerDecisionRecord({ decision: 'authorize-checkpoint', deliveryId, changeId, sourceRef: 'owner:test:bounded-checkpoint' });
    const fullTestOwner = buildOwnerDecisionRecord({ decision: 'authorize-full-test', deliveryId, sourceRef: 'owner:test:bounded-full-test' });
    await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
    await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'tests'), { recursive: true });
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
    await writeFile(join(root, 'src', 'ok.ts'), 'export const ok: number = 1;\n', 'utf8');
    await writeFile(join(root, 'tests', 'ok.ts'), 'export const testOk: number = 1;\n', 'utf8');
    const compiler = { compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true }, include: ['src/**/*.ts'] };
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify(compiler), 'utf8');
    await writeFile(join(root, 'tsconfig.test.json'), JSON.stringify({ ...compiler, include: ['tests/**/*.ts'] }), 'utf8');
    const manifestPath = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);

    await git(root, ['init']);
    await git(root, ['config', 'user.email', 'flowkit@example.test']);
    await git(root, ['config', 'user.name', 'Flowkit Test']);
    await writeFile(manifestPath, [
      `id: ${deliveryId}`, 'delivery:', '  state: active', '  fullTestStatus: not-ready',
      'changes:', '  - key: X1', `    id: ${changeId}`, '    goal: "bounded fixture"', '    required: true', '    dependsOn: []', '    state: planned', '    architectureImpact: false', '    outputs: []',
      'verification:', '  fullTest:', '    requiresOwnerAuthorization: true', '',
    ].join('\n'), 'utf8');
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', `chore(flowkit): start ${deliveryId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`]);

    await writeFile(manifestPath, [
      `id: ${deliveryId}`, 'delivery:', '  state: active', '  fullTestStatus: authorized',
      'changes:', '  - key: X1', `    id: ${changeId}`, '    goal: "bounded fixture"', '    required: true', '    dependsOn: []', '    state: completed', '    architectureImpact: false', '    outputs: []',
      'ownerDecisions:', ...renderOwnerDecisionRecord(checkpointOwner), ...renderOwnerDecisionRecord(fullTestOwner),
      'verification:', '  fullTest:', '    requiresOwnerAuthorization: true',
      '    execution:', '      id: "bounded-public"', '      kind: bounded-command-plan', '      logicalChecks:',
      '        - id: "typecheck"', '          resolverId: "flowkit-typecheck"', '          perTargetTimeoutMs: 30000',
      '      scope: delivery', '      resultProtocol: flowkit-full-test-result-v1', '      resultAuthority: verification',
      '      expectedTerminalStatuses:', '        - "passed"', '        - "failed"', '',
    ].join('\n'), 'utf8');
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', `chore(flowkit): checkpoint ${changeId}`, '-m', [
      `Flowkit-Delivery: ${deliveryId}`, `Flowkit-Change: ${changeId}`, 'Flowkit-Boundary: change-checkpoint', `Owner-Authorization: ${checkpointOwner.ref}`,
    ].join('\n')]);

    const before = await readSnapshot(root, deliveryId);
    assert.equal(before.runs.length, 0);
    const cli = await runCli({ argv: ['delivery', 'full-test'], cwd: root });
    assert.equal(cli.exitCode, 0, cli.stderr);
    const after = await readSnapshot(root, deliveryId);
    assert.equal(after.conflicts.length, 0);
    assert.equal(after.deliveryFullTestStatus, 'passed');
    assert.deepEqual(after.deliveryFullTestResult?.checks.map((check) => check.id), ['typecheck']);
    assert.equal(after.runs.length, 0);
  });


  it('remains generic across a different multi-Change Delivery and fresh CLI processes', async () => {
    const root = await createTempDir();
    roots.push(root);
    const deliveryId = '20991231-05-future-multi-change';
    const x1 = 'future-input';
    const x2 = 'future-consumer';
    const x1Owner = buildOwnerDecisionRecord({ decision: 'authorize-checkpoint', deliveryId, changeId: x1, sourceRef: 'owner:test:x1-checkpoint' });
    const x2Owner = buildOwnerDecisionRecord({ decision: 'authorize-checkpoint', deliveryId, changeId: x2, sourceRef: 'owner:test:x2-checkpoint' });
    await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
    await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
    const manifestPath = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
    await git(root, ['init']);
    await git(root, ['config', 'user.email', 'flowkit@example.test']);
    await git(root, ['config', 'user.name', 'Flowkit Test']);
    const render = (x1State: 'planned' | 'completed', x2State: 'planned' | 'completed', owners: readonly string[]) => [
      `id: ${deliveryId}`,
      'delivery:', '  state: active', '  fullTestStatus: not-ready',
      'changes:',
      '  - key: X1', `    id: ${x1}`, '    goal: "input"', '    required: true', '    dependsOn: []', `    state: ${x1State}`, '    architectureImpact: false', '    outputs: []',
      '  - key: X2', `    id: ${x2}`, '    goal: "consumer"', '    required: true', '    dependsOn:', `      - "${x1}"`, `    state: ${x2State}`, '    architectureImpact: false', '    outputs: []',
      ...(owners.length > 0 ? ['ownerDecisions:', ...owners] : []),
      'verification:', '  fullTest:', '    requiresOwnerAuthorization: true',
      '    execution:', '      id: "future-generic-full-test"', '      kind: command', '      command: "node"', '      args:', '        - "verify.mjs"', '      launcherMode: direct', '      scope: delivery', '      timeoutMs: 45000', '      resultProtocol: flowkit-full-test-result-v1', '      resultAuthority: verification', '      expectedTerminalStatuses:', '        - "passed"', '        - "failed"', '',
    ].join('\n');
    await writeFile(manifestPath, render('planned', 'planned', []), 'utf8');
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', `chore(flowkit): start ${deliveryId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`]);

    await writeFile(manifestPath, render('completed', 'planned', renderOwnerDecisionRecord(x1Owner)), 'utf8');
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', `chore(flowkit): checkpoint ${x1}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Change: ${x1}\nFlowkit-Boundary: change-checkpoint\nOwner-Authorization: ${x1Owner.ref}`]);

    await writeFile(manifestPath, render('completed', 'completed', [...renderOwnerDecisionRecord(x1Owner), ...renderOwnerDecisionRecord(x2Owner)]), 'utf8');
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', `chore(flowkit): checkpoint ${x2}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Change: ${x2}\nFlowkit-Boundary: change-checkpoint\nOwner-Authorization: ${x2Owner.ref}`]);

    // Fresh CLI processes resolve the same test-only tsx loader from this checkout.
    // Create the dependency link only after both checkpoint commits so it never becomes a Git/formal fact.
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
    const cliSource = join(process.cwd(), 'src', 'bin', 'flowkit.ts');
    const freshStatus = await runCommand(process.execPath, ['--import', 'tsx', cliSource, 'status'], { cwd: root });
    assert.equal(freshStatus.kind, 'exited');
    assert.equal(freshStatus.exitCode, 0, freshStatus.stderr);
    assert.match(freshStatus.stdout, /full-test: awaiting-user-decision/);

    const authorize = await runCommand(process.execPath, ['--import', 'tsx', cliSource, 'owner', 'record', '--decision', 'authorize-full-test', '--source-ref', 'owner:test:fresh-process-full-test'], { cwd: root });
    assert.equal(authorize.kind, 'exited');
    assert.equal(authorize.exitCode, 0, authorize.stderr);

    const freshNext = await runCommand(process.execPath, ['--import', 'tsx', cliSource, 'next'], { cwd: root });
    assert.equal(freshNext.kind, 'exited');
    assert.equal(freshNext.exitCode, 0, freshNext.stderr);
    assert.match(freshNext.stdout, /kind: delivery-behavior/);
    assert.match(freshNext.stdout, /behavior: full-test/);
  });

});
