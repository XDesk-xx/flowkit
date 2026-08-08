import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';

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
  await writeFile(join(runDir, 'context.json'), JSON.stringify(context, null, 2));
  if (result !== undefined) {
    await writeFile(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
  }
  await writeFile(join(runDir, 'action.md'), `# ${runId}\n`);
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
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-010-review-apply',
      {
        schemaVersion: 2,
        runId: '20260806-010-review-apply',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'review-apply',
        role: 'reviewer',
        ownerAuthorization: 'not-required',
        reviewedRunId: '20260806-009-apply',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-010-review-apply/`,
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

    assert.equal(snapshot.runs.length, 1);
    assert.equal(snapshot.reviewVerdicts.length, 1);
    const v = snapshot.reviewVerdicts[0]!;
    assert.equal(v.reviewRunId, '20260806-010-review-apply');
    assert.equal(v.verdict, 'approved');
    assert.equal(v.reviewedRunId, '20260806-009-apply');
    assert.equal(snapshot.conflicts.length, 0);
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

  it('current-generation propose with EMPTY produced set → FactConflict (Q1-RA-003)', async () => {
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
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'artifact-effective-set-incomplete');
    assert.ok(conflict, `expected artifact-effective-set-incomplete conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });

  it('current-generation propose with PARTIAL produced set (missing design.md) → FactConflict (Q1-RA-003)', async () => {
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
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'artifact-effective-set-incomplete');
    assert.ok(conflict, `expected artifact-effective-set-incomplete conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });
});
