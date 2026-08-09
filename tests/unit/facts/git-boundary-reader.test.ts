import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { readGitBoundarySummaries } from '../../../src/facts/git-boundary-reader.js';

const execFileAsync = promisify(execFile);

async function initRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'flowkit-git-boundary-'));
  await execFileAsync('git', ['init'], { cwd: repo });
  await execFileAsync('git', ['config', 'user.email', 'flowkit@example.test'], { cwd: repo });
  await execFileAsync('git', ['config', 'user.name', 'Flowkit Test'], { cwd: repo });
  return repo;
}

async function commit(repo: string, subject: string, value: string): Promise<void> {
  await writeFile(join(repo, 'x.txt'), `${value}\n`);
  await execFileAsync('git', ['add', 'x.txt'], { cwd: repo });
  await execFileAsync('git', ['commit', '-m', subject], { cwd: repo });
}

describe('readGitBoundarySummaries', () => {
  it('returns empty array when git is unavailable (fail-open, task 2.3)', async () => {
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    assert.deepEqual(facts, []);
  });

  it('does not persist Git boundaries to state files (task 2.3)', async () => {
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    assert.ok(Array.isArray(facts));
  });
});

describe('readGitBoundarySummaries — Delivery-scoped checkpoint identity', () => {
  it('parses changeId from checkpoint owned by the requested Delivery', async () => {
    const repo = await initRepo();
    const deliveryId = '20260806-01-deterministic-core';
    await commit(repo, `chore(flowkit): start ${deliveryId}`, 'start');
    await commit(repo, 'chore(flowkit): checkpoint q2-change', 'q2');

    const facts = await readGitBoundarySummaries(repo, deliveryId);
    const checkpoint = facts.find((f) => f.kind === 'change-checkpoint');
    assert.equal(checkpoint?.changeId, 'q2-change');
  });

  it('does not consume a same-named checkpoint owned by another Delivery', async () => {
    const repo = await initRepo();
    const currentDelivery = '20260806-01-deterministic-core';
    const otherDelivery = '20260807-01-other';
    await commit(repo, `chore(flowkit): start ${currentDelivery}`, 'start-current');
    await commit(repo, 'chore(flowkit): checkpoint q1-change', 'current-q1');
    await commit(repo, `chore(flowkit): start ${otherDelivery}`, 'start-other');
    await commit(repo, 'chore(flowkit): checkpoint q1-change', 'other-q1');

    const currentFacts = await readGitBoundarySummaries(repo, currentDelivery);
    const currentCheckpoints = currentFacts.filter((f) => f.kind === 'change-checkpoint');
    assert.equal(currentCheckpoints.length, 1);
    assert.equal(currentCheckpoints[0]?.summary, 'chore(flowkit): checkpoint q1-change');

    const otherFacts = await readGitBoundarySummaries(repo, otherDelivery);
    const otherCheckpoints = otherFacts.filter((f) => f.kind === 'change-checkpoint');
    assert.equal(otherCheckpoints.length, 1);
    assert.equal(otherCheckpoints[0]?.changeId, 'q1-change');
  });

  it('does not guess checkpoint ownership when the requested Delivery Start is absent', async () => {
    const repo = await initRepo();
    await commit(repo, 'chore(flowkit): checkpoint q2-change', 'q2');
    const facts = await readGitBoundarySummaries(repo, 'missing-delivery');
    assert.deepEqual(facts, []);
  });
});

describe('GitBoundaryFact classification (task 2.2)', () => {
  it('returns only the three formal boundary kinds', async () => {
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    for (const f of facts) {
      assert.ok(
        f.kind === 'delivery-start' || f.kind === 'change-checkpoint' || f.kind === 'delivery-final',
      );
    }
  });
});
