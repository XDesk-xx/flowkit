import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { FlowkitError } from '../../../../src/shared/errors.js';
import {
  buildVerificationSelectionPublication,
  publishVerificationSelection,
  validatePublishedVerificationSelection,
  VERIFICATION_SELECTION_FILE,
} from '../../../../src/verification/change-selection/publication.js';
import { createTempDir } from '../../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function record(postActionWorkspaceFingerprint = 'd'.repeat(64)) {
  return buildVerificationSelectionPublication({
    producingRunId: '20260814-001-apply',
    producingSemanticInputFingerprint: 'a'.repeat(64),
    canonicalBase: 'b'.repeat(40),
    entryWorkspaceIdentity: { schemaVersion: 1, canonicalBase: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64) },
    postActionWorkspaceFingerprint,
    actualChangeSet: [{ path: 'src/a.ts', kind: 'modify' as const, pathKindBefore: 'file' as const, pathKindAfter: 'file' as const, contentFingerprintAfter: 'e'.repeat(64) }],
    selection: {
      moduleMapFingerprint: 'f'.repeat(64), seedModuleIds: ['core-model'], moduleIds: ['core-model'], capabilityIds: ['flowkit-core-model'],
      capabilityRefs: ['openspec/changes/e1/specs/flowkit-core-model/spec.md'], verificationScopes: ['npm run typecheck'], selectionFingerprint: 'f'.repeat(64),
    },
    verificationMarkdownLogicalRef: 'openspec/changes/e1/verification.md',
  });
}

describe('verification selection publication', () => {
  it('publishes Markdown before an immutable per-Run record and admits exact replay', async () => {
    const root = await createTempDir();
    roots.push(root);
    const runDir = join(root, 'run');
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    await mkdir(runDir, { recursive: true });
    const input = { runDir, canonicalVerificationPath: markdown, record: record() };
    await publishVerificationSelection(input);
    assert.match(await readFile(markdown, 'utf8'), /Bootstrap verification/);
    assert.deepEqual(JSON.parse(await readFile(join(runDir, VERIFICATION_SELECTION_FILE), 'utf8')), input.record);
    await publishVerificationSelection(input);
    assert.equal(await validatePublishedVerificationSelection({ runDir, canonicalVerificationPath: markdown, producingRunId: input.record.producingRunId }), true);
  });

  it('rejects a different immutable record after Markdown publication', async () => {
    const root = await createTempDir();
    roots.push(root);
    const runDir = join(root, 'run');
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    await mkdir(runDir, { recursive: true });
    const input = { runDir, canonicalVerificationPath: markdown, record: record() };
    await publishVerificationSelection(input);
    await assert.rejects(publishVerificationSelection({
      ...input,
      record: record('0'.repeat(64)),
    }), (error: unknown) => error instanceof FlowkitError && error.code === 'VERIFICATION_PUBLICATION_CONFLICT');
  });
});
