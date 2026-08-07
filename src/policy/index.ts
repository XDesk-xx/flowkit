/**
 * D1 policy-engine: public entry point.
 *
 * Re-exports the three pure Policy functions (`canRun`, `next`, `diagnose`),
 * the unified `review`/`revise` entry resolvers, and the Policy-specific
 * types. B1/C1 types are not re-exported here — import them from their owning
 * modules.
 */

export { canRun } from './can-run.js';
export { next } from './next.js';
export { diagnose } from './diagnose.js';
export { resolveReview, resolveRevise } from './unified-entry.js';

export type {
  CanRunResult,
  PolicyResult,
  PolicyActionResult,
  PolicyOwnerDecisionResult,
  PolicyBlockedResult,
  OwnerDecision,
  OwnerDecisionContext,
  BlockedDiagnosis,
  BlockedReason,
} from './types.js';
export {
  OWNER_DECISIONS,
  BLOCKED_REASONS,
  isOwnerDecision,
  isBlockedReason,
  actionResult,
  ownerDecisionResult,
  blockedResult,
} from './types.js';

export type { Stage } from './stage-detector.js';
export { STAGES, detectStage } from './stage-detector.js';

export type { LineageState } from './lineage.js';
export {
  currentArtifactRun,
  currentReview,
  lineageMatch,
  computeLineage,
} from './lineage.js';
