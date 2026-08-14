import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FlowkitError } from '../../../../src/shared/errors.js';
import { derivePostActionChangeObservation } from '../../../../src/verification/change-selection/actual-change-set.js';

const declaration = {
  schemaVersion: 1 as const,
  action: 'apply' as const,
  designRef: { ref: 'openspec/changes/example/design.md', kind: 'change-design', versionFingerprint: 'a'.repeat(64) },
  selectors: [{ kind: 'prefix' as const, path: 'src' }],
};

describe('E1 actual change-set derivation', () => {
  it('uses only create/modify/delete and represents rename-like work as delete plus create', () => {
    const result = derivePostActionChangeObservation(
      {
        schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64),
        files: [
          { path: 'src/old.ts', contentFingerprint: 'd'.repeat(64) },
          { path: 'src/changed.ts', contentFingerprint: 'e'.repeat(64) },
        ],
      },
      {
        schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'f'.repeat(64),
        files: [
          { path: 'src/old.ts', contentFingerprint: 'd'.repeat(64) },
          { path: 'src/changed.ts', contentFingerprint: 'e'.repeat(64) },
        ],
      },
      {
        schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'f'.repeat(64),
        files: [
          { path: 'src/new.ts', contentFingerprint: 'g'.repeat(64) },
          { path: 'src/changed.ts', contentFingerprint: 'h'.repeat(64) },
        ],
      },
      declaration,
    );
    assert.deepEqual(result.actualChangeSet, [
      { path: 'src/changed.ts', kind: 'modify', pathKindBefore: 'file', pathKindAfter: 'file', contentFingerprintAfter: 'h'.repeat(64) },
      { path: 'src/new.ts', kind: 'create', pathKindBefore: 'missing', pathKindAfter: 'file', contentFingerprintAfter: 'g'.repeat(64) },
      { path: 'src/old.ts', kind: 'delete', pathKindBefore: 'file', pathKindAfter: 'missing' },
    ]);
    assert.deepEqual(result.observedActionMutations, result.actualChangeSet);
  });

  it('fails closed for an undeclared post-action path', () => {
    assert.throws(
      () => derivePostActionChangeObservation(
        { schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64), files: [] },
        { schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64), files: [] },
        { schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'd'.repeat(64), files: [{ path: 'docs/outside.md', contentFingerprint: 'e'.repeat(64) }] },
        declaration,
      ),
      (error: unknown) => error instanceof FlowkitError && error.code === 'UNDECLARED_ACTION_MUTATION',
    );
  });

  it('retains a base-to-entry candidate change without treating it as this Action mutation', () => {
    const base = { schemaVersion: 1 as const, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64), files: [] };
    const entry = {
      schemaVersion: 1 as const, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'd'.repeat(64),
      files: [{ path: 'src/preexisting.ts', contentFingerprint: 'e'.repeat(64) }],
    };
    const result = derivePostActionChangeObservation(base, entry, entry, declaration);
    assert.deepEqual(result.actualChangeSet, [
      { path: 'src/preexisting.ts', kind: 'create', pathKindBefore: 'missing', pathKindAfter: 'file', contentFingerprintAfter: 'e'.repeat(64) },
    ]);
    assert.deepEqual(result.observedActionMutations, []);
  });
});
