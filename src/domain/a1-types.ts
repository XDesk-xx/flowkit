import type { ChangeState } from './types.js';

export type ArchitectureImpactFact = boolean | 'pre-a1-legacy-missing';

export const OWNER_DECISION_RECORD_KINDS = [
  'create-delivery',
  'create-change',
  'activate-change',
  'authorize-apply',
  'authorize-archive',
  'authorize-checkpoint',
  'authorize-full-test',
  'authorize-delivery-finalize',
] as const;

export type OwnerDecisionRecordKind = (typeof OWNER_DECISION_RECORD_KINDS)[number];

export const AUTHORIZATION_ONLY_OWNER_DECISIONS = [
  'authorize-apply',
  'authorize-archive',
  'authorize-checkpoint',
  'authorize-full-test',
  'authorize-delivery-finalize',
] as const;

export type AuthorizationOnlyOwnerDecision =
  (typeof AUTHORIZATION_ONLY_OWNER_DECISIONS)[number];

export interface OwnerDecisionRecord {
  readonly ref: string;
  readonly decision: OwnerDecisionRecordKind;
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly sourceRef: string;
}

export interface ChangeCreateInput {
  readonly key: string;
  readonly id: string;
  readonly goal: string;
  readonly required: boolean;
  readonly dependsOn: readonly string[];
  readonly outputs: readonly string[];
  readonly architectureImpact: boolean;
}

export interface DeliveryScopeInput {
  readonly included: readonly string[];
  readonly excluded: readonly string[];
}

export interface DeliveryArchitectureInput {
  readonly impact: boolean;
  readonly archifyPlan: 'required' | 'not-required' | 'deferred' | 'deferred-to-03';
}

export interface DeliveryCreateInput {
  readonly id: string;
  readonly goal: string;
  readonly branch: string;
  readonly scope: DeliveryScopeInput;
  readonly acceptance: readonly string[];
  readonly architecture: DeliveryArchitectureInput;
  readonly fullTestPlan: readonly string[];
  readonly changes: readonly ChangeCreateInput[];
}

export interface PersistedChangeInput extends ChangeCreateInput {
  readonly state: ChangeState;
}
