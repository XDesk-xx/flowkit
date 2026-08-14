import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectAffectedVerificationModules, validateVerificationModuleMap, VERIFICATION_MODULE_MAP } from '../../../../src/verification/change-selection/module-map.js';

describe('verification module map', () => {
  it('maps each actual path once and includes reverse dependency consumers', () => {
    assert.deepEqual(selectAffectedVerificationModules(['src/domain/types.ts']), {
      seedModuleIds: ['core-model'],
      moduleIds: ['cli-diagnostics', 'core-model', 'execution', 'openspec-runtime', 'persistence', 'verification-selection'],
      capabilityIds: [
        'flowkit-archive-and-checkpoint-boundary',
        'flowkit-change-cli-end-to-end-and-performance',
        'flowkit-change-verification-selection',
        'flowkit-core-model',
        'flowkit-formal-fact-reader-and-persistence',
        'flowkit-lean-run-and-action-package',
        'flowkit-openspec-1-7-thin-integration',
        'flowkit-policy-engine',
        'flowkit-runtime-foundation',
      ],
      verificationScopes: [
        'openspec-current-change-strict', 'tests-cli', 'tests-execution', 'tests-openspec-runtime',
        'tests-persistence', 'tests-serialization', 'tests-verification', 'typecheck',
      ],
    });
  });

  it('maps the historical E1 integration regression into verification-selection coverage', () => {
    const selected = selectAffectedVerificationModules(['tests/integration/e1-change-verification-selection.test.ts']);
    assert.deepEqual(selected.seedModuleIds, ['verification-selection']);
    assert.equal(selected.verificationScopes.includes('tests-verification'), true);
  });

  it('rejects overlap and dependency cycles', () => {
    assert.doesNotThrow(() => validateVerificationModuleMap(VERIFICATION_MODULE_MAP));
    assert.throws(() => validateVerificationModuleMap([
      { id: 'a', ownershipSelectors: ['src'], dependsOn: ['b'], verificationScopes: ['typecheck'], capabilityIds: ['flowkit-core-model'] },
      { id: 'b', ownershipSelectors: ['src/b'], dependsOn: ['a'], verificationScopes: ['typecheck'], capabilityIds: ['flowkit-core-model'] },
    ]), /overlap/);
  });

  it('fails closed for nondeterministic, unknown scope/capability, and cycles', () => {
    const base = VERIFICATION_MODULE_MAP[0]!;
    assert.throws(() => validateVerificationModuleMap([
      { ...base, ownershipSelectors: [...base.ownershipSelectors].reverse() },
    ]), /lexical sorted/);
    assert.throws(() => validateVerificationModuleMap([
      { ...base, verificationScopes: ['unknown scope'] },
    ]), /scope is outside/);
    assert.throws(() => validateVerificationModuleMap([
      { ...base, capabilityIds: ['flowkit-unknown-capability'] },
    ]), /capability is outside/);
    assert.throws(() => validateVerificationModuleMap([
      { id: 'a', ownershipSelectors: ['a'], dependsOn: ['b'], verificationScopes: ['typecheck'], capabilityIds: ['flowkit-core-model'] },
      { id: 'b', ownershipSelectors: ['b'], dependsOn: ['a'], verificationScopes: ['typecheck'], capabilityIds: ['flowkit-core-model'] },
    ]), /cycle/);
  });

});
