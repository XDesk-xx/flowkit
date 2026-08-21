import type { ActionPackage, ActionPackageV2, LogicalActionResultInput } from '../domain/types.js';
import { readFormalFactSnapshotOperation } from '../facts/formal-fact-reader.js';
import type { OpenSpecPreparedActionContextView } from '../integrations/openspec/openspec-types.js';
import type { OpenSpecCliAdapter } from '../integrations/openspec/openspec-cli-adapter.js';
import type { PolicyResult } from '../policy/types.js';
import type { RunResultFile } from '../persistence/serialization.js';
import { next } from '../policy/next.js';
import { FlowkitError } from '../shared/errors.js';
import { buildResumeProjection, type ResumeProjection } from '../diagnostics/resume-projection.js';
import {
  admitActionResult,
  buildOpenSpecPreparedActionContext,
  inspectPreparedRun,
  prepareNewExecution,
  resumeRun,
  type RunPreparationEntry,
} from './b1-run-execution-service.js';

export interface SingleActionAgentExecutionView {
  readonly actionPackage: ActionPackageV2;
  readonly openSpecContext: OpenSpecPreparedActionContextView;
  readonly resumeProjection: ResumeProjection;
}

export interface SingleActionAgentResult {
  readonly runId: string;
  readonly action: ActionPackageV2['run']['action'];
  readonly role: ActionPackageV2['run']['role'];
  readonly providerInvocations: 1;
  readonly terminalResult: RunResultFile;
  readonly postPolicy: PolicyResult;
}

function requireActionPackageV2(pkg: ActionPackage): ActionPackageV2 {
  if (pkg.schemaVersion !== 2) {
    throw new FlowkitError('AGENT_ADAPTER_PACKAGE_VERSION_UNSUPPORTED', 'single-action adapter requires the current ActionPackage v2 contract', { schemaVersion: pkg.schemaVersion });
  }
  return pkg;
}

export async function runSingleActionAgent(input: {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly entry: RunPreparationEntry;
  readonly execute: (view: SingleActionAgentExecutionView) => Promise<LogicalActionResultInput>;
  readonly env?: NodeJS.ProcessEnv;
  readonly includeManagedTools?: boolean;
  readonly openSpecAdapter?: OpenSpecCliAdapter;
}): Promise<SingleActionAgentResult> {
  const prepared = await prepareNewExecution({ repoRoot: input.repoRoot, deliveryId: input.deliveryId, entry: input.entry, ...(input.openSpecAdapter !== undefined && { openSpecAdapter: input.openSpecAdapter }) });
  let actionPackage: ActionPackageV2;
  let openSpecContext: OpenSpecPreparedActionContextView | undefined;

  if (prepared.kind === 'prepared') {
    actionPackage = requireActionPackageV2(prepared.package);
    openSpecContext = prepared.openSpecContext;
  } else {
    const resumed = await resumeRun({ repoRoot: input.repoRoot, deliveryId: input.deliveryId, expectedRunId: prepared.expectedRunId, ...(input.openSpecAdapter !== undefined && { openSpecAdapter: input.openSpecAdapter }) });
    if (resumed.kind !== 'pending') {
      throw new FlowkitError('AGENT_ADAPTER_TERMINAL_RACE', 'single-action adapter expected one persisted pending Run', { runId: prepared.expectedRunId });
    }
    actionPackage = requireActionPackageV2(resumed.package);
    openSpecContext = await buildOpenSpecPreparedActionContext(
      input.repoRoot,
      actionPackage.run.changeId,
      actionPackage.run.action,
      input.openSpecAdapter,
    );
  }

  if (openSpecContext === undefined) {
    throw new FlowkitError('AGENT_ADAPTER_CONTEXT_UNAVAILABLE', 'single-action adapter requires bounded OpenSpec structured execution context', {
      runId: actionPackage.run.runId,
      action: actionPackage.run.action,
    });
  }

  const before = await readFormalFactSnapshotOperation({
    repoRoot: input.repoRoot,
    deliveryId: input.deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
    ...(input.openSpecAdapter !== undefined && { openSpecAdapter: input.openSpecAdapter }),
  });
  const pending = await inspectPreparedRun(input.repoRoot, input.deliveryId, input.openSpecAdapter);
  const resumeProjection = await buildResumeProjection({
    repoRoot: input.repoRoot,
    snapshot: before.snapshot,
    pending,
    includeManagedTools: input.includeManagedTools ?? false,
    ...(input.env !== undefined && { env: input.env }),
  });

  let logicalResult: LogicalActionResultInput;
  try {
    logicalResult = await input.execute({ actionPackage, openSpecContext, resumeProjection });
  } catch (error) {
    throw new FlowkitError('AGENT_ADAPTER_PROVIDER_FAILED', 'single-action provider execution failed; pending Run is preserved', {
      runId: actionPackage.run.runId,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  await admitActionResult({ repoRoot: input.repoRoot, deliveryId: input.deliveryId, actionPackage, result: logicalResult, ...(input.openSpecAdapter !== undefined && { openSpecAdapter: input.openSpecAdapter }) });
  const terminal = await resumeRun({ repoRoot: input.repoRoot, deliveryId: input.deliveryId, expectedRunId: actionPackage.run.runId, ...(input.openSpecAdapter !== undefined && { openSpecAdapter: input.openSpecAdapter }) });
  if (terminal.kind !== 'already-terminal') {
    throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'single-action admission did not produce an exact terminal Run', { runId: actionPackage.run.runId });
  }

  const after = await readFormalFactSnapshotOperation({
    repoRoot: input.repoRoot,
    deliveryId: input.deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
    ...(input.openSpecAdapter !== undefined && { openSpecAdapter: input.openSpecAdapter }),
  });
  return {
    runId: actionPackage.run.runId,
    action: actionPackage.run.action,
    role: actionPackage.run.role,
    providerInvocations: 1,
    terminalResult: terminal.result,
    postPolicy: next(after.snapshot),
  };
}
