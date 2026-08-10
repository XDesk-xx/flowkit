/**
 * Q2 orchestration-authority lifecycle integration.
 *
 * These tests cover only current Action handoff and lightweight Run behavior.
 * Historical generation replay, supersession, revision-window and archive-path
 * replay are intentionally out of scope.
 */
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createRun, completeRun } from '../../src/persistence/run-persistence.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import { FlowkitError } from '../../src/shared/errors.js';

let root = '';

beforeEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = await mkdtemp(join(tmpdir(), 'flowkit-q2-orchestration-'));
});
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

function runsDir(): string { return join(root, '.flowkit', 'runs', 'D1'); }
function input(changeId: string, runId: string, action: Parameters<typeof createRun>[0]['action'], extra: Partial<Parameters<typeof createRun>[0]> = {}) {
  return {
    runId,
    deliveryId: 'D1',
    changeKey: 'Q2',
    changeId,
    action,
    role: action.startsWith('review-') ? ('reviewer' as const) : ('author' as const),
    ownerAuthorization: 'authorized',
    actionMd: `# ${action}\n`,
    deliveryRunsDir: runsDir(),
    runsPathPrefix: '.flowkit/runs',
    repoRoot: root,
    ...extra,
  };
}


function readSnapshot() {
  return readFormalFactSnapshot({
    repoRoot: root,
    deliveryId: 'D1',
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: '.flowkit/manifests',
  });
}
async function activeManifest(changeId: string): Promise<void> {
  const dir = join(root, '.flowkit', 'manifests');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'D1.yaml'), [
    'id: D1',
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: Q2',
    `    id: ${changeId}`,
    '    state: active',
    '    required: true',
    '    dependsOn: []',
  ].join('\n'));
}

async function writeExplore(changeId: string, text = '# Explore\n'): Promise<void> {
  const dir = join(root, 'openspec', 'changes', changeId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'explore.md'), text);
}
async function writeProposal(changeId: string, suffix = ''): Promise<void> {
  const dir = join(root, 'openspec', 'changes', changeId);
  await mkdir(join(dir, 'specs', 'cap'), { recursive: true });
  await writeFile(join(dir, 'proposal.md'), `# Proposal${suffix}\n`);
  await writeFile(join(dir, 'design.md'), `# Design${suffix}\n`);
  await writeFile(join(dir, 'tasks.md'), `# Tasks${suffix}\n- [ ] work\n`);
  await writeFile(join(dir, 'specs', 'cap', 'spec.md'), `# Spec${suffix}\n`);
}

async function approvedExplore(changeId: string): Promise<void> {
  await writeExplore(changeId);
  const e = await createRun(input(changeId, '20260806-001-explore', 'explore'));
  await completeRun(e, { executionStatus: 'completed', summary: 'explore' });
  const r = await createRun(input(changeId, '20260806-002-review-explore', 'review-explore', { reviewedRunId: '20260806-001-explore' }));
  await completeRun(r, { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] });
}

async function approvedProposal(changeId: string): Promise<void> {
  await approvedExplore(changeId);
  const p = await createRun(input(changeId, '20260806-003-propose', 'propose', { consumedRunId: '20260806-002-review-explore' }));
  await writeProposal(changeId);
  await completeRun(p, { executionStatus: 'completed', summary: 'propose' });
  const r = await createRun(input(changeId, '20260806-004-review-propose', 'review-propose', { reviewedRunId: '20260806-003-propose' }));
  await completeRun(r, { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] });
}

describe('Q2 current orchestration handoff', () => {
  it('propose consumes approved review-explore and rejects reviewed explore drift before entry', async () => {
    const c = 'handoff-propose';
    await approvedExplore(c);
    await writeExplore(c, '# changed after review\n');
    await assert.rejects(
      () => createRun(input(c, '20260806-003-propose', 'propose', { consumedRunId: '20260806-002-review-explore' })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
  });

  it('apply consumes approved review-propose and rejects proposal drift before entry', async () => {
    const c = 'handoff-apply';
    await approvedProposal(c);
    await writeFile(join(root, 'openspec', 'changes', c, 'design.md'), '# drift\n');
    await assert.rejects(
      () => createRun(input(c, '20260806-005-apply', 'apply', { consumedRunId: '20260806-004-review-propose' })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
  });

  it('revise-propose consumes only a matching changes-requested review and writes a full new point-in-time set', async () => {
    const c = 'revise-proposal';
    await approvedExplore(c);
    const p = await createRun(input(c, '20260806-003-propose', 'propose', { consumedRunId: '20260806-002-review-explore' }));
    await writeProposal(c);
    await completeRun(p, { executionStatus: 'completed', summary: 'P0' });
    const r = await createRun(input(c, '20260806-004-review-propose', 'review-propose', { reviewedRunId: '20260806-003-propose' }));
    await completeRun(r, {
      executionStatus: 'completed', summary: 'changes', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'F1', severity: 'blocking', blockingAuthority: 'author', title: 'revise', problem: 'x', requiredChange: 'update' }],
    });
    const revise = await createRun(input(c, '20260806-005-revise-propose', 'revise-propose', {
      sourceReviewRun: '20260806-004-review-propose', sourceReviewVerdict: 'changes-requested',
    }));
    await writeProposal(c, ' v2');
    await completeRun(revise, { executionStatus: 'completed', summary: 'P1' });
    const result = JSON.parse(await readFile(join(revise, 'result.json'), 'utf-8'));
    assert.equal(result.actionResult.producedResultRefs.length, 4);
    assert.ok(result.actionResult.reviewVerdictRef);
  });

  it('revise-propose rejects reviewed proposal drift before pending publish', async () => {
    const c = 'revise-proposal-drift';
    await approvedExplore(c);
    const p = await createRun(input(c, '20260806-003-propose', 'propose', { consumedRunId: '20260806-002-review-explore' }));
    await writeProposal(c);
    await completeRun(p, { executionStatus: 'completed', summary: 'P0' });
    const r = await createRun(input(c, '20260806-004-review-propose', 'review-propose', { reviewedRunId: '20260806-003-propose' }));
    await completeRun(r, {
      executionStatus: 'completed', summary: 'changes', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'F1', severity: 'blocking', blockingAuthority: 'author', title: 'revise', problem: 'x', requiredChange: 'update' }],
    });
    await writeFile(join(root, 'openspec', 'changes', c, 'proposal.md'), '# drift after review\n');
    await assert.rejects(
      () => createRun(input(c, '20260806-005-revise-propose', 'revise-propose', {
        sourceReviewRun: '20260806-004-review-propose', sourceReviewVerdict: 'changes-requested',
      })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
  });

  it('revise-propose rejects a wrong-stage source review', async () => {
    const c = 'revise-proposal-wrong-stage';
    await writeExplore(c);
    const e = await createRun(input(c, '20260806-001-explore', 'explore'));
    await completeRun(e, { executionStatus: 'completed', summary: 'explore' });
    const r = await createRun(input(c, '20260806-002-review-explore', 'review-explore', { reviewedRunId: '20260806-001-explore' }));
    await completeRun(r, {
      executionStatus: 'completed', summary: 'changes', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'F1', severity: 'blocking', blockingAuthority: 'author', title: 'revise', problem: 'x', requiredChange: 'update' }],
    });
    await assert.rejects(
      () => createRun(input(c, '20260806-003-revise-propose', 'revise-propose', {
        sourceReviewRun: '20260806-002-review-explore', sourceReviewVerdict: 'changes-requested',
      })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('revise-propose rejects an approved review even if caller claims changes-requested', async () => {
    const c = 'revise-proposal-wrong-verdict';
    await approvedProposal(c);
    await assert.rejects(
      () => createRun(input(c, '20260806-005-revise-propose', 'revise-propose', {
        sourceReviewRun: '20260806-004-review-propose', sourceReviewVerdict: 'changes-requested',
      })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('review-apply freezes verification only for its own entry-to-completion window', async () => {
    const c = 'review-apply-window';
    await approvedProposal(c);
    const a = await createRun(input(c, '20260806-005-apply', 'apply', { consumedRunId: '20260806-004-review-propose' }));
    await completeRun(a, { executionStatus: 'completed', summary: 'apply' });
    const verificationPath = join(root, 'openspec', 'changes', c, 'verification.md');
    await writeFile(verificationPath, '# verification A\n');
    const r = await createRun(input(c, '20260806-006-review-apply', 'review-apply', { reviewedRunId: '20260806-005-apply' }));
    await writeFile(verificationPath, '# verification B\n');
    await assert.rejects(
      () => completeRun(r, { executionStatus: 'completed', summary: 'review', reviewVerdict: 'approved', reviewFindings: [] }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
    await writeFile(verificationPath, '# verification A\n');
    await completeRun(r, { executionStatus: 'completed', summary: 'review', reviewVerdict: 'approved', reviewFindings: [] });
  });

  it('completed historical mutable refs do not become Reader conflicts after current bytes change', async () => {
    const c = 'point-in-time-history';
    await activeManifest(c);
    await approvedExplore(c);
    await writeExplore(c, '# later legal bytes\n');
    const snapshot = await readSnapshot();
    assert.equal(snapshot.conflicts.some((x) => x.message.includes('20260806-001-explore') && x.dimension === 'artifact-replaced'), false);
  });

  it('Reader projects only the unique active Change Run corpus', async () => {
    const current = 'current-change';
    const old = 'completed-change';
    const manifestDir = join(root, '.flowkit', 'manifests');
    await mkdir(manifestDir, { recursive: true });
    await writeFile(join(manifestDir, 'D1.yaml'), [
      'id: D1', 'delivery:', '  state: active', '  fullTestStatus: not-ready', 'changes:',
      '  - key: OLD', `    id: ${old}`, '    state: completed', '    required: true', '    dependsOn: []',
      '  - key: Q2', `    id: ${current}`, '    state: active', '    required: true', '    dependsOn: []',
    ].join('\n'));
    await writeExplore(current);
    const cur = await createRun(input(current, '20260806-010-explore', 'explore'));
    await completeRun(cur, { executionStatus: 'completed', summary: 'current' });
    // Deliberately malformed historical Run under the completed Change.
    const oldDir = join(runsDir(), old, '20260806-009-explore');
    await mkdir(oldDir, { recursive: true });
    await writeFile(join(oldDir, 'action.md'), '# old\n');
    await writeFile(join(oldDir, 'context.json'), '{}');
    const snapshot = await readSnapshot();
    assert.ok(snapshot.runs.some((r) => r.runId === '20260806-010-explore'));
    assert.equal(snapshot.runs.some((r) => r.runId === '20260806-009-explore'), false);
    assert.equal(snapshot.conflicts.some((x) => x.message.includes('20260806-009-explore')), false);
  });
});

// Q2: verification handoff is exact only while the next Action is consuming it.
describe('Q2 verification handoff boundary', () => {
  it('archive rejects verification drift before pending publish, but accepts unchanged approved review-apply', async () => {
    const c = 'archive-verification-handoff';
    await approvedProposal(c);
    const a = await createRun(input(c, '20260806-005-apply', 'apply', { consumedRunId: '20260806-004-review-propose' }));
    await completeRun(a, { executionStatus: 'completed', summary: 'apply' });
    const verificationPath = join(root, 'openspec', 'changes', c, 'verification.md');
    await writeFile(verificationPath, '# verification A\n');
    const review = await createRun(input(c, '20260806-006-review-apply', 'review-apply', { reviewedRunId: '20260806-005-apply' }));
    await completeRun(review, { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] });

    await writeFile(verificationPath, '# verification drift\n');
    await assert.rejects(
      () => createRun(input(c, '20260806-007-archive', 'archive', { consumedRunId: '20260806-006-review-apply' })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );

    await writeFile(verificationPath, '# verification A\n');
    const archive = await createRun(input(c, '20260806-007-archive', 'archive', { consumedRunId: '20260806-006-review-apply' }));
    await assert.rejects(() => readFile(join(archive, 'result.json'), 'utf-8'));
  });

  it('revise-apply rejects stale verification from its changes-requested review before pending publish', async () => {
    const c = 'revise-apply-verification-handoff';
    await approvedProposal(c);
    const a = await createRun(input(c, '20260806-005-apply', 'apply', { consumedRunId: '20260806-004-review-propose' }));
    await completeRun(a, { executionStatus: 'completed', summary: 'apply' });
    const verificationPath = join(root, 'openspec', 'changes', c, 'verification.md');
    await writeFile(verificationPath, '# verification A\n');
    const review = await createRun(input(c, '20260806-006-review-apply', 'review-apply', { reviewedRunId: '20260806-005-apply' }));
    await completeRun(review, {
      executionStatus: 'completed', summary: 'changes', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'F1', severity: 'blocking', blockingAuthority: 'author', title: 'fix', problem: 'x', requiredChange: 'update' }],
    });

    await writeFile(verificationPath, '# verification drift\n');
    await assert.rejects(
      () => createRun(input(c, '20260806-007-revise-apply', 'revise-apply', {
        sourceReviewRun: '20260806-006-review-apply', sourceReviewVerdict: 'changes-requested',
      })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
  });

  it('completed review-apply verification refs remain point-in-time after later legal verification changes', async () => {
    const c = 'historical-verification-point-in-time';
    await activeManifest(c);
    await approvedProposal(c);
    const a = await createRun(input(c, '20260806-005-apply', 'apply', { consumedRunId: '20260806-004-review-propose' }));
    await completeRun(a, { executionStatus: 'completed', summary: 'apply' });
    const verificationPath = join(root, 'openspec', 'changes', c, 'verification.md');
    await writeFile(verificationPath, '# verification A\n');
    const review = await createRun(input(c, '20260806-006-review-apply', 'review-apply', { reviewedRunId: '20260806-005-apply' }));
    await completeRun(review, { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] });

    await writeFile(verificationPath, '# later legal verification bytes\n');
    const snapshot = await readSnapshot();
    assert.equal(snapshot.conflicts.some((x) => x.message.includes('20260806-006-review-apply') && x.dimension === 'artifact-replaced'), false);
  });

  it('pending revise is only non-terminal execution state and creates no generation/revision-window conflict', async () => {
    const c = 'pending-revise-only';
    await activeManifest(c);
    await approvedExplore(c);
    const p = await createRun(input(c, '20260806-003-propose', 'propose', { consumedRunId: '20260806-002-review-explore' }));
    await writeProposal(c);
    await completeRun(p, { executionStatus: 'completed', summary: 'proposal' });
    const review = await createRun(input(c, '20260806-004-review-propose', 'review-propose', { reviewedRunId: '20260806-003-propose' }));
    await completeRun(review, {
      executionStatus: 'completed', summary: 'changes', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'F1', severity: 'blocking', blockingAuthority: 'author', title: 'fix', problem: 'x', requiredChange: 'update' }],
    });
    const revise = await createRun(input(c, '20260806-005-revise-propose', 'revise-propose', {
      sourceReviewRun: '20260806-004-review-propose', sourceReviewVerdict: 'changes-requested',
    }));
    await assert.rejects(() => readFile(join(revise, 'result.json'), 'utf-8'));
    const snapshot = await readSnapshot();
    const pending = snapshot.runs.find((run) => run.runId === '20260806-005-revise-propose');
    assert.equal(pending?.status, 'pending');
    assert.equal(snapshot.conflicts.some((x) => /revision-window|supersed/i.test(x.message)), false);
  });
});
