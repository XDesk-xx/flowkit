# Change Verification

> Flowkit Change Verification publication. Selection identity is logical and point-in-time; concrete commands belong to the verification executor.
<!-- flowkit-change-verification-status: passed -->

- Producing Run: `20260816-232-revise-apply`
- canonicalBase: `1783983440e4d1b29d6282bc5c1af55d390f392d`
- postActionWorkspaceFingerprint: `b4834893606e41d0dd548166ec9515de6c8e7274e024283a3b90003ab26a16db`
- verificationCatalog: `src/verification/change-selection/module-map.ts`
- verificationCatalogFingerprint: `baadf60779ba24cba5b3ae4b2205d224adfc57197c5b8ca9ec1df223387be69c`
- selectionFingerprint: `8bb49e903f7ee4e1bd3944d6617ecc138fbd52cf467835db79003fa004257760`
- capabilityRelation: `matched`
- Verification environment: `platform=linux arch=x64 node=v22.16.0`
- Delivery Full Test status: `not-ready`

## Selected modules

- `change-contract`
- `cli-diagnostics`
- `execution`
- `openspec-runtime`
- `verification-selection`

## Selected capabilities

- `flowkit-archive-and-checkpoint-boundary`
- `flowkit-change-cli-end-to-end-and-performance`
- `flowkit-change-verification-selection`
- `flowkit-core-hardening-and-release-candidate`
- `flowkit-formal-fact-reader-and-persistence`
- `flowkit-openspec-1-7-thin-integration`

## Selected logical checks

- `openspec-current-change-archive-sync`
- `openspec-current-change-strict`
- `tests-cli`
- `tests-execution`
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
- result ref: `openspec/changes/delivery-final-closure-correction/verification.md#check-1`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 2

- scope: `openspec-current-change-strict`
- applicability: `applicable`
- command/method: `OpenSpecCliAdapter.validateChange(currentChangeId, strict=true)`
- status: `passed`
- summary: strict OpenSpec current Change validation passed
- result ref: `openspec/changes/delivery-final-closure-correction/verification.md#check-2`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 3

- scope: `tests-cli`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-final-closure-correction/verification.md#check-3`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 4

- scope: `tests-execution`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-final-closure-correction/verification.md#check-4`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 5

- scope: `tests-openspec-runtime`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-final-closure-correction/verification.md#check-5`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 6

- scope: `tests-verification`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/openspec-1-7-real-cli.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/views.test.ts tests/unit/external-command.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: compatible Node test union/dedupe execution passed
- result ref: `openspec/changes/delivery-final-closure-correction/verification.md#check-6`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 7

- scope: `typecheck`
- applicability: `applicable`
- command/method: `npm run typecheck`
- status: `passed`
- summary: typecheck execution passed
- result ref: `openspec/changes/delivery-final-closure-correction/verification.md#check-7`
- environment: `platform=linux arch=x64 node=v22.16.0`

## Actual ChangeSet

- `create` `openspec/changes/delivery-final-closure-correction/.openspec.yaml`
- `create` `openspec/changes/delivery-final-closure-correction/design.md`
- `create` `openspec/changes/delivery-final-closure-correction/explore.md`
- `create` `openspec/changes/delivery-final-closure-correction/proposal.md`
- `create` `openspec/changes/delivery-final-closure-correction/specs/flowkit-archive-and-checkpoint-boundary/spec.md`
- `create` `openspec/changes/delivery-final-closure-correction/specs/flowkit-change-cli-end-to-end-and-performance/spec.md`
- `create` `openspec/changes/delivery-final-closure-correction/specs/flowkit-change-verification-selection/spec.md`
- `create` `openspec/changes/delivery-final-closure-correction/specs/flowkit-core-hardening-and-release-candidate/spec.md`
- `create` `openspec/changes/delivery-final-closure-correction/specs/flowkit-formal-fact-reader-and-persistence/spec.md`
- `create` `openspec/changes/delivery-final-closure-correction/specs/flowkit-openspec-1-7-thin-integration/spec.md`
- `create` `openspec/changes/delivery-final-closure-correction/tasks.md`
- `create` `openspec/changes/delivery-final-closure-correction/verification-history/12a14b4f470cd3d8734ffebea59ce408794d7af600306f22eec5fed67e6db1df.md`
- `modify` `openspec/delivery-groups/20260810-01-change-execution-loop.yaml`
- `modify` `scripts/verification.ts`
- `modify` `src/cli/change-action.ts`
- `modify` `src/cli/main.ts`
- `modify` `src/facts/formal-fact-reader.ts`
- `modify` `src/integrations/openspec/openspec-cli-adapter.ts`
- `create` `src/integrations/openspec/openspec-executable.ts`
- `modify` `src/services/b1-run-execution-service.ts`
- `modify` `src/services/f1-checkpoint-boundary-service.ts`
- `modify` `src/verification/change-selection/entry-snapshot.ts`
- `modify` `src/verification/change-selection/evidence.ts`
- `modify` `src/verification/change-selection/module-map.ts`
- `modify` `src/verification/change-selection/publication.ts`
- `modify` `src/verification/change-selection/selection.ts`
- `modify` `tests/integration/g1-change-cli-end-to-end.test.ts`
- `modify` `tests/integration/openspec-1-7-real-cli.test.ts`
- `modify` `tests/unit/cli/change-action.test.ts`
- `modify` `tests/unit/integrations/openspec-cli-adapter.test.ts`
- `modify` `tests/unit/services/a1-write-service.test.ts`
- `modify` `tests/unit/services/b1-run-execution-service.test.ts`
- `modify` `tests/unit/services/f1-checkpoint-boundary-service.test.ts`
- `modify` `tests/unit/verification/change-selection/entry-snapshot.test.ts`
- `modify` `tests/unit/verification/change-selection/evidence.test.ts`
- `modify` `tests/unit/verification/change-selection/module-map.test.ts`
- `modify` `tests/unit/verification/change-selection/publication.test.ts`
- `modify` `tests/unit/verification/change-selection/selection.test.ts`
- `modify` `tests/unit/verification/verification-plan.test.ts`
