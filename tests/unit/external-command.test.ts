import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../../src/shared/external-command.js';

describe('runCommand', () => {
  it('captures stdout and exit code', async () => {
    const result = await runCommand('node', [
      '-e',
      'process.stdout.write("hello")',
    ]);
    assert.equal(result.stdout, 'hello');
    assert.equal(result.exitCode, 0);
  });

  it('captures stderr', async () => {
    const result = await runCommand('node', [
      '-e',
      'process.stderr.write("error")',
    ]);
    assert.equal(result.stderr, 'error');
    assert.equal(result.exitCode, 0);
  });

  it('captures non-zero exit code', async () => {
    const result = await runCommand('node', ['-e', 'process.exit(1)']);
    assert.equal(result.exitCode, 1);
  });
});
