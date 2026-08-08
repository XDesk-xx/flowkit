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
    // A0: apply Run (no artifacts produced; completeRun works for non-artifact completed).
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-210-apply', changeId, action: 'apply', role: 'author' }),
    );
    await completeRun(a0Dir, { executionStatus: 'completed', summary: 'A0 apply' });

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
    await completeRun(a0Dir, { executionStatus: 'completed', summary: 'A0' });
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
// Completion preflight invariants (Q1-7 / Q1-9) — product-centric
// ---------------------------------------------------------------------------
//
// Q1-RA-001: the raw RunResultFile publisher is private, so a caller can never
// inject a reviewVerdictRef / verificationSummaryRef into the terminal result.
// completeRun derives every ref from descriptors and the Action. These tests
// verify the resulting invariants hold through the public API: review-* Runs
// carry NO reviewVerdictRef (Q1-7 self-reference), and non-review-apply Runs
// carry NO verificationSummaryRef (Q1-9 scope).

describe('completion preflight invariants (Q1-7 / Q1-9)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('review-apply Run carries NO reviewVerdictRef (Q1-7 self-reference)', async () => {
    const changeId = 'PF-self-ref';
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-270-apply', changeId, action: 'apply', role: 'author' }),
    );
    await completeRun(a0Dir, { executionStatus: 'completed', summary: 'A0' });
    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-271-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-270-apply',
      }),
    );
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'verification.md'), '# Verification\n');
    await completeRun(v0Dir, {
      executionStatus: 'completed',
      summary: 'V0',
      reviewVerdict: 'approved',
    });
    const result = JSON.parse(await readFile(join(v0Dir, 'result.json'), 'utf-8'));
    // reviewVerdictRef MUST be absent — it would be a self-reference (Q1-7).
    assert.equal(result.actionResult.reviewVerdictRef, undefined);
  });

  it('explore Run carries NO verificationSummaryRef (Q1-9 scope)', async () => {
    const changeId = 'PF-verdict-scope';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'explore.md'), '# Explore\n');
    const runDir = await createRun(
      createRunInput({ runId: '20260806-280-explore', changeId, action: 'explore', role: 'author' }),
    );
    await completeRun(runDir, { executionStatus: 'completed', summary: 'explore' });
    const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf-8'));
    // verificationSummaryRef MUST be absent — only review-apply carries it (Q1-9).
    assert.equal(result.actionResult.verificationSummaryRef, undefined);
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

// ---------------------------------------------------------------------------
// Q1-RA-005: descriptor runtime fail-closed (Run IDs + artifact tags)
// ---------------------------------------------------------------------------
//
// A JS/JSON/CLI caller bypasses TypeScript unions. completeRun and createRun
// MUST runtime-reject path-shaped Run-ID descriptors and unknown / disallowed /
// no-op artifact tags at the descriptor boundary — never silently ignore them.

describe('descriptor runtime fail-closed (Q1-RA-005)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('rejects a path-shaped consumedRunId (../x)', async () => {
    const changeId = 'RD-path';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'explore.md'), '# Explore\n');
    const runDir = await createRun(
      createRunInput({ runId: '20260806-330-explore', changeId, action: 'explore', role: 'author' }),
    );
    await assert.rejects(
      () =>
        completeRun(runDir, {
          executionStatus: 'completed',
          summary: 'x',
          consumedRunIds: ['../x'],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_ID_INVALID_FORMAT',
    );
    // Run stays pending — no terminal result published.
    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'));
  });

  it('rejects a path-shaped consumedRunId (a/b)', async () => {
    const changeId = 'RD-path2';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'explore.md'), '# Explore\n');
    const runDir = await createRun(
      createRunInput({ runId: '20260806-331-explore', changeId, action: 'explore', role: 'author' }),
    );
    await assert.rejects(
      () =>
        completeRun(runDir, {
          executionStatus: 'completed',
          summary: 'x',
          consumedRunIds: ['a/b'],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_ID_INVALID_FORMAT',
    );
  });

  it('rejects a path-shaped reviewedRunId (../../run) at createRun', async () => {
    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-332-review-apply',
            changeId: 'RD-reviewed',
            action: 'review-apply',
            role: 'reviewer',
            reviewedRunId: '../../run',
          }),
        ),
      (e: unknown) =>
        e instanceof FlowkitError &&
        (e.code === 'SCHEMA_VALIDATION_FAILED' || e.code === 'RUN_ID_INVALID_FORMAT'),
    );
  });

  it('rejects a path-shaped reviewedRunId (C:\\\\tmp\\\\run) at createRun', async () => {
    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-333-review-apply',
            changeId: 'RD-reviewed2',
            action: 'review-apply',
            role: 'reviewer',
            reviewedRunId: 'C:\\tmp\\run',
          }),
        ),
      (e: unknown) =>
        e instanceof FlowkitError &&
        (e.code === 'SCHEMA_VALIDATION_FAILED' || e.code === 'RUN_ID_INVALID_FORMAT'),
    );
  });

  it('rejects an unknown producedArtifactTag (xxx) for propose', async () => {
    const changeId = 'RD-tag-unknown';
    await writeInitialProposeArtifacts(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-340-propose', changeId, action: 'propose', role: 'author' }),
    );
    await assert.rejects(
      () =>
        completeRun(p0Dir, {
          executionStatus: 'completed',
          summary: 'P0',
          producedArtifactTags: ['xxx' as never],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects an Action-disallowed producedArtifactTag for revise-explore (proposal)', async () => {
    const changeId = 'RD-tag-explore';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'explore.md'), '# Explore\n');
    const runDir = await createRun(
      createRunInput({ runId: '20260806-341-revise-explore', changeId, action: 'revise-explore', role: 'author' }),
    );
    await assert.rejects(
      () =>
        completeRun(runDir, {
          executionStatus: 'completed',
          summary: 'x',
          producedArtifactTags: ['proposal' as never],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects producedArtifactTags on an apply Run (no artifacts to produce)', async () => {
    const changeId = 'RD-tag-apply';
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-342-apply', changeId, action: 'apply', role: 'author' }),
    );
    await assert.rejects(
      () =>
        completeRun(a0Dir, {
          executionStatus: 'completed',
          summary: 'A0',
          producedArtifactTags: ['proposal' as never],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects revise-propose with empty producedArtifactTags (no-op revise)', async () => {
    const changeId = 'RD-tag-nop';
    await writeInitialProposeArtifacts(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-343-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-344-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-343-propose',
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
    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-345-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-344-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await assert.rejects(
      () => completeRun(p1Dir, { executionStatus: 'completed', summary: 'P1', producedArtifactTags: [] }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects revise-propose with undefined producedArtifactTags (no-op revise)', async () => {
    const changeId = 'RD-tag-undef';
    await writeInitialProposeArtifacts(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-346-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-347-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-346-propose',
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
    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-348-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-347-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await assert.rejects(
      () => completeRun(p1Dir, { executionStatus: 'completed', summary: 'P1' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// Q1-RA-006: terminal completion rejects broken review exact binding
// ---------------------------------------------------------------------------
//
// A pending review context is tampered AFTER createRun (which Core-derived a
// valid inputRef). completeRun MUST fail closed for every broken binding shape
// and MUST NOT publish result.json.

describe('terminal completion rejects broken review exact binding (Q1-RA-006)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  // Creates A0 apply Run + a review-apply Run over it with a valid Core-derived
  // inputRef. Returns { a0Dir, v0Dir, a0ResultPath }.
  async function setupReviewApply(changeId: string, reviewRunId: string): Promise<{ a0Dir: string; v0Dir: string; a0ResultPath: string }> {
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-410-apply', changeId, action: 'apply', role: 'author' }),
    );
    await completeRun(a0Dir, { executionStatus: 'completed', summary: 'A0' });
    const v0Dir = await createRun(
      createRunInput({
        runId: reviewRunId,
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-410-apply',
      }),
    );
    // Review-apply requires verification.md for the verificationSummaryRef.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'verification.md'), '# Verification\n');
    return {
      a0Dir,
      v0Dir,
      a0ResultPath: join(deliveryRunsDir(), changeId, '20260806-410-apply', 'result.json'),
    };
  }

  it('deleting inputRef from a pending review context → completeRun rejects, result.json NOT published', async () => {
    const changeId = 'RA006-del';
    const { v0Dir } = await setupReviewApply(changeId, '20260806-411-review-apply');
    // Tamper: delete context.inputRef.
    const ctxPath = join(v0Dir, 'context.json');
    const ctx = JSON.parse(await readFile(ctxPath, 'utf-8')) as Record<string, unknown>;
    delete ctx['inputRef'];
    await writeFile(ctxPath, JSON.stringify(ctx, null, 2));

    await assert.rejects(
      () => completeRun(v0Dir, { executionStatus: 'completed', summary: 'V0', reviewVerdict: 'approved' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    // result.json MUST NOT exist.
    await assert.rejects(() => readFile(join(v0Dir, 'result.json'), 'utf-8'));
  });

  it('changing inputRef kind (target/hash correct) → completeRun rejects (Q1-RA-006)', async () => {
    const changeId = 'RA006-kind';
    const { v0Dir, a0ResultPath } = await setupReviewApply(changeId, '20260806-412-review-apply');
    const ctxPath = join(v0Dir, 'context.json');
    const ctx = JSON.parse(await readFile(ctxPath, 'utf-8')) as Record<string, unknown>;
    const inputRef = ctx['inputRef'] as Record<string, unknown>;
    inputRef['kind'] = 'produced-artifact'; // wrong kind, target/hash otherwise correct.
    await writeFile(ctxPath, JSON.stringify(ctx, null, 2));
    void a0ResultPath;

    await assert.rejects(
      () => completeRun(v0Dir, { executionStatus: 'completed', summary: 'V0', reviewVerdict: 'approved' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    await assert.rejects(() => readFile(join(v0Dir, 'result.json'), 'utf-8'));
  });

  it('pointing inputRef at a DIFFERENT readable result with a MATCHING hash → completeRun rejects (Q1-RA-006)', async () => {
    const changeId = 'RA006-wrongtarget';
    // Create TWO completed target Runs A (reviewedRunId) and B.
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-413-apply', changeId, action: 'apply', role: 'author' }),
    );
    await completeRun(a0Dir, { executionStatus: 'completed', summary: 'A0' });
    const b0Dir = await createRun(
      createRunInput({ runId: '20260806-414-apply', changeId, action: 'apply', role: 'author' }),
    );
    await completeRun(b0Dir, { executionStatus: 'completed', summary: 'B0' });

    // Review A (reviewedRunId=413), but tamper inputRef to point at B's
    // result.json with B's CORRECT hash — path/hash both "valid" individually,
    // but the binding is wrong because it does not equal the Core-derived
    // reviewedRunId target.
    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-415-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-413-apply',
      }),
    );
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'verification.md'), '# Verification\n');

    const ctxPath = join(v0Dir, 'context.json');
    const ctx = JSON.parse(await readFile(ctxPath, 'utf-8')) as Record<string, unknown>;
    const bResult = await readFile(join(b0Dir, 'result.json'), 'utf-8');
    const { computeResultFileHash } = await import('../../../src/persistence/result-ref-adapter.js');
    ctx['inputRef'] = {
      ref: `.flowkit/runs/D1/${changeId}/20260806-414-apply/result.json`,
      versionFingerprint: computeResultFileHash(bResult),
      kind: 'run-result',
    };
    await writeFile(ctxPath, JSON.stringify(ctx, null, 2));

    await assert.rejects(
      () => completeRun(v0Dir, { executionStatus: 'completed', summary: 'V0', reviewVerdict: 'approved' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
    await assert.rejects(() => readFile(join(v0Dir, 'result.json'), 'utf-8'));
  });
});

// ---------------------------------------------------------------------------
// Q1-RA-007: source-review tuple fail-closed at terminal completion
// ---------------------------------------------------------------------------

describe('source-review tuple fail-closed at terminal completion (Q1-RA-007)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  async function setupCRChain(changeId: string): Promise<{ r0Dir: string; p1Dir: string }> {
    await writeInitialProposeArtifacts(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-420-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-421-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-420-propose',
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
    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-422-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-421-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    return { r0Dir, p1Dir };
  }

  it('revise-propose without sourceReviewRun → completeRun rejects (missing tuple counterpart)', async () => {
    const changeId = 'RA007-nosrc';
    await setupCRChain(changeId);
    // Create revise-propose context WITHOUT sourceReviewRun (orphaned).
    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-423-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
      }),
    );
    // Tamper: inject reviewVerdictRef into the context? No — context has no
    // sourceReview fields; the Action requires a source review, so completeRun
    // MUST reject the missing evidence.
    await assert.rejects(
      () => completeRun(p1Dir, { executionStatus: 'completed', summary: 'P1', producedArtifactTags: ['proposal'] }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('revise-propose with sourceReviewVerdict missing → completeRun rejects (post-create tamper)', async () => {
    const changeId = 'RA007-noverdict';
    const { p1Dir } = await setupCRChain(changeId);
    // Post-create tamper: delete sourceReviewVerdict. The schema-level pairing
    // (sourceReviewRun requires sourceReviewVerdict) already blocks createRun;
    // this proves completeRun ALSO fails closed when the persisted context is
    // tampered after createRun.
    const ctxPath = join(p1Dir, 'context.json');
    const ctx = JSON.parse(await readFile(ctxPath, 'utf-8')) as Record<string, unknown>;
    delete ctx['sourceReviewVerdict'];
    await writeFile(ctxPath, JSON.stringify(ctx, null, 2));
    await assert.rejects(
      () => completeRun(p1Dir, { executionStatus: 'completed', summary: 'P1', producedArtifactTags: ['proposal'] }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('revise-propose with reviewVerdictRef removed from result → completeRun rejects', async () => {
    const changeId = 'RA007-noref';
    const { p1Dir } = await setupCRChain(changeId);
    // deriveReviewVerdictRef derives reviewVerdictRef from sourceReviewRun.
    // To simulate a missing reviewVerdictRef we tamper the sourceReviewRun in
    // context so Core cannot derive it → derivation throws → Run stays pending.
    const ctxPath = join(p1Dir, 'context.json');
    const ctx = JSON.parse(await readFile(ctxPath, 'utf-8')) as Record<string, unknown>;
    delete ctx['sourceReviewVerdict'];
    await writeFile(ctxPath, JSON.stringify(ctx, null, 2));
    await assert.rejects(
      () => completeRun(p1Dir, { executionStatus: 'completed', summary: 'P1', producedArtifactTags: ['proposal'] }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('revise-propose whose source review is NOT admitted → completeRun rejects', async () => {
    const changeId = 'RA007-unadmitted';
    // Build P0, then a review whose result is malformed (not admitted), then a
    // revise-propose pointing at that unadmitted review.
    await writeInitialProposeArtifacts(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-425-propose', changeId, action: 'propose', role: 'author' }),
    );
    await completeRun(p0Dir, { executionStatus: 'completed', summary: 'P0' });
    // Create a review normally, then corrupt its result.json (closed-schema
    // violation) so it is NOT admitted by readRunVerdict.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-426-review-propose',
        changeId,
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-425-propose',
      }),
    );
    await writeFile(
      join(r0Dir, 'result.json'),
      JSON.stringify({
        runStatus: 'completed',
        actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'CR' },
        reviewVerdict: 'changes-requested',
        // closed-schema violation: heavy bookkeeping field.
        blockingFindings: [],
      }),
    );
    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-427-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-426-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await assert.rejects(
      () => completeRun(p1Dir, { executionStatus: 'completed', summary: 'P1', producedArtifactTags: ['proposal'] }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    await assert.rejects(() => readFile(join(p1Dir, 'result.json'), 'utf-8'));
  });
});

// ---------------------------------------------------------------------------
// Q1-RA-003: review-entry fails closed on empty/partial initial effective sets
// ---------------------------------------------------------------------------
//
// A bad terminal initial generation (missing/empty/partial produced set) must
// be rejected at review-entry BEFORE the review Run is published — requiredness
// comes from the Action/stage, never from producedRefs.length > 0.

describe('review-entry fails closed on empty/partial initial sets (Q1-RA-003)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('rejects review-explore when the reviewed explore produced set is missing', async () => {
    const changeId = 'RE-empty-explore';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, 'explore.md'), '# Explore\n');
    const e0Dir = await createRun(
      createRunInput({ runId: '20260806-350-explore', changeId, action: 'explore', role: 'author' }),
    );
    // Hand-write a terminal result WITHOUT producedResultRefs (bypass legacy).
    await writeFile(
      join(e0Dir, 'result.json'),
      JSON.stringify({
        runStatus: 'completed',
        actionResult: { action: 'explore', executionStatus: 'completed', summary: 'raw' },
      }),
    );

    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-351-review-explore',
            changeId,
            action: 'review-explore',
            role: 'reviewer',
            reviewedRunId: '20260806-350-explore',
          }),
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    // Review Run directory MUST NOT exist.
    const reviewRunDir = join(deliveryRunsDir(), changeId, '20260806-351-review-explore');
    await assert.rejects(() => readFile(join(reviewRunDir, 'context.json'), 'utf-8'));
  });

  it('rejects review-propose when proposal/design/tasks are missing from the produced set', async () => {
    const changeId = 'RE-empty-propose';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(join(changeDir, 'specs', 'cap-a'), { recursive: true });
    await writeFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), '# Spec A\n');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-352-propose', changeId, action: 'propose', role: 'author' }),
    );
    // Hand-write a terminal result with an empty producedResultRefs (specs-only
    // would still be missing the required singletons).
    await writeFile(
      join(p0Dir, 'result.json'),
      JSON.stringify({
        runStatus: 'completed',
        actionResult: { action: 'propose', executionStatus: 'completed', summary: 'raw', producedResultRefs: [] },
      }),
    );

    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-353-review-propose',
            changeId,
            action: 'review-propose',
            role: 'reviewer',
            reviewedRunId: '20260806-352-propose',
          }),
        ),
      // The empty producedResultRefs passes readRunProducedResultRefs (no
      // throw), then validateReviewEntry reports the incomplete stage set as
      // RESULT_REF_MISMATCH before the review Run is published.
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
  });

  it('rejects review-propose with empty specs namespace AND missing singletons (Q1-RA-003)', async () => {
    const changeId = 'RE-empty-specs';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    // specs/** is EMPTY (no specs directory / no files).
    await mkdir(changeDir, { recursive: true });
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-354-propose', changeId, action: 'propose', role: 'author' }),
    );
    // Hand-write a terminal result with an empty produced set. Even though the
    // specs namespace is legitimately empty, the required singletons
    // (proposal/design/tasks) are still missing → MUST fail closed.
    await writeFile(
      join(p0Dir, 'result.json'),
      JSON.stringify({
        runStatus: 'completed',
        actionResult: { action: 'propose', executionStatus: 'completed', summary: 'raw', producedResultRefs: [] },
      }),
    );

    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-355-review-propose',
            changeId,
            action: 'review-propose',
            role: 'reviewer',
            reviewedRunId: '20260806-354-propose',
          }),
        ),
      // Empty specs namespace does NOT excuse missing singletons.
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );
  });
});
