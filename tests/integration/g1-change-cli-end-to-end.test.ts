import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { after, afterEach, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ownerDecisionRefFor } from '../../src/domain/owner-provenance.js';
import { OpenSpecCliAdapter } from '../../src/integrations/openspec/openspec-cli-adapter.js';
import { admitOpenSpecArchiveRecovery, invokeOpenSpecArchive } from '../../src/integrations/openspec/openspec-archive-service.js';
import { DeliveryManifestDocument } from '../../src/persistence/delivery-manifest-document.js';
import { prepareActionExecution } from '../../src/services/b1-run-execution-service.js';
import { createTempDir } from '../fixtures/helpers.js';

const exec = promisify(execFile);
const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '../..');
const binPath = resolve(projectRoot, 'src/bin/flowkit.ts');
const tsxLoaderUrl = pathToFileURL(resolve(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href;
const roots: string[] = [];
const templateRoots: string[] = [];
const g1FixtureSource = join(projectRoot, 'openspec', 'changes', 'archive', '2026-08-15-change-cli-end-to-end-and-performance');
const openSpecPropagation: NodeJS.ProcessEnv = process.env['FLOWKIT_HOME'] !== undefined
  ? { FLOWKIT_HOME: process.env['FLOWKIT_HOME'] }
  : process.env['FLOWKIT_OPENSPEC_BIN'] !== undefined
    ? { FLOWKIT_OPENSPEC_BIN: process.env['FLOWKIT_OPENSPEC_BIN'] }
    : (() => { throw new Error('FLOWKIT_HOME managed OpenSpec or legacy FLOWKIT_OPENSPEC_BIN is required for G1 real-process coverage'); })();
let boundaryTemplatesPromise: Promise<{ explore: string; approvedProposal: string }> | undefined;
let realCliInvocationCount = 0;

interface ProcResult { readonly code: number; readonly stdout: string; readonly stderr: string }

function cli(root: string, args: readonly string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<ProcResult> {
  realCliInvocationCount += 1;
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['--import', tsxLoaderUrl, binPath, ...args], {
      cwd: root,
      env: { ...process.env, ...openSpecPropagation, ...extraEnv, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => { resolveResult({ code: code ?? -1, stdout, stderr }); });
  });
}

function json(result: ProcResult): Record<string, unknown> {
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

async function resultFile(payload: unknown): Promise<string> {
  const dir = await createTempDir();
  roots.push(dir);
  const path = join(dir, 'result.json');
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  return path;
}

async function gitInit(root: string, deliveryId: string): Promise<string> {
  await exec('git', ['init'], { cwd: root });
  await exec('git', ['add', '.'], { cwd: root });
  await exec('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', `chore(flowkit): start ${deliveryId}`], { cwd: root });
  return (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
}

async function baseFixture(options: { changeId?: string; deliveryId?: string; state?: 'active' | 'planned' } = {}) {
  const root = await createTempDir();
  roots.push(root);
  const changeId = options.changeId ?? 'change-cli-end-to-end-and-performance';
  const deliveryId = options.deliveryId ?? '20990401-01-cli-e2e';
  const state = options.state ?? 'active';
  await mkdir(join(root, '.flowkit', 'runs', deliveryId), { recursive: true });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes', changeId), { recursive: true });
  await writeFile(join(root, 'openspec', 'changes', changeId, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-04-01\n');
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: G1',
    `    id: ${changeId}`,
    '    goal: "CLI E2E fixture"',
    '    required: true',
    '    dependsOn: []',
    `    state: ${state}`,
    '    architectureImpact: false',
    '    outputs: []',
    '',
  ].join('\n'));
  const base = await gitInit(root, deliveryId);
  return { root, changeId, deliveryId, base };
}

async function enableThinIntegration(root: string): Promise<void> {
  await mkdir(join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration'), { recursive: true });
  await cp(
    join(projectRoot, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'),
    join(root, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'),
  );
}

async function copyExplore(root: string, changeId: string): Promise<void> {
  await cp(
    join(g1FixtureSource, 'explore.md'),
    join(root, 'openspec', 'changes', changeId, 'explore.md'),
  );
}

async function copyProposalSet(root: string, changeId: string, options: { invalidSpec?: boolean } = {}): Promise<void> {
  const source = g1FixtureSource;
  const target = join(root, 'openspec', 'changes', changeId);
  await cp(join(source, 'proposal.md'), join(target, 'proposal.md'));
  let design = await readFile(join(source, 'design.md'), 'utf8');
  if (changeId !== 'change-cli-end-to-end-and-performance') {
    design = design.replaceAll('change-cli-end-to-end-and-performance', changeId);
  }
  await writeFile(join(target, 'design.md'), design);
  await mkdir(join(target, 'specs', 'flowkit-change-cli-end-to-end-and-performance'), { recursive: true });
  const spec = options.invalidSpec
    ? '# invalid strict spec\n'
    : await readFile(join(source, 'specs', 'flowkit-change-cli-end-to-end-and-performance', 'spec.md'), 'utf8');
  await writeFile(join(target, 'specs', 'flowkit-change-cli-end-to-end-and-performance', 'spec.md'), spec);
  let tasks = await readFile(join(source, 'tasks.md'), 'utf8');
  if (changeId !== 'change-cli-end-to-end-and-performance') tasks = tasks.replaceAll('change-cli-end-to-end-and-performance', changeId);
  await writeFile(join(target, 'tasks.md'), tasks);
}

async function admit(root: string, intent: 'explore' | 'review' | 'propose' | 'apply' | 'revise', payload: unknown): Promise<Record<string, unknown>> {
  const path = await resultFile(payload);
  return json(await cli(root, [intent, '--result', path]));
}

const completed = (summary: string) => ({ executionStatus: 'completed', summary });
const approved = (summary = 'approved') => ({ executionStatus: 'completed', summary, reviewVerdict: 'approved', reviewFindings: [], reviewFindingConvergence: [] });

async function throughApprovedProposal(root: string, changeId: string, options: { invalidSpec?: boolean } = {}): Promise<void> {
  json(await cli(root, ['explore']));
  await copyExplore(root, changeId);
  await admit(root, 'explore', completed('explored'));
  json(await cli(root, ['review']));
  await admit(root, 'review', approved('explore approved'));
  json(await cli(root, ['propose']));
  await copyProposalSet(root, changeId, options);
  await admit(root, 'propose', completed('proposed'));
  json(await cli(root, ['review']));
  await admit(root, 'review', approved('proposal approved'));
}

function retainTemplateRoot(root: string): void {
  const index = roots.indexOf(root);
  if (index >= 0) roots.splice(index, 1);
  templateRoots.push(root);
}

async function boundaryTemplates(): Promise<{ explore: string; approvedProposal: string }> {
  boundaryTemplatesPromise ??= (async () => {
    const fixture = await baseFixture({ changeId: 'snapshot-boundary-change', deliveryId: '20990401-02-cli-e2e-template' });
    json(await cli(fixture.root, ['explore']));
    await copyExplore(fixture.root, fixture.changeId);
    await admit(fixture.root, 'explore', completed('explored template'));

    const explore = await createTempDir();
    templateRoots.push(explore);
    await cp(fixture.root, explore, { recursive: true });

    json(await cli(fixture.root, ['review']));
    await admit(fixture.root, 'review', approved('explore approved template'));
    json(await cli(fixture.root, ['propose']));
    await copyProposalSet(fixture.root, fixture.changeId);
    await admit(fixture.root, 'propose', completed('proposed template'));
    json(await cli(fixture.root, ['review']));
    await admit(fixture.root, 'review', approved('proposal approved template'));
    retainTemplateRoot(fixture.root);
    return { explore, approvedProposal: fixture.root };
  })();
  return boundaryTemplatesPromise;
}

async function exploreCompletedTemplate(): Promise<string> {
  return (await boundaryTemplates()).explore;
}

async function approvedProposalTemplate(): Promise<string> {
  return (await boundaryTemplates()).approvedProposal;
}

async function copyBoundaryTemplate(templateRoot: string): Promise<{ root: string; changeId: string; deliveryId: string }> {
  const parent = await createTempDir();
  roots.push(parent);
  const root = join(parent, 'repo');
  await cp(templateRoot, root, { recursive: true });
  const manifests = await readdir(join(root, 'openspec', 'delivery-groups'));
  assert.equal(manifests.length, 1);
  const deliveryId = manifests[0]!.replace(/\.yaml$/, '');
  const manifest = await readFile(join(root, 'openspec', 'delivery-groups', manifests[0]!), 'utf8');
  const changeId = /^\s+id:\s+(.+)$/m.exec(manifest)?.[1];
  assert.ok(changeId);
  return { root, changeId, deliveryId };
}

async function owner(root: string, decision: 'authorize-apply' | 'authorize-archive', changeId: string, suffix: string): Promise<void> {
  const result = await cli(root, ['owner', 'record', '--decision', decision, '--change', changeId, '--source-ref', `owner:g1-e2e:${suffix}`]);
  assert.equal(result.code, 0, result.stderr);
}

function blockingFinding(authority: 'author' | 'owner' | 'verification' | 'external') {
  return {
    id: `G1-E2E-${authority.toUpperCase()}`,
    severity: 'blocking',
    title: `${authority} blocker`,
    problem: `${authority} fact is required.`,
    contractRef: 'g1-e2e-fixture',
    invariant: 'authority boundaries are preserved',
    evidence: ['fixture evidence'],
    impact: 'progress must stop at the correct authority',
    blockingAuthority: authority,
    requiredOutcome: `${authority} closes the blocker`,
    acceptance: ['the blocker is closed by its authority'],
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
after(async () => {
  assert.ok(realCliInvocationCount <= 79, `G1 real CLI subprocess count regressed: ${realCliInvocationCount} > 79`);
  console.log(`# G1 real CLI subprocess count: ${realCliInvocationCount}`);
  await Promise.all(templateRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('G1 Change CLI real-process end-to-end', { concurrency: false }, () => {
  it('drives the happy lifecycle through real archive, verify projection, completion and checkpoint readiness without a Git checkpoint', async () => {
    const { root, changeId, base } = await baseFixture();
    await throughApprovedProposal(root, changeId);
    await owner(root, 'authorize-apply', changeId, 'apply-happy');

    const applyPrepared = json(await cli(root, ['apply']));
    assert.equal(applyPrepared['mode'], 'prepared');
    const tasksPath = join(root, 'openspec', 'changes', changeId, 'tasks.md');
    await writeFile(tasksPath, (await readFile(tasksPath, 'utf8')).replaceAll('- [ ]', '- [x]'));
    const applyResult = await admit(root, 'apply', completed('implemented'));
    assert.equal(applyResult['mode'], 'admitted');

    json(await cli(root, ['review']));
    await admit(root, 'review', approved('apply approved'));
    await enableThinIntegration(root);
    const verification = json(await cli(root, ['verify']));
    assert.equal(verification['mode'], 'projection');
    assert.equal(verification['status'], 'passed');
    assert.equal(verification['published'], true);
    assert.ok((verification['selectedLogicalChecks'] as string[]).includes('openspec-current-change-strict'));

    await owner(root, 'authorize-archive', changeId, 'archive-happy');
    const archive = json(await cli(root, ['archive']));
    assert.equal(archive['status'], 'completed');

    const status = await cli(root, ['status']);
    assert.equal(status.code, 0, status.stderr);
    assert.match(status.stdout, /stage: delivery-level/);
    const next = await cli(root, ['next']);
    assert.equal(next.code, 0, next.stderr);
    assert.match(next.stdout, /authorize-checkpoint|checkpoint/);
    assert.equal((await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(), base);

    const checkpointSourceRef = 'owner:g1-e2e:checkpoint-happy';
    const checkpointOwnerRef = ownerDecisionRefFor({
      decision: 'authorize-checkpoint', deliveryId: '20990401-01-cli-e2e', changeId, sourceRef: checkpointSourceRef,
    });
    const manifestPath = join(root, 'openspec', 'delivery-groups', '20990401-01-cli-e2e.yaml');
    const manifest = DeliveryManifestDocument.parse(await readFile(manifestPath, 'utf8'));
    manifest.appendOwnerDecision({
      ref: checkpointOwnerRef,
      decision: 'authorize-checkpoint',
      deliveryId: '20990401-01-cli-e2e',
      changeId,
      sourceRef: checkpointSourceRef,
    });
    await writeFile(manifestPath, manifest.toString());
    await exec('git', ['diff', '--check'], { cwd: root });
    await exec('git', ['add', '.'], { cwd: root });
    await exec('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', `chore(flowkit): checkpoint ${changeId}`, '-m', [
      `Flowkit-Delivery: 20990401-01-cli-e2e`,
      `Flowkit-Change: ${changeId}`,
      'Flowkit-Boundary: change-checkpoint',
      `Owner-Authorization: ${checkpointOwnerRef}`,
    ].join('\n')], { cwd: root });
    const afterCheckpoint = await cli(root, ['next']);
    assert.equal(afterCheckpoint.code, 0, afterCheckpoint.stderr);
    assert.doesNotMatch(afterCheckpoint.stdout, /authorize-checkpoint/);
  });

  it('keeps non-author blockers out of revise while explicit review creates direct same-stage re-review; author blockers permit revise', async () => {
    for (const authority of ['owner', 'verification', 'external', 'author'] as const) {
      const { root } = await copyBoundaryTemplate(await exploreCompletedTemplate());
      json(await cli(root, ['review']));
      await admit(root, 'review', {
        executionStatus: 'completed',
        summary: `${authority} changes requested`,
        reviewVerdict: 'changes-requested',
        reviewFindings: [blockingFinding(authority)],
        reviewFindingConvergence: [],
      });

      const revise = await cli(root, ['revise']);
      if (authority === 'author') {
        const view = json(revise);
        assert.equal(view['action'], 'revise-explore');
      } else {
        assert.notEqual(revise.code, 0, `${authority} unexpectedly revised`);
        const direct = json(await cli(root, ['review']));
        assert.equal(direct['action'], 'review-explore');
        assert.equal(direct['mode'], 'prepared');
      }
    }
  });

  it('fails closed for stale review target and missing Owner activation', async () => {
    const planned = await baseFixture({ changeId: 'planned-change', state: 'planned' });
    const noActivation = await cli(planned.root, ['explore']);
    assert.notEqual(noActivation.code, 0);
    assert.deepEqual(await readdir(join(planned.root, '.flowkit', 'runs', planned.deliveryId)), []);

    const active = await copyBoundaryTemplate(await exploreCompletedTemplate());
    json(await cli(active.root, ['review']));
    await writeFile(join(active.root, 'openspec', 'changes', active.changeId, 'explore.md'), '# drifted review target\n');
    const stale = await cli(active.root, ['review', '--result', await resultFile(approved())]);
    assert.notEqual(stale.code, 0);
    assert.match(stale.stderr, /drift|fingerprint|resumable/i);
  });

  it('exact-resumes the same pending Run after a future-Delivery fresh clone with no chat/provider state', async () => {
    const { root, deliveryId } = await baseFixture({ changeId: 'future-consumer-change', deliveryId: '20990501-01-future-delivery' });
    const prepared = json(await cli(root, ['explore']));
    const runId = prepared['runId'] as string;
    await exec('git', ['add', '.'], { cwd: root });
    await exec('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'persist pending run'], { cwd: root });

    const cloneParent = await createTempDir();
    roots.push(cloneParent);
    const cloneRoot = join(cloneParent, 'clone');
    await exec('git', ['clone', '--quiet', root, cloneRoot], { cwd: tmpdir() });
    const resumed = json(await cli(cloneRoot, ['explore']));
    assert.equal(resumed['mode'], 'resumed');
    assert.equal(resumed['runId'], runId);
    assert.equal((resumed['actionPackage'] as { run: { deliveryId: string } }).run.deliveryId, deliveryId);
  });

  it('keeps changed-surface outcome-unknown archive pending and resumes the same generation after explicit recovery admission', async () => {
    const { root, changeId, deliveryId } = await copyBoundaryTemplate(await approvedProposalTemplate());
    await owner(root, 'authorize-apply', changeId, 'apply-archive-recovery');
    json(await cli(root, ['apply']));
    const tasksPath = join(root, 'openspec', 'changes', changeId, 'tasks.md');
    await writeFile(tasksPath, (await readFile(tasksPath, 'utf8')).replaceAll('- [ ]', '- [x]'));
    await admit(root, 'apply', completed('implemented for archive recovery'));
    json(await cli(root, ['review']));
    await admit(root, 'review', approved('apply approved for archive recovery'));
    await owner(root, 'authorize-archive', changeId, 'archive-recovery');
    await enableThinIntegration(root);

    const realAdapter = new OpenSpecCliAdapter({ repoRoot: root });
    const prepared = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', openSpecAdapter: realAdapter });
    assert.equal(prepared.package.run.action, 'archive');
    const preArchiveOpenSpec = await createTempDir();
    roots.push(preArchiveOpenSpec);
    await cp(join(root, 'openspec'), join(preArchiveOpenSpec, 'openspec'), { recursive: true });

    let archiveSpawnCount = 0;
    let mutatedArchivedAs: string | undefined;
    const unknownAdapter = {
      getChangeStatus: realAdapter.getChangeStatus.bind(realAdapter),
      archiveChange: async (id: string, statusView: Parameters<OpenSpecCliAdapter['archiveChange']>[1]) => {
        archiveSpawnCount += 1;
        const actual = await realAdapter.archiveChange(id, statusView);
        assert.equal(actual.spawned, true);
        assert.equal(actual.observation?.kind, 'success');
        mutatedArchivedAs = actual.observation?.kind === 'success' ? actual.observation.archivedAs : undefined;
        return { spawned: true, exitCode: null, stdout: '', stderr: '', timedOut: true };
      },
    } as unknown as OpenSpecCliAdapter;
    const unknown = await invokeOpenSpecArchive(root, prepared.package, { adapter: unknownAdapter });
    assert.equal(unknown.status, 'recovery-required');
    assert.equal(archiveSpawnCount, 1);
    assert.ok(mutatedArchivedAs, 'counterexample must perform the real OpenSpec archive mutation before losing the terminal observation');

    const runIdsBeforeRecoveryProjection = await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId));
    const gitHeadBeforeRecoveryProjection = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    const pendingResultPath = join(root, '.flowkit', 'runs', deliveryId, changeId, prepared.package.run.runId, 'result.json');
    await assert.rejects(readFile(pendingResultPath, 'utf8'));
    const blockedRetry = await cli(root, ['archive']);
    assert.equal(blockedRetry.code, 1, blockedRetry.stderr);
    assert.equal(blockedRetry.stderr, '');
    const blockedProjection = JSON.parse(blockedRetry.stdout) as Record<string, unknown>;
    assert.equal(blockedProjection['status'], 'recovery-required');
    assert.equal(blockedProjection['runId'], prepared.package.run.runId);
    assert.equal(blockedProjection['spawned'], false);
    assert.equal(archiveSpawnCount, 1, 'CLI must not auto-retry an armed changed-surface outcome-unknown archive');
    assert.deepEqual(await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId)), runIdsBeforeRecoveryProjection);
    assert.equal((await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(), gitHeadBeforeRecoveryProjection);
    await assert.rejects(readFile(pendingResultPath, 'utf8'));

    await rm(join(root, 'openspec'), { recursive: true, force: true });
    await cp(join(preArchiveOpenSpec, 'openspec'), join(root, 'openspec'), { recursive: true });
    assert.equal(await admitOpenSpecArchiveRecovery(root, prepared.package), 'recovery-admitted');

    const resumed = await prepareActionExecution({ repoRoot: root, deliveryId, entry: 'next', openSpecAdapter: realAdapter });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.package.run.runId, prepared.package.run.runId);
    assert.equal(resumed.package.run.action, 'archive');
    assert.deepEqual(await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId)), runIdsBeforeRecoveryProjection);
  });

  it('projects not-published Verification from structured authority and fails closed when OpenSpec projection is unavailable', async () => {
    const available = await baseFixture({ changeId: 'verification-not-published-change' });
    await enableThinIntegration(available.root);
    const projection = json(await cli(available.root, ['verify']));
    assert.equal(projection['mode'], 'projection');
    assert.equal(projection['published'], false);
    assert.equal(projection['status'], 'not-run');
    assert.match(String(projection['authorityPath']), /verification\.md$/);

    const missing = await baseFixture({ changeId: 'missing-openspec-artifact-change' });
    await enableThinIntegration(missing.root);
    await rm(join(missing.root, 'openspec', 'changes', missing.changeId), { recursive: true, force: true });
    const failed = await cli(missing.root, ['verify']);
    assert.notEqual(failed.code, 0);
    assert.match(failed.stderr, /OpenSpec|status|artifact|projection/i);
  });

  it('records Change Verification failure through apply admission instead of fabricating success', async () => {
    const { root, changeId, deliveryId } = await baseFixture({ changeId: 'verification-failure-change' });
    await throughApprovedProposal(root, changeId, { invalidSpec: true });
    await owner(root, 'authorize-apply', changeId, 'apply-verification-failure');
    json(await cli(root, ['apply']));
    const tasksPath = join(root, 'openspec', 'changes', changeId, 'tasks.md');
    await writeFile(tasksPath, (await readFile(tasksPath, 'utf8')).replaceAll('- [ ]', '- [x]'));
    const admitted = await admit(root, 'apply', completed('implementation complete; verification expected to fail'));
    assert.equal(admitted['mode'], 'admitted');
    await enableThinIntegration(root);
    const verificationPath = join(root, 'openspec', 'changes', changeId, 'verification.md');
    const verificationBefore = await readFile(verificationPath, 'utf8');
    const runIdsBeforeVerifyProjection = await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId));
    const verify = json(await cli(root, ['verify']));
    assert.equal(verify['status'], 'failed');
    assert.equal(await readFile(verificationPath, 'utf8'), verificationBefore, 'bare verify must remain read-only');
    assert.deepEqual(await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId)), runIdsBeforeVerifyProjection, 'bare verify must not allocate a Run');
    const next = await cli(root, ['next']);
    assert.match(next.stdout, /blocked|verification/i);
  });
});
