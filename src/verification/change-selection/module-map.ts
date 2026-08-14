import { FlowkitError } from '../../shared/errors.js';

export interface VerificationModule {
  readonly id: string;
  readonly ownershipSelectors: readonly string[];
  readonly dependsOn: readonly string[];
  readonly verificationScopes: readonly string[];
  readonly capabilityIds: readonly string[];
  readonly noApplicablePredicateId?: 'no-candidate-change';
}

export interface AffectedVerificationSelection {
  readonly seedModuleIds: readonly string[];
  readonly moduleIds: readonly string[];
  readonly capabilityIds: readonly string[];
  readonly verificationScopes: readonly string[];
  readonly notApplicableProof?: { readonly predicateId: 'no-candidate-change' };
}

export const VERIFICATION_MODULE_MAP_LOGICAL_REF = 'src/verification/change-selection/module-map.ts';

export const CLOSED_VERIFICATION_SCOPES = [
  'node --test --import tsx tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/external-command.test.ts',
  'node --test --import tsx tests/unit/persistence/run-persistence.test.ts',
  'node --test --import tsx tests/unit/persistence/serialization.test.ts',
  'node --test --import tsx tests/unit/services/b1-run-execution-service.test.ts',
  'node --test --import tsx tests/unit/verification/change-selection/*.test.ts',
  'npm run typecheck',
  'npx openspec validate change-verification-selection-and-change-set --strict',
] as const;

export const CLOSED_CAPABILITY_IDS = [
  'flowkit-change-verification-selection',
  'flowkit-core-model',
  'flowkit-formal-fact-reader-and-persistence',
  'flowkit-lean-run-and-action-package',
  'flowkit-openspec-1-7-thin-integration',
  'flowkit-policy-engine',
  'flowkit-runtime-foundation',
] as const;

const CLOSED_PREDICATES = new Set(['no-candidate-change']);
const CLOSED_SCOPES = new Set<string>(CLOSED_VERIFICATION_SCOPES);
const CLOSED_CAPABILITIES = new Set<string>(CLOSED_CAPABILITY_IDS);

/** Closed, compile-time authority for mapping candidate paths to verification scopes. */
export const VERIFICATION_MODULE_MAP: readonly VerificationModule[] = [
  module(
    'change-contract',
    ['02-change-execution-loop-delivery-implementation-reference-v3.md', 'docs/flowkit-self-hosting-bootstrap-and-migration.md', 'openspec/changes/change-verification-selection-and-change-set', 'openspec/delivery-groups'],
    [],
    ['npx openspec validate change-verification-selection-and-change-set --strict'],
    ['flowkit-change-verification-selection', 'flowkit-core-model', 'flowkit-formal-fact-reader-and-persistence', 'flowkit-lean-run-and-action-package', 'flowkit-openspec-1-7-thin-integration', 'flowkit-policy-engine', 'flowkit-runtime-foundation'],
    'no-candidate-change',
  ),
  module('core-model', ['src/domain'], [], ['node --test --import tsx tests/unit/persistence/serialization.test.ts', 'npm run typecheck'], ['flowkit-core-model']),
  module('execution', ['src/facts', 'src/policy', 'src/services', 'tests/unit/facts', 'tests/unit/policy', 'tests/unit/services'], ['core-model', 'persistence'], ['node --test --import tsx tests/unit/services/b1-run-execution-service.test.ts', 'npm run typecheck'], ['flowkit-lean-run-and-action-package', 'flowkit-policy-engine']),
  module('openspec-runtime', ['src/integrations/openspec', 'src/shared/external-command.ts', 'tests/integration', 'tests/unit/external-command.test.ts', 'tests/unit/integrations'], ['core-model'], ['node --test --import tsx tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/external-command.test.ts', 'npm run typecheck'], ['flowkit-openspec-1-7-thin-integration', 'flowkit-runtime-foundation']),
  module('persistence', ['src/persistence', 'tests/unit/persistence'], ['core-model'], ['node --test --import tsx tests/unit/persistence/run-persistence.test.ts', 'npm run typecheck'], ['flowkit-formal-fact-reader-and-persistence', 'flowkit-lean-run-and-action-package']),
  module('verification-selection', ['src/verification/change-selection', 'tests/fixtures/e1-change-verification-selection', 'tests/unit/verification/change-selection'], ['core-model', 'execution', 'openspec-runtime', 'persistence'], ['node --test --import tsx tests/unit/verification/change-selection/*.test.ts', 'npm run typecheck'], ['flowkit-change-verification-selection']),
];

function module(
  id: string,
  ownershipSelectors: readonly string[],
  dependsOn: readonly string[],
  verificationScopes: readonly string[],
  capabilityIds: readonly string[],
  noApplicablePredicateId?: VerificationModule['noApplicablePredicateId'],
): VerificationModule {
  return { id, ownershipSelectors, dependsOn, verificationScopes, capabilityIds, ...(noApplicablePredicateId !== undefined && { noApplicablePredicateId }) };
}

export function selectAffectedVerificationModules(actualPaths: readonly string[]): AffectedVerificationSelection {
  validateVerificationModuleMap(VERIFICATION_MODULE_MAP);
  if (actualPaths.length === 0) {
    return { seedModuleIds: [], moduleIds: [], capabilityIds: [], verificationScopes: [], notApplicableProof: { predicateId: 'no-candidate-change' } };
  }
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
  for (const consumers of reverse.values()) consumers.sort();
  const included = new Set(seeds);
  const queue = [...included].sort();
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const consumer of reverse.get(current) ?? []) {
      if (!included.has(consumer)) {
        included.add(consumer);
        queue.push(consumer);
        queue.sort();
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
  assertLexicalUnique(ids, 'Verification module ids');
  for (const candidate of map) {
    if (candidate.ownershipSelectors.length === 0 || candidate.verificationScopes.length === 0 || candidate.capabilityIds.length === 0) {
      throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification modules require ownership, scope, and capability declarations', { moduleId: candidate.id });
    }
    assertLexicalUnique(candidate.ownershipSelectors, `ownershipSelectors for ${candidate.id}`);
    assertLexicalUnique(candidate.dependsOn, `dependsOn for ${candidate.id}`, true);
    assertLexicalUnique(candidate.verificationScopes, `verificationScopes for ${candidate.id}`);
    assertLexicalUnique(candidate.capabilityIds, `capabilityIds for ${candidate.id}`);
    for (const dependency of candidate.dependsOn) if (!ids.includes(dependency)) {
      throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module dependency is unknown', { moduleId: candidate.id, dependency });
    }
    for (const scope of candidate.verificationScopes) if (!CLOSED_SCOPES.has(scope)) {
      throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module scope is outside the closed authority', { moduleId: candidate.id, scope });
    }
    for (const capabilityId of candidate.capabilityIds) if (!CLOSED_CAPABILITIES.has(capabilityId)) {
      throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module capability is outside the closed authority', { moduleId: candidate.id, capabilityId });
    }
    if (candidate.noApplicablePredicateId !== undefined && !CLOSED_PREDICATES.has(candidate.noApplicablePredicateId)) {
      throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module no-applicable predicate is outside the closed authority', { moduleId: candidate.id, predicateId: candidate.noApplicablePredicateId });
    }
  }
  const allSelectors: { moduleId: string; selector: string }[] = [];
  for (const candidate of map) {
    for (const selector of candidate.ownershipSelectors) allSelectors.push({ moduleId: candidate.id, selector });
  }
  for (let left = 0; left < allSelectors.length; left += 1) for (let right = left + 1; right < allSelectors.length; right += 1) {
    const a = allSelectors[left]!;
    const b = allSelectors[right]!;
    if (owns(a.selector, b.selector) || owns(b.selector, a.selector)) {
      throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', 'Verification module ownership selectors overlap', { a: a.selector, b: b.selector, aModule: a.moduleId, bModule: b.moduleId });
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

function assertLexicalUnique(values: readonly string[], label: string, allowEmpty = false): void {
  if ((!allowEmpty && values.length === 0) || new Set(values).size !== values.length || [...values].sort().some((value, index) => value !== values[index])) {
    throw new FlowkitError('VERIFICATION_MODULE_MAP_INVALID', `${label} must be${allowEmpty ? '' : ' non-empty,'} unique and lexical sorted`, { values });
  }
}

function owns(selector: string, path: string): boolean {
  return selector === path || path.startsWith(`${selector}/`);
}
