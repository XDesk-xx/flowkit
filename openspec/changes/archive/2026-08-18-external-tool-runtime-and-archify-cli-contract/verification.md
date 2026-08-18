# Change Verification

> Flowkit Change Verification publication. Selection identity is logical and point-in-time; concrete commands belong to the verification executor.
<!-- flowkit-change-verification-status: passed -->

- Producing Run: `20260818-042-revise-apply`
- canonicalBase: `104c14cc245c4a6db3609e7e3dd52e356d0bfc19`
- postActionWorkspaceFingerprint: `e4d98ba2dbbc908f3ed05dbc58c9bb788992b7dc90bf8f7a79d4b13fad689359`
- verificationCatalog: `src/verification/change-selection/module-map.ts`
- verificationCatalogFingerprint: `1c5dd24550240f0ccbed67877794ffa1dfb0f3dcdce67878faeaca3869a8c7d6`
- selectionFingerprint: `e5a188a29828422df84b81cb66a2d5e724396a49aab9faf1c425825c2065f98e`
- capabilityRelation: `matched`
- Verification environment: `platform=linux arch=x64 node=v22.16.0`
- Delivery Full Test status: `not-ready`

## Selected modules

- `change-contract`
- `cli-diagnostics`
- `execution`
- `external-tools`
- `openspec-runtime`
- `verification-selection`

## Selected capabilities

- `flowkit-change-verification-selection`
- `flowkit-external-tool-runtime`
- `flowkit-integration-boundaries`
- `flowkit-openspec-1-7-thin-integration`

## Selected logical checks

- `openspec-current-change-archive-sync`
- `openspec-current-change-strict`
- `tests-cli`
- `tests-execution`
- `tests-external-tools`
- `tests-openspec-runtime`
- `tests-verification`
- `typecheck`

## Verification checks

### Check 1

- scope: `openspec-current-change-archive-sync`
- applicability: `applicable`
- command/method: `OpenSpecCliAdapter.preflightArchiveSync(currentChangeId)`
- status: `passed`
- summary: real disposable OpenSpec archive-sync preflight passed
- result ref: `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md#check-1`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 2

- scope: `openspec-current-change-strict`
- applicability: `applicable`
- command/method: `OpenSpecCliAdapter.validateChange(currentChangeId, strict=true)`
- status: `passed`
- summary: strict OpenSpec current Change validation passed
- result ref: `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md#check-2`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 3

- scope: `tests-cli`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/b1-delivery-findings-and-corrective-change.test.ts tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md#check-3`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 4

- scope: `tests-execution`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/full-test-reader.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/delivery-full-test-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md#check-4`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 5

- scope: `tests-external-tools`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/c1-external-tool-runtime-and-archify-cli-contract.test.ts tests/unit/external-tools/managed-tool.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md#check-5`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 6

- scope: `tests-openspec-runtime`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/openspec-1-7-real-cli.test.ts tests/unit/external-command.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md#check-6`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 7

- scope: `tests-verification`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md#check-7`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 8

- scope: `typecheck`
- applicability: `applicable`
- command/method: `npm run typecheck`
- status: `passed`
- summary: typecheck execution passed
- result ref: `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification.md#check-8`
- environment: `platform=linux arch=x64 node=v22.16.0`

## Actual ChangeSet

- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/.openspec.yaml`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/design.md`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/explore.md`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/proposal.md`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/specs/flowkit-change-verification-selection/spec.md`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/specs/flowkit-external-tool-runtime/spec.md`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/specs/flowkit-integration-boundaries/spec.md`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/specs/flowkit-openspec-1-7-thin-integration/spec.md`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/tasks.md`
- `create` `openspec/changes/external-tool-runtime-and-archify-cli-contract/verification-history/f3dc59348c214f71685d8ce1ea0f348557948c6f194c4329eb7aa98cacca9218.md`
- `modify` `openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml`
- `modify` `scripts/verification.ts`
- `create` `src/integrations/archify/archify-cli-adapter.ts`
- `create` `src/integrations/external-tools/managed-tool.ts`
- `modify` `src/integrations/openspec/openspec-cli-adapter.ts`
- `modify` `src/integrations/openspec/openspec-executable.ts`
- `modify` `src/verification/change-selection/evidence.ts`
- `modify` `src/verification/change-selection/module-map.ts`
- `create` `tests/integration/c1-external-tool-runtime-and-archify-cli-contract.test.ts`
- `modify` `tests/integration/g1-change-cli-end-to-end.test.ts`
- `modify` `tests/integration/openspec-1-7-real-cli.test.ts`
- `modify` `tests/unit/cli/change-action.test.ts`
- `create` `tests/unit/external-tools/managed-tool.test.ts`
- `modify` `tests/unit/integrations/openspec-archive-service.test.ts`
- `modify` `tests/unit/integrations/openspec-cli-adapter.test.ts`
- `modify` `tests/unit/services/b1-openspec-action-context.test.ts`
- `modify` `tests/unit/verification/change-selection/evidence.test.ts`
- `modify` `tests/unit/verification/change-selection/module-map.test.ts`
- `modify` `tests/unit/verification/verification-plan.test.ts`
