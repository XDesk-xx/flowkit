import type { FactConflict, FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { next } from '../policy/next.js';
import type { BlockedReason, PolicyResult } from '../policy/types.js';
import {
  activeChange,
  currentStage,
  hasCompletedCurrentArtifactRun,
  isPendingRunResumable,
  line,
  stageHasFormalArtifact,
} from './shared.js';

export type DoctorSeverity = 'error' | 'warning';

export interface DoctorFinding {
  readonly code: string;
  readonly severity: DoctorSeverity;
  readonly message: string;
  readonly authority?: string;
}

export interface DoctorReport {
  readonly overall: 'ok' | 'warning' | 'error';
  readonly findings: readonly DoctorFinding[];
}

const POLICY_SEVERITY: Readonly<Record<Exclude<BlockedReason, 'formal-fact-conflict'>, DoctorSeverity>> = {
  'no-active-delivery': 'error',
  'ambiguous-state': 'error',
  'no-actionable-change': 'warning',
  'verification-facts-unavailable': 'warning',
  'verification-failed': 'warning',
  'verification-not-run': 'warning',
  'tasks-facts-unavailable': 'warning',
  'tasks-incomplete': 'warning',
  'dependency-incomplete': 'warning',
  'full-test-failed': 'warning',
};

function readerConflictFinding(conflict: FactConflict): DoctorFinding {
  return {
    code: `reader-conflict:${conflict.dimension}`,
    severity: 'error',
    authority: conflict.authority,
    message: `dimension=${conflict.dimension}; authority=${conflict.authority}; message=${conflict.message}`,
  };
}

function policyFinding(policy: PolicyResult): DoctorFinding | undefined {
  if (policy.kind !== 'blocked' || policy.diagnosis.reason === 'formal-fact-conflict') return undefined;
  const reason = policy.diagnosis.reason;
  return {
    code: `policy-blocked:${reason}`,
    severity: POLICY_SEVERITY[reason],
    message: [
      `reason=${reason}`,
      `unmet=${policy.diagnosis.unmetPreconditions.length > 0 ? policy.diagnosis.unmetPreconditions.join(',') : 'none'}`,
      `owner-actions=${policy.diagnosis.suggestedOwnerActions.length > 0 ? policy.diagnosis.suggestedOwnerActions.join(',') : 'none'}`,
    ].join('; '),
  };
}

function severityRank(severity: DoctorSeverity): number {
  return severity === 'error' ? 0 : 1;
}

export function diagnoseRepository(snapshot: FormalFactSnapshot): DoctorReport {
  const findings: DoctorFinding[] = snapshot.conflicts.map(readerConflictFinding);
  const policy = next(snapshot);
  const change = activeChange(snapshot);

  if (change !== undefined) {
    const stage = currentStage(snapshot, change);
    const pending = snapshot.runs.filter((run) => run.changeId === change.id && run.status === 'pending');
    if (pending.length > 1) {
      findings.push({
        code: 'ambiguous-pending-runs',
        severity: 'error',
        message: `active Change has multiple pending Runs: ${pending.map((run) => run.runId).sort().join(',')}`,
      });
    } else if (pending.length === 1 && !isPendingRunResumable(snapshot, change, stage, pending[0]!, policy)) {
      findings.push({
        code: 'orphan-pending-run',
        severity: 'warning',
        message: `pending Run ${pending[0]!.runId} does not match current stage/Policy boundary`,
      });
    }

    if (hasCompletedCurrentArtifactRun(snapshot, change, stage) && !stageHasFormalArtifact(snapshot, change, stage)) {
      findings.push({
        code: 'missing-formal-artifact',
        severity: 'error',
        message: `completed ${stage} artifact Run exists but no current canonical formal artifact is present`,
      });
    }
  }

  const pFinding = policyFinding(policy);
  if (pFinding !== undefined) findings.push(pFinding);

  findings.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message),
  );
  const overall = findings.some((finding) => finding.severity === 'error')
    ? 'error'
    : findings.some((finding) => finding.severity === 'warning')
      ? 'warning'
      : 'ok';
  return { overall, findings };
}

export function renderDoctor(snapshot: FormalFactSnapshot): string {
  const report = diagnoseRepository(snapshot);
  const lines = [line('overall', report.overall), line('findings', report.findings.length)];
  report.findings.forEach((finding, index) => {
    lines.push(
      `finding[${index}]: severity=${finding.severity}; code=${finding.code}; message=${finding.message.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}`,
    );
  });
  return `${lines.join('\n')}\n`;
}
