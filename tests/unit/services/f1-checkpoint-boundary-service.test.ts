import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { prepareCheckpointBoundaryHandoff } from '../../../src/services/f1-checkpoint-boundary-service.js';

const exec = promisify(execFile);
const deliveryId = '20260817-01-delivery-execution-loop';
const changeId = 'sync-resume-and-single-action-agent-adapter';
const expectedOwnerRef = 'owner:0c1e44f8f15467b4fe05c7c1a81ee3e7970abe36b3b4595d1ea9c2fc08351636';
const eofTargets = [
  'openspec/specs/flowkit-change-verification-selection/spec.md',
  'openspec/specs/flowkit-diagnostic-cli/spec.md',
  'openspec/specs/flowkit-lean-run-and-action-package/spec.md',
  'openspec/specs/flowkit-sync-resume-and-single-action-agent-adapter/spec.md',
] as const;

async function g1PreCheckpointFixture(): Promise<{ root: string; base: string }> {
  const sourceRoot = process.cwd();
  const head = (await exec('git', [
    'log', '--format=%H', '--fixed-strings', '--grep=chore(flowkit): checkpoint sync-resume-and-single-action-agent-adapter', '-n', '1',
  ], { cwd: sourceRoot })).stdout.trim();
  assert.match(head, /^[0-9a-f]{40,64}$/, 'expected exact G1 checkpoint commit in repository history');
  const base = (await exec('git', ['rev-parse', `${head}^`], { cwd: sourceRoot })).stdout.trim();
  const root = await mkdtemp(join(tmpdir(), 'flowkit-h1-checkpoint-'));
  await exec('git', ['clone', '--quiet', '--no-local', sourceRoot, root]);
  await exec('git', ['reset', '--hard', base], { cwd: root });
  await exec('git', ['remote', 'remove', 'origin'], { cwd: root });
  const patch = (await exec('git', ['diff', '--binary', base, head], { cwd: sourceRoot, maxBuffer: 32 * 1024 * 1024 })).stdout;
  const patchPath = join(root, '.h1-g1.patch');
  await writeFile(patchPath, patch, 'utf8');
  await exec('git', ['apply', '--binary', patchPath], { cwd: root });
  await rm(patchPath, { force: true });
  for (const path of eofTargets) await appendFile(join(root, path), '\n', 'utf8');
  return { root, base };
}

async function gitState(root: string): Promise<{ status: string; head: string; log: string }> {
  return {
    status: (await exec('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root })).stdout,
    head: (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(),
    log: (await exec('git', ['log', '-1', '--format=%H%n%B'], { cwd: root })).stdout,
  };
}

async function removeG1CheckpointOwner(root: string): Promise<void> {
  const path = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const text = await readFile(path, 'utf8');
  const block = [
    `  - ref: "${expectedOwnerRef}"`,
    '    decision: "authorize-checkpoint"',
    `    deliveryId: "${deliveryId}"`,
    `    changeId: "${changeId}"`,
    '    sourceRef: "ref/flowkit-local-ai-handoff-g1-097-archive.md"',
    '',
  ].join('\n');
  assert.equal(text.includes(block), true, 'expected G1 checkpoint owner block');
  await writeFile(path, text.replace(block, ''), 'utf8');
}

describe('F1 checkpoint boundary handoff service', { concurrency: false }, () => {
  it('derives the exact G1-shaped read-only plan from repository/formal facts', async () => {
    const f = await g1PreCheckpointFixture();
    try {
      const before = await gitState(f.root);
      const handoff = await prepareCheckpointBoundaryHandoff(f.root, deliveryId);
      const after = await gitState(f.root);

      assert.equal(handoff.changeId, changeId);
      assert.equal(handoff.ownerAuthorizationRef, expectedOwnerRef);
      assert.equal(handoff.baseRevision, f.base);
      assert.equal(handoff.subject, `chore(flowkit): checkpoint ${changeId}`);
      assert.deepEqual(handoff.trailers, [
        `Flowkit-Delivery: ${deliveryId}`,
        `Flowkit-Change: ${changeId}`,
        'Flowkit-Boundary: change-checkpoint',
        `Owner-Authorization: ${expectedOwnerRef}`,
      ]);
      assert.equal(handoff.candidatePaths.length > 40, true);
      assert.deepEqual([...handoff.candidatePaths].sort(), handoff.candidatePaths);
      for (const path of eofTargets) assert.equal(handoff.candidatePaths.includes(path), true);
      assert.deepEqual(handoff.normalization.operations, eofTargets.map((path) => ({
        path,
        operations: ['collapse-redundant-eof-blank-lines', 'ensure-exactly-one-final-newline'],
      })));
      assert.deepEqual(handoff.preflight, ['git diff --check', 'git diff --cached --check']);
      assert.deepEqual(after, before, 'read-only handoff must not mutate worktree/index/history');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('fails closed when exact checkpoint Owner authority is absent', async () => {
    const f = await g1PreCheckpointFixture();
    try {
      await removeG1CheckpointOwner(f.root);
      await assert.rejects(
        () => prepareCheckpointBoundaryHandoff(f.root, deliveryId),
        /exactly one matching authorize-checkpoint Owner fact/,
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('fails closed on unrelated dirty paths', async () => {
    const f = await g1PreCheckpointFixture();
    try {
      await appendFile(join(f.root, 'README.md'), '\nunrelated\n', 'utf8');
      await assert.rejects(
        () => prepareCheckpointBoundaryHandoff(f.root, deliveryId),
        /outside the current Change\/formal-fact closure/,
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('fails closed on non-EOF hygiene instead of broad formatting', async () => {
    const f = await g1PreCheckpointFixture();
    try {
      await appendFile(join(f.root, eofTargets[0]), 'bad trailing spaces  \n', 'utf8');
      await assert.rejects(
        () => prepareCheckpointBoundaryHandoff(f.root, deliveryId),
        /trailing spaces\/tabs/,
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('requires an empty index and never hides staged bytes', async () => {
    const f = await g1PreCheckpointFixture();
    try {
      await exec('git', ['add', eofTargets[0]], { cwd: f.root });
      await assert.rejects(
        () => prepareCheckpointBoundaryHandoff(f.root, deliveryId),
        /requires an empty Git index/,
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
