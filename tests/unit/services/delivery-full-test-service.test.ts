import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fullTestResultRefFor } from '../../../src/domain/full-test.js';
import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
import { renderOwnerDecisionRecord } from '../../../src/persistence/delivery-manifest-document.js';
import { buildOwnerDecisionRecord } from '../../../src/services/a1-write-service.js';
import {
  runDeliveryFullTest,
  type DeliveryFullTestOptions,
} from '../../../src/services/delivery-full-test-service.js';
import {
  runCommand,
  type ExternalCommandOutcome,
} from '../../../src/shared/external-command.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function git(root: string, args: string[]): Promise<void> {
  const result = await runCommand('git', args, { cwd: root });
  assert.equal(result.kind, 'exited', result.stderr);
  assert.equal(result.exitCode, 0, result.stderr);
}

async function fixture(
  options: {
    launcherMode?: 'direct' | 'npm-shim';
    command?: string;
    timeoutMs?: number;
  } = {},
) {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20991231-01-full-test-service';
  const changeId = 'completed-change';
  const fullTestOwner = buildOwnerDecisionRecord({
    decision: 'authorize-full-test',
    deliveryId,
    sourceRef: 'owner:test:full-test',
  });
  const checkpointOwner = buildOwnerDecisionRecord({
    decision: 'authorize-checkpoint',
    deliveryId,
    changeId,
    sourceRef: 'owner:test:checkpoint',
  });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  const manifestPath = join(
    root,
    'openspec',
    'delivery-groups',
    `${deliveryId}.yaml`,
  );

  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'flowkit@example.test']);
  await git(root, ['config', 'user.name', 'Flowkit Test']);
  await writeFile(
    manifestPath,
    [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: X1',
      `    id: ${changeId}`,
      '    goal: "Fixture"',
      '    required: true',
      '    dependsOn: []',
      '    state: planned',
      '    architectureImpact: false',
      '    outputs: []',
      'verification:',
      '  fullTest:',
      '    requiresOwnerAuthorization: true',
      '',
    ].join('\n'),
    'utf8',
  );
  await git(root, ['add', '.']);
  await git(root, [
    'commit',
    '-m',
    `chore(flowkit): start ${deliveryId}`,
    '-m',
    `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`,
  ]);

  const launcherMode = options.launcherMode ?? 'direct';
  const command = options.command ?? 'node';
  const timeoutMs = options.timeoutMs ?? 30000;
  await writeFile(
    manifestPath,
    [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: authorized',
      'changes:',
      '  - key: X1',
      `    id: ${changeId}`,
      '    goal: "Fixture"',
      '    required: true',
      '    dependsOn: []',
      '    state: completed',
      '    architectureImpact: false',
      '    outputs: []',
      'ownerDecisions:',
      ...renderOwnerDecisionRecord(checkpointOwner),
      ...renderOwnerDecisionRecord(fullTestOwner),
      'verification:',
      '  fullTest:',
      '    requiresOwnerAuthorization: true',
      '    execution:',
      '      id: "fixture-full-test"',
      '      kind: command',
      `      command: "${command}"`,
      '      args:',
      '        - "verify-full.mjs"',
      `      launcherMode: ${launcherMode}`,
      '      scope: delivery',
      `      timeoutMs: ${timeoutMs}`,
      '      resultProtocol: flowkit-full-test-result-v1',
      '      resultAuthority: verification',
      '      expectedTerminalStatuses:',
      '        - "passed"',
      '        - "failed"',
      '',
    ].join('\n'),
    'utf8',
  );
  await git(root, ['add', '.']);
  await git(root, [
    'commit',
    '-m',
    `chore(flowkit): checkpoint ${changeId}`,
    '-m',
    [
      `Flowkit-Delivery: ${deliveryId}`,
      `Flowkit-Change: ${changeId}`,
      'Flowkit-Boundary: change-checkpoint',
      `Owner-Authorization: ${checkpointOwner.ref}`,
    ].join('\n'),
  ]);
  return { root, deliveryId, manifestPath };
}

function exited(exitCode = 0): ExternalCommandOutcome {
  return {
    kind: 'exited',
    stdout: '',
    stderr: '',
    exitCode,
    spawned: true,
    timedOut: false,
  };
}

describe('A1 Delivery Full Test service', () => {
  it('spawns the single persisted physical route and publishes a recomputable Verification terminal result without a Run', async () => {
    const f = await fixture();
    const beforeRuns = await readFile(f.manifestPath, 'utf8');
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const result = await runDeliveryFullTest(f.root, f.deliveryId, {
      runCommand: async (command, args, options) => {
        calls.push({ command, args });
        const resultPath = options?.env?.['FLOWKIT_FULL_TEST_RESULT_PATH'];
        assert.ok(resultPath);
        await writeFile(
          resultPath,
          JSON.stringify({
            schemaVersion: 1,
            status: 'passed',
            summary: 'fixture Full Test passed',
            totalDurationMs: 42,
            checks: [
              { id: 'quality', status: 'passed', durationMs: 10 },
              { id: 'full', status: 'passed', durationMs: 32 },
            ],
          }),
          'utf8',
        );
        return exited(0);
      },
    });
    assert.equal(result.executionStatus, 'passed');
    assert.deepEqual(calls, [{ command: 'node', args: ['verify-full.mjs'] }]);
    const snapshot = await readFormalFactSnapshot({
      repoRoot: f.root,
      deliveryId: f.deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: 'openspec/delivery-groups',
    });
    assert.equal(snapshot.conflicts.length, 0);
    assert.equal(snapshot.deliveryFullTestStatus, 'passed');
    assert.equal(snapshot.deliveryFullTestRawStatus, 'passed');
    assert.equal(
      snapshot.deliveryFullTestResult?.resultRef,
      fullTestResultRefFor({
        schemaVersion: 1,
        status: 'passed',
        summary: 'fixture Full Test passed',
        totalDurationMs: 42,
        checks: [
          { id: 'quality', status: 'passed', durationMs: 10 },
          { id: 'full', status: 'passed', durationMs: 32 },
        ],
      }),
    );
    assert.equal(snapshot.runs.length, 0);
    assert.notEqual(await readFile(f.manifestPath, 'utf8'), beforeRuns);
  });

  it('normalizes npm-shim to npm.cmd on win32 and leaves platform launch mechanics to the existing command runner seam', async () => {
    const f = await fixture({ launcherMode: 'npm-shim', command: 'npm' });
    let observed = '';
    const result = await runDeliveryFullTest(f.root, f.deliveryId, {
      platform: 'win32',
      comSpec: 'cmd.exe',
      runCommand: async (command, _args, options) => {
        observed = command;
        const resultPath = options?.env?.['FLOWKIT_FULL_TEST_RESULT_PATH'];
        assert.ok(resultPath);
        await writeFile(
          resultPath,
          JSON.stringify({
            schemaVersion: 1,
            status: 'passed',
            summary: 'passed',
            totalDurationMs: 1,
            checks: [{ id: 'full', status: 'passed', durationMs: 1 }],
          }),
          'utf8',
        );
        return exited(0);
      },
    });
    assert.equal(observed, 'npm.cmd');
    assert.equal(result.executionStatus, 'passed');
  });

  it(
    'owns a POSIX process group and confirms descendant termination before returning re-entry-safe timeout cancellation',
    { skip: process.platform === 'win32' },
    async () => {
      const f = await fixture({ timeoutMs: 80 });
      const marker = join(f.root, 'descendant-survived.txt');
      const descendant = [
        "const { writeFileSync } = require('node:fs');",
        "setTimeout(() => writeFileSync(process.env.FLOWKIT_DESCENDANT_MARKER, 'descendant-survived'), 350);",
        'setInterval(() => {}, 1000);',
      ].join(' ');
      await writeFile(
        join(f.root, 'verify-full.mjs'),
        [
          "import { spawn } from 'node:child_process';",
          `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { env: { ...process.env, FLOWKIT_DESCENDANT_MARKER: ${JSON.stringify(marker)} }, stdio: 'ignore' });`,
          'setInterval(() => {}, 1000);',
          '',
        ].join('\n'),
        'utf8',
      );

      const result = await runDeliveryFullTest(f.root, f.deliveryId, {
        platform: process.platform,
      });
      assert.equal(result.executionStatus, 'execution-error');
      assert.equal(result.outcomeKind, 'timed-out-cancelled');

      const after = await readFormalFactSnapshot({
        repoRoot: f.root,
        deliveryId: f.deliveryId,
        runsPathPrefix: '.flowkit/runs',
        openspecChangesPath: 'openspec/changes',
        manifestPathPrefix: 'openspec/delivery-groups',
      });
      assert.equal(after.deliveryFullTestRawStatus, 'authorized');
      assert.equal(after.deliveryFullTestExecutionBlock, undefined);
      assert.equal(after.deliveryFullTestResult, undefined);

      await new Promise((resolve) => setTimeout(resolve, 500));
      await assert.rejects(
        readFile(marker, 'utf8'),
        (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT',
      );
    },
  );

  it('owns Windows whole-tree cancellation through taskkill and distinguishes proven cancellation from outcome-unknown', async () => {
    for (const taskkillExit of [0, 1] as const) {
      const f = await fixture({ launcherMode: 'npm-shim', command: 'npm' });
      const calls: Array<{ command: string; args: readonly string[] }> = [];
      const result = await runDeliveryFullTest(f.root, f.deliveryId, {
        platform: 'win32',
        comSpec: 'cmd.exe',
        runCommand: async (command, args, options) => {
          calls.push({ command, args });
          if (command === 'taskkill.exe') return exited(taskkillExit);
          assert.equal(command, 'npm.cmd');
          assert.ok(options?.windowsProcessTreeCanceller);
          const cancellation = await options.windowsProcessTreeCanceller({
            pid: 4321,
            command,
            args,
          });
          return cancellation.terminated
            ? {
                kind: 'timed-out-cancelled',
                stdout: '',
                stderr: '',
                exitCode: 1,
                spawned: true,
                timedOut: true,
                processTreeDiagnostics: cancellation.diagnostics,
              }
            : {
                kind: 'outcome-unknown',
                stdout: '',
                stderr: '',
                exitCode: 1,
                spawned: true,
                timedOut: true,
                processTreeDiagnostics: cancellation.diagnostics,
              };
        },
      });
      assert.deepEqual(calls[1], {
        command: 'taskkill.exe',
        args: ['/PID', '4321', '/T', '/F'],
      });
      const after = await readFormalFactSnapshot({
        repoRoot: f.root,
        deliveryId: f.deliveryId,
        runsPathPrefix: '.flowkit/runs',
        openspecChangesPath: 'openspec/changes',
        manifestPathPrefix: 'openspec/delivery-groups',
      });
      if (taskkillExit === 0) {
        assert.equal(result.outcomeKind, 'timed-out-cancelled');
        assert.equal(after.deliveryFullTestExecutionBlock, undefined);
      } else {
        assert.equal(result.outcomeKind, 'outcome-unknown');
        assert.equal(
          after.deliveryFullTestExecutionBlock?.reason,
          'outcome-unknown',
        );
      }
      assert.equal(after.deliveryFullTestRawStatus, 'authorized');
      assert.equal(after.deliveryFullTestResult, undefined);
    }
  });

  it('persists only an outcome-unknown safety block and refuses a second attempt; it never fabricates Verification failed', async () => {
    const f = await fixture();
    let calls = 0;
    const first = await runDeliveryFullTest(f.root, f.deliveryId, {
      runCommand: async () => {
        calls += 1;
        return {
          kind: 'outcome-unknown',
          stdout: '',
          stderr: '',
          exitCode: 1,
          spawned: true,
          timedOut: true,
          processTreeDiagnostics: ['tree-not-proven-terminal'],
        };
      },
    });
    assert.equal(first.executionStatus, 'execution-error');
    assert.equal(first.outcomeKind, 'outcome-unknown');
    const after = await readFormalFactSnapshot({
      repoRoot: f.root,
      deliveryId: f.deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: 'openspec/delivery-groups',
    });
    assert.equal(after.deliveryFullTestRawStatus, 'authorized');
    assert.equal(after.deliveryFullTestResult, undefined);
    assert.equal(
      after.deliveryFullTestExecutionBlock?.reason,
      'outcome-unknown',
    );

    const second = await runDeliveryFullTest(f.root, f.deliveryId, {
      runCommand: async () => {
        calls += 1;
        return exited(0);
      },
    });
    assert.equal(second.executionStatus, 'blocked');
    assert.equal(calls, 1);
  });

  it('keeps authorized and publishes no resultRef for spawn, timeout, malformed protocol, or exit/protocol mismatch', async () => {
    const cases: Array<{
      name: string;
      run: NonNullable<DeliveryFullTestOptions['runCommand']>;
    }> = [
      {
        name: 'spawn-failed',
        run: async () => ({
          kind: 'spawn-failed',
          stdout: '',
          stderr: '',
          exitCode: 1,
          spawned: false,
          timedOut: false,
          spawnError: { message: 'missing' },
        }),
      },
      {
        name: 'timed-out-cancelled',
        run: async () => ({
          kind: 'timed-out-cancelled',
          stdout: '',
          stderr: '',
          exitCode: 1,
          spawned: true,
          timedOut: true,
        }),
      },
      {
        name: 'malformed-protocol',
        run: async (_c, _a, options) => {
          await writeFile(
            options!.env!['FLOWKIT_FULL_TEST_RESULT_PATH']!,
            '{}',
          );
          return exited(0);
        },
      },
      {
        name: 'mismatch',
        run: async (_c, _a, options) => {
          await writeFile(
            options!.env!['FLOWKIT_FULL_TEST_RESULT_PATH']!,
            JSON.stringify({
              schemaVersion: 1,
              status: 'failed',
              summary: 'checks failed',
              totalDurationMs: 1,
              checks: [{ id: 'full', status: 'failed', durationMs: 1 }],
            }),
          );
          return exited(0);
        },
      },
    ];
    for (const c of cases) {
      const f = await fixture();
      const result = await runDeliveryFullTest(f.root, f.deliveryId, {
        runCommand: c.run,
      });
      assert.equal(result.executionStatus, 'execution-error', c.name);
      const snapshot = await readFormalFactSnapshot({
        repoRoot: f.root,
        deliveryId: f.deliveryId,
        runsPathPrefix: '.flowkit/runs',
        openspecChangesPath: 'openspec/changes',
        manifestPathPrefix: 'openspec/delivery-groups',
      });
      assert.equal(snapshot.deliveryFullTestRawStatus, 'authorized', c.name);
      assert.equal(snapshot.deliveryFullTestResult, undefined, c.name);
    }
  });
});
