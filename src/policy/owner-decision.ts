/**
 * D1 policy-engine: owner-decision boundary judgments (D1-5, D1-9).
 *
 * Authorization-gated Change Actions (`apply`, `archive`); Delivery Full Test / Finalize authorizations remain Delivery-behavior facts require an owner authorization with the matching scope.
 * When `snapshot.ownerAuthorizations` is empty (C1 Reader's current
 * placeholder behaviour) the gated action returns `owner-decision` — this is
 * correct fail-closed behaviour, NOT `blocked` (D1-7, spec:
 * "ownerAuthorizations 空数组时 owner-decision").
 *
 * `owner-decision` is strictly distinct from `blocked` (D1-9):
 *   - `owner-decision`: system has determined the single required action; the
 *     owner must authorize it. MUST NOT auto-advance.
 *   - `blocked`: system cannot determine a unique action.
 */

import type { FormalAction } from '../domain/actions.js';
import type { OwnerAuthorizationFact } from '../facts/formal-fact-snapshot.js';
import {
  type OwnerDecision,
  isOwnerDecision,
} from './types.js';

// ---------------------------------------------------------------------------
// Authorization scope catalog
// ---------------------------------------------------------------------------

/**
 * The owner-authorization scopes that gate formal Actions. Each gated Action
 * maps to exactly one scope.
 */
export const AUTHORIZATION_SCOPES = [
  'apply',
  'archive',
  'full-test',
  'finalize',
] as const;

/**
 * Union type of the four authorization scopes.
 */
export type AuthorizationScope = (typeof AUTHORIZATION_SCOPES)[number];

/**
 * Map each gated Action to its required authorization scope.
 */
const ACTION_SCOPE: Readonly<Record<string, AuthorizationScope>> = {
  apply: 'apply',
  archive: 'archive',
};

/**
 * Return the authorization scope required for a gated Action, or `null` when
 * the Action is not authorization-gated.
 */
export function scopeForAction(action: FormalAction): AuthorizationScope | null {
  return ACTION_SCOPE[action] ?? null;
}

// ---------------------------------------------------------------------------
// Authorization checks
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `ownerAuthorizations` contains an entry with `scope`.
 *
 * An empty array returns `false` for every scope — this is the correct
 * fail-closed behaviour that yields `owner-decision` (not `blocked`) for gated
 * actions (spec: "ownerAuthorizations 空数组时 owner-decision").
 */
export function hasAuthorizationScope(
  ownerAuthorizations: readonly OwnerAuthorizationFact[],
  scope: AuthorizationScope,
): boolean {
  return ownerAuthorizations.some((a) => a.scope === scope);
}

/**
 * Returns `true` when `ownerAuthorizations` authorizes `action` (i.e. the
 * action is gated and the matching scope is present). Non-gated actions
 * return `false` (they are not authorization-gated).
 */
export function isAuthorized(
  ownerAuthorizations: readonly OwnerAuthorizationFact[],
  action: FormalAction,
): boolean {
  const scope = scopeForAction(action);
  if (scope === null) {
    return false;
  }
  return hasAuthorizationScope(ownerAuthorizations, scope);
}

/**
 * Returns `true` when `value` is a recognized `OwnerDecision` (re-exported
 * type guard for callers that import from this module).
 */
export { isOwnerDecision };

/**
 * The set of owner decisions that authorize an Action (vs. `activate-change`
 * which selects a Change, and `authorize-checkpoint` which authorizes a Git
 * boundary). Used by `next` to decide between `action` and `owner-decision`
 * for gated actions.
 */
export const ACTION_AUTHORIZATION_DECISIONS: readonly OwnerDecision[] = [
  'authorize-apply',
  'authorize-archive',
  'authorize-full-test',
  'authorize-delivery-finalize',
];
