/**
 * D1 policy-engine: `canRun(snapshot, action)` implementation.
 *
 * `canRun` validates whether a specific formal Action may execute against the
 * current `FormalFactSnapshot`, returning a `CanRunResult`.
 *
 * Evaluation order (spec: "canRun 校验 Action 前置条件"):
 *   1. `snapshot.conflicts` non-empty → `allowed:false`, `conflictDimensions`
 *      lists every conflict's dimension (fail-closed; conflicts override all
 *      other preconditions — D1-3).
 *   2. `action` not in B1 `ACTION_CATALOG` → `allowed:false`,
 *      `unmetPreconditions: ['unknown-action']`.
 *   3. Action-specific preconditions via `evaluatePreconditions`.
 *   4. `allowed:true` iff `unmetPreconditions` is empty AND
 *      `conflictDimensions` is empty.
 *
 * Pure: reads `snapshot` only, never mutates input or calls I/O.
 */

import { isFormalAction } from '../domain/actions.js';
import type { FormalAction } from '../domain/actions.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import type { CanRunResult } from './types.js';
import { evaluatePreconditions } from './preconditions.js';

/**
 * Extract the conflict dimensions from `snapshot.conflicts`.
 */
function conflictDimensions(
  snapshot: FormalFactSnapshot,
): readonly string[] {
  return snapshot.conflicts.map((c) => c.dimension);
}

/**
 * Evaluate whether `action` may execute against `snapshot`.
 *
 * @returns A `CanRunResult` with `allowed`, `unmetPreconditions` and
 *   `conflictDimensions`. `allowed` is `true` iff both arrays are empty.
 */
export function canRun(
  snapshot: FormalFactSnapshot,
  action: FormalAction,
): CanRunResult {
  const dims = conflictDimensions(snapshot);

  // Fail-closed: conflicts override every other check (D1-3).
  if (dims.length > 0) {
    return {
      action,
      allowed: false,
      unmetPreconditions: [],
      conflictDimensions: dims,
    };
  }

  // Unknown action → reject (B1 catalog is the only source of actions).
  if (!isFormalAction(action)) {
    return {
      action,
      allowed: false,
      unmetPreconditions: ['unknown-action'],
      conflictDimensions: [],
    };
  }

  const unmet = evaluatePreconditions(snapshot, action);
  const allowed = unmet.length === 0 && dims.length === 0;
  return {
    action,
    allowed,
    unmetPreconditions: unmet,
    conflictDimensions: dims,
  };
}
