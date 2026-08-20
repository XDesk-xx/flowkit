import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  selectAffectedVerificationModules,
  validateVerificationModuleMap,
  VERIFICATION_MODULE_MAP,
} from '../../../../src/verification/change-selection/module-map.js';
import { buildVerificationSelection } from '../../../../src/verification/change-selection/selection.js';

describe('verification module map', () => {
  it('maps each actual path once and includes reverse dependency consumers', () => {
    assert.deepEqual(
      selectAffectedVerificationModules(['src/domain/types.ts']),
      {
        seedModuleIds: ['core-model'],
        moduleIds: [
          'architecture',
          'cli-diagnostics',
          'core-model',
          'execution',
          'external-tools',
          'openspec-runtime',
          'persistence',
          'verification-selection',
        ],
        capabilityIds: [
          'flowkit-architecture-assets',
          'flowkit-archive-and-checkpoint-boundary',
          'flowkit-change-cli-end-to-end-and-performance',
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
          'flowkit-stable-runner-and-self-hosting-acceptance',
          'flowkit-sync-resume-and-single-action-agent-adapter',
        ],
        verificationScopes: [
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

  it('maps the F1 checkpoint and Delivery Finalize lifecycle integrations into execution coverage', () => {
    for (const path of [
      'tests/integration/f1-archive-and-checkpoint-boundary.test.ts',
      'tests/integration/f1-delivery-finalize-and-git-boundary.test.ts',
    ]) {
      const selected = selectAffectedVerificationModules([path]);
      assert.deepEqual(selected.seedModuleIds, ['execution']);
      assert.equal(selected.verificationScopes.includes('tests-execution'), true);
      assert.equal(selected.capabilityIds.includes('flowkit-delivery-finalize-and-git-boundary'), true);
    }
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


  it('owns the G1 resume/adapter implementation and integration target with a matched closed capability relation', () => {
    for (const [path, expectedSeed] of [
      ['src/diagnostics/resume-projection.ts', 'cli-diagnostics'],
      ['src/services/g1-single-action-agent-adapter.ts', 'execution'],
      ['src/verification/change-selection/publication.ts', 'verification-selection'],
      ['tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts', 'cli-diagnostics'],
    ] as const) {
      const selected = selectAffectedVerificationModules([path]);
      assert.deepEqual(selected.seedModuleIds, [expectedSeed], path);
      assert.equal(selected.capabilityIds.includes('flowkit-sync-resume-and-single-action-agent-adapter'), true, path);
    }

    const expectedActualChangeSet = [
      'src/diagnostics/resume-context.ts',
      'src/diagnostics/resume-projection.ts',
      'src/services/b1-run-execution-service.ts',
      'src/services/g1-single-action-agent-adapter.ts',
      'src/verification/change-selection/evidence.ts',
      'src/verification/change-selection/module-map.ts',
      'src/verification/change-selection/publication.ts',
      'tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts',
      'tests/unit/diagnostics/resume-projection.test.ts',
      'tests/unit/diagnostics/views.test.ts',
      'tests/unit/services/b1-run-execution-service.test.ts',
      'tests/unit/services/g1-single-action-agent-adapter.test.ts',
      'tests/unit/verification/change-selection/evidence.test.ts',
      'tests/unit/verification/change-selection/module-map.test.ts',
      'tests/unit/verification/change-selection/publication.test.ts',
    ].map((path) => ({ path, kind: 'modify' as const, pathKindBefore: 'file' as const, pathKindAfter: 'file' as const, contentFingerprintAfter: 'a'.repeat(64) }));
    const selection = buildVerificationSelection(expectedActualChangeSet, [
      'openspec/changes/g1/specs/flowkit-sync-resume-and-single-action-agent-adapter/spec.md',
      'openspec/changes/g1/specs/flowkit-lean-run-and-action-package/spec.md',
      'openspec/changes/g1/specs/flowkit-change-verification-selection/spec.md',
      'openspec/changes/g1/specs/flowkit-diagnostic-cli/spec.md',
    ]);
    assert.equal(selection.capabilityRelation.kind, 'matched');
    for (const scope of ['tests-execution', 'tests-cli', 'tests-verification', 'typecheck']) {
      assert.equal(selection.verificationScopes.includes(scope), true, scope);
    }
  });


  it('owns the H1 stable-runner/self-hosting surface with a matched closed capability relation', () => {
    for (const [path, expectedSeed] of [
      ['src/cli/main.ts', 'cli-diagnostics'],
      ['src/services/f1-checkpoint-boundary-service.ts', 'execution'],
      ['src/verification/change-selection/evidence.ts', 'verification-selection'],
      ['tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/tasks.md', 'cli-diagnostics'],
      ['tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts', 'cli-diagnostics'],
    ] as const) {
      const selected = selectAffectedVerificationModules([path]);
      assert.deepEqual(selected.seedModuleIds, [expectedSeed], path);
      assert.equal(selected.capabilityIds.includes('flowkit-stable-runner-and-self-hosting-acceptance'), true, path);
    }

    const expectedActualChangeSet = [
      'src/cli/main.ts',
      'src/services/f1-checkpoint-boundary-service.ts',
      'src/verification/change-selection/evidence.ts',
      'src/verification/change-selection/module-map.ts',
      'tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/architecture-template.json',
      'tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/bootstrap-specs/flowkit-openspec-1-7-thin-integration/spec.md',
      'tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/design.md',
      'tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/explore.md',
      'tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/proposal.md',
      'tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/specs/flowkit-h1-future-fixture/spec.md',
      'tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/tasks.md',
      'tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts',
      'tests/unit/services/f1-checkpoint-boundary-service.test.ts',
      'tests/unit/verification/change-selection/evidence.test.ts',
      'tests/unit/verification/change-selection/module-map.test.ts',
    ].map((path) => ({ path, kind: 'modify' as const, pathKindBefore: 'file' as const, pathKindAfter: 'file' as const, contentFingerprintAfter: 'a'.repeat(64) }));
    const selection = buildVerificationSelection(expectedActualChangeSet, [
      'openspec/changes/h1/specs/flowkit-archive-and-checkpoint-boundary/spec.md',
      'openspec/changes/h1/specs/flowkit-change-verification-selection/spec.md',
      'openspec/changes/h1/specs/flowkit-stable-runner-and-self-hosting-acceptance/spec.md',
    ]);
    assert.equal(selection.capabilityRelation.kind, 'matched');
    for (const scope of ['tests-cli', 'tests-execution', 'tests-verification', 'typecheck']) {
      assert.equal(selection.verificationScopes.includes(scope), true, scope);
    }
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


  it('keeps D1 Architecture ownership non-overlapping while CLI remains cli-diagnostics with a D1 capability relation', () => {
    const cases = [
      ['architecture/reference/json/change-lifecycle.workflow.json', 'architecture'],
      ['architecture/reference/json/change-lifecycle.sequence.json', 'architecture'],
      ['architecture/reference/json/delivery-lifecycle.workflow.json', 'architecture'],
      ['architecture/reference/json/delivery-lifecycle.sequence.json', 'architecture'],
      ['architecture/20260817-01-delivery-execution-loop/json/current.architecture.json', 'architecture'],
      ['src/architecture/architecture-service.ts', 'architecture'],
      ['tests/integration/d1-architecture-baseline-and-delivery-plan.test.ts', 'architecture'],
      ['tests/unit/architecture/architecture-service.test.ts', 'architecture'],
      ['src/cli/architecture.ts', 'cli-diagnostics'],
      ['tests/unit/cli/architecture.test.ts', 'cli-diagnostics'],
    ] as const;
    for (const [path, owner] of cases) assert.deepEqual(selectAffectedVerificationModules([path]).seedModuleIds, [owner], path);
    const cli = selectAffectedVerificationModules(['src/cli/architecture.ts']);
    assert.equal(cli.capabilityIds.includes('flowkit-architecture-assets'), true);
    const architecture = selectAffectedVerificationModules(['architecture/reference/json/change-lifecycle.workflow.json']);
    assert.equal(architecture.verificationScopes.includes('tests-architecture'), true);
    assert.equal(architecture.verificationScopes.includes('tests-openspec-runtime'), false);
  });



  it('builds the fresh D1 Workflow+Sequence actualChangeSet into the full matched physical chain', () => {
    const fingerprint = 'a'.repeat(64);
    const paths = [
      'architecture/reference/json/change-lifecycle.sequence.json',
      'architecture/reference/json/change-lifecycle.workflow.json',
      'architecture/reference/json/delivery-lifecycle.lifecycle.json',
      'architecture/reference/json/delivery-lifecycle.sequence.json',
      'architecture/reference/json/delivery-lifecycle.workflow.json',
      'src/integrations/archify/archify-cli-adapter.ts',
      'tests/integration/d1-architecture-baseline-and-delivery-plan.test.ts',
      'tests/unit/cli/architecture.test.ts',
      'tests/unit/verification/change-selection/module-map.test.ts',
    ] as const;
    const actualChangeSet = paths.map((path) =>
      path.endsWith('delivery-lifecycle.lifecycle.json')
        ? { path, kind: 'delete' as const, pathKindBefore: 'file' as const, pathKindAfter: 'missing' as const }
        : { path, kind: path.includes('architecture/reference/json/') ? 'create' as const : 'modify' as const, pathKindBefore: path.includes('architecture/reference/json/') ? 'missing' as const : 'file' as const, pathKindAfter: 'file' as const, contentFingerprintAfter: fingerprint },
    );
    const selection = buildVerificationSelection(actualChangeSet, [
      'openspec/changes/architecture-baseline-and-delivery-plan/specs/flowkit-architecture-assets/spec.md',
      'openspec/changes/architecture-baseline-and-delivery-plan/specs/flowkit-change-verification-selection/spec.md',
      'openspec/changes/architecture-baseline-and-delivery-plan/specs/flowkit-external-tool-runtime/spec.md',
    ]);
    assert.deepEqual(selection.seedModuleIds, [
      'architecture',
      'cli-diagnostics',
      'external-tools',
      'verification-selection',
    ]);
    assert.deepEqual(selection.moduleIds, [
      'architecture',
      'cli-diagnostics',
      'external-tools',
      'openspec-runtime',
      'verification-selection',
    ]);
    assert.deepEqual(selection.capabilityRelation, { kind: 'matched' });
    for (const scope of [
      'openspec-current-change-archive-sync',
      'openspec-current-change-strict',
      'tests-architecture',
      'tests-cli',
      'tests-external-tools',
      'tests-openspec-runtime',
      'tests-verification',
      'typecheck',
    ]) {
      assert.equal(selection.verificationScopes.includes(scope), true, scope);
    }
  });

  it('builds the E1 expected actualChangeSet into the matched 11-check physical chain', () => {
    const fingerprint = 'b'.repeat(64);
    const paths = [
      'src/architecture/architecture-lifecycle.ts',
      'src/architecture/architecture-service.ts',
      'src/cli/architecture.ts',
      'src/domain/a1-types.ts',
      'src/domain/owner-provenance.ts',
      'src/facts/formal-fact-reader.ts',
      'src/persistence/delivery-manifest-document.ts',
      'src/policy/next.ts',
      'src/services/a1-write-service.ts',
      'src/verification/change-selection/evidence.ts',
      'src/verification/change-selection/module-map.ts',
      'tests/integration/e1-architecture-actual-compare-and-system-promotion.test.ts',
      'tests/unit/architecture/architecture-lifecycle.test.ts',
      'tests/unit/policy/next.test.ts',
      'tests/unit/persistence/delivery-manifest-document.test.ts',
      'tests/unit/services/a1-write-service.test.ts',
      'tests/unit/verification/change-selection/evidence.test.ts',
      'tests/unit/verification/change-selection/module-map.test.ts',
    ] as const;
    const actualChangeSet = paths.map((path) => ({
      path,
      kind: path.endsWith('architecture-lifecycle.ts') || path.includes('tests/integration/e1-') || path.includes('tests/unit/architecture/architecture-lifecycle') ? 'create' as const : 'modify' as const,
      pathKindBefore: path.endsWith('architecture-lifecycle.ts') || path.includes('tests/integration/e1-') || path.includes('tests/unit/architecture/architecture-lifecycle') ? 'missing' as const : 'file' as const,
      pathKindAfter: 'file' as const,
      contentFingerprintAfter: fingerprint,
    }));
    const selection = buildVerificationSelection(actualChangeSet, [
      'openspec/changes/architecture-actual-compare-and-system-promotion/specs/flowkit-architecture-assets/spec.md',
      'openspec/changes/architecture-actual-compare-and-system-promotion/specs/flowkit-change-verification-selection/spec.md',
      'openspec/changes/architecture-actual-compare-and-system-promotion/specs/flowkit-core-model/spec.md',
      'openspec/changes/architecture-actual-compare-and-system-promotion/specs/flowkit-delivery-change-creation-and-owner-input/spec.md',
      'openspec/changes/architecture-actual-compare-and-system-promotion/specs/flowkit-formal-fact-reader-and-persistence/spec.md',
      'openspec/changes/architecture-actual-compare-and-system-promotion/specs/flowkit-policy-engine/spec.md',
    ]);
    assert.deepEqual(selection.capabilityRelation, { kind: 'matched' });
    for (const scope of [
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
    ]) assert.equal(selection.verificationScopes.includes(scope), true, scope);
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
    const base = VERIFICATION_MODULE_MAP.find((candidate) => candidate.id === 'change-contract')!;
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

  it('owns new bounded Full Test resolver/executor code and regressions in verification-selection', () => {
    for (const path of [
      'src/verification/full-test/plan.ts',
      'src/verification/full-test/resolver.ts',
      'src/verification/full-test/executor.ts',
      'tests/unit/verification/full-test/resolver.test.ts',
      'tests/unit/verification/full-test/executor.test.ts',
    ]) {
      const selected = selectAffectedVerificationModules([path]);
      assert.deepEqual(selected.seedModuleIds, ['verification-selection'], path);
      assert.equal(selected.verificationScopes.includes('tests-verification'), true, path);
      assert.equal(selected.verificationScopes.includes('typecheck'), true, path);
    }
  });

});
