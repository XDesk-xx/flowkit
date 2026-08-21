import type { ChangeState } from './types.js';
import type { FullTestExecutionContract } from './full-test.js';

export type ArchitectureImpactFact = boolean | 'pre-a1-legacy-missing';

export const OWNER_DECISION_RECORD_KINDS = [
  'create-delivery',
  'create-change',
  'activate-change',
  'contract-reset',
  'authorize-apply',
  'authorize-archive',
  'authorize-checkpoint',
  'authorize-full-test',
  'authorize-delivery-finalize',
  'accept-architecture',
] as const;

export type OwnerDecisionRecordKind = (typeof OWNER_DECISION_RECORD_KINDS)[number];

export const AUTHORIZATION_ONLY_OWNER_DECISIONS = [
  'authorize-apply',
  'authorize-archive',
  'authorize-checkpoint',
  'authorize-full-test',
  'authorize-delivery-finalize',
  'accept-architecture',
] as const;

export type AuthorizationOnlyOwnerDecision =
  (typeof AUTHORIZATION_ONLY_OWNER_DECISIONS)[number];

export interface OwnerDecisionRecord {
  readonly ref: string;
  readonly decision: OwnerDecisionRecordKind;
  readonly deliveryId: string;
  readonly changeId?: string;
  /** Bootstrap/D1: structured scope for non-authorization Owner facts such as contract-reset. */
  readonly scope?: string;
  /** Bootstrap/D1: bounded semantic value; sourceRef remains provenance only. */
  readonly requiredOutcomes?: readonly string[];
  /** E1: exact architecture cycle occurrence for architecture Owner facts. */
  readonly architectureCycleRef?: string;
  /** F1: exact Finalize qualification occurrence for fresh authorize-delivery-finalize. */
  readonly finalizationQualificationRef?: string;
  readonly sourceRef: string;
}

export interface ContractResetInput {
  readonly decision: 'contract-reset';
  readonly sourceRef: string;
  readonly changeId: string;
  readonly scope: string;
  readonly requiredOutcomes: readonly string[];
}

export interface ChangeCreateInput {
  readonly key: string;
  readonly id: string;
  readonly goal: string;
  readonly required: boolean;
  readonly dependsOn: readonly string[];
  readonly outputs: readonly string[];
  readonly architectureImpact: boolean;
  readonly corrective?: {
    readonly findingId: string;
    readonly authorizationRef: string;
    readonly sourceResultRef: string;
  };
  readonly architectureRemediation?: {
    readonly cycleRef: string;
  };
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
  readonly fullTestExecution: FullTestExecutionContract;
  readonly changes: readonly ChangeCreateInput[];
}

export interface PersistedChangeInput extends ChangeCreateInput {
  readonly state: ChangeState;
}
