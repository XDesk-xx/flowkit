/**
 * D1 policy-engine: `diagnose(snapshot)` — diagnostic variant of `next`.
 *
 * `diagnose` returns a `BlockedDiagnosis` explaining why the Policy is blocked.
 * It is the diagnostic companion to `next`: when `next` returns `blocked`,
 * `diagnose` provides the same (or richer) diagnosis. `diagnose` MUST NOT
 * return `action` or `owner-decision` — only blocked information (task 7.3).
 *
 * When `next` is not blocked, `diagnose` returns a minimal diagnosis noting
 * that no blocking condition was found. This is the defined fallback for the
 * non-blocked case; the blocked reasons enumerated in the spec (task 7.4) only
 * apply when `next` is actually blocked.
 *
 * Pure: reads `snapshot` only (task 7.6).
 */

import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import type { BlockedDiagnosis } from './types.js';
import { next } from './next.js';

/**
 * Compute a `BlockedDiagnosis` for `snapshot`.
 *
 * When `next(snapshot)` is blocked, returns its diagnosis. When `next` returns
 * an `action` or `owner-decision`, returns a minimal diagnosis indicating no
 * blocking condition — `diagnose` never returns `action`/`owner-decision`.
 */
export function diagnose(snapshot: FormalFactSnapshot): BlockedDiagnosis {
  const result = next(snapshot);
  if (result.kind === 'blocked') {
    return enrichDiagnosis(snapshot, result.diagnosis);
  }
  // Non-blocked fallback: no blocked reason applies. Return a minimal
  // diagnosis so the return type is always `BlockedDiagnosis`.
  return {
    reason: 'ambiguous-state',
    unmetPreconditions: [],
    conflicts: [],
    suggestedOwnerActions: [],
  };
}

/**
 * Optionally enrich a blocked diagnosis with additional unmet preconditions
 * gleaned from `canRun`-style checks. Currently a passthrough that preserves
 * the diagnosis from `next`; kept as an extension point for richer detail.
 */
function enrichDiagnosis(
  _snapshot: FormalFactSnapshot,
  diagnosis: BlockedDiagnosis,
): BlockedDiagnosis {
  return diagnosis;
}
