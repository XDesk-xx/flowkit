import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { derivePostActionChangeObservation } from '../../src/verification/change-selection/actual-change-set.js';
import { captureEntryWorkspaceSnapshot } from '../../src/verification/change-selection/entry-snapshot.js';
import { buildVerificationSelection, type VerificationSelection } from '../../src/verification/change-selection/selection.js';
import type { VerificationEvidenceRecord, VerificationSelectionExecutor } from '../../src/verification/change-selection/evidence.js';
import { buildVerificationSelectionPublication, publishVerificationSelection, validatePendingVerificationSelection } from '../../src/verification/change-selection/publication.js';
import { createTempDir } from '../fixtures/helpers.js';
import { recordOwnerDecision } from '../../src/services/a1-write-service.js';
import { admitActionResult, prepareNewExecution, resumeRun } from '../../src/services/b1-run-execution-service.js';
import { readFormalFactSnapshot } from '../../src/facts/formal-fact-reader.js';
import type { OpenSpecCliAdapter } from '../../src/integrations/openspec/openspec-cli-adapter.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function fixtureEvidence(selection: VerificationSelection, producingRunId: string, status: 'passed' | 'failed' = 'passed'): VerificationEvidenceRecord {
  if (selection.capabilityRelation.kind === 'not-applicable') {
    return {
      schemaVersion: 1,
      producingRunId,
      selectionFingerprint: selection.selectionFingerprint,
      overallStatus: 'not-applicable',
      fullTestStatus: 'not-ready',
      environment: 'fixture',
      checks: [],
      notApplicableProof: { predicateId: selection.capabilityRelation.predicateId },
    };
  }
  return {
    schemaVersion: 1,
    producingRunId,
    selectionFingerprint: selection.selectionFingerprint,
    overallStatus: status,
    fullTestStatus: 'not-ready',
    environment: 'fixture',
    checks: selection.verificationScopes.map((scope, index) => ({
      scope,
      applicability: 'applicable',
      commandOrMethod: `fixture:${scope}`,
      status,
      summary: `${status} fixture check`,
      resultRef: `.flowkit/runs/d1/e1/${producingRunId}/verification-evidence.json#check-${index + 1}`,
      environment: 'fixture',
      outcomeKind: 'exited',
      exitCode: status === 'passed' ? 0 : 1,
      stdoutFingerprint: 'a'.repeat(64),
      stderrFingerprint: 'b'.repeat(64),
    })),
  };
}

const passingVerificationExecutor: VerificationSelectionExecutor = async (input) => fixtureEvidence(input.selection, input.producingRunId, 'passed');

async function git(root: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', [...args], { cwd: root, windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} exited ${code}`)));
  });
}

describe('E1 disposable v5 bootstrap evidence', () => {
  it('derives base-to-post facts and deterministic selection from a real Git workspace', async () => {
    const root = await createTempDir();
    roots.push(root);
    await mkdir(join(root, 'src', 'domain'), { recursive: true });
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const base = 1;\n');
    await git(root, ['init']);
    await git(root, ['add', '.']);
    await git(root, ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base']);
    const base = await captureEntryWorkspaceSnapshot(root);
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const base = 2;\n');
    const post = await captureEntryWorkspaceSnapshot(root);
    const observed = derivePostActionChangeObservation(base, base, post, {
      schemaVersion: 1,
      action: 'apply',
      designRef: {
        ref: 'openspec/changes/e1/design.md',
        kind: 'design',
        versionFingerprint: 'a'.repeat(64),
      },
      selectors: [{ kind: 'prefix', path: 'src' }],
    });
    assert.deepEqual(observed.actualChangeSet.map(({ path, kind }) => ({ path, kind })), [{ path: 'src/domain/types.ts', kind: 'modify' }]);
    const selection = buildVerificationSelection(observed.actualChangeSet, [
      'openspec/changes/e1/specs/flowkit-core-model/spec.md',
    ]);
    assert.deepEqual(selection.seedModuleIds, ['core-model']);
    const runDir = join(root, '.flowkit', 'runs', 'd1', 'e1', '20990101-001-apply');
    await mkdir(runDir, { recursive: true });
    const markdown = join(root, 'openspec', 'changes', 'e1', 'verification.md');
    const evidence = fixtureEvidence(selection, '20990101-001-apply');
    const record = buildVerificationSelectionPublication({
      producingRunId: '20990101-001-apply',
      producingSemanticInputFingerprint: 'b'.repeat(64),
      logicalDescriptorDigest: 'c'.repeat(64),
      canonicalBase: base.canonicalBase,
      entryWorkspaceIdentity: { schemaVersion: 1, canonicalBase: base.canonicalBase, workspaceFingerprint: base.workspaceFingerprint },
      postActionWorkspaceFingerprint: post.workspaceFingerprint,
      actualChangeSet: observed.actualChangeSet,
      selection,
      verificationMarkdownLogicalRef: 'openspec/changes/e1/verification.md',
    }, evidence);
    await publishVerificationSelection({ runDir, canonicalVerificationPath: markdown, record, evidence });
    const binding = await validatePendingVerificationSelection({
      runDir,
      canonicalVerificationPath: markdown,
      producingRunId: record.producingRunId,
      producingSemanticInputFingerprint: record.producingSemanticInputFingerprint,
      logicalDescriptorDigest: record.logicalDescriptorDigest,
    });
    assert.ok(binding);
  });
  it('runs the production v5 prepare/resume/admit/Reader chain and keeps successor verification lineage isolated', async () => {
    const root = await createTempDir();
    roots.push(root);
    const deliveryId = '20990202-01-e1';
    const changeId = 'change-verification-selection-and-change-set';
    const changeRoot = join(root, 'openspec', 'changes', changeId);
    const runRoot = join(root, '.flowkit', 'runs', deliveryId, changeId);
    const now = () => new Date('2099-02-02T00:00:00Z');

    await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
    await mkdir(changeRoot, { recursive: true });
    await mkdir(join(root, 'src', 'domain'), { recursive: true });
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 1;\n');
    await writeFile(join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-02-02\n');
    await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: E1',
      `    id: ${changeId}`,
      '    goal: "E1 v5 integration fixture"',
      '    required: true',
      '    dependsOn: []',
      '    state: active',
      '    architectureImpact: false',
      '    outputs: []',
      '',
    ].join('\n'));
    await git(root, ['init']);
    await git(root, ['add', '.']);
    await git(root, ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base']);
    await git(root, [
      '-c', 'user.name=Flowkit Test',
      '-c', 'user.email=flowkit@example.invalid',
      'commit', '--allow-empty', '-m', 'chore(flowkit): start 20260810-01-change-execution-loop',
    ]);

    const prepare = async (entry: 'next' | 'review') => {
      const outcome = await prepareNewExecution({ repoRoot: root, deliveryId, entry, now });
      assert.equal(outcome.kind, 'prepared');
      if (outcome.kind !== 'prepared') assert.fail('expected prepared');
      assert.equal(outcome.package.schemaVersion, 2);
      const resumed = await resumeRun({ repoRoot: root, deliveryId, expectedRunId: outcome.package.run.runId });
      assert.equal(resumed.kind, 'pending');
      return outcome.package;
    };

    const explore = await prepare('next');
    assert.equal(explore.run.action, 'explore');
    await writeFile(join(changeRoot, 'explore.md'), '# Explore\n');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: explore, result: { executionStatus: 'completed', summary: 'explored' } });

    const reviewExplore = await prepare('review');
    assert.equal(reviewExplore.run.action, 'review-explore');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: reviewExplore, result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] } });

    const propose = await prepare('next');
    assert.equal(propose.run.action, 'propose');
    const mutationScope = {
      schemaVersion: 1,
      actions: {
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
      },
    };
    await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n');
    await writeFile(join(changeRoot, 'design.md'), `# Design\n\n## flowkitMutationScope\n\n\`\`\`json\n${JSON.stringify(mutationScope, null, 2)}\n\`\`\`\n`);
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [ ] fixture\n');
    const capabilityIds = [
      'flowkit-change-verification-selection',
      'flowkit-core-model',
      'flowkit-formal-fact-reader-and-persistence',
      'flowkit-lean-run-and-action-package',
      'flowkit-openspec-1-7-thin-integration',
      'flowkit-policy-engine',
      'flowkit-runtime-foundation',
    ];
    for (const capabilityId of capabilityIds) {
      const capabilityDir = join(changeRoot, 'specs', capabilityId);
      await mkdir(capabilityDir, { recursive: true });
      await writeFile(join(capabilityDir, 'spec.md'), `## ADDED Requirements\n\n### Requirement: ${capabilityId}\nThe fixture MUST bind ${capabilityId}.\n\n#### Scenario: fixture\n- **WHEN** the fixture runs\n- **THEN** it remains deterministic\n`);
    }
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: propose, result: { executionStatus: 'completed', summary: 'proposed' } });

    const reviewPropose = await prepare('review');
    assert.equal(reviewPropose.run.action, 'review-propose');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: reviewPropose, result: { executionStatus: 'completed', summary: 'approved', reviewVerdict: 'approved', reviewFindings: [] } });
    await recordOwnerDecision(root, { decision: 'authorize-apply', changeId, sourceRef: 'owner:e1-integration:apply' });

    const makeProjection = () => ({
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
          specs: { artifactId: 'specs' as const, logicalPaths: capabilityIds.map((id) => `openspec/changes/${changeId}/specs/${id}/spec.md`), physicalPaths: capabilityIds.map((id) => join(changeRoot, 'specs', id, 'spec.md')) },
        },
        status: [],
      },
      invocationDiagnostics: [],
    });
    let projectionCalls = 0;
    const fakeOpenSpec = {
      createOperationProjection: async () => { projectionCalls += 1; return makeProjection(); },
    } as unknown as OpenSpecCliAdapter;

    const apply = await prepare('next');
    assert.equal(apply.run.action, 'apply');
    const applyRunDir = join(runRoot, apply.run.runId);
    const applyContext = JSON.parse(await readFile(join(applyRunDir, 'context.json'), 'utf8')) as { schemaVersion: number; actionPackage: { schemaVersion: number } };
    assert.equal(applyContext.schemaVersion, 5);
    assert.equal(applyContext.actionPackage.schemaVersion, 2);
    assert.ok(await readFile(join(applyRunDir, 'entry-workspace.json'), 'utf8'));

    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 2;\n');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n');
    await writeFile(join(changeRoot, 'verification.md'), '<!-- flowkit-change-verification-status: passed -->\n');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: apply, result: { executionStatus: 'completed', summary: 'applied' }, openSpecAdapter: fakeOpenSpec, verificationExecutor: passingVerificationExecutor });
    assert.equal(projectionCalls, 1);

    const applyResult = JSON.parse(await readFile(join(applyRunDir, 'result.json'), 'utf8')) as { terminalBinding?: { verificationSelection?: { logicalRef: string } } };
    assert.equal(applyResult.terminalBinding?.verificationSelection?.logicalRef, `.flowkit/runs/${deliveryId}/${changeId}/${apply.run.runId}/verification-selection.json`);
    const applyRecord = JSON.parse(await readFile(join(applyRunDir, 'verification-selection.json'), 'utf8')) as { actualChangeSet: Array<{ path: string; kind: string; contentFingerprintAfter?: string }>; producingRunId: string };
    assert.equal(applyRecord.producingRunId, apply.run.runId);
    assert.equal(applyRecord.actualChangeSet.some((entry) => entry.path.endsWith('/proposal.md')), true, 'base-to-post must retain proposal bytes already present at Apply entry');
    assert.equal(applyRecord.actualChangeSet.some((entry) => entry.path === 'src/domain/types.ts'), true);
    assert.equal(applyRecord.actualChangeSet.some((entry) => entry.path === `openspec/changes/${changeId}/verification.md`), false, 'Core-owned verification publication must not enter actualChangeSet');
    for (const entry of applyRecord.actualChangeSet.filter((entry) => entry.kind !== 'delete')) {
      const terminalFingerprint = createHash('sha256').update(await readFile(join(root, entry.path))).digest('hex');
      assert.equal(entry.contentFingerprintAfter, terminalFingerprint, `terminal candidate fingerprint mismatch for ${entry.path}`);
    }
    let facts = await readFormalFactSnapshot({ repoRoot: root, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups' });
    assert.equal(facts.changeVerificationStatus, 'passed');
    assert.equal(facts.conflicts.length, 0, JSON.stringify(facts.conflicts));

    const reviewApply = await prepare('review');
    assert.equal(reviewApply.run.action, 'review-apply');
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: reviewApply, result: {
      executionStatus: 'completed', summary: 'changes requested', reviewVerdict: 'changes-requested',
      reviewFindings: [{ id: 'E1-FIXTURE-001', severity: 'blocking', blockingAuthority: 'author', title: 'revise', problem: 'fixture needs revision', contractRef: 'spec:fixture', invariant: 'fixture contract', evidence: ['fixture evidence'], impact: 'review blocked', requiredOutcome: 'revise candidate', acceptance: ['candidate revised'] }],
    } });

    const revise = await prepare('next');
    assert.equal(revise.run.action, 'revise-apply');
    await writeFile(join(root, 'src', 'domain', 'types.ts'), 'export const value = 3;\n');
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [x] fixture\n');
    await writeFile(join(changeRoot, 'verification.md'), '<!-- flowkit-change-verification-status: passed -->\n');
    const beforeReviseAdmission = await readFormalFactSnapshot({ repoRoot: root, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups' });
    assert.equal(beforeReviseAdmission.changeVerificationStatus, undefined);
    assert.equal(beforeReviseAdmission.conflicts.length, 0, JSON.stringify(beforeReviseAdmission.conflicts));
    await admitActionResult({ repoRoot: root, deliveryId, actionPackage: revise, result: { executionStatus: 'completed', summary: 'revised' }, openSpecAdapter: fakeOpenSpec, verificationExecutor: passingVerificationExecutor });
    assert.equal(projectionCalls, 2, 'post-action admission must use a fresh projection rather than caching the previous Apply projection');

    facts = await readFormalFactSnapshot({ repoRoot: root, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: 'openspec/delivery-groups' });
    assert.equal(facts.changeVerificationStatus, 'passed');
    assert.equal(facts.conflicts.length, 0, JSON.stringify(facts.conflicts));
    const reviseRunDir = join(runRoot, revise.run.runId);
    const reviseRecord = JSON.parse(await readFile(join(reviseRunDir, 'verification-selection.json'), 'utf8')) as { producingRunId: string; actualChangeSet: Array<{ path: string; kind: string; contentFingerprintAfter?: string }> };
    assert.equal(reviseRecord.producingRunId, revise.run.runId);
    assert.equal(reviseRecord.actualChangeSet.some((entry) => entry.path === `openspec/changes/${changeId}/verification.md`), false);
    for (const entry of reviseRecord.actualChangeSet.filter((entry) => entry.kind !== 'delete')) {
      const terminalFingerprint = createHash('sha256').update(await readFile(join(root, entry.path))).digest('hex');
      assert.equal(entry.contentFingerprintAfter, terminalFingerprint, `terminal candidate fingerprint mismatch for ${entry.path}`);
    }

    const historicalReplay = await resumeRun({ repoRoot: root, deliveryId, expectedRunId: apply.run.runId });
    assert.equal(historicalReplay.kind, 'already-terminal');
    assert.equal((await readFile(join(changeRoot, 'verification.md'), 'utf8')).includes(`Producing Run: \`${revise.run.runId}\``), true);
  });

});
