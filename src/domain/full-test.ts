import { createHash } from 'node:crypto';

export const FULL_TEST_LAUNCHER_MODES = ['direct', 'npm-shim'] as const;
export type FullTestLauncherMode = (typeof FULL_TEST_LAUNCHER_MODES)[number];

export const FULL_TEST_TERMINAL_STATUSES = ['passed', 'failed'] as const;
export type FullTestTerminalStatus = (typeof FULL_TEST_TERMINAL_STATUSES)[number];

export interface FullTestExecutionContract {
  readonly id: string;
  readonly kind: 'command';
  readonly command: string;
  readonly args: readonly string[];
  readonly launcherMode: FullTestLauncherMode;
  readonly scope: 'delivery';
  readonly timeoutMs: number;
  readonly resultProtocol: 'flowkit-full-test-result-v1';
  readonly resultAuthority: 'verification';
  readonly expectedTerminalStatuses: readonly ['passed', 'failed'];
}

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
