/**
 * B1 domain-and-state-schema: structural state transition tables.
 *
 * B1 owns only the *structural* transition edges — which state may transition
 * to which state. Semantic preconditions (owner authorization, Verification
 * passed, dependencies completed) belong to D1 Policy and are intentionally
 * absent here.
 *
 * Terminal states have no outgoing edges.
 */

import type {
  ChangeState,
  DeliveryState,
  RunStatus,
} from './types.js';

/**
 * Delivery structural state transitions.
 * `active` → `completed` | `cancelled`; terminals have no outgoing edges.
 */
export const DELIVERY_STATE_TRANSITIONS: Record<
  DeliveryState,
  readonly DeliveryState[]
> = {
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Change structural state transitions.
 * `planned` → `active` | `cancelled`; `active` → `completed` | `cancelled`;
 * terminals have no outgoing edges.
 */
export const CHANGE_STATE_TRANSITIONS: Record<
  ChangeState,
  readonly ChangeState[]
> = {
  planned: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Run structural state transitions.
 * `pending` → `completed` | `failed` | `cancelled`; terminals have no
 * outgoing edges.
 */
export const RUN_STATE_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  pending: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

/**
 * Generic structural transition checker.
 *
 * Returns `true` when `to` is a permitted direct successor of `from` according
 * to the supplied transition `table`. Returns `false` for self-transitions,
 * unknown states, and transitions out of terminal states.
 *
 * @param table - Structural transition table mapping each state to its
 *   permitted successors.
 * @param from - Source state.
 * @param to - Target state.
 */
export function canTransition<S extends string>(
  table: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  if (from === to) {
    return false;
  }
  const targets = table[from];
  if (targets === undefined) {
    return false;
  }
  return targets.includes(to);
}
