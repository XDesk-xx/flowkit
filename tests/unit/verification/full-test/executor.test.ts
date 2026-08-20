import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BoundedCommandPlanFullTestExecution } from '../../../../src/domain/full-test.js';
import { executeBoundedFullTest } from '../../../../src/verification/full-test/executor.js';
import type { ResolvedFullTestLogicalCheck } from '../../../../src/verification/full-test/resolver.js';
import type { ExternalCommandOutcome } from '../../../../src/shared/external-command.js';

const execution: BoundedCommandPlanFullTestExecution = {
  id: 'fixture',
  kind: 'bounded-command-plan',
  logicalChecks: [
    { id: 'quality', resolverId: 'flowkit-quality', perTargetTimeoutMs: 1000 },
    { id: 'build', resolverId: 'flowkit-build', perTargetTimeoutMs: 1000 },
  ],
  scope: 'delivery',
  resultProtocol: 'flowkit-full-test-result-v1',
  resultAuthority: 'verification',
  expectedTerminalStatuses: ['passed', 'failed'],
};

function resolved(check: BoundedCommandPlanFullTestExecution['logicalChecks'][number]): ResolvedFullTestLogicalCheck {
  return {
    check,
    targets: [{ logicalCheckId: check.id, physicalTargetId: `${check.id}:one`, command: 'node', args: ['fixture'], env: {} }],
    cleanupPaths: [],
  };
}

function outcome(kind: ExternalCommandOutcome['kind'], exitCode = kind === 'exited' ? 0 : 1): ExternalCommandOutcome {
  return { kind, stdout: '', stderr: '', exitCode, spawned: true, timedOut: kind !== 'exited' } as ExternalCommandOutcome;
}

describe('I1 bounded Full Test executor', () => {
  it('publishes PASS only after the complete persisted logical plan passes in order', async () => {
    const seen: string[] = [];
    const result = await executeBoundedFullTest('/repo', execution, {
      resolveLogicalCheck: async (_root, check) => resolved(check),
      runCommand: async (_command, _args, options) => {
        seen.push(String(options?.timeout));
        return outcome('exited', 0);
      },
    });
    assert.equal(result.kind, 'terminal');
    if (result.kind !== 'terminal') return;
    assert.equal(result.payload.status, 'passed');
    assert.deepEqual(result.payload.checks.map((check) => [check.id, check.status]), [['quality', 'passed'], ['build', 'passed']]);
    assert.deepEqual(seen, ['1000', '1000']);
  });

  it('publishes FAILED as the exact executed prefix and stops after the first nonzero physical target', async () => {
    let calls = 0;
    const result = await executeBoundedFullTest('/repo', execution, {
      resolveLogicalCheck: async (_root, check) => resolved(check),
      runCommand: async () => {
        calls += 1;
        return outcome('exited', calls === 2 ? 7 : 0);
      },
    });
    assert.equal(result.kind, 'terminal');
    if (result.kind !== 'terminal') return;
    assert.equal(result.payload.status, 'failed');
    assert.deepEqual(result.payload.checks.map((check) => [check.id, check.status]), [['quality', 'passed'], ['build', 'failed']]);
    assert.equal(calls, 2);
  });

  it('keeps transport uncertainty out of the terminal Verification protocol', async () => {
    for (const kind of ['timed-out-cancelled', 'outcome-unknown'] as const) {
      const result = await executeBoundedFullTest('/repo', execution, {
        resolveLogicalCheck: async (_root, check) => resolved(check),
        runCommand: async () => outcome(kind),
      });
      assert.equal(result.kind, 'execution-error');
      if (result.kind === 'execution-error') assert.equal(result.outcomeKind, kind);
    }
  });

  it('fails closed on resolver drift before publishing a terminal result', async () => {
    const result = await executeBoundedFullTest('/repo', execution, {
      resolveLogicalCheck: async () => { throw new Error('title drift'); },
    });
    assert.equal(result.kind, 'execution-error');
    if (result.kind === 'execution-error') assert.equal(result.outcomeKind, 'resolver-error');
  });
});
