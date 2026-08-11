import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
import { next } from '../../../src/policy/next.js';
import { atomicWriteFile } from '../../../src/shared/atomic-write.js';
import {
  activateChange,
  buildOwnerDecisionRecord,
  createChange,
  createDelivery,
  recordOwnerDecision,
} from '../../../src/services/a1-write-service.js';
import { runCli } from '../../../src/cli/main.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function freshRoot(): Promise<string> {
  const root = await createTempDir();
  roots.push(root);
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  return root;
}

async function writeManifest(root: string, deliveryId: string, body: string): Promise<string> {
  const path = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  await writeFile(path, body.endsWith('\n') ? body : `${body}\n`, 'utf8');
  return path;
}

async function convertFileToCrLf(path: string): Promise<void> {
  const lf = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  await writeFile(path, lf.replace(/\n/g, '\r\n'), 'utf8');
}

async function snapshot(root: string, deliveryId: string) {
  return readFormalFactSnapshot({
    repoRoot: root,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function writeApprovedProposeFixture(
  root: string,
  deliveryId: string,
  changeKey: string,
  changeId: string,
): Promise<void> {
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  await mkdir(changeRoot, { recursive: true });
  const artifacts = {
    'explore.md': '# Explore\n',
    'proposal.md': '# Proposal\n',
    'design.md': '# Design\n',
    'tasks.md': '# Tasks\n',
  } as const;
  await Promise.all(
    Object.entries(artifacts).map(([name, content]) => writeFile(join(changeRoot, name), content, 'utf8')),
  );

  const runsRoot = join(root, '.flowkit', 'runs', deliveryId, changeId);
  await mkdir(runsRoot, { recursive: true });

  async function writeTerminalRun(
    runId: string,
    context: Record<string, unknown>,
    result: Record<string, unknown>,
  ): Promise<string> {
    const runDir = join(runsRoot, runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'context.json'), `${JSON.stringify(context, null, 2)}\n`, 'utf8');
    await writeFile(join(runDir, 'action.md'), `# ${runId}\n`, 'utf8');
    const raw = `${JSON.stringify(result, null, 2)}\n`;
    await writeFile(join(runDir, 'result.json'), raw, 'utf8');
    return raw;
  }

  const exploreRunId = '20990109-001-explore';
  const exploreRaw = await writeTerminalRun(
    exploreRunId,
    {
      schemaVersion: 2,
      runId: exploreRunId,
      deliveryId,
      changeKey,
      changeId,
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'explicit',
      runPath: `.flowkit/runs/${deliveryId}/${changeId}/${exploreRunId}/`,
    },
    {
      runStatus: 'completed',
      actionResult: {
        action: 'explore',
        executionStatus: 'completed',
        summary: 'explore fixture',
        producedResultRefs: [
          {
            ref: `openspec/changes/${changeId}/explore.md`,
            versionFingerprint: sha256(artifacts['explore.md']),
            kind: 'produced-artifact',
          },
        ],
      },
    },
  );

  const reviewExploreRunId = '20990109-002-review-explore';
  const reviewExploreRaw = await writeTerminalRun(
    reviewExploreRunId,
    {
      schemaVersion: 2,
      runId: reviewExploreRunId,
      deliveryId,
      changeKey,
      changeId,
      action: 'review-explore',
      role: 'reviewer',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/${changeId}/${reviewExploreRunId}/`,
      reviewedRunId: exploreRunId,
      inputRef: {
        ref: `.flowkit/runs/${deliveryId}/${changeId}/${exploreRunId}/result.json`,
        versionFingerprint: sha256(exploreRaw),
        kind: 'run-result',
      },
    },
    {
      runStatus: 'completed',
      actionResult: {
        action: 'review-explore',
        executionStatus: 'completed',
        summary: 'approved',
      },
      reviewVerdict: 'approved',
      reviewFindings: [],
    },
  );

  const proposeRunId = '20990109-003-propose';
  const proposeRaw = await writeTerminalRun(
    proposeRunId,
    {
      schemaVersion: 2,
      runId: proposeRunId,
      deliveryId,
      changeKey,
      changeId,
      action: 'propose',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/${changeId}/${proposeRunId}/`,
      inputRef: {
        ref: `.flowkit/runs/${deliveryId}/${changeId}/${reviewExploreRunId}/result.json`,
        versionFingerprint: sha256(reviewExploreRaw),
        kind: 'run-result',
      },
    },
    {
      runStatus: 'completed',
      actionResult: {
        action: 'propose',
        executionStatus: 'completed',
        summary: 'proposal fixture',
        producedResultRefs: ['proposal.md', 'design.md', 'tasks.md'].map((name) => ({
          ref: `openspec/changes/${changeId}/${name}`,
          versionFingerprint: sha256(artifacts[name as keyof typeof artifacts]),
          kind: 'produced-artifact',
        })),
      },
    },
  );

  const reviewProposeRunId = '20990109-004-review-propose';
  await writeTerminalRun(
    reviewProposeRunId,
    {
      schemaVersion: 2,
      runId: reviewProposeRunId,
      deliveryId,
      changeKey,
      changeId,
      action: 'review-propose',
      role: 'reviewer',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/${changeId}/${reviewProposeRunId}/`,
      reviewedRunId: proposeRunId,
      inputRef: {
        ref: `.flowkit/runs/${deliveryId}/${changeId}/${proposeRunId}/result.json`,
        versionFingerprint: sha256(proposeRaw),
        kind: 'run-result',
      },
    },
    {
      runStatus: 'completed',
      actionResult: {
        action: 'review-propose',
        executionStatus: 'completed',
        summary: 'approved',
      },
      reviewVerdict: 'approved',
      reviewFindings: [],
    },
  );
}

describe('A1 owner provenance and architectureImpact', () => {
  it('reads the exact pre-A1 3-Delivery / 21-Change corpus as explicit legacy unknown without self-brick', async () => {
    const expectedCounts: Readonly<Record<string, number>> = {
      '20260805-01-product-baseline': 5,
      '20260806-01-deterministic-core': 8,
      '20260810-01-change-execution-loop': 8,
    };
    for (const [deliveryId, expectedCount] of Object.entries(expectedCounts)) {
      const s = await readFormalFactSnapshot({
        repoRoot: process.cwd(),
        deliveryId,
        runsPathPrefix: '.flowkit/runs',
        openspecChangesPath: 'openspec/changes',
        manifestPathPrefix: 'openspec/delivery-groups',
      });
      assert.equal(
        s.conflicts.filter((conflict) => conflict.dimension === 'change-architecture-impact').length,
        0,
        deliveryId,
      );
      assert.equal(s.changes.length, expectedCount, deliveryId);
      assert.ok(
        s.changes.every((change) => change.architectureImpact === 'pre-a1-legacy-missing'),
        deliveryId,
      );
    }
  });

  it('deterministic Owner record ref is stable and content-sensitive', () => {
    const a = buildOwnerDecisionRecord({
      decision: 'authorize-apply',
      deliveryId: 'D1',
      changeId: 'change-a',
      sourceRef: 'owner:message:1',
    });
    const b = buildOwnerDecisionRecord({
      decision: 'authorize-apply',
      deliveryId: 'D1',
      changeId: 'change-a',
      sourceRef: 'owner:message:1',
    });
    const c = buildOwnerDecisionRecord({
      decision: 'authorize-apply',
      deliveryId: 'D1',
      changeId: 'change-b',
      sourceRef: 'owner:message:1',
    });
    assert.equal(a.ref, b.ref);
    assert.notEqual(a.ref, c.ref);
    assert.match(a.ref, /^owner:[a-f0-9]{64}$/);
  });

  it('future Change missing architectureImpact fails closed', async () => {
    const root = await freshRoot();
    const deliveryId = '20990101-01-future';
    await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      '    id: future-change',
      '    state: active',
      '    required: true',
      '    dependsOn: []',
    ].join('\n'));
    const s = await snapshot(root, deliveryId);
    assert.ok(s.conflicts.some((conflict) => conflict.dimension === 'change-architecture-impact'));
    assert.equal(s.changes.length, 0);
  });

  it('future Change with boolean architectureImpact recovers exact value', async () => {
    const root = await freshRoot();
    const deliveryId = '20990101-02-future';
    await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      '    id: future-change',
      '    state: active',
      '    architectureImpact: true',
      '    required: true',
      '    dependsOn: []',
    ].join('\n'));
    const s = await snapshot(root, deliveryId);
    assert.equal(s.conflicts.filter((c) => c.dimension === 'change-architecture-impact').length, 0);
    assert.equal(s.changes[0]?.architectureImpact, true);
  });

  it('forged Owner record ref is rejected by Reader', async () => {
    const root = await freshRoot();
    const deliveryId = '20990101-03-future';
    await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      '    id: future-change',
      '    state: active',
      '    architectureImpact: false',
      '    required: true',
      '    dependsOn: []',
      'ownerDecisions:',
      '  - ref: "owner:deadbeef"',
      '    decision: "authorize-apply"',
      `    deliveryId: "${deliveryId}"`,
      '    changeId: "future-change"',
      '    sourceRef: "owner:message:1"',
    ].join('\n'));
    const s = await snapshot(root, deliveryId);
    assert.ok(s.conflicts.some((conflict) => conflict.dimension === 'owner-decision-ref'));
    assert.equal(s.ownerAuthorizations.length, 0);
  });
});

describe('A1 creation write-side', () => {
  it('createDelivery writes active Manifest, planned Changes, architectureImpact and provenance only', async () => {
    const root = await freshRoot();
    const result = await createDelivery(root, {
      id: '20990102-01-created',
      goal: 'Create a Delivery.',
      branch: 'delivery/20990102-01-created',
      scope: { included: ['creation'], excluded: ['git'] },
      acceptance: ['created'],
      architecture: { impact: true, archifyPlan: 'deferred' },
      fullTestPlan: ['typecheck'],
      changes: [
        {
          key: 'A1',
          id: 'first-change',
          goal: 'First.',
          required: true,
          dependsOn: [],
          outputs: ['src/first.ts'],
          architectureImpact: true,
        },
        {
          key: 'B1',
          id: 'second-change',
          goal: 'Second.',
          required: true,
          dependsOn: ['first-change'],
          outputs: ['src/second.ts'],
          architectureImpact: false,
        },
      ],
    }, 'owner:create-delivery', { now: () => new Date('2099-01-02T00:00:00Z') });

    assert.equal(result.state, 'active');
    const manifest = await readFile(join(root, 'openspec', 'delivery-groups', '20990102-01-created.yaml'), 'utf8');
    assert.match(manifest, /state: active/);
    assert.match(manifest, /architectureImpact: true/);
    assert.match(manifest, /architectureImpact: false/);
    assert.match(manifest, /decision: "create-delivery"/);
    assert.equal((await stat(join(root, '.flowkit', 'runs'))).isDirectory(), true);
    const s = await snapshot(root, '20990102-01-created');
    assert.equal(s.conflicts.length, 0);
    assert.equal(s.changes.map((c) => c.architectureImpact).join(','), 'true,false');
  });

  it('createChange appends planned Change and create provenance while preserving unknown section', async () => {
    const root = await freshRoot();
    const deliveryId = '20990103-01-active';
    const path = await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'createdAt: "2099-01-03"',
      'branch: "delivery/test"',
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      '    id: base-change',
      '    goal: "Base"',
      '    required: false',
      '    dependsOn: []',
      '    state: completed',
      '    architectureImpact: false',
      '    outputs: []',
      'customSection:',
      '  keep: "byte-for-byte"',
    ].join('\n'));
    const before = await readFile(path, 'utf8');
    const result = await createChange(root, {
      key: 'B1',
      id: 'new-change',
      goal: 'New',
      required: true,
      dependsOn: ['base-change'],
      outputs: ['src/new.ts'],
      architectureImpact: true,
    }, 'owner:create-change');

    assert.equal(result.state, 'planned');
    const after = await readFile(path, 'utf8');
    assert.match(after, /id: "new-change"/);
    assert.match(after, /architectureImpact: true/);
    assert.match(after, /decision: "create-change"/);
    assert.ok(after.includes('customSection:\n  keep: "byte-for-byte"\n'));
    assert.ok(before.includes('customSection:\n  keep: "byte-for-byte"\n'));
    const s = await snapshot(root, deliveryId);
    assert.equal(s.conflicts.length, 0);
    assert.equal(s.changes.find((c) => c.id === 'new-change')?.architectureImpact, true);
  });

  it('createChange accepts pure CRLF Manifest input and writes canonical LF while preserving unknown sections', async () => {
    const root = await freshRoot();
    const deliveryId = '20990103-02-crlf-create';
    const path = await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      '    id: base-change',
      '    goal: "Base"',
      '    required: false',
      '    dependsOn: []',
      '    state: completed',
      '    architectureImpact: false',
      '    outputs: []',
      'customSection:',
      '  keep: "yes"',
    ].join('\n'));
    await convertFileToCrLf(path);
    await createChange(root, {
      key: 'B1', id: 'crlf-change', goal: 'CRLF', required: true, dependsOn: ['base-change'],
      outputs: [], architectureImpact: false,
    }, 'owner:crlf-create');
    const bytes = await readFile(path, 'utf8');
    assert.equal(bytes.includes('\r'), false);
    assert.ok(bytes.endsWith('\n'));
    assert.match(bytes, /customSection:\n {2}keep: "yes"\n/);
    assert.match(bytes, /id: "crlf-change"/);
  });

  it('authorization-only Owner record rejects early gate and leaves Manifest byte-identical', async () => {
    const root = await freshRoot();
    const deliveryId = '20990104-01-active';
    const path = await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      '    id: active-change',
      '    goal: "Active"',
      '    required: true',
      '    dependsOn: []',
      '    state: active',
      '    architectureImpact: false',
      '    outputs: []',
    ].join('\n'));
    const before = await readFile(path, 'utf8');
    await assert.rejects(
      recordOwnerDecision(root, {
        decision: 'authorize-apply',
        changeId: 'active-change',
        sourceRef: 'owner:too-early',
      }),
      /current Policy is not requesting authorize-apply/,
    );
    assert.equal(await readFile(path, 'utf8'), before);
  });


  it('exact authorize-apply retry is idempotent after the first record closes the Policy gate', async () => {
    const root = await freshRoot();
    const deliveryId = '20990109-01-idempotent';
    const changeId = 'apply-ready-change';
    const path = await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      `    id: ${changeId}`,
      '    goal: "Apply-ready"',
      '    required: true',
      '    dependsOn: []',
      '    state: active',
      '    architectureImpact: false',
      '    outputs: []',
    ].join('\n'));
    await writeApprovedProposeFixture(root, deliveryId, 'A1', changeId);

    const before = await snapshot(root, deliveryId);
    assert.deepEqual(next(before), {
      kind: 'owner-decision',
      decision: 'authorize-apply',
      context: {
        detail: 'review-propose approved; apply awaits owner authorization',
      },
    });

    const tuple = {
      decision: 'authorize-apply',
      changeId,
      sourceRef: 'owner:authorize-apply:exact-retry',
    } as const;
    const first = await recordOwnerDecision(root, tuple);
    assert.equal(first.idempotent, false);

    const afterFirst = await snapshot(root, deliveryId);
    assert.deepEqual(next(afterFirst), { kind: 'action', action: 'apply' });
    const bytesAfterFirst = await readFile(path, 'utf8');

    const retry = await recordOwnerDecision(root, tuple);
    assert.equal(retry.ownerDecisionRef, first.ownerDecisionRef);
    assert.equal(retry.idempotent, true);
    assert.equal(await readFile(path, 'utf8'), bytesAfterFirst);
    assert.equal((bytesAfterFirst.match(/decision: "authorize-apply"/g) ?? []).length, 1);
  });
  it('owner record accepts pure CRLF input and canonicalizes successful mutation to LF', async () => {
    const root = await freshRoot();
    const deliveryId = '20990109-02-crlf-owner';
    const changeId = 'apply-ready-crlf';
    const path = await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      `    id: ${changeId}`,
      '    goal: "Apply-ready"',
      '    required: true',
      '    dependsOn: []',
      '    state: active',
      '    architectureImpact: false',
      '    outputs: []',
    ].join('\n'));
    await writeApprovedProposeFixture(root, deliveryId, 'A1', changeId);
    await convertFileToCrLf(path);
    await recordOwnerDecision(root, {
      decision: 'authorize-apply', changeId, sourceRef: 'owner:crlf-apply',
    });
    const bytes = await readFile(path, 'utf8');
    assert.equal(bytes.includes('\r'), false);
    assert.ok(bytes.endsWith('\n'));
    assert.match(bytes, /decision: "authorize-apply"/);
  });
});

describe('A1 activation', () => {
  async function activationRoot(): Promise<{ root: string; path: string; deliveryId: string }> {
    const root = await freshRoot();
    const deliveryId = '20990105-01-active';
    const path = await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: Q1',
      '    id: dependency',
      '    goal: "Dependency"',
      '    required: false',
      '    dependsOn: []',
      '    state: completed',
      '    architectureImpact: false',
      '    outputs: []',
      '  - key: A1',
      '    id: target',
      '    goal: "Target"',
      '    required: true',
      '    dependsOn:',
      '      - dependency',
      '    state: planned',
      '    architectureImpact: true',
      '    outputs: []',
    ].join('\n'));
    return { root, path, deliveryId };
  }

  it('activates by Change.id, records provenance, initializes only minimal OpenSpec metadata and creates no Run', async () => {
    const { root, path, deliveryId } = await activationRoot();
    const result = await activateChange(root, 'target', 'owner:activate', {
      now: () => new Date('2099-01-05T00:00:00Z'),
      specDeltaMode: 'required',
    });
    assert.equal(result.state, 'active');
    const manifest = await readFile(path, 'utf8');
    assert.match(manifest, /id: target[\s\S]*state: active/);
    assert.match(manifest, /decision: "activate-change"/);
    assert.match(manifest, /changeId: "target"/);
    assert.match(manifest, /architectureImpact: true/);
    const meta = await readFile(join(root, 'openspec', 'changes', 'target', '.openspec.yaml'), 'utf8');
    assert.equal(meta, 'schema: spec-driven\ncreated: 2099-01-05\n');
    const runsDir = join(root, '.flowkit', 'runs', deliveryId, 'target');
    await assert.rejects(stat(runsDir));
    const s = await snapshot(root, deliveryId);
    assert.equal(s.conflicts.length, 0);
    assert.equal(s.changes.find((c) => c.id === 'target')?.state, 'active');
  });


  it('writes skip_specs only for explicit future specDeltaMode=skip', async () => {
    const { root } = await activationRoot();
    await activateChange(root, 'target', 'owner:skip-activate', {
      now: () => new Date('2099-01-05T00:00:00Z'),
      specDeltaMode: 'skip',
    });
    assert.equal(
      await readFile(join(root, 'openspec', 'changes', 'target', '.openspec.yaml'), 'utf8'),
      'schema: spec-driven\ncreated: 2099-01-05\nskip_specs: true\n',
    );
  });

  it('rejects future activation missing specDeltaMode before metadata or manifest mutation', async () => {
    const { root, path } = await activationRoot();
    const before = await readFile(path, 'utf8');
    await assert.rejects(activateChange(root, 'target', 'owner:missing-mode'), /specDeltaMode=required\|skip/);
    assert.equal(await readFile(path, 'utf8'), before);
    await assert.rejects(stat(join(root, 'openspec', 'changes', 'target', '.openspec.yaml')));
  });

  it('activate accepts pure CRLF Manifest input and writes canonical LF', async () => {
    const { root, path } = await activationRoot();
    await convertFileToCrLf(path);
    await activateChange(root, 'target', 'owner:crlf-activate', {
      now: () => new Date('2099-01-05T00:00:00Z'),
      specDeltaMode: 'required',
    });
    const bytes = await readFile(path, 'utf8');
    assert.equal(bytes.includes('\r'), false);
    assert.ok(bytes.endsWith('\n'));
    assert.match(bytes, /id: target[\s\S]*state: active/);
    assert.match(bytes, /architectureImpact: true/);
  });

  it('activates an exact pre-A1 legacy Change without backfilling architectureImpact', async () => {
    const root = await freshRoot();
    const deliveryId = '20260810-01-change-execution-loop';
    const path = await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: B1',
      '    id: lean-run-and-action-package',
      '    goal: "Legacy target"',
      '    required: true',
      '    dependsOn: []',
      '    state: planned',
      '    outputs: []',
    ].join('\n'));

    const before = await snapshot(root, deliveryId);
    assert.equal(before.conflicts.length, 0);
    assert.equal(before.changes[0]?.architectureImpact, 'pre-a1-legacy-missing');

    await activateChange(root, 'lean-run-and-action-package', 'owner:legacy-activate', {
      now: () => new Date('2099-01-05T00:00:00Z'),
      specDeltaMode: 'required',
    });
    const manifest = await readFile(path, 'utf8');
    assert.doesNotMatch(manifest, /architectureImpact:/);
    assert.match(manifest, /id: lean-run-and-action-package[\s\S]*state: active/);
    const after = await snapshot(root, deliveryId);
    assert.equal(after.conflicts.length, 0);
    assert.equal(after.changes[0]?.architectureImpact, 'pre-a1-legacy-missing');
  });

  it('Manifest publish failure leaves only safe planned + exact metadata partial and retry succeeds', async () => {
    const { root, path } = await activationRoot();
    let calls = 0;
    const failingAtomic = async (targetPath: string, data: string): Promise<void> => {
      calls++;
      if (calls === 2) throw new Error('simulated manifest publish failure');
      await atomicWriteFile(targetPath, data);
    };
    await assert.rejects(
      activateChange(root, 'target', 'owner:activate', {
        now: () => new Date('2099-01-05T00:00:00Z'),
        specDeltaMode: 'required',
        atomicWrite: failingAtomic,
      }),
      /simulated manifest publish failure/,
    );
    assert.match(await readFile(path, 'utf8'), /id: target[\s\S]*state: planned/);
    assert.equal(
      await readFile(join(root, 'openspec', 'changes', 'target', '.openspec.yaml'), 'utf8'),
      'schema: spec-driven\ncreated: 2099-01-05\n',
    );

    await activateChange(root, 'target', 'owner:activate', {
      now: () => new Date('2099-01-06T00:00:00Z'),
      specDeltaMode: 'required',
    });
    assert.match(await readFile(path, 'utf8'), /id: target[\s\S]*state: active/);
  });
});

describe('A1 write CLI', () => {
  it('create delivery is a thin service wrapper and diagnostics remain separate', async () => {
    const root = await freshRoot();
    const inputPath = join(root, 'delivery.json');
    await writeFile(inputPath, JSON.stringify({
      id: '20990106-01-cli',
      goal: 'CLI create.',
      branch: 'delivery/20990106-01-cli',
      scope: { included: ['cli'], excluded: [] },
      acceptance: ['created'],
      architecture: { impact: false, archifyPlan: 'not-required' },
      fullTestPlan: ['typecheck'],
      changes: [{
        key: 'A1',
        id: 'cli-change',
        goal: 'CLI.',
        required: true,
        dependsOn: [],
        outputs: [],
        architectureImpact: false,
      }],
    }));

    const create = await runCli({
      argv: ['create', 'delivery', '--input', inputPath, '--source-ref', 'owner:cli'],
      cwd: root,
    });
    assert.equal(create.exitCode, 0, create.stderr);
    assert.match(create.stdout, /"deliveryId":"20990106-01-cli"/);
    const status = await runCli({ argv: ['status'], cwd: root });
    assert.equal(status.exitCode, 0);
    assert.match(status.stdout, /delivery: 20990106-01-cli/);
  });

  it('create change and activate commands are thin service wrappers', async () => {
    const root = await freshRoot();
    const deliveryId = '20990107-01-cli';
    await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: Q1',
      '    id: dependency',
      '    goal: "Dependency"',
      '    required: false',
      '    dependsOn: []',
      '    state: completed',
      '    architectureImpact: false',
      '    outputs: []',
    ].join('\n'));
    const inputPath = join(root, 'change.json');
    await writeFile(inputPath, JSON.stringify({
      key: 'A1',
      id: 'cli-created-change',
      goal: 'CLI created change.',
      required: true,
      dependsOn: ['dependency'],
      outputs: [],
      architectureImpact: true,
    }));

    const create = await runCli({
      argv: ['create', 'change', '--input', inputPath, '--source-ref', 'owner:cli-create-change'],
      cwd: root,
    });
    assert.equal(create.exitCode, 0, create.stderr);
    assert.match(create.stdout, /"changeId":"cli-created-change"/);

    const activate = await runCli({
      argv: ['activate', '--change', 'cli-created-change', '--source-ref', 'owner:cli-activate', '--spec-delta-mode', 'required'],
      cwd: root,
    });
    assert.equal(activate.exitCode, 0, activate.stderr);
    assert.match(activate.stdout, /"state":"active"/);
    const s = await snapshot(root, deliveryId);
    assert.equal(s.conflicts.length, 0);
    assert.equal(s.changes.find((change) => change.id === 'cli-created-change')?.state, 'active');
  });

  it('owner record command admits only the current exact Policy decision/target', async () => {
    const root = await freshRoot();
    const deliveryId = '20990108-01-cli';
    const path = await writeManifest(root, deliveryId, [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: A1',
      '    id: completed-change',
      '    goal: "Completed"',
      '    required: true',
      '    dependsOn: []',
      '    state: completed',
      '    architectureImpact: false',
      '    outputs: []',
    ].join('\n'));

    const record = await runCli({
      argv: ['owner', 'record', '--decision', 'authorize-checkpoint', '--change', 'completed-change', '--source-ref', 'owner:cli-checkpoint'],
      cwd: root,
    });
    assert.equal(record.exitCode, 0, record.stderr);
    assert.match(record.stdout, /"ownerDecisionRef":"owner:[a-f0-9]{64}"/);
    assert.match(await readFile(path, 'utf8'), /decision: "authorize-checkpoint"/);

    const stale = await runCli({
      argv: ['owner', 'record', '--decision', 'authorize-apply', '--change', 'completed-change', '--source-ref', 'owner:stale'],
      cwd: root,
    });
    assert.equal(stale.exitCode, 2);
    assert.match(stale.stderr, /current Policy is not requesting authorize-apply/);
  });
});
