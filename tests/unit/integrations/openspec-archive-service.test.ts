import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ACTION_DEFINITIONS } from '../../../src/domain/actions.js';
import type { ActionPackage } from '../../../src/domain/types.js';
import { OpenSpecCliAdapter } from '../../../src/integrations/openspec/openspec-cli-adapter.js';
import {
  admitOpenSpecArchiveRecovery,
  inspectOpenSpecArchiveRecovery,
  invokeOpenSpecArchive,
} from '../../../src/integrations/openspec/openspec-archive-service.js';
import { readArchiveMutationGuard } from '../../../src/persistence/run-persistence.js';
import type { RunCommandResult } from '../../../src/shared/external-command.js';
import { createTempDir } from '../../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

type Mode = 'success-drift' | 'success-same' | 'failure-same' | 'failure-drift' | 'unknown-same';

async function fixture(mode: Mode) {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20990301-01-c1';
  const changeId = 'archive-fixture';
  const runId = '20990301-001-archive';
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  const archiveRoot = join(root, 'openspec', 'changes', 'archive');
  const canonicalSpec = join(root, 'openspec', 'specs', 'base', 'spec.md');
  const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, runId);
  await mkdir(changeRoot, { recursive: true });
  await mkdir(archiveRoot, { recursive: true });
  await mkdir(join(root, 'openspec', 'specs', 'base'), { recursive: true });
  await mkdir(runDir, { recursive: true });
  await writeFile(join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-03-01\n');
  await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n');
  await writeFile(canonicalSpec, 'before\n');
  await writeFile(join(runDir, 'action.md'), '# archive\n');
  await writeFile(join(runDir, 'context.json'), JSON.stringify({
    schemaVersion: 2,
    runId,
    deliveryId,
    changeKey: 'C1',
    changeId,
    action: 'archive',
    role: 'author',
    ownerAuthorization: 'owner:test',
    runPath: `.flowkit/runs/${deliveryId}/${changeId}/${runId}`,
  }, null, 2) + '\n');

  const pkg: ActionPackage = {
    schemaVersion: 1,
    run: { deliveryId, changeId, runId, action: 'archive', role: 'author', semanticInputFingerprint: '0'.repeat(64) },
    definition: ACTION_DEFINITIONS.archive,
    contractRefs: [], handoffRefs: [], ownerAuthorizationRefs: [],
    requiredResultContract: ACTION_DEFINITIONS.archive.terminalContract,
  };

  let archiveCalls = 0;
  const ok = (stdout: string, exitCode = 0): RunCommandResult => ({ stdout, stderr: '', exitCode, spawned: true, timedOut: false });
  const runner = async (_command: string, args: string[]): Promise<RunCommandResult> => {
    if (args[0] === '--version') return ok('1.7.0\n');
    if (args[0] === 'status') return ok(JSON.stringify({
      changeName: changeId,
      schemaName: 'spec-driven',
      root: { path: root },
      planningHome: { kind: 'repo', root, changesDir: join(root, 'openspec', 'changes') },
      changeRoot,
      artifactPaths: {
        proposal: { resolvedOutputPath: join(changeRoot, 'proposal.md'), existingOutputPaths: [join(changeRoot, 'proposal.md')] },
        specs: { resolvedOutputPath: join(changeRoot, 'specs/**/*.md'), existingOutputPaths: [] },
        design: { resolvedOutputPath: join(changeRoot, 'design.md'), existingOutputPaths: [] },
        tasks: { resolvedOutputPath: join(changeRoot, 'tasks.md'), existingOutputPaths: [] },
      },
      actionContext: { mode: 'repo-local', sourceOfTruth: 'repo', allowedEditRoots: [root] },
      status: [],
    }));
    if (args[0] === 'archive') {
      archiveCalls++;
      if (mode === 'success-drift') {
        await writeFile(canonicalSpec, 'after\n');
        return ok(JSON.stringify({ archive: { change: changeId, archivedAs: '20990301-archive-fixture', path: join(archiveRoot, '20990301-archive-fixture'), specsUpdated: true, totals: { added: 0, modified: 1, removed: 0, renamed: 0 } }, status: [] }));
      }
      if (mode === 'success-same') {
        return ok(JSON.stringify({ archive: { change: changeId, archivedAs: '20990301-archive-fixture', path: join(archiveRoot, '20990301-archive-fixture'), specsUpdated: false }, status: [] }));
      }
      if (mode === 'failure-drift') await writeFile(canonicalSpec, 'after-partial\n');
      if (mode === 'failure-same' || mode === 'failure-drift') {
        return ok(JSON.stringify({ archive: null, status: [{ severity: 'error', code: 'archive_target_exists', message: 'collision' }] }), 1);
      }
      return ok('not-json', 1);
    }
    throw new Error(`unexpected args ${args.join(' ')}`);
  };
  const adapter = new OpenSpecCliAdapter({ repoRoot: root, executable: 'openspec-fixture', env: { FLOWKIT_HOME: undefined }, runner });
  return { root, pkg, runDir, canonicalSpec, adapter, getArchiveCalls: () => archiveCalls };
}

describe('OpenSpec durable archive matrix', () => {
  it('accepts structured success only when post V1 drifted', async () => {
    const f = await fixture('success-drift');
    const result = await invokeOpenSpecArchive(f.root, f.pkg, { adapter: f.adapter });
    assert.equal(result.status, 'success');
    assert.equal(result.spawned, true);
    assert.equal(await inspectOpenSpecArchiveRecovery(f.root, f.runDir), 'known-success');
    assert.equal(f.getArchiveCalls(), 1);
  });

  it('fails closed on structured success + same surface', async () => {
    const f = await fixture('success-same');
    const result = await invokeOpenSpecArchive(f.root, f.pkg, { adapter: f.adapter });
    assert.deepEqual(result, { status: 'terminal-failure', spawned: true, code: 'OPENSPEC_ARCHIVE_TERMINAL_STATE_MISMATCH' });
    assert.match(await readFile(join(f.runDir, 'result.json'), 'utf8'), /OPENSPEC_ARCHIVE_TERMINAL_STATE_MISMATCH/);
  });

  it('terminalizes structured failure + same surface', async () => {
    const f = await fixture('failure-same');
    const result = await invokeOpenSpecArchive(f.root, f.pkg, { adapter: f.adapter });
    assert.deepEqual(result, { status: 'terminal-failure', spawned: true, code: 'OPENSPEC_ARCHIVE_FAILED' });
    const guard = await readArchiveMutationGuard(f.runDir);
    assert.equal(guard?.terminalObservation?.kind, 'failure');
  });

  it('keeps failure + drift pending, then exact restore terminalizes from durable observation without respawn', async () => {
    const f = await fixture('failure-drift');
    const first = await invokeOpenSpecArchive(f.root, f.pkg, { adapter: f.adapter });
    assert.deepEqual(first, { status: 'recovery-required', spawned: true, code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' });
    assert.equal(f.getArchiveCalls(), 1);
    assert.equal(await inspectOpenSpecArchiveRecovery(f.root, f.runDir), 'recovery-required');
    const guard = await readArchiveMutationGuard(f.runDir);
    assert.equal(guard?.terminalObservation?.normalized.kind, 'failure');
    await writeFile(f.canonicalSpec, 'before\n');
    assert.equal(await admitOpenSpecArchiveRecovery(f.root, f.pkg), 'terminal-failure');
    assert.equal(f.getArchiveCalls(), 1);
    assert.match(await readFile(join(f.runDir, 'result.json'), 'utf8'), /OPENSPEC_ARCHIVE_FAILED/);
  });

  it('outcome-unknown requires explicit exact recovery admission before same-Run retry', async () => {
    const f = await fixture('unknown-same');
    const first = await invokeOpenSpecArchive(f.root, f.pkg, { adapter: f.adapter });
    assert.deepEqual(first, { status: 'recovery-required', spawned: true, code: 'OPENSPEC_ARCHIVE_OUTCOME_UNKNOWN' });
    assert.equal(f.getArchiveCalls(), 1);
    const second = await invokeOpenSpecArchive(f.root, f.pkg, { adapter: f.adapter });
    assert.equal(second.status, 'recovery-required');
    assert.equal(second.spawned, false);
    assert.equal(f.getArchiveCalls(), 1);
    assert.equal(await admitOpenSpecArchiveRecovery(f.root, f.pkg), 'recovery-admitted');
    const third = await invokeOpenSpecArchive(f.root, f.pkg, { adapter: f.adapter });
    assert.equal(third.status, 'recovery-required');
    assert.equal(third.spawned, true);
    assert.equal(f.getArchiveCalls(), 2);
  });
});
