import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ACTION_DEFINITIONS } from '../../src/domain/actions.js';
import type { ActionPackage } from '../../src/domain/types.js';
import { OpenSpecCliAdapter } from '../../src/integrations/openspec/openspec-cli-adapter.js';
import { admitOpenSpecArchiveRecovery, invokeOpenSpecArchive } from '../../src/integrations/openspec/openspec-archive-service.js';
import { readArchiveMutationGuard } from '../../src/persistence/run-persistence.js';
import { createTempDir } from '../fixtures/helpers.js';

const openspecBin = process.env['FLOWKIT_OPENSPEC_BIN'];
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function root() {
  const value = await createTempDir();
  roots.push(value);
  return value;
}

async function writeCommon(changeRoot: string, capabilities: string, metadata: string) {
  await mkdir(changeRoot, { recursive: true });
  await writeFile(join(changeRoot, '.openspec.yaml'), metadata);
  await writeFile(join(changeRoot, 'proposal.md'), `## Why\n\nExercise the real OpenSpec 1.7 machine contract.\n\n## What Changes\n\n- Verify the integration fixture.\n\n## Capabilities\n\n${capabilities}\n\n## Impact\n\nDisposable test only.\n`);
  await writeFile(join(changeRoot, 'design.md'), '## Context\n\nDisposable real CLI fixture.\n\n## Goals / Non-Goals\n\n**Goals:** Verify OpenSpec.\n\n**Non-Goals:** Production behavior.\n\n## Decisions\n\nUse an isolated repository.\n\n## Risks / Trade-offs\n\nNone.\n');
  await writeFile(join(changeRoot, 'tasks.md'), '## 1. Verify\n\n- [x] 1.1 Run fixture\n');
}

async function newCapabilityFixture() {
  const repoRoot = await root();
  const changeId = 'real-delta';
  const changeRoot = join(repoRoot, 'openspec', 'changes', changeId);
  await writeCommon(changeRoot, '### New Capabilities\n- real-cap: Real CLI archive fixture.\n\n### Modified Capabilities', 'schema: spec-driven\ncreated: 2026-08-11\n');
  await mkdir(join(changeRoot, 'specs', 'real-cap'), { recursive: true });
  await writeFile(join(changeRoot, 'specs', 'real-cap', 'spec.md'), '## Purpose\n\nThis disposable capability verifies real OpenSpec 1.7 archive behavior end to end.\n\n## ADDED Requirements\n\n### Requirement: Real archive fixture\nThe fixture MUST archive successfully.\n\n#### Scenario: Archive\n- **WHEN** the change is archived\n- **THEN** the canonical capability is created\n');
  return { repoRoot, changeId };
}

async function skipFixture() {
  const repoRoot = await root();
  const changeId = 'real-skip';
  const changeRoot = join(repoRoot, 'openspec', 'changes', changeId);
  await writeCommon(changeRoot, '### New Capabilities\n\n### Modified Capabilities', 'schema: spec-driven\ncreated: 2026-08-11\nskip_specs: true\n');
  return { repoRoot, changeId };
}

async function collisionFixture() {
  const repoRoot = await root();
  const changeId = 'real-collision';
  const changeRoot = join(repoRoot, 'openspec', 'changes', changeId);
  const canonical = join(repoRoot, 'openspec', 'specs', 'cap', 'spec.md');
  const oldCanonical = '## Purpose\n\nThis capability exists to verify real OpenSpec archive collision mutation behavior safely.\n\n## Requirements\n\n### Requirement: Value\nThe system MUST return old behavior.\n\n#### Scenario: Stable\n- **WHEN** value is requested\n- **THEN** old behavior is returned\n';
  await mkdir(join(repoRoot, 'openspec', 'specs', 'cap'), { recursive: true });
  await writeFile(canonical, oldCanonical);
  await writeCommon(changeRoot, '### New Capabilities\n\n### Modified Capabilities\n- cap: Change Value behavior.', 'schema: spec-driven\ncreated: 2026-08-11\n');
  await mkdir(join(changeRoot, 'specs', 'cap'), { recursive: true });
  await writeFile(join(changeRoot, 'specs', 'cap', 'spec.md'), '## MODIFIED Requirements\n\n### Requirement: Value\nThe system MUST return new behavior.\n\n#### Scenario: Stable\n- **WHEN** value is requested\n- **THEN** new behavior is returned\n');

  const today = new Date().toISOString().slice(0, 10);
  await mkdir(join(repoRoot, 'openspec', 'changes', 'archive', `${today}-${changeId}`), { recursive: true });
  const deliveryId = '20990401-01-real';
  const runId = '20990401-001-archive';
  const runDir = join(repoRoot, '.flowkit', 'runs', deliveryId, changeId, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'action.md'), '# archive\n');
  await writeFile(join(runDir, 'context.json'), JSON.stringify({
    schemaVersion: 2, runId, deliveryId, changeKey: 'C1', changeId,
    action: 'archive', role: 'author', ownerAuthorization: 'owner:fixture',
    runPath: `.flowkit/runs/${deliveryId}/${changeId}/${runId}`,
  }, null, 2) + '\n');
  const pkg: ActionPackage = {
    schemaVersion: 1,
    run: { deliveryId, changeId, runId, action: 'archive', role: 'author', semanticInputFingerprint: '0'.repeat(64) },
    definition: ACTION_DEFINITIONS.archive,
    contractRefs: [], handoffRefs: [], ownerAuthorizationRefs: [],
    requiredResultContract: ACTION_DEFINITIONS.archive.terminalContract,
  };
  return { repoRoot, changeId, canonical, oldCanonical, runDir, pkg };
}

describe('OpenSpec 1.7 real CLI conformance', { skip: openspecBin === undefined }, () => {
  it('consumes status/instructions/apply/strict and accepts delta + zero-delta archive shapes', async () => {
    const delta = await newCapabilityFixture();
    const adapter = new OpenSpecCliAdapter({ repoRoot: delta.repoRoot, executable: openspecBin! });
    assert.equal(await adapter.getVersion(), '1.7.0');
    const status = await adapter.getChangeStatus(delta.changeId);
    assert.equal(status.artifactPaths.specs.logicalPaths.length, 1);
    assert.equal((await adapter.getArtifactInstructions(delta.changeId, 'proposal')).resolvedOutputLogicalPath, `openspec/changes/${delta.changeId}/proposal.md`);
    assert.equal((await adapter.getApplyInstructions(delta.changeId)).contextFiles.specs.length, 1);
    assert.equal((await adapter.validateChange(delta.changeId, true)).valid, true);
    const deltaArchive = await adapter.archiveChange(delta.changeId, status);
    assert.equal(deltaArchive.observation?.kind, 'success');
    assert.ok(deltaArchive.observation?.kind === 'success' && deltaArchive.observation.totals !== undefined);

    const skip = await skipFixture();
    const skipAdapter = new OpenSpecCliAdapter({ repoRoot: skip.repoRoot, executable: openspecBin! });
    assert.equal((await skipAdapter.validateChange(skip.changeId, true)).valid, true);
    const skipStatus = await skipAdapter.getChangeStatus(skip.changeId);
    const skipArchive = await skipAdapter.archiveChange(skip.changeId, skipStatus);
    assert.equal(skipArchive.observation?.kind, 'success');
    assert.ok(skipArchive.observation?.kind === 'success' && skipArchive.observation.totals === undefined);
  });

  it('real archive_target_exists can mutate canonical specs before failure; durable guard requires exact restore then terminal failure without retry', async () => {
    const f = await collisionFixture();
    const adapter = new OpenSpecCliAdapter({ repoRoot: f.repoRoot, executable: openspecBin! });
    assert.equal((await adapter.validateChange(f.changeId, true)).valid, true);
    const first = await invokeOpenSpecArchive(f.repoRoot, f.pkg, { adapter });
    assert.deepEqual(first, { status: 'recovery-required', spawned: true, code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED' });
    assert.match(await readFile(f.canonical, 'utf8'), /new behavior/);
    const guard = await readArchiveMutationGuard(f.runDir);
    assert.equal(guard?.terminalObservation?.normalized.kind, 'failure');
    assert.ok(guard?.terminalObservation?.normalized.kind === 'failure' && guard.terminalObservation.normalized.status.some((entry) => entry.code === 'archive_target_exists'));
    await writeFile(f.canonical, f.oldCanonical);
    assert.equal(await admitOpenSpecArchiveRecovery(f.repoRoot, f.pkg), 'terminal-failure');
    assert.match(await readFile(join(f.runDir, 'result.json'), 'utf8'), /OPENSPEC_ARCHIVE_FAILED/);
  });
});
