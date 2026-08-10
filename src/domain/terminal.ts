/**
 * B1 domain-and-state-schema: terminal immutability checks.
 *
 * Terminal Run statuses are `completed`, `failed`, and `cancelled`. Once a
 * Run reaches a terminal status it must not be mutated further. The
 * persistence layer (C1) calls `assertMutable` before writing; B1 only
 * provides the check.
 */

import { FlowkitError } from '../shared/errors.js';
import type { Run, RunStatus } from './types.js';

/**
 * Set of terminal Run statuses.
 */
const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

/**
 * Returns `true` when `status` is terminal (`completed`, `failed`, or
 * `cancelled`). Returns `false` for `pending`.
 */
export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

/**
 * Assert that a Run is still mutable.
 *
 * @throws {FlowkitError} `RUN_TERMINAL` when `run.status` is terminal.
 */
export function assertMutable(run: Run): void {
  if (isTerminal(run.status)) {
    throw new FlowkitError('RUN_TERMINAL', `Run ${run.runId} is terminal (${run.status}) and cannot be mutated`, {
      runId: run.runId,
      status: run.status,
    });
  }
}
