import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';

import { runChangeOperator } from '../../../src/cli/change-action.js';
import { runCli } from '../../../src/cli/main.js';
import { OpenSpecCliAdapter } from '../../../src/integrations/openspec/openspec-cli-adapter.js';
import { admitActionResult, prepareNewExecution } from '../../../src/services/b1-run-execution-service.js';
import type { VerificationSelectionExecutor } from '../../../src/verification/change-selection/evidence.js';
import { createTempDir } from '../../fixtures/helpers.js';

const exec = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(changeId = 'alpha-change', deliveryId = '20990401-01-future-delivery') {
  const root = await createTempDir();
  roots.push(root);
  await mkdir(join(root, '.flowkit', 'runs'), { recursive: true });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes', changeId), { recursive: true });
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: A1',
    `    id: ${changeId}`,
    '    goal: "future consumer"',
    '    required: true',
    '    dependsOn: []',
    '    state: active',
    '    architectureImpact: false',
    '    outputs: []',
    '',
  ].join('\n'));
  await writeFile(join(root, 'openspec', 'changes', changeId, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2099-04-01\n');
  await exec('git', ['init'], { cwd: root });
  await exec('git', ['add', '.'], { cwd: root });
  await exec('git', ['-c', 'user.name=Flowkit Test', '-c', 'user.email=flowkit@example.invalid', 'commit', '-m', 'base'], { cwd: root });
  return { root, deliveryId, changeId };
}


const fixtureVerificationExecutor = (status: 'passed' | 'failed'): VerificationSelectionExecutor => async (input) => {
  if (input.selection.capabilityRelation.kind === 'not-applicable') {
    return {
      schemaVersion: 1,
      producingRunId: input.producingRunId,
      selectionFingerprint: input.selection.selectionFingerprint,
      overallStatus: 'not-applicable',
      fullTestStatus: input.fullTestStatus,
      environment: 'cli-retry-fixture',
      checks: [],
      notApplicableProof: { predicateId: input.selection.capabilityRelation.predicateId },
    };
  }
  return {
    schemaVersion: 1,
    producingRunId: input.producingRunId,
    selectionFingerprint: input.selection.selectionFingerprint,
    overallStatus: status,
    fullTestStatus: input.fullTestStatus,
    environment: 'cli-retry-fixture',
    checks: input.selection.verificationScopes.map((scope, index) => ({
      scope,
      applicability: 'applicable',
      commandOrMethod: `fixture:${scope}`,
      status,
      summary: `${status} fixture check`,
      resultRef: `${input.resultRefBase ?? `.flowkit/runs/${input.producingRunId}/verification-evidence.json`}#check-${index + 1}`,
      environment: 'cli-retry-fixture',
      outcomeKind: 'exited',
      exitCode: status === 'passed' ? 0 : 1,
      stdoutFingerprint: 'a'.repeat(64),
      stderrFingerprint: 'b'.repeat(64),
    })),
  };
};

async function writeApprovedProposalArtifacts(root: string, changeId: string): Promise<void> {
  const changeRoot = join(root, 'openspec', 'changes', changeId);
  await writeFile(join(changeRoot, 'proposal.md'), '# Proposal\n\nAdd a retry CLI fixture.\n');
  const mutationScope = {
    schemaVersion: 1,
    actions: {
      apply: { selectors: [
        { kind: 'exact', path: `docs/flowkit-self-hosting-bootstrap-and-migration.md` },
        { kind: 'exact', path: `openspec/changes/${changeId}/tasks.md` },
        { kind: 'exact', path: `openspec/changes/${changeId}/verification.md` },
      ] },
      'revise-apply': { selectors: [
        { kind: 'exact', path: `docs/flowkit-self-hosting-bootstrap-and-migration.md` },
        { kind: 'exact', path: `openspec/changes/${changeId}/tasks.md` },
        { kind: 'exact', path: `openspec/changes/${changeId}/verification.md` },
      ] },
    },
  };
  await writeFile(join(changeRoot, 'design.md'), `# Design\n\n## flowkitMutationScope\n\n\`\`\`json\n${JSON.stringify(mutationScope, null, 2)}\n\`\`\`\n`);
  await mkdir(join(changeRoot, 'specs', 'flowkit-change-cli-end-to-end-and-performance'), { recursive: true });
  await writeFile(join(changeRoot, 'specs', 'flowkit-change-cli-end-to-end-and-performance', 'spec.md'), [
    '## ADDED Requirements',
    '',
    '### Requirement: Retry CLI fixture',
    'The system MUST preserve the explicit retry CLI surface.',
    '',
    '#### Scenario: Retry is explicit',
    '- **WHEN** Verification is retried',
    '- **THEN** the explicit CLI retry path is used',
    '',
  ].join('\n'));
  await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [ ] exercise retry CLI\n');
}

describe('Change operator intent composition', () => {
  it('preflights mismatched intent without allocating the Policy-resolved Run', async () => {
    const { root, deliveryId } = await fixture();
    await assert.rejects(() => runChangeOperator(root, deliveryId, 'apply'), /does not match resolved\/pending formal action explore/);
    const deliveryRuns = join(root, '.flowkit', 'runs', deliveryId);
    assert.deepEqual(await readdir(deliveryRuns).catch(() => []), []);
  });

  it('prepares and exact-resumes the same pending Run, admits its result, and does not auto-continue', async () => {
    const { root, deliveryId, changeId } = await fixture('beta-change');
    const first = await runChangeOperator(root, deliveryId, 'explore');
    const firstView = first.value as { mode: string; runId: string };
    assert.equal(firstView.mode, 'prepared');

    const second = await runChangeOperator(root, deliveryId, 'explore');
    const secondView = second.value as { mode: string; runId: string };
    assert.equal(secondView.mode, 'resumed');
    assert.equal(secondView.runId, firstView.runId);

    await assert.rejects(
      () => runChangeOperator(root, deliveryId, 'propose', { executionStatus: 'completed', summary: 'wrong intent' }),
      /does not match resolved\/pending formal action explore|requires exactly one resumable pending Run/,
    );
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n\nfuture consumer proof\n');
    const admitted = await runChangeOperator(root, deliveryId, 'explore', {
      executionStatus: 'completed',
      summary: 'explore completed',
    });
    const admittedView = admitted.value as { mode: string; runId: string; result: { runStatus: string } };
    assert.equal(admittedView.mode, 'admitted');
    assert.equal(admittedView.runId, firstView.runId);
    assert.equal(admittedView.result.runStatus, 'completed');
    assert.deepEqual(await readdir(join(root, '.flowkit', 'runs', deliveryId, changeId)), [firstView.runId]);
  });


  async function exerciseVerifyRetry(mode: 'managed' | 'legacy'): Promise<void> {
    const { root, deliveryId, changeId } = await fixture('retry-cli-change');
    const originalFlowkitHome = process.env['FLOWKIT_HOME'];
    const originalLegacyExecutable = process.env['FLOWKIT_OPENSPEC_BIN'];
    let expectedSource: 'managed' | 'legacy-compat';
    if (mode === 'managed') {
      assert.ok(originalFlowkitHome, 'FLOWKIT_HOME managed OpenSpec is required for canonical retry coverage');
      delete process.env['FLOWKIT_OPENSPEC_BIN'];
      expectedSource = 'managed';
    } else {
      assert.ok(originalFlowkitHome, 'managed OpenSpec fixture is required to build the compatibility launcher');
      const managed = await new OpenSpecCliAdapter({ repoRoot: root }).resolveInvocation();
      const wrapperRoot = await createTempDir();
      roots.push(wrapperRoot);
      const wrapper = join(wrapperRoot, process.platform === 'win32' ? 'openspec-compat.cmd' : 'openspec-compat');
      if (process.platform === 'win32') {
        await writeFile(wrapper, `@echo off\r\n"${managed.command}" "${managed.argsPrefix[0]}" %*\r\n`);
      } else {
        await writeFile(wrapper, `#!/bin/sh\nexec "${managed.command}" "${managed.argsPrefix[0]}" "$@"\n`);
        await chmod(wrapper, 0o755);
      }
      delete process.env['FLOWKIT_HOME'];
      process.env['FLOWKIT_OPENSPEC_BIN'] = wrapper;
      expectedSource = 'legacy-compat';
    }
    try {
      const adapter = new OpenSpecCliAdapter({ repoRoot: root });
      assert.equal((await adapter.resolveInvocation()).source, expectedSource);

    await runChangeOperator(root, deliveryId, 'explore');
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n\nRetry CLI feasibility proof.\n');
    await runChangeOperator(root, deliveryId, 'explore', { executionStatus: 'completed', summary: 'explored' });
    await runChangeOperator(root, deliveryId, 'review');
    await runChangeOperator(root, deliveryId, 'review', {
      executionStatus: 'completed', summary: 'explore approved', reviewVerdict: 'approved', reviewFindings: [], reviewFindingConvergence: [],
    });
    await runChangeOperator(root, deliveryId, 'propose');
    await writeApprovedProposalArtifacts(root, changeId);
    await runChangeOperator(root, deliveryId, 'propose', { executionStatus: 'completed', summary: 'proposed' });
    await runChangeOperator(root, deliveryId, 'review');
    await runChangeOperator(root, deliveryId, 'review', {
      executionStatus: 'completed', summary: 'proposal approved', reviewVerdict: 'approved', reviewFindings: [], reviewFindingConvergence: [],
    });

    const authorized = await runCli({
      argv: ['owner', 'record', '--decision', 'authorize-apply', '--change', changeId, '--source-ref', 'owner:unit:retry-cli'],
      cwd: root,
    });
    assert.equal(authorized.exitCode, 0, authorized.stderr);

    const prepared = await prepareNewExecution({ repoRoot: root, deliveryId, entry: 'next', openSpecAdapter: adapter });
    assert.equal(prepared.kind, 'prepared');
    if (prepared.kind !== 'prepared') assert.fail('expected prepared Apply');
    assert.equal(prepared.package.run.action, 'apply');
    assert.ok('mutationDeclaration' in prepared.package && prepared.package.mutationDeclaration !== undefined, JSON.stringify(prepared.package));
    const tasksPath = join(root, 'openspec', 'changes', changeId, 'tasks.md');
    await writeFile(tasksPath, '# Tasks\n\n- [x] exercise retry CLI\n');
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'flowkit-self-hosting-bootstrap-and-migration.md'), '# Retry CLI fixture\n');
    await admitActionResult({
      repoRoot: root,
      deliveryId,
      actionPackage: prepared.package,
      result: { executionStatus: 'completed', summary: 'applied with failed fixture verification' },
      verificationExecutor: fixtureVerificationExecutor('failed'),
      openSpecAdapter: adapter,
    });

    const changeRoot = join(root, 'openspec', 'changes', changeId);
    const verificationPath = join(changeRoot, 'verification.md');
    const failedPublication = await readFile(verificationPath, 'utf8');
    const failedFingerprint = createHash('sha256').update(failedPublication).digest('hex');
    const runRoot = join(root, '.flowkit', 'runs', deliveryId, changeId);
    const runsBeforeRetry = (await readdir(runRoot)).sort();
    const originResultPath = join(runRoot, prepared.package.run.runId, 'result.json');
    const originResult = await readFile(originResultPath, 'utf8');

    const retried = await runCli({ argv: ['verify', '--retry'], cwd: root });
    assert.equal(retried.exitCode, 0, retried.stderr);
    const retryView = JSON.parse(retried.stdout) as Record<string, unknown>;
    assert.equal(retryView['mode'], 'retry');
    assert.equal(retryView['status'], 'passed');
    assert.equal(retryView['originApplyRunId'], prepared.package.run.runId);
    assert.equal(retryView['previousVerificationFingerprint'], failedFingerprint);
    assert.equal(await readFile(originResultPath, 'utf8'), originResult, 'retry must not rewrite completed Apply result.json');
    assert.equal(
      await readFile(join(changeRoot, 'verification-history', `${failedFingerprint}.md`), 'utf8'),
      failedPublication,
      'retry must preserve failed authority bytes by fingerprint',
    );
    assert.deepEqual((await readdir(runRoot)).sort(), runsBeforeRetry, 'verify --retry must not allocate a Formal Action/Run/NNN');

    const nextResult = await runCli({ argv: ['next'], cwd: root });
    assert.equal(nextResult.exitCode, 0, nextResult.stderr);
    assert.match(nextResult.stdout, /review-apply/);
    } finally {
      if (originalFlowkitHome === undefined) delete process.env['FLOWKIT_HOME'];
      else process.env['FLOWKIT_HOME'] = originalFlowkitHome;
      if (originalLegacyExecutable === undefined) delete process.env['FLOWKIT_OPENSPEC_BIN'];
      else process.env['FLOWKIT_OPENSPEC_BIN'] = originalLegacyExecutable;
    }
  }

  it('routes verify --retry through the canonical managed OpenSpec surface and preserves immutable failed authority', async () => {
    await exerciseVerifyRetry('managed');
  });

  it('keeps FLOWKIT_OPENSPEC_BIN verify --retry as separately-labelled compatibility coverage', async () => {
    await exerciseVerifyRetry('legacy');
  });
  it('keeps a non-author blocker on direct re-review and rejects revise', async () => {
    const { root, deliveryId, changeId } = await fixture('authority-change');
    await runChangeOperator(root, deliveryId, 'explore');
    await writeFile(join(root, 'openspec', 'changes', changeId, 'explore.md'), '# Explore\n\nauthority proof\n');
    await runChangeOperator(root, deliveryId, 'explore', { executionStatus: 'completed', summary: 'explored' });
    await runChangeOperator(root, deliveryId, 'review');
    await runChangeOperator(root, deliveryId, 'review', {
      executionStatus: 'completed',
      summary: 'owner fact required',
      reviewVerdict: 'changes-requested',
      reviewFindings: [{
        id: 'UNIT-OWNER-001',
        severity: 'blocking',
        title: 'Owner fact required',
        problem: 'Owner authority is missing.',
        contractRef: 'unit',
        invariant: 'owner authority remains external',
        evidence: ['unit fixture'],
        impact: 'revise is not legal',
        blockingAuthority: 'owner',
        requiredOutcome: 'Owner supplies the fact',
        acceptance: ['Owner fact exists'],
      }],
      reviewFindingConvergence: [],
    });
    await assert.rejects(() => runChangeOperator(root, deliveryId, 'revise'), /not the current Standard Change Action|did not resolve|does not match/);
    const rereview = await runChangeOperator(root, deliveryId, 'review');
    assert.equal((rereview.value as { action: string }).action, 'review-explore');
    assert.equal((rereview.value as { mode: string }).mode, 'prepared');
  });
});
