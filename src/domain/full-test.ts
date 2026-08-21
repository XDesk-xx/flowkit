import { createHash } from 'node:crypto';

export const FULL_TEST_LAUNCHER_MODES = ['direct', 'npm-shim'] as const;
export type FullTestLauncherMode = (typeof FULL_TEST_LAUNCHER_MODES)[number];

export const FULL_TEST_TERMINAL_STATUSES = ['passed', 'failed'] as const;
export type FullTestTerminalStatus = (typeof FULL_TEST_TERMINAL_STATUSES)[number];

export const FULL_TEST_BOUNDED_RESOLVER_IDS = [
  'flowkit-build',
  'flowkit-full-tests',
  'flowkit-lint',
  'flowkit-openspec-all',
  'flowkit-quality',
  'flowkit-typecheck',
] as const;
export type FullTestBoundedResolverId = (typeof FULL_TEST_BOUNDED_RESOLVER_IDS)[number];

export interface FullTestExecutionBase {
  readonly id: string;
  readonly scope: 'delivery';
  readonly resultProtocol: 'flowkit-full-test-result-v1';
  readonly resultAuthority: 'verification';
  readonly expectedTerminalStatuses: readonly ['passed', 'failed'];
}

export interface CommandFullTestExecution extends FullTestExecutionBase {
  readonly kind: 'command';
  readonly command: string;
  readonly args: readonly string[];
  readonly launcherMode: FullTestLauncherMode;
  readonly timeoutMs: number;
}

export interface BoundedFullTestLogicalCheck {
  readonly id: string;
  readonly resolverId: FullTestBoundedResolverId;
  readonly perTargetTimeoutMs: number;
}

export interface BoundedCommandPlanFullTestExecution extends FullTestExecutionBase {
  readonly kind: 'bounded-command-plan';
  readonly logicalChecks: readonly BoundedFullTestLogicalCheck[];
}

export type FullTestExecutionContract =
  | CommandFullTestExecution
  | BoundedCommandPlanFullTestExecution;

export interface FullTestExecutionBlock {
  readonly schemaVersion: 1;
  readonly reason: 'outcome-unknown';
  readonly summary: string;
}

export interface FullTestCheckResult {
  readonly id: string;
  readonly status: FullTestTerminalStatus;
  readonly durationMs: number;
}

export interface FullTestProtocolPayload {
  readonly schemaVersion: 1;
  readonly status: FullTestTerminalStatus;
  readonly summary: string;
  readonly totalDurationMs: number;
  readonly checks: readonly FullTestCheckResult[];
}

export interface FullTestTerminalResult extends FullTestProtocolPayload {
  readonly resultRef: string;
}

export interface FullTestFailureFinding {
  readonly schemaVersion: 1;
  readonly findingId: string;
  readonly authorizationRef: string;
  readonly sourceResultRef: string;
  readonly severity: 'blocking';
  readonly summary: string;
  readonly affectedScope: 'delivery';
  readonly requiredOwnerDecision: 'corrective-change-or-cancel-delivery';
}

export interface ResolvedFullTestFailureFinding extends FullTestFailureFinding {
  readonly resolution: {
    readonly kind: 'corrective-change-created';
    readonly changeId: string;
    readonly ownerDecisionRef: string;
  };
}

export function canonicalFullTestPayload(payload: FullTestProtocolPayload): string {
  return JSON.stringify({
    schemaVersion: payload.schemaVersion,
    status: payload.status,
    summary: payload.summary,
    totalDurationMs: payload.totalDurationMs,
    checks: payload.checks.map((check) => ({
      id: check.id,
      status: check.status,
      durationMs: check.durationMs,
    })),
  });
}

export function fullTestResultRefFor(payload: FullTestProtocolPayload): string {
  const hash = createHash('sha256').update(canonicalFullTestPayload(payload), 'utf8').digest('hex');
  return `verification:full-test:${hash}`;
}

export function canonicalFullTestFailureOccurrence(input: {
  readonly deliveryId: string;
  readonly authorizationRef: string;
  readonly sourceResultRef: string;
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    deliveryId: input.deliveryId,
    authorizationRef: input.authorizationRef,
    sourceResultRef: input.sourceResultRef,
  });
}

export function fullTestFailureFindingIdFor(input: {
  readonly deliveryId: string;
  readonly authorizationRef: string;
  readonly sourceResultRef: string;
}): string {
  const hash = createHash('sha256')
    .update(canonicalFullTestFailureOccurrence(input), 'utf8')
    .digest('hex');
  return `full-test-failure:${hash}`;
}

export function deriveFullTestFailureFinding(input: {
  readonly deliveryId: string;
  readonly authorizationRef: string;
  readonly result: FullTestTerminalResult;
}): FullTestFailureFinding {
  const sourceResultRef = input.result.resultRef;
  return {
    schemaVersion: 1,
    findingId: fullTestFailureFindingIdFor({
      deliveryId: input.deliveryId,
      authorizationRef: input.authorizationRef,
      sourceResultRef,
    }),
    authorizationRef: input.authorizationRef,
    sourceResultRef,
    severity: 'blocking',
    summary: input.result.summary,
    affectedScope: 'delivery',
    requiredOwnerDecision: 'corrective-change-or-cancel-delivery',
  };
}
