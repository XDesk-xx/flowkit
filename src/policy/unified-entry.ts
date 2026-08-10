/**
 * D1 policy-engine: unified `review` / `revise` entry resolution (Section 9).
 *
 * `review` and `revise` are unified execution entry points — they are NOT
 * formal Actions (absent from B1 `ACTION_CATALOG`). Policy MUST resolve them
 * to a concrete `review-S` / `revise-S` formal Action using the formal facts,
 * or return `blocked` when they cannot be uniquely resolved.
 *
 *   `review`  : determine active stage S → if `canRun(review-S)` allowed,
 *               resolve to `review-S`; otherwise blocked.
 *   `revise`  : determine active stage S → if Current Verdict = changes-
 *               requested AND lineage match, resolve to `revise-S`; otherwise
 *               blocked.
 *
 * Resolution never returns `owner-decision` — only `action` or `blocked`.
 */

import type { ChangeAction } from '../domain/actions.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import {
  type PolicyResult,
  actionResult,
  blockedResult,
} from './types.js';
import { canRun } from './can-run.js';
import { computeLineage } from './lineage.js';
import { detectStage, reviewAction, reviseAction } from './stage-detector.js';
import type { Stage } from './stage-detector.js';
import { getActiveChange } from './preconditions.js';
import { ambiguousStateDiagnosis } from './blocked-diagnosis.js';

/**
 * Stages that support a `review-S` / `revise-S` action. `archive` has no
 * review/revise action.
 */
const REVIEWABLE_STAGES: readonly Stage[] = ['explore', 'propose', 'apply'];

/**
 * Resolve the unified `review` entry to a concrete `review-S` Action.
 *
 * Determines the active stage S from the active Change's Run history, then
 * delegates to `canRun(review-S)`. When allowed → `{ kind: 'action', action:
 * review-S }`. When not allowed (e.g. match+changes-requested per D1-10, or no
 * artifact) → `blocked`.
 */
export function resolveReview(snapshot: FormalFactSnapshot): PolicyResult {
  const change = getActiveChange(snapshot);
  if (change === null) {
    return blockedResult(
      ambiguousStateDiagnosis('review: no active Change to review'),
    );
  }
  const stage = detectStage(snapshot.runs, change.id);
  if (!(REVIEWABLE_STAGES as readonly string[]).includes(stage)) {
    return blockedResult(
      ambiguousStateDiagnosis(`review: stage ${stage} has no review action`),
    );
  }
  const action = reviewAction(stage);
  const result = canRun(snapshot, action);
  if (result.allowed) {
    return actionResult(action);
  }
  return blockedResult(
    ambiguousStateDiagnosis(
      `review: canRun(${action}) not allowed: ${result.unmetPreconditions.join(', ')}`,
    ),
  );
}

/**
 * Resolve the unified `revise` entry to a concrete `revise-S` Action.
 *
 * Determines the active stage S, then checks Current Verdict = changes-
 * requested AND lineage match. When both hold → `{ kind: 'action', action:
 * revise-S }`. Otherwise → `blocked` (no valid changes-requested verdict or
 * verdict superseded).
 */
export function resolveRevise(snapshot: FormalFactSnapshot): PolicyResult {
  const change = getActiveChange(snapshot);
  if (change === null) {
    return blockedResult(
      ambiguousStateDiagnosis('revise: no active Change to revise'),
    );
  }
  const stage = detectStage(snapshot.runs, change.id);
  if (!(REVIEWABLE_STAGES as readonly string[]).includes(stage)) {
    return blockedResult(
      ambiguousStateDiagnosis(`revise: stage ${stage} has no revise action`),
    );
  }
  const lineage = computeLineage(
    snapshot.runs,
    snapshot.reviewVerdicts,
    change.id,
    stage,
  );
  if (lineage.match && lineage.verdict === 'changes-requested') {
    return actionResult(reviseAction(stage));
  }
  return blockedResult(
    ambiguousStateDiagnosis(
      `revise: stage ${stage} has no matching changes-requested verdict`,
    ),
  );
}

/**
 * Re-export `ChangeAction` for callers that import from this module.
 */
export type { ChangeAction };
