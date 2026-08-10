import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAffectedTests, resolveAllTests } from '../../../scripts/affected-scopes.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('F1 affected scope mapping', () => {
  it('keeps shared broad but smaller than the full suite', async () => {
    const shared = await resolveAffectedTests(root, ['shared']);
    const full = await resolveAllTests(root);
    assert.ok(shared.includes('tests/integration/execution-model-lifecycle.test.ts'));
    assert.ok(shared.includes('tests/integration/diagnostic-cli.test.ts'));
    assert.ok(!shared.includes('tests/integration/diagnostic-cli-process.test.ts'));
    assert.ok(shared.length < full.length);
  });

  it('provides a dedicated verification tooling scope', async () => {
    const files = await resolveAffectedTests(root, ['verification']);
    assert.ok(files.includes('tests/unit/external-command.test.ts'));
    assert.ok(files.includes('tests/integration/verification-commands.test.ts'));
    assert.ok(files.some((file) => file.startsWith('tests/unit/verification/')));
  });

  it('unions, deduplicates, and sorts multiple scopes', async () => {
    const files = await resolveAffectedTests(root, ['policy', 'cli', 'policy']);
    assert.deepEqual(files, [...new Set(files)].sort((a, b) => a.localeCompare(b)));
  });

  it('fails closed for unknown scopes', async () => {
    await assert.rejects(() => resolveAffectedTests(root, ['unknown']), /unknown affected scope/);
  });
});
