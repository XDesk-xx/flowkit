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
  /** Stable logical check ids. The historical field name remains for bounded persisted compatibility. */
  readonly verificationScopes: readonly string[];
  readonly notApplicableProof?: { readonly predicateId: 'no-candidate-change' };
}

export const VERIFICATION_MODULE_MAP_LOGICAL_REF =
  'src/verification/change-selection/module-map.ts';

/** Stable logical verification identities. Concrete commands belong to the executor. */
export const CLOSED_VERIFICATION_SCOPES = [
  'openspec-current-change-archive-sync',
  'openspec-current-change-strict',
  'tests-architecture',
  'tests-cli',
  'tests-execution',
  'tests-external-tools',
  'tests-openspec-runtime',
  'tests-persistence',
  'tests-serialization',
  'tests-verification',
  'typecheck',
] as const;

export const CLOSED_CAPABILITY_IDS = [
  'flowkit-architecture-assets',
  'flowkit-archive-and-checkpoint-boundary',
  'flowkit-change-cli-end-to-end-and-performance',
  'flowkit-change-verification-generalization-and-lean-run-normalization',
  'flowkit-change-verification-selection',
  'flowkit-core-hardening-and-release-candidate',
  'flowkit-core-model',
  'flowkit-delivery-change-creation-and-owner-input',
  'flowkit-delivery-finalize-and-git-boundary',
  'flowkit-diagnostic-cli',
  'flowkit-external-tool-runtime',
  'flowkit-formal-fact-reader-and-persistence',
  'flowkit-integration-boundaries',
  'flowkit-lean-run-and-action-package',
  'flowkit-openspec-1-7-thin-integration',
  'flowkit-policy-engine',
  'flowkit-runtime-foundation',
  'flowkit-sync-resume-and-single-action-agent-adapter',
] as const;

const CLOSED_PREDICATES = new Set(['no-candidate-change']);
const CLOSED_SCOPES = new Set<string>(CLOSED_VERIFICATION_SCOPES);
const CLOSED_CAPABILITIES = new Set<string>(CLOSED_CAPABILITY_IDS);

const VERIFICATION_SELECTION_CAPABILITIES = [
  'flowkit-archive-and-checkpoint-boundary',
  'flowkit-change-cli-end-to-end-and-performance',
  'flowkit-change-verification-selection',
  'flowkit-core-hardening-and-release-candidate',
  'flowkit-external-tool-runtime',
  'flowkit-formal-fact-reader-and-persistence',
  'flowkit-integration-boundaries',
  'flowkit-lean-run-and-action-package',
  'flowkit-sync-resume-and-single-action-agent-adapter',
] as const;

/** Closed, source-controlled authority for path ownership and logical check selection. */
export const VERIFICATION_MODULE_MAP: readonly VerificationModule[] = [
  module(
    'architecture',
    [
      'architecture',
      'src/architecture',
      'tests/fixtures/d1-architecture-baseline-and-delivery-plan',
      'tests/integration/d1-architecture-baseline-and-delivery-plan.test.ts',
      'tests/integration/e1-architecture-actual-compare-and-system-promotion.test.ts',
      'tests/unit/architecture',
    ],
    ['external-tools'],
    ['tests-architecture', 'typecheck'],
    ['flowkit-architecture-assets'],
  ),
  module(
    'change-contract',
    [
      'docs/flowkit-self-hosting-bootstrap-and-migration.md',
      'openspec/changes',
      'openspec/delivery-groups',
    ],
    [],
    ['openspec-current-change-archive-sync', 'openspec-current-change-strict'],
    [...CLOSED_CAPABILITY_IDS],
    'no-candidate-change',
  ),
  module(
    'cli-diagnostics',
    [
      'src/cli',
      'src/diagnostics',
      'tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts',
      'tests/integration/b1-delivery-findings-and-corrective-change.test.ts',
      'tests/integration/diagnostic-cli-process.test.ts',
      'tests/integration/diagnostic-cli.test.ts',
      'tests/integration/g1-change-cli-end-to-end.test.ts',
      'tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts',
      'tests/unit/cli',
      'tests/unit/diagnostics',
    ],
    ['execution'],
    ['tests-cli', 'typecheck'],
    [
      'flowkit-architecture-assets',
      'flowkit-change-cli-end-to-end-and-performance',
      'flowkit-delivery-finalize-and-git-boundary',
      'flowkit-diagnostic-cli',
      'flowkit-openspec-1-7-thin-integration',
      'flowkit-policy-engine',
      'flowkit-runtime-foundation',
      'flowkit-sync-resume-and-single-action-agent-adapter',
    ],
  ),
  module(
    'core-model',
    ['src/domain', 'tests/unit/domain'],
    [],
    ['tests-serialization', 'typecheck'],
    ['flowkit-core-model', 'flowkit-lean-run-and-action-package'],
  ),
  module(
    'execution',
    [
      'src/facts',
      'src/policy',
      'src/services',
      'tests/integration/f1-archive-and-checkpoint-boundary.test.ts',
      'tests/integration/f1-delivery-finalize-and-git-boundary.test.ts',
      'tests/unit/facts',
      'tests/unit/policy',
      'tests/unit/services',
    ],
    ['core-model', 'persistence'],
    ['tests-execution', 'typecheck'],
    [
      'flowkit-archive-and-checkpoint-boundary',
      'flowkit-change-cli-end-to-end-and-performance',
      'flowkit-change-verification-selection',
      'flowkit-delivery-change-creation-and-owner-input',
      'flowkit-delivery-finalize-and-git-boundary',
      'flowkit-formal-fact-reader-and-persistence',
      'flowkit-lean-run-and-action-package',
      'flowkit-policy-engine',
      'flowkit-sync-resume-and-single-action-agent-adapter',
    ],
  ),
  module(
    'external-tools',
    [
      'src/integrations/archify',
      'src/integrations/external-tools',
      'tests/fixtures/c1-external-tool-runtime-and-archify-cli-contract',
      'tests/integration/c1-external-tool-runtime-and-archify-cli-contract.test.ts',
      'tests/unit/external-tools',
    ],
    ['core-model'],
    ['tests-external-tools', 'typecheck'],
    ['flowkit-external-tool-runtime', 'flowkit-integration-boundaries'],
  ),
  module(
    'openspec-runtime',
    [
      'src/integrations/openspec',
      'src/shared/external-command.ts',
      'tests/integration/openspec-1-7-real-cli.test.ts',
      'tests/unit/external-command.test.ts',
      'tests/unit/integrations',
    ],
    ['core-model', 'execution', 'external-tools'],
    ['tests-openspec-runtime', 'typecheck'],
    [
      'flowkit-archive-and-checkpoint-boundary',
      'flowkit-change-verification-selection',
      'flowkit-core-model',
      'flowkit-openspec-1-7-thin-integration',
      'flowkit-runtime-foundation',
    ],
  ),
  module(
    'persistence',
    ['src/persistence', 'tests/unit/persistence'],
    ['core-model'],
    ['tests-persistence', 'typecheck'],
    [
      'flowkit-formal-fact-reader-and-persistence',
      'flowkit-lean-run-and-action-package',
    ],
  ),
  module(
    'verification-selection',
    [
      'scripts/verification.ts',
      'src/verification/change-selection',
      'tests/fixtures/e2-change-verification-generalization',
      'tests/integration/e1-change-verification-selection.test.ts',
      'tests/integration/e2-change-verification-generalization.test.ts',
      'tests/integration/verification-commands.test.ts',
      'tests/unit/verification/affected-scopes.test.ts',
      'tests/unit/verification/change-selection',
      'tests/unit/verification/verification-plan.test.ts',
    ],
    ['core-model', 'execution', 'openspec-runtime', 'persistence'],
    [
      'openspec-current-change-archive-sync',
      'openspec-current-change-strict',
      'tests-verification',
      'typecheck',
    ],
    [...VERIFICATION_SELECTION_CAPABILITIES],
  ),
];

function module(
  id: string,
  ownershipSelectors: readonly string[],
  dependsOn: readonly string[],
  verificationScopes: readonly string[],
  capabilityIds: readonly string[],
  noApplicablePredicateId?: VerificationModule['noApplicablePredicateId'],
): VerificationModule {
  return {
    id,
    ownershipSelectors,
    dependsOn,
    verificationScopes,
    capabilityIds,
    ...(noApplicablePredicateId !== undefined && { noApplicablePredicateId }),
  };
}

export function selectAffectedVerificationModules(
  actualPaths: readonly string[],
): AffectedVerificationSelection {
  validateVerificationModuleMap(VERIFICATION_MODULE_MAP);
  if (actualPaths.length === 0) {
    return {
      seedModuleIds: [],
      moduleIds: [],
      capabilityIds: [],
      verificationScopes: [],
      notApplicableProof: { predicateId: 'no-candidate-change' },
    };
  }
  const seeds = actualPaths.map((path) => {
    const matches = VERIFICATION_MODULE_MAP.filter((candidate) =>
      candidate.ownershipSelectors.some((selector) => owns(selector, path)),
    );
    if (matches.length !== 1) {
      throw new FlowkitError(
        'VERIFICATION_MODULE_SELECTION_FAILED',
        'Actual change path must map to exactly one verification module',
        { path, matches: matches.map((candidate) => candidate.id) },
      );
    }
    return matches[0]!.id;
  });
  const byId = new Map(
    VERIFICATION_MODULE_MAP.map((candidate) => [candidate.id, candidate]),
  );
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
    capabilityIds: [
      ...new Set(modules.flatMap((candidate) => candidate.capabilityIds)),
    ].sort(),
    verificationScopes: [
      ...new Set(modules.flatMap((candidate) => candidate.verificationScopes)),
    ].sort(),
  };
}

export function validateVerificationModuleMap(
  map: readonly VerificationModule[],
): void {
  const ids = map.map((candidate) => candidate.id);
  assertLexicalUnique(ids, 'Verification module ids');
  for (const candidate of map) {
    if (
      candidate.ownershipSelectors.length === 0 ||
      candidate.verificationScopes.length === 0 ||
      candidate.capabilityIds.length === 0
    ) {
      throw new FlowkitError(
        'VERIFICATION_MODULE_MAP_INVALID',
        'Verification modules require ownership, scope, and capability declarations',
        { moduleId: candidate.id },
      );
    }
    assertLexicalUnique(
      candidate.ownershipSelectors,
      `ownershipSelectors for ${candidate.id}`,
    );
    assertLexicalUnique(
      candidate.dependsOn,
      `dependsOn for ${candidate.id}`,
      true,
    );
    assertLexicalUnique(
      candidate.verificationScopes,
      `verificationScopes for ${candidate.id}`,
    );
    assertLexicalUnique(
      candidate.capabilityIds,
      `capabilityIds for ${candidate.id}`,
    );
    for (const dependency of candidate.dependsOn)
      if (!ids.includes(dependency)) {
        throw new FlowkitError(
          'VERIFICATION_MODULE_MAP_INVALID',
          'Verification module dependency is unknown',
          { moduleId: candidate.id, dependency },
        );
      }
    for (const scope of candidate.verificationScopes)
      if (!CLOSED_SCOPES.has(scope)) {
        throw new FlowkitError(
          'VERIFICATION_MODULE_MAP_INVALID',
          'Verification module scope is outside the closed authority',
          { moduleId: candidate.id, scope },
        );
      }
    for (const capabilityId of candidate.capabilityIds)
      if (!CLOSED_CAPABILITIES.has(capabilityId)) {
        throw new FlowkitError(
          'VERIFICATION_MODULE_MAP_INVALID',
          'Verification module capability is outside the closed authority',
          { moduleId: candidate.id, capabilityId },
        );
      }
    if (
      candidate.noApplicablePredicateId !== undefined &&
      !CLOSED_PREDICATES.has(candidate.noApplicablePredicateId)
    ) {
      throw new FlowkitError(
        'VERIFICATION_MODULE_MAP_INVALID',
        'Verification module no-applicable predicate is outside the closed authority',
        {
          moduleId: candidate.id,
          predicateId: candidate.noApplicablePredicateId,
        },
      );
    }
  }
  const allSelectors: { moduleId: string; selector: string }[] = [];
  for (const candidate of map)
    for (const selector of candidate.ownershipSelectors)
      allSelectors.push({ moduleId: candidate.id, selector });
  for (let left = 0; left < allSelectors.length; left += 1)
    for (let right = left + 1; right < allSelectors.length; right += 1) {
      const a = allSelectors[left]!;
      const b = allSelectors[right]!;
      if (owns(a.selector, b.selector) || owns(b.selector, a.selector)) {
        throw new FlowkitError(
          'VERIFICATION_MODULE_MAP_INVALID',
          'Verification module ownership selectors overlap',
          {
            a: a.selector,
            b: b.selector,
            aModule: a.moduleId,
            bModule: b.moduleId,
          },
        );
      }
    }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(map.map((candidate) => [candidate.id, candidate]));
  const visit = (id: string): void => {
    if (visiting.has(id))
      throw new FlowkitError(
        'VERIFICATION_MODULE_MAP_INVALID',
        'Verification module dependencies contain a cycle',
        { id },
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

function owns(selector: string, path: string): boolean {
  return path === selector || path.startsWith(`${selector}/`);
}

function assertLexicalUnique(
  values: readonly string[],
  label: string,
  allowEmpty = false,
): void {
  if (
    (!allowEmpty && values.length === 0) ||
    new Set(values).size !== values.length ||
    [...values].sort().some((value, index) => value !== values[index])
  ) {
    throw new FlowkitError(
      'VERIFICATION_MODULE_MAP_INVALID',
      `${label} must be${allowEmpty ? '' : ' non-empty,'} unique and lexical sorted`,
      { values },
    );
  }
}
