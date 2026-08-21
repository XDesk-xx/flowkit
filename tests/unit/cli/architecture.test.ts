import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { runCli } from '../../../src/cli/main.js';

const htmlRoot = join(process.cwd(), 'architecture', '20260817-01-delivery-execution-loop', 'html');
after(async () => rm(htmlRoot, { recursive: true, force: true }));

describe('flowkit architecture CLI', { concurrency: false }, () => {
  it('renders Current and Planned via thin exact-Archify binding and does not pretend missing Actual exists', async () => {
    for (const kind of ['current', 'planned'] as const) {
      const result = await runCli({ argv: ['architecture', 'render', kind], cwd: process.cwd() });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal((JSON.parse(result.stdout) as Record<string, unknown>)['ok'], true);
    }
    const compare = await runCli({ argv: ['architecture', 'compare', 'current', 'actual'], cwd: process.cwd() });
    assert.equal(compare.exitCode, 2);
    assert.match(compare.stderr, /actual Architecture JSON is unavailable/);

    const reference = await runCli({ argv: ['architecture', 'render', 'reference'], cwd: process.cwd() });
    assert.equal(reference.exitCode, 2);
    assert.match(reference.stderr, /usage:/);
  });
});
