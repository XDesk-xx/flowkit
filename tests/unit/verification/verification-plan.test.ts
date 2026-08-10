import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  executeProjectStep,
  runVerificationPlan,
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
    const calls: Array<{ executable: string; args: readonly string[] }> = [];
    const result = await executeProjectStep(full, async (executable, args) => {
      calls.push({ executable, args });
      return { exitCode: 0, durationMs: 321 };
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.durationMs, 321);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.executable, process.platform === 'win32' ? /npm\.cmd$/u : /npm$/u);
    assert.deepEqual(calls[0]!.args, ['run', 'test:full']);
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
        return executeProjectStep(step, async (executable, args) => {
          assert.match(executable, process.platform === 'win32' ? /npm\.cmd$/u : /npm$/u);
          assert.deepEqual(args, ['run', 'test:full']);
          return { exitCode: 7, durationMs: 1_234 };
        });
      });
      assert.equal(code, 7);
      assert.deepEqual(executed, ['quality', 'typecheck', 'lint', 'build', 'openspec-all', 'full']);
      assert.match(logs.join('\n'), /step: full status=running/);
      assert.match(logs.join('\n'), /step: full status=failed duration=1\.234s/);
    } finally {
      console.log = originalLog;
    }
  });

});
