import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';

import { ACTION_DEFINITIONS } from '../../src/domain/actions.js';
import type { ActionPackage } from '../../src/domain/types.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import { OpenSpecCliAdapter } from '../../src/integrations/openspec/openspec-cli-adapter.js';
import { admitOpenSpecArchiveRecovery, invokeOpenSpecArchive } from '../../src/integrations/openspec/openspec-archive-service.js';
import { readArchiveMutationGuard } from '../../src/persistence/run-persistence.js';
import { next } from '../../src/policy/next.js';
import { recordOwnerDecision } from '../../src/services/a1-write-service.js';
import { admitActionResult, prepareActionExecution } from '../../src/services/b1-run-execution-service.js';
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

async function flowkitArchiveFixture() {
  const repoRoot = await root();
  const deliveryId = '20990402-01-real-flowkit';
  const changeId = 'real-flowkit-archive';
  const changeRoot = join(repoRoot, 'openspec', 'changes', changeId);
  await mkdir(join(repoRoot, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(changeRoot, { recursive: true });
  await mkdir(join(repoRoot, '.flowkit', 'runs'), { recursive: true });
  await writeFile(join(repoRoot, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: R1',
    `    id: ${changeId}`,
    '    goal: "Real OpenSpec future archive continuation"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
    '    architectureImpact: false',
    '    outputs: []',
    '',
  ].join('\n'), 'utf8');
  await writeFile(join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-04-02\n', 'utf8');
  const now = () => new Date('2099-04-02T00:00:00Z');
  return { repoRoot, deliveryId, changeId, changeRoot, now };
}

async function flowkitSnapshot(repoRoot: string, deliveryId: string) {
  return readFormalFactSnapshot({
    repoRoot,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
}

async function writeValidFlowkitProposal(changeRoot: string) {
  await writeCommon(
    changeRoot,
    '### New Capabilities\n- real-flowkit-cap: Real Flowkit archive continuation fixture.\n\n### Modified Capabilities',
    'schema: spec-driven\ncreated: 2099-04-02\n',
  );
  await mkdir(join(changeRoot, 'specs', 'real-flowkit-cap'), { recursive: true });
  await writeFile(
    join(changeRoot, 'specs', 'real-flowkit-cap', 'spec.md'),
    '## Purpose\n\nVerify the normal Flowkit archive terminal continuation with real OpenSpec 1.7.\n\n## ADDED Requirements\n\n### Requirement: Future archive continuation\nThe fixture MUST archive successfully and preserve the Flowkit lifecycle boundary.\n\n#### Scenario: Normal archive\n- **WHEN** the prepared archive action invokes OpenSpec\n- **THEN** the same archive Run completes before checkpoint readiness\n',
  );
}

async function activateStructuredOpenSpecIntegration(repoRoot: string) {
  const capabilityRoot = join(repoRoot, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration');
  await mkdir(capabilityRoot, { recursive: true });
  await writeFile(
    join(capabilityRoot, 'spec.md'),
    '## Purpose\n\nActivate the structured OpenSpec 1.7 integration in this disposable Flowkit fixture.\n\n## Requirements\n\n### Requirement: Structured integration fixture\nThe fixture MUST use the structured OpenSpec adapter.\n\n#### Scenario: Active integration\n- **WHEN** the canonical integration capability exists\n- **THEN** Flowkit uses structured OpenSpec context\n',
    'utf8',
  );
}

async function markFlowkitChangeCompleted(repoRoot: string, deliveryId: string, changeId: string) {
  const manifest = join(repoRoot, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const current = await readFile(manifest, 'utf8');
  const active = [
    `    id: ${changeId}`,
    '    goal: "Real OpenSpec future archive continuation"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
  ].join('\n');
  assert.ok(current.includes(active));
  await writeFile(manifest, current.replace(active, active.replace('    state: active', '    state: completed')), 'utf8');
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

  it('normal future Flowkit archive uses real OpenSpec relocation and terminalizes the same schema-v4 Run before checkpoint readiness', async () => {
    const f = await flowkitArchiveFixture();
    const priorPath = process.env['PATH'];
    process.env['PATH'] = `${dirname(openspecBin!)}${delimiter}${priorPath ?? ''}`;
    try {
      const explore = await prepareActionExecution({ repoRoot: f.repoRoot, deliveryId: f.deliveryId, entry: 'next', now: f.now });
      assert.equal(explore.package.run.action, 'explore');
      await writeFile(join(f.changeRoot, 'explore.md'), '# Explore\n\nReal OpenSpec Flowkit archive continuation fixture.\n', 'utf8');
      await admitActionResult({
        repoRoot: f.repoRoot,
        deliveryId: f.deliveryId,
        actionPackage: explore.package,
        result: { executionStatus: 'completed', summary: 'explored' },
      });
      const reviewExplore = await prepareActionExecution({ repoRoot: f.repoRoot, deliveryId: f.deliveryId, entry: 'next', now: f.now });
      assert.equal(reviewExplore.package.run.action, 'review-explore');
      await admitActionResult({
        repoRoot: f.repoRoot,
        deliveryId: f.deliveryId,
        actionPackage: reviewExplore.package,
        result: { executionStatus: 'completed', summary: 'approved explore', reviewVerdict: 'approved', reviewFindings: [] },
      });
      const propose = await prepareActionExecution({ repoRoot: f.repoRoot, deliveryId: f.deliveryId, entry: 'next', now: f.now });
      assert.equal(propose.package.run.action, 'propose');
      await writeValidFlowkitProposal(f.changeRoot);
      await admitActionResult({
        repoRoot: f.repoRoot,
        deliveryId: f.deliveryId,
        actionPackage: propose.package,
        result: { executionStatus: 'completed', summary: 'proposed' },
      });
      const reviewPropose = await prepareActionExecution({ repoRoot: f.repoRoot, deliveryId: f.deliveryId, entry: 'next', now: f.now });
      assert.equal(reviewPropose.package.run.action, 'review-propose');
      await admitActionResult({
        repoRoot: f.repoRoot,
        deliveryId: f.deliveryId,
        actionPackage: reviewPropose.package,
        result: { executionStatus: 'completed', summary: 'approved proposal', reviewVerdict: 'approved', reviewFindings: [] },
      });
      await recordOwnerDecision(f.repoRoot, {
        decision: 'authorize-apply',
        changeId: f.changeId,
        sourceRef: 'owner:real-cli:authorize-apply',
      });
      const apply = await prepareActionExecution({ repoRoot: f.repoRoot, deliveryId: f.deliveryId, entry: 'next', now: f.now });
      assert.equal(apply.package.run.action, 'apply');
      await writeFile(join(f.changeRoot, 'tasks.md'), '## 1. Verify\n\n- [x] 1.1 Run fixture\n', 'utf8');
      await writeFile(
        join(f.changeRoot, 'verification.md'),
        '<!-- flowkit-change-verification-status: passed -->\n\n# Verification\n\nReal OpenSpec 1.7 future archive continuation fixture passed.\n',
        'utf8',
      );
      await admitActionResult({
        repoRoot: f.repoRoot,
        deliveryId: f.deliveryId,
        actionPackage: apply.package,
        result: { executionStatus: 'completed', summary: 'applied' },
      });
      const reviewApply = await prepareActionExecution({ repoRoot: f.repoRoot, deliveryId: f.deliveryId, entry: 'next', now: f.now });
      assert.equal(reviewApply.package.run.action, 'review-apply');
      await admitActionResult({
        repoRoot: f.repoRoot,
        deliveryId: f.deliveryId,
        actionPackage: reviewApply.package,
        result: { executionStatus: 'completed', summary: 'approved apply', reviewVerdict: 'approved', reviewFindings: [] },
      });
      await activateStructuredOpenSpecIntegration(f.repoRoot);
      const realAdapter = new OpenSpecCliAdapter({ repoRoot: f.repoRoot, executable: openspecBin! });
      assert.equal((await realAdapter.validateChange(f.changeId, true)).valid, true);
      await recordOwnerDecision(f.repoRoot, {
        decision: 'authorize-archive',
        changeId: f.changeId,
        sourceRef: 'owner:real-cli:authorize-archive',
      });
      const archive = await prepareActionExecution({ repoRoot: f.repoRoot, deliveryId: f.deliveryId, entry: 'next', now: f.now });
      assert.equal(archive.package.run.action, 'archive');
      const runDir = join(f.repoRoot, '.flowkit', 'runs', f.deliveryId, f.changeId, archive.package.run.runId);
      const context = JSON.parse(await readFile(join(runDir, 'context.json'), 'utf8')) as {
        schemaVersion: number;
        archiveEntryOpenSpecProjection?: { artifactPaths?: Record<string, readonly string[]> };
      };
      assert.equal(context.schemaVersion, 4);
      assert.deepEqual(Object.keys(context.archiveEntryOpenSpecProjection?.artifactPaths ?? {}).sort(), ['design', 'proposal', 'specs', 'tasks']);

      const outcome = await invokeOpenSpecArchive(f.repoRoot, archive.package, { adapter: realAdapter });
      assert.equal(outcome.status, 'success');
      assert.ok(outcome.status === 'success');
      await assert.rejects(stat(f.changeRoot), (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT');
      assert.match(await readFile(join(f.repoRoot, outcome.observation.path, 'proposal.md'), 'utf8'), /Exercise the real OpenSpec 1\.7 machine contract/);

      // Change completion is part of the Archive Action mutation. Before the
      // same Run is terminal-admitted, Checkpoint MUST remain closed.
      await markFlowkitChangeCompleted(f.repoRoot, f.deliveryId, f.changeId);
      const beforeAdmission = next(await flowkitSnapshot(f.repoRoot, f.deliveryId));
      assert.equal(beforeAdmission.kind, 'blocked');
      if (beforeAdmission.kind === 'blocked') {
        assert.equal(beforeAdmission.diagnosis.reason, 'archive-terminal-recovery-required');
      }
      await admitActionResult({
        repoRoot: f.repoRoot,
        deliveryId: f.deliveryId,
        actionPackage: archive.package,
        result: { executionStatus: 'completed', summary: `archived as ${outcome.observation.archivedAs}` },
      });
      const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf8')) as { runStatus: string };
      assert.equal(result.runStatus, 'completed');

      const afterAdmission = next(await flowkitSnapshot(f.repoRoot, f.deliveryId));
      assert.equal(afterAdmission.kind, 'owner-decision');
      if (afterAdmission.kind === 'owner-decision') {
        assert.equal(afterAdmission.decision, 'authorize-checkpoint');
        assert.equal(afterAdmission.context.changeKey, 'R1');
      }
    } finally {
      if (priorPath === undefined) delete process.env['PATH'];
      else process.env['PATH'] = priorPath;
    }
  });
});
