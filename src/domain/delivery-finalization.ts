import { createHash } from 'node:crypto';
import { FlowkitError } from '../shared/errors.js';

const SHA40 = /^[0-9a-f]{40}$/;
const OWNER = /^owner:[0-9a-f]{64}$/;
const CYCLE = /^architecture-cycle:[0-9a-f]{64}$/;
const QUAL = /^delivery-finalization-qualification:[0-9a-f]{64}$/;
const CAND = /^delivery-final-candidate:[0-9a-f]{64}$/;

export type FinalizationArchitectureDisposition =
  | { readonly kind: 'accepted'; readonly cycleRef: string; readonly ownerAcceptanceRef: string }
  | { readonly kind: 'not-applicable' };

export interface DeliveryFinalizationQualification {
  readonly schemaVersion: 1;
  readonly qualificationRef: string;
  readonly deliveryId: string;
  readonly fullTestAuthorizationRef: string;
  readonly fullTestResultRef: string;
  readonly qualifiedBaseRevision: string;
  readonly architecture: FinalizationArchitectureDisposition;
}

export interface DeliveryFinalizationProjection {
  readonly schemaVersion: 1;
  readonly qualificationRef: string;
  readonly ownerAuthorizationRef: string;
  readonly candidateRef: string;
}

export interface DeliveryFinalCandidateFile {
  readonly path: string;
  readonly sha256: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(prefix: string, value: unknown): string {
  return `${prefix}:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

export function finalizationQualificationRefFor(input: Omit<DeliveryFinalizationQualification, 'qualificationRef'>): string {
  return hash('delivery-finalization-qualification', input);
}

export function buildDeliveryFinalizationQualification(input: Omit<DeliveryFinalizationQualification, 'schemaVersion' | 'qualificationRef'>): DeliveryFinalizationQualification {
  if (!SHA40.test(input.qualifiedBaseRevision)) throw new FlowkitError('FINALIZATION_QUALIFICATION_INVALID', 'qualifiedBaseRevision must be an exact Git revision');
  if (!OWNER.test(input.fullTestAuthorizationRef)) throw new FlowkitError('FINALIZATION_QUALIFICATION_INVALID', 'fullTestAuthorizationRef must be an Owner ref');
  if (input.architecture.kind === 'accepted') {
    if (!CYCLE.test(input.architecture.cycleRef) || !OWNER.test(input.architecture.ownerAcceptanceRef)) {
      throw new FlowkitError('FINALIZATION_QUALIFICATION_INVALID', 'accepted architecture disposition is malformed');
    }
  }
  const base = { schemaVersion: 1 as const, ...input };
  return { ...base, qualificationRef: finalizationQualificationRefFor(base) };
}

export function deliveryFinalCandidateRefFor(input: {
  readonly deliveryId: string;
  readonly qualifiedBaseRevision: string;
  readonly files: readonly DeliveryFinalCandidateFile[];
}): string {
  if (!SHA40.test(input.qualifiedBaseRevision)) throw new FlowkitError('DELIVERY_FINAL_CANDIDATE_INVALID', 'qualifiedBaseRevision must be an exact Git revision');
  const files = [...input.files].sort((a, b) => a.path.localeCompare(b.path));
  return hash('delivery-final-candidate', { deliveryId: input.deliveryId, qualifiedBaseRevision: input.qualifiedBaseRevision, files });
}

export function parseDeliveryFinalizationProjection(value: unknown): DeliveryFinalizationProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FlowkitError('DELIVERY_FINALIZATION_INVALID', 'delivery.finalization must be a mapping');
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const expected = ['candidateRef', 'ownerAuthorizationRef', 'qualificationRef', 'schemaVersion'];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new FlowkitError('DELIVERY_FINALIZATION_INVALID', 'delivery.finalization has unsupported or missing fields');
  if (obj.schemaVersion !== 1 || typeof obj.qualificationRef !== 'string' || !QUAL.test(obj.qualificationRef) || typeof obj.ownerAuthorizationRef !== 'string' || !OWNER.test(obj.ownerAuthorizationRef) || typeof obj.candidateRef !== 'string' || !CAND.test(obj.candidateRef)) {
    throw new FlowkitError('DELIVERY_FINALIZATION_INVALID', 'delivery.finalization fields are invalid');
  }
  return { schemaVersion: 1, qualificationRef: obj.qualificationRef, ownerAuthorizationRef: obj.ownerAuthorizationRef, candidateRef: obj.candidateRef };
}

export function isFinalizationQualificationRef(value: string): boolean { return QUAL.test(value); }
