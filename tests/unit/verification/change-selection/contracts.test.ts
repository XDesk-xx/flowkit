import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FlowkitError } from '../../../../src/shared/errors.js';
import {
  validateActualChangeSetEntries,
  validateEntryWorkspaceSnapshot,
} from '../../../../src/verification/change-selection/contracts.js';

const entry = {
  schemaVersion: 1 as const,
  canonicalBase: 'a'.repeat(40),
  workspaceFingerprint: 'b'.repeat(64),
};

describe('E1 verification selection contracts', () => {
  it('validates the immutable entry identity schema', () => {
    assert.deepEqual(validateEntryWorkspaceSnapshot(entry), entry);
    assert.throws(
      () => validateEntryWorkspaceSnapshot({ ...entry, mutable: true }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('validates lexical create/modify/delete actualChangeSet entries without rename synthesis', () => {
    const entries = [
      { path: 'src/a.ts', kind: 'create' as const, pathKindBefore: 'missing' as const, pathKindAfter: 'file' as const, contentFingerprintAfter: 'd'.repeat(64) },
      { path: 'src/z.ts', kind: 'delete' as const, pathKindBefore: 'file' as const, pathKindAfter: 'missing' as const },
    ];
    assert.deepEqual(validateActualChangeSetEntries(entries), entries);
    assert.throws(
      () => validateActualChangeSetEntries([...entries].reverse()),
      (error: unknown) => error instanceof FlowkitError && error.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});
