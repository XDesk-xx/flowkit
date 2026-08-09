import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createTempDir } from '../../fixtures/helpers.js';
import { discoverActiveDelivery, discoverRepositoryRoot, loadDiagnosticContext } from '../../../src/cli/context-loader.js';

let roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function makeRoot(manifests: Record<string, string>): Promise<string> {
  const root = await createTempDir();
  roots.push(root);
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes'), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  for (const [name, content] of Object.entries(manifests)) {
    await writeFile(join(root, 'openspec', 'delivery-groups', name), content);
  }
  return root;
}

function manifest(id: string, state: string): string {
  return [
    `id: ${id}`,
    'delivery:',
    `  state: ${state}`,
    '  fullTestStatus: not-ready',
    'changes: []',
  ].join('\n');
}

describe('diagnostic context discovery', () => {
  it('finds the nearest Flowkit root from a nested directory', async () => {
    const root = await makeRoot({ 'd.yaml': manifest('d', 'active') });
    const nested = join(root, 'a', 'b');
    await mkdir(nested, { recursive: true });
    assert.equal(await discoverRepositoryRoot(nested), root);
  });

  it('rejects no root', async () => {
    const root = await createTempDir();
    roots.push(root);
    await assert.rejects(() => discoverRepositoryRoot(root), /repository root not found/);
  });

  it('accepts exactly one active Delivery', async () => {
    const root = await makeRoot({
      'a.yaml': manifest('A', 'completed'),
      'b.yaml': manifest('B', 'active'),
    });
    assert.equal(await discoverActiveDelivery(root), 'B');
  });

  it('rejects zero or multiple active Deliveries and malformed YAML', async () => {
    const zero = await makeRoot({ 'a.yaml': manifest('A', 'completed') });
    await assert.rejects(() => discoverActiveDelivery(zero), /found 0/);
    const multiple = await makeRoot({ 'a.yaml': manifest('A', 'active'), 'b.yaml': manifest('B', 'active') });
    await assert.rejects(() => discoverActiveDelivery(multiple), /found 2/);
    const malformed = await makeRoot({ 'a.yaml': 'id: A\ndelivery:\n state: active\n    broken: value\n' });
    await assert.rejects(() => discoverActiveDelivery(malformed), /malformed delivery manifest/);
  });

  it('uses the shared loader for the selected Delivery', async () => {
    const root = await makeRoot({ 'd.yaml': manifest('D', 'active') });
    await mkdir(join(root, '.flowkit', 'runs', 'D'), { recursive: true });
    const loaded = await loadDiagnosticContext(root);
    assert.equal(loaded.deliveryId, 'D');
    assert.equal(loaded.snapshot.deliveryId, 'D');
  });
});
