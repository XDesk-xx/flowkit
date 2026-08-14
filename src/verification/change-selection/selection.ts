import { createHash } from 'node:crypto';

import type { ActualChangeSetEntry } from './contracts.js';
import { selectAffectedVerificationModules, VERIFICATION_MODULE_MAP } from './module-map.js';
import { FlowkitError } from '../../shared/errors.js';

export interface VerificationSelection {
  readonly moduleMapFingerprint: string;
  readonly seedModuleIds: readonly string[];
  readonly moduleIds: readonly string[];
  readonly capabilityIds: readonly string[];
  readonly capabilityRefs: readonly string[];
  readonly verificationScopes: readonly string[];
  readonly selectionFingerprint: string;
}

/** Build deterministic verification authority from Core-observed change paths. */
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
  for (const moduleId of selection.seedModuleIds) {
    const required = selectionForModule(moduleId);
    if (!required.some((capabilityId) => capabilityIds.includes(capabilityId))) {
      throw new FlowkitError('VERIFICATION_CAPABILITY_SELECTION_FAILED', 'Every seed verification module requires an applicable OpenSpec delta capability', {
        moduleId,
        required,
        available: capabilityIds,
      });
    }
  }
  const unknownCapabilities = capabilityIds.filter((capabilityId) => !selection.capabilityIds.includes(capabilityId));
  if (unknownCapabilities.length > 0) {
    throw new FlowkitError('VERIFICATION_CAPABILITY_SELECTION_FAILED', 'Current OpenSpec delta contains a capability unrelated to the selected verification modules', {
      unknownCapabilities,
      selectedModuleIds: selection.moduleIds,
    });
  }
  const payload = {
    seedModuleIds: selection.seedModuleIds,
    moduleIds: selection.moduleIds,
    moduleMapFingerprint: fingerprint(VERIFICATION_MODULE_MAP),
    capabilityIds,
    capabilityRefs: normalizedCapabilityRefs,
    verificationScopes: selection.verificationScopes,
  };
  return { ...payload, selectionFingerprint: fingerprint(payload) };
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

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
