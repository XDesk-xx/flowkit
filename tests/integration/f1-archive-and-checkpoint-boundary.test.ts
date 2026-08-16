import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { ownerDecisionRefFor } from '../../src/domain/owner-provenance.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import { next } from '../../src/policy/next.js';
import { createTempDir } from '../fixtures/helpers.js';

const exec = promisify(execFile);

interface Fixture {
  readonly root: string;
  readonly deliveryId: string;
  readonly changeId: string;
  readonly nextChangeId: string;
}

async function initFixture(deliveryId = '20990401-01-f1', changeId = 'archive-and-checkpoint-boundary'): Promise<Fixture> {
  const root = await createTempDir();
  const nextChangeId = 'change-cli-end-to-end-and-performance';
  await exec('git', ['init'], { cwd: root });
  await exec('git', ['config', 'user.email', 'flowkit@example.test'], { cwd: root });
  await exec('git', ['config', 'user.name', 'Flowkit Test'], { cwd: root });
  await writeManifest(root, deliveryId, changeId, nextChangeId);
  await writeArchiveRun(root, deliveryId, changeId);
  await exec('git', ['add', '.'], { cwd: root });
  await exec('git', ['commit', '-m', `chore(flowkit): start ${deliveryId}`], { cwd: root });
  return { root, deliveryId, changeId, nextChangeId };
}

async function writeManifest(
  root: string,
  deliveryId: string,
  changeId: string,
  nextChangeId: string,
  owner?: { ref: string; sourceRef: string; changeId?: string },
): Promise<void> {
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: F1',
    `    id: ${changeId}`,
    '    state: completed',
    '    architectureImpact: false',
    '    required: true',
    '    dependsOn: []',
    '  - key: G1',
    `    id: ${nextChangeId}`,
    '    state: planned',
    '    architectureImpact: false',
    '    required: true',
    `    dependsOn: [${changeId}]`,
    ...(owner === undefined ? [] : [
      'ownerDecisions:',
      `  - ref: "${owner.ref}"`,
      '    decision: "authorize-checkpoint"',
      `    deliveryId: "${deliveryId}"`,
      `    changeId: "${owner.changeId ?? changeId}"`,
      `    sourceRef: "${owner.sourceRef}"`,
    ]),
    '',
  ].join('\n'), 'utf8');
}

async function writeArchiveRun(root: string, deliveryId: string, changeId: string): Promise<void> {
  const runId = '20990401-001-archive';
  const dir = join(root, '.flowkit', 'runs', deliveryId, changeId, runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'action.md'), '# Archive\n', 'utf8');
  await writeFile(join(dir, 'context.json'), `${JSON.stringify({
    schemaVersion: 2,
    runId,
    deliveryId,
    changeKey: 'F1',
    changeId,
    action: 'archive',
    role: 'author',
    ownerAuthorization: 'explicit',
    runPath: `.flowkit/runs/${deliveryId}/${changeId}/${runId}/`,
  }, null, 2)}\n`, 'utf8');
  await writeFile(join(dir, 'result.json'), `${JSON.stringify({
    runStatus: 'completed',
    actionResult: { action: 'archive', executionStatus: 'completed', summary: 'archived' },
  }, null, 2)}\n`, 'utf8');
}

async function snapshot(f: Fixture) {
  return readFormalFactSnapshot({
    repoRoot: f.root,
    deliveryId: f.deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
}

async function checkpoint(
  f: Fixture,
  ownerRef: string,
  options: { delivery?: string; change?: string; boundary?: string; includeOwner?: boolean; subjectChange?: string } = {},
): Promise<void> {
  await writeFile(join(f.root, 'checkpoint.txt'), `${Math.random()}\n`, 'utf8');
  await exec('git', ['add', '.'], { cwd: f.root });
  const subjectChange = options.subjectChange ?? f.changeId;
  const body = [
    `Flowkit-Delivery: ${options.delivery ?? f.deliveryId}`,
    `Flowkit-Change: ${options.change ?? f.changeId}`,
    `Flowkit-Boundary: ${options.boundary ?? 'change-checkpoint'}`,
    ...(options.includeOwner === false ? [] : [`Owner-Authorization: ${ownerRef}`]),
  ].join('\n');
  await exec('git', ['commit', '-m', `chore(flowkit): checkpoint ${subjectChange}`, '-m', body], { cwd: f.root });
}

function ownerTuple(f: Fixture, sourceRef = 'owner:test:f1-integration') {
  return {
    sourceRef,
    ref: ownerDecisionRefFor({ decision: 'authorize-checkpoint', deliveryId: f.deliveryId, changeId: f.changeId, sourceRef }),
  };
}

async function assertStillCheckpointGate(f: Fixture): Promise<void> {
  const state = await snapshot(f);
  assert.equal(state.gitBoundaries.some((fact) => fact.kind === 'change-checkpoint' && fact.changeId === f.changeId), false);
  const policy = next(state);
  assert.equal(policy.kind, 'owner-decision');
  if (policy.kind === 'owner-decision') assert.equal(policy.decision, 'authorize-checkpoint');
}

describe('F1 archive → Owner checkpoint → strict Git boundary lifecycle', () => {
  it('accepts authorization-before-checkpoint and allows successor progression', async () => {
    const f = await initFixture();
    try {
      const owner = ownerTuple(f);
      await writeManifest(f.root, f.deliveryId, f.changeId, f.nextChangeId, owner);
      await checkpoint(f, owner.ref);
      const state = await snapshot(f);
      assert.equal(state.gitBoundaries.some((fact) => fact.kind === 'change-checkpoint' && fact.changeId === f.changeId), true);
      const policy = next(state);
      assert.equal(policy.kind, 'owner-decision');
      if (policy.kind === 'owner-decision') {
        assert.equal(policy.decision, 'activate-change');
        assert.deepEqual(policy.context.eligibleChangeKeys, ['G1']);
      }
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  for (const scenario of [
    { name: 'subject-only', body: false },
    { name: 'wrong Delivery', options: { delivery: 'other-delivery' } },
    { name: 'wrong Change', options: { change: 'other-change' } },
    { name: 'wrong Boundary', options: { boundary: 'delivery-final' } },
    { name: 'missing Owner provenance', options: { includeOwner: false } },
  ] as const) {
    it(`fails closed for ${scenario.name}`, async () => {
      const f = await initFixture();
      try {
        const owner = ownerTuple(f);
        await writeManifest(f.root, f.deliveryId, f.changeId, f.nextChangeId, owner);
        if ('body' in scenario) {
          await writeFile(join(f.root, 'checkpoint.txt'), 'subject-only\n', 'utf8');
          await exec('git', ['add', '.'], { cwd: f.root });
          await exec('git', ['commit', '-m', `chore(flowkit): checkpoint ${f.changeId}`], { cwd: f.root });
        } else {
          await checkpoint(f, owner.ref, scenario.options);
        }
        await assertStillCheckpointGate(f);
      } finally { await rm(f.root, { recursive: true, force: true }); }
    });
  }

  it('fails closed for mismatched Owner provenance', async () => {
    const f = await initFixture();
    try {
      const owner = ownerTuple(f);
      await writeManifest(f.root, f.deliveryId, f.changeId, f.nextChangeId, owner);
      await checkpoint(f, `owner:${'f'.repeat(64)}`);
      await assertStillCheckpointGate(f);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it('does not retroactively admit checkpoint-first then authorization-later', async () => {
    const f = await initFixture();
    try {
      const owner = ownerTuple(f, 'owner:test:f1-later');
      await checkpoint(f, owner.ref);
      await writeManifest(f.root, f.deliveryId, f.changeId, f.nextChangeId, owner);
      await exec('git', ['add', '.'], { cwd: f.root });
      await exec('git', ['commit', '-m', 'test: record later owner authorization'], { cwd: f.root });
      const state = await snapshot(f);
      assert.equal(state.ownerAuthorizations.some((fact) => fact.ref === owner.ref), true);
      await assertStillCheckpointGate(f);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it('keeps pre-E2 checkpoints bounded-readable when a strict E2 anchor exists', async () => {
    const deliveryId = '20260810-01-change-execution-loop';
    const legacyChange = 'change-verification-selection-and-change-set';
    const anchorChange = 'change-verification-generalization-and-lean-run-normalization';
    const f = await initFixture(deliveryId, legacyChange);
    try {
      // A subject-only historical checkpoint precedes the strict E2 anchor.
      await writeFile(join(f.root, 'legacy.txt'), 'legacy\n', 'utf8');
      await exec('git', ['add', '.'], { cwd: f.root });
      await exec('git', ['commit', '-m', `chore(flowkit): checkpoint ${legacyChange}`], { cwd: f.root });

      const sourceRef = 'owner:test:e2-anchor';
      const ownerRef = ownerDecisionRefFor({ decision: 'authorize-checkpoint', deliveryId, changeId: anchorChange, sourceRef });
      await writeManifest(f.root, deliveryId, anchorChange, f.nextChangeId, { ref: ownerRef, sourceRef, changeId: anchorChange });
      await checkpoint({ ...f, changeId: anchorChange }, ownerRef);

      const state = await readFormalFactSnapshot({
        repoRoot: f.root,
        deliveryId,
        runsPathPrefix: '.flowkit/runs',
        openspecChangesPath: 'openspec/changes',
        manifestPathPrefix: 'openspec/delivery-groups',
      });
      assert.equal(state.gitBoundaries.some((fact) => fact.kind === 'change-checkpoint' && fact.changeId === legacyChange), true);
      assert.equal(state.gitBoundaries.some((fact) => fact.kind === 'change-checkpoint' && fact.changeId === anchorChange), true);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
});
