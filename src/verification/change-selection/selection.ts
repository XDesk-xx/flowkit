import { createHash } from 'node:crypto';

import type { ActualChangeSetEntry } from './contracts.js';
import {
  CLOSED_VERIFICATION_SCOPES,
  selectAffectedVerificationModules,
  VERIFICATION_MODULE_MAP,
  VERIFICATION_MODULE_MAP_LOGICAL_REF,
} from './module-map.js';
import { FlowkitError } from '../../shared/errors.js';

export type CapabilityRelation =
  | { readonly kind: 'matched' }
  | { readonly kind: 'not-applicable'; readonly predicateId: 'no-candidate-change' };

export interface VerificationSelection {
  readonly moduleMapLogicalRef: string;
  /** Point-in-time content fingerprint of the source-controlled Verification Catalog. */
  readonly moduleMapFingerprint: string;
  readonly seedModuleIds: readonly string[];
  readonly moduleIds: readonly string[];
  readonly capabilityIds: readonly string[];
  readonly capabilityRefs: readonly string[];
  readonly capabilityRelation: CapabilityRelation;
  /** Historical field name; current values are stable logical check ids, not physical commands. */
  readonly verificationScopes: readonly string[];
  readonly selectionFingerprint: string;
}

/** Build deterministic current verification authority from Core-observed change paths. */
export function buildVerificationSelection(
  actualChangeSet: readonly ActualChangeSetEntry[],
  capabilityRefs: readonly string[],
): VerificationSelection {
  const normalizedCapabilityRefs = [...new Set(capabilityRefs)].sort();
  const capabilityIds = normalizedCapabilityRefs.map(capabilityIdFromRef);
  if (new Set(capabilityIds).size !== capabilityIds.length) {
    throw new FlowkitError('VERIFICATION_CAPABILITY_SELECTION_FAILED', 'OpenSpec delta capability ids must be unique', { capabilityRefs: normalizedCapabilityRefs });
  }
  const selection = selectAffectedVerificationModules(actualChangeSet.map((entry) => entry.path));
  if (selection.notApplicableProof !== undefined) {
    if (capabilityIds.length !== 0) {
      throw new FlowkitError('VERIFICATION_CAPABILITY_SELECTION_FAILED', 'not-applicable requires no delta capability relation to prove', { capabilityIds });
    }
    const payload = stablePayload({
      moduleMapFingerprint: currentVerificationCatalogFingerprint(),
      seedModuleIds: [],
      moduleIds: [],
      capabilityIds: [],
      capabilityRefs: [],
      capabilityRelation: { kind: 'not-applicable' as const, predicateId: selection.notApplicableProof.predicateId },
      verificationScopes: [],
    });
    return { ...payload, selectionFingerprint: canonicalFingerprint(payload) };
  }
  for (const moduleId of selection.seedModuleIds) {
    const required = selectionForModule(moduleId);
    if (!required.some((capabilityId) => capabilityIds.includes(capabilityId))) {
      throw new FlowkitError('VERIFICATION_CAPABILITY_SELECTION_FAILED', 'Every seed verification module requires an applicable OpenSpec delta capability', { moduleId, required, available: capabilityIds });
    }
  }
  const unknownCapabilities = capabilityIds.filter((capabilityId) => !selection.capabilityIds.includes(capabilityId));
  if (unknownCapabilities.length > 0) {
    throw new FlowkitError('VERIFICATION_CAPABILITY_SELECTION_FAILED', 'Current OpenSpec delta contains a capability unrelated to the selected verification modules', { unknownCapabilities, selectedModuleIds: selection.moduleIds });
  }
  const payload = stablePayload({
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: selection.seedModuleIds,
    moduleIds: selection.moduleIds,
    capabilityIds,
    capabilityRefs: normalizedCapabilityRefs,
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: [...new Set([
      ...selection.verificationScopes,
      'openspec-current-change-archive-sync',
      'openspec-current-change-strict',
    ])].sort(),
  });
  return { ...payload, selectionFingerprint: canonicalFingerprint(payload) };
}

/**
 * Bounded historical reader. It validates only persisted closed content and its
 * internal fingerprint; future/current Catalog bytes are deliberately not an authority.
 */
export function validateVerificationSelection(value: unknown): VerificationSelection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('verification selection must be an object');
  const obj = value as Record<string, unknown>;
  const expected = ['capabilityIds', 'capabilityRefs', 'capabilityRelation', 'moduleIds', 'moduleMapFingerprint', 'moduleMapLogicalRef', 'seedModuleIds', 'selectionFingerprint', 'verificationScopes'];
  const keys = Object.keys(obj).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail('verification selection must use the closed shape');
  if (obj['moduleMapLogicalRef'] !== VERIFICATION_MODULE_MAP_LOGICAL_REF) fail('verification selection moduleMapLogicalRef is not canonical');
  const moduleMapFingerprint = requireSha(obj['moduleMapFingerprint'], 'moduleMapFingerprint');
  const seedModuleIds = sortedStrings(obj['seedModuleIds'], 'seedModuleIds');
  const moduleIds = sortedStrings(obj['moduleIds'], 'moduleIds');
  const capabilityIds = sortedStrings(obj['capabilityIds'], 'capabilityIds');
  const capabilityRefs = sortedStrings(obj['capabilityRefs'], 'capabilityRefs');
  const verificationScopes = sortedStrings(obj['verificationScopes'], 'verificationScopes');
  const relationRaw = obj['capabilityRelation'];
  if (typeof relationRaw !== 'object' || relationRaw === null || Array.isArray(relationRaw)) fail('capabilityRelation must be an object');
  const relationObj = relationRaw as Record<string, unknown>;
  let capabilityRelation: CapabilityRelation;
  if (relationObj['kind'] === 'matched' && Object.keys(relationObj).length === 1) capabilityRelation = { kind: 'matched' };
  else if (relationObj['kind'] === 'not-applicable' && relationObj['predicateId'] === 'no-candidate-change' && Object.keys(relationObj).sort().join(',') === 'kind,predicateId') capabilityRelation = { kind: 'not-applicable', predicateId: 'no-candidate-change' };
  else fail('capabilityRelation must be matched or closed not-applicable proof');
  if (capabilityRelation.kind === 'not-applicable' && (seedModuleIds.length !== 0 || moduleIds.length !== 0 || capabilityIds.length !== 0 || capabilityRefs.length !== 0 || verificationScopes.length !== 0)) fail('not-applicable selection must not carry selected authority');
  if (capabilityRelation.kind === 'matched' && (moduleIds.length === 0 || capabilityIds.length === 0 || verificationScopes.length === 0)) fail('matched selection requires module/capability/scope authority');
  const payload = stablePayload({ moduleMapFingerprint, seedModuleIds, moduleIds, capabilityIds, capabilityRefs, capabilityRelation, verificationScopes });
  const selectionFingerprint = requireSha(obj['selectionFingerprint'], 'selectionFingerprint');
  // Historical E1 used insertion-order JSON.stringify. Current writer uses canonical JSON.
  if (selectionFingerprint !== canonicalFingerprint(payload) && selectionFingerprint !== legacyFingerprint(payload)) {
    fail('selectionFingerprint does not bind the persisted selection payload');
  }
  return { ...payload, selectionFingerprint };
}

/** Current producer validation additionally exact-binds the current source Catalog. */
export function validateCurrentVerificationSelection(value: unknown): VerificationSelection {
  const selection = validateVerificationSelection(value);
  if (selection.moduleMapFingerprint !== currentVerificationCatalogFingerprint()) {
    fail('verification selection moduleMapFingerprint is stale for the current Catalog');
  }
  const closed = new Set<string>(CLOSED_VERIFICATION_SCOPES);
  if (selection.verificationScopes.some((scope) => !closed.has(scope))) {
    fail('current verification selection contains a non-current logical check id');
  }
  return selection;
}

export function currentVerificationCatalogFingerprint(): string {
  return canonicalFingerprint(VERIFICATION_MODULE_MAP);
}

function stablePayload(input: {
  readonly moduleMapFingerprint: string;
  readonly seedModuleIds: readonly string[];
  readonly moduleIds: readonly string[];
  readonly capabilityIds: readonly string[];
  readonly capabilityRefs: readonly string[];
  readonly capabilityRelation: CapabilityRelation;
  readonly verificationScopes: readonly string[];
}): Omit<VerificationSelection, 'selectionFingerprint'> {
  return {
    moduleMapLogicalRef: VERIFICATION_MODULE_MAP_LOGICAL_REF,
    moduleMapFingerprint: input.moduleMapFingerprint,
    seedModuleIds: input.seedModuleIds,
    moduleIds: input.moduleIds,
    capabilityIds: input.capabilityIds,
    capabilityRefs: input.capabilityRefs,
    capabilityRelation: input.capabilityRelation,
    verificationScopes: input.verificationScopes,
  };
}

function selectionForModule(moduleId: string): readonly string[] {
  const module = VERIFICATION_MODULE_MAP.find((candidate) => candidate.id === moduleId);
  if (module === undefined) throw new FlowkitError('VERIFICATION_MODULE_SELECTION_FAILED', 'Selected verification module is absent from the closed map', { moduleId });
  return module.capabilityIds;
}

function capabilityIdFromRef(ref: string): string {
  const normalized = ref.replaceAll('\\', '/');
  const match = /\/specs\/([^/]+)\/spec\.md$/.exec(normalized);
  if (match === null || match[1] === undefined || !/^flowkit-[a-z0-9-]+$/.test(match[1])) {
    throw new FlowkitError('VERIFICATION_CAPABILITY_SELECTION_FAILED', 'OpenSpec capability ref must be a concrete delta spec path', { ref });
  }
  return match[1];
}

function sortedStrings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item === '')) fail(`${label} must be a string array`);
  const items = value as string[];
  if (new Set(items).size !== items.length || [...items].sort().some((item, index) => item !== items[index])) fail(`${label} must be lexical sorted and unique`);
  return items;
}

function requireSha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(`${label} must be SHA-256`);
  return value;
}

function fail(message: string): never {
  throw new FlowkitError('SCHEMA_VALIDATION_FAILED', message);
}

function legacyFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
