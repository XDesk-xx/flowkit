import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderStatus } from '../../../src/diagnostics/status.js';
import { formatPolicyResult } from '../../../src/diagnostics/next.js';
import { diagnoseRepository, renderDoctor } from '../../../src/diagnostics/doctor.js';
import { renderResumeContext } from '../../../src/diagnostics/resume-context.js';
import { buildChange, buildConflict, buildRun, buildSnapshot, buildVerdict } from '../policy/fixtures.js';

const change = buildChange({ key: 'E1', id: 'diagnostic-cli' });

function artifact(kind: 'change-explore' | 'change-proposal' | 'change-design' | 'change-spec' | 'change-tasks' | 'change-verification', path: string, exists = true) {
  return { kind, path, exists } as const;
}

describe('diagnostic views', () => {
  it('formats active Change status in fixed order', () => {
    const explore = buildRun({ nnn: 169, action: 'explore', changeId: 'diagnostic-cli' });
    const review = buildRun({ nnn: 170, action: 'review-explore', changeId: 'diagnostic-cli', role: 'reviewer' });
    const snapshot = buildSnapshot({
      changes: [change],
      runs: [explore, review],
      reviewVerdicts: [buildVerdict({ reviewNnn: 170, reviewedRunId: explore.runId })],
      changeVerificationStatus: 'not-run',
      openSpecArtifacts: [artifact('change-explore', 'openspec/changes/diagnostic-cli/explore.md')],
    });
    assert.equal(
      renderStatus(snapshot),
      [
        'delivery: 20260806-01-deterministic-core',
        'delivery-state: active',
        'change: E1 diagnostic-cli',
        'change-state: active',
        'stage: explore',
        'last-run: 20260806-170-review-explore',
        'review: approved',
        'verification: not-run',
        'full-test: unavailable',
        'conflicts: 0',
        '',
      ].join('\n'),
    );
  });

  it('formats no-active-Change as Delivery-level state', () => {
    const snapshot = buildSnapshot({ changes: [buildChange({ state: 'planned' })], runs: [] });
    const text = renderStatus(snapshot);
    assert.match(text, /change: none\nchange-state: none\nstage: delivery-level/);
    assert.match(text, /review: none\nverification: not-applicable/);
  });

  it('formats all PolicyResult branches without losing context or conflicts', () => {
    assert.equal(
      formatPolicyResult({ kind: 'owner-decision', decision: 'activate-change', context: { changeKey: 'E1', eligibleChangeKeys: ['E1', 'F1'], detail: 'choose' } }),
      [
        'kind: owner-decision',
        'decision: activate-change',
        'context-change: E1',
        'context-eligible-changes: E1,F1',
        'context-full-test: none',
        'context-detail: choose',
        '',
      ].join('\n'),
    );
    const text = formatPolicyResult({
      kind: 'blocked',
      diagnosis: {
        reason: 'formal-fact-conflict',
        unmetPreconditions: ['facts-consistent'],
        conflicts: [
          { dimension: 'z', authority: 'b', message: 'two' },
          { dimension: 'a', authority: 'c', message: 'one' },
        ],
        suggestedOwnerActions: [],
      },
    });
    assert.match(text, /conflict\[0\]: dimension=a; authority=c; message=one/);
    assert.match(text, /conflict\[1\]: dimension=z; authority=b; message=two/);
  });

  it('maps Reader conflict and recovery findings to fixed doctor severity', () => {
    const snapshot = buildSnapshot({
      changes: [change],
      conflicts: [buildConflict('yaml-parse')],
      runs: [
        buildRun({ nnn: 175, action: 'apply', status: 'pending', changeId: 'diagnostic-cli' }),
        buildRun({ nnn: 176, action: 'review-apply', status: 'pending', changeId: 'diagnostic-cli', role: 'reviewer' }),
      ],
    });
    const report = diagnoseRepository(snapshot);
    assert.equal(report.overall, 'error');
    assert.ok(report.findings.some((finding) => finding.code === 'reader-conflict:yaml-parse' && finding.severity === 'error'));
    assert.ok(report.findings.some((finding) => finding.code === 'ambiguous-pending-runs' && finding.severity === 'error'));
    assert.doesNotMatch(renderDoctor(snapshot), /policy-blocked:formal-fact-conflict/);
  });

  it('reports one non-resumable pending Run as warning', () => {
    const snapshot = buildSnapshot({
      changes: [change],
      runs: [buildRun({ nnn: 175, action: 'archive', status: 'pending', changeId: 'diagnostic-cli' })],
    });
    const report = diagnoseRepository(snapshot);
    assert.equal(report.overall, 'warning');
    assert.ok(report.findings.some((finding) => finding.code === 'orphan-pending-run'));
  });

  it('reports missing current formal artifact as error', () => {
    const snapshot = buildSnapshot({
      changes: [change],
      runs: [buildRun({ nnn: 169, action: 'explore', changeId: 'diagnostic-cli' })],
      openSpecArtifacts: [],
    });
    const report = diagnoseRepository(snapshot);
    assert.ok(report.findings.some((finding) => finding.code === 'missing-formal-artifact' && finding.severity === 'error'));
  });

  it('renders stage-based resume context without historical ref replay', () => {
    const explore = buildRun({ nnn: 169, action: 'explore', changeId: 'diagnostic-cli' });
    const snapshot = buildSnapshot({
      changes: [change],
      runs: [explore],
      openSpecArtifacts: [artifact('change-explore', 'openspec/changes/diagnostic-cli/explore.md')],
    });
    const text = renderResumeContext(snapshot);
    assert.match(text, /last-artifact: openspec\/changes\/diagnostic-cli\/explore.md/);
    assert.match(text, /last-run: 20260806-169-explore/);
  });
});
