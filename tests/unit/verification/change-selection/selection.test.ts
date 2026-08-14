import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FlowkitError } from '../../../../src/shared/errors.js';
import { buildVerificationSelection } from '../../../../src/verification/change-selection/selection.js';

describe('verification selection', () => {
  it('binds observed paths to concrete OpenSpec delta capability refs', () => {
    const selection = buildVerificationSelection([
      { path: 'src/domain/types.ts', kind: 'modify', pathKindBefore: 'file', pathKindAfter: 'file', contentFingerprintAfter: 'a'.repeat(64) },
    ], ['openspec/changes/e1/specs/flowkit-core-model/spec.md']);
    assert.deepEqual(selection.seedModuleIds, ['core-model']);
    assert.deepEqual(selection.capabilityIds, ['flowkit-core-model']);
    assert.equal(selection.selectionFingerprint.length, 64);
  });

  it('fails closed when a seed has no matching current delta capability', () => {
    assert.throws(() => buildVerificationSelection([
      { path: 'src/domain/types.ts', kind: 'modify', pathKindBefore: 'file', pathKindAfter: 'file', contentFingerprintAfter: 'a'.repeat(64) },
    ], ['openspec/changes/e1/specs/flowkit-policy-engine/spec.md']), (error: unknown) =>
      error instanceof FlowkitError && error.code === 'VERIFICATION_CAPABILITY_SELECTION_FAILED');
  });

  it('emits not-applicable only from the closed no-candidate-change proof', () => {
    const selection = buildVerificationSelection([], []);
    assert.deepEqual(selection.capabilityRelation, { kind: 'not-applicable', predicateId: 'no-candidate-change' });
    assert.deepEqual(selection.moduleIds, []);
    assert.deepEqual(selection.verificationScopes, []);
    assert.throws(() => buildVerificationSelection([], [
      'openspec/changes/e1/specs/flowkit-core-model/spec.md',
    ]), (error: unknown) => error instanceof FlowkitError && error.code === 'VERIFICATION_CAPABILITY_SELECTION_FAILED');
  });

  it('rejects unmapped candidate paths instead of degrading to not-applicable', () => {
    assert.throws(() => buildVerificationSelection([
      { path: 'unmapped/a.ts', kind: 'create', pathKindBefore: 'missing', pathKindAfter: 'file', contentFingerprintAfter: 'a'.repeat(64) },
    ], []), (error: unknown) => error instanceof FlowkitError && error.code === 'VERIFICATION_MODULE_SELECTION_FAILED');
  });


  it('selects synthetic and F1/G1-shaped current Changes without any E1 identity literal', () => {
    const cases = [
      { id: 'synthetic-change-a', path: 'src/domain/types.ts', capability: 'flowkit-core-model' },
      { id: 'synthetic-change-b', path: 'src/persistence/serialization.ts', capability: 'flowkit-formal-fact-reader-and-persistence' },
      { id: 'archive-and-checkpoint-boundary', path: 'src/services/b1-run-execution-service.ts', capability: 'flowkit-archive-and-checkpoint-boundary' },
      { id: 'change-cli-end-to-end-and-performance', path: 'src/cli/main.ts', capability: 'flowkit-change-cli-end-to-end-and-performance' },
    ] as const;
    for (const candidate of cases) {
      const selection = buildVerificationSelection([
        { path: candidate.path, kind: 'modify', pathKindBefore: 'file', pathKindAfter: 'file', contentFingerprintAfter: 'a'.repeat(64) },
      ], [`openspec/changes/${candidate.id}/specs/${candidate.capability}/spec.md`]);
      assert.equal(selection.capabilityIds.includes(candidate.capability), true);
      assert.equal(JSON.stringify(selection).includes('change-verification-selection-and-change-set'), false);
      assert.equal(selection.verificationScopes.includes('openspec-current-change-strict'), true);
    }
  });
});
