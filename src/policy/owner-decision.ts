/**
 * Owner authorization matching for Policy.
 *
 * A1 freezes Owner applicability as typed decision + Delivery + optional
 * Change.id. Run ownerAuthorization strings are not authority.
 */
import type { FormalAction } from '../domain/actions.js';
import type { OwnerAuthorizationFact } from '../facts/formal-fact-snapshot.js';
import type { AuthorizationOnlyOwnerDecision } from '../domain/a1-types.js';
import {
  type OwnerDecision,
  isOwnerDecision,
} from './types.js';

export const AUTHORIZATION_SCOPES = [
  'apply',
  'archive',
  'full-test',
  'finalize',
] as const;

export type AuthorizationScope = (typeof AUTHORIZATION_SCOPES)[number];

const ACTION_DECISION: Readonly<Partial<Record<FormalAction, AuthorizationOnlyOwnerDecision>>> = {
  apply: 'authorize-apply',
  archive: 'authorize-archive',
};

export function decisionForAction(
  action: FormalAction,
): AuthorizationOnlyOwnerDecision | null {
  return ACTION_DECISION[action] ?? null;
}

/**
 * Compatibility naming for callers that still speak in action scope terms.
 * New Policy code should prefer hasOwnerAuthorization().
 */
export function scopeForAction(action: FormalAction): AuthorizationScope | null {
  if (action === 'apply') return 'apply';
  if (action === 'archive') return 'archive';
  return null;
}

export function hasOwnerAuthorization(
  ownerAuthorizations: readonly OwnerAuthorizationFact[],
  decision: AuthorizationOnlyOwnerDecision,
  deliveryId: string,
  changeId?: string,
): boolean {
  return ownerAuthorizations.some((fact) => {
    if (fact.decision !== decision || fact.deliveryId !== deliveryId) return false;
    if (changeId === undefined) return fact.changeId === undefined;
    return fact.changeId === changeId;
  });
}

export function isAuthorized(
  ownerAuthorizations: readonly OwnerAuthorizationFact[],
  action: FormalAction,
  deliveryId: string,
  changeId: string,
): boolean {
  const decision = decisionForAction(action);
  return decision !== null &&
    hasOwnerAuthorization(ownerAuthorizations, decision, deliveryId, changeId);
}

export { isOwnerDecision };

export const ACTION_AUTHORIZATION_DECISIONS: readonly OwnerDecision[] = [
  'authorize-apply',
  'authorize-archive',
  'authorize-full-test',
  'authorize-delivery-finalize',
];
