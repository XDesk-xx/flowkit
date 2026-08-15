import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';

import { runChangeOperator } from '../../../src/cli/change-action.js';
import { createTempDir } from '../../fixtures/helpers.js';

const exec = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(changeId = 'alpha-change', deliveryId = '20990401-01-future-delivery') {
  const root = await createTempDir();
  roots.push(root);
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes', changeId), { recursive: true });
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: A1',
    `    id: ${changeId}`,
    '    goal: "future consumer"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
    '    architectureImpact: false',
    '    outputs: []',
    '',
  ].join('\n'));
  await writeFile(join(root, 'openspec', 'changes', changeId, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-04-01\n');
  await exec('git', ['init'], { cwd: root });
  await exec('git', ['add', '.'], { cwd: root });
  await exec('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base'], { cwd: root });
  return { root, deliveryId, changeId };
}

describe('Change operator intent composition', () => {
  it('preflights mismatched intent without allocating the Policy-resolved Run', async () => {
    const { root, deliveryId } = await fixture();
    await assert.rejects(() => runChangeOperator(root, deliveryId, 'apply'), /does not match resolved\/pending formal action explore/);
    const deliveryRuns = join(root, '.flowkit', 'runs', deliveryId);
    assert.deepEqual(await readdir(deliveryRuns).catch(() => []), []);
  });

  it('prepares and exact-resumes the same pending Run, admits its result, and does not auto-continue', async () => {
    const { root, deliveryId, changeId } = await fixture('beta-change');
    const first = await runChangeOperator(root, deliveryId, 'explore');
    const firstView = first.value as { mode: string; runId: string };
    assert.equal(firstView.mode, 'prepared');

    const second = await runChangeOperator(root, deliveryId, 'explore');
    const secondView = second.value as { mode: string; runId: string };
    assert.equal(secondView.mode, 'resumed');
    assert.equal(secondView.runId, firstView.runId);

    await assert.rejects(
      () => runChangeOperator(root, deliveryId, 'propose', { executionStatus: 'completed', summary: 'wrong intent' }),
      /does not match resolved\/pending formal action explore|requires exactly one resumable pending Run/,
    );
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n\nfuture consumer proof\n');
    const admitted = await runChangeOperator(root, deliveryId, 'explore', {
      executionStatus: 'completed',
      summary: 'explore completed',
    });
    const admittedView = admitted.value as { mode: string; runId: string; result: { runStatus: string } };
    assert.equal(admittedView.mode, 'admitted');
    assert.equal(admittedView.runId, firstView.runId);
    assert.equal(admittedView.result.runStatus, 'completed');
    assert.deepEqual(await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId)), [firstView.runId]);
  });

  it('keeps a non-author blocker on direct re-review and rejects revise', async () => {
    const { root, deliveryId, changeId } = await fixture('authority-change');
    await runChangeOperator(root, deliveryId, 'explore');
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n\nauthority proof\n');
    await runChangeOperator(root, deliveryId, 'explore', { executionStatus: 'completed', summary: 'explored' });
    await runChangeOperator(root, deliveryId, 'review');
    await runChangeOperator(root, deliveryId, 'review', {
      executionStatus: 'completed',
      summary: 'owner fact required',
      reviewVerdict: 'changes-requested',
      reviewFindings: [{
        id: 'UNIT-OWNER-001',
        severity: 'blocking',
        title: 'Owner fact required',
        problem: 'Owner authority is missing.',
        contractRef: 'unit',
        invariant: 'owner authority remains external',
        evidence: ['unit fixture'],
        impact: 'revise is not legal',
        blockingAuthority: 'owner',
        requiredOutcome: 'Owner supplies the fact',
        acceptance: ['Owner fact exists'],
      }],
      reviewFindingConvergence: [],
    });
    await assert.rejects(() => runChangeOperator(root, deliveryId, 'revise'), /not the current Standard Change Action|did not resolve|does not match/);
    const rereview = await runChangeOperator(root, deliveryId, 'review');
    assert.equal((rereview.value as { action: string }).action, 'review-explore');
    assert.equal((rereview.value as { mode: string }).mode, 'prepared');
  });
});
