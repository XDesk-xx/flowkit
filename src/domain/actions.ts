/**
 * B1 domain-and-state-schema: fixed Action Catalog.
 *
 * The catalog is a `const` array + `as const` + `typeof` extraction — no
 * `enum`. It contains exactly ten Change Actions and two Delivery Actions.
 *
 * `review`, `revise`, and `change-checkpoint` are intentionally absent:
 *   - `review` / `revise` are unified entry points, not formal Actions;
 *   - `change-checkpoint` is a Git formal boundary, not a formal Action.
 * The frozen core-model spec lists ten formal Change Actions and does not
 * include `change-checkpoint`; that source conflict is resolved in favor of
 * the frozen spec (B1-RE-001).
 */

/**
 * The ten formal Change Actions, in lifecycle order.
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

/**
 * The two formal Delivery Actions.
 */
export const DELIVERY_ACTIONS = ['full-test', 'delivery-finalize'] as const;

/**
 * Union type of all formal Change Actions.
 */
export type ChangeAction = (typeof CHANGE_ACTIONS)[number];

/**
 * Union type of all formal Delivery Actions.
 */
export type DeliveryAction = (typeof DELIVERY_ACTIONS)[number];

/**
 * Union type of all formal Actions (Change + Delivery).
 */
export type FormalAction = ChangeAction | DeliveryAction;

/**
 * Read-only snapshot of the complete Action Catalog.
 */
export const ACTION_CATALOG: readonly FormalAction[] = [
  ...CHANGE_ACTIONS,
  ...DELIVERY_ACTIONS,
];

/**
 * Returns `true` when `value` is a recognized formal Change Action.
 */
export function isChangeAction(value: string): value is ChangeAction {
  return (CHANGE_ACTIONS as readonly string[]).includes(value);
}

/**
 * Returns `true` when `value` is a recognized formal Delivery Action.
 */
export function isDeliveryAction(value: string): value is DeliveryAction {
  return (DELIVERY_ACTIONS as readonly string[]).includes(value);
}

/**
 * Returns `true` when `value` is any recognized formal Action.
 */
export function isFormalAction(value: string): value is FormalAction {
  return isChangeAction(value) || isDeliveryAction(value);
}
