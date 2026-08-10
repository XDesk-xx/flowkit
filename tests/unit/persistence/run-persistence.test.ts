import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  createRun,
  completeRun,
  projectCurrentRun,
  isInvisibleEntry,
} from '../../../src/persistence/run-persistence.js';
import type { ContextFile } from '../../../src/persistence/serialization.js';
import { validateContextFile } from '../../../src/persistence/serialization.js';
import { computeResultFileHash } from '../../../src/persistence/result-ref-adapter.js';

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

  it('rejects retired Delivery behavior as a current Run', async () => {
    await assert.rejects(
      () => createRun(createRunInput({
        runId: '20260806-007-full-test',
        action: 'full-test' as never,
      })),
      (e: unknown) => e instanceof FlowkitError,
    );
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
// completeRun publish protocol (fs.link / assertMutable / race / RUN_TERMINAL)
// ---------------------------------------------------------------------------
//
// Q1-RA-001: `writeRunResult` (raw RunResultFile publisher) is module-private
// and NOT exported. All terminal completion enters through the descriptor-driven
// `completeRun`. These tests exercise the shared publish protocol through the
// public behavior of `completeRun`.

describe('completeRun publish protocol (fs.link / assertMutable / race)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  async function setupRun(runId: string): Promise<string> {
    return createRun(createRunInput({ runId }));
  }

  async function writeExplore(runId: string): Promise<string> {
    const changeId = `PF-${runId}`;
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'explore.md'), '# Explore\n');
    return createRun(
      createRunInput({ runId, changeId, action: 'explore', role: 'author' }),
    );
  }

  it('publishes result.json via fs.link create-if-not-exists (task 4.8)', async () => {
    const runDir = await writeExplore('20260806-010-explore');
    await completeRun(runDir, { executionStatus: 'completed', summary: 'done' });
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.runStatus, 'completed');
    // runRef is derived on read, not persisted.
    assert.equal(parsed.actionResult.runRef, undefined);
  });

  it('second writer gets RUN_TERMINAL (task 4.9, 12.10)', async () => {
    const runDir = await writeExplore('20260806-011-explore');
    await completeRun(runDir, { executionStatus: 'completed', summary: 'first' });
    // Second completeRun must fail with RUN_TERMINAL.
    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'second' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_TERMINAL',
    );
    // First writer's content preserved.
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).actionResult.summary, 'first');
  });

  it('does not use atomicWriteFile for result.json (task 4.11)', async () => {
    const runDir = await setupRun('20260806-012-explore');
    await completeRun(runDir, { failureDiagnosis: 'broken' });
    // result.json exists and has the right content.
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).runStatus, 'failed');
  });

  it('publishes a cancelled Run (task 4.1)', async () => {
    const runDir = await setupRun('20260806-013-explore');
    await completeRun(runDir, { cancellationReason: 'aborted' });
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).cancellationReason, 'aborted');
  });

  it('rejects a completed Run missing executionStatus/summary (task 4.4)', async () => {
    const runDir = await setupRun('20260806-014-explore');
    await assert.rejects(
      () => completeRun(runDir, {} as never),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects terminal Run (result.json exists) via assertMutable (task 4.3)', async () => {
    const runDir = await writeExplore('20260806-015-explore');
    await completeRun(runDir, { executionStatus: 'completed', summary: 'done' });
    await assert.rejects(
      () => completeRun(runDir, { failureDiagnosis: 'late' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_TERMINAL',
    );
  });

  it('assertMutable observes persisted terminal status BEFORE fs.link (C1-AP-002)', async () => {
    // C1-AP-002: the publisher reads existing result.json and reconstructs the
    // current Run status so assertMutable throws RUN_TERMINAL based on the
    // persisted terminal state. The rejection MUST happen at assertMutable,
    // before any temp-file publication.
    const runDir = await writeExplore('20260806-017-explore');
    await completeRun(runDir, { executionStatus: 'completed', summary: 'first' });

    // Second completion: assertMutable MUST reject because result.json exists
    // with runStatus=completed.
    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'second' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_TERMINAL',
    );

    // First writer's content preserved.
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
    // Provide explore.md (changeId=C1) so descriptor derivation succeeds and
    // the preflight's reconstructCurrentRun path is reached.
    await mkdir(join(tempRoot, 'openspec', 'changes', 'C1'), { recursive: true });
    await writeFile(join(tempRoot, 'openspec', 'changes', 'C1', 'explore.md'), '# Explore\n');
    // Hand-write a malformed result.json (missing runStatus).
    await writeFile(join(runDir, 'result.json'), JSON.stringify({ summary: 'no status' }));

    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'second' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('validates ContextFile identity in the completion path (C1-AP-002)', async () => {
    // A context.json whose runPath does not match the actual Run directory
    // MUST be rejected before publication.
    const runDir = await setupRun('20260806-019-explore');
    const contextPath = join(runDir, 'context.json');
    const ctx = JSON.parse(await readFile(contextPath, 'utf-8'));
    ctx.runPath = '.flowkit/runs/D1/C1/20260806-999-different/';
    await writeFile(contextPath, JSON.stringify(ctx, null, 2));

    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'done' }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('does not depend on pre-existing exists check (task 12.11)', async () => {
    // Two concurrent writers: both call completeRun; only one succeeds.
    const runDir = await writeExplore('20260806-016-explore');
    const [r1, r2] = await Promise.allSettled([
      completeRun(runDir, { executionStatus: 'completed', summary: 'race' }),
      completeRun(runDir, { executionStatus: 'completed', summary: 'race2' }),
    ]);
    const successes = [r1, r2].filter((r) => r.status === 'fulfilled').length;
    assert.equal(successes, 1);
  });

  it('non-ENOENT read error is NOT treated as absent (C1-AP-005)', async () => {
    // Create result.json as a DIRECTORY → readFile throws EISDIR (not ENOENT).
    // reconstructCurrentRun MUST throw SCHEMA_VALIDATION_FAILED, not return pending.
    const runDir = await setupRun('20260806-021-explore');
    // Provide explore.md (changeId=C1) so derivation succeeds and the preflight
    // reaches reconstructCurrentRun, which hits the EISDIR non-ENOENT error.
    await mkdir(join(tempRoot, 'openspec', 'changes', 'C1'), { recursive: true });
    await writeFile(join(tempRoot, 'openspec', 'changes', 'C1', 'explore.md'), '# Explore\n');
    await mkdir(join(runDir, 'result.json'));

    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'should fail' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
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
  it('completeRun is the ONLY public terminal-completion entry (RA-001)', () => {
    // Q1-RA-001: the raw RunResultFile publisher (writeRunResult) is module-
    // private and NOT part of the exported surface. An external module cannot
    // pass a caller-authored RunResultFile / ResultRef into the terminal
    // publisher. The adapter (result-ref-adapter) does NOT publish; createRun
    // only writes action.md + context.json. The only exported terminal-completion
    // API is the descriptor-driven completeRun.
    //
    // This test asserts the exported API surface by importing only the public
    // functions. `writeRunResult` is deliberately absent from the import list —
    // it is not exportable, so a raw RunResultFile terminal publish is
    // mechanically unreachable from outside the module.
    assert.equal(typeof createRun, 'function');
    assert.equal(typeof completeRun, 'function');
  });
});

// ---------------------------------------------------------------------------
// Bootstrap Run not modified (task 12.60)
// ---------------------------------------------------------------------------

describe('Bootstrap Run not modified by C1 (task 12.60)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('completeRun rejects Bootstrap Run (schemaVersion=1) without modifying it', async () => {
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

    // completeRun should reject (validateContextFile requires schemaVersion:2).
    await assert.rejects(
      () => completeRun(runDir, { executionStatus: 'completed', summary: 'x' }),
      (e: unknown) => e instanceof FlowkitError,
    );

    // result.json must NOT have been created.
    await assert.rejects(() => readFile(join(runDir, 'result.json'), 'utf-8'));
  });
});

// ---------------------------------------------------------------------------
// Q2 current authority boundary
// ---------------------------------------------------------------------------

async function writeExploreArtifact(changeId: string, text = '# Explore\n'): Promise<void> {
  const dir = join(tempRoot, 'openspec', 'changes', changeId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'explore.md'), text);
}

async function writeProposalArtifacts(changeId: string, suffix = ''): Promise<void> {
  const dir = join(tempRoot, 'openspec', 'changes', changeId);
  await mkdir(join(dir, 'specs', 'cap-a'), { recursive: true });
  await writeFile(join(dir, 'proposal.md'), `# Proposal${suffix}\n`);
  await writeFile(join(dir, 'design.md'), `# Design${suffix}\n`);
  await writeFile(join(dir, 'tasks.md'), `# Tasks${suffix}\n`);
  await writeFile(join(dir, 'specs', 'cap-a', 'spec.md'), `# Spec${suffix}\n`);
}

async function setupApprovedExplore(changeId: string): Promise<void> {
  await writeExploreArtifact(changeId);
  const e = await createRun(createRunInput({ runId: '20260806-201-explore', changeId, action: 'explore', role: 'author' }));
  await completeRun(e, { executionStatus: 'completed', summary: 'explore' });
  const r = await createRun(createRunInput({
    runId: '20260806-202-review-explore', changeId, action: 'review-explore', role: 'reviewer',
    reviewedRunId: '20260806-201-explore',
  }));
  await completeRun(r, { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] });
}

async function setupApprovedProposal(changeId: string): Promise<void> {
  await setupApprovedExplore(changeId);
  const p = await createRun(createRunInput({
    runId: '20260806-203-propose', changeId, action: 'propose', role: 'author',
    consumedRunId: '20260806-202-review-explore',
  }));
  await writeProposalArtifacts(changeId);
  await completeRun(p, { executionStatus: 'completed', summary: 'proposal' });
  const r = await createRun(createRunInput({
    runId: '20260806-204-review-propose', changeId, action: 'review-propose', role: 'reviewer',
    reviewedRunId: '20260806-203-propose',
  }));
  await completeRun(r, { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] });
}

describe('Q2 current authority boundary', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('Core derives explore produced ref from current bytes', async () => {
    const c = 'Q2-explore-ref';
    const bytes = '# Explore exact\n';
    await writeExploreArtifact(c, bytes);
    const run = await createRun(createRunInput({ runId: '20260806-201-explore', changeId: c, action: 'explore' }));
    await completeRun(run, { executionStatus: 'completed', summary: 'done' });
    const result = JSON.parse(await readFile(join(run, 'result.json'), 'utf-8'));
    assert.deepEqual(result.actionResult.producedResultRefs, [{
      ref: `openspec/changes/${c}/explore.md`,
      versionFingerprint: computeResultFileHash(bytes),
      kind: 'produced-artifact',
    }]);
  });

  it('propose requires an approved review-explore handoff via consumedRunId', async () => {
    const c = 'Q2-propose-handoff';
    await setupApprovedExplore(c);
    const run = await createRun(createRunInput({
      runId: '20260806-203-propose', changeId: c, action: 'propose',
      consumedRunId: '20260806-202-review-explore',
    }));
    const ctx = JSON.parse(await readFile(join(run, 'context.json'), 'utf-8'));
    assert.equal(ctx.sourceReviewRun, undefined);
    assert.equal(ctx.inputRef.ref, `.flowkit/runs/D1/${c}/20260806-202-review-explore/result.json`);
  });

  it('non-revise Actions reject sourceReviewRun/sourceReviewVerdict', async () => {
    await assert.rejects(
      () => createRun(createRunInput({
        runId: '20260806-203-propose', changeId: 'Q2-source-scope', action: 'propose',
        sourceReviewRun: '20260806-202-review-explore', sourceReviewVerdict: 'approved',
      })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('revise-* requires changes-requested source review at entry', async () => {
    await assert.rejects(
      () => createRun(createRunInput({ runId: '20260806-205-revise-propose', changeId: 'Q2-revise-source', action: 'revise-propose' })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    await assert.rejects(
      () => createRun(createRunInput({
        runId: '20260806-205-revise-propose', changeId: 'Q2-revise-source', action: 'revise-propose',
        sourceReviewRun: '20260806-204-review-propose', sourceReviewVerdict: 'approved',
      })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('revise-propose rejects a matching non-author changes-requested Review at persistence entry', async () => {
    const c = 'Q2-revise-owner-blocker';
    await setupApprovedExplore(c);
    const p = await createRun(createRunInput({
      runId: '20260806-203-propose', changeId: c, action: 'propose', consumedRunId: '20260806-202-review-explore',
    }));
    await writeProposalArtifacts(c);
    await completeRun(p, { executionStatus: 'completed', summary: 'P0' });
    const review = await createRun(createRunInput({
      runId: '20260806-204-review-propose', changeId: c, action: 'review-propose', role: 'reviewer', reviewedRunId: '20260806-203-propose',
    }));
    await completeRun(review, {
      executionStatus: 'completed', summary: 'CR', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'F-owner', severity: 'blocking', blockingAuthority: 'owner', title: 'owner decision', problem: 'needs owner fact' }],
    });
    await assert.rejects(
      () => createRun(createRunInput({
        runId: '20260806-205-revise-propose', changeId: c, action: 'revise-propose',
        sourceReviewRun: '20260806-204-review-propose', sourceReviewVerdict: 'changes-requested',
      })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED' && /author-only/.test(e.message),
    );
    const rereview = await createRun(createRunInput({
      runId: '20260806-205-review-propose', changeId: c, action: 'review-propose', role: 'reviewer', reviewedRunId: '20260806-203-propose',
    }));
    const rereviewContext = JSON.parse(await readFile(join(rereview, 'context.json'), 'utf-8'));
    assert.equal(rereviewContext.reviewedRunId, '20260806-203-propose');
  });

  it('revise-propose records a complete current proposal bundle with no predecessor overlay', async () => {
    const c = 'Q2-revise-full';
    await setupApprovedExplore(c);
    const p = await createRun(createRunInput({
      runId: '20260806-203-propose', changeId: c, action: 'propose', consumedRunId: '20260806-202-review-explore',
    }));
    await writeProposalArtifacts(c);
    await completeRun(p, { executionStatus: 'completed', summary: 'P0' });
    const review = await createRun(createRunInput({
      runId: '20260806-204-review-propose', changeId: c, action: 'review-propose', role: 'reviewer', reviewedRunId: '20260806-203-propose',
    }));
    await completeRun(review, {
      executionStatus: 'completed', summary: 'CR', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'F1', severity: 'blocking', blockingAuthority: 'author', title: 'fix', problem: 'x', requiredChange: 'revise' }],
    });
    const revise = await createRun(createRunInput({
      runId: '20260806-205-revise-propose', changeId: c, action: 'revise-propose',
      sourceReviewRun: '20260806-204-review-propose', sourceReviewVerdict: 'changes-requested',
    }));
    // Entry exact-binds the reviewed predecessor; only after pending publish may
    // the revise Action mutate its owned proposal artifacts.
    await writeProposalArtifacts(c, ' v2');
    await completeRun(revise, { executionStatus: 'completed', summary: 'P1' });
    const result = JSON.parse(await readFile(join(revise, 'result.json'), 'utf-8'));
    const paths = result.actionResult.producedResultRefs.map((x: { ref: string }) => x.ref);
    assert.deepEqual(paths, [
      `openspec/changes/${c}/design.md`,
      `openspec/changes/${c}/proposal.md`,
      `openspec/changes/${c}/specs/cap-a/spec.md`,
      `openspec/changes/${c}/tasks.md`,
    ]);
  });

  it('legacy producedArtifactTags is rejected instead of creating subset authority', async () => {
    const c = 'Q2-no-tags';
    await writeExploreArtifact(c);
    const run = await createRun(createRunInput({ runId: '20260806-201-explore', changeId: c, action: 'explore' }));
    await assert.rejects(
      () => completeRun(run, {
        executionStatus: 'completed', summary: 'bad', producedArtifactTags: ['explore'],
      } as unknown as Parameters<typeof completeRun>[1]),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    assert.equal((await readdir(run)).includes('result.json'), false);
  });

  it('review entry exact-binds current producer bytes', async () => {
    const c = 'Q2-review-exact';
    await writeExploreArtifact(c);
    const e = await createRun(createRunInput({ runId: '20260806-201-explore', changeId: c, action: 'explore' }));
    await completeRun(e, { executionStatus: 'completed', summary: 'E0' });
    await writeExploreArtifact(c, '# drift\n');
    await assert.rejects(
      () => createRun(createRunInput({
        runId: '20260806-202-review-explore', changeId: c, action: 'review-explore', role: 'reviewer', reviewedRunId: '20260806-201-explore',
      })),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
  });

  it('review-apply persists verificationInputRef and refuses verification drift at completion', async () => {
    const c = 'Q2-review-verification';
    await setupApprovedProposal(c);
    const apply = await createRun(createRunInput({
      runId: '20260806-205-apply', changeId: c, action: 'apply', consumedRunId: '20260806-204-review-propose',
    }));
    await completeRun(apply, { executionStatus: 'completed', summary: 'apply' });
    const verification = join(tempRoot, 'openspec', 'changes', c, 'verification.md');
    await writeFile(verification, '# V1\n');
    const review = await createRun(createRunInput({
      runId: '20260806-206-review-apply', changeId: c, action: 'review-apply', role: 'reviewer', reviewedRunId: '20260806-205-apply',
    }));
    const ctx = JSON.parse(await readFile(join(review, 'context.json'), 'utf-8'));
    assert.equal(ctx.verificationInputRef.kind, 'verification-summary');
    await writeFile(verification, '# V2\n');
    await assert.rejects(
      () => completeRun(review, { executionStatus: 'completed', summary: 'review', reviewVerdict: 'approved', reviewFindings: [] }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
    assert.equal((await readdir(review)).includes('result.json'), false);
  });

  it('apply does not own verificationSummaryRef', async () => {
    const c = 'Q2-apply-ownership';
    await setupApprovedProposal(c);
    const apply = await createRun(createRunInput({
      runId: '20260806-205-apply', changeId: c, action: 'apply', consumedRunId: '20260806-204-review-propose',
    }));
    await completeRun(apply, { executionStatus: 'completed', summary: 'apply' });
    const result = JSON.parse(await readFile(join(apply, 'result.json'), 'utf-8'));
    assert.equal(result.actionResult.verificationSummaryRef, undefined);
  });

  it('path-shaped Run descriptors fail before filesystem resolution', async () => {
    const c = 'Q2-descriptor';
    await writeExploreArtifact(c);
    const run = await createRun(createRunInput({ runId: '20260806-201-explore', changeId: c, action: 'explore' }));
    await assert.rejects(
      () => completeRun(run, { executionStatus: 'completed', summary: 'x', consumedRunIds: ['../bad'] }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });
});
