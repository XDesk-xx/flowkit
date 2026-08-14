import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveMutationDeclaration } from '../../../../src/verification/change-selection/mutation-declaration.js';

const changeId = 'change-verification-generalization-and-lean-run-normalization';
const designRef = {
  ref: `openspec/changes/${changeId}/design.md`,
  kind: 'produced-artifact',
  versionFingerprint: 'a'.repeat(64),
};

describe('current mutation declaration derivation', () => {
  it('derives the approved Design apply boundary without a candidate manifest fallback', async () => {
    const declaration = await deriveMutationDeclaration(process.cwd(), 'apply', [designRef]);
    assert.equal(declaration.action, 'apply');
    assert.equal(declaration.designRef.ref, designRef.ref);
    assert.equal(declaration.selectors.some((selector) => selector.path === 'src/domain/types.ts'), true);
  });

  it('requires exactly one approved Design authority ref', async () => {
    await assert.rejects(
      () => deriveMutationDeclaration(process.cwd(), 'apply', []),
      (error: unknown) => error instanceof Error && error.name === 'FlowkitError',
    );
  });
});
