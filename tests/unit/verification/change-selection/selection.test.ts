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
});
