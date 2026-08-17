import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fullTestResultRefFor } from '../../../src/domain/full-test.js';
import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function snapshotFor(fullTestStatus: 'authorized' | 'passed', ownedLines: readonly string[]) {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20991231-02-full-test-reader';
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    `  fullTestStatus: ${fullTestStatus}`,
    'changes:',
    '  - key: A1',
    '    id: active-change',
    '    goal: "active"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
    '    architectureImpact: false',
    '    outputs: []',
    'verification:',
    '  fullTest:',
    '    requiresOwnerAuthorization: true',
    '    execution:',
    '      id: "fixture"',
    '      kind: command',
    '      command: "node"',
    '      args:',
    '        - "verify.mjs"',
    '      launcherMode: direct',
    '      scope: delivery',
    '      timeoutMs: 1000',
    '      resultProtocol: flowkit-full-test-result-v1',
    '      resultAuthority: verification',
    '      expectedTerminalStatuses:',
    '        - "passed"',
    '        - "failed"',
    ...ownedLines,
    '',
  ].join('\n'), 'utf8');
  return readFormalFactSnapshot({ repoRoot: root, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups' });
}

describe('A1 Full Test formal fact reader', () => {
  it('independently recomputes the canonical terminal resultRef and projects the closed result', async () => {
    const payload = {
      schemaVersion: 1 as const,
      status: 'passed' as const,
      summary: 'all project checks passed',
      totalDurationMs: 19,
      checks: [
        { id: 'quality', status: 'passed' as const, durationMs: 7 },
        { id: 'full', status: 'passed' as const, durationMs: 12 },
      ],
    };
    const ref = fullTestResultRefFor(payload);
    const snapshot = await snapshotFor('passed', [
      '    result:',
      '      schemaVersion: 1',
      '      status: passed',
      '      summary: "all project checks passed"',
      '      totalDurationMs: 19',
      '      checks:',
      '        - id: "quality"',
      '          status: passed',
      '          durationMs: 7',
      '        - id: "full"',
      '          status: passed',
      '          durationMs: 12',
      `      resultRef: "${ref}"`,
    ]);
    assert.equal(snapshot.conflicts.length, 0);
    assert.equal(snapshot.deliveryFullTestResult?.resultRef, ref);
    assert.deepEqual(snapshot.deliveryFullTestResult?.checks, payload.checks);
  });

  it('fails closed when resultRef does not match the exact canonical payload', async () => {
    const snapshot = await snapshotFor('passed', [
      '    result:',
      '      schemaVersion: 1',
      '      status: passed',
      '      summary: "all project checks passed"',
      '      totalDurationMs: 19',
      '      checks:',
      '        - id: "full"',
      '          status: passed',
      '          durationMs: 19',
      `      resultRef: "verification:full-test:${'0'.repeat(64)}"`,
    ]);
    assert.ok(snapshot.conflicts.some((conflict) => conflict.dimension === 'delivery-full-test-result'));
    assert.equal(snapshot.deliveryFullTestResult, undefined);
  });

  it('projects outcome-unknown only as an authorized execution safety block', async () => {
    const snapshot = await snapshotFor('authorized', [
      '    executionBlock:',
      '      schemaVersion: 1',
      '      reason: outcome-unknown',
      '      summary: "prior process tree not proven terminal"',
    ]);
    assert.equal(snapshot.conflicts.length, 0);
    assert.equal(snapshot.deliveryFullTestRawStatus, 'authorized');
    assert.equal(snapshot.deliveryFullTestResult, undefined);
    assert.equal(snapshot.deliveryFullTestExecutionBlock?.reason, 'outcome-unknown');
  });

  it('rejects terminal result on a non-terminal Full Test state', async () => {
    const payload = { schemaVersion: 1 as const, status: 'passed' as const, summary: 'passed', totalDurationMs: 1, checks: [{ id: 'full', status: 'passed' as const, durationMs: 1 }] };
    const snapshot = await snapshotFor('authorized', [
      '    result:',
      '      schemaVersion: 1',
      '      status: passed',
      '      summary: "passed"',
      '      totalDurationMs: 1',
      '      checks:',
      '        - id: "full"',
      '          status: passed',
      '          durationMs: 1',
      `      resultRef: "${fullTestResultRefFor(payload)}"`,
    ]);
    assert.ok(snapshot.conflicts.some((conflict) => conflict.dimension === 'delivery-full-test-result'));
  });
});
