import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  computeResultFileHash,
  buildRunResultRef,
  buildArtifactResultRef,
  reconstructActionResult,
  verifyResultRef,
  resolveRunResultRef,
  resolveSingletonArtifactRef,
  resolveVerificationSummaryRef,
  enumerateSpecsNamespace,
  extractSpecsLogicalIdentities,
  resolveArchiveAwareArtifactPath,
  validateEffectiveArtifactRefs,
  validateSpecsExactSet,
  RUN_RESULT_KIND,
  PRODUCED_ARTIFACT_KIND,
  VERIFICATION_SUMMARY_KIND,
} from '../../../src/persistence/result-ref-adapter.js';

// ---------------------------------------------------------------------------
// Shared temp-root fixture (archive/specs enumeration tests need a repoRoot)
// ---------------------------------------------------------------------------

let tempRoot: string;

async function makeTempRoot(): Promise<string> {
  tempRoot = await mkdtemp(join(tmpdir(), 'flowkit-rra-'));
  return tempRoot;
}

async function cleanupTempRoot(): Promise<void> {
  await rm(tempRoot, { recursive: true, force: true });
}

describe('computeResultFileHash', () => {
  it('produces a stable SHA-256 hex digest (task 7.2)', () => {
    const content = '{"runStatus":"completed"}';
    const hash = computeResultFileHash(content);
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]+$/);
    assert.equal(computeResultFileHash(content), hash);
  });

  it('produces different digests for different content', () => {
    assert.notEqual(
      computeResultFileHash('a'),
      computeResultFileHash('b'),
    );
  });
});

describe('buildRunResultRef', () => {
  it('constructs a ResultRef with content-hash fingerprint (task 7.3, 12.20)', () => {
    const runPath = '.flowkit/runs/D1/C1/20260806-001-explore/';
    const content = '{"runStatus":"completed"}';
    const ref = buildRunResultRef(runPath, content);
    assert.equal(ref.ref, '.flowkit/runs/D1/C1/20260806-001-explore/result.json');
    assert.equal(ref.versionFingerprint, computeResultFileHash(content));
    assert.equal(ref.kind, RUN_RESULT_KIND);
  });

  it('write-read consistency (task 12.20)', () => {
    const runPath = 'runs/20260806-001-explore/';
    const content = '{"runStatus":"completed","summary":"done"}';
    const ref = buildRunResultRef(runPath, content);
    assert.equal(verifyResultRef(ref, content), true);
  });
});

describe('verifyResultRef', () => {
  it('returns true when fingerprint matches (task 7.5)', () => {
    const content = '{"x":1}';
    const ref = buildRunResultRef('p/', content);
    assert.equal(verifyResultRef(ref, content), true);
  });

  it('detects replacement when fingerprint mismatches (task 12.21, 12.22)', () => {
    const original = '{"x":1}';
    const replaced = '{"x":2}';
    const ref = buildRunResultRef('p/', original);
    assert.equal(verifyResultRef(ref, replaced), false);
  });
});

describe('reconstructActionResult', () => {
  it('derives runRef from file content and rebuilds ActionResult (task 7.4)', () => {
    const withoutRunRef = {
      action: 'explore' as const,
      executionStatus: 'completed' as const,
      summary: 'done',
    };
    const runPath = 'runs/20260806-001-explore/';
    const content = '{"runStatus":"completed"}';
    const ar = reconstructActionResult(withoutRunRef, runPath, content);
    assert.equal(ar.action, 'explore');
    assert.equal(ar.summary, 'done');
    assert.equal(ar.runRef.versionFingerprint, computeResultFileHash(content));
    assert.equal(ar.runRef.kind, RUN_RESULT_KIND);
  });

  it('does not include runRef in the input projection (task 12.23)', () => {
    // reconstructActionResult derives runRef; the input MUST NOT carry runRef.
    const withoutRunRef = {
      action: 'propose' as const,
      executionStatus: 'completed' as const,
      summary: 'done',
    };
    assert.ok(!('runRef' in withoutRunRef));
    const ar = reconstructActionResult(withoutRunRef, 'p/', 'content');
    assert.ok('runRef' in ar);
  });
});

describe('resolveRunResultRef', () => {
  it('resolves ref back to the result.json path (task 7.6)', () => {
    const ref = buildRunResultRef('runs/20260806-001-explore/', 'content');
    const path = resolveRunResultRef(ref);
    assert.equal(path, 'runs/20260806-001-explore/result.json');
  });

  it('throws for non-run-result kind', () => {
    assert.throws(() =>
      resolveRunResultRef({ ref: 'x', versionFingerprint: 'v', kind: 'other' }),
    );
  });
});

// ---------------------------------------------------------------------------
// buildArtifactResultRef + kind enum (tasks 3.2-3.4)
// ---------------------------------------------------------------------------

describe('buildArtifactResultRef', () => {
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
      () => buildArtifactResultRef('path/to/result.json', 'content', RUN_RESULT_KIND),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects path traversal in logical ref', () => {
    assert.throws(
      () => buildArtifactResultRef('../escape/proposal.md', 'content', PRODUCED_ARTIFACT_KIND),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects absolute path in logical ref', () => {
    assert.throws(
      () => buildArtifactResultRef('C:/absolute/proposal.md', 'content', PRODUCED_ARTIFACT_KIND),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects non-Run result.json target', () => {
    assert.throws(
      () => buildArtifactResultRef('openspec/changes/test/result.json', 'content', PRODUCED_ARTIFACT_KIND),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// resolveSingletonArtifactRef + resolveVerificationSummaryRef (task 3.6)
// ---------------------------------------------------------------------------

describe('resolveSingletonArtifactRef', () => {
  it('resolves explore tag to canonical path', () => {
    const ref = resolveSingletonArtifactRef('explore', 'explore', 'test-change');
    assert.equal(ref, 'openspec/changes/test-change/explore.md');
  });

  it('resolves proposal tag to canonical path', () => {
    const ref = resolveSingletonArtifactRef('propose', 'proposal', 'test-change');
    assert.equal(ref, 'openspec/changes/test-change/proposal.md');
  });

  it('resolves design tag to canonical path', () => {
    const ref = resolveSingletonArtifactRef('propose', 'design', 'test-change');
    assert.equal(ref, 'openspec/changes/test-change/design.md');
  });

  it('resolves tasks tag to canonical path', () => {
    const ref = resolveSingletonArtifactRef('propose', 'tasks', 'test-change');
    assert.equal(ref, 'openspec/changes/test-change/tasks.md');
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
});

describe('resolveVerificationSummaryRef', () => {
  it('resolves verification summary ref from changeId', () => {
    const ref = resolveVerificationSummaryRef('test-change');
    assert.equal(ref, 'openspec/changes/test-change/verification.md');
  });
});

// ---------------------------------------------------------------------------
// enumerateSpecsNamespace + extractSpecsLogicalIdentities (task 3.8)
// ---------------------------------------------------------------------------

describe('enumerateSpecsNamespace', () => {
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
});

describe('extractSpecsLogicalIdentities', () => {
  it('returns sorted ref paths', () => {
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

describe('resolveArchiveAwareArtifactPath', () => {
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
    const activeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(activeDir, { recursive: true });
    await writeFile(join(activeDir, 'proposal.md'), '# Active\n');
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
// Shared effective-set validators (Q1-RA-001 / Q1-RA-003)
// ---------------------------------------------------------------------------

describe('validateEffectiveArtifactRefs', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('returns no problems when all refs match current canonical bytes', async () => {
    const changeId = 'eff-match';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    const content = '# Proposal\n';
    await writeFile(join(changeDir, 'proposal.md'), content);
    const ref = buildArtifactResultRef(
      `openspec/changes/${changeId}/proposal.md`,
      content,
      PRODUCED_ARTIFACT_KIND,
    );
    const problems = await validateEffectiveArtifactRefs(tempRoot, [ref]);
    assert.equal(problems.length, 0);
  });

  it('reports mismatch when canonical bytes changed', async () => {
    const changeId = 'eff-mismatch';
    const changeDir = join(tempRoot, 'openspec', 'changes', changeId);
    await mkdir(changeDir, { recursive: true });
    const original = '# Proposal v0\n';
    const tampered = '# Proposal tampered\n';
    await writeFile(join(changeDir, 'proposal.md'), tampered);
    const ref = buildArtifactResultRef(
      `openspec/changes/${changeId}/proposal.md`,
      original,
      PRODUCED_ARTIFACT_KIND,
    );
    const problems = await validateEffectiveArtifactRefs(tempRoot, [ref]);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, 'mismatch');
    assert.equal(problems[0].expected, ref.versionFingerprint);
  });

  it('reports missing when target does not exist', async () => {
    const ref = buildArtifactResultRef(
      'openspec/changes/no-such-change/proposal.md',
      'content',
      PRODUCED_ARTIFACT_KIND,
    );
    const problems = await validateEffectiveArtifactRefs(tempRoot, [ref]);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, 'missing');
  });
});

describe('validateSpecsExactSet', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('returns null when effective set equals canonical namespace', async () => {
    const changeId = 'specs-exact-match';
    const specsDir = join(tempRoot, 'openspec', 'changes', changeId, 'specs', 'cap-a');
    await mkdir(specsDir, { recursive: true });
    const content = '# Spec A\n';
    await writeFile(join(specsDir, 'spec.md'), content);
    const refs = await enumerateSpecsNamespace(tempRoot, changeId);
    const mismatch = await validateSpecsExactSet(tempRoot, changeId, refs);
    assert.equal(mismatch, null);
  });

  it('returns mismatch when canonical namespace has an extra spec', async () => {
    const changeId = 'specs-drift';
    const specsDir = join(tempRoot, 'openspec', 'changes', changeId, 'specs');
    await mkdir(join(specsDir, 'cap-a'), { recursive: true });
    await mkdir(join(specsDir, 'cap-b'), { recursive: true });
    const contentA = '# Spec A\n';
    const contentB = '# Spec B\n';
    await writeFile(join(specsDir, 'cap-a', 'spec.md'), contentA);
    await writeFile(join(specsDir, 'cap-b', 'spec.md'), contentB);
    // Effective set only has cap-a; canonical has cap-a + cap-b.
    const effectiveRefs = [
      buildArtifactResultRef(
        `openspec/changes/${changeId}/specs/cap-a/spec.md`,
        contentA,
        PRODUCED_ARTIFACT_KIND,
      ),
    ];
    const mismatch = await validateSpecsExactSet(tempRoot, changeId, effectiveRefs);
    assert.notEqual(mismatch, null);
    assert.ok(mismatch!.effective.length < mismatch!.canonical.length);
  });
});
