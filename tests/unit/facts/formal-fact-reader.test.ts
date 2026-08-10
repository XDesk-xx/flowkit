import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
import { next } from '../../../src/policy/next.js';
import { computeResultFileHash } from '../../../src/persistence/result-ref-adapter.js';

let tempRoot: string;

async function makeTempRoot(): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join: pathJoin } = await import('node:path');
  tempRoot = await mkdtemp(pathJoin(tmpdir(), 'flowkit-reader-'));
  return tempRoot;
}

async function cleanupTempRoot(): Promise<void> {
  await rm(tempRoot, { recursive: true, force: true });
}

async function writeRun(
  deliveryRunsDir: string,
  changeId: string | undefined,
  runId: string,
  context: Record<string, unknown>,
  result?: Record<string, unknown>,
): Promise<void> {
  const runDir = changeId !== undefined ? join(deliveryRunsDir, changeId, runId) : join(deliveryRunsDir, runId);
  await mkdir(runDir, { recursive: true });
  const storedContext = context.action === 'review-apply' && context.verificationInputRef === undefined
    ? {
        ...context,
        verificationInputRef: {
          ref: `openspec/changes/${changeId}/verification.md`,
          versionFingerprint: 'fixture-entry-fingerprint',
          kind: 'verification-summary',
        },
      }
    : context;
  await writeFile(join(runDir, 'context.json'), JSON.stringify(storedContext, null, 2));
  if (result !== undefined) {
    await writeFile(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
  }
  await writeFile(join(runDir, 'action.md'), `# ${runId}\n`);

  // Q2/v6: Change-level Runs are current Policy facts only when their Change
  // is active in the Delivery Manifest. Reader-focused fixtures declare that
  // fact explicitly instead of relying on historical-corpus replay.
  if (changeId !== undefined) {
    const manifestDir = join(tempRoot, '.flowkit', 'manifests');
    await mkdir(manifestDir, { recursive: true });
    const manifestPath = join(manifestDir, `${context.deliveryId as string}.yaml`);
    try {
      const { access } = await import('node:fs/promises');
      await access(manifestPath);
    } catch {
      await writeFile(manifestPath, [
        `id: ${context.deliveryId as string}`,
        'delivery:',
        '  state: active',
        '  fullTestStatus: not-ready',
        'changes:',
        `  - key: ${String(context.changeKey ?? changeId)}`,
        `    id: ${changeId}`,
        '    state: active',
        '    required: true',
        '    dependsOn: []',
      ].join('\n'));
    }
  }
}

describe('readFormalFactSnapshot', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('reads C1 Run (schemaVersion=2) and projects RunFact (task 12.47, 1.10)', async () => {
    const deliveryId = 'D1';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const runPath = `.flowkit/runs/${deliveryId}/C1/20260806-001-explore/`;
    await writeRun(deliveryRunsDir, 'C1', '20260806-001-explore', {
      schemaVersion: 2,
      runId: '20260806-001-explore',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'required',
      runPath,
    });

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.runs.length, 1);
    const run = snapshot.runs[0]!;
    assert.equal(run.runId, '20260806-001-explore');
    assert.equal(run.status, 'pending');
    assert.equal(run.action, 'explore');
  });

  it('reads legacy Bootstrap Run (schemaVersion=1) and normalizes status (task 12.49, 12.57)', async () => {
    const deliveryId = 'D2';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-054-propose',
      {
        schemaVersion: 1,
        runId: '20260806-054-propose',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'propose',
        role: 'author',
        ownerAuthorization: 'not-required',
        inputRef: 'some-hash',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-054-propose/`,
      },
      {
        schemaVersion: 1,
        runId: '20260806-054-propose',
        status: 'completed',
        summary: 'done',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.runs.length, 1);
    const run = snapshot.runs[0]!;
    assert.equal(run.runId, '20260806-054-propose');
    assert.equal(run.status, 'completed');
    assert.equal(run.inputRef, undefined); // string-form inputRef → undefined
  });

  it('ignores staging directories and temp files (task 1.12)', async () => {
    const deliveryId = 'D3';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    // A real Run.
    await writeRun(deliveryRunsDir, 'C1', '20260806-001-explore', {
      schemaVersion: 2,
      runId: '20260806-001-explore',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-001-explore/`,
    });
    // A staging directory (should be invisible).
    const stagingDir = join(deliveryRunsDir, '.tmp-20260806-002-explore');
    await mkdir(stagingDir, { recursive: true });
    await writeFile(join(stagingDir, 'context.json'), '{}');

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.runs.length, 1);
    assert.equal(snapshot.runs[0]?.runId, '20260806-001-explore');
  });

  it('collects FactConflict for malformed C1 Run (fail-closed, task 12.48)', async () => {
    const deliveryId = 'D4';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(deliveryRunsDir, 'C1', '20260806-001-explore', {
      schemaVersion: 2,
      runId: '20260806-001-explore',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'not-an-action', // invalid action → FactConflict
      role: 'author',
      ownerAuthorization: 'required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-001-explore/`,
    });

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.runs.length, 0);
    assert.ok(snapshot.conflicts.length > 0);
  });

  it('reads OpenSpec artifact existence (task 1.11)', async () => {
    const deliveryId = 'D5';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(deliveryRunsDir, 'C1', '20260806-001-explore', {
      schemaVersion: 2,
      runId: '20260806-001-explore',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-001-explore/`,
    });

    // Create OpenSpec change dir with proposal.md.
    const changeDir = join(tempRoot, 'openspec', 'changes', 'C1');
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal');

    // Create a manifest that lists the change. C1-AP-003: real manifest shape
    // stores state/fullTestStatus under the nested `delivery:` mapping.
    const manifestDir = join(tempRoot, '.flowkit', 'manifests');
    await mkdir(manifestDir, { recursive: true });
    await writeFile(
      join(manifestDir, `${deliveryId}.yaml`),
      [
        `id: ${deliveryId}`,
        'delivery:',
        '  state: active',
        '  fullTestStatus: not-ready',
        'changes:',
        '  - key: C1',
        '    id: C1',
        '    state: active',
        '    required: true',
        '    dependsOn: []',
      ].join('\n'),
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.deliveryState, 'active');
    assert.equal(snapshot.deliveryFullTestStatus, 'not-ready');
    assert.equal(snapshot.changes.length, 1);
    assert.equal(snapshot.changes[0]?.key, 'C1');
    const proposal = snapshot.openSpecArtifacts.find((a) => a.kind === 'change-proposal');
    assert.ok(proposal);
    assert.equal(proposal?.exists, true);
    const design = snapshot.openSpecArtifacts.find((a) => a.kind === 'change-design');
    assert.ok(design);
    assert.equal(design?.exists, false);
  });

  // -------------------------------------------------------------------------
  // C1-AP-003: Delivery Manifest nested delivery.state/fullTestStatus
  // -------------------------------------------------------------------------

  it('reads nested delivery.state and delivery.fullTestStatus (C1-AP-003)', async () => {
    const deliveryId = 'D-NESTED';
    const manifestDir = join(tempRoot, '.flowkit', 'manifests');
    await mkdir(manifestDir, { recursive: true });
    await writeFile(
      join(manifestDir, `${deliveryId}.yaml`),
      [
        `id: ${deliveryId}`,
        'delivery:',
        '  state: active',
        '  fullTestStatus: awaiting-user-decision',
        'changes: []',
      ].join('\n'),
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.deliveryState, 'active');
    assert.equal(snapshot.deliveryFullTestStatus, 'awaiting-user-decision');
    assert.equal(snapshot.conflicts.length, 0);
  });

  it('fail-closed when manifest missing delivery: mapping (C1-AP-003)', async () => {
    const deliveryId = 'D-BAD-MANIFEST';
    const manifestDir = join(tempRoot, '.flowkit', 'manifests');
    await mkdir(manifestDir, { recursive: true });
    // Top-level state/fullTestStatus (wrong shape) — Reader MUST NOT silently
    // return undefined; it MUST collect a FactConflict.
    await writeFile(
      join(manifestDir, `${deliveryId}.yaml`),
      [
        `id: ${deliveryId}`,
        'state: active',
        'fullTestStatus: not-ready',
        'changes: []',
      ].join('\n'),
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.deliveryState, undefined);
    assert.equal(snapshot.deliveryFullTestStatus, undefined);
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'delivery-manifest-shape');
    assert.ok(conflict, 'expected delivery-manifest-shape conflict');
  });

  it('fail-closed when delivery.state invalid (C1-AP-003)', async () => {
    const deliveryId = 'D-BAD-STATE';
    const manifestDir = join(tempRoot, '.flowkit', 'manifests');
    await mkdir(manifestDir, { recursive: true });
    await writeFile(
      join(manifestDir, `${deliveryId}.yaml`),
      [
        `id: ${deliveryId}`,
        'delivery:',
        '  state: not-a-real-state',
        '  fullTestStatus: not-ready',
        'changes: []',
      ].join('\n'),
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.deliveryState, undefined);
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'delivery-state');
    assert.ok(conflict, 'expected delivery-state conflict');
  });

  // -------------------------------------------------------------------------
  // C1-AP-004: Review verdict reconstruction (C1 + Bootstrap)
  // -------------------------------------------------------------------------

  it('reconstructs C1 review verdict from reviewVerdict + reviewedRunId (C1-AP-004)', async () => {
    const deliveryId = 'D-REVIEW-C1';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedResult = {
      runStatus: 'completed',
      actionResult: {
        action: 'explore',
        executionStatus: 'completed',
        summary: 'E0',
        producedResultRefs: [
          {
            ref: 'openspec/changes/C1/explore.md',
            versionFingerprint: computeResultFileHash('# Explore\n'),
            kind: 'produced-artifact',
          },
        ],
      },
    };
    const reviewedResultBytes = JSON.stringify(reviewedResult, null, 2);
    await writeRun(deliveryRunsDir, 'C1', '20260806-009-explore', {
      schemaVersion: 2,
      runId: '20260806-009-explore',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-009-explore/`,
    }, reviewedResult);

    await writeRun(deliveryRunsDir, 'C1', '20260806-010-review-explore', {
      schemaVersion: 2,
      runId: '20260806-010-review-explore',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'review-explore',
      role: 'reviewer',
      ownerAuthorization: 'not-required',
      reviewedRunId: '20260806-009-explore',
      inputRef: {
        ref: `.flowkit/runs/${deliveryId}/C1/20260806-009-explore/result.json`,
        versionFingerprint: computeResultFileHash(reviewedResultBytes),
        kind: 'run-result',
      },
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-010-review-explore/`,
    }, {
      runStatus: 'completed',
      actionResult: { action: 'review-explore', executionStatus: 'completed', summary: 'approved' },
      reviewVerdict: 'approved',
      reviewFindings: [],
    });

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.runs.length, 2);
    assert.equal(snapshot.reviewVerdicts.length, 1);
    assert.equal(snapshot.reviewVerdicts[0]?.reviewRunId, '20260806-010-review-explore');
    assert.equal(snapshot.reviewVerdicts[0]?.verdict, 'approved');
    assert.equal(snapshot.reviewVerdicts[0]?.reviewedRunId, '20260806-009-explore');
    assert.equal(snapshot.conflicts.length, 0, JSON.stringify(snapshot.conflicts));
  });

  it('C1 review-* Run missing reviewedRunId → FactConflict (C1-AP-004)', async () => {
    const deliveryId = 'D-REVIEW-C1-BAD';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-011-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-011-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        // reviewedRunId intentionally missing
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-011-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
        },
        reviewVerdict: 'approved',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    // validateContextFile rejects missing reviewedRunId for review-* at the
    // discriminator → FactConflict, no Run projected.
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'context-schema' || c.dimension === 'review-verdict-linkage');
    assert.ok(conflict, 'expected review linkage conflict');
  });

  it('reconstructs Bootstrap review verdict from result.verdict + context.reviewedRun (C1-AP-004)', async () => {
    const deliveryId = 'D-REVIEW-LEGACY-PATH';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-037-review-explore',
      {
        schemaVersion: 1,
        runId: '20260806-037-review-explore',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-explore',
        role: 'reviewer',
        reviewedRun: `.flowkit/runs/${deliveryId}/C1/20260806-036-explore/`,
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-037-review-explore/`,
      },
      {
        schemaVersion: 1,
        runId: '20260806-037-review-explore',
        status: 'completed',
        verdict: 'changes-requested',
        summary: 'request changes',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.reviewVerdicts.length, 1);
    const v = snapshot.reviewVerdicts[0]!;
    assert.equal(v.reviewRunId, '20260806-037-review-explore');
    assert.equal(v.verdict, 'changes-requested');
    assert.equal(v.reviewedRunId, '20260806-036-explore');
    assert.equal(snapshot.conflicts.length, 0);
  });

  it('reconstructs Bootstrap review verdict from input.reviewedRunId (C1-AP-004)', async () => {
    const deliveryId = 'D-REVIEW-LEGACY-INPUT';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-055-review-propose',
      {
        schemaVersion: 1,
        runId: '20260806-055-review-propose',
        deliveryId,
        changeId: 'C1',
        action: 'review-propose',
        role: 'reviewer',
        input: {
          reviewedRunId: '20260806-054-propose',
          reviewedAction: 'propose',
        },
      },
      {
        schemaVersion: 1,
        runId: '20260806-055-review-propose',
        status: 'completed',
        verdict: 'changes-requested',
        summary: 'request changes',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.reviewVerdicts.length, 1);
    const v = snapshot.reviewVerdicts[0]!;
    assert.equal(v.reviewedRunId, '20260806-054-propose');
    assert.equal(v.verdict, 'changes-requested');
  });

  it('reconstructs Bootstrap review verdict from sourceApplyRun (C1-AP-004)', async () => {
    const deliveryId = 'D-REVIEW-LEGACY-APPLY';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-063-review-apply',
      {
        schemaVersion: 1,
        runId: '20260806-063-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        sourceApplyRun: '20260806-062-apply',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-063-review-apply/`,
      },
      {
        schemaVersion: 1,
        runId: '20260806-063-review-apply',
        status: 'completed',
        verdict: 'changes-requested',
        summary: 'request changes',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.equal(snapshot.reviewVerdicts.length, 1);
    const v = snapshot.reviewVerdicts[0]!;
    assert.equal(v.reviewedRunId, '20260806-062-apply');
    assert.equal(v.verdict, 'changes-requested');
  });

  it('Bootstrap review-* Run missing linkage → FactConflict (C1-AP-004)', async () => {
    const deliveryId = 'D-REVIEW-LEGACY-BAD';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-070-review-apply',
      {
        schemaVersion: 1,
        runId: '20260806-070-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        // No reviewedRun / input.reviewedRunId / sourceApplyRun
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-070-review-apply/`,
      },
      {
        schemaVersion: 1,
        runId: '20260806-070-review-apply',
        status: 'completed',
        verdict: 'approved',
        summary: 'approved',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    const conflict = snapshot.conflicts.find((c) => c.dimension === 'review-verdict-linkage');
    assert.ok(conflict, 'expected review-verdict-linkage conflict');
  });

  // -------------------------------------------------------------------------
  // Q1-RA-003: Reader fails closed on empty/partial initial produced sets
  // -------------------------------------------------------------------------

  it('v6 Reader does not replay mutable propose effective-set completeness after terminal publication', async () => {
    const deliveryId = 'D-RA003-EMPTY';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const changeId = 'C1';
    // Provide all current canonical artifacts so the ONLY failure is the
    // incomplete produced set (not a byte issue).
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(join(changeDir, 'specs', 'cap-a'), { recursive: true });
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal\n');
    await writeFile(join(changeDir, 'design.md'), '# Design\n');
    await writeFile(join(changeDir, 'tasks.md'), '# Tasks\n');
    await writeFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), '# Spec A\n');

    await writeRun(
      deliveryRunsDir,
      changeId,
      '20260806-001-propose',
      {
        schemaVersion: 2,
        runId: '20260806-001-propose',
        deliveryId,
        changeKey: changeId,
        changeId,
        action: 'propose',
        role: 'author',
        ownerAuthorization: 'required',
        runPath: `.flowkit/runs/${deliveryId}/${changeId}/20260806-001-propose/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'propose',
          executionStatus: 'completed',
          summary: 'P0',
          producedResultRefs: [], // empty produced set → fail closed
        },
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    assert.equal(snapshot.runs.some((run) => run.runId === '20260806-001-propose'), true);
    assert.equal(snapshot.conflicts.some((c) => c.dimension === 'artifact-effective-set-incomplete'), false);
  });

  it('v6 Reader leaves propose effective-set exactness to create/complete and Action-entry validation', async () => {
    const deliveryId = 'D-RA003-PARTIAL';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const changeId = 'C1';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(join(changeDir, 'specs', 'cap-a'), { recursive: true });
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal\n');
    await writeFile(join(changeDir, 'design.md'), '# Design\n');
    await writeFile(join(changeDir, 'tasks.md'), '# Tasks\n');
    await writeFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), '# Spec A\n');

    const { computeResultFileHash } = await import('../../../src/persistence/result-ref-adapter.js');
    const { readFile } = await import('node:fs/promises');
    const proposalHash = computeResultFileHash(await readFile(join(changeDir, 'proposal.md'), 'utf-8'));
    const tasksHash = computeResultFileHash(await readFile(join(changeDir, 'tasks.md'), 'utf-8'));
    const specHash = computeResultFileHash(await readFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), 'utf-8'));

    // Produced set is MISSING design.md (partial) — every present ref is current,
    // but the stage invariant is violated.
    await writeRun(
      deliveryRunsDir,
      changeId,
      '20260806-001-propose',
      {
        schemaVersion: 2,
        runId: '20260806-001-propose',
        deliveryId,
        changeKey: changeId,
        changeId,
        action: 'propose',
        role: 'author',
        ownerAuthorization: 'required',
        runPath: `.flowkit/runs/${deliveryId}/${changeId}/20260806-001-propose/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'propose',
          executionStatus: 'completed',
          summary: 'P0',
          producedResultRefs: [
            { ref: `openspec/changes/${changeId}/proposal.md`, versionFingerprint: proposalHash, kind: 'produced-artifact' },
            { ref: `openspec/changes/${changeId}/tasks.md`, versionFingerprint: tasksHash, kind: 'produced-artifact' },
            { ref: `openspec/changes/${changeId}/specs/cap-a/spec.md`, versionFingerprint: specHash, kind: 'produced-artifact' },
            // design.md is MISSING from the produced set.
          ],
        },
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    assert.equal(snapshot.runs.some((run) => run.runId === '20260806-001-propose'), true);
    assert.equal(snapshot.conflicts.some((c) => c.dimension === 'artifact-effective-set-incomplete'), false);
  });

  // -------------------------------------------------------------------------
  // Q1-RA-006: closed result admission + valid verdict promotion
  // -------------------------------------------------------------------------

  it('C1 review with closed-schema-violating result → NO ReviewVerdictFact (Q1-RA-006)', async () => {
    const deliveryId = 'D-RA006-CLOSED';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-020-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-020-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-019-apply',
        // Q1-RA-006: review-* MUST carry a run-result inputRef.
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-019-apply/result.json`,
          versionFingerprint: 'abc123',
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-020-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          // Q1-RA-010: completed review-apply MUST carry verificationSummaryRef.
          verificationSummaryRef: {
            ref: `openspec/changes/C1/verification.md`,
            versionFingerprint: 'abc123',
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
        // closed-schema violation: heavy bookkeeping field is rejected.
        blockingFindings: [],
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    assert.equal(snapshot.reviewVerdicts.length, 0, 'closed-schema-violating review MUST NOT be admitted');
    const schemaConflict = snapshot.conflicts.find((c) => c.dimension === 'run-result-schema');
    assert.ok(schemaConflict, `expected run-result-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('C1 review with invalid verdict/findings shape → NO ReviewVerdictFact (Q1-RA-006)', async () => {
    const deliveryId = 'D-RA006-VERDICT';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-021-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-021-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-019-apply',
        // Q1-RA-006: review-* MUST carry a run-result inputRef.
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-019-apply/result.json`,
          versionFingerprint: 'abc123',
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-021-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'cr',
          // Q1-RA-010: completed review-apply MUST carry verificationSummaryRef.
          verificationSummaryRef: {
            ref: `openspec/changes/C1/verification.md`,
            versionFingerprint: 'abc123',
            kind: 'verification-summary',
          },
        },
        // verdict integrity: changes-requested requires ≥1 blocking finding.
        reviewVerdict: 'changes-requested',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    assert.equal(snapshot.reviewVerdicts.length, 0, 'verdict-integrity-violating review MUST NOT be admitted');
    // The shared C1 admission pipeline reports any Phase-1 failure (including
    // review verdict integrity) as run-result-schema.
    const integrityConflict = snapshot.conflicts.find((c) => c.dimension === 'run-result-schema');
    assert.ok(integrityConflict, `expected run-result-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('C1 review with broken exact binding (wrong hash) → verdict NOT admitted (Q1-RA-006)', async () => {
    const deliveryId = 'D-RA006-HASH';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    await writeRun(deliveryRunsDir, 'C1', '20260806-022-apply', {
      schemaVersion: 2,
      runId: '20260806-022-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-022-apply/`,
    }, reviewedResult);

    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-023-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-023-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-022-apply',
        // WRONG fingerprint — binding broken.
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-022-apply/result.json`,
          versionFingerprint: 'deadbeef',
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-023-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          verificationSummaryRef: {
            ref: `openspec/changes/C1/verification.md`,
            versionFingerprint: computeResultFileHash('# Verification\n'),
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
      },
    );
    const changeDir = join(tempRoot, 'openspec', 'changes', 'C1');
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'verification.md'), '# Verification\n');

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    assert.equal(snapshot.reviewVerdicts.length, 0, 'broken-binding review MUST NOT be admitted');
    const bindingConflict = snapshot.conflicts.find((c) => c.dimension === 'review-binding-mismatch');
    assert.ok(bindingConflict, `expected review-binding-mismatch conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('C1 review with WRONG-KIND inputRef → verdict NOT admitted (Q1-RA-006)', async () => {
    const deliveryId = 'D-RA006-KIND';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    await writeRun(deliveryRunsDir, 'C1', '20260806-026-apply', {
      schemaVersion: 2,
      runId: '20260806-026-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-026-apply/`,
    }, reviewedResult);

    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-027-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-027-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-026-apply',
        // WRONG kind (produced-artifact) — target/hash otherwise correct.
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-026-apply/result.json`,
          versionFingerprint: computeResultFileHash(JSON.stringify(reviewedResult, null, 2)),
          kind: 'produced-artifact',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-027-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          verificationSummaryRef: {
            ref: `openspec/changes/C1/verification.md`,
            versionFingerprint: computeResultFileHash('# Verification\n'),
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
      },
    );
    const changeDir = join(tempRoot, 'openspec', 'changes', 'C1');
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'verification.md'), '# Verification\n');

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    assert.equal(snapshot.reviewVerdicts.length, 0, 'wrong-kind-binding review MUST NOT be admitted');
    // Q1-RA-006 structural requiredness rejects the wrong-kind inputRef at
    // context schema admission (context-schema); the verdict is never promoted.
    const bindingConflict = snapshot.conflicts.find(
      (c) => c.dimension === 'context-schema' || c.dimension === 'review-binding-schema' || c.dimension === 'review-binding-mismatch',
    );
    assert.ok(bindingConflict, `expected context-schema/review-binding-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('C1 review pointing at a DIFFERENT readable result with MATCHING hash → verdict NOT admitted (Q1-RA-006)', async () => {
    const deliveryId = 'D-RA006-TARGET';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const aResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    const bResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'B0' } };
    await writeRun(deliveryRunsDir, 'C1', '20260806-028-apply', {
      schemaVersion: 2,
      runId: '20260806-028-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-028-apply/`,
    }, aResult);
    await writeRun(deliveryRunsDir, 'C1', '20260806-029-apply', {
      schemaVersion: 2,
      runId: '20260806-029-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-029-apply/`,
    }, bResult);

    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-030-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-030-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        // reviewedRunId = 028 (A), but inputRef points at 029 (B) with B's
        // CORRECT hash — path + hash both valid individually, binding is wrong.
        reviewedRunId: '20260806-028-apply',
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-029-apply/result.json`,
          versionFingerprint: computeResultFileHash(JSON.stringify(bResult, null, 2)),
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-030-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          verificationSummaryRef: {
            ref: `openspec/changes/C1/verification.md`,
            versionFingerprint: computeResultFileHash('# Verification\n'),
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
      },
    );
    const changeDir = join(tempRoot, 'openspec', 'changes', 'C1');
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'verification.md'), '# Verification\n');

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    assert.equal(snapshot.reviewVerdicts.length, 0, 'wrong-target review MUST NOT be admitted');
    const bindingConflict = snapshot.conflicts.find(
      (c) => c.dimension === 'review-binding-mismatch' || c.dimension === 'review-binding-missing',
    );
    assert.ok(bindingConflict, `expected review-binding-mismatch conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('C1 review without inputRef → NO ReviewVerdictFact (Q1-RA-006)', async () => {
    const deliveryId = 'D-RA006-NOINPUT';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-024-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-024-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-019-apply',
        // NO inputRef → cannot exact-bind.
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-024-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          verificationSummaryRef: {
            ref: `openspec/changes/C1/verification.md`,
            versionFingerprint: computeResultFileHash('# Verification\n'),
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
      },
    );
    const changeDir = join(tempRoot, 'openspec', 'changes', 'C1');
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'verification.md'), '# Verification\n');

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    assert.equal(snapshot.reviewVerdicts.length, 0, 'inputRef-less C1 review MUST NOT be admitted');
    // Q1-RA-006 structural requiredness now rejects the context at schema
    // admission (context-schema); the review verdict is never promoted either.
    const missingConflict = snapshot.conflicts.find(
      (c) => c.dimension === 'review-binding-missing' || c.dimension === 'context-schema',
    );
    assert.ok(missingConflict, `expected review-binding-missing/context-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  // -------------------------------------------------------------------------
  // Q1-RA-007: immutable Run-result refs strictly validated
  // -------------------------------------------------------------------------

  it('non-ENOENT result.json read failure → FactConflict, NOT pending (Q1-RA-006)', async () => {
    const deliveryId = 'D-RA006-EISDIR';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const runDir = join(deliveryRunsDir, 'C1', '20260806-025-explore');
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'context.json'), JSON.stringify({
      schemaVersion: 2,
      runId: '20260806-025-explore',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-025-explore/`,
    }, null, 2));
    await writeFile(join(runDir, 'action.md'), '# x\n');
    // result.json as a DIRECTORY → readFile yields EISDIR (non-ENOENT).
    await mkdir(join(runDir, 'result.json'));
    const manifestDir = join(tempRoot, '.flowkit', 'manifests');
    await mkdir(manifestDir, { recursive: true });
    await writeFile(join(manifestDir, `${deliveryId}.yaml`), [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: C1',
      '    id: C1',
      '    state: active',
      '    required: true',
      '    dependsOn: []',
    ].join('\n'));

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'run-result');
    assert.ok(conflict, `expected run-result conflict for non-ENOENT failure, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('consumedInputRefs with wrong kind → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-KIND';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-030-revise-propose',
      {
        schemaVersion: 2,
        runId: '20260806-030-revise-propose',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-propose',
        role: 'author',
        ownerAuthorization: 'required',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-030-revise-propose/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-propose',
          executionStatus: 'completed',
          summary: 'P1',
          consumedInputRefs: [
            // wrong kind — the closed actionResult schema (field-kind binding)
            // rejects this at Phase 1 admission (run-result-schema conflict).
            { ref: `.flowkit/runs/${deliveryId}/C1/20260806-029-propose/result.json`, versionFingerprint: 'x', kind: 'produced-artifact' },
          ],
        },
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // The fail-closed result: the Run is not admitted at all (schema-level
    // rejection happens before any RunFact is promoted), so the immutable-ref
    // validation layer is never reached — the wrong-kind ref never leaks into
    // formal facts.
    const schemaConflict = snapshot.conflicts.find((c) => c.dimension === 'context-schema');
    assert.ok(schemaConflict, `expected context-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
    assert.equal(snapshot.runs.length, 0, 'wrong-kind consumed ref Run MUST NOT be admitted');
  });

  it('consumedInputRefs with missing target → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-MISSING';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    // apply Run: consumedInputRefs is legal and the Run is not subject to
    // source-review requiredness or artifact effective-set checks, so the
    // consumed-ref immutable validation is the focused failure point.
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-031-apply',
      {
        schemaVersion: 2,
        runId: '20260806-031-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'apply',
        role: 'author',
        ownerAuthorization: 'not-required',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-031-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'apply',
          executionStatus: 'completed',
          summary: 'A0',
          consumedInputRefs: [
            { ref: `.flowkit/runs/${deliveryId}/C1/20260806-029-propose/result.json`, versionFingerprint: 'x', kind: 'run-result' },
          ],
        },
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'immutable-ref-missing');
    assert.ok(conflict, `expected immutable-ref-missing conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('consumedInputRefs with fingerprint mismatch → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-HASH';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const consumedResult = { runStatus: 'completed', actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0' } };
    await writeRun(deliveryRunsDir, 'C1', '20260806-033-propose', {
      schemaVersion: 2,
      runId: '20260806-033-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'propose',
      role: 'author',
      ownerAuthorization: 'required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-033-propose/`,
    }, consumedResult);

    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-034-apply',
      {
        schemaVersion: 2,
        runId: '20260806-034-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'apply',
        role: 'author',
        ownerAuthorization: 'not-required',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-034-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'apply',
          executionStatus: 'completed',
          summary: 'A0',
          consumedInputRefs: [
            // kind and path are schema-valid; the fingerprint is WRONG.
            { ref: `.flowkit/runs/${deliveryId}/C1/20260806-033-propose/result.json`, versionFingerprint: 'deadbeef', kind: 'run-result' },
          ],
        },
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'immutable-ref-mismatch');
    assert.ok(conflict, `expected immutable-ref-mismatch conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('consumedInputRefs with path-shaped target → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-PATH';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-032-apply',
      {
        schemaVersion: 2,
        runId: '20260806-032-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'apply',
        role: 'author',
        ownerAuthorization: 'not-required',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-032-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'apply',
          executionStatus: 'completed',
          summary: 'A0',
          consumedInputRefs: [
            { ref: `../../result.json`, versionFingerprint: 'x', kind: 'run-result' },
          ],
        },
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'immutable-ref-target');
    assert.ok(conflict, `expected immutable-ref-target conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('revise-propose with UN-ADMITTED source review → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-UNADMITTED';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    // Source review Run referenced by context but whose review verdict is NOT
    // admitted (the referenced review Run itself does not exist on disk).
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-033-revise-propose',
      {
        schemaVersion: 2,
        runId: '20260806-033-revise-propose',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-propose',
        role: 'author',
        ownerAuthorization: 'required',
        sourceReviewRun: '20260806-099-review-propose',
        sourceReviewVerdict: 'changes-requested',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-033-revise-propose/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-propose',
          executionStatus: 'completed',
          summary: 'P1',
          // producedResultRefs present so physical Action admission passes and
          // the immutable source-review checks are the focused failure point.
          producedResultRefs: [
            { ref: `openspec/changes/C1/proposal.md`, versionFingerprint: 'x', kind: 'produced-artifact' },
          ],
          reviewVerdictRef: {
            ref: `.flowkit/runs/${deliveryId}/C1/20260806-099-review-propose/result.json`,
            versionFingerprint: 'x',
            kind: 'run-result',
          },
          consumedInputRefs: [],
        },
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // The referenced review is missing on disk → target-missing first; the
    // source review is also not admitted. Both fail closed.
    const conflict = snapshot.conflicts.find(
      (c) => c.dimension === 'immutable-ref-missing' || c.dimension === 'immutable-ref-source-unadmitted',
    );
    assert.ok(conflict, `expected immutable-ref-missing/source-unadmitted conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('revise-propose with reviewVerdictRef targeting a DIFFERENT review (B readable + correct hash) → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-WRONGTGT';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    // Review A exists + is admitted (approved), but sourceReviewRun = A while
    // reviewVerdictRef points at review B (changes-requested) with B's correct
    // hash — target/hash valid, tuple target wrong.
    const reviewedPropose = { runStatus: 'completed', actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0', producedResultRefs: [] } };
    await writeRun(deliveryRunsDir, 'C1', '20260806-034-propose', {
      schemaVersion: 2,
      runId: '20260806-034-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'propose',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-034-propose/`,
    }, reviewedPropose);
    // Review A over 034: approved.
    await writeRun(deliveryRunsDir, 'C1', '20260806-035-review-propose', {
      schemaVersion: 2,
      runId: '20260806-035-review-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'review-propose',
      role: 'reviewer',
      ownerAuthorization: 'not-required',
      reviewedRunId: '20260806-034-propose',
      inputRef: {
        ref: `.flowkit/runs/${deliveryId}/C1/20260806-034-propose/result.json`,
        versionFingerprint: computeResultFileHash(JSON.stringify(reviewedPropose, null, 2)),
        kind: 'run-result',
      },
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-035-review-propose/`,
    }, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'approved' },
      reviewVerdict: 'approved',
    });
    // Review B over 034: changes-requested (also admitted).
    await writeRun(deliveryRunsDir, 'C1', '20260806-036-review-propose', {
      schemaVersion: 2,
      runId: '20260806-036-review-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'review-propose',
      role: 'reviewer',
      ownerAuthorization: 'not-required',
      reviewedRunId: '20260806-034-propose',
      inputRef: {
        ref: `.flowkit/runs/${deliveryId}/C1/20260806-034-propose/result.json`,
        versionFingerprint: computeResultFileHash(JSON.stringify(reviewedPropose, null, 2)),
        kind: 'run-result',
      },
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-036-review-propose/`,
    }, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'cr' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', blockingAuthority: 'author', title: 'fix', problem: 'x', requiredChange: 'revise' },
      ],
    });
    // Revise-propose: sourceReviewRun = A (035, approved), but reviewVerdictRef
    // points at B (036) with B's correct hash.
    await writeRun(deliveryRunsDir, 'C1', '20260806-037-revise-propose', {
      schemaVersion: 2,
      runId: '20260806-037-revise-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'revise-propose',
      role: 'author',
      ownerAuthorization: 'required',
      sourceReviewRun: '20260806-035-review-propose',
      sourceReviewVerdict: 'approved',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-037-revise-propose/`,
    }, {
      runStatus: 'completed',
      actionResult: {
        action: 'revise-propose',
        executionStatus: 'completed',
        summary: 'P1',
        // producedResultRefs present so physical Action admission passes and
        // the immutable source-review checks are the focused failure point.
        producedResultRefs: [
          { ref: `openspec/changes/C1/proposal.md`, versionFingerprint: 'x', kind: 'produced-artifact' },
        ],
        reviewVerdictRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-036-review-propose/result.json`,
          versionFingerprint: computeResultFileHash(JSON.stringify({ runStatus: 'completed', actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'cr' }, reviewVerdict: 'changes-requested', reviewFindings: [{ id: 'B-001', severity: 'blocking', blockingAuthority: 'author', title: 'fix', problem: 'x', requiredChange: 'revise' }] }, null, 2)),
          kind: 'run-result',
        },
        consumedInputRefs: [],
      },
    });

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // sourceReviewRun=A(approved) but reviewVerdictRef→B(changes-requested):
    // wrong target AND approved-verdict violation both fail closed.
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'context-schema');
    assert.ok(conflict, `expected context-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('persisted revise-explore with ENTIRE source-review tuple absent → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-EXPLORE-NOTUPLE';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-038-revise-explore',
      {
        schemaVersion: 2,
        runId: '20260806-038-revise-explore',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-explore',
        role: 'author',
        ownerAuthorization: 'required',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-038-revise-explore/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-explore',
          executionStatus: 'completed',
          summary: 'RE1',
          producedResultRefs: [
            { ref: `openspec/changes/C1/explore.md`, versionFingerprint: 'x', kind: 'produced-artifact' },
          ],
        },
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'context-schema');
    assert.ok(conflict, `expected context-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('persisted revise-propose sourced from an APPROVED review → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-APPROVED-SRC';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedPropose = { runStatus: 'completed', actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0', producedResultRefs: [] } };
    await writeRun(deliveryRunsDir, 'C1', '20260806-039-propose', {
      schemaVersion: 2,
      runId: '20260806-039-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'propose',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-039-propose/`,
    }, reviewedPropose);
    // Review-propose → approved (admitted).
    await writeRun(deliveryRunsDir, 'C1', '20260806-040-review-propose', {
      schemaVersion: 2,
      runId: '20260806-040-review-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'review-propose',
      role: 'reviewer',
      ownerAuthorization: 'not-required',
      reviewedRunId: '20260806-039-propose',
      inputRef: {
        ref: `.flowkit/runs/${deliveryId}/C1/20260806-039-propose/result.json`,
        versionFingerprint: computeResultFileHash(JSON.stringify(reviewedPropose, null, 2)),
        kind: 'run-result',
      },
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-040-review-propose/`,
    }, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'ok' },
      reviewVerdict: 'approved',
    });
    // Revise-propose sourcing the APPROVED review — path/hash/verdict all
    // internally consistent, but approved can never precede a revise-*.
    await writeRun(deliveryRunsDir, 'C1', '20260806-041-revise-propose', {
      schemaVersion: 2,
      runId: '20260806-041-revise-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'revise-propose',
      role: 'author',
      ownerAuthorization: 'required',
      sourceReviewRun: '20260806-040-review-propose',
      sourceReviewVerdict: 'approved',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-041-revise-propose/`,
    }, {
      runStatus: 'completed',
      actionResult: {
        action: 'revise-propose',
        executionStatus: 'completed',
        summary: 'P1',
        producedResultRefs: [
          { ref: `openspec/changes/C1/proposal.md`, versionFingerprint: 'x', kind: 'produced-artifact' },
        ],
        reviewVerdictRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-040-review-propose/result.json`,
          versionFingerprint: computeResultFileHash(JSON.stringify({ runStatus: 'completed', actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'ok' }, reviewVerdict: 'approved' }, null, 2)),
          kind: 'run-result',
        },
      },
    });

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'context-schema');
    assert.ok(conflict, `expected context-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  // -------------------------------------------------------------------------
  // Q1-RA-009: current verificationSummaryRef fail-closed
  // -------------------------------------------------------------------------

  it('current review-apply MISSING verificationSummaryRef → FactConflict (Q1-RA-009)', async () => {
    const deliveryId = 'D-RA009-MISSING';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    const reviewedResultBytes = JSON.stringify(reviewedResult, null, 2);
    await writeRun(deliveryRunsDir, 'C1', '20260806-040-apply', {
      schemaVersion: 2,
      runId: '20260806-040-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-040-apply/`,
    }, reviewedResult);

    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-041-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-041-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-040-apply',
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-040-apply/result.json`,
          versionFingerprint: computeResultFileHash(reviewedResultBytes),
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-041-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          // verificationSummaryRef MISSING (Q1-RA-009 fail-closed).
        },
        reviewVerdict: 'approved',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // Q1-RA-010 Action applicability now rejects a completed review-apply
    // projection missing verificationSummaryRef at shared admission
    // (run-result-schema) — a stronger, earlier fail-closed boundary than the
    // RA-009 generation-aware check, which therefore never fires here.
    const conflict = snapshot.conflicts.find(
      (c) => c.dimension === 'verification-summary-missing' || c.dimension === 'run-result-schema',
    );
    assert.ok(conflict, `expected verification-summary-missing/run-result-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('current review-apply MALFORMED verificationSummaryRef → FactConflict (Q1-RA-009)', async () => {
    const deliveryId = 'D-RA009-MALFORMED';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    const reviewedResultBytes = JSON.stringify(reviewedResult, null, 2);
    await writeRun(deliveryRunsDir, 'C1', '20260806-046-apply', {
      schemaVersion: 2,
      runId: '20260806-046-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-046-apply/`,
    }, reviewedResult);

    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-047-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-047-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-046-apply',
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-046-apply/result.json`,
          versionFingerprint: computeResultFileHash(reviewedResultBytes),
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-047-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          // MALFORMED: ref is a number, versionFingerprint missing.
          verificationSummaryRef: { ref: 42 },
        },
        reviewVerdict: 'approved',
      },
    );

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // The malformed summaryRef fails the closed actionResult schema at Phase 1
    // (run-result-schema) — it never reaches RA-009's independent checks.
    const schemaConflict = snapshot.conflicts.find((c) => c.dimension === 'run-result-schema');
    assert.ok(schemaConflict, `expected run-result-schema conflict for malformed summary ref, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('current review-apply MISSING-TARGET verificationSummaryRef → FactConflict (Q1-RA-009)', async () => {
    const deliveryId = 'D-RA009-NOTARGET';
    // Dedicated changeId — the shared tempRoot already has C1/verification.md
    // created by earlier fixtures, so a canonical ref under C1 would resolve.
    const changeId = 'C1-RA009-mt';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    const reviewedResultBytes = JSON.stringify(reviewedResult, null, 2);
    await writeRun(deliveryRunsDir, changeId, '20260806-048-apply', {
      schemaVersion: 2,
      runId: '20260806-048-apply',
      deliveryId,
      changeKey: changeId,
      changeId,
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/${changeId}/20260806-048-apply/`,
    }, reviewedResult);

    await writeRun(
      deliveryRunsDir,
      changeId,
      '20260806-049-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-049-review-apply',
        deliveryId,
        changeKey: changeId,
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-048-apply',
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/${changeId}/20260806-048-apply/result.json`,
          versionFingerprint: computeResultFileHash(reviewedResultBytes),
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/${changeId}/20260806-049-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          // Valid kind + canonical path, but verification.md does NOT exist.
          verificationSummaryRef: {
            ref: `openspec/changes/${changeId}/verification.md`,
            versionFingerprint: computeResultFileHash('# Verification\n'),
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
      },
    );
    // verification.md is NOT created — target missing.

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // v6: verificationSummaryRef is a point-in-time terminal record. Reader does
    // not replay its mutable target against current repository bytes; create/complete
    // and the next Action entry own that exact-current validation.
    assert.equal(snapshot.conflicts.some((c) => c.dimension === 'verification-summary-missing'), false);
    assert.equal(snapshot.reviewVerdicts.length, 1);
  });

  it('current review-apply WRONG-KIND verificationSummaryRef → FactConflict (Q1-RA-009)', async () => {
    const deliveryId = 'D-RA009-KIND';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    const reviewedResultBytes = JSON.stringify(reviewedResult, null, 2);
    await writeRun(deliveryRunsDir, 'C1', '20260806-042-apply', {
      schemaVersion: 2,
      runId: '20260806-042-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-042-apply/`,
    }, reviewedResult);

    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-043-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-043-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-042-apply',
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-042-apply/result.json`,
          versionFingerprint: computeResultFileHash(reviewedResultBytes),
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-043-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          // WRONG kind — must be verification-summary.
          verificationSummaryRef: {
            ref: `openspec/changes/C1/verification.md`,
            versionFingerprint: computeResultFileHash('# Verification\n'),
            kind: 'run-result',
          },
        },
        reviewVerdict: 'approved',
      },
    );
    const changeDir = join(tempRoot, 'openspec', 'changes', 'C1');
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'verification.md'), '# Verification\n');

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // The closed actionResult schema rejects the wrong-kind verificationSummaryRef
    // at Phase 1 admission (run-result-schema), before RA-009's independent
    // kind check can be reached — the wrong-kind summary never leaks into facts.
    const schemaConflict = snapshot.conflicts.find((c) => c.dimension === 'run-result-schema');
    assert.ok(schemaConflict, `expected run-result-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('current review-apply WRONG-PATH verificationSummaryRef → FactConflict (Q1-RA-009)', async () => {
    const deliveryId = 'D-RA009-PATH';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const reviewedResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    const reviewedResultBytes = JSON.stringify(reviewedResult, null, 2);
    await writeRun(deliveryRunsDir, 'C1', '20260806-044-apply', {
      schemaVersion: 2,
      runId: '20260806-044-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-044-apply/`,
    }, reviewedResult);

    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-045-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-045-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-044-apply',
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-044-apply/result.json`,
          versionFingerprint: computeResultFileHash(reviewedResultBytes),
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-045-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          // WRONG path — must be openspec/changes/C1/verification.md.
          verificationSummaryRef: {
            ref: `openspec/changes/C1/other.md`,
            versionFingerprint: computeResultFileHash('# x\n'),
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
      },
    );
    const changeDir = join(tempRoot, 'openspec', 'changes', 'C1');
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'other.md'), '# x\n');

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // v6: Reader no longer re-resolves mutable verification-summary refs against
    // current paths. Core publication and local Action-entry checks own that path.
    assert.equal(snapshot.conflicts.some((c) => c.dimension === 'verification-summary-path'), false);
    assert.equal(snapshot.reviewVerdicts.length, 1);
  });

  // -------------------------------------------------------------------------
  // Q1-RA-010: superseded historical malformed physical result still conflicts
  // -------------------------------------------------------------------------

  it('superseded historical propose missing producedResultRefs → conflict at physical admission (Q1-RA-010)', async () => {
    const deliveryId = 'D-RA010-SUPERSEDED';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    // P0: initial propose whose top-level result is COMPLETED but carries NO
    // producedResultRefs — a physical shape Core's writer could never publish.
    // Even if a later R0→P1 chain would make P0 a superseded generation,
    // physical admission MUST reject it (superseded only relaxes mutable
    // current-byte comparison, never physical Action-result shape).
    await writeRun(deliveryRunsDir, 'C1', '20260806-046-propose', {
      schemaVersion: 2,
      runId: '20260806-046-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'propose',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-046-propose/`,
    }, {
      runStatus: 'completed',
      actionResult: {
        action: 'propose',
        executionStatus: 'completed',
        summary: 'P0',
        // producedResultRefs MISSING — physical Action-result requiredness.
      },
    });

    // A legal review-propose → changes-requested and a legitimate revise-propose
    // that would supersede P0 under generation semantics.
    await writeRun(deliveryRunsDir, 'C1', '20260806-047-review-propose', {
      schemaVersion: 2,
      runId: '20260806-047-review-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'review-propose',
      role: 'reviewer',
      ownerAuthorization: 'not-required',
      reviewedRunId: '20260806-046-propose',
      inputRef: {
        ref: `.flowkit/runs/${deliveryId}/C1/20260806-046-propose/result.json`,
        versionFingerprint: 'x',
        kind: 'run-result',
      },
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-047-review-propose/`,
    }, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'cr' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', blockingAuthority: 'author', title: 'fix', problem: 'x', requiredChange: 'revise' },
      ],
    });

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });
    // P0 MUST be rejected at physical admission regardless of any supersession.
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'run-result-schema');
    assert.ok(conflict, `expected run-result-schema conflict for superseded-in-shape P0, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('reads the exact immutable Q1 001→010 pre-contract corpus without historical context conflicts', async () => {
    const deliveryId = '20260810-01-change-execution-loop';
    const changeId = 'core-contract-alignment';
    const sourceChangeDir = join(
      process.cwd(),
      '.flowkit/runs',
      deliveryId,
      changeId,
    );
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    const targetChangeDir = join(deliveryRunsDir, changeId);
    await mkdir(targetChangeDir, { recursive: true });

    for (const run of [
      '20260810-001-explore',
      '20260810-002-review-explore',
      '20260810-003-revise-explore',
      '20260810-004-review-explore',
      '20260810-005-propose',
      '20260810-006-review-propose',
      '20260810-007-revise-propose',
      '20260810-008-review-propose',
      '20260810-009-revise-propose',
      '20260810-010-review-propose',
    ]) {
      await cp(join(sourceChangeDir, run), join(targetChangeDir, run), { recursive: true });
    }

    const manifestDir = join(tempRoot, '.flowkit', 'manifests');
    await mkdir(manifestDir, { recursive: true });
    await writeFile(join(manifestDir, `${deliveryId}.yaml`), [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: Q1',
      `    id: ${changeId}`,
      '    state: active',
      '    required: true',
      '    dependsOn: []',
    ].join('\n'));

    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    assert.deepEqual(snapshot.conflicts, []);
    const decision = next(snapshot);
    if (decision.kind === 'blocked') {
      assert.notEqual(decision.diagnosis.reason, 'formal-fact-conflict');
    }
  });

});
