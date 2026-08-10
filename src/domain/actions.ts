/**
 * B1 domain-and-state-schema: fixed Change-only Standard Action Catalog.
 *
 * Standard FormalAction contains exactly the ten Change lifecycle Actions.
 * Delivery Full Test / Finalize are Delivery behaviors, not Standard Actions
 * or Runs. `review` / `revise` remain unified entry points and Checkpoint is a
 * Git boundary.
 */

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

export function isChangeAction(value: string): value is ChangeAction {
  return (CHANGE_ACTIONS as readonly string[]).includes(value);
}

export function isFormalAction(value: string): value is FormalAction {
  return isChangeAction(value);
}
