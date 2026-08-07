/**
 * Execution-model lifecycle integration tests.
 *
 * Cross-module fixtures covering the product execution-model lifecycle. These
 * tests exercise `createRun` + `completeRun` + `readFormalFactSnapshot`
 * together to verify end-to-end lifecycle behavior — not any single module in
 * isolation.
 *
 * Responsibility split (per long-term product ownership):
 *   - Module-level unit tests (schema, ResultRef construction, createRun,
 *     completeRun, review-entry) live in `tests/unit/persistence/` and
 *     `tests/unit/facts/`.
 *   - THIS file covers cross-module lifecycle concerns:
 *       1. Generation-aware Reader validation (supersession + fail-closed).
 *       2. revise-propose effective-set lifecycle (specs namespace exact-set,
 *          subset overlay, undeclared singleton drift).
 *       3. Verification generation-aware (review-apply → revise-apply lineage).
 *       4. Archive relocation (post-archive Reader recovery + ambiguity).
 *
 * All terminal writes use `completeRun` (descriptor-driven Core-owned
 * ResultRef authority). No caller-built ResultRef objects enter the persisted
 * model.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FlowkitError } from '../../src/shared/errors.js';
import { createRun, completeRun } from '../../src/persistence/run-persistence.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import type { ReviewVerdictValue } from '../../src/domain/types.js';
import type { ProducedArtifactTag } from '../../src/persistence/result-ref-adapter.js';

// ---------------------------------------------------------------------------
// Shared test fixture helpers
// ---------------------------------------------------------------------------

let tempRoot: string;

async function makeTempRoot(): Promise<string> {
  tempRoot = await mkdtemp(join(tmpdir(), 'flowkit-lifecycle-'));
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

/**
 * Write the complete initial-propose artifact set (proposal/design/tasks +
 * one spec) and return the content strings. Satisfies the initial-propose
 * Core-expected produced set.
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

/**
 * Write a single spec file under specs/<cap>/spec.md.
 */
async function writeSpec(changeId: string, cap: string, content: string): Promise<void> {
  const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
  await mkdir(join(changeDir, 'specs', cap), { recursive: true });
  await writeFile(join(changeDir, 'specs', cap, 'spec.md'), content);
}

/**
 * Write `verification.md` for a Change.
 */
async function writeVerification(changeId: string, content: string): Promise<void> {
  const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
  await mkdir(changeDir, { recursive: true });
  await writeFile(join(changeDir, 'verification.md'), content);
}

/**
 * Read the formal fact snapshot for the shared temp root.
 */
async function readSnapshot() {
  return readFormalFactSnapshot({
    repoRoot: tempRoot,
    deliveryId: 'D1',
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: '.flowkit/manifests',
  });
}

/**
 * Create + complete an initial propose Run with the v0 artifact set.
 */
async function setupInitialPropose(
  changeId: string,
  runId: string,
): Promise<string> {
  await writeInitialProposeArtifacts(changeId, 'v0');
  const runDir = await createRun(
    createRunInput({ runId, changeId, action: 'propose', role: 'author' }),
  );
  await completeRun(runDir, { executionStatus: 'completed', summary: 'P0 propose' });
  return runDir;
}

/**
 * Create + complete a review-propose Run returning changes-requested.
 */
async function setupReviewProposeCR(
  changeId: string,
  runId: string,
  reviewedRunId: string,
): Promise<string> {
  const runDir = await createRun(
    createRunInput({
      runId,
      changeId,
      action: 'review-propose',
      role: 'reviewer',
      reviewedRunId,
    }),
  );
  await completeRun(runDir, {
    executionStatus: 'completed',
    summary: 'CR',
    reviewVerdict: 'changes-requested',
    reviewFindings: [
      { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'needs work', requiredChange: 'revise' },
    ],
  });
  return runDir;
}

// ---------------------------------------------------------------------------
// 1. Generation-aware Reader validation (supersession + fail-closed)
// ---------------------------------------------------------------------------

describe('generation-aware Reader validation', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('superseded generation produces no false FactConflict after legitimate revise', async () => {
    const changeId = 'LC-superseded';
    // P0: initial propose (complete v0 set via completeRun).
    await setupInitialPropose(changeId, '20260806-010-propose');

    // R0: review-propose(P0) → changes-requested.
    await setupReviewProposeCR(changeId, '20260806-011-review-propose', '20260806-010-propose');

    // P1: revise-propose overwrites proposal.md + design.md with v1 content.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    const designV1 = '# Design v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);
    await writeFile(join(changeDir, 'design.md'), designV1);

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-012-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-011-review-propose',
        sourceReviewVerdict: 'changes-requested' as ReviewVerdictValue,
      }),
    );
    await completeRun(p1Dir, {
      executionStatus: 'completed',
      summary: 'P1 revision',
      producedArtifactTags: ['proposal', 'design'] as readonly ProducedArtifactTag[],
    });

    // Reader: P0 is superseded by the legitimate R0→P1 chain; its overwritten
    // proposal/design refs MUST NOT produce false FactConflicts. P1 (current)
    // refs match current bytes.
    const snapshot = await readSnapshot();
    const artifactConflicts = snapshot.conflicts.filter(
      (c) => c.dimension === 'artifact-replaced' || c.dimension === 'artifact-missing',
    );
    assert.equal(
      artifactConflicts.length,
      0,
      `expected no artifact conflicts for superseded P0, got: ${JSON.stringify(artifactConflicts)}`,
    );
  });

  it('canonical overwrite without legitimate revision lineage fails closed', async () => {
    const changeId = 'LC-failclosed';
    // P0: initial propose (complete v0 set).
    await setupInitialPropose(changeId, '20260806-020-propose');

    // Overwrite proposal.md with no review/revise lineage.
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await writeFile(join(changeDir, 'proposal.md'), '# Proposal tampered\n');

    // Reader: P0 is the only/current artifact Run; its proposal ref no longer
    // matches current bytes → FactConflict (fail-closed).
    const snapshot = await readSnapshot();
    const replaced = snapshot.conflicts.filter((c) => c.dimension === 'artifact-replaced');
    assert.ok(
      replaced.some((c) => c.message.includes('proposal.md')),
      `expected an artifact-replaced conflict for proposal.md, got: ${JSON.stringify(snapshot.conflicts.map((c) => c.dimension))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. revise-propose effective-set lifecycle
// ---------------------------------------------------------------------------

describe('revise-propose effective-set lifecycle', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('rejects namespace drift without declaring specs (new spec added, undeclared)', async () => {
    const changeId = 'LC-specs-drift';
    await setupInitialPropose(changeId, '20260806-030-propose');
    await setupReviewProposeCR(changeId, '20260806-031-review-propose', '20260806-030-propose');

    // Namespace drift: add spec B without declaring specs on P1.
    await writeSpec(changeId, 'cap-b', '# Spec B\n');

    // P1: revise-propose declares only proposal (no specs).
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-032-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-031-review-propose',
        sourceReviewVerdict: 'changes-requested' as ReviewVerdictValue,
      }),
    );
    await assert.rejects(
      () =>
        completeRun(p1Dir, {
          executionStatus: 'completed',
          summary: 'P1',
          producedArtifactTags: ['proposal'] as readonly ProducedArtifactTag[],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );

    // Run stays pending.
    const entries = await readdirSafe(p1Dir);
    assert.ok(!entries.includes('result.json'));
  });

  it('accepts re-enumerated specs after declaring specs tag', async () => {
    const changeId = 'LC-specs-reenum';
    await setupInitialPropose(changeId, '20260806-040-propose');
    await setupReviewProposeCR(changeId, '20260806-041-review-propose', '20260806-040-propose');

    // Namespace change: add spec B. P1 declares proposal + specs (re-enumerate {A,B}).
    await writeSpec(changeId, 'cap-a', '# Spec A v0\n');
    await writeSpec(changeId, 'cap-b', '# Spec B\n');

    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-042-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-041-review-propose',
        sourceReviewVerdict: 'changes-requested' as ReviewVerdictValue,
      }),
    );
    // P1 declares proposal + specs. Specs namespace {A,B} == canonical {A,B}.
    await completeRun(p1Dir, {
      executionStatus: 'completed',
      summary: 'P1',
      producedArtifactTags: ['proposal', 'specs'] as readonly ProducedArtifactTag[],
    });

    // result.json published — terminal.
    const content = await readFile(join(p1Dir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).runStatus, 'completed');
  });

  it('accepts subset overlay when specs namespace is unchanged', async () => {
    const changeId = 'LC-specs-subset';
    await setupInitialPropose(changeId, '20260806-050-propose');
    await setupReviewProposeCR(changeId, '20260806-051-review-propose', '20260806-050-propose');

    // Namespace unchanged. P1 declares only proposal (subset overlay).
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    const proposalV1 = '# Proposal v1\n';
    await writeFile(join(changeDir, 'proposal.md'), proposalV1);

    const p1Dir = await createRun(
      createRunInput({
        runId: '20260806-052-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-051-review-propose',
        sourceReviewVerdict: 'changes-requested' as ReviewVerdictValue,
      }),
    );
    // P1 declares only proposal; inherited specs {A} == canonical {A} (unchanged).
    await completeRun(p1Dir, {
      executionStatus: 'completed',
      summary: 'P1',
      producedArtifactTags: ['proposal'] as readonly ProducedArtifactTag[],
    });

    const content = await readFile(join(p1Dir, 'result.json'), 'utf-8');
    assert.equal(JSON.parse(content).runStatus, 'completed');
  });

  it('undeclared singleton content change keeps revise-propose pending', async () => {
    const changeId = 'LC-omission';
    await setupInitialPropose(changeId, '20260806-060-propose');
    await setupReviewProposeCR(changeId, '20260806-061-review-propose', '20260806-060-propose');

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
        runId: '20260806-062-revise-propose',
        changeId,
        action: 'revise-propose',
        role: 'author',
        sourceReviewRun: '20260806-061-review-propose',
        sourceReviewVerdict: 'changes-requested' as ReviewVerdictValue,
      }),
    );
    await assert.rejects(
      () =>
        completeRun(p1Dir, {
          executionStatus: 'completed',
          summary: 'P1',
          producedArtifactTags: ['proposal'] as readonly ProducedArtifactTag[],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RESULT_REF_MISMATCH',
    );

    // Run stays pending.
    const entries = await readdirSafe(p1Dir);
    assert.ok(!entries.includes('result.json'));
  });
});

// ---------------------------------------------------------------------------
// 3. Verification generation-aware (review-apply → revise-apply lineage)
// ---------------------------------------------------------------------------

describe('verification generation-aware lifecycle', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('superseded review-apply verificationSummaryRef produces no false conflict after legitimate revise-apply', async () => {
    const changeId = 'LC-verify-superseded';
    // A0: apply Run (reviewed by V0).
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-070-apply', changeId, action: 'apply', role: 'author' }),
    );
    await completeRun(a0Dir, { executionStatus: 'completed', summary: 'A0 apply' });

    // verification.md v0.
    await writeVerification(changeId, '# Verification v0\n');

    // V0: review-apply(A0) → changes-requested, Core-derives verificationSummaryRef.
    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-071-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-070-apply',
      }),
    );
    await completeRun(v0Dir, {
      executionStatus: 'completed',
      summary: 'V0 CR',
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', title: 'fix', problem: 'needs work', requiredChange: 'revise' },
      ],
    });

    // R0: revise-apply — legitimate revise-apply opens the verification revision window.
    const r0Dir = await createRun(
      createRunInput({
        runId: '20260806-072-revise-apply',
        changeId,
        action: 'revise-apply',
        role: 'author',
        sourceReviewRun: '20260806-071-review-apply',
        sourceReviewVerdict: 'changes-requested' as ReviewVerdictValue,
      }),
    );
    await completeRun(r0Dir, { executionStatus: 'completed', summary: 'R0 revise' });

    // verification.md updated to v1 (Change Verification after revise-apply).
    await writeVerification(changeId, '# Verification v1\n');

    // V1: review-apply(R0) → approved, Core-derives verificationSummaryRef (v1).
    const v1Dir = await createRun(
      createRunInput({
        runId: '20260806-073-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-072-revise-apply',
      }),
    );
    await completeRun(v1Dir, {
      executionStatus: 'completed',
      summary: 'V1 approved',
      reviewVerdict: 'approved',
    });

    // Reader: V0 superseded (CR + revise-apply R0 between V0 and V1); V1 current.
    // V0's v0 ref is NOT re-validated → no false conflict. V1's v1 ref matches.
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

  it('no-lineage verification.md replacement fails closed', async () => {
    const changeId = 'LC-verify-failclosed';
    // A0: apply Run.
    const a0Dir = await createRun(
      createRunInput({ runId: '20260806-080-apply', changeId, action: 'apply', role: 'author' }),
    );
    await completeRun(a0Dir, { executionStatus: 'completed', summary: 'A0 apply' });

    // verification.md v0.
    await writeVerification(changeId, '# Verification v0\n');

    // V0: review-apply(A0) → approved, Core-derives verificationSummaryRef (v0).
    const v0Dir = await createRun(
      createRunInput({
        runId: '20260806-081-review-apply',
        changeId,
        action: 'review-apply',
        role: 'reviewer',
        reviewedRunId: '20260806-080-apply',
      }),
    );
    await completeRun(v0Dir, {
      executionStatus: 'completed',
      summary: 'V0 approved',
      reviewVerdict: 'approved',
    });

    // Tamper verification.md to v1 with NO revise-apply lineage.
    await writeVerification(changeId, '# Verification tampered\n');

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
// 4. Archive relocation (post-archive Reader recovery + ambiguity)
// ---------------------------------------------------------------------------

describe('archive relocation lifecycle', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('post-archive Reader resolves current effective artifacts via unique archive target', async () => {
    const changeId = 'LC-archive';
    // P0: complete propose with v0 set.
    await setupInitialPropose(changeId, '20260806-090-propose');

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

  it('post-archive active+archive ambiguity fails closed', async () => {
    const changeId = 'LC-archive-ambiguous';
    await setupInitialPropose(changeId, '20260806-100-propose');

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readdirSafe(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
