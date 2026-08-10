import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('F1 package verification scripts', () => {
  it('keeps npm test as the test:full compatibility entrypoint', async () => {
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    assert.equal(pkg.scripts?.test, 'npm run test:full');
    assert.equal(pkg.scripts?.['test:full'], 'node --import tsx scripts/verification.ts test:full');
    assert.equal(pkg.scripts?.['test:focused'], 'node --import tsx scripts/verification.ts test:focused');
    assert.equal(pkg.scripts?.['test:affected'], 'node --import tsx scripts/verification.ts test:affected');
    assert.equal(pkg.scripts?.quality, 'node --import tsx scripts/quality.ts');
    assert.equal(pkg.scripts?.['verify:change'], 'node --import tsx scripts/verification.ts verify:change');
    assert.equal(pkg.scripts?.['verify:full'], 'node --import tsx scripts/verification.ts verify:full');
  });
});
