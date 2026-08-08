import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
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

    // Reviewed Run MUST exist so the C1 review's inputRef exact binding
    // (Q1-RA-006) can be proven.
    const reviewedResult = { runStatus: 'completed', actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' } };
    // writeRun serializes result.json with JSON.stringify(result, null, 2);
    // the fingerprint MUST hash the exact persisted bytes.
    const reviewedResultBytes = JSON.stringify(reviewedResult, null, 2);
    await writeRun(deliveryRunsDir, 'C1', '20260806-009-apply', {
      schemaVersion: 2,
      runId: '20260806-009-apply',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'apply',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-009-apply/`,
    }, reviewedResult);

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
        // Q1-RA-006: exact binding — inputRef over the reviewed result.json.
        inputRef: {
          ref: `.flowkit/runs/${deliveryId}/C1/20260806-009-apply/result.json`,
          versionFingerprint: computeResultFileHash(reviewedResultBytes),
          kind: 'run-result',
        },
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-010-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          // Q1-RA-009: a current review-apply MUST carry the Core-derived
          // verificationSummaryRef over the current verification.md bytes.
          verificationSummaryRef: {
            ref: `openspec/changes/C1/verification.md`,
            versionFingerprint: computeResultFileHash('# Verification\n'),
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
      },
    );

    // Current review-apply generation REQUIRES the current verification.md
    // (Q1-RA-009). Provide it so the valid-review fixture stays conflict-free.
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

    assert.equal(snapshot.runs.length, 2);
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
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-020-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
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
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-021-review-apply/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'cr',
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
    const missingConflict = snapshot.conflicts.find((c) => c.dimension === 'review-binding-missing');
    assert.ok(missingConflict, `expected review-binding-missing conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
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
    const schemaConflict = snapshot.conflicts.find((c) => c.dimension === 'run-result-schema');
    assert.ok(schemaConflict, `expected run-result-schema conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
    assert.equal(snapshot.runs.length, 0, 'wrong-kind consumed ref Run MUST NOT be admitted');
  });

  it('consumedInputRefs with missing target → FactConflict (Q1-RA-007)', async () => {
    const deliveryId = 'D-RA007-MISSING';
    const deliveryRunsDir = join(tempRoot, '.flowkit', 'runs', deliveryId);
    await writeRun(
      deliveryRunsDir,
      'C1',
      '20260806-031-revise-propose',
      {
        schemaVersion: 2,
        runId: '20260806-031-revise-propose',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-propose',
        role: 'author',
        ownerAuthorization: 'required',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-031-revise-propose/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-propose',
          executionStatus: 'completed',
          summary: 'P1',
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
      '20260806-034-revise-propose',
      {
        schemaVersion: 2,
        runId: '20260806-034-revise-propose',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-propose',
        role: 'author',
        ownerAuthorization: 'required',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-034-revise-propose/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-propose',
          executionStatus: 'completed',
          summary: 'P1',
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
      '20260806-032-revise-propose',
      {
        schemaVersion: 2,
        runId: '20260806-032-revise-propose',
        deliveryId,
        changeKey: 'C1',
        changeId: 'C1',
        action: 'revise-propose',
        role: 'author',
        ownerAuthorization: 'required',
        runPath: `.flowkit/runs/${deliveryId}/C1/20260806-032-revise-propose/`,
      },
      {
        runStatus: 'completed',
        actionResult: {
          action: 'revise-propose',
          executionStatus: 'completed',
          summary: 'P1',
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
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'verification-summary-missing');
    assert.ok(conflict, `expected verification-summary-missing conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
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
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'verification-summary-missing');
    assert.ok(conflict, `expected verification-summary-missing conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
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
    const conflict = snapshot.conflicts.find((c) => c.dimension === 'verification-summary-path');
    assert.ok(conflict, `expected verification-summary-path conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`);
  });
});
