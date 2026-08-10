import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { resolvePlatformCommand } from '../../scripts/platform-command.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function npm(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = resolvePlatformCommand(npmExecutable, args);
  return new Promise((resolveResult, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code: code ?? 1, stdout, stderr }));
  });
}

describe('F1 verification command surface', () => {
  it('runs a focused test through the public npm script', async () => {
    const result = await npm(['run', 'test:focused', '--', 'tests/unit/version.test.ts']);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /layer=focused/);
    assert.match(result.stdout, /concurrency=1/);
  });

  it('fails closed for an unknown affected scope', async () => {
    const result = await npm(['run', 'test:affected', '--', 'not-a-scope']);
    assert.notEqual(result.code, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /unknown affected scope/);
  });
});
