import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { ArchifyCliAdapter } from '../../../src/integrations/archify/archify-cli-adapter.js';
import type { RunCommandResult } from '../../../src/shared/external-command.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
const invocation = {
  toolId: 'archify' as const,
  version: '2.14.0',
  source: 'managed' as const,
  toolHome: '/managed/archify',
  command: process.execPath,
  argsPrefix: ['/managed/archify/bin/archify.mjs'],
  propagationEnv: { FLOWKIT_HOME: '/managed' },
};

function success(stdout: string): RunCommandResult {
  return { stdout, stderr: '', exitCode: 0, spawned: true, timedOut: false, kind: 'exited' };
}

describe('Archify architecture repository-evidence seam', () => {
  it('passes --repo-root only for architecture validate/deliver/compare', async () => {
    const root = await createTempDir();
    roots.push(root);
    await mkdir(join(root, 'inputs'));
    const input = join(root, 'inputs', 'a.json');
    const head = join(root, 'inputs', 'b.json');
    await writeFile(input, '{}\n');
    await writeFile(head, '{}\n');
    const calls: string[][] = [];
    const adapter = new ArchifyCliAdapter({
      repoRoot: root,
      invocation,
      runner: async (_command, args) => {
        calls.push(args);
        const operation = args[1];
        const type = args[2];
        if (operation === 'deliver') {
          const output = args[4]!;
          await writeFile(output, '<html></html>\n');
          return success(JSON.stringify({ ok: true, command: 'deliver', type, output }));
        }
        if (operation === 'compare') {
          const output = args[5]!;
          const receiptIndex = args.indexOf('--receipt');
          const receipt = args[receiptIndex + 1]!;
          const result = { ok: true, command: 'compare', type: 'architecture', output };
          await writeFile(output, '<html></html>\n');
          await writeFile(receipt, JSON.stringify(result));
          return success(JSON.stringify(result));
        }
        return success(JSON.stringify({ ok: true, command: 'validate', type }));
      },
    });
    await adapter.validate('architecture', input, { repositoryRoot: root });
    await adapter.deliver('architecture', input, join(root, 'a.html'), { repositoryRoot: root });
    await adapter.compareArchitecture(input, head, join(root, 'delta.html'), join(root, 'delta.json'), { repositoryRoot: root });
    assert.equal(calls.every((args) => args.includes('--repo-root')), true);
    assert.equal(calls.every((args) => args[args.indexOf('--repo-root') + 1] === root), true);

    for (const type of ['workflow', 'sequence', 'lifecycle'] as const) {
      calls.length = 0;
      await adapter.validate(type, input);
      await adapter.deliver(type, input, join(root, `${type}.html`));
      assert.equal(calls.every((args) => !args.includes('--repo-root')), true);
      assert.equal(calls.every((args) => args[2] === type), true);
      await assert.rejects(
        () => adapter.validate(type, input, { repositoryRoot: root }),
        /only for architecture/i,
      );
    }
  });
});
