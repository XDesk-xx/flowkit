import { FlowkitError } from '../../shared/errors.js';

export interface VerificationModule {
  readonly id: string;
  readonly ownershipSelectors: readonly string[];
  readonly dependsOn: readonly string[];
  readonly verificationScopes: readonly string[];
  readonly capabilityIds: readonly string[];
}

export interface AffectedVerificationSelection {
  readonly seedModuleIds: readonly string[];
  readonly moduleIds: readonly string[];
  readonly capabilityIds: readonly string[];
  readonly verificationScopes: readonly string[];
}

/**
 * Closed, compile-time authority for mapping observed Flowkit paths to the
 * verification scopes which must be considered for an Apply result.
 */
export const VERIFICATION_MODULE_MAP: readonly VerificationModule[] = [
  module('change-contract', ['02-change-execution-loop-delivery-implementation-reference-v3.md', 'openspec/changes/change-verification-selection-and-change-set', 'openspec/delivery-groups'], [], ['npx openspec validate change-verification-selection-and-change-set --strict'], ['flowkit-change-verification-selection', 'flowkit-core-model', 'flowkit-formal-fact-reader-and-persistence', 'flowkit-lean-run-and-action-package', 'flowkit-openspec-1-7-thin-integration', 'flowkit-policy-engine', 'flowkit-runtime-foundation']),
  module('core-model', ['src/domain'], [], ['npm run typecheck', 'node --test --import tsx tests/unit/persistence/serialization.test.ts'], ['flowkit-core-model']),
  module('execution', ['src/facts', 'src/policy', 'src/services', 'tests/unit/facts', 'tests/unit/policy', 'tests/unit/services'], ['core-model', 'persistence'], ['npm run typecheck', 'node --test --import tsx tests/unit/services/b1-run-execution-service.test.ts'], ['flowkit-policy-engine', 'flowkit-lean-run-and-action-package']),
  module('openspec-runtime', ['src/integrations/openspec', 'src/shared/external-command.ts', 'tests/integration', 'tests/unit/integrations', 'tests/unit/external-command.test.ts'], ['core-model'], ['npm run typecheck', 'node --test --import tsx tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/external-command.test.ts'], ['flowkit-openspec-1-7-thin-integration', 'flowkit-runtime-foundation']),
  module('persistence', ['src/persistence', 'tests/unit/persistence'], ['core-model'], ['npm run typecheck', 'node --test --import tsx tests/unit/persistence/run-persistence.test.ts'], ['flowkit-formal-fact-reader-and-persistence', 'flowkit-lean-run-and-action-package']),
  module('verification-selection', ['src/verification/change-selection', 'tests/unit/verification/change-selection'], ['core-model', 'persistence', 'execution', 'openspec-runtime'], ['npm run typecheck', 'node --test --import tsx tests/unit/verification/change-selection/*.test.ts'], ['flowkit-change-verification-selection']),
];

function module(
  id: string,
  ownershipSelectors: readonly string[],
  dependsOn: readonly string[],
  verificationScopes: readonly string[],
  capabilityIds: readonly string[],
): VerificationModule {
  return { id, ownershipSelectors, dependsOn, verificationScopes, capabilityIds };
}

export function selectAffectedVerificationModules(actualPaths: readonly string[]): AffectedVerificationSelection {
  validateVerificationModuleMap(VERIFICATION_MODULE_MAP);
  const seeds = actualPaths.map((path) => {
    const matches = VERIFICATION_MODULE_MAP.filter((candidate) => candidate.ownershipSelectors.some((selector) => owns(selector, path)));
    if (matches.length !== 1) {
      throw new FlowkitError('VERIFICATION_MODULE_SELECTION_FAILED', 'Actual change path must map to exactly one verification module', { path, matches: matches.map((candidate) => candidate.id) });
    }
    return matches[0]!.id;
  });
  const byId = new Map(VERIFICATION_MODULE_MAP.map((candidate) => [candidate.id, candidate]));
  const reverse = new Map<string, string[]>();
  for (const candidate of VERIFICATION_MODULE_MAP) {
    for (const dependency of candidate.dependsOn) {
      const consumers = reverse.get(dependency) ?? [];
      consumers.push(candidate.id);
      reverse.set(dependency, consumers);
    }
  }
  const included = new Set(seeds);
  const queue = [...included];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const consumer of reverse.get(current) ?? []) {
      if (!included.has(consumer)) {
        included.add(consumer);
        queue.push(consumer);
      }
    }
  }
  const moduleIds = [...included].sort();
  const modules = moduleIds.map((id) => byId.get(id)!);
  return {
    seedModuleIds: [...new Set(seeds)].sort(),
    moduleIds,
    capabilityIds: [...new Set(modules.flatMap((candidate) => candidate.capabilityIds))].sort(),
    verificationScopes: [...new Set(modules.flatMap((candidate) => candidate.verificationScopes))].sort(),
  };
}

export function validateVerificationModuleMap(map: readonly VerificationModule[]): void {
  const ids = map.map((candidate) => candidate.id);
  if (ids.length === 0 || new Set(ids).size !== ids.length || [...ids].sort().some((id, index) => id !== ids[index])) {
    throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module ids must be non-empty, unique, and lexical sorted');
  }
  for (const candidate of map) {
    if (candidate.ownershipSelectors.length === 0 || candidate.verificationScopes.length === 0 || candidate.capabilityIds.length === 0) {
      throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification modules require ownership, scope, and capability declarations', { moduleId: candidate.id });
    }
    for (const dependency of candidate.dependsOn) if (!ids.includes(dependency)) {
      throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module dependency is unknown', { moduleId: candidate.id, dependency });
    }
  }
  for (let left = 0; left < map.length; left += 1) for (let right = left + 1; right < map.length; right += 1) {
    for (const a of map[left]!.ownershipSelectors) for (const b of map[right]!.ownershipSelectors) {
      if (owns(a, b) || owns(b, a)) throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module ownership selectors overlap', { a, b });
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(map.map((candidate) => [candidate.id, candidate]));
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module dependencies contain a cycle', { id });
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

function owns(selector: string, path: string): boolean {
  return selector === path || path.startsWith(`${selector}/`);
}
