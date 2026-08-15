import { afterEach, describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { ACTION_DEFINITIONS, CHANGE_ACTIONS } from '../../../src/domain/actions.js';
import type { ActionPackage } from '../../../src/domain/types.js';
import { readFormalFactSnapshot, resolveOriginalStrictE2Checkpoint } from '../../../src/facts/formal-fact-reader.js';
import { invokeOpenSpecArchive } from '../../../src/integrations/openspec/openspec-archive-service.js';
import type { OpenSpecCliAdapter } from '../../../src/integrations/openspec/openspec-cli-adapter.js';
import { next } from '../../../src/policy/next.js';
import {
  admitActionResult,
  buildArchiveEntryOpenSpecProjection,
  fingerprintOpenSpecPreparedActionContext,
  inspectPendingArchiveRecoveryBeforeOpenSpec,
  inspectPreparedRun,
  prepareActionExecution,
  prepareNewExecution,
  resumeRun,
  recoverArchiveTerminalRun,
  recoverContractResetPendingRun,
} from '../../../src/services/b1-run-execution-service.js';
import { recordOwnerDecision } from '../../../src/services/a1-write-service.js';
import { ownerDecisionRefFor } from '../../../src/domain/owner-provenance.js';
import { runCli } from '../../../src/cli/main.js';
import { FlowkitError } from '../../../src/shared/errors.js';
import { createTempDir } from '../../fixtures/helpers.js';
import type { VerificationSelectionExecutor } from '../../../src/verification/change-selection/evidence.js';

const roots: string[] = [];

const execFileAsync = promisify(execFile);

async function initializeGit(root: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base'], { cwd: root });
}

const E2_MIGRATION_DELIVERY_ID = '20260810-01-change-execution-loop';
const E2_MIGRATION_CHANGE_ID = 'change-verification-generalization-and-lean-run-normalization';

async function writeE2MigrationManifest(
  root: string,
  owners: readonly { ref: string; sourceRef: string }[] = [],
): Promise<void> {
  const path = join(root, 'openspec', 'delivery-groups', `${E2_MIGRATION_DELIVERY_ID}.yaml`);
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await writeFile(path, [
    `id: ${E2_MIGRATION_DELIVERY_ID}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: E2',
    `    id: ${E2_MIGRATION_CHANGE_ID}`,
    '    state: completed',
    '    architectureImpact: false',
    '    required: true',
    '    dependsOn: []',
    ...(owners.length === 0 ? [] : [
      'ownerDecisions:',
      ...owners.flatMap((owner) => [
        `  - ref: "${owner.ref}"`,
        '    decision: "authorize-checkpoint"',
        `    deliveryId: "${E2_MIGRATION_DELIVERY_ID}"`,
        `    changeId: "${E2_MIGRATION_CHANGE_ID}"`,
        `    sourceRef: "${owner.sourceRef}"`,
      ]),
    ]),
    '',
  ].join('\n'), 'utf8');
}

async function completeE2MigrationManifest(root: string): Promise<void> {
  const path = join(root, 'openspec', 'delivery-groups', `${E2_MIGRATION_DELIVERY_ID}.yaml`);
  const current = await readFile(path, 'utf8');
  await writeFile(path, current.replace('delivery:\n  state: active', 'delivery:\n  state: completed'), 'utf8');
}

function checkpointBody(deliveryId: string, changeId: string, ownerRef: string): string {
  return [
    `Flowkit-Delivery: ${deliveryId}`,
    `Flowkit-Change: ${changeId}`,
    'Flowkit-Boundary: change-checkpoint',
    `Owner-Authorization: ${ownerRef}`,
  ].join('\n');
}

async function recordPostE2WriterBoundary(
  root: string,
  deliveryId: string,
  options: { duplicate?: boolean } = {},
): Promise<{ originalCheckpoint: string }> {
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): start ${E2_MIGRATION_DELIVERY_ID}`], { cwd: root });
  const sourceRef = 'owner:test:e2-original-checkpoint';
  const ownerRef = ownerDecisionRefFor({ decision: 'authorize-checkpoint', deliveryId: E2_MIGRATION_DELIVERY_ID, changeId: E2_MIGRATION_CHANGE_ID, sourceRef });
  const owners = [{ ref: ownerRef, sourceRef }];
  await writeE2MigrationManifest(root, owners);
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', `chore(flowkit): checkpoint ${E2_MIGRATION_CHANGE_ID}`, '-m', checkpointBody(E2_MIGRATION_DELIVERY_ID, E2_MIGRATION_CHANGE_ID, ownerRef)], { cwd: root });
  const originalCheckpoint = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();

  if (options.duplicate) {
    const duplicateSourceRef = 'owner:test:e2-duplicate-checkpoint';
    const duplicateRef = ownerDecisionRefFor({ decision: 'authorize-checkpoint', deliveryId: E2_MIGRATION_DELIVERY_ID, changeId: E2_MIGRATION_CHANGE_ID, sourceRef: duplicateSourceRef });
    await writeE2MigrationManifest(root, [...owners, { ref: duplicateRef, sourceRef: duplicateSourceRef }]);
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', `chore(flowkit): checkpoint ${E2_MIGRATION_CHANGE_ID}`, '-m', checkpointBody(E2_MIGRATION_DELIVERY_ID, E2_MIGRATION_CHANGE_ID, duplicateRef)], { cwd: root });
  }

  await completeE2MigrationManifest(root);
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', `chore(flowkit): finalize ${E2_MIGRATION_DELIVERY_ID}`], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): start ${deliveryId}`], { cwd: root });
  return { originalCheckpoint };
}

async function recordUnauthorizedE2WriterBoundary(root: string, deliveryId: string): Promise<void> {
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): start ${E2_MIGRATION_DELIVERY_ID}`], { cwd: root });
  await writeE2MigrationManifest(root);
  await execFileAsync('git', ['add', '.'], { cwd: root });
  const ownerRef = `owner:${'a'.repeat(64)}`;
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', `chore(flowkit): checkpoint ${E2_MIGRATION_CHANGE_ID}`, '-m', checkpointBody(E2_MIGRATION_DELIVERY_ID, E2_MIGRATION_CHANGE_ID, ownerRef)], { cwd: root });
  await completeE2MigrationManifest(root);
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', `chore(flowkit): finalize ${E2_MIGRATION_DELIVERY_ID}`], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): start ${deliveryId}`], { cwd: root });
}

async function recordSubjectOnlyE2WriterBoundary(root: string, deliveryId: string): Promise<void> {
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): start ${E2_MIGRATION_DELIVERY_ID}`], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): checkpoint ${E2_MIGRATION_CHANGE_ID}`], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): finalize ${E2_MIGRATION_DELIVERY_ID}`], { cwd: root });
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): start ${deliveryId}`], { cwd: root });
}

async function recordPreE2WriterMigrationStart(root: string): Promise<void> {
  const migrationDeliveryId = '20260810-01-change-execution-loop';
  await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', `chore(flowkit): start ${migrationDeliveryId}`], { cwd: root });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function freshActiveFixture(options: { changeId?: string } = {}) {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20990201-01-b1';
  const changeId = options.changeId ?? 'lean-run-fixture';
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes', changeId), { recursive: true });
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: B1',
    `    id: ${changeId}`,
    '    goal: "Lean Run fixture"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
    '    architectureImpact: false',
    '    outputs: []',
    '',
  ].join('\n'), 'utf8');
  await writeFile(
    join(root, 'openspec', 'changes', changeId, '.openspec.yaml'),
    'schema: spec-driven\ncreated: 2099-02-01\n',
    'utf8',
  );
  const now = () => new Date('2099-02-01T00:00:00Z');
  return { root, deliveryId, changeId, now };
}

async function snapshot(root: string, deliveryId: string) {
  return readFormalFactSnapshot({
    repoRoot: root,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
}


function fixtureOpenSpecAdapter(root: string, changeId: string): OpenSpecCliAdapter {
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  return {
    createOperationProjection: async () => ({
      projectionVersion: 1 as const,
      version: '1.7.0',
      changeId,
      status: {
        changeId,
        schemaName: 'spec-driven' as const,
        root: { path: root },
        planningHome: { kind: 'repo' as const, root, changesDir: join(root, 'openspec', 'changes') },
        changeRoot,
        changeRootLogical: `openspec/changes/${changeId}`,
        archiveNamespaceRoot: join(root, 'openspec', 'changes', 'archive'),
        archiveNamespaceRootLogical: 'openspec/changes/archive',
        actionContext: { mode: 'repo-local' as const, sourceOfTruth: 'repo' as const, allowedEditRoots: [changeRoot] },
        artifactPaths: {
          proposal: { artifactId: 'proposal' as const, logicalPaths: [`openspec/changes/${changeId}/proposal.md`], physicalPaths: [join(changeRoot, 'proposal.md')] },
          design: { artifactId: 'design' as const, logicalPaths: [`openspec/changes/${changeId}/design.md`], physicalPaths: [join(changeRoot, 'design.md')] },
          tasks: { artifactId: 'tasks' as const, logicalPaths: [`openspec/changes/${changeId}/tasks.md`], physicalPaths: [join(changeRoot, 'tasks.md')] },
          specs: { artifactId: 'specs' as const, logicalPaths: [`openspec/changes/${changeId}/specs/flowkit-core-model/spec.md`], physicalPaths: [join(changeRoot, 'specs', 'flowkit-core-model', 'spec.md')] },
        },
        status: [],
      },
      invocationDiagnostics: [],
    }),
  } as unknown as OpenSpecCliAdapter;
}

const fixtureVerificationExecutor = (status: 'passed' | 'failed'): VerificationSelectionExecutor => async (input) => {
  if (input.selection.capabilityRelation.kind === 'not-applicable') {
    return {
      schemaVersion: 1, producingRunId: input.producingRunId, selectionFingerprint: input.selection.selectionFingerprint,
      overallStatus: 'not-applicable', fullTestStatus: input.fullTestStatus, environment: 'fixture', checks: [],
      notApplicableProof: { predicateId: input.selection.capabilityRelation.predicateId },
    };
  }
  return {
    schemaVersion: 1, producingRunId: input.producingRunId, selectionFingerprint: input.selection.selectionFingerprint,
    overallStatus: status, fullTestStatus: input.fullTestStatus, environment: 'fixture',
    checks: input.selection.verificationScopes.map((scope, index) => ({
      scope, applicability: 'applicable', commandOrMethod: `fixture:${scope}`, status,
      summary: `${status} fixture check`,
      resultRef: `${input.resultRefBase ?? `.flowkit/runs/${input.producingRunId}/verification-evidence.json`}#check-${index + 1}`,
      environment: 'fixture', outcomeKind: 'exited', exitCode: status === 'passed' ? 0 : 1,
      stdoutFingerprint: 'a'.repeat(64), stderrFingerprint: 'b'.repeat(64),
    })),
  };
};

async function prepareV5ApplyReady(options: {
  changeId?: string;
  postE2Writer?: boolean;
  freshConsumer?: boolean;
  unauthorizedE2?: boolean;
  subjectOnlyE2?: boolean;
  duplicateE2?: boolean;
} = {}) {
  const fixture = await freshActiveFixture({ changeId: options.changeId ?? 'change-verification-selection-and-change-set' });
  const { root, deliveryId, changeId, now } = fixture;
  await mkdir(join(root, 'src', 'domain'), { recursive: true });
  await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 1;\n', 'utf8');
  await initializeGit(root);
  let originalE2Checkpoint: string | undefined;
  if (options.postE2Writer) {
    originalE2Checkpoint = (await recordPostE2WriterBoundary(root, deliveryId, { duplicate: options.duplicateE2 })).originalCheckpoint;
  } else if (options.unauthorizedE2) await recordUnauthorizedE2WriterBoundary(root, deliveryId);
  else if (options.subjectOnlyE2) await recordSubjectOnlyE2WriterBoundary(root, deliveryId);
  else if (!options.freshConsumer) await recordPreE2WriterMigrationStart(root);
  await completeExplore(root, deliveryId, changeId, now);
  const reviewExplore = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  await admitActionResult({ repoRoot: root, deliveryId, actionPackage: reviewExplore.package, result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] } });
  const propose = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  const mutationScope = { schemaVersion: 1, actions: {
    apply: { selectors: [
      { kind: 'exact', path: `openspec/changes/${changeId}/tasks.md` },
      { kind: 'exact', path: `openspec/changes/${changeId}/verification.md` },
      { kind: 'exact', path: 'src/domain/types.ts' },
    ] },
    'revise-apply': { selectors: [
      { kind: 'exact', path: `openspec/changes/${changeId}/tasks.md` },
      { kind: 'exact', path: `openspec/changes/${changeId}/verification.md` },
      { kind: 'exact', path: 'src/domain/types.ts' },
    ] },
  } };
  await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n', 'utf8');
  await writeFile(join(changeRoot, 'design.md'), `# Design\n\n## flowkitMutationScope\n\n\`\`\`json\n${JSON.stringify(mutationScope, null, 2)}\n\`\`\`\n`, 'utf8');
  await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [ ] fixture\n', 'utf8');
  const specDir = join(changeRoot, 'specs', 'flowkit-core-model');
  await mkdir(specDir, { recursive: true });
  await writeFile(join(specDir, 'spec.md'), '## ADDED Requirements\n\n### Requirement: fixture\nThe fixture MUST work.\n\n#### Scenario: fixture\n- **WHEN** it runs\n- **THEN** it works\n', 'utf8');
  await admitActionResult({ repoRoot: root, deliveryId, actionPackage: propose.package, result: { executionStatus: 'completed', summary: 'proposed' } });
  const reviewPropose = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  await admitActionResult({ repoRoot: root, deliveryId, actionPackage: reviewPropose.package, result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] } });
  await recordOwnerDecision(root, { decision: 'authorize-apply', changeId, sourceRef: 'owner:e1-v5-fixture:apply' });
  const prepared = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(prepared.kind, 'prepared');
  if (prepared.kind !== 'prepared') assert.fail('expected v5 Apply preparation');
  assert.equal(prepared.package.run.action, 'apply');
  return { ...fixture, changeRoot, apply: prepared.package, originalE2Checkpoint };
}

function historicalV1SemanticFingerprint(pkg: ActionPackage): string {
  const descriptor = {
    schemaVersion: 1,
    deliveryId: pkg.run.deliveryId,
    changeId: pkg.run.changeId,
    action: pkg.run.action,
    actionDefinition: pkg.definition,
    contractRefs: [...pkg.contractRefs].sort((a, b) => `${a.ref}\0${a.kind}\0${a.versionFingerprint}`.localeCompare(`${b.ref}\0${b.kind}\0${b.versionFingerprint}`)),
    handoffRefs: [...pkg.handoffRefs].sort((a, b) => `${a.ref}\0${a.kind}\0${a.versionFingerprint}`.localeCompare(`${b.ref}\0${b.kind}\0${b.versionFingerprint}`)),
    reviewAuthority: pkg.reviewView === undefined ? null : {
      reviewRunId: pkg.reviewView.reviewRunId,
      verdict: pkg.reviewView.verdict,
      resultRef: pkg.reviewView.resultRef,
      blockingAuthorities: [...pkg.reviewView.blockingAuthorities].sort(),
    },
    verificationAuthority: pkg.verificationView ?? null,
    ownerAuthorizationRefs: [...pkg.ownerAuthorizationRefs].sort((a, b) => a.ref.localeCompare(b.ref)),
    ...(pkg.ownerFactRefs !== undefined && { ownerFactRefs: [...pkg.ownerFactRefs].sort((a, b) => a.ref.localeCompare(b.ref)) }),
    externalContextFingerprint: pkg.externalContextFingerprint ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonicalizeForTest(descriptor))).digest('hex');
}

function canonicalizeForTest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeForTest);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalizeForTest(record[key])]));
}

async function downgradePendingV5ContextToHistoricalV4(root: string, deliveryId: string, changeId: string, pkg: ActionPackage): Promise<void> {
  const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, pkg.run.runId);
  const path = join(runDir, 'context.json');
  const current = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  const semanticInputFingerprint = historicalV1SemanticFingerprint(pkg);
  const historical: Record<string, unknown> = { ...current, schemaVersion: 4, semanticInputFingerprint };
  for (const field of ['canonicalBase', 'applicableFactRefs', 'actionPackage', 'entryWorkspaceIdentity', 'mutationDeclaration']) delete historical[field];
  await writeFile(path, `${JSON.stringify(historical, null, 2)}\n`, 'utf8');
  const actionPath = join(runDir, 'action.md');
  const action = await readFile(actionPath, 'utf8');
  await writeFile(actionPath, action.replace(/semanticInputFingerprint: `[^`]+`/, `semanticInputFingerprint: \`${semanticInputFingerprint}\``), 'utf8');
}

async function completeExplore(root: string, deliveryId: string, changeId: string, now: () => Date) {
  const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(prepared.package.run.action, 'explore');
  await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n', 'utf8');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: prepared.package,
    result: { executionStatus: 'completed', summary: 'explored' },
  });
  return prepared;
}

describe('E1 new preparation boundary', () => {
  it('returns exact-resume-required without allocating or implicitly resuming a pending Run', async () => {
    const { root, deliveryId, now } = await freshActiveFixture();
    const pending = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const result = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.deepEqual(result, { kind: 'exact-resume-required', expectedRunId: pending.package.run.runId });
  });

  it('returns persisted terminal on exact retry and rejects a conflicting terminal descriptor without advancing generation', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await initializeGit(root);
    const prepared = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(prepared.kind, 'prepared');
    if (prepared.kind !== 'prepared') assert.fail('expected fresh v5 preparation');
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore v5\n', 'utf8');
    const logicalResult = { executionStatus: 'completed' as const, summary: 'v5 explored' };
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: prepared.package, result: logicalResult });

    const resumed = await resumeRun({ repoRoot: root, deliveryId, expectedRunId: prepared.package.run.runId });
    assert.equal(resumed.kind, 'already-terminal');
    if (resumed.kind !== 'already-terminal') assert.fail('expected persisted terminal');
    assert.equal(resumed.result.runStatus, 'completed');

    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: prepared.package, result: logicalResult });
    await assert.rejects(
      admitActionResult({ repoRoot: root, deliveryId, actionPackage: prepared.package, result: { ...logicalResult, summary: 'different descriptor' } }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'TERMINAL_REPLAY_CONFLICT',
    );
    const runs = await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId));
    assert.deepEqual(runs.filter((name) => /^\d{8}-\d{3}-/.test(name)), [prepared.package.run.runId]);
  });

  it('serializes concurrent new preparation so only one pending Run is published', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await initializeGit(root);
    const [left, right] = await Promise.all([
      prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
    ]);
    const outcomes = [left, right];
    const prepared = outcomes.filter((outcome) => outcome.kind === 'prepared');
    const resumes = outcomes.filter((outcome) => outcome.kind === 'exact-resume-required');
    assert.equal(prepared.length, 1);
    assert.equal(resumes.length, 1);
    if (prepared[0]?.kind !== 'prepared' || resumes[0]?.kind !== 'exact-resume-required') assert.fail('unexpected concurrent outcomes');
    assert.equal(resumes[0].expectedRunId, prepared[0].package.run.runId);
    const runs = await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId));
    assert.deepEqual(runs.filter((name) => /^\d{8}-\d{3}-/.test(name)), [prepared[0].package.run.runId]);
  });

  it('shares one OpenSpec version/status base projection across the full new-preparation operation', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await initializeGit(root);
    await mkdir(join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration'), { recursive: true });
    await writeFile(join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'), '# active\n', 'utf8');
    let baseReads = 0;
    let extensionReads = 0;
    const status = {
      changeId,
      schemaName: 'spec-driven' as const,
      root: { path: root },
      planningHome: { kind: 'repo' as const, root, changesDir: join(root, 'openspec', 'changes') },
      changeRoot: join(root, 'openspec', 'changes', changeId),
      changeRootLogical: `openspec/changes/${changeId}`,
      archiveNamespaceRoot: join(root, 'openspec', 'changes', 'archive'),
      archiveNamespaceRootLogical: 'openspec/changes/archive',
      actionContext: { mode: 'repo-local' as const, sourceOfTruth: 'repo' as const, allowedEditRoots: [join(root, 'openspec', 'changes', changeId)] },
      artifactPaths: {
        proposal: { artifactId: 'proposal' as const, logicalPaths: [`openspec/changes/${changeId}/proposal.md`], physicalPaths: [join(root, 'openspec', 'changes', changeId, 'proposal.md')] },
        design: { artifactId: 'design' as const, logicalPaths: [`openspec/changes/${changeId}/design.md`], physicalPaths: [join(root, 'openspec', 'changes', changeId, 'design.md')] },
        tasks: { artifactId: 'tasks' as const, logicalPaths: [`openspec/changes/${changeId}/tasks.md`], physicalPaths: [join(root, 'openspec', 'changes', changeId, 'tasks.md')] },
        specs: { artifactId: 'specs' as const, logicalPaths: [], physicalPaths: [] },
      },
      status: [],
    };
    const fakeAdapter = {
      createOperationProjection: async (_changeId: string, request: { baseProjection?: unknown } = {}) => {
        if (request.baseProjection === undefined) baseReads += 1;
        else extensionReads += 1;
        return request.baseProjection ?? { projectionVersion: 1 as const, version: '1.7.0', changeId, status, invocationDiagnostics: ['version', 'status'] };
      },
    } as unknown as OpenSpecCliAdapter;

    const prepared = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now, openSpecAdapter: fakeAdapter });
    assert.equal(prepared.kind, 'prepared');
    assert.equal(baseReads, 1, 'formal snapshot must read version/status only once');
    assert.equal(extensionReads, 1, 'Action context must extend the persisted operation projection rather than re-read version/status');
  });

  it('reconstructs a v5 package from the exact persisted pending Run without re-entering Policy', async () => {
    const { root, deliveryId, changeId } = await freshActiveFixture();
    const runId = '20990201-001-explore';
    const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, runId);
    const semanticInputFingerprint = 'a'.repeat(64);
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'action.md'), '# Prepared\n', 'utf8');
    await writeFile(join(runDir, 'context.json'), JSON.stringify({
      schemaVersion: 5,
      runId,
      deliveryId,
      changeKey: 'B1',
      changeId,
      action: 'explore',
      role: 'author',
      ownerAuthorization: 'not-required',
      semanticInputFingerprint,
      canonicalBase: 'b'.repeat(40),
      applicableFactRefs: [],
      actionPackage: {
        schemaVersion: 2,
        run: { runId, deliveryId, changeId, action: 'explore', role: 'author', semanticInputFingerprint },
        definition: ACTION_DEFINITIONS.explore,
        contractRefs: [],
        handoffRefs: [],
        ownerAuthorizationRefs: [],
        requiredResultContract: ACTION_DEFINITIONS.explore.terminalContract,
      },
      runPath: `.flowkit/runs/${deliveryId}/${changeId}/${runId}/`,
    }, null, 2), 'utf8');

    const facts = await snapshot(root, deliveryId);
    assert.equal(facts.conflicts.length, 0, JSON.stringify(facts.conflicts));
    assert.equal(facts.runs.filter((run) => run.runId === runId).length, 1, JSON.stringify(facts.runs));
    const resumed = await resumeRun({ repoRoot: root, deliveryId, expectedRunId: runId });
    assert.equal(resumed.kind, 'pending');
    if (resumed.kind !== 'pending') assert.fail('expected pending exact resume');
    assert.equal(resumed.package.schemaVersion, 2);
    assert.equal(resumed.package.run.runId, runId);
    assert.equal(resumed.package.run.action, 'explore');
  });
  it('recovers a historical v4 pending Apply from its persisted pre-reset proposal/review lineage', async () => {
    const { root, deliveryId, changeId, apply } = await prepareV5ApplyReady();
    await downgradePendingV5ContextToHistoricalV4(root, deliveryId, changeId, apply);
    await recordOwnerDecision(root, {
      decision: 'contract-reset', changeId, scope: 'E1/historical-v4-reset', requiredOutcomes: ['fresh contract generation'], sourceRef: 'owner:e1-historical-v4-reset:apply',
    });
    assert.equal((await inspectPreparedRun(root, deliveryId)).status, 'recovery-required');
    const recovered = await recoverContractResetPendingRun({ repoRoot: root, deliveryId });
    assert.deepEqual(recovered, { runId: apply.run.runId, action: 'apply', status: 'cancelled', cancellationReason: 'superseded-by-owner-contract-reset' });
    assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'propose' });
  });

  it('recovers a historical v4 pending revise-apply from persisted review/apply lineage after Contract Reset', async () => {
    const { root, deliveryId, changeId, changeRoot, apply, now } = await prepareV5ApplyReady();
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 2;\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n', 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: { executionStatus: 'completed', summary: 'applied' }, verificationExecutor: fixtureVerificationExecutor('passed'), openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) });
    const review = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'review', now });
    assert.equal(review.kind, 'prepared');
    if (review.kind !== 'prepared') assert.fail('expected review-apply');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: review.package, result: {
      executionStatus: 'completed', summary: 'changes requested', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'E1-HIST-RESET-001', severity: 'blocking', blockingAuthority: 'author', title: 'revise', problem: 'fixture', contractRef: 'spec:fixture', invariant: 'fixture', evidence: ['fixture'], impact: 'blocked', requiredOutcome: 'revise', acceptance: ['revised'] }],
    } });
    const revise = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(revise.kind, 'prepared');
    if (revise.kind !== 'prepared') assert.fail('expected revise-apply');
    await downgradePendingV5ContextToHistoricalV4(root, deliveryId, changeId, revise.package);
    await recordOwnerDecision(root, {
      decision: 'contract-reset', changeId, scope: 'E1/historical-v4-reset', requiredOutcomes: ['fresh contract generation'], sourceRef: 'owner:e1-historical-v4-reset:revise',
    });
    assert.equal((await inspectPreparedRun(root, deliveryId)).status, 'recovery-required');
    const recovered = await recoverContractResetPendingRun({ repoRoot: root, deliveryId });
    assert.deepEqual(recovered, { runId: revise.package.run.runId, action: 'revise-apply', status: 'cancelled', cancellationReason: 'superseded-by-owner-contract-reset' });
    assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'propose' });
  });

  it('fails closed when historical v4 Apply recovery is missing its persisted producer inputRef', async () => {
    const { root, deliveryId, changeId, apply } = await prepareV5ApplyReady();
    await downgradePendingV5ContextToHistoricalV4(root, deliveryId, changeId, apply);
    await recordOwnerDecision(root, {
      decision: 'contract-reset', changeId, scope: 'E1/historical-v4-reset', requiredOutcomes: ['fresh contract generation'], sourceRef: 'owner:e1-historical-v4-reset:missing-input',
    });
    const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, apply.run.runId);
    const contextPath = join(runDir, 'context.json');
    const context = JSON.parse(await readFile(contextPath, 'utf8')) as Record<string, unknown>;
    delete context['inputRef'];
    await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
    assert.equal((await inspectPreparedRun(root, deliveryId)).status, 'not-resumable');
    await assert.rejects(
      recoverContractResetPendingRun({ repoRoot: root, deliveryId }),
      (error: unknown) => error instanceof FlowkitError && (error.code === 'RESET_PENDING_RECOVERY_NOT_ALLOWED' || error.code === 'FORMAL_FACT_CONFLICT'),
    );
  });

  it('rejects historical v4 Contract Reset recovery when immutable contract bytes also drift', async () => {
    const { root, deliveryId, changeId, changeRoot, apply } = await prepareV5ApplyReady();
    await downgradePendingV5ContextToHistoricalV4(root, deliveryId, changeId, apply);
    await recordOwnerDecision(root, {
      decision: 'contract-reset', changeId, scope: 'E1/historical-v4-reset', requiredOutcomes: ['fresh contract generation'], sourceRef: 'owner:e1-historical-v4-reset:mixed',
    });
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal mixed historical drift\n', 'utf8');
    await assert.rejects(
      recoverContractResetPendingRun({ repoRoot: root, deliveryId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'RESET_PENDING_RECOVERY_NOT_ALLOWED',
    );
  });

  it('fails exact v5 Apply resume on Contract Reset and recovers the historical pending Run without current producer lookup', async () => {
    const { root, deliveryId, changeId, apply } = await prepareV5ApplyReady();
    await recordOwnerDecision(root, {
      decision: 'contract-reset', changeId, scope: 'E1/v5-reset', requiredOutcomes: ['fresh contract generation'], sourceRef: 'owner:e1-v5-reset:apply',
    });
    await assert.rejects(
      resumeRun({ repoRoot: root, deliveryId, expectedRunId: apply.run.runId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    assert.equal((await inspectPreparedRun(root, deliveryId)).status, 'recovery-required');
    const recovered = await recoverContractResetPendingRun({ repoRoot: root, deliveryId });
    assert.deepEqual(recovered, { runId: apply.run.runId, action: 'apply', status: 'cancelled', cancellationReason: 'superseded-by-owner-contract-reset' });
    assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'propose' });
  });

  it('recovers a historical pending v5 revise-apply after Contract Reset without requiring the superseded proposal generation', async () => {
    const { root, deliveryId, changeId, changeRoot, apply, now } = await prepareV5ApplyReady();
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 2;\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n', 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: { executionStatus: 'completed', summary: 'applied' }, verificationExecutor: fixtureVerificationExecutor('passed'), openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) });
    const review = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'review', now });
    assert.equal(review.kind, 'prepared');
    if (review.kind !== 'prepared') assert.fail('expected review-apply');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: review.package, result: {
      executionStatus: 'completed', summary: 'changes requested', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'E1-V5-RESET-001', severity: 'blocking', blockingAuthority: 'author', title: 'revise', problem: 'fixture', contractRef: 'spec:fixture', invariant: 'fixture', evidence: ['fixture'], impact: 'blocked', requiredOutcome: 'revise', acceptance: ['revised'] }],
    } });
    const revise = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(revise.kind, 'prepared');
    if (revise.kind !== 'prepared') assert.fail('expected revise-apply');
    assert.equal(revise.package.run.action, 'revise-apply');
    await recordOwnerDecision(root, {
      decision: 'contract-reset', changeId, scope: 'E1/v5-reset', requiredOutcomes: ['fresh contract generation'], sourceRef: 'owner:e1-v5-reset:revise',
    });
    await assert.rejects(
      resumeRun({ repoRoot: root, deliveryId, expectedRunId: revise.package.run.runId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    assert.equal((await inspectPreparedRun(root, deliveryId)).status, 'recovery-required');
    const recovered = await recoverContractResetPendingRun({ repoRoot: root, deliveryId });
    assert.deepEqual(recovered, { runId: revise.package.run.runId, action: 'revise-apply', status: 'cancelled', cancellationReason: 'superseded-by-owner-contract-reset' });
    assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'propose' });
  });

  it('rejects Contract Reset recovery when the v5 pending Apply also has immutable contract drift', async () => {
    const { root, deliveryId, changeId, changeRoot } = await prepareV5ApplyReady();
    await recordOwnerDecision(root, {
      decision: 'contract-reset', changeId, scope: 'E1/v5-reset', requiredOutcomes: ['fresh contract generation'], sourceRef: 'owner:e1-v5-reset:mixed',
    });
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal mixed drift\n', 'utf8');
    await assert.rejects(
      recoverContractResetPendingRun({ repoRoot: root, deliveryId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'RESET_PENDING_RECOVERY_NOT_ALLOWED',
    );
  });

  it('revalidates external contract drift on exact v5 resume while allowing declaration-covered Apply mutation', async () => {
    const allowed = await prepareV5ApplyReady();
    await writeFile(join(allowed.changeRoot, 'tasks.md'), '# Tasks\n\n- [x] in flight\n', 'utf8');
    const resumed = await resumeRun({ repoRoot: allowed.root, deliveryId: allowed.deliveryId, expectedRunId: allowed.apply.run.runId });
    assert.equal(resumed.kind, 'pending');

    const drifted = await prepareV5ApplyReady();
    await writeFile(join(drifted.changeRoot, 'proposal.md'), '# Proposal drifted after approval\n', 'utf8');
    await assert.rejects(
      resumeRun({ repoRoot: drifted.root, deliveryId: drifted.deliveryId, expectedRunId: drifted.apply.run.runId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    assert.equal((await inspectPreparedRun(drifted.root, drifted.deliveryId)).status, 'input-drift');
  });

  it('does not let a prewritten passed marker manufacture v5 Verification success without matching selected-check evidence', async () => {
    const { root, deliveryId, changeRoot, apply } = await prepareV5ApplyReady();
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 2;\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n', 'utf8');
    await writeFile(join(changeRoot, 'verification.md'), '<!-- flowkit-change-verification-status: passed -->\n', 'utf8');
    await admitActionResult({
      repoRoot: root, deliveryId, actionPackage: apply,
      result: { executionStatus: 'completed', summary: 'apply with failing verification evidence' },
      verificationExecutor: fixtureVerificationExecutor('failed'),
      openSpecAdapter: fixtureOpenSpecAdapter(root, apply.run.changeId),
    });
    const runDir = join(root, '.flowkit', 'runs', deliveryId, apply.run.changeId, apply.run.runId);
    const selection = JSON.parse(await readFile(join(runDir, 'verification-selection.json'), 'utf8')) as { verificationStatus: string };
    const evidence = JSON.parse(await readFile(join(runDir, 'verification-evidence.json'), 'utf8')) as { overallStatus: string; checks: Array<{ status: string }> };
    const markdown = await readFile(join(changeRoot, 'verification.md'), 'utf8');
    assert.equal(selection.verificationStatus, 'failed');
    assert.equal(evidence.overallStatus, 'failed');
    assert.equal(evidence.checks.every((check) => check.status === 'failed'), true);
    assert.match(markdown, /flowkit-change-verification-status: failed/);
    assert.match(markdown, /## Verification checks/);
    assert.match(markdown, /result ref:/);
    const facts = await snapshot(root, deliveryId);
    assert.equal(facts.changeVerificationStatus, 'failed');
  });

});

async function advanceToApplyReady(root: string, deliveryId: string, changeId: string, now: () => Date) {
  await completeExplore(root, deliveryId, changeId, now);

  const reviewExplore = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(reviewExplore.package.run.action, 'review-explore');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: reviewExplore.package,
    result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] },
  });

  const propose = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(propose.package.run.action, 'propose');
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n', 'utf8');
  await writeFile(join(changeRoot, 'design.md'), '# Design\n', 'utf8');
  await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n', 'utf8');
  await mkdir(join(changeRoot, 'specs', 'cap-a'), { recursive: true });
  await writeFile(join(changeRoot, 'specs', 'cap-a', 'spec.md'), '## ADDED Requirements\n\n### Requirement: X\nX MUST work.\n\n#### Scenario: X\n- **WHEN** x\n- **THEN** y\n', 'utf8');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: propose.package,
    result: { executionStatus: 'completed', summary: 'proposed' },
  });

  const reviewPropose = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(reviewPropose.package.run.action, 'review-propose');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: reviewPropose.package,
    result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] },
  });

  const beforeOwner = await snapshot(root, deliveryId);
  assert.equal(next(beforeOwner).kind, 'owner-decision');
  await recordOwnerDecision(root, {
    decision: 'authorize-apply',
    changeId,
    sourceRef: 'owner:b1-test:authorize-apply',
  });
  assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'apply' });
}


async function advanceToArchiveReady(root: string, deliveryId: string, changeId: string, now: () => Date) {
  await advanceToApplyReady(root, deliveryId, changeId, now);
  const changeRoot = join(root, 'openspec', 'changes', changeId);

  const apply = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(apply.package.run.action, 'apply');
  await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] applied\n', 'utf8');
  await writeFile(
    join(changeRoot, 'verification.md'),
    '<!-- flowkit-change-verification-status: passed -->\n\n# Verification\n',
    'utf8',
  );
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: apply.package,
    result: { executionStatus: 'completed', summary: 'applied' },
  });

  const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
  assert.equal(review.package.run.action, 'review-apply');
  await admitActionResult({
    repoRoot: root,
    deliveryId,
    actionPackage: review.package,
    result: {
      executionStatus: 'completed',
      summary: 'approved',
      reviewVerdict: 'approved',
      reviewFindings: [],
    },
  });

  await recordOwnerDecision(root, {
    decision: 'authorize-archive',
    changeId,
    sourceRef: 'owner:b1-test:authorize-archive',
  });
  assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'archive' });
}

async function markFixtureChangeCompleted(root: string, deliveryId: string, changeId: string) {
  const manifest = join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
  const current = await readFile(manifest, 'utf8');
  const expected = [
    `    id: ${changeId}`,
    '    goal: "Lean Run fixture"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
  ].join('\n');
  const replacement = expected.replace('    state: active', '    state: completed');
  assert.ok(current.includes(expected));
  await writeFile(manifest, current.replace(expected, replacement), 'utf8');
}

describe('E2 post-checkpoint three-file writer', () => {
  it('does not activate from a subject-only E2 checkpoint', async () => {
    const { apply } = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', subjectOnlyE2: true });
    assert.equal('compactEntryWorkspaceIdentity' in apply, false);
    assert.equal('entryWorkspaceIdentity' in apply, true);
  });

  it('does not activate from full trailers when checkpoint-time Owner authority is absent', async () => {
    const { apply } = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', unauthorizedE2: true });
    assert.equal('compactEntryWorkspaceIdentity' in apply, false);
    assert.equal('entryWorkspaceIdentity' in apply, true);
  });

  it('keeps the original strict E2 checkpoint as the shared anchor when a later duplicate exists', async () => {
    const { root, originalE2Checkpoint, apply } = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', postE2Writer: true, duplicateE2: true });
    assert.ok(originalE2Checkpoint);
    assert.equal(await resolveOriginalStrictE2Checkpoint(root), originalE2Checkpoint);
    assert.equal('compactEntryWorkspaceIdentity' in apply, true);
  });

  it('uses the current three-file writer in a fresh repository without Flowkit migration history', async () => {
    const { root, deliveryId, changeId, changeRoot, apply } = await prepareV5ApplyReady({
      changeId: 'fresh-downstream-consumer',
      freshConsumer: true,
    });
    const gitSubjects = (await execFileAsync('git', ['log', '--format=%s'], { cwd: root })).stdout;
    assert.doesNotMatch(gitSubjects, /chore\(flowkit\): start 20260810-01-change-execution-loop/);
    assert.equal(apply.run.action, 'apply');
    assert.equal('compactEntryWorkspaceIdentity' in apply, true);
    const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, apply.run.runId);
    assert.deepEqual((await readdir(runDir)).sort(), ['action.md', 'context.json']);
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 2;\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n', 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: { executionStatus: 'completed', summary: 'applied' }, verificationExecutor: fixtureVerificationExecutor('passed'), openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) });
    assert.deepEqual((await readdir(runDir)).sort(), ['action.md', 'context.json', 'result.json']);
  });

  it('keeps the post-E2 three-file writer active across the later Delivery Start and terminal admission', async () => {
    const { root, deliveryId, changeId, changeRoot, apply } = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', postE2Writer: true });
    const gitSubjects = (await execFileAsync('git', ['log', '--format=%s'], { cwd: root })).stdout;
    assert.match(gitSubjects, /chore\(flowkit\): start 20260810-01-change-execution-loop/);
    assert.match(gitSubjects, new RegExp(`chore\\(flowkit\\): start ${deliveryId}`));
    assert.equal(apply.run.action, 'apply');
    assert.equal('compactEntryWorkspaceIdentity' in apply, true);
    const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, apply.run.runId);
    assert.deepEqual((await readdir(runDir)).sort(), ['action.md', 'context.json']);
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 2;\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n', 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: { executionStatus: 'completed', summary: 'applied' }, verificationExecutor: fixtureVerificationExecutor('passed'), openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) });
    assert.deepEqual((await readdir(runDir)).sort(), ['action.md', 'context.json', 'result.json']);
    const result = JSON.parse(await readFile(join(runDir, 'result.json'), 'utf8')) as { terminalBinding?: { currentVerification?: { logicalRef: string } } };
    assert.equal(result.terminalBinding?.currentVerification?.logicalRef, `openspec/changes/${changeId}/verification.md`);
    assert.match(await readFile(join(changeRoot, 'verification.md'), 'utf8'), /flowkit-change-verification-status: passed/);
  });

  it('covers the prospective crash window from entry through verification publication and terminal replay', async () => {
    const { root, deliveryId, changeId, changeRoot, apply } = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', postE2Writer: true });
    const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, apply.run.runId);

    // Crash point 1: entry was durably prepared before any Action mutation.
    assert.equal((await resumeRun({ repoRoot: root, deliveryId, expectedRunId: apply.run.runId })).kind, 'pending');
    assert.deepEqual((await readdir(runDir)).sort(), ['action.md', 'context.json']);

    // Crash point 2: Action mutation is declaration-covered but Verification has not run.
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 2;\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n', 'utf8');
    assert.equal((await resumeRun({ repoRoot: root, deliveryId, expectedRunId: apply.run.runId })).kind, 'pending');

    // Crash point 3: executor failure leaves the Run pending and does not manufacture a terminal.
    const crashingExecutor: VerificationSelectionExecutor = async () => { throw new Error('fixture verification crash'); };
    await assert.rejects(
      admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: { executionStatus: 'completed', summary: 'applied' }, verificationExecutor: crashingExecutor, openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) }),
      /fixture verification crash/,
    );
    await assert.rejects(readFile(join(runDir, 'result.json'), 'utf8'));
    assert.equal((await resumeRun({ repoRoot: root, deliveryId, expectedRunId: apply.run.runId })).kind, 'pending');

    // Crash point 4: Markdown alone is inside the pending publication window and is not Verification authority.
    await writeFile(join(changeRoot, 'verification.md'), '<!-- flowkit-change-verification-status: passed -->\n\n# Interrupted publication\n', 'utf8');
    const pendingFacts = await snapshot(root, deliveryId);
    assert.equal(pendingFacts.changeVerificationStatus, undefined);
    assert.equal(pendingFacts.conflicts.length, 0);

    // Successful retry publishes the exact terminal binding. Crash point 5: terminal replay is idempotent.
    const logicalResult = { executionStatus: 'completed' as const, summary: 'applied' };
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: logicalResult, verificationExecutor: fixtureVerificationExecutor('passed'), openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) });
    const terminalBytes = await readFile(join(runDir, 'result.json'), 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: logicalResult, verificationExecutor: fixtureVerificationExecutor('passed'), openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) });
    assert.equal(await readFile(join(runDir, 'result.json'), 'utf8'), terminalBytes);
    assert.equal((await snapshot(root, deliveryId)).changeVerificationStatus, 'passed');
  });

  it('fails closed for prospective undeclared mutation, Base drift, Owner drift, and mixed persistence shape', async () => {
    const undeclared = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', postE2Writer: true });
    await writeFile(join(undeclared.root, 'README.md'), 'undeclared\n', 'utf8');
    await assert.rejects(
      resumeRun({ repoRoot: undeclared.root, deliveryId: undeclared.deliveryId, expectedRunId: undeclared.apply.run.runId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'UNDECLARED_ACTION_MUTATION',
    );

    const baseDrift = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', postE2Writer: true });
    await execFileAsync('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '--allow-empty', '-m', 'unexpected boundary'], { cwd: baseDrift.root });
    await assert.rejects(
      resumeRun({ repoRoot: baseDrift.root, deliveryId: baseDrift.deliveryId, expectedRunId: baseDrift.apply.run.runId }),
      (error: unknown) => error instanceof FlowkitError && (error.code === 'POST_ACTION_BASE_DRIFT' || error.code === 'PENDING_INPUT_DRIFT'),
    );

    const ownerDrift = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', postE2Writer: true });
    await recordOwnerDecision(ownerDrift.root, {
      decision: 'contract-reset', changeId: ownerDrift.changeId, scope: 'post-e2-drift', requiredOutcomes: ['new owner contract'], sourceRef: 'owner:post-e2-drift',
    });
    await assert.rejects(
      resumeRun({ repoRoot: ownerDrift.root, deliveryId: ownerDrift.deliveryId, expectedRunId: ownerDrift.apply.run.runId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );

    const mixed = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', postE2Writer: true });
    const mixedRunDir = join(mixed.root, '.flowkit', 'runs', mixed.deliveryId, mixed.changeId, mixed.apply.run.runId);
    const mixedContext = JSON.parse(await readFile(join(mixedRunDir, 'context.json'), 'utf8')) as Record<string, unknown>;
    mixedContext['entryWorkspaceIdentity'] = { canonicalBase: 'a'.repeat(40), workspaceFingerprint: 'b'.repeat(64) };
    await writeFile(join(mixedRunDir, 'context.json'), `${JSON.stringify(mixedContext, null, 2)}\n`, 'utf8');
    await assert.rejects(
      resumeRun({ repoRoot: mixed.root, deliveryId: mixed.deliveryId, expectedRunId: mixed.apply.run.runId }),
      /exactly one legacy or compact entry workspace identity/,
    );
  });

  it('makes revise-apply the current prospective publication while preserving the prior Apply terminal bytes', async () => {
    const { root, deliveryId, changeId, changeRoot, apply, now } = await prepareV5ApplyReady({ changeId: 'archive-and-checkpoint-boundary', postE2Writer: true });
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 2;\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n', 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: { executionStatus: 'completed', summary: 'applied' }, verificationExecutor: fixtureVerificationExecutor('passed'), openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) });
    const applyRunDir = join(root, '.flowkit', 'runs', deliveryId, changeId, apply.run.runId);
    const firstResult = await readFile(join(applyRunDir, 'result.json'), 'utf8');
    const firstVerification = await readFile(join(changeRoot, 'verification.md'), 'utf8');

    const review = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'review', now });
    assert.equal(review.kind, 'prepared');
    if (review.kind !== 'prepared') assert.fail('expected review-apply');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: review.package, result: {
      executionStatus: 'completed', summary: 'revise', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'E2-POST-001', severity: 'blocking', blockingAuthority: 'author', title: 'revise', problem: 'fixture', contractRef: 'spec:fixture', invariant: 'fixture', evidence: ['fixture'], impact: 'blocked', requiredOutcome: 'revise', acceptance: ['revised'] }],
    } });
    const revise = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(revise.kind, 'prepared');
    if (revise.kind !== 'prepared') assert.fail('expected revise-apply');
    assert.equal(revise.package.run.action, 'revise-apply');
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 3;\n', 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: revise.package, result: { executionStatus: 'completed', summary: 'revised' }, verificationExecutor: fixtureVerificationExecutor('passed'), openSpecAdapter: fixtureOpenSpecAdapter(root, changeId) });

    const reviseRunDir = join(root, '.flowkit', 'runs', deliveryId, changeId, revise.package.run.runId);
    assert.deepEqual((await readdir(reviseRunDir)).sort(), ['action.md', 'context.json', 'result.json']);
    assert.equal(await readFile(join(applyRunDir, 'result.json'), 'utf8'), firstResult);
    assert.notEqual(await readFile(join(changeRoot, 'verification.md'), 'utf8'), firstVerification);
    const current = await snapshot(root, deliveryId);
    assert.equal(current.changeVerificationStatus, 'passed');
    assert.equal(current.runs.find((run) => run.runId === apply.run.runId)?.status, 'completed');
    assert.equal(current.runs.find((run) => run.runId === revise.package.run.runId)?.status, 'completed');
  });
});

describe('B1 fixed ActionDefinition catalog', () => {
  it('matches the complete 037 normative mapping and excludes Delivery behaviors', () => {
    assert.deepEqual(CHANGE_ACTIONS, [
      'explore', 'review-explore', 'revise-explore',
      'propose', 'review-propose', 'revise-propose',
      'apply', 'review-apply', 'revise-apply', 'archive',
    ]);
    const expected = {
      explore: ['author', 'investigate-change', 'explore-planning-only', 'current-explore-artifact-set'],
      'review-explore': ['reviewer', 'judge-explore', 'reviewer-result-only', 'review-verdict-findings'],
      'revise-explore': ['author', 'close-explore-author-findings', 'explore-planning-revision-only', 'current-explore-artifact-set'],
      propose: ['author', 'freeze-change-contract', 'proposal-bundle-only', 'current-proposal-bundle-set'],
      'review-propose': ['reviewer', 'judge-proposal', 'reviewer-result-only', 'review-verdict-findings'],
      'revise-propose': ['author', 'close-proposal-author-findings', 'proposal-bundle-revision-only', 'current-proposal-bundle-set'],
      apply: ['author', 'implement-approved-contract', 'approved-implementation-and-verification', 'implementation-candidate-and-authority-files'],
      'review-apply': ['reviewer', 'judge-implementation-and-verification', 'reviewer-result-only', 'review-verdict-findings-plus-verification-ref'],
      'revise-apply': ['author', 'close-apply-author-findings', 'implementation-and-verification-revision', 'revised-implementation-candidate'],
      archive: ['author', 'close-change', 'openspec-archive-and-change-completion', 'archive-operation-and-completed-state'],
    } as const;
    for (const action of CHANGE_ACTIONS) {
      const d = ACTION_DEFINITIONS[action];
      assert.equal(d.version, 1);
      assert.deepEqual([d.role, d.goalClass, d.mutationClass, d.outputClass], expected[action]);
      assert.equal(d.terminalContract.gitCheckpointOutputAllowed, false);
    }
    assert.equal('full-test' in ACTION_DEFINITIONS, false);
    assert.equal('delivery-finalize' in ACTION_DEFINITIONS, false);
  });
});

describe('D2 archive terminal continuation regressions', () => {
  it('projects changed-surface pending archive recovery before active OpenSpec status through the B1 service boundary', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(prepared.package.run.action, 'archive');

    await mkdir(join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration'), { recursive: true });
    await writeFile(join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'), '# active\n', 'utf8');
    assert.equal(await inspectPendingArchiveRecoveryBeforeOpenSpec(root, deliveryId), undefined, 'ordinary archive must fall through to normal Policy/preparation');

    const activeRoot = join(root, 'openspec', 'changes', changeId);
    const archivedAs = `2099-02-01-${changeId}`;
    const archivedRoot = join(root, 'openspec', 'changes', 'archive', archivedAs);
    const fakeAdapter = {
      getChangeStatus: async () => ({
        changeId,
        changeRoot: activeRoot,
        changeRootLogical: `openspec/changes/${changeId}`,
        archiveNamespaceRoot: join(root, 'openspec', 'changes', 'archive'),
        archiveNamespaceRootLogical: 'openspec/changes/archive',
      }),
      archiveChange: async () => {
        await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true });
        await rename(activeRoot, archivedRoot);
        return { spawned: true, exitCode: null, stdout: '', stderr: '', timedOut: true };
      },
    } as unknown as OpenSpecCliAdapter;

    const outcome = await invokeOpenSpecArchive(root, prepared.package, { adapter: fakeAdapter });
    assert.equal(outcome.status, 'recovery-required');
    assert.deepEqual(await inspectPendingArchiveRecoveryBeforeOpenSpec(root, deliveryId), {
      runId: prepared.package.run.runId,
      changeId,
      status: 'recovery-required',
      code: 'OPENSPEC_ARCHIVE_RECOVERY_REQUIRED',
      spawned: false,
    });
    await assert.rejects(readFile(join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json'), 'utf8'));
  });

  it('preserves non-default keyed OpenSpec artifact identity without path inference', () => {
    const changeId = 'non-default-layout';
    const view = {
      version: '1.7.0',
      changeId,
      changeRootLogical: `openspec/changes/${changeId}`,
      artifactPaths: {
        proposal: [`openspec/changes/${changeId}/planning/p.md`],
        specs: [`openspec/changes/${changeId}/delta/custom/spec.md`],
        design: [`openspec/changes/${changeId}/architecture/d.md`],
        tasks: [`openspec/changes/${changeId}/work/t.md`],
      },
    } as const;
    const projection = buildArchiveEntryOpenSpecProjection(view);
    assert.deepEqual(projection.artifactPaths, view.artifactPaths);
    assert.equal(
      fingerprintOpenSpecPreparedActionContext(view, 'archive'),
      fingerprintOpenSpecPreparedActionContext({
        version: projection.version,
        changeId: projection.changeId,
        changeRootLogical: projection.changeRootLogical,
        artifactPaths: projection.artifactPaths,
      }, 'archive'),
    );
  });

  it('keeps the active Change authoritative even when another Change has a historical pending archive', async () => {
    const { root, deliveryId, now } = await freshActiveFixture();
    const oldChangeId = 'historical-archive';
    const oldRunId = '20990201-085-archive';
    const oldRunDir = join(root, '.flowkit', 'runs', deliveryId, oldChangeId, oldRunId);
    await mkdir(oldRunDir, { recursive: true });
    await writeFile(join(oldRunDir, 'context.json'), JSON.stringify({
      schemaVersion: 3,
      runId: oldRunId,
      deliveryId,
      changeKey: 'OLD',
      changeId: oldChangeId,
      action: 'archive',
      role: 'author',
      ownerAuthorization: 'explicit',
      semanticInputFingerprint: '0'.repeat(64),
      ownerFactRefs: [],
      runPath: `.flowkit/runs/${deliveryId}/${oldChangeId}/${oldRunId}/`,
    }, null, 2) + '\n', 'utf8');

    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(prepared.package.run.action, 'explore');
    assert.equal(prepared.package.run.changeId, 'lean-run-fixture');
    assert.equal(prepared.package.run.runId, '20990201-086-explore');
  });

  it('fails closed when a durable known-success archive has review semantic drift', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(prepared.package.run.action, 'archive');

    const activeRoot = join(root, 'openspec', 'changes', changeId);
    const archivedAs = `2099-02-01-${changeId}`;
    const archivedRoot = join(root, 'openspec', 'changes', 'archive', archivedAs);
    const fakeAdapter = {
      getChangeStatus: async () => ({
        changeId,
        changeRoot: activeRoot,
        changeRootLogical: `openspec/changes/${changeId}`,
        archiveNamespaceRoot: join(root, 'openspec', 'changes', 'archive'),
        archiveNamespaceRootLogical: 'openspec/changes/archive',
      }),
      archiveChange: async () => {
        await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true });
        await rename(activeRoot, archivedRoot);
        return {
          spawned: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          timedOut: false,
          observation: {
            kind: 'success' as const,
            change: changeId,
            archivedAs,
            path: `openspec/changes/archive/${archivedAs}`,
            specsUpdated: false,
            totals: { added: 0, modified: 0, removed: 0, renamed: 0 },
          },
        };
      },
    } as unknown as OpenSpecCliAdapter;
    const outcome = await invokeOpenSpecArchive(root, prepared.package, { adapter: fakeAdapter });
    assert.equal(outcome.status, 'success');
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    const reviewRef = prepared.package.handoffRefs.find((ref) => ref.ref.includes('review-apply/result.json'));
    assert.ok(reviewRef);
    const reviewPath = join(root, reviewRef.ref);
    const reviewResult = JSON.parse(await readFile(reviewPath, 'utf8')) as { actionResult: { summary: string } };
    reviewResult.actionResult.summary = 'semantically drifted review result';
    await writeFile(reviewPath, JSON.stringify(reviewResult, null, 2) + '\n', 'utf8');

    await assert.rejects(
      recoverArchiveTerminalRun({ repoRoot: root, deliveryId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    await assert.rejects(readFile(join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json'), 'utf8'));
  });

  it('rejects archive-terminal recovery when more than one durable known-success pending archive exists', async () => {
    const { root, deliveryId } = await freshActiveFixture();
    for (const [index, changeId] of ['old-a', 'old-b'].entries()) {
      const runId = `20990201-${String(85 + index).padStart(3, '0')}-archive`;
      const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, 'context.json'), JSON.stringify({
        schemaVersion: 3,
        runId,
        deliveryId,
        changeKey: `OLD${index + 1}`,
        changeId,
        action: 'archive',
        role: 'author',
        ownerAuthorization: 'explicit',
        semanticInputFingerprint: String(index + 1).repeat(64),
        ownerFactRefs: [],
        runPath: `.flowkit/runs/${deliveryId}/${changeId}/${runId}/`,
        archiveMutationGuard: {
          state: 'armed',
          surfaceVersion: 'openspec-archive-mutation-v1',
          changeRoot: `openspec/changes/${changeId}`,
          canonicalSpecsRoot: 'openspec/specs',
          archiveNamespaceRoot: 'openspec/changes/archive',
          preArchiveGenerationFingerprint: index === 0 ? 'a'.repeat(64) : 'b'.repeat(64),
          terminalObservation: {
            kind: 'success',
            resultFingerprint: index === 0 ? 'c'.repeat(64) : 'd'.repeat(64),
            normalized: {
              kind: 'success',
              change: changeId,
              archivedAs: `2099-02-01-${changeId}`,
              path: `openspec/changes/archive/2099-02-01-${changeId}`,
              specsUpdated: false,
              totals: { added: 0, modified: 0, removed: 0, renamed: 0 },
            },
          },
        },
      }, null, 2) + '\n', 'utf8');
    }

    await assert.rejects(
      recoverArchiveTerminalRun({ repoRoot: root, deliveryId }),
      (error: unknown) => error instanceof FlowkitError
        && error.code === 'OPENSPEC_ARCHIVE_TERMINAL_RECOVERY_NOT_ALLOWED'
        && /found 2/.test(error.message),
    );
  });
});

describe('B1 preparation and admission', () => {
  it('creates one Delivery-wide Run then resumes the same pending semantic input', async () => {
    const { root, deliveryId, now } = await freshActiveFixture();
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const second = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.resumed, false);
    assert.equal(second.resumed, true);
    assert.equal(second.package.run.runId, first.package.run.runId);
    assert.equal(second.package.run.semanticInputFingerprint, first.package.run.semanticInputFingerprint);
    assert.match(first.package.run.semanticInputFingerprint, /^[0-9a-f]{64}$/);
  });

  it('fails closed on contractRef version drift without publishing a second pending Run', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await writeFile(join(root, 'openspec', 'changes', changeId, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-02-02\n', 'utf8');
    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const s = await snapshot(root, deliveryId);
    assert.deepEqual(s.runs.filter((run) => run.status === 'pending').map((run) => run.runId), [first.package.run.runId]);
  });

  it('admits logical result after legitimate Action output mutation and Core derives artifact refs', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore exact bytes\n', 'utf8');
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: prepared.package,
      result: {
        executionStatus: 'completed',
        summary: 'done',
        // Runtime extra authority-shaped fields are deliberately not forwarded.
        producedResultRefs: [{ ref: 'forged' }],
      } as never,
    });
    const raw = JSON.parse(await readFile(join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json'), 'utf8'));
    assert.equal(raw.actionResult.producedResultRefs.length, 1);
    assert.equal(raw.actionResult.producedResultRefs[0].ref, `openspec/changes/${changeId}/explore.md`);
    assert.notEqual(raw.actionResult.producedResultRefs[0].ref, 'forged');
  });

  it('keeps blocked next while explicit review creates a new same-stage Reviewer generation', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await completeExplore(root, deliveryId, changeId, now);
    const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(review.package.run.action, 'review-explore');
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: review.package,
      result: {
        executionStatus: 'completed',
        summary: 'owner blocker',
        reviewVerdict: 'changes-requested',
        reviewFindings: [{
          id: 'B1-T-OWNER',
          severity: 'blocking',
          title: 'Owner fact required',
          problem: 'Owner fact is not available yet.',
          contractRef: 'spec:owner-authority',
          invariant: 'Owner fact must exist before progress.',
          evidence: ['fixture has no Owner fact'],
          impact: 'review remains blocked',
          blockingAuthority: 'owner',
          requiredOutcome: 'Owner supplies the required fact.',
          acceptance: ['Owner fact is admitted.'],
        }],
        reviewFindingConvergence: [],
      },
    });
    const blocked = next(await snapshot(root, deliveryId));
    assert.equal(blocked.kind, 'blocked');
    const direct = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'review', now });
    assert.equal(direct.package.run.action, 'review-explore');
    assert.equal(direct.package.run.role, 'reviewer');
    assert.notEqual(direct.package.run.runId, review.package.run.runId);
    assert.match(direct.package.run.runId, /-003-review-explore$/);
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'review', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, direct.package.run.runId);
  });

  it('failed execution retries as a new Run/NNN without provider-session identity', async () => {
    const { root, deliveryId, now } = await freshActiveFixture();
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: first.package,
      result: { failureDiagnosis: 'simulated failure' },
    });
    const retry = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(retry.resumed, false);
    assert.notEqual(retry.package.run.runId, first.package.run.runId);
    assert.match(retry.package.run.runId, /-002-explore$/);
    assert.equal('providerSession' in retry.package.run, false);
  });

  it('Apply package carries exact Owner ref and remains Change-only/minimal', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const apply = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(apply.package.run.action, 'apply');
    assert.equal(apply.package.ownerAuthorizationRefs.length, 1);
    assert.equal(apply.package.ownerAuthorizationRefs[0]?.decision, 'authorize-apply');
    assert.equal(apply.package.ownerAuthorizationRefs[0]?.changeId, changeId);
    assert.ok(apply.package.contractRefs.every((ref) => /^[0-9a-f]{64}$/.test(ref.versionFingerprint)));
    const serialized = JSON.stringify(apply.package);
    assert.doesNotMatch(serialized, /provider|transcript|stdout|git history/i);
  });
  it('rejects a tampered contractRef even when caller preserves the old fingerprint', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const forged = {
      ...structuredClone(prepared.package),
      contractRefs: prepared.package.contractRefs.map((ref, index) =>
        index === 0 ? { ...ref, versionFingerprint: 'f'.repeat(64) } : ref
      ),
    };
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n', 'utf8');
    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: forged,
        result: { executionStatus: 'completed', summary: 'forged' },
      }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const resultPath = join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json');
    await assert.rejects(readFile(resultPath, 'utf8'));
  });

  it('rejects tampered authority identity outside contractRefs before terminal publication', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const forged = {
      ...structuredClone(prepared.package),
      ownerAuthorizationRefs: prepared.package.ownerAuthorizationRefs.map((ref, index) =>
        index === 0 ? { ...ref, sourceRef: `${ref.sourceRef}:forged` } : ref
      ),
    };
    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: forged,
        result: { executionStatus: 'completed', summary: 'forged owner identity' },
      }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const resultPath = join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json');
    await assert.rejects(readFile(resultPath, 'utf8'));
  });


  it('still fails closed when immutable approved proposal content drifts during pending Apply', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'apply');
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal externally drifted\n', 'utf8');
    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const pending = (await snapshot(root, deliveryId)).runs.filter((run) => run.status === 'pending');
    assert.deepEqual(pending.map((run) => run.runId), [first.package.run.runId]);
  });

  it('resumes the same pending Apply after Action-owned tasks and verification progress', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'apply');
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] implementation progress\n', 'utf8');
    await writeFile(
      join(changeRoot, 'verification.md'),
      '<!-- flowkit-change-verification-status: passed -->\n\n# Verification\n',
      'utf8',
    );
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);
    assert.equal(resumed.package.run.semanticInputFingerprint, first.package.run.semanticInputFingerprint);
    assert.deepEqual(resumed.package.contractRefs, first.package.contractRefs);
    assert.equal(resumed.package.verificationView, undefined);
  });

  it('resumes the same pending revise-apply after its own tasks and verification mutations', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const apply = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] applied\n', 'utf8');
    await writeFile(
      join(changeRoot, 'verification.md'),
      '<!-- flowkit-change-verification-status: passed -->\n\n# Verification v1\n',
      'utf8',
    );
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: apply.package,
      result: { executionStatus: 'completed', summary: 'applied' },
    });

    const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(review.package.run.action, 'review-apply');
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: review.package,
      result: {
        executionStatus: 'completed',
        summary: 'changes requested',
        reviewVerdict: 'changes-requested',
        reviewFindings: [{
          id: 'B1-T-APPLY',
          severity: 'blocking',
          title: 'Author fix required',
          problem: 'fixture',
          contractRef: 'spec:apply',
          invariant: 'Implementation must satisfy the approved contract.',
          evidence: ['fixture implementation mismatch'],
          impact: 'apply cannot be approved',
          requiredOutcome: 'Fix the fixture implementation.',
          acceptance: ['The fixture implementation is corrected.'],
          blockingAuthority: 'author',
        }],
        reviewFindingConvergence: [],
      },
    });

    const revise = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(revise.package.run.action, 'revise-apply');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] revised\n', 'utf8');
    await writeFile(
      join(changeRoot, 'verification.md'),
      '<!-- flowkit-change-verification-status: passed -->\n\n# Verification v2\n',
      'utf8',
    );
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, revise.package.run.runId);
    assert.deepEqual(resumed.package.contractRefs, revise.package.contractRefs);
    assert.deepEqual(resumed.package.verificationView, revise.package.verificationView);
  });


  it('fails closed when pending review-explore target bytes drift outside Reviewer mutation boundary', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await completeExplore(root, deliveryId, changeId, now);
    const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(review.package.run.action, 'review-explore');

    await writeFile(
      join(root, 'openspec', 'changes', changeId, 'explore.md'),
      '# Explore externally drifted after review entry\n',
      'utf8',
    );
    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const pending = (await snapshot(root, deliveryId)).runs.filter((run) => run.status === 'pending');
    assert.deepEqual(pending.map((run) => run.runId), [review.package.run.runId]);
  });

  it('fails closed when pending review-propose target bytes drift outside Reviewer mutation boundary', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await completeExplore(root, deliveryId, changeId, now);

    const reviewExplore = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: reviewExplore.package,
      result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] },
    });

    const propose = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n', 'utf8');
    await writeFile(join(changeRoot, 'design.md'), '# Design\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n', 'utf8');
    await mkdir(join(changeRoot, 'specs', 'cap-a'), { recursive: true });
    await writeFile(
      join(changeRoot, 'specs', 'cap-a', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: X\nX MUST work.\n\n#### Scenario: X\n- **WHEN** x\n- **THEN** y\n',
      'utf8',
    );
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: propose.package,
      result: { executionStatus: 'completed', summary: 'proposed' },
    });

    const review = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(review.package.run.action, 'review-propose');
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal externally drifted\n', 'utf8');

    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    const pending = (await snapshot(root, deliveryId)).runs.filter((run) => run.status === 'pending');
    assert.deepEqual(pending.map((run) => run.runId), [review.package.run.runId]);
  });

  it('resumes the exact pending archive after Action-owned OpenSpec relocation', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);

    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'archive');
    const activeRoot = join(root, 'openspec', 'changes', changeId);
    const archivedRoot = join(root, 'openspec', 'changes', 'archive', `2099-02-01-${changeId}`);
    await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true });
    await rename(activeRoot, archivedRoot);
    // OpenSpec relocation and Manifest completion are one archive mutation
    // boundary; a post-relocation continuation is checkpoint-relevant only
    // after the Change has closed.
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);
    assert.equal(resumed.package.run.semanticInputFingerprint, first.package.run.semanticInputFingerprint);
  });

  it('resumes the exact pending archive after Action-owned Change completed progress', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);

    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'archive');
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);
  });

  it('does not create a new archive Run after completion when no pending archive identity exists', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'RUN_PREPARATION_NOT_ALLOWED',
    );
    const pendingArchive = (await snapshot(root, deliveryId)).runs.filter(
      (run) => run.status === 'pending' && run.action === 'archive',
    );
    assert.deepEqual(pendingArchive, []);
  });

  it('keeps current C1 self-archive resumable after canonical spec merge and active root relocation', async () => {
    const c1Id = 'openspec-1-7-thin-integration';
    const { root, deliveryId, changeId, now } = await freshActiveFixture({ changeId: c1Id });
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'archive');

    const activeRoot = join(root, 'openspec', 'changes', changeId);
    const archivedRoot = join(root, 'openspec', 'changes', 'archive', `2099-02-01-${changeId}`);
    await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true });
    await rename(activeRoot, archivedRoot);
    const canonicalC1 = join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md');
    await mkdir(join(canonicalC1, '..'), { recursive: true });
    await writeFile(canonicalC1, '# canonical C1 capability now exists\n', 'utf8');
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    // If the global structured reader were enabled merely by canonical spec
    // existence, this would attempt to query the now-relocated active C1.
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);

    for (const command of ['status', 'doctor', 'resume-context'] as const) {
      const result = await runCli({ argv: [command], cwd: root });
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, new RegExp(`pending-run: ${first.package.run.runId}`));
      assert.match(result.stdout, /pending-action: archive/);
    }

    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: resumed.package,
      result: { executionStatus: 'completed', summary: 'C1 self-archive completed' },
    });
    const terminal = JSON.parse(await readFile(
      join(root, '.flowkit', 'runs', deliveryId, changeId, first.package.run.runId, 'result.json'),
      'utf8',
    )) as { runStatus: string };
    assert.equal(terminal.runStatus, 'completed');
  });

  it('admits terminal result for the exact persisted pending archive after Change completed progress', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const first = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(first.package.run.action, 'archive');

    const activeRoot = join(root, 'openspec', 'changes', changeId);
    const archivedRoot = join(root, 'openspec', 'changes', 'archive', `2099-02-01-${changeId}`);
    await mkdir(join(root, 'openspec', 'changes', 'archive'), { recursive: true });
    await rename(activeRoot, archivedRoot);
    await markFixtureChangeCompleted(root, deliveryId, changeId);
    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, first.package.run.runId);

    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: resumed.package,
      result: { executionStatus: 'completed', summary: 'archive completed' },
    });
    const resultPath = join(root, '.flowkit', 'runs', deliveryId, changeId, first.package.run.runId, 'result.json');
    const terminal = JSON.parse(await readFile(resultPath, 'utf8')) as { runStatus: string };
    assert.equal(terminal.runStatus, 'completed');
  });

  it('rejects fabricated completed archive admission when the persisted pending identity is gone', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(prepared.package.run.action, 'archive');
    const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId);
    await rm(runDir, { recursive: true, force: true });
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: prepared.package,
        result: { executionStatus: 'completed', summary: 'fabricated archive' },
      }),
    );
    assert.equal((await inspectPreparedRun(root, deliveryId)).status, 'none');
  });

  it('keeps non-archive terminal admission bound to the active Change', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToApplyReady(root, deliveryId, changeId, now);
    const apply = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(apply.package.run.action, 'apply');
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: apply.package,
        result: { executionStatus: 'completed', summary: 'must reject' },
      }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
  });

  it('projects the same persisted pending archive through inspect/status/doctor/resume-context after completion', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    const inspection = await inspectPreparedRun(root, deliveryId);
    assert.deepEqual(inspection, {
      runId: prepared.package.run.runId,
      action: 'archive',
      role: 'author',
      status: 'resumable',
    });

    for (const command of ['status', 'doctor', 'resume-context'] as const) {
      const result = await runCli({ argv: [command], cwd: root });
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, new RegExp(`pending-run: ${prepared.package.run.runId}`));
      assert.match(result.stdout, /pending-action: archive/);
      assert.match(result.stdout, /pending-role: author/);
      assert.match(result.stdout, /pending-resume: resumable/);
    }
  });

  it('keeps completed diagnostics at none when no pending archive exists', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await advanceToArchiveReady(root, deliveryId, changeId, now);
    await markFixtureChangeCompleted(root, deliveryId, changeId);

    assert.deepEqual(await inspectPreparedRun(root, deliveryId), { status: 'none' });
    for (const command of ['status', 'doctor', 'resume-context'] as const) {
      const result = await runCli({ argv: [command], cwd: root });
      assert.equal(result.exitCode, 0);
      assert.doesNotMatch(result.stdout, /pending-run:/);
    }
  });


});

describe('D1 structured Owner facts and reset-aware lineage', () => {
  it('projects latest Contract Reset into context/package and fails pending admission when the Owner fact changes', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    const firstReset = await recordOwnerDecision(root, {
      decision: 'contract-reset',
      changeId,
      scope: 'D1/current-contract',
      requiredOutcomes: ['PowerShell first-class', 'structured Owner handoff', 'PowerShell first-class'],
      sourceRef: 'owner:d1-reset:1',
    });
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(prepared.package.ownerFactRefs?.length, 1);
    assert.equal(prepared.package.ownerFactRefs?.[0]?.ref, firstReset.ownerDecisionRef);
    assert.deepEqual(prepared.package.ownerFactRefs?.[0]?.requiredOutcomes, ['PowerShell first-class', 'structured Owner handoff']);
    const context = JSON.parse(await readFile(join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'context.json'), 'utf8'));
    assert.equal(context.schemaVersion, 4);
    assert.deepEqual(context.ownerFactRefs, prepared.package.ownerFactRefs);

    await recordOwnerDecision(root, {
      decision: 'contract-reset',
      changeId,
      scope: 'D1/current-contract',
      requiredOutcomes: ['PowerShell first-class', 'structured Owner handoff v2'],
      sourceRef: 'owner:d1-reset:2',
    });
    await assert.rejects(
      prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );
    await assert.rejects(
      admitActionResult({
        repoRoot: root,
        deliveryId,
        actionPackage: prepared.package,
        result: { executionStatus: 'completed', summary: 'stale Owner fact' },
      }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'PENDING_INPUT_DRIFT',
    );

    assert.equal((await inspectPreparedRun(root, deliveryId)).status, 'recovery-required');
    const recovered = await recoverContractResetPendingRun({ repoRoot: root, deliveryId });
    assert.deepEqual(recovered, {
      runId: prepared.package.run.runId,
      action: 'explore',
      status: 'cancelled',
      cancellationReason: 'superseded-by-owner-contract-reset',
    });
    const cancelledResult = JSON.parse(await readFile(join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json'), 'utf8'));
    assert.equal(cancelledResult.runStatus, 'cancelled');
    assert.equal(cancelledResult.cancellationReason, 'superseded-by-owner-contract-reset');
    assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'explore' });

    const replacement = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(replacement.package.run.action, 'explore');
    assert.notEqual(replacement.package.run.runId, prepared.package.run.runId);
    assert.equal(replacement.package.ownerFactRefs?.[0]?.ref, (await snapshot(root, deliveryId)).ownerDecisionFacts?.filter((fact) => fact.decision === 'contract-reset').at(-1)?.ref);
  });

  it('exposes exact CLI recovery but rejects reset recovery when non-Owner semantic input also drifted', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await recordOwnerDecision(root, {
      decision: 'contract-reset',
      changeId,
      scope: 'D1/current-contract',
      requiredOutcomes: ['new contract'],
      sourceRef: 'owner:d1-reset:cli',
    });
    const cli = await runCli({ argv: ['recover', 'contract-reset-pending'], cwd: root });
    assert.equal(cli.exitCode, 0);
    assert.match(cli.stdout, /superseded-by-owner-contract-reset/);

    const nextRun = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.notEqual(nextRun.package.run.runId, prepared.package.run.runId);
    await recordOwnerDecision(root, {
      decision: 'contract-reset',
      changeId,
      scope: 'D1/current-contract',
      requiredOutcomes: ['newer contract'],
      sourceRef: 'owner:d1-reset:cli:2',
    });
    await writeFile(join(root, 'openspec', 'changes', changeId, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-02-02\n', 'utf8');
    await assert.rejects(
      recoverContractResetPendingRun({ repoRoot: root, deliveryId }),
      (error: unknown) => error instanceof FlowkitError && error.code === 'RESET_PENDING_RECOVERY_NOT_ALLOWED',
    );
  });

  it('replaces an approved proposal generation after Contract Reset without inheriting its approval or findings', async () => {
    const { root, deliveryId, changeId, now } = await freshActiveFixture();
    await completeExplore(root, deliveryId, changeId, now);
    const reviewExplore = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: reviewExplore.package,
      result: { executionStatus: 'completed', summary: 'approved explore', reviewVerdict: 'approved', reviewFindings: [] },
    });
    const p1 = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal P1\n', 'utf8');
    await writeFile(join(changeRoot, 'design.md'), '# Design P1\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks P1\n', 'utf8');
    await mkdir(join(changeRoot, 'specs', 'cap-a'), { recursive: true });
    await writeFile(join(changeRoot, 'specs', 'cap-a', 'spec.md'), '## ADDED Requirements\n\n### Requirement: X\nX MUST work.\n\n#### Scenario: X\n- **WHEN** x\n- **THEN** y\n', 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: p1.package, result: { executionStatus: 'completed', summary: 'P1' } });
    const r1 = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: r1.package,
      result: { executionStatus: 'completed', summary: 'R1 approved', reviewVerdict: 'approved', reviewFindings: [] },
    });
    assert.equal(next(await snapshot(root, deliveryId)).kind, 'owner-decision');
    const oldApplyAuthorization = await recordOwnerDecision(root, {
      decision: 'authorize-apply',
      changeId,
      sourceRef: 'owner:d1-reset:proposal:old-apply',
    });
    assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'apply' });

    await recordOwnerDecision(root, {
      decision: 'contract-reset',
      changeId,
      scope: 'D1/proposal-contract',
      requiredOutcomes: ['replace proposal generation'],
      sourceRef: 'owner:d1-reset:proposal',
    });
    assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'propose' });
    assert.equal((await snapshot(root, deliveryId)).ownerAuthorizations.some((fact) => fact.ref === oldApplyAuthorization.ownerDecisionRef), false);

    const p2 = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(p2.package.run.action, 'propose');
    assert.notEqual(p2.package.run.runId, p1.package.run.runId);
    assert.equal(p2.package.reviewView?.reviewRunId, reviewExplore.package.run.runId);
    assert.equal(p2.package.ownerFactRefs?.length, 1);
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal P2\n', 'utf8');
    await writeFile(join(changeRoot, 'design.md'), '# Design P2\n', 'utf8');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks P2\n', 'utf8');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: p2.package, result: { executionStatus: 'completed', summary: 'P2' } });

    const r2 = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', now });
    assert.equal(r2.package.run.action, 'review-propose');
    assert.equal(r2.package.run.runId === r1.package.run.runId, false);
    assert.equal(r2.package.reviewView, undefined);
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: r2.package,
      result: { executionStatus: 'completed', summary: 'R2 approved', reviewVerdict: 'approved', reviewFindings: [] },
    });
    const after = await snapshot(root, deliveryId);
    assert.equal(after.runs.find((run) => run.runId === p1.package.run.runId)?.status, 'completed');
    assert.equal(after.runs.find((run) => run.runId === r1.package.run.runId)?.status, 'completed');
    const boundary = next(after);
    assert.equal(boundary.kind, 'owner-decision');
    if (boundary.kind === 'owner-decision') assert.equal(boundary.decision, 'authorize-apply');
    const newApplyAuthorization = await recordOwnerDecision(root, {
      decision: 'authorize-apply',
      changeId,
      sourceRef: 'owner:d1-reset:proposal:new-apply',
    });
    assert.notEqual(newApplyAuthorization.ownerDecisionRef, oldApplyAuthorization.ownerDecisionRef);
    assert.deepEqual(next(await snapshot(root, deliveryId)), { kind: 'action', action: 'apply' });
  });
});
