import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectAffectedVerificationModules, validateVerificationModuleMap, VERIFICATION_MODULE_MAP } from '../../../../src/verification/change-selection/module-map.js';

describe('verification module map', () => {
  it('maps each actual path once and includes reverse dependency consumers', () => {
    assert.deepEqual(selectAffectedVerificationModules(['src/domain/types.ts']), {
      seedModuleIds: ['core-model'],
      moduleIds: ['core-model', 'execution', 'openspec-runtime', 'persistence', 'verification-selection'],
      capabilityIds: [
        'flowkit-change-verification-selection',
        'flowkit-core-model',
        'flowkit-formal-fact-reader-and-persistence',
        'flowkit-lean-run-and-action-package',
        'flowkit-openspec-1-7-thin-integration',
        'flowkit-policy-engine',
        'flowkit-runtime-foundation',
      ],
      verificationScopes: [
        'node --test --import tsx tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/external-command.test.ts',
        'node --test --import tsx tests/unit/persistence/run-persistence.test.ts',
        'node --test --import tsx tests/unit/services/b1-run-execution-service.test.ts',
        'node --test --import tsx tests/unit/verification/change-selection/*.test.ts',
        'node --test --import tsx tests/unit/persistence/serialization.test.ts',
        'npm run typecheck',
      ].sort(),
    });
  });

  it('rejects overlap and dependency cycles', () => {
    assert.doesNotThrow(() => validateVerificationModuleMap(VERIFICATION_MODULE_MAP));
    assert.throws(() => validateVerificationModuleMap([
      { id: 'a', ownershipSelectors: ['src'], dependsOn: ['b'], verificationScopes: ['x'], capabilityIds: ['x'] },
      { id: 'b', ownershipSelectors: ['src/b'], dependsOn: ['a'], verificationScopes: ['y'], capabilityIds: ['y'] },
    ]), /overlap/);
  });
});
