import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { OpenSpecCliAdapter } from '../../../src/integrations/openspec/openspec-cli-adapter.js';
import type { RunCommandResult } from '../../../src/shared/external-command.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const result = (stdout: string, exitCode = 0, extra: Partial<RunCommandResult> = {}): RunCommandResult => ({
  stdout, stderr: '', exitCode, spawned: true, timedOut: false, ...extra,
});

async function rootFixture() {
  const root = await createTempDir();
  roots.push(root);
  const changeId = 'c1';
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  const archiveRoot = join(root, 'openspec', 'changes', 'archive');
  await mkdir(join(changeRoot, 'specs', 'cap'), { recursive: true });
  await mkdir(archiveRoot, { recursive: true });
  for (const file of ['proposal.md', 'design.md', 'tasks.md']) await writeFile(join(changeRoot, file), `${file}\n`);
  await writeFile(join(changeRoot, 'specs', 'cap', 'spec.md'), 'spec\n');
  const status = {
    changeName: changeId,
    schemaName: 'spec-driven',
    root: { path: root },
    planningHome: { kind: 'repo', root, changesDir: join(root, 'openspec', 'changes') },
    changeRoot,
    artifactPaths: {
      proposal: { resolvedOutputPath: join(changeRoot, 'proposal.md'), existingOutputPaths: [join(changeRoot, 'proposal.md')] },
      specs: { resolvedOutputPath: join(changeRoot, 'specs', '**', '*.md'), existingOutputPaths: [join(changeRoot, 'specs', 'cap', 'spec.md')] },
      design: { resolvedOutputPath: join(changeRoot, 'design.md'), existingOutputPaths: [join(changeRoot, 'design.md')] },
      tasks: { resolvedOutputPath: join(changeRoot, 'tasks.md'), existingOutputPaths: [join(changeRoot, 'tasks.md')] },
    },
    actionContext: { mode: 'repo-local', sourceOfTruth: 'repo', allowedEditRoots: [root] },
    status: [],
  };
  return { root, changeId, changeRoot, archiveRoot, status };
}

function statusRunner(f: Awaited<ReturnType<typeof rootFixture>>, version = '1.7.0') {
  return async (_command: string, args: string[]) => {
    if (args[0] === '--version') return result(`${version}\n`);
    if (args[0] === 'status') return result(JSON.stringify(f.status));
    throw new Error(args.join(' '));
  };
}

describe('OpenSpecCliAdapter', () => {
  it('prefers openspec.ps1 anywhere on Windows PATH before falling back to openspec.cmd', async () => {
    const f = await rootFixture();
    const first = join(f.root, 'path-first');
    const second = join(f.root, 'path-second');
    await mkdir(first, { recursive: true });
    await mkdir(second, { recursive: true });
    await writeFile(join(first, 'openspec.cmd'), 'cmd');
    await writeFile(join(second, 'openspec.ps1'), 'ps1');
    const calls: Array<{ command: string; platform?: NodeJS.Platform }> = [];
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      platform: 'win32',
      env: { FLOWKIT_HOME: undefined, PATH: `${first};${second}`, FLOWKIT_OPENSPEC_BIN: undefined },
      runner: async (command, _args, options) => {
        calls.push({ command, ...(options.platform !== undefined && { platform: options.platform }) });
        return result('1.7.0\n');
      },
    });
    assert.equal(await adapter.resolveExecutable(), join(second, 'openspec.ps1'));
    assert.equal(await adapter.getVersion(), '1.7.0');
    assert.equal(calls[0]?.command, join(second, 'openspec.ps1'));
    assert.equal(calls[0]?.platform, 'win32');
  });

  it('does not fall back to openspec.cmd after a selected openspec.ps1 execution fails', async () => {
    const f = await rootFixture();
    const bin = join(f.root, 'path-ps1-fail');
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, 'openspec.ps1'), 'ps1');
    await writeFile(join(bin, 'openspec.cmd'), 'cmd');
    const calls: string[] = [];
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      platform: 'win32',
      env: { FLOWKIT_HOME: undefined, PATH: bin, FLOWKIT_OPENSPEC_BIN: undefined },
      runner: async (command) => {
        calls.push(command);
        return result('', 9, { stderr: 'ps1 failed' });
      },
    });
    await assert.rejects(adapter.getVersion(), /failed|exit/i);
    assert.deepEqual(calls, [join(bin, 'openspec.ps1')]);
  });

  it('uses openspec.cmd only when no openspec.ps1 shim exists on Windows PATH', async () => {
    const f = await rootFixture();
    const bin = join(f.root, 'path-cmd');
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, 'openspec.cmd'), 'cmd');
    let command = '';
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      platform: 'win32',
      env: { FLOWKIT_HOME: undefined, PATH: bin, FLOWKIT_OPENSPEC_BIN: undefined },
      runner: async (resolved) => { command = resolved; return result('1.7.0\n'); },
    });
    assert.equal(await adapter.resolveExecutable(), join(bin, 'openspec.cmd'));
    assert.equal(await adapter.getVersion(), '1.7.0');
    assert.equal(command, join(bin, 'openspec.cmd'));
  });

  it('consumes a propagated resolved executable before platform PATH discovery', async () => {
    const f = await rootFixture();
    const propagated = 'C:/resolved/openspec.cmd';
    let command = '';
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      platform: 'win32',
      env: { FLOWKIT_HOME: undefined, PATH: '', FLOWKIT_OPENSPEC_BIN: propagated },
      runner: async (resolved) => { command = resolved; return result('1.7.0\n'); },
    });
    assert.equal(await adapter.resolveExecutable(), propagated);
    assert.equal(await adapter.getVersion(), '1.7.0');
    assert.equal(command, propagated);
  });

  it('keeps an explicit executable authoritative over propagated execution context', async () => {
    const f = await rootFixture();
    const explicit = 'C:/explicit/openspec.ps1';
    const propagated = 'C:/resolved/openspec.cmd';
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      executable: explicit,
      platform: 'win32',
      env: { FLOWKIT_HOME: undefined, PATH: '', FLOWKIT_OPENSPEC_BIN: propagated },
      runner: async () => result('1.7.0\n'),
    });
    assert.equal(await adapter.resolveExecutable(), explicit);
  });

  it('preserves explicit executable authority without Windows shim discovery', async () => {
    const f = await rootFixture();
    const explicit = 'C:/custom/openspec.ps1';
    let command = '';
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      executable: explicit,
      platform: 'win32',
      env: { FLOWKIT_HOME: undefined, PATH: '' },
      runner: async (resolved) => { command = resolved; return result('1.7.0\n'); },
    });
    assert.equal(await adapter.resolveExecutable(), explicit);
    assert.equal(await adapter.getVersion(), '1.7.0');
    assert.equal(command, explicit);
  });

  it('fails closed when neither Windows OpenSpec shim exists', async () => {
    const f = await rootFixture();
    const empty = join(f.root, 'path-empty');
    await mkdir(empty, { recursive: true });
    let called = false;
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      platform: 'win32',
      env: { FLOWKIT_HOME: undefined, PATH: empty, FLOWKIT_OPENSPEC_BIN: undefined },
      runner: async () => { called = true; return result('1.7.0\n'); },
    });
    await assert.rejects(adapter.resolveExecutable(), /shim not found/i);
    await assert.rejects(adapter.getVersion(), /shim not found/i);
    assert.equal(called, false);
  });
  it('does not interpret runner presence as executable authority', async () => {
    const f = await rootFixture();
    const calls: Array<{ command: string; args: string[] }> = [];
    const invocation = {
      toolId: 'openspec' as const,
      version: '1.7.0',
      source: 'managed' as const,
      toolHome: '/managed/openspec/1.7.0',
      command: process.execPath,
      argsPrefix: ['/managed/openspec/1.7.0/runtime/node_modules/@fission-ai/openspec/bin/openspec.js'],
      propagationEnv: { FLOWKIT_HOME: '/managed' },
    };
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      invocation,
      runner: async (command, args) => {
        calls.push({ command, args: [...args] });
        return result('1.7.0\n');
      },
    });
    assert.deepEqual(await adapter.resolveInvocation(), invocation);
    assert.equal(await adapter.getVersion(), '1.7.0');
    assert.deepEqual(calls[0], { command: process.execPath, args: [...invocation.argsPrefix, '--version'] });
  });

  it('admits stable 1.7.0 baseline and higher stable versions while prerelease/below-baseline/malformed fail closed', async () => {
    const f = await rootFixture();
    for (const version of ['1.7.0', '1.7.9', '1.8.0', '2.0.0', '10.4.3+build.7']) {
      assert.equal(await new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async () => result(`${version}\n`) }).getVersion(), version);
    }
    for (const version of [
      '1.6.99',
      '1.7.0-beta.1',
      '2.0.0-rc.1',
      '01.7.0',
      'v1.7.0',
      'garbage',
      '1.7.0+..',
      '1.7.0+.abc',
      '1.7.0+abc.',
      '1.7.0+abc..def',
    ]) {
      await assert.rejects(
        new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async () => result(`${version}\n`) }).getVersion(),
        /Unsupported OpenSpec version/,
      );
    }
  });

  it('uses structured machine-contract conformance rather than a fixed upper version gate', async () => {
    const f = await rootFixture();
    const compatible = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: statusRunner(f, '1.8.0') });
    assert.equal((await compatible.getChangeStatus(f.changeId)).changeRootLogical, 'openspec/changes/c1');

    const drifted = { ...f.status, schemaName: 'future-schema' };
    const incompatible = new OpenSpecCliAdapter({
      repoRoot: f.root,
      executable: 'openspec-fixture',
      env: { FLOWKIT_HOME: undefined },
      runner: async (_command, args) => args[0] === '--version'
        ? result('2.1.0\n')
        : result(JSON.stringify(drifted)),
    });
    await assert.rejects(incompatible.getChangeStatus(f.changeId), /Only spec-driven/);
  });

  it('fails closed for malformed JSON and spawn failure', async () => {
    const f = await rootFixture();
    const malformed = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_c, args) => args[0] === '--version' ? result('1.7.0\n') : result('{') });
    await assert.rejects(malformed.getChangeStatus(f.changeId), /did not return valid JSON/);
    const spawn = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async () => result('', 1, { spawned: false, spawnError: { code: 'ENOENT', message: 'missing' } }) });
    await assert.rejects(spawn.getVersion(), /spawn/i);
  });

  it('rejects wrong Change identity, lexical escape, and symlink escape from structured status', async () => {
    const f = await rootFixture();
    const wrong = { ...f.status, changeRoot: join(f.root, 'openspec', 'changes', 'other') };
    const adapter = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_c, args) => args[0] === '--version' ? result('1.7.0\n') : result(JSON.stringify(wrong)) });
    await assert.rejects(adapter.getChangeStatus(f.changeId), /requested Change identity/);

    const escaped = { ...f.status, artifactPaths: { ...f.status.artifactPaths, proposal: { resolvedOutputPath: join(f.root, '..', 'escape.md'), existingOutputPaths: [] } } };
    const adapter2 = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_c, args) => args[0] === '--version' ? result('1.7.0\n') : result(JSON.stringify(escaped)) });
    await assert.rejects(adapter2.getChangeStatus(f.changeId), /escapes its authority root/);

    const outside = await createTempDir();
    roots.push(outside);
    const linkedChange = join(f.root, 'openspec', 'changes', 'linked');
    await symlink(outside, linkedChange, 'dir');
    const linkedStatus = { ...f.status, changeName: 'linked', changeRoot: linkedChange };
    const adapter3 = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_c, args) => args[0] === '--version' ? result('1.7.0\n') : result(JSON.stringify(linkedStatus)) });
    await assert.rejects(adapter3.getChangeStatus('linked'), /symlink|alias/i);
  });

  it('rejects ambiguous singleton and cross-artifact identities', async () => {
    const f = await rootFixture();
    const conflict = {
      ...f.status,
      artifactPaths: {
        ...f.status.artifactPaths,
        proposal: {
          resolvedOutputPath: join(f.changeRoot, 'proposal.md'),
          existingOutputPaths: [join(f.changeRoot, 'design.md')],
        },
      },
    };
    await assert.rejects(
      new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_c, args) => args[0] === '--version' ? result('1.7.0\n') : result(JSON.stringify(conflict)) }).getChangeStatus(f.changeId),
      /conflicting.*singleton|singleton.*conflicting/i,
    );

    const alias = {
      ...f.status,
      artifactPaths: {
        ...f.status.artifactPaths,
        tasks: {
          resolvedOutputPath: join(f.changeRoot, 'design.md'),
          existingOutputPaths: [join(f.changeRoot, 'design.md')],
        },
      },
    };
    await assert.rejects(
      new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_c, args) => args[0] === '--version' ? result('1.7.0\n') : result(JSON.stringify(alias)) }).getChangeStatus(f.changeId),
      /alias.*physical identity/i,
    );
  });

  it('exact-binds artifact/apply instructions to validated status and keeps progress/state', async () => {
    const f = await rootFixture();
    const runner = async (_command: string, args: string[]) => {
      if (args[0] === '--version') return result('1.7.0\n');
      if (args[0] === 'status') return result(JSON.stringify(f.status));
      if (args[0] === 'instructions' && args[1] === 'proposal') return result(JSON.stringify({
        changeName: f.changeId, artifactId: 'proposal', schemaName: 'spec-driven', changeDir: f.changeRoot,
        planningHome: f.status.planningHome, resolvedOutputPath: join(f.changeRoot, 'proposal.md'), existingOutputPaths: [join(f.changeRoot, 'proposal.md')],
        instruction: 'write', template: '# Proposal', dependencies: [{ id: 'base', done: true, path: 'x' }], unlocks: ['specs'],
      }));
      if (args[0] === 'instructions' && args[1] === 'apply') return result(JSON.stringify({
        changeName: f.changeId, changeDir: f.changeRoot, schemaName: 'spec-driven',
        contextFiles: { proposal: [join(f.changeRoot, 'proposal.md')], specs: [join(f.changeRoot, 'specs', 'cap', 'spec.md')], design: [join(f.changeRoot, 'design.md')], tasks: [join(f.changeRoot, 'tasks.md')] },
        progress: { total: 4, complete: 1, remaining: 3 }, state: 'ready',
      }));
      throw new Error(args.join(' '));
    };
    const adapter = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner });
    assert.deepEqual((await adapter.getArtifactInstructions(f.changeId, 'proposal')).dependencies, ['base']);
    const apply = await adapter.getApplyInstructions(f.changeId);
    assert.deepEqual(apply.contextFiles.tasks, ['openspec/changes/c1/tasks.md']);
    assert.deepEqual(apply.progress, { total: 4, complete: 1, remaining: 3 });
    assert.equal(apply.state, 'ready');

    const wrongApply = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_command, args) => {
      if (args[0] === '--version') return result('1.7.0\n');
      if (args[0] === 'status') return result(JSON.stringify(f.status));
      return result(JSON.stringify({
        changeName: f.changeId, changeDir: join(f.root, 'openspec', 'changes', 'other'), schemaName: 'spec-driven',
        contextFiles: { proposal: [], specs: [], design: [], tasks: [] }, progress: { total: 0, complete: 0, remaining: 0 },
      }));
    } });
    await assert.rejects(wrongApply.getApplyInstructions(f.changeId), /requested Change identity/);
  });

  it('freezes one status per operation projection before reading instructions', async () => {
    const f = await rootFixture();
    const calls: string[] = [];
    const runner = async (_command: string, args: string[]) => {
      calls.push(args.slice(0, 2).join(' '));
      if (args[0] === '--version') return result('1.7.0\n');
      if (args[0] === 'status') return result(JSON.stringify(f.status));
      if (args[0] === 'instructions' && args[1] === 'proposal') return result(JSON.stringify({
        changeName: f.changeId, artifactId: 'proposal', schemaName: 'spec-driven', changeDir: f.changeRoot,
        planningHome: f.status.planningHome, resolvedOutputPath: join(f.changeRoot, 'proposal.md'),
        existingOutputPaths: [join(f.changeRoot, 'proposal.md')], dependencies: [], unlocks: [], instruction: 'write', template: '# Proposal',
      }));
      throw new Error(args.join(' '));
    };
    const projection = await new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner }).createOperationProjection(f.changeId, {
      artifactInstructionIds: ['proposal'],
    });
    assert.equal(projection.status.changeId, f.changeId);
    assert.equal(projection.artifactInstructions?.proposal.artifactId, 'proposal');
    assert.deepEqual(calls, ['--version', 'status --change', 'instructions proposal']);
    assert.deepEqual(projection.invocationDiagnostics, ['version', 'status', 'instructions:proposal']);
  });

  it('fails closed when the runner cannot prove a terminal OpenSpec outcome', async () => {
    const f = await rootFixture();
    const adapter = new OpenSpecCliAdapter({
      repoRoot: f.root,
      executable: 'openspec-fixture',
      env: { FLOWKIT_HOME: undefined },
      runner: async () => ({ ...result(''), kind: 'outcome-unknown', spawned: true, timedOut: true }),
    });
    await assert.rejects(adapter.getChangeStatus(f.changeId), /outcome is unknown/);
  });

  it('fails closed on valid=true validation contradictions while preserving structured invalid results', async () => {
    const f = await rootFixture();
    const validation = (valid: boolean, status: unknown[] = [], issues: unknown[] = []) => JSON.stringify({
      items: [{ id: f.changeId, type: 'change', valid, issues }], status,
    });
    for (const output of [
      result(validation(true), 1),
      result(validation(true, [{ severity: 'error', code: 'bad' }]), 0),
      result(validation(true, [], [{ severity: 'error', code: 'bad' }]), 0),
    ]) {
      const adapter = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_c, args) => args[0] === '--version' ? result('1.7.0\n') : output });
      await assert.rejects(adapter.validateChange(f.changeId, true), /coherence|contradictory/i);
    }
    const invalid = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: async (_c, args) => args[0] === '--version'
      ? result('1.7.0\n')
      : result(validation(false, [{ severity: 'error', code: 'invalid' }], [{ severity: 'error', code: 'req' }]), 1) });
    const view = await invalid.validateChange(f.changeId, true);
    assert.equal(view.valid, false);
    assert.equal(view.exitCode, 1);
  });

  it('accepts archive success with or without optional totals and preserves structured failure', async () => {
    const f = await rootFixture();
    const outputs = [
      { archive: { change: f.changeId, archivedAs: 'a', path: join(f.archiveRoot, 'a'), specsUpdated: true, totals: { added: 1, modified: 0, removed: 0, renamed: 0 } }, status: [] },
      { archive: { change: f.changeId, archivedAs: 'b', path: join(f.archiveRoot, 'b'), specsUpdated: false }, status: [] },
      { archive: null, status: [{ severity: 'error', code: 'archive_target_exists' }] },
    ];
    await mkdir(join(f.archiveRoot, 'a'), { recursive: true });
    await mkdir(join(f.archiveRoot, 'b'), { recursive: true });
    let index = 0;
    const runner = async (_command: string, args: string[]) => {
      if (args[0] === '--version') return result('1.7.0\n');
      if (args[0] === 'archive') {
        const out = outputs[index++]!;
        return result(JSON.stringify(out), out.archive === null ? 1 : 0);
      }
      throw new Error(args.join(' '));
    };
    const adapter = new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner });
    const status = await new OpenSpecCliAdapter({ repoRoot: f.root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner: statusRunner(f) }).getChangeStatus(f.changeId);
    const withTotals = await adapter.archiveChange(f.changeId, status);
    assert.equal(withTotals.observation?.kind, 'success');
    assert.ok(withTotals.observation?.kind === 'success' && withTotals.observation.totals);
    const withoutTotals = await adapter.archiveChange(f.changeId, status);
    assert.equal(withoutTotals.observation?.kind, 'success');
    assert.ok(withoutTotals.observation?.kind === 'success' && withoutTotals.observation.totals === undefined);
    const failure = await adapter.archiveChange(f.changeId, status);
    assert.equal(failure.observation?.kind, 'failure');
  });
});
