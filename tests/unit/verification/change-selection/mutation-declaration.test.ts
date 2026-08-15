import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { deriveMutationDeclaration } from '../../../../src/verification/change-selection/mutation-declaration.js';
import { createTempDir } from '../../../fixtures/helpers.js';

async function isolatedDesignFixture(): Promise<{ root: string; designRef: { ref: string; kind: 'produced-artifact'; versionFingerprint: string } }> {
  const root = await createTempDir();
  const changeId = 'isolated-mutation-declaration';
  const ref = `openspec/changes/${changeId}/design.md`;
  await mkdir(join(root, 'openspec', 'changes', changeId), { recursive: true });
  await writeFile(join(root, ref), [
    '# Design',
    '',
    '## flowkitMutationScope',
    '',
    '```json',
    JSON.stringify({
      schemaVersion: 1,
      actions: {
        apply: { selectors: [{ kind: 'exact', path: 'src/domain/types.ts' }] },
        'revise-apply': { selectors: [{ kind: 'exact', path: 'src/domain/types.ts' }] },
      },
    }, null, 2),
    '```',
    '',
  ].join('\n'), 'utf8');
  return { root, designRef: { ref, kind: 'produced-artifact', versionFingerprint: 'a'.repeat(64) } };
}

describe('current mutation declaration derivation', () => {
  it('derives the approved Design apply boundary from an isolated Design fixture', async () => {
    const fixture = await isolatedDesignFixture();
    try {
      const declaration = await deriveMutationDeclaration(fixture.root, 'apply', [fixture.designRef]);
      assert.equal(declaration.action, 'apply');
      assert.equal(declaration.designRef.ref, fixture.designRef.ref);
      assert.equal(declaration.selectors.some((selector) => selector.path === 'src/domain/types.ts'), true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('requires exactly one approved Design authority ref without depending on repository lifecycle state', async () => {
    const root = await createTempDir();
    try {
      await assert.rejects(
        () => deriveMutationDeclaration(root, 'apply', []),
        (error: unknown) => error instanceof Error && error.name === 'FlowkitError',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
