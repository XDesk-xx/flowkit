# Change Verification

> Flowkit Change Verification publication. Selection identity is logical and point-in-time; concrete commands belong to the verification executor.
<!-- flowkit-change-verification-status: passed -->

- Producing Run: `20260817-015-revise-apply`
- canonicalBase: `f132db761bd209e6aff72411108b8e3e1c9801f5`
- postActionWorkspaceFingerprint: `60f7d892cff8d919e49cd9d0394f9c2419d412ff410abdfa40e4551fefb8a34e`
- verificationCatalog: `src/verification/change-selection/module-map.ts`
- verificationCatalogFingerprint: `ec2b250252ebf051de6326fbd35e06f4f445b137c856a7dda91b80d4c3a3c9e9`
- selectionFingerprint: `624bba0ddfd11b2103db0d7009a682388d7852a83d67fad480b620b8d7306868`
- capabilityRelation: `matched`
- Verification environment: `platform=linux arch=x64 node=v22.16.0`
- Delivery Full Test status: `not-ready`

## Selected modules

- `change-contract`
- `cli-diagnostics`
- `core-model`
- `execution`
- `openspec-runtime`
- `persistence`
- `verification-selection`

## Selected capabilities

- `flowkit-change-cli-end-to-end-and-performance`
- `flowkit-core-model`
- `flowkit-delivery-change-creation-and-owner-input`
- `flowkit-diagnostic-cli`
- `flowkit-formal-fact-reader-and-persistence`
- `flowkit-policy-engine`

## Selected logical checks

- `openspec-current-change-archive-sync`
- `openspec-current-change-strict`
- `tests-cli`
- `tests-execution`
- `tests-openspec-runtime`
- `tests-persistence`
- `tests-serialization`
- `tests-verification`
- `typecheck`

## Verification checks

### Check 1

- scope: `openspec-current-change-archive-sync`
- applicability: `applicable`
- command/method: `OpenSpecCliAdapter.preflightArchiveSync(currentChangeId)`
- status: `passed`
- summary: real disposable OpenSpec archive-sync preflight passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-1`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 2

- scope: `openspec-current-change-strict`
- applicability: `applicable`
- command/method: `OpenSpecCliAdapter.validateChange(currentChangeId, strict=true)`
- status: `passed`
- summary: strict OpenSpec current Change validation passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-2`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 3

- scope: `tests-cli`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/full-test-reader.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/persistence/delivery-manifest-document.test.ts tests/unit/persistence/legacy-recognizer.test.ts tests/unit/persistence/run-persistence.test.ts tests/unit/persistence/serialization.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/delivery-full-test-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-3`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 4

- scope: `tests-execution`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/full-test-reader.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/persistence/delivery-manifest-document.test.ts tests/unit/persistence/legacy-recognizer.test.ts tests/unit/persistence/run-persistence.test.ts tests/unit/persistence/serialization.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/delivery-full-test-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-4`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 5

- scope: `tests-openspec-runtime`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/full-test-reader.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/persistence/delivery-manifest-document.test.ts tests/unit/persistence/legacy-recognizer.test.ts tests/unit/persistence/run-persistence.test.ts tests/unit/persistence/serialization.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/delivery-full-test-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-5`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 6

- scope: `tests-persistence`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/full-test-reader.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/persistence/delivery-manifest-document.test.ts tests/unit/persistence/legacy-recognizer.test.ts tests/unit/persistence/run-persistence.test.ts tests/unit/persistence/serialization.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/delivery-full-test-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-6`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 7

- scope: `tests-serialization`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/full-test-reader.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/persistence/delivery-manifest-document.test.ts tests/unit/persistence/legacy-recognizer.test.ts tests/unit/persistence/run-persistence.test.ts tests/unit/persistence/serialization.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/delivery-full-test-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-7`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 8

- scope: `tests-verification`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/full-test-reader.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/persistence/delivery-manifest-document.test.ts tests/unit/persistence/legacy-recognizer.test.ts tests/unit/persistence/run-persistence.test.ts tests/unit/persistence/serialization.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/delivery-full-test-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-8`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 9

- scope: `typecheck`
- applicability: `applicable`
- command/method: `npm run typecheck`
- status: `passed`
- summary: typecheck execution passed
- result ref: `openspec/changes/delivery-readiness-and-full-test-behavior/verification.md#check-9`
- environment: `platform=linux arch=x64 node=v22.16.0`

## Actual ChangeSet

- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/.openspec.yaml`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/design.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/explore.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/proposal.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/specs/flowkit-change-cli-end-to-end-and-performance/spec.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/specs/flowkit-core-model/spec.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/specs/flowkit-delivery-change-creation-and-owner-input/spec.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/specs/flowkit-diagnostic-cli/spec.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/specs/flowkit-formal-fact-reader-and-persistence/spec.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/specs/flowkit-policy-engine/spec.md`
- `create` `openspec/changes/delivery-readiness-and-full-test-behavior/tasks.md`
- `modify` `openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml`
- `modify` `scripts/verification.ts`
- `modify` `src/cli/main.ts`
- `modify` `src/diagnostics/doctor.ts`
- `modify` `src/diagnostics/next.ts`
- `modify` `src/diagnostics/shared.ts`
- `modify` `src/domain/a1-types.ts`
- `create` `src/domain/full-test.ts`
- `modify` `src/facts/formal-fact-reader.ts`
- `modify` `src/facts/formal-fact-snapshot.ts`
- `modify` `src/persistence/delivery-manifest-document.ts`
- `modify` `src/policy/blocked-diagnosis.ts`
- `modify` `src/policy/next.ts`
- `modify` `src/policy/types.ts`
- `modify` `src/services/a1-write-service.ts`
- `create` `src/services/delivery-full-test-service.ts`
- `modify` `src/shared/external-command.ts`
- `modify` `src/verification/change-selection/evidence.ts`
- `modify` `src/verification/change-selection/module-map.ts`
- `create` `tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts`
- `create` `tests/unit/facts/full-test-reader.test.ts`
- `modify` `tests/unit/persistence/delivery-manifest-document.test.ts`
- `modify` `tests/unit/persistence/serialization.test.ts`
- `modify` `tests/unit/policy/diagnose.test.ts`
- `modify` `tests/unit/policy/fixtures.ts`
- `modify` `tests/unit/policy/next.test.ts`
- `modify` `tests/unit/policy/types.test.ts`
- `modify` `tests/unit/services/a1-write-service.test.ts`
- `create` `tests/unit/services/delivery-full-test-service.test.ts`
- `modify` `tests/unit/verification/change-selection/evidence.test.ts`
- `modify` `tests/unit/verification/change-selection/module-map.test.ts`
- `modify` `tests/unit/verification/verification-plan.test.ts`
