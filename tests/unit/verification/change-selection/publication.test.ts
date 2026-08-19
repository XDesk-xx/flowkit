import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FlowkitError } from '../../../../src/shared/errors.js';
import type { VerificationEvidenceRecord } from '../../../../src/verification/change-selection/evidence.js';
import {
  buildVerificationSelectionPublication,
  publishVerificationSelection,
  publishCurrentVerificationMarkdown,
  preserveCurrentVerificationPublication,
  publishReverificationMarkdown,
  validateCurrentReverificationChain,
  validatePendingVerificationSelection,
  readVerificationSelectionRecord,
  renderVerificationMarkdown,
  validateTerminalVerificationSelectionBinding,
  validateVerificationSelectionRecord,
  VERIFICATION_SELECTION_FILE,
} from '../../../../src/verification/change-selection/publication.js';
import { buildVerificationSelection, type VerificationSelection } from '../../../../src/verification/change-selection/selection.js';
import { createTempDir } from '../../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function evidence(selection: VerificationSelection, producingRunId: string, status: 'passed' | 'failed' | 'not-applicable' = 'passed'): VerificationEvidenceRecord {
  if (selection.capabilityRelation.kind === 'not-applicable') {
    return {
      schemaVersion: 1,
      producingRunId,
      selectionFingerprint: selection.selectionFingerprint,
      overallStatus: 'not-applicable',
      fullTestStatus: 'not-ready',
      environment: 'fixture',
      checks: [],
      notApplicableProof: { predicateId: selection.capabilityRelation.predicateId },
    };
  }
  const checkStatus = status === 'failed' ? 'failed' : 'passed';
  return {
    schemaVersion: 1,
    producingRunId,
    selectionFingerprint: selection.selectionFingerprint,
    overallStatus: checkStatus,
    fullTestStatus: 'not-ready',
    environment: 'fixture',
    checks: selection.verificationScopes.map((scope, index) => ({
      scope,
      applicability: 'applicable',
      commandOrMethod: `fixture:${scope}`,
      status: checkStatus,
      summary: `${checkStatus} fixture check`,
      resultRef: `.flowkit/runs/d1/e1/${producingRunId}/verification-evidence.json#check-${index + 1}`,
      environment: 'fixture',
      outcomeKind: 'exited',
      exitCode: checkStatus === 'passed' ? 0 : 1,
      stdoutFingerprint: 'e'.repeat(64),
      stderrFingerprint: 'f'.repeat(64),
    })),
  };
}

function fixture(postActionWorkspaceFingerprint = 'd'.repeat(64), producingRunId = '20260814-001-apply', status: 'passed' | 'failed' = 'passed') {
  const actualChangeSet = [{ path: 'src/domain/a.ts', kind: 'modify' as const, pathKindBefore: 'file' as const, pathKindAfter: 'file' as const, contentFingerprintAfter: 'e'.repeat(64) }];
  const selection = buildVerificationSelection(actualChangeSet, [
    'openspec/changes/e1/specs/flowkit-core-model/spec.md',
  ]);
  const verificationEvidence = evidence(selection, producingRunId, status);
  const record = buildVerificationSelectionPublication({
    producingRunId,
    producingSemanticInputFingerprint: 'a'.repeat(64),
    logicalDescriptorDigest: '1'.repeat(64),
    canonicalBase: 'b'.repeat(40),
    entryWorkspaceIdentity: { schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64) },
    postActionWorkspaceFingerprint,
    actualChangeSet,
    selection,
    verificationMarkdownLogicalRef: 'openspec/changes/e1/verification.md',
  }, verificationEvidence);
  return { record, evidence: verificationEvidence };
}

describe('verification selection publication', () => {
  it('projects absent/absent as no pending commit marker and accepts record+evidence exact binding', async () => {
    const root = await createTempDir();
    roots.push(root);
    const runDir = join(root, '.flowkit', 'runs', 'd1', 'e1', '20260814-001-apply');
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    await mkdir(runDir, { recursive: true });
    const expected = fixture();
    assert.equal(await validatePendingVerificationSelection({
      runDir,
      canonicalVerificationPath: markdown,
      producingRunId: expected.record.producingRunId,
      producingSemanticInputFingerprint: expected.record.producingSemanticInputFingerprint,
      logicalDescriptorDigest: expected.record.logicalDescriptorDigest,
    }), undefined);
    const binding = await publishVerificationSelection({ runDir, canonicalVerificationPath: markdown, ...expected });
    assert.ok(binding);
    assert.ok(await validatePendingVerificationSelection({
      runDir,
      canonicalVerificationPath: markdown,
      producingRunId: expected.record.producingRunId,
      producingSemanticInputFingerprint: expected.record.producingSemanticInputFingerprint,
      logicalDescriptorDigest: expected.record.logicalDescriptorDigest,
    }));
  });

  it('derives passed/failed/not-applicable only from exact immutable evidence', () => {
    for (const status of ['passed', 'failed'] as const) {
      const current = fixture('d'.repeat(64), '20260814-001-apply', status);
      assert.equal(current.record.verificationStatus, status);
      assert.match(renderVerificationMarkdown(current.record, current.evidence), new RegExp(`flowkit-change-verification-status: ${status}`));
    }
    const selection = buildVerificationSelection([], []);
    const naEvidence = evidence(selection, '20260814-010-apply', 'not-applicable');
    const publication = buildVerificationSelectionPublication({
      producingRunId: '20260814-010-apply',
      producingSemanticInputFingerprint: 'a'.repeat(64),
      logicalDescriptorDigest: '2'.repeat(64),
      canonicalBase: 'b'.repeat(40),
      entryWorkspaceIdentity: { schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64) },
      postActionWorkspaceFingerprint: 'd'.repeat(64),
      actualChangeSet: [],
      selection,
      verificationMarkdownLogicalRef: 'openspec/changes/e1/verification.md',
    }, naEvidence);
    assert.equal(publication.verificationStatus, 'not-applicable');
    assert.match(renderVerificationMarkdown(publication, naEvidence), /flowkit-change-verification-status: not-applicable/);
  });

  it('renders full canonical Verification evidence rather than only a status marker', () => {
    const current = fixture();
    const markdown = renderVerificationMarkdown(current.record, current.evidence);
    assert.match(markdown, /## Verification checks/);
    assert.match(markdown, /command\/method:/);
    assert.match(markdown, /result ref:/);
    assert.match(markdown, /Verification environment:/);
    assert.match(markdown, /Delivery Full Test status:/);
    assert.match(markdown, /status: `passed`/);
  });

  it('publishes evidence and Markdown before an immutable per-Run selection commit marker and admits exact replay', async () => {
    const root = await createTempDir();
    roots.push(root);
    const runDir = join(root, '.flowkit', 'runs', 'd1', 'e1', '20260814-001-apply');
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    await mkdir(runDir, { recursive: true });
    const current = fixture();
    const input = { runDir, canonicalVerificationPath: markdown, ...current };
    await publishVerificationSelection(input);
    assert.match(await readFile(markdown, 'utf8'), /Flowkit Change Verification publication/);
    assert.deepEqual(JSON.parse(await readFile(join(runDir, VERIFICATION_SELECTION_FILE), 'utf8')), current.record);
    await publishVerificationSelection(input);
    const binding = await validatePendingVerificationSelection({
      runDir,
      canonicalVerificationPath: markdown,
      producingRunId: current.record.producingRunId,
      producingSemanticInputFingerprint: current.record.producingSemanticInputFingerprint,
      logicalDescriptorDigest: current.record.logicalDescriptorDigest,
    });
    assert.ok(binding);
    const loaded = await readVerificationSelectionRecord(runDir, true);
    assert.equal(loaded?.record.producingRunId, current.record.producingRunId);
  });

  it('rejects conflicting immutable evidence or selection bytes after publication', async () => {
    const root = await createTempDir();
    roots.push(root);
    const runDir = join(root, '.flowkit', 'runs', 'd1', 'e1', '20260814-001-apply');
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    await mkdir(runDir, { recursive: true });
    const current = fixture();
    await publishVerificationSelection({ runDir, canonicalVerificationPath: markdown, ...current });
    const changed = fixture('0'.repeat(64));
    await assert.rejects(
      publishVerificationSelection({ runDir, canonicalVerificationPath: markdown, ...changed }),
      (error: unknown) => error instanceof FlowkitError && (error.code === 'VERIFICATION_EVIDENCE_CONFLICT' || error.code === 'VERIFICATION_PUBLICATION_CONFLICT'),
    );
  });

  it('recovers exact Markdown-only state only when evidence is also exact and refuses conflicting bytes', async () => {
    const root = await createTempDir();
    roots.push(root);
    const runDir = join(root, '.flowkit', 'runs', 'd1', 'e1', '20260814-001-apply');
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    await mkdir(runDir, { recursive: true });
    await mkdir(join(root, 'openspec', 'changes', 'e1'), { recursive: true });
    const exact = fixture();
    await writeFile(markdown, renderVerificationMarkdown(exact.record, exact.evidence), 'utf8');
    const binding = await publishVerificationSelection({ runDir, canonicalVerificationPath: markdown, ...exact });
    assert.ok(await readVerificationSelectionRecord(runDir, true));
    assert.equal((await validateTerminalVerificationSelectionBinding({
      runDir,
      binding,
      producingRunId: exact.record.producingRunId,
      producingSemanticInputFingerprint: exact.record.producingSemanticInputFingerprint,
      logicalDescriptorDigest: exact.record.logicalDescriptorDigest,
    })).producingRunId, exact.record.producingRunId);

    const conflictDir = join(root, '.flowkit', 'runs', 'd1', 'e1', '20260814-002-apply');
    await mkdir(conflictDir, { recursive: true });
    const conflict = fixture('d'.repeat(64), '20260814-002-apply');
    await writeFile(markdown, renderVerificationMarkdown(conflict.record, conflict.evidence).replace('# Change Verification', '# Changed Verification'), 'utf8');
    await assert.rejects(
      publishVerificationSelection({ runDir: conflictDir, canonicalVerificationPath: markdown, ...conflict }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'VERIFICATION_PUBLICATION_CONFLICT',
    );
    await assert.rejects(readFile(join(conflictDir, VERIFICATION_SELECTION_FILE), 'utf8'));
  });

  it('preserves immutable failed publication history and validates repeated re-verification lineage', async () => {
    const root = await createTempDir();
    roots.push(root);
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    const failed = fixture('d'.repeat(64), '20260814-001-apply', 'failed');
    const origin = await publishCurrentVerificationMarkdown({
      canonicalVerificationPath: markdown,
      model: {
        producingRunId: failed.record.producingRunId,
        canonicalBase: failed.record.canonicalBase,
        postActionWorkspaceFingerprint: failed.record.postActionWorkspaceFingerprint,
        actualChangeSet: failed.record.actualChangeSet,
        selection: failed.record.selection,
        verificationStatus: 'failed',
      },
      evidence: failed.evidence,
    });
    const originBytes = await readFile(markdown, 'utf8');
    const preserved = await preserveCurrentVerificationPublication({ canonicalVerificationPath: markdown, expectedCurrentBytes: originBytes });
    assert.equal(preserved.fingerprint, origin.versionFingerprint);
    assert.equal(await readFile(join(root, 'openspec', 'changes', 'e1', 'verification-history', `${origin.versionFingerprint}.md`), 'utf8'), originBytes);

    const retryFailedEvidence = evidence(failed.record.selection, failed.record.producingRunId, 'failed');
    const firstRetry = await publishReverificationMarkdown({
      canonicalVerificationPath: markdown,
      model: {
        producingRunId: failed.record.producingRunId,
        canonicalBase: failed.record.canonicalBase,
        postActionWorkspaceFingerprint: failed.record.postActionWorkspaceFingerprint,
        actualChangeSet: failed.record.actualChangeSet,
        selection: failed.record.selection,
        verificationStatus: 'failed',
      },
      evidence: retryFailedEvidence,
      lineage: {
        reverificationOfRunId: failed.record.producingRunId,
        originApplyVerificationFingerprint: origin.versionFingerprint,
        previousVerificationRef: preserved.logicalRef,
        previousVerificationFingerprint: preserved.fingerprint,
      },
    });
    const firstRetryBytes = await readFile(markdown, 'utf8');
    const firstPreserved = await preserveCurrentVerificationPublication({ canonicalVerificationPath: markdown, expectedCurrentBytes: firstRetryBytes });
    assert.equal(firstPreserved.fingerprint, firstRetry.versionFingerprint);

    const passedEvidence = evidence(failed.record.selection, failed.record.producingRunId, 'passed');
    await publishReverificationMarkdown({
      canonicalVerificationPath: markdown,
      model: {
        producingRunId: failed.record.producingRunId,
        canonicalBase: failed.record.canonicalBase,
        postActionWorkspaceFingerprint: failed.record.postActionWorkspaceFingerprint,
        actualChangeSet: failed.record.actualChangeSet,
        selection: failed.record.selection,
        verificationStatus: 'passed',
      },
      evidence: passedEvidence,
      lineage: {
        reverificationOfRunId: failed.record.producingRunId,
        originApplyVerificationFingerprint: origin.versionFingerprint,
        previousVerificationRef: firstPreserved.logicalRef,
        previousVerificationFingerprint: firstPreserved.fingerprint,
      },
    });
    const currentBytes = await readFile(markdown, 'utf8');
    const current = await validateCurrentReverificationChain({
      canonicalVerificationPath: markdown,
      currentMarkdown: currentBytes,
      originRunId: failed.record.producingRunId,
      originBinding: origin,
    });
    assert.equal(current.status, 'passed');

    const archivedRoot = join(root, 'openspec', 'changes', 'archive', '2099-01-01-e1');
    await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true });
    await cp(join(root, 'openspec', 'changes', 'e1'), archivedRoot, { recursive: true });
    const archived = await validateCurrentReverificationChain({
      canonicalVerificationPath: join(archivedRoot, 'verification.md'),
      logicalVerificationRef: 'openspec/changes/e1/verification.md',
      currentMarkdown: currentBytes,
      originRunId: failed.record.producingRunId,
      originBinding: origin,
    });
    assert.equal(archived.status, 'passed');

    const originHistoryPath = join(root, 'openspec', 'changes', 'e1', 'verification-history', `${origin.versionFingerprint}.md`);
    await rm(originHistoryPath);
    await assert.rejects(
      validateCurrentReverificationChain({ canonicalVerificationPath: markdown, currentMarkdown: currentBytes, originRunId: failed.record.producingRunId, originBinding: origin }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'VERIFICATION_RETRY_CHAIN_CONFLICT',
    );
    await writeFile(originHistoryPath, originBytes, 'utf8');

    const selectionDrift = currentBytes.replace(
      `- selectionFingerprint: \`${origin.selectionFingerprint}\``,
      `- selectionFingerprint: \`${'f'.repeat(64)}\``,
    );
    await assert.rejects(
      validateCurrentReverificationChain({ canonicalVerificationPath: markdown, currentMarkdown: selectionDrift, originRunId: failed.record.producingRunId, originBinding: origin }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'VERIFICATION_RETRY_CHAIN_CONFLICT',
    );

    await writeFile(originHistoryPath, 'tampered\n', 'utf8');
    await assert.rejects(
      validateCurrentReverificationChain({ canonicalVerificationPath: markdown, currentMarkdown: currentBytes, originRunId: failed.record.producingRunId, originBinding: origin }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'VERIFICATION_RETRY_CHAIN_CONFLICT',
    );
  });

  it('uses one closed selection record validator and rejects unknown fields', () => {
    const valid = fixture().record;
    assert.deepEqual(validateVerificationSelectionRecord(valid), valid);
    assert.throws(
      () => validateVerificationSelectionRecord({ ...valid, extra: true }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});
