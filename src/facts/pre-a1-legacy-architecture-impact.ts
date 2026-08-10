const PRE_A1_LEGACY_CHANGE_IDS: Readonly<Record<string, readonly string[]>> = {
  '20260805-01-product-baseline': [
    'product-positioning',
    'core-model',
    'integration-boundaries',
    'bootstrap-and-roadmap',
    'baseline-finalization-corrections',
  ],
  '20260806-01-deterministic-core': [
    'runtime-foundation',
    'domain-and-state-schema',
    'formal-fact-reader-and-persistence',
    'policy-engine',
    'execution-model-correction',
    'orchestration-authority-boundary-correction',
    'diagnostic-cli',
    'core-hardening-and-release-candidate',
  ],
  '20260810-01-change-execution-loop': [
    'core-contract-alignment',
    'delivery-change-creation-and-owner-input',
    'lean-run-and-action-package',
    'openspec-1-7-thin-integration',
    'review-findings-and-blocker-authority',
    'change-verification-selection-and-change-set',
    'archive-and-checkpoint-boundary',
    'change-cli-end-to-end-and-performance',
  ],
};

const LEGACY_IDENTITIES = new Set(
  Object.entries(PRE_A1_LEGACY_CHANGE_IDS).flatMap(([deliveryId, ids]) =>
    ids.map((changeId) => `${deliveryId}\0${changeId}`),
  ),
);

export const PRE_A1_LEGACY_ARCHITECTURE_IMPACT_IDENTITIES =
  PRE_A1_LEGACY_CHANGE_IDS;

export function isPreA1LegacyArchitectureImpactIdentity(
  deliveryId: string,
  changeId: string,
): boolean {
  return LEGACY_IDENTITIES.has(`${deliveryId}\0${changeId}`);
}
