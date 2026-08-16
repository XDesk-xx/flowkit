import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { readGitBoundaryProjection, readGitBoundarySummaries } from '../../../src/facts/git-boundary-reader.js';

const execFileAsync = promisify(execFile);

async function initRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'flowkit-git-boundary-'));
  await execFileAsync('git', ['init'], { cwd: repo });
  await execFileAsync('git', ['config', 'user.email', 'flowkit@example.test'], { cwd: repo });
  await execFileAsync('git', ['config', 'user.name', 'Flowkit Test'], { cwd: repo });
  return repo;
}

async function commit(repo: string, subject: string, value: string, body?: string): Promise<void> {
  await writeFile(join(repo, 'x.txt'), `${value}\n`);
  await execFileAsync('git', ['add', 'x.txt'], { cwd: repo });
  const args = ['commit', '-m', subject];
  if (body !== undefined) args.push('-m', body);
  await execFileAsync('git', args, { cwd: repo });
}

function formalBody(deliveryId: string, changeId: string, ownerRef = `owner:${'a'.repeat(64)}`): string {
  return [
    `Flowkit-Delivery: ${deliveryId}`,
    `Flowkit-Change: ${changeId}`,
    'Flowkit-Boundary: change-checkpoint',
    `Owner-Authorization: ${ownerRef}`,
  ].join('\n');
}

describe('readGitBoundarySummaries', () => {
  it('returns empty array when git is unavailable', async () => {
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    assert.deepEqual(facts, []);
  });

  it('does not persist Git boundaries to state files', async () => {
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    assert.ok(Array.isArray(facts));
  });
});

describe('readGitBoundarySummaries — strict Delivery-scoped checkpoint identity', () => {
  it('accepts a checkpoint candidate only when subject and formal trailers are exact', async () => {
    const repo = await initRepo();
    const deliveryId = '20260806-01-deterministic-core';
    const changeId = 'q2-change';
    await commit(repo, `chore(flowkit): start ${deliveryId}`, 'start');
    await commit(repo, `chore(flowkit): checkpoint ${changeId}`, 'q2', formalBody(deliveryId, changeId));

    const facts = await readGitBoundarySummaries(repo, deliveryId);
    const checkpoint = facts.find((f) => f.kind === 'change-checkpoint');
    assert.equal(checkpoint?.changeId, changeId);
  });

  it('keeps subject-only checkpoint as a non-formal candidate instead of a GitBoundaryFact', async () => {
    const repo = await initRepo();
    const deliveryId = '20260806-01-deterministic-core';
    await commit(repo, `chore(flowkit): start ${deliveryId}`, 'start');
    await commit(repo, 'chore(flowkit): checkpoint q2-change', 'q2');

    const projection = await readGitBoundaryProjection(repo, deliveryId);
    assert.equal(projection.checkpointCandidates.length, 1);
    assert.equal(projection.checkpointCandidates[0]?.formalIdentityValid, false);
    const facts = await readGitBoundarySummaries(repo, deliveryId);
    assert.equal(facts.some((fact) => fact.kind === 'change-checkpoint'), false);
  });

  it('rejects wrong/duplicate formal trailer identity', async () => {
    const repo = await initRepo();
    const deliveryId = '20260806-01-deterministic-core';
    await commit(repo, `chore(flowkit): start ${deliveryId}`, 'start');
    await commit(repo, 'chore(flowkit): checkpoint q2-change', 'wrong', [
      `Flowkit-Delivery: ${deliveryId}`,
      'Flowkit-Delivery: other-delivery',
      'Flowkit-Change: q2-change',
      'Flowkit-Boundary: wrong-boundary',
      `Owner-Authorization: owner:${'a'.repeat(64)}`,
    ].join('\n'));

    const projection = await readGitBoundaryProjection(repo, deliveryId);
    assert.equal(projection.checkpointCandidates[0]?.formalIdentityValid, false);
    assert.equal((await readGitBoundarySummaries(repo, deliveryId)).some((fact) => fact.kind === 'change-checkpoint'), false);
  });

  it('does not consume a same-named checkpoint owned by another Delivery', async () => {
    const repo = await initRepo();
    const currentDelivery = '20260806-01-deterministic-core';
    const otherDelivery = '20260807-01-other';
    await commit(repo, `chore(flowkit): start ${currentDelivery}`, 'start-current');
    await commit(repo, 'chore(flowkit): checkpoint q1-change', 'current-q1', formalBody(currentDelivery, 'q1-change'));
    await commit(repo, `chore(flowkit): start ${otherDelivery}`, 'start-other');
    await commit(repo, 'chore(flowkit): checkpoint q1-change', 'other-q1', formalBody(otherDelivery, 'q1-change'));

    const currentFacts = await readGitBoundarySummaries(repo, currentDelivery);
    const currentCheckpoints = currentFacts.filter((f) => f.kind === 'change-checkpoint');
    assert.equal(currentCheckpoints.length, 1);

    const otherFacts = await readGitBoundarySummaries(repo, otherDelivery);
    const otherCheckpoints = otherFacts.filter((f) => f.kind === 'change-checkpoint');
    assert.equal(otherCheckpoints.length, 1);
    assert.equal(otherCheckpoints[0]?.changeId, 'q1-change');
  });

  it('does not guess checkpoint ownership when the requested Delivery Start is absent', async () => {
    const repo = await initRepo();
    await commit(repo, 'chore(flowkit): checkpoint q2-change', 'q2', formalBody('missing-delivery', 'q2-change'));
    const facts = await readGitBoundarySummaries(repo, 'missing-delivery');
    assert.deepEqual(facts, []);
  });
});

describe('GitBoundaryFact classification', () => {
  it('returns only the three formal boundary kinds', async () => {
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    for (const f of facts) {
      assert.ok(f.kind === 'delivery-start' || f.kind === 'change-checkpoint' || f.kind === 'delivery-final');
    }
  });
});
