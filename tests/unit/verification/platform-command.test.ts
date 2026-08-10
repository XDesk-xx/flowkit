import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolvePlatformCommand } from '../../../scripts/platform-command.js';

describe('platform command adapter', () => {
  it('routes Windows command shims through ComSpec', () => {
    const result = resolvePlatformCommand(
      'npm.cmd',
      ['run', 'build'],
      'win32',
      { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    );
    assert.equal(result.executable, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(result.args, ['/d', '/s', '/c', 'npm.cmd', 'run', 'build']);
  });

  it('leaves ordinary executables direct', () => {
    const result = resolvePlatformCommand('/usr/bin/node', ['--version'], 'linux', {});
    assert.deepEqual(result, { executable: '/usr/bin/node', args: ['--version'] });
  });
});
