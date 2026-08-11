/**
 * B1 lean-run-and-action-package: fixed Change-only Standard Action Catalog.
 *
 * Standard FormalAction contains exactly the ten Change lifecycle Actions.
 * Delivery Full Test / Finalize are Delivery behaviors, not Standard Actions
 * or Runs. `review` is a unified entry intent, not a formal Action.
 */

import type { ActionDefinition, Role } from './types.js';

export const CHANGE_ACTIONS = [
  'explore',
  'review-explore',
  'revise-explore',
  'propose',
  'review-propose',
  'revise-propose',
  'apply',
  'review-apply',
  'revise-apply',
  'archive',
] as const;

export type ChangeAction = (typeof CHANGE_ACTIONS)[number];
export type FormalAction = ChangeAction;
export const ACTION_CATALOG: readonly FormalAction[] = CHANGE_ACTIONS;

export const ACTION_DEFINITION_VERSION = 1 as const;

export const ACTION_DEFINITIONS: Readonly<Record<ChangeAction, ActionDefinition>> = {
  explore: {
    action: 'explore',
    version: ACTION_DEFINITION_VERSION,
    role: 'author',
    goalClass: 'investigate-change',
    mutationClass: 'explore-planning-only',
    outputClass: 'current-explore-artifact-set',
    terminalContract: {
      kind: 'artifact',
      verdictRequired: false,
      bindsReviewedRun: false,
      bindsSourceReview: false,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
  'review-explore': {
    action: 'review-explore',
    version: ACTION_DEFINITION_VERSION,
    role: 'reviewer',
    goalClass: 'judge-explore',
    mutationClass: 'reviewer-result-only',
    outputClass: 'review-verdict-findings',
    terminalContract: {
      kind: 'review',
      verdictRequired: true,
      bindsReviewedRun: true,
      bindsSourceReview: false,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
  'revise-explore': {
    action: 'revise-explore',
    version: ACTION_DEFINITION_VERSION,
    role: 'author',
    goalClass: 'close-explore-author-findings',
    mutationClass: 'explore-planning-revision-only',
    outputClass: 'current-explore-artifact-set',
    terminalContract: {
      kind: 'artifact',
      verdictRequired: false,
      bindsReviewedRun: false,
      bindsSourceReview: true,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
  propose: {
    action: 'propose',
    version: ACTION_DEFINITION_VERSION,
    role: 'author',
    goalClass: 'freeze-change-contract',
    mutationClass: 'proposal-bundle-only',
    outputClass: 'current-proposal-bundle-set',
    terminalContract: {
      kind: 'artifact',
      verdictRequired: false,
      bindsReviewedRun: false,
      bindsSourceReview: false,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
  'review-propose': {
    action: 'review-propose',
    version: ACTION_DEFINITION_VERSION,
    role: 'reviewer',
    goalClass: 'judge-proposal',
    mutationClass: 'reviewer-result-only',
    outputClass: 'review-verdict-findings',
    terminalContract: {
      kind: 'review',
      verdictRequired: true,
      bindsReviewedRun: true,
      bindsSourceReview: false,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
  'revise-propose': {
    action: 'revise-propose',
    version: ACTION_DEFINITION_VERSION,
    role: 'author',
    goalClass: 'close-proposal-author-findings',
    mutationClass: 'proposal-bundle-revision-only',
    outputClass: 'current-proposal-bundle-set',
    terminalContract: {
      kind: 'artifact',
      verdictRequired: false,
      bindsReviewedRun: false,
      bindsSourceReview: true,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
  apply: {
    action: 'apply',
    version: ACTION_DEFINITION_VERSION,
    role: 'author',
    goalClass: 'implement-approved-contract',
    mutationClass: 'approved-implementation-and-verification',
    outputClass: 'implementation-candidate-and-authority-files',
    terminalContract: {
      kind: 'implementation',
      verdictRequired: false,
      bindsReviewedRun: false,
      bindsSourceReview: false,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
  'review-apply': {
    action: 'review-apply',
    version: ACTION_DEFINITION_VERSION,
    role: 'reviewer',
    goalClass: 'judge-implementation-and-verification',
    mutationClass: 'reviewer-result-only',
    outputClass: 'review-verdict-findings-plus-verification-ref',
    terminalContract: {
      kind: 'review',
      verdictRequired: true,
      bindsReviewedRun: true,
      bindsSourceReview: false,
      verificationSummaryRef: 'core-derived',
      gitCheckpointOutputAllowed: false,
    },
  },
  'revise-apply': {
    action: 'revise-apply',
    version: ACTION_DEFINITION_VERSION,
    role: 'author',
    goalClass: 'close-apply-author-findings',
    mutationClass: 'implementation-and-verification-revision',
    outputClass: 'revised-implementation-candidate',
    terminalContract: {
      kind: 'implementation',
      verdictRequired: false,
      bindsReviewedRun: false,
      bindsSourceReview: true,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
  archive: {
    action: 'archive',
    version: ACTION_DEFINITION_VERSION,
    role: 'author',
    goalClass: 'close-change',
    mutationClass: 'openspec-archive-and-change-completion',
    outputClass: 'archive-operation-and-completed-state',
    terminalContract: {
      kind: 'archive',
      verdictRequired: false,
      bindsReviewedRun: false,
      bindsSourceReview: false,
      verificationSummaryRef: 'none',
      gitCheckpointOutputAllowed: false,
    },
  },
} as const;

export function isChangeAction(value: string): value is ChangeAction {
  return (CHANGE_ACTIONS as readonly string[]).includes(value);
}

export function isFormalAction(value: string): value is FormalAction {
  return isChangeAction(value);
}

export function getActionDefinition(action: ChangeAction): ActionDefinition {
  return ACTION_DEFINITIONS[action];
}

export function expectedRoleForAction(action: ChangeAction): Exclude<Role, 'owner'> {
  return ACTION_DEFINITIONS[action].role;
}

export function isRoleAllowedForAction(action: ChangeAction, role: Role): boolean {
  return ACTION_DEFINITIONS[action].role === role;
}
