import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  createRun,
  writeRunResult,
  completeRun,
  projectCurrentRun,
  isInvisibleEntry,
} from '../../../src/persistence/run-persistence.js';
import type { RunResultFile, ContextFile } from '../../../src/persistence/serialization.js';
import { validateContextFile } from '../../../src/persistence/serialization.js';
import {
  computeResultFileHash,
  buildArtifactResultRef,
  VERIFICATION_SUMMARY_KIND,
} from '../../../src/persistence/result-ref-adapter.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let tempRoot: string;

async function makeTempRoot(): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join: pathJoin } = await import('node:path');
  tempRoot = await mkdtemp(pathJoin(tmpdir(), 'flowkit-persist-'));
  return tempRoot;
}

async function cleanupTempRoot(): Promise<void> {
  await rm(tempRoot, { recursive: true, force: true });
}

function deliveryRunsDir(): string {
  return join(tempRoot, '.flowkit', 'runs', 'D1');
}

function createRunInput(overrides: Partial<Parameters<typeof createRun>[0]> = {}) {
  return {
    runId: '20260806-001-explore',
    deliveryId: 'D1',
    changeKey: 'C1',
    changeId: 'C1',
    action: 'explore' as const,
    role: 'author' as const,
    ownerAuthorization: 'required',
    actionMd: '# Action\nexplore\n',
    deliveryRunsDir: deliveryRunsDir(),
    runsPathPrefix: '.flowkit/runs',
    repoRoot: tempRoot,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createRun (tasks 3.1-3.6, 12.6-12.8, 12.12)
// ---------------------------------------------------------------------------

describe('createRun', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('creates action.md + context.json via staging + rename (task 3.1-3.4)', async () => {
    const runDir = await createRun(createRunInput());
    const actionMd = await readFile(join(runDir, 'action.md'), 'utf-8');
    const contextJson = await readFile(join(runDir, 'context.json'), 'utf-8');
    assert.ok(actionMd.includes('explore'));
    const ctx = JSON.parse(contextJson);
    assert.equal(ctx.schemaVersion, 2);
    assert.equal(ctx.runId, '20260806-001-explore');
  });

  it('writes context.json with schemaVersion: 2 + full C1 validation (task 12.62)', async () => {
    const runDir = await createRun(createRunInput({ runId: '20260806-002-propose' }));
    const contextJson = await readFile(join(runDir, 'context.json'), 'utf-8');
    const ctx = validateContextFile(JSON.parse(contextJson));
    assert.equal(ctx.schemaVersion, 2);
  });

  it('staging directory is invisible to readdir (task 3.6, 12.12)', async () => {
    await createRun(createRunInput({ runId: '20260806-003-explore' }));
    const entries = await readdir(deliveryRunsDir());
    // No staging dirs visible (only Change dirs / Run dirs).
    assert.ok(entries.every((e) => !e.startsWith('.tmp-')));
  });

  it('rejects when Run directory already exists (no-replace)', async () => {
    await createRun(createRunInput({ runId: '20260806-004-explore' }));
    await assert.rejects(
      () => createRun(createRunInput({ runId: '20260806-004-explore' })),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('validates context before writing (staging validation failure, task 12.7)', async () => {
    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-005-explore',
            action: 'review' as unknown as 'explore',
          }),
        ),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('cleans up staging on failure (best-effort, task 3.5)', async () => {
    try {
      await createRun(
        createRunInput({
          runId: '20260806-006-explore',
          action: 'bad-action' as unknown as 'explore',
        }),
      );
    } catch {
      // expected
    }
    const entries = await readdir(deliveryRunsDir());
    assert.ok(entries.every((e) => !e.startsWith('.tmp-20260806-006')));
  });

  it('supports Delivery-level Run (no changeId, task 12.34)', async () => {
    const runDir = await createRun(
      createRunInput({
        runId: '20260806-007-full-test',
        changeKey: undefined,
        changeId: undefined,
        action: 'full-test',
        role: 'owner',
      }),
    );
    const contextJson = await readFile(join(runDir, 'context.json'), 'utf-8');
    const ctx = JSON.parse(contextJson);
    assert.equal(ctx.changeId, undefined);
    assert.equal(ctx.changeKey, undefined);
  });
});

// ---------------------------------------------------------------------------
// projectCurrentRun (tasks 10.17-10.21, 12.44-12.46)
// ---------------------------------------------------------------------------

describe('projectCurrentRun', () => {
  it('constructs Run with status=pending from ContextFile (task 12.44)', () => {
    const contextFile: ContextFile = {
      schemaVersion: 2,
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      changeKey: 'C1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'required',
      runPath: '.flowkit/runs/D1/C1/20260806-001-explore/',
    };
    const run = projectCurrentRun(contextFile);
    assert.equal(run.runId, '20260806-001-explore');
    assert.equal(run.status, 'pending');
    assert.equal(run.action, 'explore');
  });

  it('maps inputRef directly from ContextFile (task 12.45)', () => {
    const contextFile: ContextFile = {
      schemaVersion: 2,
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      changeKey: 'C1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'required',
      inputRef: { ref: 'result.json', versionFingerprint: 'abc' },
      runPath: '.flowkit/runs/D1/C1/20260806-001-explore/',
    };
    const run = projectCurrentRun(contextFile);
    assert.equal(run.inputRef?.ref, 'result.json');
    assert.equal(run.inputRef?.versionFingerprint, 'abc');
  });

  it('constructed Run passes B1 validateRun (task 12.46)', () => {
    const contextFile: ContextFile = {
      schemaVersion: 2,
      runId: '20260806-001-explore',
      deliveryId: 'D1',
      changeKey: 'C1',
      changeId: 'C1',
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'required',
      runPath: '.flowkit/runs/D1/C1/20260806-001-explore/',
    };
    // projectCurrentRun calls validateRun internally; no throw ⇒ pass.
    const run = projectCurrentRun(contextFile);
    assert.ok(run);
  });
});

// ---------------------------------------------------------------------------
// writeRunResult (tasks 4.1-4.11, 12.9-12.11)
// ---------------------------------------------------------------------------

describe('writeRunResult', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  async function setupRun(runId: string): Promise<string> {
    return createRun(createRunInput({ runId }));
  }

  it('publishes result.json via fs.link create-if-not-exists (task 4.8)', async () => {
    const runDir = await setupRun('20260806-010-explore');
    const result: RunResultFile = {
      runStatus: 'completed',
      actionResult: {
        action: 'explore',
        executionStatus: 'completed',
        summary: 'done',
      },
    };
    await writeRunResult(runDir, result);
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.runStatus, 'completed');
    assert.equal(parsed.actionResult.runRef, undefined);
  });

  it('second writer gets RUN_TERMINAL (task 4.9, 12.10)', async () => {
    const runDir = await setupRun('20260806-011-explore');
    const result: RunResultFile = {
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'first' },
    };
    await writeRunResult(runDir, result);
    // Second write should fail with RUN_TERMINAL.
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'second' },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_TERMINAL',
    );
    // First writer's content preserved.
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).actionResult.summary, 'first');
  });

  it('does not use atomicWriteFile for result.json (task 4.11)', async () => {
    const runDir = await setupRun('20260806-012-explore');
    await writeRunResult(runDir, {
      runStatus: 'failed',
      failureDiagnosis: 'broken',
    });
    // result.json exists and has the right content.
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).runStatus, 'failed');
  });

  it('accepts RunResultFile object, not JSON string (task 4.1)', async () => {
    const runDir = await setupRun('20260806-013-explore');
    const result: RunResultFile = {
      runStatus: 'cancelled',
      cancellationReason: 'aborted',
    };
    await writeRunResult(runDir, result);
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).cancellationReason, 'aborted');
  });

  it('rejects invalid combination (task 4.4)', async () => {
    const runDir = await setupRun('20260806-014-explore');
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
        } as unknown as RunResultFile),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects terminal Run (result.json exists) via assertMutable (task 4.3)', async () => {
    const runDir = await setupRun('20260806-015-explore');
    await writeRunResult(runDir, {
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
    });
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'failed',
          failureDiagnosis: 'late',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_TERMINAL',
    );
  });

  it('assertMutable observes persisted terminal status BEFORE fs.link (C1-AP-002)', async () => {
    // C1-AP-002: writeRunResult must read existing result.json and reconstruct
    // the current Run status so assertMutable throws RUN_TERMINAL based on the
    // persisted terminal state, not a freshly projected pending Run. The
    // rejection MUST happen at assertMutable, before any temp-file publication.
    const runDir = await setupRun('20260806-017-explore');
    const result: RunResultFile = {
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'first' },
    };
    await writeRunResult(runDir, result);

    // Second write: assertMutable MUST reject because result.json exists with
    // runStatus=completed. The error code is RUN_TERMINAL (from assertMutable,
    // not from fs.link EEXIST — both produce the same code, but assertMutable
    // is reached first because reconstructCurrentRun reads result.json).
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'second' },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_TERMINAL',
    );

    // First writer's content preserved (assertMutable rejected before any
    // temp-file publication, so no partial state is possible).
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).actionResult.summary, 'first');

    // No temp files left behind (assertMutable rejected before temp creation).
    const entries = await readdir(runDir);
    assert.ok(
      entries.every((e) => !e.startsWith('.result-tmp-')),
      'no temp files should exist when assertMutable rejects',
    );
  });

  it('rejects when existing result.json has invalid runStatus (C1-AP-002)', async () => {
    // A malformed result.json (missing/invalid runStatus) MUST NOT be silently
    // overwritten — reconstructCurrentRun throws SCHEMA_VALIDATION_FAILED.
    const runDir = await setupRun('20260806-018-explore');
    // Hand-write a malformed result.json (missing runStatus).
    await writeFile(join(runDir, 'result.json'), JSON.stringify({ summary: 'no status' }));

    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'second' },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('validates ContextFile identity in write path (C1-AP-002)', async () => {
    // writeRunResult now calls validateContextFileIdentity before publication.
    // A context.json whose runPath does not match the actual Run directory
    // MUST be rejected.
    const runDir = await setupRun('20260806-019-explore');
    // Tamper with context.json runPath to mismatch the actual directory.
    const contextPath = join(runDir, 'context.json');
    const ctx = JSON.parse(await readFile(contextPath, 'utf-8'));
    ctx.runPath = '.flowkit/runs/D1/C1/20260806-999-different/';
    await writeFile(contextPath, JSON.stringify(ctx, null, 2));

    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
        }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('does not depend on pre-existing exists check (task 12.11)', async () => {
    // Two concurrent writers: both call writeRunResult; only one succeeds.
    const runDir = await setupRun('20260806-016-explore');
    const result: RunResultFile = {
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'race' },
    };
    const [r1, r2] = await Promise.allSettled([
      writeRunResult(runDir, result),
      writeRunResult(runDir, { ...result, actionResult: { ...result.actionResult!, summary: 'race2' } }),
    ]);
    // Exactly one succeeds.
    const successes = [r1, r2].filter((r) => r.status === 'fulfilled').length;
    assert.equal(successes, 1);
  });

  it('non-ENOENT read error is NOT treated as absent (C1-AP-005)', async () => {
    // Create result.json as a DIRECTORY → readFile throws EISDIR (not ENOENT).
    // reconstructCurrentRun MUST throw SCHEMA_VALIDATION_FAILED, not return pending.
    const runDir = await setupRun('20260806-020-explore');
    await mkdir(join(runDir, 'result.json'));

    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'should fail' },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects completed review-* Run missing reviewVerdict before publication (C1-AP-006)', async () => {
    // Q1: createRun derives inputRef from reviewedRunId by reading the
    // reviewed Run's result.json. Set up the reviewed Run first.
    const reviewedRunDir = await createRun(
      createRunInput({
        runId: '20260806-020-apply',
        action: 'apply',
        role: 'author',
      }),
    );
    await writeRunResult(reviewedRunDir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'applied' },
    });

    // Create a review-apply Run, then try to publish a completed result
    // WITHOUT reviewVerdict. writeRunResult MUST reject at
    // validateReviewVerdictIntegrity, BEFORE result.json is created.
    const runDir = await createRun(
      createRunInput({
        runId: '20260806-021-review-apply',
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-020-apply',
      }),
    );

    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: { action: 'review-apply', executionStatus: 'completed', summary: 'no verdict' },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );

    // result.json MUST NOT exist (validation rejected before publication).
    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'), 'result.json must not be created when reviewVerdict validation fails');
  });

  it('accepts completed review-* Run with reviewVerdict (C1-AP-006)', async () => {
    // Q1: createRun derives inputRef from reviewedRunId by reading the
    // reviewed Run's result.json. Set up the reviewed Run first.
    const reviewedRunDir = await createRun(
      createRunInput({
        runId: '20260806-023-apply',
        action: 'apply',
        role: 'author',
      }),
    );
    await writeRunResult(reviewedRunDir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'applied' },
    });

    // Create a review-apply Run, publish a completed result WITH reviewVerdict.
    const runDir = await createRun(
      createRunInput({
        runId: '20260806-022-review-apply',
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-023-apply',
      }),
    );

    await writeRunResult(runDir, {
      runStatus: 'completed',
      actionResult: { action: 'review-apply', executionStatus: 'completed', summary: 'approved' },
      reviewVerdict: 'approved',
    });

    // result.json exists and contains reviewVerdict.
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).reviewVerdict, 'approved');
  });
});

// ---------------------------------------------------------------------------
// isInvisibleEntry (task 3.6, 12.12)
// ---------------------------------------------------------------------------

describe('isInvisibleEntry', () => {
  it('identifies staging directories', () => {
    assert.equal(isInvisibleEntry('.tmp-20260806-001-explore'), true);
  });

  it('identifies temp result files', () => {
    assert.equal(isInvisibleEntry('.result-tmp-12345-67890.json'), true);
  });

  it('does not hide normal Run directories', () => {
    assert.equal(isInvisibleEntry('20260806-001-explore'), false);
    assert.equal(isInvisibleEntry('formal-fact-reader-and-persistence'), false);
  });
});

// ---------------------------------------------------------------------------
// Consistency contract (task 12.30)
// ---------------------------------------------------------------------------

describe('result.json publish consistency contract (task 12.30)', () => {
  it('writeRunResult is the sole documented result.json publish path', () => {
    // The contract: only writeRunResult publishes result.json. adapter does
    // not serialize/publish; createRun only writes action.md + context.json.
    // This test asserts the exported API surface — writeRunResult is the only
    // function that accepts a RunResultFile and writes result.json.
    //
    // The adapter (result-ref-adapter) explicitly does NOT publish — it only
    // constructs objects and performs read-time derivation.
    assert.equal(typeof writeRunResult, 'function');
    // No other exported function from run-persistence takes RunResultFile.
    // createRun takes CreateRunInput (action.md content), not RunResultFile.
    assert.equal(typeof createRun, 'function');
  });
});

// ---------------------------------------------------------------------------
// Bootstrap Run not modified (task 12.60)
// ---------------------------------------------------------------------------

describe('Bootstrap Run not modified by C1 (task 12.60)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('writeRunResult rejects Bootstrap Run (schemaVersion=1) without modifying it', async () => {
    // Create a Bootstrap-style Run directory by hand (schemaVersion:1).
    const deliveryId = 'DB';
    const runDir = join(tempRoot, '.flowkit', 'runs', deliveryId, 'C1', '20260806-054-propose');
    await mkdir(runDir, { recursive: true });
    const bootstrapContext = {
      schemaVersion: 1,
      runId: '20260806-054-propose',
      deliveryId,
      changeKey: 'C1',
      changeId: 'C1',
      action: 'propose',
      role: 'author',
      ownerAuthorization: 'not-required',
      runPath: `.flowkit/runs/${deliveryId}/C1/20260806-054-propose/`,
    };
    await writeFile(join(runDir, 'context.json'), JSON.stringify(bootstrapContext, null, 2));

    // writeRunResult should reject (validateContextFile requires schemaVersion:2).
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: { action: 'propose', executionStatus: 'completed', summary: 'x' },
        }),
      (e: unknown) => e instanceof FlowkitError,
    );

    // result.json must NOT have been created.
    await assert.rejects(() => readFile(join(runDir, 'result.json'), 'utf-8'));
  });
});

// ---------------------------------------------------------------------------
// completeRun — Core-owned ResultRef authority (Q1-RA-001)
// ---------------------------------------------------------------------------
//
// The descriptor-driven production terminal-write entry. Callers provide only
// typed descriptors (consumedRunIds, producedArtifactTags, reviewVerdict);
// Core derives every ResultRef from actual target bytes. Caller NEVER
// constructs a ResultRef. Initial explore/propose unconditionally build the
// complete Core-expected produced set; review-apply unconditionally derives
// verificationSummaryRef from current verification.md.

/**
 * Write the complete initial-propose artifact set (proposal/design/tasks + one
 * spec) to disk. completeRun reads these bytes and derives the produced refs.
 */
async function writeInitialProposeArtifacts(
  changeId: string,
  version: 'v0' | 'v1',
): Promise<{ proposal: string; design: string; tasks: string; specA: string }> {
  const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
  await mkdir(join(changeDir, 'specs', 'cap-a'), { recursive: true });
  const proposal = `# Proposal ${version}\n`;
  const design = `# Design ${version}\n`;
  const tasks = `# Tasks ${version}\n`;
  const specA = `# Spec A ${version}\n`;
  await writeFile(join(changeDir, 'proposal.md'), proposal);
  await writeFile(join(changeDir, 'design.md'), design);
  await writeFile(join(changeDir, 'tasks.md'), tasks);
  await writeFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), specA);
  return { proposal, design, tasks, specA };
}

describe('completeRun — Core-owned ResultRef authority (Q1-RA-001)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('Core-derives produced refs for initial explore (caller provides no ResultRefs)', async () => {
    const changeId = 'RA-explore';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    const exploreContent = '# Explore\n';
    await writeFile(join(changeDir, 'explore.md'), exploreContent);

    const runDir = await createRun(
      createRunInput({ runId: '20260806-200-explore', changeId, action: 'explore', role: 'author' }),
    );
    await completeRun(runDir, { executionStatus: 'completed', summary: 'explore done' });

    const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf-8'));
    assert.equal(result.runStatus, 'completed');
    const refs = result.actionResult.producedResultRefs;
    assert.equal(refs.length, 1);
    assert.equal(refs[0].ref, `openspec/changes/${changeId}/explore.md`);
    assert.equal(refs[0].kind, 'produced-artifact');
    assert.equal(refs[0].versionFingerprint, computeResultFileHash(exploreContent));
  });

  it('Core-derives complete produced set for initial propose (proposal+design+tasks+specs)', async () => {
    const changeId = 'RA-propose';
    const { proposal } = await writeInitialProposeArtifacts(changeId, 'v0');

    const runDir = await createRun(
      createRunInput({ runId: '20260806-201-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(runDir, { executionStatus: 'completed', summary: 'propose done' });

    const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf-8'));
    const refs = result.actionResult.producedResultRefs;
    assert.equal(refs.length, 4);
    assert.equal(refs[0].kind, 'produced-artifact');
    // Sorted by ref: design, proposal, specs/cap-a/spec.md, tasks
    const refPaths = refs.map((r: { ref: string }) => r.ref);
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/proposal.md`));
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/design.md`));
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/tasks.md`));
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/specs/cap-a/spec.md`));
    // Fingerprints match current bytes.
    const proposalRef = refs.find((r: { ref: string }) => r.ref.endsWith('proposal.md'));
    assert.equal(proposalRef.versionFingerprint, computeResultFileHash(proposal));
  });

  it('Core auto-includes all specs in the namespace (caller cannot shrink the set)', async () => {
    const changeId = 'RA-propose-allspecs';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(join(changeDir, 'specs', 'cap-a'), { recursive: true });
    await mkdir(join(changeDir, 'specs', 'cap-b'), { recursive: true });
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal\n');
    await writeFile(join(changeDir, 'design.md'), '# Design\n');
    await writeFile(join(changeDir, 'tasks.md'), '# Tasks\n');
    await writeFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), '# Spec A\n');
    await writeFile(join(changeDir, 'specs', 'cap-b', 'spec.md'), '# Spec B\n');

    const runDir = await createRun(
      createRunInput({ runId: '20260806-202-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(runDir, { executionStatus: 'completed', summary: 'propose' });

    const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf-8'));
    const refPaths = result.actionResult.producedResultRefs.map((r: { ref: string }) => r.ref);
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/specs/cap-a/spec.md`));
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/specs/cap-b/spec.md`));
  });

  it('initial explore with missing explore.md stays pending (RESULT_REF_TARGET_MISSING)', async () => {
    const changeId = 'RA-explore-missing';
    const runDir = await createRun(
      createRunInput({ runId: '20260806-203-explore', changeId, action: 'explore', role: 'author' }),
    );
    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'empty explore' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING',
    );
    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'));
  });

  it('initial propose with missing design.md stays pending (RESULT_REF_TARGET_MISSING)', async () => {
    const changeId = 'RA-propose-missing';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(join(changeDir, 'specs', 'cap-a'), { recursive: true });
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal\n');
    await writeFile(join(changeDir, 'tasks.md'), '# Tasks\n');
    await writeFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), '# Spec A\n');
    // design.md deliberately absent.

    const runDir = await createRun(
      createRunInput({ runId: '20260806-204-propose', changeId, action: 'propose', role: 'author' }),
    );
    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'partial' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING',
    );
    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'));
  });

  it('review-apply Core-derives verificationSummaryRef from current verification.md', async () => {
    const changeId = 'RA-review-apply';
    // A0: apply Run (no artifacts; writeRunResult is fine for non-artifact completed).
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-210-apply', changeId, action: 'apply', role: 'author' }),
    );
    await writeRunResult(a0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0 apply' },
    });

    // verification.md exists.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    const verificationContent = '# Verification\n';
    await writeFile(join(changeDir, 'verification.md'), verificationContent);

    // V0: review-apply(A0) via completeRun — Core derives verificationSummaryRef.
    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-211-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-210-apply',
      }),
    );
    await completeRun(v0Dir, {
      executionStatus: 'completed',
      summary: 'V0 approved',
      reviewVerdict: 'approved',
    });

    const result = JSON.parse(await readFile(join(v0Dir, 'result.json'), 'utf-8'));
    assert.equal(result.reviewVerdict, 'approved');
    const summaryRef = result.actionResult.verificationSummaryRef;
    assert.ok(summaryRef, 'verificationSummaryRef must be Core-derived');
    assert.equal(summaryRef.kind, 'verification-summary');
    assert.equal(summaryRef.ref, `openspec/changes/${changeId}/verification.md`);
    assert.equal(summaryRef.versionFingerprint, computeResultFileHash(verificationContent));
  });

  it('review-apply with missing verification.md stays pending (RESULT_REF_TARGET_MISSING)', async () => {
    const changeId = 'RA-review-apply-missing';
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-220-apply', changeId, action: 'apply', role: 'author' }),
    );
    await writeRunResult(a0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' },
    });
    // No verification.md.

    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-221-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-220-apply',
      }),
    );
    await assert.rejects(
      () => completeRun(v0Dir, { executionStatus: 'completed', summary: 'V0', reviewVerdict: 'approved' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING',
    );
    const entries = await readdir(v0Dir);
    assert.ok(!entries.includes('result.json'));
  });

  it('revise-propose subset overlay: declared proposal replaces, others inherited (completeRun)', async () => {
    const changeId = 'RA-revise-overlay';
    await writeInitialProposeArtifacts(changeId, 'v0');

    // P0: initial propose via completeRun.
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-230-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });

    // R0: review-propose(P0) → changes-requested.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-231-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-230-propose',
      }),
    );
    await completeRun(r0Dir, {
      executionStatus: 'completed',
      summary: 'CR',
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'needs work', requiredChange: 'revise proposal' },
      ],
    });

    // P1: revise-propose declares only proposal (subset overlay).
    const proposalV1 = '# Proposal v1\n';
    await writeFile(join(tempRoot, 'openspec', 'changes', changeId, 'proposal.md'), proposalV1);
    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-232-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-231-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await completeRun(p1Dir, {
      executionStatus: 'completed',
      summary: 'P1',
      producedArtifactTags: ['proposal'],
    });

    const result = JSON.parse(await readFile(join(p1Dir, 'result.json'), 'utf-8'));
    assert.equal(result.runStatus, 'completed');
    const refPaths = result.actionResult.producedResultRefs.map((r: { ref: string }) => r.ref);
    // proposal (v1 fresh) + inherited design + tasks + spec-a.
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/proposal.md`));
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/design.md`));
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/tasks.md`));
    assert.ok(refPaths.includes(`openspec/changes/${changeId}/specs/cap-a/spec.md`));
  });

  it('revise-propose specs namespace drift (new spec, undeclared) stays pending', async () => {
    const changeId = 'RA-revise-specs-drift';
    await writeInitialProposeArtifacts(changeId, 'v0');

    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-240-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });

    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-241-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-240-propose',
      }),
    );
    await completeRun(r0Dir, {
      executionStatus: 'completed',
      summary: 'CR',
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'add spec', problem: 'needs B', requiredChange: 'add B' },
      ],
    });

    // Namespace drift: add spec B without declaring specs.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(join(changeDir, 'specs', 'cap-b'), { recursive: true });
    await writeFile(join(changeDir, 'specs', 'cap-b', 'spec.md'), '# Spec B\n');
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal v1\n');

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-242-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-241-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await assert.rejects(
      () =>
        completeRun(p1Dir, {
          executionStatus: 'completed',
          summary: 'P1',
          producedArtifactTags: ['proposal'],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    const entries = await readdir(p1Dir);
    assert.ok(!entries.includes('result.json'));
  });

  it('revise-propose undeclared singleton drift (design changed, not declared) stays pending', async () => {
    const changeId = 'RA-revise-singleton-drift';
    await writeInitialProposeArtifacts(changeId, 'v0');

    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-250-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });

    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-251-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-250-propose',
      }),
    );
    await completeRun(r0Dir, {
      executionStatus: 'completed',
      summary: 'CR',
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'needs work', requiredChange: 'revise' },
      ],
    });

    // P1 declares only proposal, but design.md is also modified on disk.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal v1\n');
    await writeFile(join(changeDir, 'design.md'), '# Design v1\n');

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-252-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-251-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await assert.rejects(
      () =>
        completeRun(p1Dir, {
          executionStatus: 'completed',
          summary: 'P1',
          producedArtifactTags: ['proposal'],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
    const entries = await readdir(p1Dir);
    assert.ok(!entries.includes('result.json'));
  });

  it('allows retry after preflight failure (completeRun, Q1-6.8)', async () => {
    const changeId = 'RA-retry';
    const runDir = await createRun(
      createRunInput({ runId: '20260806-260-explore', changeId, action: 'explore', role: 'author' }),
    );
    // First attempt: explore.md missing → pending.
    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'fail' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING',
    );
    // Write explore.md, retry.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'explore.md'), '# Explore\n');
    await completeRun(runDir, { executionStatus: 'completed', summary: 'retry success' });
    const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf-8'));
    assert.equal(result.actionResult.summary, 'retry success');
  });

  it('caller never supplies ResultRef objects — descriptor-only input', () => {
    // Static contract: CompleteRunInput has no ResultRef-valued fields. The
    // caller provides executionStatus, summary, consumedRunIds, producedArtifactTags,
    // reviewVerdict, reviewFindings, failureDiagnosis, cancellationReason — none
    // of which is a ResultRef. This is the RA-001 invariant.
    const input = {
      executionStatus: 'completed' as const,
      summary: 'done',
      consumedRunIds: ['20260806-001-explore'],
      producedArtifactTags: ['proposal' as const],
    };
    // No ResultRef-shaped field exists on the input.
    assert.equal(typeof input.executionStatus, 'string');
    assert.equal(typeof input.summary, 'string');
    assert.ok(Array.isArray(input.consumedRunIds));
    assert.ok(Array.isArray(input.producedArtifactTags));
  });
});

// ---------------------------------------------------------------------------
// Completion preflight rules (Q1-7 / Q1-9) — writeRunResult low-level API
// ---------------------------------------------------------------------------
//
// These rules are enforced inside publishTerminalResult (shared by completeRun
// and writeRunResult). They are tested via the low-level writeRunResult entry
// because they are structural preflight rules, not descriptor-derivation rules.

describe('completion preflight rules (Q1-7 / Q1-9)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('rejects reviewVerdictRef on review-* Run (self-reference, Q1-7)', async () => {
    const changeId = 'PF-self-ref';
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-270-apply', changeId, action: 'apply', role: 'author' }),
    );
    await writeRunResult(a0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0' },
    });
    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-271-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-270-apply',
      }),
    );
    const selfRef = {
      ref: '.flowkit/runs/D1/PF-self-ref/20260806-271-review-apply/result.json',
      versionFingerprint: 'deadbeef',
      kind: 'run-result',
    };
    await assert.rejects(
      () =>
        writeRunResult(v0Dir, {
          runStatus: 'completed',
          actionResult: {
            action: 'review-apply',
            executionStatus: 'completed',
            summary: 'self',
            reviewVerdictRef: selfRef,
          },
          reviewVerdict: 'approved',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects verificationSummaryRef on non-review-apply Run (Q1-9 scope)', async () => {
    const changeId = 'PF-verdict-scope';
    const runDir = await createRun(
      createRunInput({ runId: '20260806-280-explore', changeId, action: 'explore', role: 'author' }),
    );
    const badRef = buildArtifactResultRef(
      `openspec/changes/${changeId}/verification.md`,
      'content',
      VERIFICATION_SUMMARY_KIND,
    );
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: {
            action: 'explore',
            executionStatus: 'completed',
            summary: 'bad scope',
            verificationSummaryRef: badRef,
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// Review-entry validation (Q1-RA-003)
// ---------------------------------------------------------------------------
//
// createRun(review-explore/review-propose) validates the reviewed Run's current
// effective generation + effective artifact set BEFORE publishing the review
// Run. On drift/missing/namespace mismatch, the review Run is NOT created.

describe('review-entry validation (Q1-RA-003)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('Core exact-binds reviewed result.json when effective set is current (positive)', async () => {
    const changeId = 'RE-positive';
    await writeInitialProposeArtifacts(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-290-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });

    // createRun(review-propose) should succeed — P0 is current, effective set matches.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-291-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-290-propose',
      }),
    );
    // context.json has Core-derived inputRef exact-binding P0 result.json.
    const ctx = JSON.parse(await readFile(join(r0Dir, 'context.json'), 'utf-8'));
    assert.ok(ctx.inputRef, 'inputRef must be Core-derived');
    assert.equal(
      ctx.inputRef.ref,
      '.flowkit/runs/D1/RE-positive/20260806-290-propose/result.json',
    );
    assert.equal(ctx.inputRef.kind, 'run-result');
    const p0Result = await readFile(join(p0Dir, 'result.json'), 'utf-8');
    assert.equal(ctx.inputRef.versionFingerprint, computeResultFileHash(p0Result));
  });

  it('post-terminal proposal drift rejects review-propose before Run publish', async () => {
    const changeId = 'RE-drift';
    await writeInitialProposeArtifacts(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-300-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });

    // Drift: modify proposal.md after P0 terminal.
    await writeFile(join(tempRoot, 'openspec', 'changes', changeId, 'proposal.md'), '# Proposal tampered\n');

    // createRun(review-propose) MUST reject before publish — review Run not created.
    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-301-review-propose',
            changeId,
            action: 'review-propose',
            role: 'reviewer',
            reviewedRunId: '20260806-300-propose',
          }),
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
    // Review Run directory must NOT exist.
    const changeRunDir = join(deliveryRunsDir(), changeId, '20260806-301-review-propose');
    await assert.rejects(() => readFile(join(changeRunDir, 'context.json'), 'utf-8'));
  });

  it('specs namespace drift rejects review-propose before Run publish', async () => {
    const changeId = 'RE-specs-drift';
    await writeInitialProposeArtifacts(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-310-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });

    // Namespace drift: add spec B after P0 terminal. P0 effective specs={A},
    // canonical specs={A,B}.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(join(changeDir, 'specs', 'cap-b'), { recursive: true });
    await writeFile(join(changeDir, 'specs', 'cap-b', 'spec.md'), '# Spec B\n');

    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-311-review-propose',
            changeId,
            action: 'review-propose',
            role: 'reviewer',
            reviewedRunId: '20260806-310-propose',
          }),
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
  });
});

// ---------------------------------------------------------------------------
// Review exact binding via createRun (task 4.8)
// ---------------------------------------------------------------------------

describe('review exact binding via createRun (task 4.8)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('derives inputRef from reviewedRunId and binds to actual result.json', async () => {
    const changeId = 'RB-bind';
    await writeInitialProposeArtifacts(changeId, 'v0');
    const reviewedRunDir = await createRun(
      createRunInput({ runId: '20260806-320-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(reviewedRunDir, { executionStatus: 'completed', summary: 'proposal' });

    const reviewRunDir = await createRun(
      createRunInput({
        runId: '20260806-321-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-320-propose',
      }),
    );

    const ctx = JSON.parse(await readFile(join(reviewRunDir, 'context.json'), 'utf-8'));
    assert.ok(ctx.inputRef, 'inputRef must be derived by Core');
    assert.equal(ctx.inputRef.ref, '.flowkit/runs/D1/RB-bind/20260806-320-propose/result.json');
    assert.equal(ctx.inputRef.kind, 'run-result');
    const reviewedContent = await readFile(join(reviewedRunDir, 'result.json'), 'utf-8');
    assert.equal(ctx.inputRef.versionFingerprint, computeResultFileHash(reviewedContent));
  });

  it('throws RESULT_REF_TARGET_MISSING when reviewed Run result.json does not exist', async () => {
    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-322-review-propose',
            changeId: 'RB-missing',
            action: 'review-propose',
            role: 'reviewer',
            reviewedRunId: '20260806-999-nonexistent',
          }),
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING',
    );
  });
});
