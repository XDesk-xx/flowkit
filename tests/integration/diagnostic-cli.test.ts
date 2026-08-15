import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createTempDir } from '../fixtures/helpers.js';
import { runCli } from '../../src/cli/main.js';

let roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function repoFixture(options: { activeChange?: boolean; verification?: string } = {}): Promise<string> {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20260806-01-cli';
  await mkdir(join(root, '.flowkit', 'runs', deliveryId), { recursive: true });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes', 'diagnostic-cli', 'specs', 'cap'), { recursive: true });
  await writeFile(
    join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`),
    [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: E1',
      '    id: diagnostic-cli',
      `    state: ${options.activeChange === false ? 'planned' : 'active'}`,
      '    architectureImpact: false',
      '    required: true',
      '    dependsOn: []',
    ].join('\n'),
  );
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'explore.md'), '# Explore\n');
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'proposal.md'), '# Proposal\n');
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'design.md'), '# Design\n');
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'tasks.md'), '# Tasks\n');
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'specs', 'cap', 'spec.md'), '# Spec\n');
  if (options.verification !== undefined) {
    await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'verification.md'), options.verification);
  }
  return root;
}


async function writeLegacyRun(
  root: string,
  runId: string,
  action: 'explore' | 'apply' | 'archive',
  status?: 'completed',
): Promise<void> {
  const deliveryId = '20260806-01-cli';
  const dir = join(root, '.flowkit', 'runs', deliveryId, 'diagnostic-cli', runId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'context.json'),
    JSON.stringify({
      schemaVersion: 1,
      runId,
      deliveryId,
      changeId: 'diagnostic-cli',
      action,
      role: 'author',
    }),
  );
  if (status !== undefined) {
    await writeFile(join(dir, 'result.json'), JSON.stringify({ status }));
  }
}

describe('diagnostic CLI process surface', () => {
  it('supports four commands from a nested directory with stable output', async () => {
    const root = await repoFixture();
    const nested = join(root, 'nested');
    await mkdir(nested);
    for (const command of ['status', 'next', 'doctor', 'resume-context']) {
      const first = await runCli({ argv: [command], cwd: nested });
      const second = await runCli({ argv: [command], cwd: nested });
      assert.equal(first.exitCode, 0, `${command}: ${first.stderr}`);
      assert.equal(first.stdout, second.stdout);
      assert.equal(first.stderr, '');
    }
  });

  it('returns exit 1 for a Reader conflict and keeps next blocked as exit 0', async () => {
    const root = await repoFixture({ verification: 'Overall: passed\n' });
    const doctor = await runCli({ argv: ['doctor'], cwd: root });
    assert.equal(doctor.exitCode, 1);
    assert.match(doctor.stdout, /reader-conflict:change-verification-status/);
    const nextResult = await runCli({ argv: ['next'], cwd: root });
    assert.equal(nextResult.exitCode, 0);
    assert.match(nextResult.stdout, /kind: blocked\nreason: formal-fact-conflict/);
  });

  it('treats no active Change as a normal Delivery-level view', async () => {
    const root = await repoFixture({ activeChange: false });
    for (const command of ['status', 'next', 'doctor', 'resume-context']) {
      const result = await runCli({ argv: [command], cwd: root });
      assert.notEqual(result.exitCode, 2);
    }
    assert.match((await runCli({ argv: ['status'], cwd: root })).stdout, /stage: delivery-level/);
    const nextOutput = (await runCli({ argv: ['next'], cwd: root })).stdout;
    assert.match(nextOutput, /kind: owner-decision/);
    assert.match(nextOutput, /decision: activate-change/);
    assert.match(nextOutput, /context-change: E1/);
    assert.match(nextOutput, /context-eligible-changes: E1/);
  });


  it('uses frozen doctor exit codes for ambiguous/orphan/missing/policy-blocked fixtures', async () => {
    const ambiguous = await repoFixture();
    await writeLegacyRun(ambiguous, '20260806-001-explore', 'explore');
    await writeLegacyRun(ambiguous, '20260806-002-archive', 'archive');
    const ambiguousDoctor = await runCli({ argv: ['doctor'], cwd: ambiguous });
    assert.equal(ambiguousDoctor.exitCode, 1);
    assert.match(ambiguousDoctor.stdout, /ambiguous-pending-runs/);

    const orphan = await repoFixture();
    await writeLegacyRun(orphan, '20260806-001-archive', 'archive');
    const orphanDoctor = await runCli({ argv: ['doctor'], cwd: orphan });
    assert.equal(orphanDoctor.exitCode, 0);
    assert.match(orphanDoctor.stdout, /overall: warning/);
    assert.match(orphanDoctor.stdout, /orphan-pending-run/);

    const missing = await repoFixture();
    await unlink(join(missing, 'openspec', 'changes', 'diagnostic-cli', 'explore.md'));
    await writeLegacyRun(missing, '20260806-001-explore', 'explore', 'completed');
    const missingDoctor = await runCli({ argv: ['doctor'], cwd: missing });
    assert.equal(missingDoctor.exitCode, 1);
    assert.match(missingDoctor.stdout, /missing-formal-artifact/);

    const blocked = await repoFixture();
    await writeLegacyRun(blocked, '20260806-001-apply', 'apply', 'completed');
    const blockedDoctor = await runCli({ argv: ['doctor'], cwd: blocked });
    assert.equal(blockedDoctor.exitCode, 0);
    assert.match(blockedDoctor.stdout, /policy-blocked:verification-facts-unavailable/);
    assert.match(blockedDoctor.stdout, /overall: warning/);
  });

  it('returns exit 2 for usage/discovery failures and preserves --version', async () => {
    const root = await createTempDir();
    roots.push(root);
    const unknown = await runCli({ argv: ['unknown'], cwd: root });
    assert.equal(unknown.exitCode, 2);
    assert.equal((await runCli({ argv: ['status'], cwd: root })).exitCode, 2);
    assert.equal((await runCli({ argv: ['explore', '--result'], cwd: root })).exitCode, 2);
    assert.equal((await runCli({ argv: ['--version'], cwd: root })).stdout, '0.1.0\n');
  });
});
