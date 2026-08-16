import { createHash } from 'node:crypto';
import type { OwnerDecisionRecordKind } from './a1-types.js';

export function canonicalOwnerDecisionTuple(input: {
  readonly decision: OwnerDecisionRecordKind;
  readonly deliveryId: string;
  readonly sourceRef: string;
  readonly changeId?: string;
  readonly scope?: string;
  readonly requiredOutcomes?: readonly string[];
}): string {
  const requiredOutcomes = input.requiredOutcomes === undefined
    ? undefined
    : [...new Set(input.requiredOutcomes.map((value) => value.trim()))].sort();
  return JSON.stringify({
    decision: input.decision,
    deliveryId: input.deliveryId,
    ...(input.changeId !== undefined ? { changeId: input.changeId } : {}),
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(requiredOutcomes !== undefined ? { requiredOutcomes } : {}),
    sourceRef: input.sourceRef,
  });
}

export function ownerDecisionRefFor(input: {
  readonly decision: OwnerDecisionRecordKind;
  readonly deliveryId: string;
  readonly sourceRef: string;
  readonly changeId?: string;
  readonly scope?: string;
  readonly requiredOutcomes?: readonly string[];
}): string {
  return `owner:${createHash('sha256')
    .update(canonicalOwnerDecisionTuple(input), 'utf8')
    .digest('hex')}`;
}
