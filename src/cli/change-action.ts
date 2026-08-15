import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ChangeAction } from '../domain/actions.js';
import type { LogicalActionResultInput } from '../domain/types.js';
import { readFormalFactSnapshotOperation } from '../facts/formal-fact-reader.js';
import { invokeOpenSpecArchive } from '../integrations/openspec/openspec-archive-service.js';
import {
  admitActionResult,
  inspectPendingArchiveRecoveryBeforeOpenSpec,
  inspectPreparedRun,
  prepareActionExecution,
  prepareNewExecution,
  resumeRun,
} from '../services/b1-run-execution-service.js';
import { next } from '../policy/next.js';
import { resolveReview } from '../policy/unified-entry.js';
import { DeliveryManifestDocument } from '../persistence/delivery-manifest-document.js';
import { atomicWriteFile } from '../shared/atomic-write.js';
import { FlowkitError } from '../shared/errors.js';

export type ChangeOperatorIntent = 'explore' | 'review' | 'revise' | 'propose' | 'apply';

export interface ChangeOperatorResult {
  readonly exitCode: 0 | 1;
  readonly value: unknown;
}

function actionMatchesIntent(intent: ChangeOperatorIntent, action: ChangeAction): boolean {
  switch (intent) {
    case 'explore': return action === 'explore';
    case 'propose': return action === 'propose';
    case 'apply': return action === 'apply';
    case 'review': return action === 'review-explore' || action === 'review-propose' || action === 'review-apply';
    case 'revise': return action === 'revise-explore' || action === 'revise-propose' || action === 'revise-apply';
  }
}

function assertIntent(intent: ChangeOperatorIntent, action: ChangeAction): void {
  if (!actionMatchesIntent(intent, action)) {
    throw new FlowkitError(
      'RUN_PREPARATION_NOT_ALLOWED',
      `Command ${intent} does not match resolved/pending formal action ${action}`,
      { intent, action },
    );
  }
}


async function assertCurrentIntentBeforePreparation(
  repoRoot: string,
  deliveryId: string,
  intent: ChangeOperatorIntent | 'archive',
): Promise<void> {
  const operation = await readFormalFactSnapshotOperation({
    repoRoot,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
  if (operation.snapshot.conflicts.length > 0) {
    throw new FlowkitError('FORMAL_FACT_CONFLICT', 'Current formal facts are conflicted', { conflicts: operation.snapshot.conflicts });
  }
  const policy = intent === 'review' ? resolveReview(operation.snapshot) : next(operation.snapshot);
  if (policy.kind !== 'action') {
    throw new FlowkitError('RUN_PREPARATION_NOT_ALLOWED', `Command ${intent} is not the current Standard Change Action`, { policyKind: policy.kind });
  }
  if (intent === 'archive') {
    if (policy.action !== 'archive') {
      throw new FlowkitError('RUN_PREPARATION_NOT_ALLOWED', `Command archive does not match current formal action ${policy.action}`);
    }
    return;
  }
  assertIntent(intent, policy.action);
}

async function exactPendingPackage(
  repoRoot: string,
  deliveryId: string,
  intent: ChangeOperatorIntent,
): Promise<Awaited<ReturnType<typeof resumeRun>> & { readonly kind: 'pending' }> {
  const inspection = await inspectPreparedRun(repoRoot, deliveryId);
  if (inspection.status !== 'resumable' || inspection.runId === undefined || inspection.action === undefined) {
    throw new FlowkitError(
      'RUN_PREPARATION_NOT_ALLOWED',
      `Command ${intent} --result requires exactly one resumable pending Run`,
      { intent, pendingStatus: inspection.status, runId: inspection.runId },
    );
  }
  assertIntent(intent, inspection.action);
  const resumed = await resumeRun({ repoRoot, deliveryId, expectedRunId: inspection.runId });
  if (resumed.kind !== 'pending') {
    throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', `Pending Run ${inspection.runId} became terminal during result admission`);
  }
  assertIntent(intent, resumed.package.run.action);
  return resumed;
}

export async function runChangeOperator(
  repoRoot: string,
  deliveryId: string,
  intent: ChangeOperatorIntent,
  result?: LogicalActionResultInput,
): Promise<ChangeOperatorResult> {
  if (result !== undefined) {
    const resumed = await exactPendingPackage(repoRoot, deliveryId, intent);
    await admitActionResult({ repoRoot, deliveryId, actionPackage: resumed.package, result });
    const terminal = await resumeRun({ repoRoot, deliveryId, expectedRunId: resumed.package.run.runId });
    if (terminal.kind !== 'already-terminal') {
      throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'Action result admission did not produce a terminal Run');
    }
    return {
      exitCode: 0,
      value: {
        mode: 'admitted',
        runId: resumed.package.run.runId,
        action: resumed.package.run.action,
        role: resumed.package.run.role,
        result: terminal.result,
      },
    };
  }

  await assertCurrentIntentBeforePreparation(repoRoot, deliveryId, intent);
  const entry = intent === 'review' ? 'review' : 'next';
  const prepared = await prepareNewExecution({ repoRoot, deliveryId, entry });
  if (prepared.kind === 'prepared') {
    assertIntent(intent, prepared.package.run.action);
    return {
      exitCode: 0,
      value: {
        mode: 'prepared',
        runId: prepared.package.run.runId,
        action: prepared.package.run.action,
        role: prepared.package.run.role,
        actionPackage: prepared.package,
      },
    };
  }

  const resumed = await resumeRun({ repoRoot, deliveryId, expectedRunId: prepared.expectedRunId });
  if (resumed.kind !== 'pending') {
    throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', `Expected pending Run ${prepared.expectedRunId} is already terminal`);
  }
  assertIntent(intent, resumed.package.run.action);
  return {
    exitCode: 0,
    value: {
      mode: 'resumed',
      runId: resumed.package.run.runId,
      action: resumed.package.run.action,
      role: resumed.package.run.role,
      actionPackage: resumed.package,
    },
  };
}

function parsePublishedVerification(content: string): {
  readonly selectionFingerprint?: string;
  readonly selectedLogicalChecks: readonly string[];
} {
  const fingerprint = /^- selectionFingerprint: `([0-9a-f]{64})`$/m.exec(content)?.[1];
  const heading = '## Selected logical checks';
  const headingIndex = content.indexOf(heading);
  let section = '';
  if (headingIndex >= 0) {
    const afterHeading = content.slice(headingIndex + heading.length);
    const nextHeading = afterHeading.search(/^## /m);
    section = nextHeading >= 0 ? afterHeading.slice(0, nextHeading) : afterHeading;
  }
  const selectedLogicalChecks = [...section.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1]!).sort();
  return {
    ...(fingerprint !== undefined && { selectionFingerprint: fingerprint }),
    selectedLogicalChecks,
  };
}

export async function projectChangeVerification(
  repoRoot: string,
  deliveryId: string,
): Promise<ChangeOperatorResult> {
  const operation = await readFormalFactSnapshotOperation({
    repoRoot,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
  const { snapshot, openSpecProjection } = operation;
  if (snapshot.conflicts.length > 0) {
    throw new FlowkitError('FORMAL_FACT_CONFLICT', 'Change Verification projection is conflicted', {
      conflicts: snapshot.conflicts,
    });
  }
  const active = snapshot.changes.filter((change) => change.state === 'active');
  if (active.length !== 1 || openSpecProjection === undefined || openSpecProjection.changeId !== active[0]!.id) {
    throw new FlowkitError('RUN_PREPARATION_NOT_ALLOWED', 'verify requires one active Change with a structured OpenSpec projection');
  }

  const root = openSpecProjection.status.changeRootLogical.replace(/\/+$/, '');
  const candidates = snapshot.openSpecArtifacts.filter(
    (artifact) => artifact.kind === 'change-verification' && artifact.path.startsWith(`${root}/`),
  );
  if (candidates.length !== 1 || candidates[0]!.path.trim() === '') {
    throw new FlowkitError('OPENSPEC_AMBIGUOUS_ARTIFACT_PATH', 'verify requires exactly one projected Change Verification authority path', {
      changeId: active[0]!.id,
      paths: candidates.map((candidate) => candidate.path),
    });
  }
  const authority = candidates[0]!;
  if (!authority.exists) {
    return {
      exitCode: 0,
      value: {
        mode: 'projection',
        deliveryId,
        changeId: active[0]!.id,
        status: snapshot.changeVerificationStatus ?? 'not-run',
        authorityPath: authority.path,
        published: false,
        selectedLogicalChecks: [],
      },
    };
  }
  if (snapshot.changeVerificationStatus === undefined) {
    throw new FlowkitError('FORMAL_FACT_CONFLICT', 'Published Change Verification authority has no projected formal status');
  }
  const content = await readFile(join(repoRoot, authority.path), 'utf8');
  const published = parsePublishedVerification(content);
  return {
    exitCode: 0,
    value: {
      mode: 'projection',
      deliveryId,
      changeId: active[0]!.id,
      status: snapshot.changeVerificationStatus,
      authorityPath: authority.path,
      published: true,
      ...published,
    },
  };
}

export async function runArchiveOperator(
  repoRoot: string,
  deliveryId: string,
): Promise<ChangeOperatorResult> {
  const recovery = await inspectPendingArchiveRecoveryBeforeOpenSpec(repoRoot, deliveryId);
  if (recovery !== undefined) {
    return {
      exitCode: 1,
      value: {
        mode: 'archive',
        status: recovery.status,
        runId: recovery.runId,
        code: recovery.code,
        spawned: recovery.spawned,
      },
    };
  }
  await assertCurrentIntentBeforePreparation(repoRoot, deliveryId, 'archive');
  const prepared = await prepareActionExecution({ repoRoot, deliveryId, entry: 'next' });
  if (prepared.package.run.action !== 'archive') {
    throw new FlowkitError('RUN_PREPARATION_NOT_ALLOWED', 'archive command requires the exact archive formal action');
  }
  const outcome = await invokeOpenSpecArchive(repoRoot, prepared.package);
  if (outcome.status === 'success') {
    const manifestPath = join(repoRoot, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
    const manifest = DeliveryManifestDocument.parse(await readFile(manifestPath, 'utf8'));
    manifest.updateChangeState(prepared.package.run.changeId, 'active', 'completed');
    await atomicWriteFile(manifestPath, manifest.toString());
    await admitActionResult({
      repoRoot,
      deliveryId,
      actionPackage: prepared.package,
      result: {
        executionStatus: 'completed',
        summary: `OpenSpec archive completed as ${outcome.observation.archivedAs}`,
      },
    });
    return {
      exitCode: 0,
      value: {
        mode: 'archive',
        status: 'completed',
        runId: prepared.package.run.runId,
        archivedAs: outcome.observation.archivedAs,
        spawned: outcome.spawned,
      },
    };
  }
  return {
    exitCode: 1,
    value: {
      mode: 'archive',
      status: outcome.status,
      runId: prepared.package.run.runId,
      code: outcome.code,
      spawned: outcome.spawned,
    },
  };
}
