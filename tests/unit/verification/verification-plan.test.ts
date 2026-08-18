import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  executeProjectStep,
  fullTestEnvironment,
  runVerificationPlan,
  runVerificationPlanDetailed,
  main as verificationMain,
  verifyChangePlan,
  verifyFullPlan,
} from '../../../scripts/verification.js';

describe('F1 verification plans', () => {
  it('keeps verify:change on affected checks and never full', () => {
    const plan = verifyChangePlan(['verification']);
    const serialized = JSON.stringify(plan);
    assert.match(serialized, /test:affected/);
    assert.doesNotMatch(serialized, /test:full|verify:full/);
  });

  it('allows none only as a standalone no-test scope', () => {
    const plan = verifyChangePlan(['none']);
    assert.ok(!JSON.stringify(plan).includes('test:affected'));
    assert.throws(() => verifyChangePlan(['none', 'policy']), /cannot be combined/);
  });

  it('freezes the full verification order and isolates final full behind public test:full', async () => {
    const plan = verifyFullPlan();
    assert.deepEqual(plan.map((step) => step.name), [
      'quality',
      'typecheck',
      'lint',
      'build',
      'openspec-all',
      'full',
    ]);

    const full = plan.find((step) => step.name === 'full');
    assert.ok(full);
    const previousLegacy = process.env['FLOWKIT_OPENSPEC_BIN'];
    const managedHome = process.env['FLOWKIT_HOME'];
    assert.ok(managedHome, 'FLOWKIT_HOME managed fixture is required');
    delete process.env['FLOWKIT_OPENSPEC_BIN'];
    const calls: Array<{ executable: string; args: readonly string[]; env?: NodeJS.ProcessEnv }> = [];
    try {
      const result = await executeProjectStep(full, async (executable, args, options) => {
        calls.push({ executable, args, env: options.env });
        return { exitCode: 0, durationMs: 321 };
      });

      assert.equal(result.exitCode, 0);
      assert.equal(result.durationMs, 321);
      assert.equal(calls.length, 1);
      assert.match(calls[0]!.executable, process.platform === 'win32' ? /npm\.cmd$/u : /npm$/u);
      assert.deepEqual(calls[0]!.args, ['run', 'test:full']);
      assert.equal(calls[0]!.env?.['FLOWKIT_HOME'], managedHome);
      assert.equal(calls[0]!.env?.['FLOWKIT_OPENSPEC_BIN'], undefined);
      const projected = await fullTestEnvironment();
      assert.equal(projected['FLOWKIT_HOME'], managedHome);
      assert.equal(projected['FLOWKIT_OPENSPEC_BIN'], undefined);
    } finally {
      if (previousLegacy === undefined) delete process.env['FLOWKIT_OPENSPEC_BIN'];
      else process.env['FLOWKIT_OPENSPEC_BIN'] = previousLegacy;
    }
  });


  it('records failed status and duration for the final full step', async () => {
    const logs: string[] = [];
    const executed: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
    try {
      const code = await runVerificationPlan(verifyFullPlan(), async (step) => {
        executed.push(step.name);
        if (step.name !== 'full') return { exitCode: 0, durationMs: 10 };
        const previousLegacy = process.env['FLOWKIT_OPENSPEC_BIN'];
        const managedHome = process.env['FLOWKIT_HOME'];
        assert.ok(managedHome, 'FLOWKIT_HOME managed fixture is required');
        delete process.env['FLOWKIT_OPENSPEC_BIN'];
        try {
          return await executeProjectStep(step, async (executable, args, options) => {
            assert.match(executable, process.platform === 'win32' ? /npm\.cmd$/u : /npm$/u);
            assert.deepEqual(args, ['run', 'test:full']);
            assert.equal(options.env?.['FLOWKIT_HOME'], managedHome);
            assert.equal(options.env?.['FLOWKIT_OPENSPEC_BIN'], undefined);
            return { exitCode: 7, durationMs: 1_234 };
          });
        } finally {
          if (previousLegacy === undefined) delete process.env['FLOWKIT_OPENSPEC_BIN'];
          else process.env['FLOWKIT_OPENSPEC_BIN'] = previousLegacy;
        }
      });
      assert.equal(code, 7);
      assert.deepEqual(executed, ['quality', 'typecheck', 'lint', 'build', 'openspec-all', 'full']);
      assert.match(logs.join('\n'), /step: full status=running/);
      assert.match(logs.join('\n'), /step: full status=failed duration=1\.234s/);
    } finally {
      console.log = originalLog;
    }
  });


  it('builds the closed Full Test protocol in physical execution order', async () => {
    const result = await runVerificationPlanDetailed(verifyFullPlan().slice(0, 2), async (step) => ({
      exitCode: 0,
      durationMs: step.name === 'quality' ? 3.2 : 4.8,
    }));
    assert.equal(result.exitCode, 0);
    assert.equal(result.payload.schemaVersion, 1);
    assert.equal(result.payload.status, 'passed');
    assert.deepEqual(result.payload.checks, [
      { id: 'quality', status: 'passed', durationMs: 3 },
      { id: 'typecheck', status: 'passed', durationMs: 5 },
    ]);
  });

  it('verify:full main publishes the same structured child protocol when FLOWKIT_FULL_TEST_RESULT_PATH is provided', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-verification-protocol-'));
    const path = join(root, 'result.json');
    const previous = process.env['FLOWKIT_FULL_TEST_RESULT_PATH'];
    process.env['FLOWKIT_FULL_TEST_RESULT_PATH'] = path;
    try {
      const payload = {
        schemaVersion: 1 as const,
        status: 'passed' as const,
        summary: 'all full-test checks passed',
        totalDurationMs: 9,
        checks: [{ id: 'full', status: 'passed' as const, durationMs: 9 }],
      };
      const code = await verificationMain(['verify:full'], async () => ({ exitCode: 0, payload }));
      assert.equal(code, 0);
      assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), payload);
    } finally {
      if (previous === undefined) delete process.env['FLOWKIT_FULL_TEST_RESULT_PATH'];
      else process.env['FLOWKIT_FULL_TEST_RESULT_PATH'] = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

});
