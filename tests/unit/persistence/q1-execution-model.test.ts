/**
 * Q1 execution-model-correction tests.
 *
 * Covers:
 *   - Closed schema rejection (task 2.6)
 *   - buildArtifactResultRef + kind enum (tasks 3.2-3.4)
 *   - enumerateSpecsNamespace (task 3.8)
 *   - resolveArchiveAwareArtifactPath (task 3.7)
 *   - Completion preflight RESULT_REF_TARGET_MISSING / RESULT_REF_MISMATCH (tasks 6.6-6.7)
 *   - Review exact binding via createRun (task 4.8)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  createRun,
  writeRunResult,
} from '../../../src/persistence/run-persistence.js';
import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';
import {
  validateRunResultFileCombination,
  validateReviewVerdictIntegrity,
  type RunResultFile,
} from '../../../src/persistence/serialization.js';
import {
  buildArtifactResultRef,
  buildRunResultRef,
  computeResultFileHash,
  enumerateSpecsNamespace,
  extractSpecsLogicalIdentities,
  resolveArchiveAwareArtifactPath,
  resolveSingletonArtifactRef,
  resolveVerificationSummaryRef,
  RUN_RESULT_KIND,
  PRODUCED_ARTIFACT_KIND,
  VERIFICATION_SUMMARY_KIND,
} from '../../../src/persistence/result-ref-adapter.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let tempRoot: string;

async function makeTempRoot(): Promise<string> {
  tempRoot = await mkdtemp(join(tmpdir(), 'flowkit-q1-'));
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
// Closed schema rejection (task 2.6)
// ---------------------------------------------------------------------------

describe('Q1 closed schema rejection (task 2.6)', () => {
  it('rejects RunResultFile with blockingFindings (legacy heavy field)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
          blockingFindings: [],
        } as RunResultFile),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects RunResultFile with verification array (legacy heavy field)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
          verification: { checks: [] },
        } as RunResultFile),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects RunResultFile with consistencyScan (legacy heavy field)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
          consistencyScan: { contradictions: 0 },
        } as RunResultFile),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects RunResultFile with commitPolicy (legacy heavy field)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
          commitPolicy: { autoCommit: false },
        } as RunResultFile),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts a valid closed-schema RunResultFile', () => {
    // Should not throw.
    validateRunResultFileCombination({
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
    });
  });
});

// ---------------------------------------------------------------------------
// Typed reviewFindings + verdict consistency (tasks 2.2-2.3)
// ---------------------------------------------------------------------------

describe('Q1 typed reviewFindings + verdict consistency (tasks 2.2-2.3)', () => {
  it('rejects changes-requested without blocking findings', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('review-propose', {
          runStatus: 'completed',
          actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'review' },
          reviewVerdict: 'changes-requested',
          reviewFindings: [
            { id: 'NB-001', severity: 'non-blocking', title: 'minor', problem: 'typo' },
          ],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects approved with blocking findings', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('review-propose', {
          runStatus: 'completed',
          actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'review' },
          reviewVerdict: 'approved',
          reviewFindings: [
            { id: 'B-001', severity: 'blocking', title: 'major', problem: 'broken', requiredChange: 'fix it' },
          ],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts changes-requested with blocking findings + requiredChange', () => {
    // Should not throw.
    validateReviewVerdictIntegrity('review-propose', {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'review' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'major', problem: 'broken', requiredChange: 'fix it' },
      ],
    });
  });

  it('rejects non-review Run carrying reviewVerdict', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('explore', {
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
          reviewVerdict: 'approved',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// buildArtifactResultRef + kind enum (tasks 3.2-3.4)
// ---------------------------------------------------------------------------

describe('Q1 buildArtifactResultRef + kind enum (tasks 3.2-3.4)', () => {
  it('constructs a produced-artifact ResultRef', () => {
    const content = '# Proposal\n';
    const ref = buildArtifactResultRef(
      'openspec/changes/test-change/proposal.md',
      content,
      PRODUCED_ARTIFACT_KIND,
    );
    assert.equal(ref.kind, PRODUCED_ARTIFACT_KIND);
    assert.equal(ref.ref, 'openspec/changes/test-change/proposal.md');
    assert.equal(ref.versionFingerprint, computeResultFileHash(content));
  });

  it('constructs a verification-summary ResultRef', () => {
    const content = '# Verification\n';
    const ref = buildArtifactResultRef(
      'openspec/changes/test-change/verification.md',
      content,
      VERIFICATION_SUMMARY_KIND,
    );
    assert.equal(ref.kind, VERIFICATION_SUMMARY_KIND);
    assert.equal(ref.ref, 'openspec/changes/test-change/verification.md');
  });

  it('rejects run-result kind (use buildRunResultRef)', () => {
    assert.throws(
      () =>
        buildArtifactResultRef('path/to/result.json', 'content', RUN_RESULT_KIND),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects path traversal in logical ref', () => {
    assert.throws(
      () =>
        buildArtifactResultRef('../escape/proposal.md', 'content', PRODUCED_ARTIFACT_KIND),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects absolute path in logical ref', () => {
    assert.throws(
      () =>
        buildArtifactResultRef('C:/absolute/proposal.md', 'content', PRODUCED_ARTIFACT_KIND),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects non-Run result.json target', () => {
    assert.throws(
      () =>
        buildArtifactResultRef('openspec/changes/test/result.json', 'content', PRODUCED_ARTIFACT_KIND),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// resolveSingletonArtifactRef + resolveVerificationSummaryRef (task 3.6)
// ---------------------------------------------------------------------------

describe('Q1 singleton artifact ref resolver (task 3.6)', () => {
  it('resolves explore tag to canonical path', () => {
    const ref = resolveSingletonArtifactRef('explore', 'explore', 'test-change');
    assert.equal(ref, 'openspec/changes/test-change/explore.md');
  });

  it('resolves proposal tag to canonical path', () => {
    const ref = resolveSingletonArtifactRef('propose', 'proposal', 'test-change');
    assert.equal(ref, 'openspec/changes/test-change/proposal.md');
  });

  it('rejects specs tag (namespace replacement)', () => {
    assert.throws(
      () => resolveSingletonArtifactRef('propose', 'specs', 'test-change'),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects tag not permitted for action', () => {
    assert.throws(
      () => resolveSingletonArtifactRef('explore', 'proposal', 'test-change'),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('resolves verification summary ref from changeId', () => {
    const ref = resolveVerificationSummaryRef('test-change');
    assert.equal(ref, 'openspec/changes/test-change/verification.md');
  });
});

// ---------------------------------------------------------------------------
// enumerateSpecsNamespace (task 3.8)
// ---------------------------------------------------------------------------

describe('Q1 enumerateSpecsNamespace (task 3.8)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('enumerates all .md files in specs/** as ResultRefs', async () => {
    const changeId = 'test-specs-change';
    const specsDir = join(tempRoot, 'openspec', 'changes', changeId, 'specs');
    await mkdir(join(specsDir, 'capability-a'), { recursive: true });
    await mkdir(join(specsDir, 'capability-b'), { recursive: true });
    await writeFile(join(specsDir, 'capability-a', 'spec.md'), '# Spec A\n');
    await writeFile(join(specsDir, 'capability-b', 'spec.md'), '# Spec B\n');

    const refs = await enumerateSpecsNamespace(tempRoot, changeId);
    assert.equal(refs.length, 2);
    assert.equal(refs[0].kind, PRODUCED_ARTIFACT_KIND);
    // Sorted by ref.
    assert.ok(refs[0].ref.includes('capability-a'));
    assert.ok(refs[1].ref.includes('capability-b'));
    // Each ref has correct fingerprint.
    const contentA = await readFile(join(specsDir, 'capability-a', 'spec.md'), 'utf-8');
    assert.equal(refs[0].versionFingerprint, computeResultFileHash(contentA));
  });

  it('returns empty array when specs directory does not exist', async () => {
    const refs = await enumerateSpecsNamespace(tempRoot, 'nonexistent-change');
    assert.equal(refs.length, 0);
  });

  it('extractSpecsLogicalIdentities returns sorted ref paths', () => {
    const refs = [
      buildArtifactResultRef('openspec/changes/c/specs/b/spec.md', 'b', PRODUCED_ARTIFACT_KIND),
      buildArtifactResultRef('openspec/changes/c/specs/a/spec.md', 'a', PRODUCED_ARTIFACT_KIND),
    ];
    const identities = extractSpecsLogicalIdentities(refs);
    assert.equal(identities.length, 2);
    assert.ok(identities[0].includes('specs/a/'));
    assert.ok(identities[1].includes('specs/b/'));
  });
});

// ---------------------------------------------------------------------------
// resolveArchiveAwareArtifactPath (task 3.7)
// ---------------------------------------------------------------------------

describe('Q1 resolveArchiveAwareArtifactPath (task 3.7)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('resolves active path when it exists', async () => {
    const changeId = 'test-archive-change';
    const artifactPath = join(tempRoot, 'openspec', 'changes', changeId, 'proposal.md');
    await mkdir(join(tempRoot, 'openspec', 'changes', changeId), { recursive: true });
    await writeFile(artifactPath, '# Proposal\n');

    const resolved = await resolveArchiveAwareArtifactPath(
      tempRoot,
      `openspec/changes/${changeId}/proposal.md`,
    );
    assert.equal(resolved, artifactPath);
  });

  it('resolves archive path when active is absent', async () => {
    const changeId = 'test-archive-change-2';
    const archiveDir = join(tempRoot, 'openspec', 'changes', 'archive', `2026-01-01-${changeId}`);
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(archiveDir, 'proposal.md'), '# Archived Proposal\n');

    const resolved = await resolveArchiveAwareArtifactPath(
      tempRoot,
      `openspec/changes/${changeId}/proposal.md`,
    );
    assert.ok(resolved.includes('archive'));
    assert.ok(resolved.includes(changeId));
  });

  it('throws RESULT_REF_TARGET_MISSING when neither active nor archive exists', async () => {
    await assert.rejects(
      () =>
        resolveArchiveAwareArtifactPath(
          tempRoot,
          'openspec/changes/nonexistent/proposal.md',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING',
    );
  });

  it('throws on active + archive ambiguity', async () => {
    const changeId = 'test-ambiguous-change';
    // Create active.
    const activeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(activeDir, { recursive: true });
    await writeFile(join(activeDir, 'proposal.md'), '# Active\n');
    // Create archive.
    const archiveDir = join(tempRoot, 'openspec', 'changes', 'archive', `2026-01-01-${changeId}`);
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(archiveDir, 'proposal.md'), '# Archived\n');

    await assert.rejects(
      () =>
        resolveArchiveAwareArtifactPath(
          tempRoot,
          `openspec/changes/${changeId}/proposal.md`,
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// Completion preflight: RESULT_REF_TARGET_MISSING / RESULT_REF_MISMATCH (tasks 6.6-6.7)
// ---------------------------------------------------------------------------

describe('Q1 completion preflight (tasks 6.6-6.7)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('throws RESULT_REF_MISMATCH when consumedInputRefs fingerprint is wrong', async () => {
    // Set up a consumed Run with a known result.
    const consumedRunDir = await createRun(
      createRunInput({
        runId: '20260806-050-apply',
        action: 'apply',
        role: 'author',
      }),
    );
    await writeRunResult(consumedRunDir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'done' },
    });

    // Create a Run that consumes the above Run's result, but with a wrong fingerprint.
    const runDir = await createRun(
      createRunInput({
        runId: '20260806-051-explore',
        action: 'explore',
        consumedRunId: '20260806-050-apply',
      }),
    );

    // Build a result with a consumedInputRefs that has a wrong fingerprint.
    const wrongRef = buildRunResultRef(
      '.flowkit/runs/D1/C1/20260806-050-apply',
      'wrong-content',
    );

    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: {
            action: 'explore',
            executionStatus: 'completed',
            summary: 'done',
            consumedInputRefs: [wrongRef],
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );

    // Run stays pending — result.json was NOT created.
    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'));
  });

  it('throws RESULT_REF_TARGET_MISSING when consumedInputRefs target does not exist', async () => {
    const runDir = await createRun(
      createRunInput({
        runId: '20260806-052-explore',
        action: 'explore',
      }),
    );

    const missingRef = buildRunResultRef(
      '.flowkit/runs/D1/C1/20260806-999-nonexistent',
      'content',
    );

    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: {
            action: 'explore',
            executionStatus: 'completed',
            summary: 'done',
            consumedInputRefs: [missingRef],
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING',
    );

    // Run stays pending.
    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'));
  });

  it('rejects reviewVerdictRef on review-* Run (self-reference, Q1-7)', async () => {
    // Set up reviewed Run.
    const reviewedRunDir = await createRun(
      createRunInput({
        runId: '20260806-060-apply',
        action: 'apply',
        role: 'author',
      }),
    );
    await writeRunResult(reviewedRunDir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'done' },
    });

    const runDir = await createRun(
      createRunInput({
        runId: '20260806-061-review-apply',
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-060-apply',
      }),
    );

    const selfRef = buildRunResultRef(
      '.flowkit/runs/D1/C1/20260806-061-review-apply',
      'self-content',
    );

    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: {
            action: 'review-apply',
            executionStatus: 'completed',
            summary: 'review',
            reviewVerdictRef: selfRef,
          },
          reviewVerdict: 'approved',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('allows retry after preflight failure (Q1-6.8)', async () => {
    const runDir = await createRun(
      createRunInput({
        runId: '20260806-070-explore',
        action: 'explore',
      }),
    );

    // First attempt: fail with missing target.
    const missingRef = buildRunResultRef(
      '.flowkit/runs/D1/C1/20260806-999-nonexistent',
      'content',
    );
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: {
            action: 'explore',
            executionStatus: 'completed',
            summary: 'fail',
            consumedInputRefs: [missingRef],
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_TARGET_MISSING',
    );

    // Run stays pending — retry without the bad ref.
    await writeRunResult(runDir, {
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'retry success' },
    });

    // result.json now exists.
    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).actionResult.summary, 'retry success');
  });
});

// ---------------------------------------------------------------------------
// Review exact binding via createRun (task 4.8)
// ---------------------------------------------------------------------------

describe('Q1 review exact binding via createRun (task 4.8)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('derives inputRef from reviewedRunId and binds to actual result.json', async () => {
    // Set up reviewed Run.
    const reviewedRunDir = await createRun(
      createRunInput({
        runId: '20260806-080-propose',
        action: 'propose',
        role: 'author',
      }),
    );
    await writeRunResult(reviewedRunDir, {
      runStatus: 'completed',
      actionResult: { action: 'propose', executionStatus: 'completed', summary: 'proposal' },
    });

    // Create review-propose Run — Core should derive inputRef from reviewedRunId.
    const reviewRunDir = await createRun(
      createRunInput({
        runId: '20260806-081-review-propose',
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-080-propose',
      }),
    );

    // Verify context.json has Core-derived inputRef.
    const contextJson = await readFile(join(reviewRunDir, 'context.json'), 'utf-8');
    const ctx = JSON.parse(contextJson);
    assert.ok(ctx.inputRef, 'inputRef must be derived by Core');
    assert.equal(
      ctx.inputRef.ref,
      '.flowkit/runs/D1/C1/20260806-080-propose/result.json',
    );
    assert.equal(ctx.inputRef.kind, 'run-result');

    // Verify fingerprint matches actual result.json content.
    const reviewedContent = await readFile(
      join(reviewedRunDir, 'result.json'),
      'utf-8',
    );
    assert.equal(
      ctx.inputRef.versionFingerprint,
      computeResultFileHash(reviewedContent),
    );
  });

  it('throws RESULT_REF_TARGET_MISSING when reviewed Run result.json does not exist', async () => {
    await assert.rejects(
      () =>
        createRun(
          createRunInput({
            runId: '20260806-082-review-propose',
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
// Generation-aware Reader validation (tasks 5.9-5.10)
// ---------------------------------------------------------------------------

/**
 * Build a complete initial-propose producedResultRefs set for a Change: writes
 * proposal.md / design.md / tasks.md + one spec, then returns ResultRefs whose
 * fingerprints match the written content. This satisfies the initial-propose
 * completion preflight (Q1-5.0) which requires an exact Core-enumerated set.
 */
async function buildInitialProposeRefs(changeId: string, version: 'v0' | 'v1') {
  const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
  await mkdir(join(changeDir, 'specs', 'cap-a'), { recursive: true });
  const proposalContent = `# Proposal ${version}\n`;
  const designContent = `# Design ${version}\n`;
  const tasksContent = `# Tasks ${version}\n`;
  const specContent = `# Spec A ${version}\n`;
  await writeFile(join(changeDir, 'proposal.md'), proposalContent);
  await writeFile(join(changeDir, 'design.md'), designContent);
  await writeFile(join(changeDir, 'tasks.md'), tasksContent);
  await writeFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), specContent);
  return [
    buildArtifactResultRef(`openspec/changes/${changeId}/proposal.md`, proposalContent, PRODUCED_ARTIFACT_KIND),
    buildArtifactResultRef(`openspec/changes/${changeId}/design.md`, designContent, PRODUCED_ARTIFACT_KIND),
    buildArtifactResultRef(`openspec/changes/${changeId}/tasks.md`, tasksContent, PRODUCED_ARTIFACT_KIND),
    buildArtifactResultRef(`openspec/changes/${changeId}/specs/cap-a/spec.md`, specContent, PRODUCED_ARTIFACT_KIND),
  ];
}

describe('Q1 generation-aware Reader validation (tasks 5.9-5.10)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('superseded generation produces no false FactConflict after legitimate revise (5.9)', async () => {
    const changeId = 'C1';
    // P0: initial propose with complete v0 set.
    const p0Refs = await buildInitialProposeRefs(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({
        runId: '20260806-090-propose',
        action: 'propose',
        role: 'author',
      }),
    );
    await writeRunResult(p0Dir, {
      runStatus: 'completed',
      actionResult: {
        action: 'propose',
        executionStatus: 'completed',
        summary: 'P0 proposal',
        producedResultRefs: p0Refs,
      },
    });

    // R0: review-propose(P0) → changes-requested.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-091-review-propose',
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-090-propose',
      }),
    );
    await writeRunResult(r0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'CR' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'needs work', requiredChange: 'revise' },
      ],
    });

    // P1: revise-propose overwrites proposal.md + design.md with v1 content.
    // (tasks.md + specs stay at v0 and are inherited — but the Reader only
    // validates the CURRENT generation's declared producedResultRefs.)
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    const designV1 = '# Design v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);
    await writeFile(join(changeDir, 'design.md'), designV1);

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-092-revise-propose',
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-091-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await writeRunResult(p1Dir, {
      runStatus: 'completed',
      actionResult: {
        action: 'revise-propose',
        executionStatus: 'completed',
        summary: 'P1 revision',
        producedResultRefs: [
          buildArtifactResultRef(`openspec/changes/${changeId}/proposal.md`, proposalV1, PRODUCED_ARTIFACT_KIND),
          buildArtifactResultRef(`openspec/changes/${changeId}/design.md`, designV1, PRODUCED_ARTIFACT_KIND),
        ],
      },
    });

    // Reader: P0 is superseded by the legitimate R0→P1 chain; its overwritten
    // proposal/design refs MUST NOT produce false FactConflicts. P1 (current)
    // refs match current bytes.
    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId: 'D1',
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    const artifactConflicts = snapshot.conflicts.filter(
      (c) => c.dimension === 'artifact-replaced' || c.dimension === 'artifact-missing',
    );
    assert.equal(
      artifactConflicts.length,
      0,
      `expected no artifact conflicts for superseded P0, got: ${JSON.stringify(artifactConflicts)}`,
    );
  });

  it('canonical overwrite without legitimate revision lineage fails closed (5.10)', async () => {
    const changeId = 'C2';
    // P0: initial propose with complete v0 set.
    const p0Refs = await buildInitialProposeRefs(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({
        runId: '20260806-093-propose',
        changeId: 'C2',
        action: 'propose',
        role: 'author',
      }),
    );
    await writeRunResult(p0Dir, {
      runStatus: 'completed',
      actionResult: {
        action: 'propose',
        executionStatus: 'completed',
        summary: 'P0 proposal',
        producedResultRefs: p0Refs,
      },
    });

    // Overwrite proposal.md with no review/revise lineage.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal tampered\n');

    // Reader: P0 is the only/current artifact Run; its proposal ref no longer
    // matches current bytes → FactConflict (fail-closed).
    const snapshot = await readFormalFactSnapshot({
      repoRoot: tempRoot,
      deliveryId: 'D1',
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: '.flowkit/manifests',
    });

    const replaced = snapshot.conflicts.filter((c) => c.dimension === 'artifact-replaced');
    assert.ok(
      replaced.some((c) => c.message.includes('proposal.md')),
      `expected an artifact-replaced conflict for proposal.md, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// revise-propose specs namespace exact-set comparison (task 5.13 / Q1-RP-006)
// ---------------------------------------------------------------------------

/**
 * Write a single spec file under specs/<cap>/spec.md and return its ResultRef.
 */
async function writeSpecRef(changeId: string, cap: string, content: string) {
  const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
  await mkdir(join(changeDir, 'specs', cap), { recursive: true });
  await writeFile(join(changeDir, 'specs', cap, 'spec.md'), content);
  return buildArtifactResultRef(
    `openspec/changes/${changeId}/specs/${cap}/spec.md`,
    content,
    PRODUCED_ARTIFACT_KIND,
  );
}

describe('Q1 revise-propose specs namespace exact-set (task 5.13 / Q1-RP-006)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('rejects namespace drift without declaring specs (negative, 5.13)', async () => {
    const changeId = 'C3';
    // P0: initial propose with specs {A}.
    const p0Refs = await buildInitialProposeRefs(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-100-propose', changeId: 'C3', action: 'propose', role: 'author' }),
    );
    await writeRunResult(p0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0', producedResultRefs: p0Refs },
    });

    // R0: review CR.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-101-review-propose',
        changeId: 'C3',
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-100-propose',
      }),
    );
    await writeRunResult(r0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'CR' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'add spec', problem: 'needs B', requiredChange: 'add B' },
      ],
    });

    // Namespace drift: add spec B without declaring specs on P1.
    await writeSpecRef(changeId, 'cap-b', '# Spec B\n');

    // P1: revise-propose declares only proposal (no specs).
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);
    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-102-revise-propose',
        changeId: 'C3',
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-101-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await assert.rejects(
      () =>
        writeRunResult(p1Dir, {
          runStatus: 'completed',
          actionResult: {
            action: 'revise-propose',
            executionStatus: 'completed',
            summary: 'P1',
            producedResultRefs: [
              buildArtifactResultRef(`openspec/changes/${changeId}/proposal.md`, proposalV1, PRODUCED_ARTIFACT_KIND),
            ],
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );

    // Run stays pending.
    const entries = await readdir(p1Dir);
    assert.ok(!entries.includes('result.json'));
  });

  it('accepts re-enumerated specs after declaring specs (positive, 5.13)', async () => {
    const changeId = 'C4';
    // P0: initial propose with specs {A}.
    const p0Refs = await buildInitialProposeRefs(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-110-propose', changeId: 'C4', action: 'propose', role: 'author' }),
    );
    await writeRunResult(p0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0', producedResultRefs: p0Refs },
    });

    // R0: review CR.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-111-review-propose',
        changeId: 'C4',
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-110-propose',
      }),
    );
    await writeRunResult(r0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'CR' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'add spec', problem: 'needs B', requiredChange: 'add B' },
      ],
    });

    // Namespace change: add spec B. P1 declares specs (re-enumerate {A,B}).
    const specAContent = '# Spec A v0\n';
    const specBContent = '# Spec B\n';
    await writeSpecRef(changeId, 'cap-a', specAContent);
    const specBRef = await writeSpecRef(changeId, 'cap-b', specBContent);

    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-112-revise-propose',
        changeId: 'C4',
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-111-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    // P1 declares proposal + specs(A) + specs(B). Specs namespace {A,B} == canonical {A,B}.
    await writeRunResult(p1Dir, {
      runStatus: 'completed',
      actionResult: {
        action: 'revise-propose',
        executionStatus: 'completed',
        summary: 'P1',
        producedResultRefs: [
          buildArtifactResultRef(`openspec/changes/${changeId}/proposal.md`, proposalV1, PRODUCED_ARTIFACT_KIND),
          buildArtifactResultRef(`openspec/changes/${changeId}/specs/cap-a/spec.md`, specAContent, PRODUCED_ARTIFACT_KIND),
          specBRef,
        ],
      },
    });

    // result.json published — terminal.
    const content = await readFile(join(p1Dir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).runStatus, 'completed');
  });

  it('accepts subset overlay when namespace is unchanged (5.13)', async () => {
    const changeId = 'C5';
    // P0: initial propose with specs {A}.
    const p0Refs = await buildInitialProposeRefs(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-120-propose', changeId: 'C5', action: 'propose', role: 'author' }),
    );
    await writeRunResult(p0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0', producedResultRefs: p0Refs },
    });

    // R0: review CR.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-121-review-propose',
        changeId: 'C5',
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-120-propose',
      }),
    );
    await writeRunResult(r0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'CR' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'needs work', requiredChange: 'revise proposal' },
      ],
    });

    // Namespace unchanged. P1 declares only proposal (subset overlay).
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-122-revise-propose',
        changeId: 'C5',
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-121-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    // P1 declares only proposal; inherited specs {A} == canonical {A} (unchanged).
    await writeRunResult(p1Dir, {
      runStatus: 'completed',
      actionResult: {
        action: 'revise-propose',
        executionStatus: 'completed',
        summary: 'P1',
        producedResultRefs: [
          buildArtifactResultRef(`openspec/changes/${changeId}/proposal.md`, proposalV1, PRODUCED_ARTIFACT_KIND),
        ],
      },
    });

    const content = await readFile(join(p1Dir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).runStatus, 'completed');
  });
});

// ---------------------------------------------------------------------------
// Subset omission fixture (task 5.11)
// ---------------------------------------------------------------------------

describe('Q1 subset omission fixture (task 5.11)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('undeclared singleton content change keeps revise-propose pending (5.11)', async () => {
    const changeId = 'C6';
    // P0: initial propose with complete v0 set.
    const p0Refs = await buildInitialProposeRefs(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-130-propose', changeId: 'C6', action: 'propose', role: 'author' }),
    );
    await writeRunResult(p0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0', producedResultRefs: p0Refs },
    });

    // R0: review CR.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-131-review-propose',
        changeId: 'C6',
        action: 'review-propose',
        role: 'reviewer',
        reviewedRunId: '20260806-130-propose',
      }),
    );
    await writeRunResult(r0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'CR' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'needs work', requiredChange: 'revise' },
      ],
    });

    // P1: revise-propose declares ONLY proposal (v1), but design.md is also
    // modified to v1 on disk. Since design is inherited (P0 v0 fingerprint)
    // and not re-declared by P1, the inherited design ref mismatches the
    // modified design.md bytes → RESULT_REF_MISMATCH → P1 stays pending.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    const designV1 = '# Design v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);
    await writeFile(join(changeDir, 'design.md'), designV1);

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-132-revise-propose',
        changeId: 'C6',
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-131-review-propose',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await assert.rejects(
      () =>
        writeRunResult(p1Dir, {
          runStatus: 'completed',
          actionResult: {
            action: 'revise-propose',
            executionStatus: 'completed',
            summary: 'P1',
            producedResultRefs: [
              buildArtifactResultRef(`openspec/changes/${changeId}/proposal.md`, proposalV1, PRODUCED_ARTIFACT_KIND),
            ],
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );

    // Run stays pending.
    const entries = await readdir(p1Dir);
    assert.ok(!entries.includes('result.json'));
  });
});

// ---------------------------------------------------------------------------
// Initial coverage fixtures (task 5.12)
// ---------------------------------------------------------------------------

describe('Q1 initial coverage fixtures (task 5.12)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('rejects empty initial explore (missing explore.md, 5.12)', async () => {
    const changeId = 'C7';
    const runDir = await createRun(
      createRunInput({ runId: '20260806-140-explore', changeId, action: 'explore', role: 'author' }),
    );
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: {
            action: 'explore',
            executionStatus: 'completed',
            summary: 'empty explore',
            producedResultRefs: [],
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );

    // Run stays pending.
    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'));
  });

  it('rejects partial initial propose (missing design/tasks, 5.12)', async () => {
    const changeId = 'C8';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    const proposalContent = '# Proposal only\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalContent);

    const runDir = await createRun(
      createRunInput({ runId: '20260806-141-propose', changeId: 'C8', action: 'propose', role: 'author' }),
    );
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: {
            action: 'propose',
            executionStatus: 'completed',
            summary: 'partial',
            producedResultRefs: [
              buildArtifactResultRef(`openspec/changes/${changeId}/proposal.md`, proposalContent, PRODUCED_ARTIFACT_KIND),
            ],
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );

    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'));
  });

  it('rejects initial propose when a spec exists in namespace but is undeclared (5.12)', async () => {
    const changeId = 'C9';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(join(changeDir, 'specs', 'cap-a'), { recursive: true });
    await mkdir(join(changeDir, 'specs', 'cap-b'), { recursive: true });
    const proposalContent = '# Proposal\n';
    const designContent = '# Design\n';
    const tasksContent = '# Tasks\n';
    const specAContent = '# Spec A\n';
    const specBContent = '# Spec B\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalContent);
    await writeFile(join(changeDir, 'design.md'), designContent);
    await writeFile(join(changeDir, 'tasks.md'), tasksContent);
    await writeFile(join(changeDir, 'specs', 'cap-a', 'spec.md'), specAContent);
    // cap-b exists on disk but will NOT be declared → Core enumerates the full
    // namespace and requires it → missing → rejected.
    await writeFile(join(changeDir, 'specs', 'cap-b', 'spec.md'), specBContent);

    const runDir = await createRun(
      createRunInput({ runId: '20260806-142-propose', changeId: 'C9', action: 'propose', role: 'author' }),
    );
    await assert.rejects(
      () =>
        writeRunResult(runDir, {
          runStatus: 'completed',
          actionResult: {
            action: 'propose',
            executionStatus: 'completed',
            summary: 'unbound spec',
            producedResultRefs: [
              buildArtifactResultRef(`openspec/changes/${changeId}/proposal.md`, proposalContent, PRODUCED_ARTIFACT_KIND),
              buildArtifactResultRef(`openspec/changes/${changeId}/design.md`, designContent, PRODUCED_ARTIFACT_KIND),
              buildArtifactResultRef(`openspec/changes/${changeId}/tasks.md`, tasksContent, PRODUCED_ARTIFACT_KIND),
              buildArtifactResultRef(`openspec/changes/${changeId}/specs/cap-a/spec.md`, specAContent, PRODUCED_ARTIFACT_KIND),
            ],
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );

    const entries = await readdir(runDir);
    assert.ok(!entries.includes('result.json'));
  });

  it('accepts complete initial propose and publishes terminal result (5.12 positive)', async () => {
    const changeId = 'C10';
    const refs = await buildInitialProposeRefs(changeId, 'v0');
    const runDir = await createRun(
      createRunInput({ runId: '20260806-143-propose', changeId: 'C10', action: 'propose', role: 'author' }),
    );
    await writeRunResult(runDir, {
      runStatus: 'completed',
      actionResult: { action: 'propose', executionStatus: 'completed', summary: 'complete', producedResultRefs: refs },
    });

    const content = await readFile(join(runDir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).runStatus, 'completed');
  });
});

// ---------------------------------------------------------------------------
// Verification generation-aware validation (tasks 7.4-7.7 / Q1-9)
// ---------------------------------------------------------------------------

/**
 * Write `verification.md` for a Change and return its verification-summary
 * ResultRef (fingerprint matches the written content).
 */
async function writeVerificationRef(changeId: string, content: string) {
  const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
  await mkdir(changeDir, { recursive: true });
  const relPath = `openspec/changes/${changeId}/verification.md`;
  await writeFile(join(changeDir, 'verification.md'), content);
  return buildArtifactResultRef(relPath, content, VERIFICATION_SUMMARY_KIND);
}

async function readSnapshot() {
  return readFormalFactSnapshot({
    repoRoot: tempRoot,
    deliveryId: 'D1',
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: '.flowkit/manifests',
  });
}

describe('Q1 verification generation-aware (tasks 7.4-7.7)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('superseded review-apply verificationSummaryRef produces no false conflict after legitimate revise-apply (7.5)', async () => {
    const changeId = 'C11';
    // A0: apply Run (reviewed by V0).
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-150-apply', changeId, action: 'apply', role: 'author' }),
    );
    await writeRunResult(a0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0 apply' },
    });

    // verification.md v0.
    const v0Ref = await writeVerificationRef(changeId, '# Verification v0\n');

    // V0: review-apply(A0) → changes-requested, verificationSummaryRef = v0.
    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-151-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-150-apply',
      }),
    );
    await writeRunResult(v0Dir, {
      runStatus: 'completed',
      actionResult: {
        action: 'review-apply',
        executionStatus: 'completed',
        summary: 'V0 CR',
        verificationSummaryRef: v0Ref,
      },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'needs work', requiredChange: 'revise' },
      ],
    });

    // R0: revise-apply — legitimate revise-apply opens the verification revision window.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-152-revise-apply',
        changeId,
        action: 'revise-apply',
        role: 'author',
        sourceReviewRun: '20260806-151-review-apply',
        sourceReviewVerdict: 'changes-requested',
      }),
    );
    await writeRunResult(r0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'revise-apply', executionStatus: 'completed', summary: 'R0 revise' },
    });

    // verification.md updated to v1 (Change Verification after revise-apply).
    const v1Ref = await writeVerificationRef(changeId, '# Verification v1\n');

    // V1: review-apply(R0) → approved, verificationSummaryRef = v1.
    const v1Dir = await createRun(
      createRunInput({
        runId: '20260806-153-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-152-revise-apply',
      }),
    );
    await writeRunResult(v1Dir, {
      runStatus: 'completed',
      actionResult: {
        action: 'review-apply',
        executionStatus: 'completed',
        summary: 'V1 approved',
        verificationSummaryRef: v1Ref,
      },
      reviewVerdict: 'approved',
    });

    // Reader: V0 superseded (CR + revise-apply R0 between V0 and V1); V1 current.
    // V0's v0 ref is NOT re-validated → no false conflict. V1's v1 ref matches → no conflict.
    const snapshot = await readSnapshot();
    const verificationConflicts = snapshot.conflicts.filter(
      (c) => c.dimension === 'verification-summary-missing' || c.dimension === 'verification-summary-replaced',
    );
    assert.equal(
      verificationConflicts.length,
      0,
      `expected no verification-summary conflicts for superseded V0, got: ${JSON.stringify(verificationConflicts)}`,
    );
  });

  it('no-lineage verification.md replacement fails closed (7.7)', async () => {
    const changeId = 'C12';
    // A0: apply Run.
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-160-apply', changeId, action: 'apply', role: 'author' }),
    );
    await writeRunResult(a0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'apply', executionStatus: 'completed', summary: 'A0 apply' },
    });

    // verification.md v0.
    const v0Ref = await writeVerificationRef(changeId, '# Verification v0\n');

    // V0: review-apply(A0) → approved, verificationSummaryRef = v0.
    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-161-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-160-apply',
      }),
    );
    await writeRunResult(v0Dir, {
      runStatus: 'completed',
      actionResult: {
        action: 'review-apply',
        executionStatus: 'completed',
        summary: 'V0 approved',
        verificationSummaryRef: v0Ref,
      },
      reviewVerdict: 'approved',
    });

    // Tamper verification.md to v1 with NO revise-apply lineage.
    await writeVerificationRef(changeId, '# Verification tampered\n');

    // Reader: V0 is current (no successor); its v0 ref mismatches tampered v1 → conflict.
    const snapshot = await readSnapshot();
    const replaced = snapshot.conflicts.filter((c) => c.dimension === 'verification-summary-replaced');
    assert.ok(
      replaced.length > 0,
      `expected a verification-summary-replaced conflict, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Archive relocation (tasks 8.2-8.3 / Q1-10)
// ---------------------------------------------------------------------------

describe('Q1 archive relocation (tasks 8.2-8.3)', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('post-archive Reader resolves current effective artifacts via unique archive target (8.3)', async () => {
    const changeId = 'C13';
    // P0: complete propose with v0 set.
    const refs = await buildInitialProposeRefs(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-170-propose', changeId, action: 'propose', role: 'author' }),
    );
    await writeRunResult(p0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0', producedResultRefs: refs },
    });

    // Archive relocation: move the Change's OpenSpec artifacts to the unique
    // archive directory (Run dirs are NOT moved — only OpenSpec artifacts).
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const archiveDir = join(tempRoot, 'openspec', 'changes', 'archive', `2026-01-01-${changeId}`);
    await mkdir(join(tempRoot, 'openspec', 'changes', 'archive'), { recursive: true });
    await rename(changeDir, archiveDir);

    // Reader: P0 is current; its producedResultRefs MUST resolve via the unique
    // archive target and the final effective fingerprints MUST match → no conflict.
    const snapshot = await readSnapshot();
    const artifactConflicts = snapshot.conflicts.filter(
      (c) =>
        c.dimension === 'artifact-missing' ||
        c.dimension === 'artifact-replaced' ||
        c.dimension === 'artifact-archive-ambiguous',
    );
    assert.equal(
      artifactConflicts.length,
      0,
      `expected no artifact conflicts post-archive, got: ${JSON.stringify(artifactConflicts)}`,
    );
  });

  it('post-archive active+archive ambiguity fails closed (8.4)', async () => {
    const changeId = 'C14';
    const refs = await buildInitialProposeRefs(changeId, 'v0');
    const p0Dir = await createRun(
      createRunInput({ runId: '20260806-180-propose', changeId, action: 'propose', role: 'author' }),
    );
    await writeRunResult(p0Dir, {
      runStatus: 'completed',
      actionResult: { action: 'propose', executionStatus: 'completed', summary: 'P0', producedResultRefs: refs },
    });

    // Create BOTH active and archive copies → ambiguity.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const archiveDir = join(tempRoot, 'openspec', 'changes', 'archive', `2026-02-02-${changeId}`);
    await mkdir(join(tempRoot, 'openspec', 'changes', 'archive'), { recursive: true });
    // Copy (not move) so both exist.
    const { cp } = await import('node:fs/promises');
    await cp(changeDir, archiveDir, { recursive: true });

    const snapshot = await readSnapshot();
    const ambiguous = snapshot.conflicts.filter((c) => c.dimension === 'artifact-archive-ambiguous');
    assert.ok(
      ambiguous.length > 0,
      `expected artifact-archive-ambiguous conflicts, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`,
    );
  });
});
