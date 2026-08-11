import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommandForPlatform, runCommand } from '../../src/shared/external-command.js';

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
    assert.equal(result.spawned, true);
    assert.equal(result.timedOut, false);
  });

  it('reports a bounded spawn failure without throwing', async () => {
    const result = await runCommand('__flowkit_missing_executable__', []);
    assert.equal(result.spawned, false);
    assert.equal(result.exitCode, 1);
    assert.equal(result.timedOut, false);
    assert.ok(result.spawnError?.message);
  });

  it('kills a read-only command after the configured timeout', async () => {
    const result = await runCommand('node', ['-e', 'setInterval(() => {}, 1000)'], { timeout: 40 });
    assert.equal(result.spawned, true);
    assert.equal(result.timedOut, true);
    assert.notEqual(result.exitCode, 0);
  });

  it('routes Windows command shims through explicit ComSpec but leaves non-Windows direct', () => {
    assert.deepEqual(resolveCommandForPlatform('openspec.cmd', ['status'], { platform: 'win32', comSpec: 'C:/Windows/System32/cmd.exe' }), {
      command: 'C:/Windows/System32/cmd.exe',
      args: ['/d', '/s', '/c', 'openspec.cmd', 'status'],
      usedWindowsLauncher: true,
    });
    assert.deepEqual(resolveCommandForPlatform('openspec.cmd', ['status'], { platform: 'linux' }), {
      command: 'openspec.cmd', args: ['status'], usedWindowsLauncher: false,
    });
  });
});
