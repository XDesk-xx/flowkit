import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  selectAffectedVerificationModules,
  validateVerificationModuleMap,
  VERIFICATION_MODULE_MAP,
} from '../../../../src/verification/change-selection/module-map.js';

describe('verification module map', () => {
  it('maps each actual path once and includes reverse dependency consumers', () => {
    assert.deepEqual(
      selectAffectedVerificationModules(['src/domain/types.ts']),
      {
        seedModuleIds: ['core-model'],
        moduleIds: [
          'cli-diagnostics',
          'core-model',
          'execution',
          'external-tools',
          'openspec-runtime',
          'persistence',
          'verification-selection',
        ],
        capabilityIds: [
          'flowkit-archive-and-checkpoint-boundary',
          'flowkit-change-cli-end-to-end-and-performance',
          'flowkit-change-verification-selection',
          'flowkit-core-hardening-and-release-candidate',
          'flowkit-core-model',
          'flowkit-delivery-change-creation-and-owner-input',
          'flowkit-diagnostic-cli',
          'flowkit-external-tool-runtime',
          'flowkit-formal-fact-reader-and-persistence',
          'flowkit-integration-boundaries',
          'flowkit-lean-run-and-action-package',
          'flowkit-openspec-1-7-thin-integration',
          'flowkit-policy-engine',
          'flowkit-runtime-foundation',
        ],
        verificationScopes: [
          'openspec-current-change-archive-sync',
          'openspec-current-change-strict',
          'tests-cli',
          'tests-execution',
          'tests-external-tools',
          'tests-openspec-runtime',
          'tests-persistence',
          'tests-serialization',
          'tests-verification',
          'typecheck',
        ],
      },
    );
  });

  it('maps the G1 CLI E2E target uniquely into tests-cli coverage', () => {
    const selected = selectAffectedVerificationModules([
      'tests/integration/g1-change-cli-end-to-end.test.ts',
    ]);
    assert.deepEqual(selected.seedModuleIds, ['cli-diagnostics']);
    assert.equal(selected.verificationScopes.includes('tests-cli'), true);
    assert.equal(
      selected.capabilityIds.includes(
        'flowkit-change-cli-end-to-end-and-performance',
      ),
      true,
    );
    assert.equal(
      selected.capabilityIds.includes('flowkit-openspec-1-7-thin-integration'),
      true,
    );
  });

  it('maps the B1 corrective integration and domain occurrence regression into formal physical scopes', () => {
    const cli = selectAffectedVerificationModules([
      'tests/integration/b1-delivery-findings-and-corrective-change.test.ts',
    ]);
    assert.deepEqual(cli.seedModuleIds, ['cli-diagnostics']);
    assert.equal(cli.verificationScopes.includes('tests-cli'), true);
    assert.equal(cli.capabilityIds.includes('flowkit-diagnostic-cli'), true);
    assert.equal(cli.capabilityIds.includes('flowkit-policy-engine'), true);

    const domain = selectAffectedVerificationModules([
      'tests/unit/domain/full-test-b1.test.ts',
    ]);
    assert.deepEqual(domain.seedModuleIds, ['core-model']);
    assert.equal(domain.verificationScopes.includes('tests-serialization'), true);
    assert.equal(domain.capabilityIds.includes('flowkit-core-model'), true);
  });

  it('maps A1 Delivery creation and diagnostic capabilities onto their physical module owners', () => {
    const cli = selectAffectedVerificationModules(['src/diagnostics/next.ts']);
    assert.equal(cli.capabilityIds.includes('flowkit-diagnostic-cli'), true);
    const execution = selectAffectedVerificationModules([
      'src/services/a1-write-service.ts',
    ]);
    assert.equal(
      execution.capabilityIds.includes(
        'flowkit-delivery-change-creation-and-owner-input',
      ),
      true,
    );
  });

  it('maps A1 Full Test process ownership in the shared command runner to the core-model capability', () => {
    const selected = selectAffectedVerificationModules([
      'src/shared/external-command.ts',
    ]);
    assert.deepEqual(selected.seedModuleIds, ['openspec-runtime']);
    assert.equal(
      selected.verificationScopes.includes('tests-openspec-runtime'),
      true,
    );
    assert.equal(selected.capabilityIds.includes('flowkit-core-model'), true);
  });

  it('maps the F1 lifecycle integration into execution coverage', () => {
    const selected = selectAffectedVerificationModules([
      'tests/integration/f1-archive-and-checkpoint-boundary.test.ts',
    ]);
    assert.deepEqual(selected.seedModuleIds, ['execution']);
    assert.equal(selected.verificationScopes.includes('tests-execution'), true);
  });

  it('keeps the Reset-added B1 OpenSpec action-context regression uniquely owned by execution', () => {
    const selected = selectAffectedVerificationModules([
      'tests/unit/services/b1-openspec-action-context.test.ts',
    ]);
    assert.deepEqual(selected.seedModuleIds, ['execution']);
    assert.equal(selected.verificationScopes.includes('tests-execution'), true);
  });

  it('allows F1 and G1 capabilities to justify verification-selection mutations in the current Change', () => {
    const selected = selectAffectedVerificationModules([
      'src/verification/change-selection/module-map.ts',
    ]);
    assert.deepEqual(selected.seedModuleIds, ['verification-selection']);
    assert.equal(
      selected.capabilityIds.includes(
        'flowkit-archive-and-checkpoint-boundary',
      ),
      true,
    );
    assert.equal(
      selected.capabilityIds.includes(
        'flowkit-change-cli-end-to-end-and-performance',
      ),
      true,
    );
  });

  it('maps the historical E1 integration regression into verification-selection coverage', () => {
    const selected = selectAffectedVerificationModules([
      'tests/integration/e1-change-verification-selection.test.ts',
    ]);
    assert.deepEqual(selected.seedModuleIds, ['verification-selection']);
    assert.equal(
      selected.verificationScopes.includes('tests-verification'),
      true,
    );
  });

  it('exact-owns the public verification executor and direct verification-plan regression', () => {
    for (const path of [
      'scripts/verification.ts',
      'tests/unit/verification/verification-plan.test.ts',
    ]) {
      const selected = selectAffectedVerificationModules([path]);
      assert.deepEqual(
        selected.seedModuleIds,
        ['verification-selection'],
        path,
      );
      assert.equal(
        selected.verificationScopes.includes('tests-verification'),
        true,
        path,
      );
      assert.equal(
        selected.capabilityIds.includes(
          'flowkit-core-hardening-and-release-candidate',
        ),
        true,
        path,
      );
    }
  });


  it('keeps C1 external-tool/OpenSpec/CLI ownership exact and non-overlapping', () => {
    const cases = [
      ['src/integrations/external-tools/managed-tool.ts', 'external-tools'],
      ['src/integrations/archify/archify-cli-adapter.ts', 'external-tools'],
      ['tests/unit/external-tools/managed-tool.test.ts', 'external-tools'],
      ['tests/unit/integrations/openspec-cli-adapter.test.ts', 'openspec-runtime'],
      ['tests/unit/cli/change-action.test.ts', 'cli-diagnostics'],
    ] as const;
    for (const [path, owner] of cases) {
      assert.deepEqual(selectAffectedVerificationModules([path]).seedModuleIds, [owner], path);
    }
    const external = selectAffectedVerificationModules(['src/integrations/external-tools/managed-tool.ts']);
    assert.equal(external.verificationScopes.includes('tests-external-tools'), true);
    assert.equal(external.verificationScopes.includes('tests-openspec-runtime'), true);
    assert.throws(() => validateVerificationModuleMap(VERIFICATION_MODULE_MAP.map((candidate) =>
      candidate.id === 'external-tools'
        ? { ...candidate, ownershipSelectors: [...candidate.ownershipSelectors, 'tests/unit/integrations/archify'].sort() }
        : candidate,
    )), /overlap/);
  });

  it('rejects overlap and dependency cycles', () => {
    assert.doesNotThrow(() =>
      validateVerificationModuleMap(VERIFICATION_MODULE_MAP),
    );
    assert.throws(
      () =>
        validateVerificationModuleMap([
          {
            id: 'a',
            ownershipSelectors: ['src'],
            dependsOn: ['b'],
            verificationScopes: ['typecheck'],
            capabilityIds: ['flowkit-core-model'],
          },
          {
            id: 'b',
            ownershipSelectors: ['src/b'],
            dependsOn: ['a'],
            verificationScopes: ['typecheck'],
            capabilityIds: ['flowkit-core-model'],
          },
        ]),
      /overlap/,
    );
  });

  it('fails closed for nondeterministic, unknown scope/capability, and cycles', () => {
    const base = VERIFICATION_MODULE_MAP[0]!;
    assert.throws(
      () =>
        validateVerificationModuleMap([
          {
            ...base,
            ownershipSelectors: [...base.ownershipSelectors].reverse(),
          },
        ]),
      /lexical sorted/,
    );
    assert.throws(
      () =>
        validateVerificationModuleMap([
          { ...base, verificationScopes: ['unknown scope'] },
        ]),
      /scope is outside/,
    );
    assert.throws(
      () =>
        validateVerificationModuleMap([
          { ...base, capabilityIds: ['flowkit-unknown-capability'] },
        ]),
      /capability is outside/,
    );
    assert.throws(
      () =>
        validateVerificationModuleMap([
          {
            id: 'a',
            ownershipSelectors: ['a'],
            dependsOn: ['b'],
            verificationScopes: ['typecheck'],
            capabilityIds: ['flowkit-core-model'],
          },
          {
            id: 'b',
            ownershipSelectors: ['b'],
            dependsOn: ['a'],
            verificationScopes: ['typecheck'],
            capabilityIds: ['flowkit-core-model'],
          },
        ]),
      /cycle/,
    );
  });
});
