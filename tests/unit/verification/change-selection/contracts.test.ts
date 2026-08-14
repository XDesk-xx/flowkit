import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FlowkitError } from '../../../../src/shared/errors.js';
import {
  validateEntryWorkspaceSnapshot,
  validateVerificationSelectionRecord,
} from '../../../../src/verification/change-selection/contracts.js';

const entry = {
  schemaVersion: 1,
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

  it('validates ordered create/modify/delete record entries without rename synthesis', () => {
    const record = {
      schemaVersion: 1,
      producingRunId: '20260814-118-apply',
      canonicalBase: 'a'.repeat(40),
      entryWorkspaceIdentity: entry,
      postActionWorkspaceFingerprint: 'c'.repeat(64),
      actualChangeSet: [
        { path: 'src/a.ts', kind: 'create', pathKindBefore: 'missing', pathKindAfter: 'file', contentFingerprintAfter: 'd'.repeat(64) },
        { path: 'src/z.ts', kind: 'delete', pathKindBefore: 'file', pathKindAfter: 'missing' },
      ],
      rendererVersion: 1,
      verificationMarkdownFingerprint: 'e'.repeat(64),
    };
    assert.deepEqual(validateVerificationSelectionRecord(record), record);
    assert.throws(
      () => validateVerificationSelectionRecord({ ...record, actualChangeSet: [...record.actualChangeSet].reverse() }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'SCHEMA_VALIDATION_FAILED',
    );
  });
});
