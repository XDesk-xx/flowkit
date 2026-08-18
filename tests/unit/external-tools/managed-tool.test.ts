import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, win32 } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  managedToolHome,
  resolveFlowkitHome,
  resolveManagedToolInvocation,
} from '../../../src/integrations/external-tools/managed-tool.js';
import { resolveOpenSpecInvocation } from '../../../src/integrations/openspec/openspec-executable.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function requiredFlowkitHome(): string {
  const value = process.env['FLOWKIT_HOME'];
  assert.ok(value && isAbsolute(value), 'FLOWKIT_HOME exact managed fixture must be an absolute path');
  return value;
}

async function clonedHome(): Promise<string> {
  const root = await createTempDir();
  roots.push(root);
  await cp(join(requiredFlowkitHome(), 'tools'), join(root, 'tools'), { recursive: true });
  return root;
}

describe('managed external-tool runtime', () => {
  it('uses platform absolute-path semantics instead of POSIX-only fixture checks', () => {
    assert.equal(isAbsolute(requiredFlowkitHome()), true);
    assert.equal(win32.isAbsolute('C:\\Users\\flowkit\\.flowkit'), true);
  });

  it('resolves exact OpenSpec and Archify via Node without ambient PATH', async () => {
    const env = { FLOWKIT_HOME: requiredFlowkitHome(), PATH: '/poisoned' };
    for (const tool of ['openspec', 'archify'] as const) {
      const invocation = await resolveManagedToolInvocation(tool, { env });
      assert.equal(invocation.source, 'managed');
      assert.equal(invocation.command, process.execPath);
      assert.equal(invocation.argsPrefix.length, 1);
      assert.equal(invocation.propagationEnv['FLOWKIT_HOME'], requiredFlowkitHome());
    }
    const openspec = await resolveOpenSpecInvocation({ env: { ...env, FLOWKIT_OPENSPEC_BIN: '/wrong/legacy' } });
    assert.equal(openspec.source, 'managed');
  });

  it('rejects relative FLOWKIT_HOME and fails closed for missing or malformed managed identity', async () => {
    assert.throws(() => resolveFlowkitHome({ FLOWKIT_HOME: 'relative' }), /absolute path/);

    const missingDistributionHome = await clonedHome();
    await rm(join(managedToolHome('archify', { FLOWKIT_HOME: missingDistributionHome }), 'distribution', 'archify.zip'));
    await assert.rejects(
      resolveManagedToolInvocation('archify', { env: { FLOWKIT_HOME: missingDistributionHome, PATH: '/poisoned' } }),
      /distribution.*missing|missing.*distribution/i,
    );

    const badHashHome = await clonedHome();
    const distribution = join(managedToolHome('archify', { FLOWKIT_HOME: badHashHome }), 'distribution', 'archify.zip');
    await writeFile(distribution, Buffer.from('tampered'));
    await assert.rejects(resolveManagedToolInvocation('archify', { env: { FLOWKIT_HOME: badHashHome, PATH: '/poisoned' } }), /SHA256 mismatch/);

    const badPackageHome = await clonedHome();
    const openSpecPackage = join(managedToolHome('openspec', { FLOWKIT_HOME: badPackageHome }), 'runtime', 'node_modules', '@fission-ai', 'openspec', 'package.json');
    const parsed = JSON.parse(await readFile(openSpecPackage, 'utf8')) as Record<string, unknown>;
    parsed['version'] = '9.9.9';
    await writeFile(openSpecPackage, `${JSON.stringify(parsed)}\n`);
    await assert.rejects(resolveOpenSpecInvocation({ env: { FLOWKIT_HOME: badPackageHome, FLOWKIT_OPENSPEC_BIN: '/legacy/should-not-win' } }), /package identity mismatch/);

    const missingEntrypointHome = await clonedHome();
    await rm(join(managedToolHome('archify', { FLOWKIT_HOME: missingEntrypointHome }), 'runtime', 'archify', 'bin', 'archify.mjs'));
    await assert.rejects(
      resolveManagedToolInvocation('archify', { env: { FLOWKIT_HOME: missingEntrypointHome, PATH: '/poisoned' } }),
      /entrypoint.*missing|missing.*entrypoint/i,
    );
  });

  it('uses legacy OpenSpec only when the managed tool home is absent', async () => {
    const root = await createTempDir();
    roots.push(root);
    await mkdir(join(root, 'tools'), { recursive: true });
    const invocation = await resolveOpenSpecInvocation({ env: { FLOWKIT_HOME: root, FLOWKIT_OPENSPEC_BIN: '/legacy/openspec' } });
    assert.equal(invocation.source, 'legacy-compat');
    assert.equal(invocation.command, '/legacy/openspec');
  });
});
