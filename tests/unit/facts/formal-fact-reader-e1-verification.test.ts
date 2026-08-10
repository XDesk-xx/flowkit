import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createTempDir } from '../../fixtures/helpers.js';
import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
import { evaluateVerificationGate } from '../../../src/policy/verification-gate.js';

let roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function fixture(verification?: string): Promise<{ root: string; deliveryId: string }> {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20260806-01-test';
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
      '    state: active',
      '    required: true',
      '    dependsOn: []',
    ].join('\n'),
  );
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'explore.md'), '# Explore\n');
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'proposal.md'), '# Proposal\n');
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'design.md'), '# Design\n');
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'tasks.md'), '# Tasks\n');
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'specs', 'cap', 'spec.md'), '# Spec\n');
  if (verification !== undefined) {
    await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'verification.md'), verification);
  }
  return { root, deliveryId };
}

async function read(root: string, deliveryId: string) {
  return readFormalFactSnapshot({
    repoRoot: root,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
}

describe('E1 formal fact Verification projection', () => {
  it('projects explore/verification existence and a valid marker', async () => {
    const { root, deliveryId } = await fixture('<!-- flowkit-change-verification-status: passed -->\n');
    const snapshot = await read(root, deliveryId);
    assert.equal(snapshot.changeVerificationStatus, 'passed');
    assert.deepEqual(evaluateVerificationGate(snapshot), { kind: 'satisfied' });
    assert.equal(snapshot.conflicts.length, 0);
    assert.equal(snapshot.openSpecArtifacts.find((a) => a.kind === 'change-explore')?.exists, true);
    assert.equal(snapshot.openSpecArtifacts.find((a) => a.kind === 'change-verification')?.exists, true);
  });

  for (const status of ['not-run', 'passed', 'failed', 'not-applicable'] as const) {
    it(`projects ${status}`, async () => {
      const { root, deliveryId } = await fixture(`<!-- flowkit-change-verification-status: ${status} -->\n`);
      assert.equal((await read(root, deliveryId)).changeVerificationStatus, status);
    });
  }

  it('treats absent verification.md as unavailable without conflict', async () => {
    const { root, deliveryId } = await fixture();
    const snapshot = await read(root, deliveryId);
    assert.equal(snapshot.changeVerificationStatus, undefined);
    assert.equal(snapshot.openSpecArtifacts.find((a) => a.kind === 'change-verification')?.exists, false);
    assert.equal(snapshot.conflicts.some((c) => c.dimension === 'change-verification-status'), false);
  });

  for (const [name, content] of [
    ['missing marker', 'Overall: passed\n'],
    ['duplicate marker', '<!-- flowkit-change-verification-status: passed -->\n<!-- flowkit-change-verification-status: passed -->\n'],
    ['invalid marker', '<!-- flowkit-change-verification-status: green -->\n'],
  ] as const) {
    it(`fails closed for ${name} and never infers prose`, async () => {
      const { root, deliveryId } = await fixture(content);
      const snapshot = await read(root, deliveryId);
      assert.equal(snapshot.changeVerificationStatus, undefined);
      assert.equal(snapshot.conflicts.filter((c) => c.dimension === 'change-verification-status').length, 1);
    });
  }
});
