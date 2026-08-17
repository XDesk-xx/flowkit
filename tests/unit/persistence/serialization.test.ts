import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FlowkitError } from '../../../src/shared/errors.js';
import { getActionDefinition } from '../../../src/domain/actions.js';
import { canonicalFullTestPayload, fullTestResultRefFor } from '../../../src/domain/full-test.js';
import {
  validateActionResultWithoutRunRef,
  validateResultRefProjection,
  validateContextFile,
  validateContextFileIdentity,
  validateRunResultFileCombination,
  validateReviewVerdictIntegrity,
  validateActionResultApplicability,
  admitC1RunResult,
  admitC1RunResultForReader,
  type ContextFile,
  type RunResultFile,
} from '../../../src/persistence/serialization.js';

// ---------------------------------------------------------------------------
// validateResultRefProjection (tasks 6.9-6.11)
// ---------------------------------------------------------------------------

describe('validateResultRefProjection', () => {
  it('accepts a valid ResultRef with ref + versionFingerprint + kind', () => {
    const ref = validateResultRefProjection({
      ref: 'result.json',
      versionFingerprint: 'abc123',
      kind: 'run-result',
    });
    assert.equal(ref.ref, 'result.json');
    assert.equal(ref.versionFingerprint, 'abc123');
    assert.equal(ref.kind, 'run-result');
  });

  it('rejects missing kind (Q1-RA-004: kind is required for schemaVersion 2)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: 'r', versionFingerprint: 'v' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects empty kind string (Q1-RA-004)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: 'r', versionFingerprint: 'v', kind: '' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects unknown kind value (Q1-RA-004)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: 'r', versionFingerprint: 'v', kind: 'other' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects empty ref string (task 6.10)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: '  ', versionFingerprint: 'abc', kind: 'run-result' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects empty versionFingerprint string (task 6.10)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: 'r', versionFingerprint: '', kind: 'run-result' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects non-string kind (task 6.11)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: 'r', versionFingerprint: 'v', kind: 42 }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects unknown field (closed schema)', () => {
    assert.throws(
      () => validateResultRefProjection({ ref: 'r', versionFingerprint: 'v', kind: 'run-result', extra: true }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects a non-object', () => {
    assert.throws(
      () => validateResultRefProjection('not-a-ref'),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// validateActionResultWithoutRunRef (tasks 6.1-6.8, 12.25-12.29)
// ---------------------------------------------------------------------------

describe('validateActionResultWithoutRunRef', () => {
  const valid = {
    action: 'explore',
    executionStatus: 'completed',
    summary: 'explore done',
  };

  it('accepts a valid projection (task 6.1-6.4)', () => {
    const ar = validateActionResultWithoutRunRef(valid);
    assert.equal(ar.action, 'explore');
    assert.equal(ar.executionStatus, 'completed');
    assert.equal(ar.summary, 'explore done');
  });

  it('rejects runRef field (task 6.8, 12.28)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ ...valid, runRef: { ref: 'r', versionFingerprint: 'v' } }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects invalid action (task 6.2, 12.26)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ ...valid, action: 'not-an-action' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'UNKNOWN_ACTION',
    );
  });

  it('rejects invalid executionStatus (task 6.3, 12.26)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ ...valid, executionStatus: 'pending' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects empty summary (task 6.4, 12.25)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ ...valid, summary: '  ' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects missing action/executionStatus/summary (task 12.25)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({ summary: 'x' }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects actionResult that is not an object (task 12.29)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef('not-an-object'),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('validates nested ResultRef arrays (task 6.5, 12.27)', () => {
    const ar = validateActionResultWithoutRunRef({
      ...valid,
      producedResultRefs: [{ ref: 'a', versionFingerprint: 'v1', kind: 'produced-artifact' }],
      consumedInputRefs: [{ ref: 'b', versionFingerprint: 'v2', kind: 'run-result' }],
    });
    assert.equal(ar.producedResultRefs?.length, 1);
    assert.equal(ar.consumedInputRefs?.length, 1);
  });

  it('rejects nested ResultRef missing kind (Q1-RA-004)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({
        ...valid,
        producedResultRefs: [{ ref: 'a', versionFingerprint: 'v1' }],
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects nested ResultRef missing fields (task 12.27)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({
        ...valid,
        producedResultRefs: [{ ref: 'a' }],
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects producedResultRefs with wrong kind (Q1-RA-004 field-kind binding)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({
        ...valid,
        producedResultRefs: [{ ref: 'a', versionFingerprint: 'v1', kind: 'run-result' }],
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects consumedInputRefs with wrong kind (Q1-RA-004 field-kind binding)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({
        ...valid,
        consumedInputRefs: [{ ref: 'b', versionFingerprint: 'v2', kind: 'produced-artifact' }],
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('validates optional single ResultRefs (task 6.6)', () => {
    const ar = validateActionResultWithoutRunRef({
      ...valid,
      verificationSummaryRef: { ref: 'v', versionFingerprint: 'vf', kind: 'verification-summary' },
      reviewVerdictRef: { ref: 'r', versionFingerprint: 'rf', kind: 'run-result' },
    });
    assert.equal(ar.verificationSummaryRef?.ref, 'v');
    assert.equal(ar.reviewVerdictRef?.ref, 'r');
  });

  it('rejects verificationSummaryRef with wrong kind (Q1-RA-004)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({
        ...valid,
        verificationSummaryRef: { ref: 'v', versionFingerprint: 'vf', kind: 'run-result' },
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects reviewVerdictRef with wrong kind (Q1-RA-004)', () => {
    assert.throws(
      () => validateActionResultWithoutRunRef({
        ...valid,
        reviewVerdictRef: { ref: 'r', versionFingerprint: 'rf', kind: 'produced-artifact' },
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('validates optional string fields (task 6.7)', () => {
    const ar = validateActionResultWithoutRunRef({
      ...valid,
      failureDiagnosis: 'diag',
      nextActionRecommendation: 'next',
    });
    assert.equal(ar.failureDiagnosis, 'diag');
    assert.equal(ar.nextActionRecommendation, 'next');
  });
});

// ---------------------------------------------------------------------------
// validateRunResultFileCombination (tasks 5.2-5.8, 12.14-12.15)
// ---------------------------------------------------------------------------

describe('validateRunResultFileCombination', () => {
  it('accepts completed + actionResult(completed) (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({
        runStatus: 'completed',
        actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
      }),
    );
  });

  it('accepts completed + actionResult(failed) (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({
        runStatus: 'completed',
        actionResult: { action: 'explore', executionStatus: 'failed', summary: 'done' },
      }),
    );
  });

  it('accepts completed + actionResult(blocked) (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({
        runStatus: 'completed',
        actionResult: { action: 'explore', executionStatus: 'blocked', summary: 'done' },
      }),
    );
  });

  it('accepts failed + no actionResult (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({ runStatus: 'failed', failureDiagnosis: 'err' }),
    );
  });

  it('accepts cancelled + no actionResult (task 12.14)', () => {
    assert.doesNotThrow(() =>
      validateRunResultFileCombination({ runStatus: 'cancelled', cancellationReason: 'r' }),
    );
  });

  it('rejects top-level executionStatus field (task 12.15)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'completed',
          executionStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'x' },
        } as unknown as RunResultFile),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects completed + no actionResult (task 12.15)', () => {
    assert.throws(
      () => validateRunResultFileCombination({ runStatus: 'completed' }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects completed + actionResult(in-progress) (task 12.15)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'completed',
          actionResult: { action: 'explore', executionStatus: 'in-progress', summary: 'x' },
        }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects failed + actionResult (task 12.15)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'failed',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'x' },
        }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  it('rejects cancelled + actionResult (task 12.15)', () => {
    assert.throws(
      () =>
        validateRunResultFileCombination({
          runStatus: 'cancelled',
          actionResult: { action: 'explore', executionStatus: 'completed', summary: 'x' },
        }),
      (e: unknown) => e instanceof FlowkitError,
    );
  });

  // -------------------------------------------------------------------------
  // Closed schema rejection (task 2.6): legacy heavy fields MUST be rejected.
  // -------------------------------------------------------------------------

  it('rejects RunResultFile with blockingFindings (legacy heavy field, task 2.6)', () => {
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

  it('rejects RunResultFile with verification array (legacy heavy field, task 2.6)', () => {
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

  it('rejects RunResultFile with consistencyScan (legacy heavy field, task 2.6)', () => {
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

  it('rejects RunResultFile with commitPolicy (legacy heavy field, task 2.6)', () => {
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

  it('accepts a valid closed-schema RunResultFile (task 2.6)', () => {
    // Should not throw — only runStatus + actionResult are permitted for completed.
    validateRunResultFileCombination({
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
    });
  });
});

// ---------------------------------------------------------------------------
// validateContextFile (tasks 10.1-10.8, 12.16-12.18, 12.31-12.38)
// ---------------------------------------------------------------------------

const validChangeContext = {
  schemaVersion: 2,
  runId: '20260806-001-explore',
  deliveryId: '20260806-01-deterministic-core',
  changeKey: 'C1',
  changeId: 'formal-fact-reader-and-persistence',
  action: 'explore',
  role: 'author',
  ownerAuthorization: 'required',
  runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-001-explore/',
};

const validDeliveryContext = {
  schemaVersion: 2,
  runId: '20260806-002-full-test',
  deliveryId: '20260806-01-deterministic-core',
  action: 'full-test',
  role: 'owner',
  ownerAuthorization: 'required',
  runPath: '.flowkit/runs/20260806-01-deterministic-core/20260806-002-full-test/',
};

describe('validateContextFile', () => {
  it('accepts a valid Change-level ContextFile (task 10.1-10.3)', () => {
    const cf = validateContextFile(validChangeContext);
    assert.equal(cf.schemaVersion, 2);
    assert.equal(cf.runId, '20260806-001-explore');
    assert.equal(cf.changeKey, 'C1');
    assert.equal(cf.changeId, 'formal-fact-reader-and-persistence');
  });

  it('accepts transitional v2 ownerFactRefs as immutable history but strips them from the typed projection', () => {
    const cf = validateContextFile({
      ...validChangeContext,
      ownerFactRefs: [{
        ref: `owner:${'a'.repeat(64)}`,
        decision: 'contract-reset',
        deliveryId: validChangeContext.deliveryId,
        changeId: validChangeContext.changeId,
        scope: 'D1/current-contract',
        requiredOutcomes: ['structured Owner handoff'],
        sourceRef: 'owner-input:bootstrap',
      }],
    });
    assert.equal(cf.schemaVersion, 2);
    assert.equal(cf.ownerFactRefs, undefined);
  });

  it('retains ownerFactRefs in the current v3 typed projection', () => {
    const ownerFactRefs = [{
      ref: `owner:${'b'.repeat(64)}`,
      decision: 'contract-reset',
      deliveryId: validChangeContext.deliveryId,
      changeId: validChangeContext.changeId,
      scope: 'D1/current-contract',
      requiredOutcomes: ['structured Owner handoff'],
      sourceRef: 'owner-input:formal',
    }];
    const cf = validateContextFile({ ...validChangeContext, schemaVersion: 3, ownerFactRefs });
    assert.equal(cf.schemaVersion, 3);
    assert.deepEqual(cf.ownerFactRefs, ownerFactRefs);
  });

  it('accepts current v4 and enforces archive-only keyed OpenSpec projection shape', () => {
    const archive = {
      ...validChangeContext,
      schemaVersion: 4,
      runId: '20260806-009-archive',
      action: 'archive',
      archiveEntryOpenSpecProjection: {
        projectionVersion: 1,
        version: '1.7.0',
        changeId: validChangeContext.changeId,
        changeRootLogical: `openspec/changes/${validChangeContext.changeId}`,
        artifactPaths: {
          proposal: [`openspec/changes/${validChangeContext.changeId}/custom/proposal.md`],
          specs: [`openspec/changes/${validChangeContext.changeId}/delta/spec.md`],
          design: [`openspec/changes/${validChangeContext.changeId}/custom/design.md`],
          tasks: [`openspec/changes/${validChangeContext.changeId}/work/tasks.md`],
        },
      },
    };
    const cf = validateContextFile(archive);
    assert.equal(cf.schemaVersion, 4);
    assert.deepEqual(cf.archiveEntryOpenSpecProjection?.artifactPaths.proposal, [
      `openspec/changes/${validChangeContext.changeId}/custom/proposal.md`,
    ]);

    assert.throws(
      () => validateContextFile({
        ...validChangeContext,
        schemaVersion: 4,
        archiveEntryOpenSpecProjection: archive.archiveEntryOpenSpecProjection,
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts only a complete v5 Apply context and rejects historical v5 field synthesis', () => {
    const designRef = {
      ref: 'openspec/changes/formal-fact-reader-and-persistence/design.md',
      kind: 'produced-artifact',
      versionFingerprint: 'c'.repeat(64),
    };
    const entryWorkspaceIdentity = {
      canonicalBase: 'b'.repeat(40),
      workspaceFingerprint: 'd'.repeat(64),
    };
    const mutationDeclaration = {
      schemaVersion: 1,
      action: 'apply',
      designRef,
      selectors: [{ kind: 'exact', path: 'src/domain/types.ts' }],
    };
    const v5 = {
      ...validChangeContext,
      schemaVersion: 5,
      runId: '20260806-010-apply',
      action: 'apply',
      semanticInputFingerprint: 'a'.repeat(64),
      canonicalBase: 'b'.repeat(40),
      applicableFactRefs: [designRef],
      entryWorkspaceIdentity,
      mutationDeclaration,
      actionPackage: {
        schemaVersion: 2,
        run: {
          runId: '20260806-010-apply',
          deliveryId: validChangeContext.deliveryId,
          changeId: validChangeContext.changeId,
          action: 'apply',
          role: 'author',
          semanticInputFingerprint: 'a'.repeat(64),
        },
        definition: getActionDefinition('apply'),
        contractRefs: [designRef],
        handoffRefs: [],
        ownerAuthorizationRefs: [],
        requiredResultContract: getActionDefinition('apply').terminalContract,
        entryWorkspaceIdentity,
        mutationDeclaration,
      },
    };
    const context = validateContextFile(v5);
    assert.equal(context.schemaVersion, 5);
    assert.equal(context.action, 'apply');
    assert.equal(context.mutationDeclaration?.selectors[0]?.path, 'src/domain/types.ts');

    assert.throws(
      () => validateContextFile({ ...validChangeContext, canonicalBase: 'b'.repeat(40) }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    assert.throws(
      () => validateContextFile({ ...v5, mutationDeclaration: { ...v5.mutationDeclaration, selectors: [{ kind: 'prefix', path: 'src' }, { kind: 'exact', path: 'src/domain/types.ts' }] } }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
    assert.throws(
      () => validateContextFile({
        ...v5,
        actionPackage: { ...v5.actionPackage, mutationDeclaration: { ...mutationDeclaration, selectors: [{ kind: 'exact', path: 'src/domain/actions.ts' }] } },
      }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects retired Delivery behavior as a current schemaVersion 2 ContextFile', () => {
    assert.throws(
      () => validateContextFile(validDeliveryContext),
      (e: unknown) => e instanceof FlowkitError && e.code === 'UNKNOWN_ACTION',
    );
  });

  it('rejects unsupported historical schemaVersion 1 (task 12.16)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, schemaVersion: 1 }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects missing required fields (task 12.17)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, runId: undefined }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects action not in B1 Action Catalog (task 12.18)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, action: 'review' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'UNKNOWN_ACTION',
    );
  });

  it('rejects invalid role type (task 12.31)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, role: 'bot' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects retired Delivery action even if a caller adds Change identity', () => {
    assert.throws(
      () => validateContextFile({ ...validDeliveryContext, changeId: 'some-change', changeKey: 'X' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'UNKNOWN_ACTION',
    );
  });

  it('rejects Change action missing changeId (task 10.5, 12.33)', () => {
    assert.throws(
      () => {
        const { changeId, changeKey, ...rest } = validChangeContext;
        void changeId;
        void changeKey;
        return validateContextFile(rest);
      },
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts inputRef as ResultRef object (task 10.6, 12.35)', () => {
    const cf = validateContextFile({
      ...validChangeContext,
      inputRef: { ref: 'result.json', versionFingerprint: 'sha256:abc', kind: 'run-result' },
    });
    assert.equal(cf.inputRef?.ref, 'result.json');
  });

  it('rejects inputRef as string (task 10.6, 12.36)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, inputRef: 'sha256:abc' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts missing inputRef (task 12.37)', () => {
    const cf = validateContextFile(validChangeContext);
    assert.equal(cf.inputRef, undefined);
  });

  it('rejects inputRef ResultRef missing versionFingerprint (task 12.38)', () => {
    assert.throws(
      () => validateContextFile({ ...validChangeContext, inputRef: { ref: 'r' } }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts optional constraints (task 10.3)', () => {
    const cf = validateContextFile({
      ...validChangeContext,
      constraints: { mayWriteProductionCode: true },
    });
    assert.equal(cf.constraints?.mayWriteProductionCode, true);
  });

  // -------------------------------------------------------------------------
  // Review-scope rules (C1-AP-004): review-* MUST carry reviewedRunId;
  // non-review MUST NOT carry reviewedRunId.
  // -------------------------------------------------------------------------

  it('accepts review-* Run with reviewedRunId + run-result inputRef (C1-AP-004 / Q1-RA-006)', () => {
    const cf = validateContextFile({
      ...validChangeContext,
      runId: '20260806-010-review-apply',
      action: 'review-apply',
      role: 'reviewer',
      reviewedRunId: '20260806-009-apply',
      // Q1-RA-006: schemaVersion 2 review-* MUST carry a run-result inputRef.
      inputRef: {
        ref: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-009-apply/result.json',
        versionFingerprint: 'abc123',
        kind: 'run-result',
      },
      verificationInputRef: {
        ref: 'openspec/changes/formal-fact-reader-and-persistence/verification.md',
        versionFingerprint: 'def456',
        kind: 'verification-summary',
      },
      runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-010-review-apply/',
    });
    assert.equal(cf.reviewedRunId, '20260806-009-apply');
  });

  it('accepts review-apply verificationInputRef under a structured non-default Change root', () => {
    const cf = validateContextFile({
      ...validChangeContext,
      runId: '20260806-010-review-apply',
      action: 'review-apply',
      role: 'reviewer',
      reviewedRunId: '20260806-009-apply',
      inputRef: {
        ref: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-009-apply/result.json',
        versionFingerprint: 'abc123',
        kind: 'run-result',
      },
      verificationInputRef: {
        ref: 'planning/active/formal-fact-reader-and-persistence/verification.md',
        versionFingerprint: 'def456',
        kind: 'verification-summary',
      },
      runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-010-review-apply/',
    });
    assert.equal(cf.verificationInputRef?.ref, 'planning/active/formal-fact-reader-and-persistence/verification.md');
  });

  it('rejects review-* Run missing inputRef (Q1-RA-006)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-010-review-apply',
          action: 'review-apply',
          role: 'reviewer',
          reviewedRunId: '20260806-009-apply',
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-010-review-apply/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects review-* Run with non-run-result inputRef kind (Q1-RA-006)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-010-review-apply',
          action: 'review-apply',
          role: 'reviewer',
          reviewedRunId: '20260806-009-apply',
          inputRef: {
            ref: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-009-apply/result.json',
            versionFingerprint: 'abc123',
            kind: 'produced-artifact',
          },
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-010-review-apply/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects sourceReviewRun without sourceReviewVerdict (Q1-RA-007)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-011-revise-propose',
          action: 'revise-propose',
          role: 'author',
          sourceReviewRun: '20260806-010-review-propose',
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-011-revise-propose/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects sourceReviewVerdict without sourceReviewRun (Q1-RA-007)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-011-revise-propose',
          action: 'revise-propose',
          role: 'author',
          sourceReviewVerdict: 'changes-requested',
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-011-revise-propose/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects review-* Run missing reviewedRunId (C1-AP-004)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-011-review-apply',
          action: 'review-apply',
          role: 'reviewer',
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-011-review-apply/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects non-review Run carrying reviewedRunId (C1-AP-004)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          reviewedRunId: '20260806-009-apply',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects a path-shaped reviewedRunId (../../run) at schema boundary (Q1-RA-005)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-012-review-apply',
          action: 'review-apply',
          role: 'reviewer',
          reviewedRunId: '../../run',
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-012-review-apply/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects a path-shaped reviewedRunId (C:\\\\tmp\\\\run) at schema boundary (Q1-RA-005)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-013-review-apply',
          action: 'review-apply',
          role: 'reviewer',
          reviewedRunId: 'C:\\tmp\\run',
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-013-review-apply/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects a path-shaped sourceReviewRun (../x) at schema boundary (Q1-RA-005)', () => {
    assert.throws(
      () =>
        validateContextFile({
          ...validChangeContext,
          runId: '20260806-014-revise-propose',
          action: 'revise-propose',
          role: 'author',
          sourceReviewRun: '../x',
          sourceReviewVerdict: 'changes-requested',
          runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-014-revise-propose/',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// validateContextFileIdentity (tasks 10.9-10.16, 12.39-12.43)
// ---------------------------------------------------------------------------

describe('validateContextFileIdentity', () => {
  const cf: ContextFile = {
    schemaVersion: 2,
    runId: '20260806-001-explore',
    deliveryId: '20260806-01-deterministic-core',
    changeKey: 'C1',
    changeId: 'formal-fact-reader-and-persistence',
    action: 'explore',
    role: 'author',
    ownerAuthorization: 'required',
    runPath: '.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-001-explore/',
  };

  it('accepts matching identity (Change-level)', () => {
    assert.doesNotThrow(() =>
      validateContextFileIdentity(
        cf,
        '/repo/.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-001-explore',
      ),
    );
  });

  it('rejects runId not matching directory name (task 12.39)', () => {
    assert.throws(
      () =>
        validateContextFileIdentity(
          cf,
          '/repo/.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-099-explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects deliveryId not matching path segment (task 12.40)', () => {
    assert.throws(
      () =>
        validateContextFileIdentity(
          cf,
          '/repo/.flowkit/runs/20260806-99-other/formal-fact-reader-and-persistence/20260806-001-explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects changeId not matching path segment (task 12.41)', () => {
    assert.throws(
      () =>
        validateContextFileIdentity(
          cf,
          '/repo/.flowkit/runs/20260806-01-deterministic-core/other-change/20260806-001-explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects runPath inconsistent with filesystem (task 12.43)', () => {
    const badCf: ContextFile = {
      ...cf,
      runPath: '.flowkit/runs/OTHER/20260806-001-explore/',
    };
    assert.throws(
      () =>
        validateContextFileIdentity(
          badCf,
          '/repo/.flowkit/runs/20260806-01-deterministic-core/formal-fact-reader-and-persistence/20260806-001-explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});

// ---------------------------------------------------------------------------
// validateReviewVerdictIntegrity (C1-AP-006)
// ---------------------------------------------------------------------------

describe('validateReviewVerdictIntegrity', () => {
  it('accepts completed review-* Run with reviewVerdict (C1-AP-006)', () => {
    validateReviewVerdictIntegrity('review-apply', {
      runStatus: 'completed',
      actionResult: { action: 'review-apply', executionStatus: 'completed', summary: 'approved' },
      reviewVerdict: 'approved',
    });
    // No throw ⇒ pass.
  });

  it('rejects completed review-* Run missing reviewVerdict (C1-AP-006)', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('review-apply', {
          runStatus: 'completed',
          actionResult: { action: 'review-apply', executionStatus: 'completed', summary: 'no verdict' },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects non-review Run carrying reviewVerdict (C1-AP-006)', () => {
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

  it('rejects failed review-* Run carrying reviewVerdict (C1-AP-006)', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('review-apply', {
          runStatus: 'failed',
          failureDiagnosis: 'broken',
          reviewVerdict: 'approved',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts failed review-* Run without reviewVerdict (C1-AP-006)', () => {
    validateReviewVerdictIntegrity('review-apply', {
      runStatus: 'failed',
      failureDiagnosis: 'broken',
    });
    // No throw ⇒ pass.
  });

  it('accepts non-review Run without reviewVerdict (C1-AP-006)', () => {
    validateReviewVerdictIntegrity('explore', {
      runStatus: 'completed',
      actionResult: { action: 'explore', executionStatus: 'completed', summary: 'done' },
    });
    // No throw ⇒ pass.
  });

  // -------------------------------------------------------------------------
  // Typed reviewFindings + verdict consistency (tasks 2.2-2.3)
  // -------------------------------------------------------------------------

  it('rejects changes-requested without blocking findings (task 2.2)', () => {
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

  it('rejects approved with blocking findings (task 2.3)', () => {
    assert.throws(
      () =>
        validateReviewVerdictIntegrity('review-propose', {
          runStatus: 'completed',
          actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'review' },
          reviewVerdict: 'approved',
          reviewFindings: [
            { id: 'B-001', severity: 'blocking', blockingAuthority: 'author', title: 'major', problem: 'broken', requiredChange: 'fix it' },
          ],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts changes-requested with blocking findings + requiredChange (task 2.2)', () => {
    // Should not throw.
    validateReviewVerdictIntegrity('review-propose', {
      runStatus: 'completed',
      actionResult: { action: 'review-propose', executionStatus: 'completed', summary: 'review' },
      reviewVerdict: 'changes-requested',
      reviewFindings: [
        { id: 'B-001', severity: 'blocking', blockingAuthority: 'author', title: 'major', problem: 'broken', requiredChange: 'fix it' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Q1-RA-010: Action-owned ResultRef applicability (shared validator)
// ---------------------------------------------------------------------------

describe('validateActionResultApplicability (Q1-RA-010)', () => {
  const base = {
    action: 'explore' as const,
    executionStatus: 'completed' as const,
    summary: 'done',
    producedResultRefs: [
      { ref: 'openspec/changes/C1/explore.md', versionFingerprint: 'x', kind: 'produced-artifact' },
    ],
  };

  it('accepts actionResult.action == context.action', () => {
    validateActionResultApplicability('explore', 'completed', base);
    // No throw ⇒ pass.
  });

  it('rejects actionResult.action != context.action', () => {
    assert.throws(
      () => validateActionResultApplicability('explore', 'completed', { ...base, action: 'propose' }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects producedResultRefs on apply (non-artifact Action)', () => {
    assert.throws(
      () =>
        validateActionResultApplicability('apply', 'completed', {
          ...base,
          action: 'apply',
          producedResultRefs: [
            { ref: 'openspec/changes/C1/proposal.md', versionFingerprint: 'x', kind: 'produced-artifact' },
          ],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects producedResultRefs on review-propose', () => {
    assert.throws(
      () =>
        validateActionResultApplicability('review-propose', 'completed', {
          action: 'review-propose',
          executionStatus: 'completed',
          summary: 'r',
          producedResultRefs: [
            { ref: 'openspec/changes/C1/proposal.md', versionFingerprint: 'x', kind: 'produced-artifact' },
          ],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects producedResultRefs on archive', () => {
    assert.throws(
      () =>
        validateActionResultApplicability('archive', 'completed', {
          ...base,
          action: 'archive',
          producedResultRefs: [
            { ref: 'openspec/changes/C1/proposal.md', versionFingerprint: 'x', kind: 'produced-artifact' },
          ],
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects verificationSummaryRef on apply', () => {
    assert.throws(
      () =>
        validateActionResultApplicability('apply', 'completed', {
          ...base,
          action: 'apply',
          verificationSummaryRef: {
            ref: 'openspec/changes/C1/verification.md',
            versionFingerprint: 'x',
            kind: 'verification-summary',
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects verificationSummaryRef on revise-apply', () => {
    assert.throws(
      () =>
        validateActionResultApplicability('revise-apply', 'completed', {
          ...base,
          action: 'revise-apply',
          verificationSummaryRef: {
            ref: 'openspec/changes/C1/verification.md',
            versionFingerprint: 'x',
            kind: 'verification-summary',
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects completed review-apply MISSING verificationSummaryRef', () => {
    assert.throws(
      () =>
        validateActionResultApplicability('review-apply', 'completed', {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('accepts completed review-apply WITH verificationSummaryRef', () => {
    validateActionResultApplicability('review-apply', 'completed', {
      action: 'review-apply',
      executionStatus: 'completed',
      summary: 'approved',
      verificationSummaryRef: {
        ref: 'openspec/changes/C1/verification.md',
        versionFingerprint: 'x',
        kind: 'verification-summary',
      },
    });
    // No throw ⇒ pass.
  });

  it('rejects reviewVerdictRef on review-* (self-reference)', () => {
    assert.throws(
      () =>
        validateActionResultApplicability('review-propose', 'completed', {
          action: 'review-propose',
          executionStatus: 'completed',
          summary: 'r',
          reviewVerdictRef: {
            ref: '.flowkit/runs/D1/C1/20260806-009-propose/result.json',
            versionFingerprint: 'x',
            kind: 'run-result',
          },
        }),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('admitC1RunResult rejects an Action-impossible projection (review-propose + reviewVerdictRef)', () => {
    assert.throws(
      () =>
        admitC1RunResult(
          JSON.stringify({
            runStatus: 'completed',
            actionResult: {
              action: 'review-propose',
              executionStatus: 'completed',
              summary: 'r',
              reviewVerdictRef: {
                ref: '.flowkit/runs/D1/C1/20260806-009-propose/result.json',
                versionFingerprint: 'x',
                kind: 'run-result',
              },
            },
            reviewVerdict: 'approved',
          }),
          'review-propose',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('admitC1RunResult rejects actionResult.action mismatch', () => {
    assert.throws(
      () =>
        admitC1RunResult(
          JSON.stringify({
            runStatus: 'completed',
            actionResult: {
              action: 'explore',
              executionStatus: 'completed',
              summary: 'x',
              producedResultRefs: [
                { ref: 'openspec/changes/C1/explore.md', versionFingerprint: 'x', kind: 'produced-artifact' },
              ],
            },
          }),
          'propose',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('admitC1RunResult rejects top-level completed review-apply with executionStatus=failed and NO verificationSummaryRef (Q1-RA-010)', () => {
    assert.throws(
      () =>
        admitC1RunResult(
          JSON.stringify({
            runStatus: 'completed',
            actionResult: {
              action: 'review-apply',
              executionStatus: 'failed',
              summary: 'x',
            },
            reviewVerdict: 'changes-requested',
            reviewFindings: [
              { id: 'B-001', severity: 'blocking', blockingAuthority: 'author', title: 'f', problem: 'p', requiredChange: 'r' },
            ],
          }),
          'review-apply',
        ),
      // requiredness comes from top-level runStatus=completed + action=review-apply,
      // NOT actionResult.executionStatus.
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('admitC1RunResult rejects top-level completed review-apply with executionStatus=blocked and NO verificationSummaryRef (Q1-RA-010)', () => {
    assert.throws(
      () =>
        admitC1RunResult(
          JSON.stringify({
            runStatus: 'completed',
            actionResult: {
              action: 'review-apply',
              executionStatus: 'blocked',
              summary: 'x',
            },
            reviewVerdict: 'changes-requested',
            reviewFindings: [
              { id: 'B-001', severity: 'blocking', blockingAuthority: 'author', title: 'f', problem: 'p', requiredChange: 'r' },
            ],
          }),
          'review-apply',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('admitC1RunResult rejects top-level completed explore WITHOUT producedResultRefs (Q1-RA-010)', () => {
    assert.throws(
      () =>
        admitC1RunResult(
          JSON.stringify({
            runStatus: 'completed',
            actionResult: {
              action: 'explore',
              executionStatus: 'completed',
              summary: 'x',
            },
          }),
          'explore',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('admitC1RunResult rejects top-level completed propose WITHOUT producedResultRefs (Q1-RA-010)', () => {
    assert.throws(
      () =>
        admitC1RunResult(
          JSON.stringify({
            runStatus: 'completed',
            actionResult: {
              action: 'propose',
              executionStatus: 'completed',
              summary: 'x',
            },
          }),
          'propose',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('admitC1RunResult rejects top-level completed revise-propose WITHOUT producedResultRefs (Q1-RA-010)', () => {
    assert.throws(
      () =>
        admitC1RunResult(
          JSON.stringify({
            runStatus: 'completed',
            actionResult: {
              action: 'revise-propose',
              executionStatus: 'completed',
              summary: 'x',
            },
          }),
          'revise-propose',
        ),
      (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('admitC1RunResult accepts top-level completed explore WITH producedResultRefs (Q1-RA-010)', () => {
    // Should not throw.
    admitC1RunResult(
      JSON.stringify({
        runStatus: 'completed',
        actionResult: {
          action: 'explore',
          executionStatus: 'completed',
          summary: 'x',
          producedResultRefs: [
            { ref: 'openspec/changes/C1/explore.md', versionFingerprint: 'x', kind: 'produced-artifact' },
          ],
        },
      }),
      'explore',
    );
  });

  it('admitC1RunResult accepts top-level completed review-apply WITH verificationSummaryRef (Q1-RA-010)', () => {
    // Should not throw.
    admitC1RunResult(
      JSON.stringify({
        runStatus: 'completed',
        actionResult: {
          action: 'review-apply',
          executionStatus: 'completed',
          summary: 'approved',
          verificationSummaryRef: {
            ref: 'openspec/changes/C1/verification.md',
            versionFingerprint: 'x',
            kind: 'verification-summary',
          },
        },
        reviewVerdict: 'approved',
      }),
      'review-apply',
    );
  });
});



describe('A1 Full Test canonical result identity', () => {
  it('hashes only the exact closed protocol payload in physical check order and excludes resultRef itself', () => {
    const payload = {
      schemaVersion: 1 as const,
      status: 'passed' as const,
      summary: 'all full-test checks passed',
      totalDurationMs: 12,
      checks: [
        { id: 'quality', status: 'passed' as const, durationMs: 5 },
        { id: 'full', status: 'passed' as const, durationMs: 7 },
      ],
    };
    assert.equal(canonicalFullTestPayload(payload), JSON.stringify(payload));
    const first = fullTestResultRefFor(payload);
    const same = fullTestResultRefFor({ ...payload, checks: [...payload.checks] });
    const reordered = fullTestResultRefFor({ ...payload, checks: [...payload.checks].reverse() });
    assert.equal(first, same);
    assert.match(first, /^verification:full-test:[0-9a-f]{64}$/);
    assert.notEqual(first, reordered);
  });
});

describe('Q1 blockingAuthority writer and reader compatibility', () => {
  const base = {
    runStatus: 'completed' as const,
    actionResult: { action: 'review-propose' as const, executionStatus: 'completed' as const, summary: 'review' },
    reviewVerdict: 'changes-requested' as const,
  };

  it('new writer rejects blocking finding without blockingAuthority', () => {
    assert.throws(() => admitC1RunResult(JSON.stringify({ ...base, reviewFindings: [
      { id: 'B1', severity: 'blocking', title: 'fix', problem: 'x', requiredChange: 'revise' },
    ] }), 'review-propose'), (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED');
  });

  it('author blocker requires requiredChange while non-author blocker forbids it', () => {
    assert.doesNotThrow(() => admitC1RunResult(JSON.stringify({ ...base, reviewFindings: [
      { id: 'B1', severity: 'blocking', blockingAuthority: 'author', title: 'fix', problem: 'x', requiredChange: 'revise' },
    ] }), 'review-propose'));
    assert.doesNotThrow(() => admitC1RunResult(JSON.stringify({ ...base, reviewFindings: [
      { id: 'B2', severity: 'blocking', blockingAuthority: 'owner', title: 'decision', problem: 'x' },
    ] }), 'review-propose'));
    assert.throws(() => admitC1RunResult(JSON.stringify({ ...base, reviewFindings: [
      { id: 'B3', severity: 'blocking', blockingAuthority: 'owner', title: 'decision', problem: 'x', requiredChange: 'wrong' },
    ] }), 'review-propose'));
  });

  it('reader-only compatibility requires exact persisted pre-Q1 Review identity + bytes', () => {
    const runId = '20260810-006-review-propose';
    const raw = readFileSync(join(
      process.cwd(),
      `.flowkit/runs/20260810-01-change-execution-loop/core-contract-alignment/${runId}/result.json`,
    ), 'utf8');

    assert.throws(() => admitC1RunResult(raw, 'review-propose'));
    assert.throws(() => admitC1RunResultForReader(raw, 'review-propose'));

    const admitted = admitC1RunResultForReader(raw, 'review-propose', {
      runId,
      deliveryId: '20260810-01-change-execution-loop',
      changeId: 'core-contract-alignment',
    });
    assert.equal(admitted.reviewFindings?.[0]?.blockingAuthority, 'author');

    assert.throws(() => admitC1RunResultForReader(`${raw} `, 'review-propose', {
      runId,
      deliveryId: '20260810-01-change-execution-loop',
      changeId: 'core-contract-alignment',
    }));
    assert.throws(() => admitC1RunResultForReader(raw, 'review-propose', {
      runId: '20260810-999-review-propose',
      deliveryId: '20260810-01-change-execution-loop',
      changeId: 'core-contract-alignment',
    }));
  });

  it('new/current malformed Review with old requiredChange shape still fails closed in Reader', () => {
    const raw = JSON.stringify({ ...base, reviewFindings: [
      { id: 'CURRENT', severity: 'blocking', title: 'malformed', problem: 'x', requiredChange: 'revise' },
    ] });
    assert.throws(() => admitC1RunResultForReader(raw, 'review-propose', {
      runId: '20260810-999-review-propose',
      deliveryId: '20260810-01-change-execution-loop',
      changeId: 'core-contract-alignment',
    }), (e: unknown) => e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED');
  });
});
