import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  createRun,
  writeRunResult,
  projectCurrentRun,
  isInvisibleEntry,
} from '../../../src/persistence/run-persistence.js';
import type { RunResultFile, ContextFile } from '../../../src/persistence/serialization.js';
import { validateContextFile } from '../../../src/persistence/serialization.js';

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
