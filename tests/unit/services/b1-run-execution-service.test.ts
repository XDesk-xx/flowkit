import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ACTION_DEFINITIONS, CHANGE_ACTIONS } from '../../../src/domain/actions.js';
import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
import { next } from '../../../src/policy/next.js';
import {
  admitActionResult,
  inspectPreparedRun,
  prepareActionExecution,
} from '../../../src/services/b1-run-execution-service.js';
import { recordOwnerDecision } from '../../../src/services/a1-write-service.js';
import { runCli } from '../../../src/cli/main.js';
import { FlowkitError } from '../../../src/shared/errors.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function freshActiveFixture() {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20990201-01-b1';
  const changeId = 'lean-run-fixture';
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes', changeId), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: B1',
    `    id: ${changeId}`,
    '    goal: "Lean Run fixture"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
    '    architectureImpact: false',
    '    outputs: []',
    '',
  ].join('\n'), 'utf8');
  await writeFile(
    join(root, 'openspec', 'changes', changeId, '.openspec.yaml'),
    'schema: spec-driven\ncreated: 2099-02-01\n',
    'utf8',
  );
  const now = () => new Date('2099-02-01T00:00:00Z');
  return { root, deliveryId, changeId, now };
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

async function completeExplore(root: string, deliveryId: string, changeId: string, now: () => Date) {
  const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(prepared.package.run.action, 'explore');
  await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n', 'utf8');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: prepared.package,
    result: { executionStatus: 'completed', summary: 'explored' },
  });
  return prepared;
}

async function advanceToApplyReady(root: string, deliveryId: string, changeId: string, now: () => Date) {
  await completeExplore(root, deliveryId, changeId, now);

  const reviewExplore = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(reviewExplore.package.run.action, 'review-explore');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: reviewExplore.package,
    result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] },
  });

  const propose = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(propose.package.run.action, 'propose');
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n', 'utf8');
  await writeFile(join(changeRoot, 'design.md'), '# Design\n', 'utf8');
  await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n', 'utf8');
  await mkdir(join(changeRoot, 'specs', 'cap-a'), { recursive: true });
  await writeFile(join(changeRoot, 'specs', 'cap-a', 'spec.md'), '## ADDED Requirements\n\n### Requirement: X\nX MUST work.\n\n#### Scenario: X\n- **WHEN** x\n- **THEN** y\n', 'utf8');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: propose.package,
    result: { executionStatus: 'completed', summary: 'proposed' },
  });

  const reviewPropose = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(reviewPropose.package.run.action, 'review-propose');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: reviewPropose.package,
    result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] },
  });

  const beforeOwner = await snapshot(root, deliveryId);
  assert.equal(next(beforeOwner).kind, 'owner-decision');
  await recordOwnerDecision(root, {
    decision: 'authorize-apply',
    changeId,
    sourceRef: 'owner:b1-test:authorize-apply',
  });
  assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'apply' });
}


async function advanceToArchiveReady(root: string, deliveryId: string, changeId: string, now: () => Date) {
  await advanceToApplyReady(root, deliveryId, changeId, now);
  const changeRoot = join(root, 'openspec', 'changes', changeId);

  const apply = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(apply.package.run.action, 'apply');
  await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] applied\n', 'utf8');
  await writeFile(
    join(changeRoot, 'verification.md'),
    '<!-- flowkit-change-verification-status: passed -->\n\n# Verification\n',
    'utf8',
  );
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: apply.package,
    result: { executionStatus: 'completed', summary: 'applied' },
  });

  const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(review.package.run.action, 'review-apply');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: review.package,
    result: {
      executionStatus: 'completed',
      summary: 'approved',
      reviewVerdict: 'approved',
      reviewFindings: [],
    },
  });

  await recordOwnerDecision(root, {
    decision: 'authorize-archive',
    changeId,
    sourceRef: 'owner:b1-test:authorize-archive',
  });
  assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'archive' });
}

async function markFixtureChangeCompleted(root: string, deliveryId: string, changeId: string) {
  const manifest = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const current = await readFile(manifest, 'utf8');
  const expected = [
    `    id: ${changeId}`,
    '    goal: "Lean Run fixture"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
  ].join('\n');
  const replacement = expected.replace('    state: active', '    state: completed');
  assert.ok(current.includes(expected));
  await writeFile(manifest, current.replace(expected, replacement), 'utf8');
}

describe('B1 fixed ActionDefinition catalog', () => {
  it('matches the complete 037 normative mapping and excludes Delivery behaviors', () => {
    assert.deepEqual(CHANGE_ACTIONS, [
      'explore', 'review-explore', 'revise-explore',
      'propose', 'review-propose', 'revise-propose',
      'apply', 'review-apply', 'revise-apply', 'archive',
    ]);
    const expected = {
      explore: ['author', 'investigate-change', 'explore-planning-only', 'current-explore-artifact-set'],
      'review-explore': ['reviewer', 'judge-explore', 'reviewer-result-only', 'review-verdict-findings'],
      'revise-explore': ['author', 'close-explore-author-findings', 'explore-planning-revision-only', 'current-explore-artifact-set'],
      propose: ['author', 'freeze-change-contract', 'proposal-bundle-only', 'current-proposal-bundle-set'],
      'review-propose': ['reviewer', 'judge-proposal', 'reviewer-result-only', 'review-verdict-findings'],
      'revise-propose': ['author', 'close-proposal-author-findings', 'proposal-bundle-revision-only', 'current-proposal-bundle-set'],
      apply: ['author', 'implement-approved-contract', 'approved-implementation-and-verification', 'implementation-candidate-and-authority-files'],
      'review-apply': ['reviewer', 'judge-implementation-and-verification', 'reviewer-result-only', 'review-verdict-findings-plus-verification-ref'],
      'revise-apply': ['author', 'close-apply-author-findings', 'implementation-and-verification-revision', 'revised-implementation-candidate'],
      archive: ['author', 'close-change', 'openspec-archive-and-change-completion', 'archive-operation-and-completed-state'],
    } as const;
    for (const action of CHANGE_ACTIONS) {
      const d = ACTION_DEFINITIONS[action];
      assert.equal(d.version, 1);
      assert.deepEqual([d.role, d.goalClass, d.mutationClass, d.outputClass], expected[action]);
      assert.equal(d.terminalContract.gitCheckpointOutputAllowed, false);
    }
    assert.equal('full-test' in ACTION_DEFINITIONS, false);
    assert.equal('delivery-finalize' in ACTION_DEFINITIONS, false);
  });
});

describe('B1 preparation and admission', () => {
  it('creates one Delivery-wide Run then resumes the same pending semantic input', async () => {
    const { root, deliveryId, now } = await freshActiveFixture();
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const second = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.resumed, false);
    assert.equal(second.resumed, true);
    assert.equal(second.package.run.runId, first.package.run.runId);
    assert.equal(second.package.run.semanticInputFingerprint, first.package.run.semanticInputFingerprint);
    assert.match(first.package.run.semanticInputFingerprint, /^[0-9a-f]{64}$/);
  });

  it('fails closed on contractRef version drift without publishing a second pending Run', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await writeFile(join(root, 'openspec', 'changes', changeId, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-02-02\n', 'utf8');
    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const s = await snapshot(root, deliveryId);
    assert.deepEqual(s.runs.filter((run) => run.status === 'pending').map((run) => run.runId), [first.package.run.runId]);
  });

  it('admits logical result after legitimate Action output mutation and Core derives artifact refs', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore exact bytes\n', 'utf8');
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: prepared.package,
      result: {
        executionStatus: 'completed',
        summary: 'done',
        // Runtime extra authority-shaped fields are deliberately not forwarded.
        producedResultRefs: [{ ref: 'forged' }],
      } as never,
    });
    const raw = JSON.parse(await readFile(join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json'), 'utf8'));
    assert.equal(raw.actionResult.producedResultRefs.length, 1);
    assert.equal(raw.actionResult.producedResultRefs[0].ref, `openspec/changes/${changeId}/explore.md`);
    assert.notEqual(raw.actionResult.producedResultRefs[0].ref, 'forged');
  });

  it('keeps blocked next while explicit review creates a new same-stage Reviewer generation', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await completeExplore(root, deliveryId, changeId, now);
    const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(review.package.run.action, 'review-explore');
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: review.package,
      result: {
        executionStatus: 'completed',
        summary: 'owner blocker',
        reviewVerdict: 'changes-requested',
        reviewFindings: [{
          id: 'B1-T-OWNER',
          severity: 'blocking',
          title: 'Owner fact required',
          problem: 'Owner fact is not available yet.',
          blockingAuthority: 'owner',
        }],
      },
    });
    const blocked = next(await snapshot(root, deliveryId));
    assert.equal(blocked.kind, 'blocked');
    const direct = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'review', now });
    assert.equal(direct.package.run.action, 'review-explore');
    assert.equal(direct.package.run.role, 'reviewer');
    assert.notEqual(direct.package.run.runId, review.package.run.runId);
    assert.match(direct.package.run.runId, /-003-review-explore$/);
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'review', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, direct.package.run.runId);
  });

  it('failed execution retries as a new Run/NNN without provider-session identity', async () => {
    const { root, deliveryId, now } = await freshActiveFixture();
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: first.package,
      result: { failureDiagnosis: 'simulated failure' },
    });
    const retry = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(retry.resumed, false);
    assert.notEqual(retry.package.run.runId, first.package.run.runId);
    assert.match(retry.package.run.runId, /-002-explore$/);
    assert.equal('providerSession' in retry.package.run, false);
  });

  it('Apply package carries exact Owner ref and remains Change-only/minimal', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const apply = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(apply.package.run.action, 'apply');
    assert.equal(apply.package.ownerAuthorizationRefs.length, 1);
    assert.equal(apply.package.ownerAuthorizationRefs[0]?.decision, 'authorize-apply');
    assert.equal(apply.package.ownerAuthorizationRefs[0]?.changeId, changeId);
    assert.ok(apply.package.contractRefs.every((ref) => /^[0-9a-f]{64}$/.test(ref.versionFingerprint)));
    const serialized = JSON.stringify(apply.package);
    assert.doesNotMatch(serialized, /provider|transcript|stdout|git history/i);
  });
  it('rejects a tampered contractRef even when caller preserves the old fingerprint', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const forged = {
      ...structuredClone(prepared.package),
      contractRefs: prepared.package.contractRefs.map((ref, index) =>
        index === 0 ? { ...ref, versionFingerprint: 'f'.repeat(64) } : ref
      ),
    };
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n', 'utf8');
    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: forged,
        result: { executionStatus: 'completed', summary: 'forged' },
      }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const resultPath = join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json');
    await assert.rejects(readFile(resultPath, 'utf8'));
  });

  it('rejects tampered authority identity outside contractRefs before terminal publication', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const forged = {
      ...structuredClone(prepared.package),
      ownerAuthorizationRefs: prepared.package.ownerAuthorizationRefs.map((ref, index) =>
        index === 0 ? { ...ref, sourceRef: `${ref.sourceRef}:forged` } : ref
      ),
    };
    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: forged,
        result: { executionStatus: 'completed', summary: 'forged owner identity' },
      }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const resultPath = join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json');
    await assert.rejects(readFile(resultPath, 'utf8'));
  });


  it('still fails closed when immutable approved proposal content drifts during pending Apply', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'apply');
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal externally drifted\n', 'utf8');
    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const pending = (await snapshot(root, deliveryId)).runs.filter((run) => run.status === 'pending');
    assert.deepEqual(pending.map((run) => run.runId), [first.package.run.runId]);
  });

  it('resumes the same pending Apply after Action-owned tasks and verification progress', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'apply');
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] implementation progress\n', 'utf8');
    await writeFile(
      join(changeRoot, 'verification.md'),
      '<!-- flowkit-change-verification-status: passed -->\n\n# Verification\n',
      'utf8',
    );
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);
    assert.equal(resumed.package.run.semanticInputFingerprint, first.package.run.semanticInputFingerprint);
    assert.deepEqual(resumed.package.contractRefs, first.package.contractRefs);
    assert.equal(resumed.package.verificationView, undefined);
  });

  it('resumes the same pending revise-apply after its own tasks and verification mutations', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const apply = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] applied\n', 'utf8');
    await writeFile(
      join(changeRoot, 'verification.md'),
      '<!-- flowkit-change-verification-status: passed -->\n\n# Verification v1\n',
      'utf8',
    );
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: apply.package,
      result: { executionStatus: 'completed', summary: 'applied' },
    });

    const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(review.package.run.action, 'review-apply');
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: review.package,
      result: {
        executionStatus: 'completed',
        summary: 'changes requested',
        reviewVerdict: 'changes-requested',
        reviewFindings: [{
          id: 'B1-T-APPLY',
          severity: 'blocking',
          title: 'Author fix required',
          problem: 'fixture',
          requiredChange: 'Fix the fixture implementation.',
          blockingAuthority: 'author',
        }],
      },
    });

    const revise = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(revise.package.run.action, 'revise-apply');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] revised\n', 'utf8');
    await writeFile(
      join(changeRoot, 'verification.md'),
      '<!-- flowkit-change-verification-status: passed -->\n\n# Verification v2\n',
      'utf8',
    );
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, revise.package.run.runId);
    assert.deepEqual(resumed.package.contractRefs, revise.package.contractRefs);
    assert.deepEqual(resumed.package.verificationView, revise.package.verificationView);
  });


  it('fails closed when pending review-explore target bytes drift outside Reviewer mutation boundary', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await completeExplore(root, deliveryId, changeId, now);
    const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(review.package.run.action, 'review-explore');

    await writeFile(
      join(root, 'openspec', 'changes', changeId, 'explore.md'),
      '# Explore externally drifted after review entry\n',
      'utf8',
    );
    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const pending = (await snapshot(root, deliveryId)).runs.filter((run) => run.status === 'pending');
    assert.deepEqual(pending.map((run) => run.runId), [review.package.run.runId]);
  });

  it('fails closed when pending review-propose target bytes drift outside Reviewer mutation boundary', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await completeExplore(root, deliveryId, changeId, now);

    const reviewExplore = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: reviewExplore.package,
      result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] },
    });

    const propose = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n', 'utf8');
    await writeFile(join(changeRoot, 'design.md'), '# Design\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n', 'utf8');
    await mkdir(join(changeRoot, 'specs', 'cap-a'), { recursive: true });
    await writeFile(
      join(changeRoot, 'specs', 'cap-a', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: X\nX MUST work.\n\n#### Scenario: X\n- **WHEN** x\n- **THEN** y\n',
      'utf8',
    );
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: propose.package,
      result: { executionStatus: 'completed', summary: 'proposed' },
    });

    const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(review.package.run.action, 'review-propose');
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal externally drifted\n', 'utf8');

    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const pending = (await snapshot(root, deliveryId)).runs.filter((run) => run.status === 'pending');
    assert.deepEqual(pending.map((run) => run.runId), [review.package.run.runId]);
  });

  it('resumes the exact pending archive after Action-owned OpenSpec relocation', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);

    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'archive');
    const activeRoot = join(root, 'openspec', 'changes', changeId);
    const archivedRoot = join(root, 'openspec', 'changes', 'archive', `2099-02-01-${changeId}`);
    await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true });
    await rename(activeRoot, archivedRoot);

    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);
    assert.equal(resumed.package.run.semanticInputFingerprint, first.package.run.semanticInputFingerprint);
  });

  it('resumes the exact pending archive after Action-owned Change completed progress', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);

    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'archive');
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);
  });

  it('does not create a new archive Run after completion when no pending archive identity exists', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'RUN_PREPARATION_NOT_ALLOWED',
    );
    const pendingArchive = (await snapshot(root, deliveryId)).runs.filter(
      (run) => run.status === 'pending' && run.action === 'archive',
    );
    assert.deepEqual(pendingArchive, []);
  });

  it('admits terminal result for the exact persisted pending archive after Change completed progress', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'archive');

    const activeRoot = join(root, 'openspec', 'changes', changeId);
    const archivedRoot = join(root, 'openspec', 'changes', 'archive', `2099-02-01-${changeId}`);
    await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true });
    await rename(activeRoot, archivedRoot);
    await markFixtureChangeCompleted(root, deliveryId, changeId);
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);

    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: resumed.package,
      result: { executionStatus: 'completed', summary: 'archive completed' },
    });
    const resultPath = join(root, '.flowkit', 'runs', deliveryId, changeId, first.package.run.runId, 'result.json');
    const terminal = JSON.parse(await readFile(resultPath, 'utf8')) as { runStatus: string };
    assert.equal(terminal.runStatus, 'completed');
  });

  it('rejects fabricated completed archive admission when the persisted pending identity is gone', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(prepared.package.run.action, 'archive');
    const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId);
    await rm(runDir, { recursive: true, force: true });
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: prepared.package,
        result: { executionStatus: 'completed', summary: 'fabricated archive' },
      }),
    );
    assert.equal((await inspectPreparedRun(root, deliveryId)).status, 'none');
  });

  it('keeps non-archive terminal admission bound to the active Change', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const apply = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(apply.package.run.action, 'apply');
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: apply.package,
        result: { executionStatus: 'completed', summary: 'must reject' },
      }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
  });

  it('projects the same persisted pending archive through inspect/status/doctor/resume-context after completion', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    const inspection = await inspectPreparedRun(root, deliveryId);
    assert.deepEqual(inspection, {
      runId: prepared.package.run.runId,
      action: 'archive',
      role: 'author',
      status: 'resumable',
    });

    for (const command of ['status', 'doctor', 'resume-context'] as const) {
      const result = await runCli({ argv: [command], cwd: root });
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, new RegExp(`pending-run: ${prepared.package.run.runId}`));
      assert.match(result.stdout, /pending-action: archive/);
      assert.match(result.stdout, /pending-role: author/);
      assert.match(result.stdout, /pending-resume: resumable/);
    }
  });

  it('keeps completed diagnostics at none when no pending archive exists', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    assert.deepEqual(await inspectPreparedRun(root, deliveryId), { status: 'none' });
    for (const command of ['status', 'doctor', 'resume-context'] as const) {
      const result = await runCli({ argv: [command], cwd: root });
      assert.equal(result.exitCode, 0);
      assert.doesNotMatch(result.stdout, /pending-run:/);
    }
  });


});
