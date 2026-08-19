# Change Verification

> Flowkit Change Verification publication. Selection identity is logical and point-in-time; concrete commands belong to the verification executor.
<!-- flowkit-change-verification-status: passed -->

- Producing Run: `20260819-095-apply`
- canonicalBase: `3f4063a3e58fb78b1652e7b29e7c3034a6d968f2`
- postActionWorkspaceFingerprint: `ca639c0f4962291b896b2272301f3629fc1b36c848ee61fb2ca44162a00c8362`
- verificationCatalog: `src/verification/change-selection/module-map.ts`
- verificationCatalogFingerprint: `2cbebb76dcff0372afa0d32cfd50984360807084c69704cf51de60248dc7da7c`
- selectionFingerprint: `661e6fc63eef0021db65d4cc4bbf96c73fb11e181d784004bb349f129f400878`
- reverificationOfRunId: `20260819-095-apply`
- originApplyVerificationFingerprint: `8e415079c4a8b0a9cc08f99e9d7917d225bd25c6b0bc9498edddda828b6ac97a`
- previousVerificationRef: `openspec/changes/sync-resume-and-single-action-agent-adapter/verification-history/8e415079c4a8b0a9cc08f99e9d7917d225bd25c6b0bc9498edddda828b6ac97a.md`
- previousVerificationFingerprint: `8e415079c4a8b0a9cc08f99e9d7917d225bd25c6b0bc9498edddda828b6ac97a`
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

- `flowkit-change-verification-selection`
- `flowkit-diagnostic-cli`
- `flowkit-lean-run-and-action-package`
- `flowkit-sync-resume-and-single-action-agent-adapter`

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
- result ref: `openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md#check-1`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 2

- scope: `openspec-current-change-strict`
- applicability: `applicable`
- command/method: `OpenSpecCliAdapter.validateChange(currentChangeId, strict=true)`
- status: `passed`
- summary: strict OpenSpec current Change validation passed
- result ref: `openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md#check-2`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 3

- scope: `tests-cli`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/b1-delivery-findings-and-corrective-change.test.ts tests/integration/diagnostic-cli-process.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/g1-change-cli-end-to-end.test.ts tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts tests/unit/cli/architecture.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/resume-projection.test.ts tests/unit/diagnostics/views.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md#check-3`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 4

- scope: `tests-execution`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/f1-archive-and-checkpoint-boundary.test.ts tests/integration/f1-delivery-finalize-and-git-boundary.test.ts tests/unit/facts/formal-fact-reader-e1-tasks.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/facts/formal-fact-reader-ra007-admission.test.ts tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/facts/formal-fact-snapshot.test.ts tests/unit/facts/full-test-reader.test.ts tests/unit/facts/git-boundary-reader.test.ts tests/unit/facts/yaml-parser.test.ts tests/unit/policy/can-run.test.ts tests/unit/policy/contract-reset-currentness.test.ts tests/unit/policy/diagnose.test.ts tests/unit/policy/lineage.test.ts tests/unit/policy/next.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/policy/preconditions.test.ts tests/unit/policy/stage-detector.test.ts tests/unit/policy/types.test.ts tests/unit/policy/unified-entry.test.ts tests/unit/policy/verification-gate.test.ts tests/unit/services/a1-write-service.test.ts tests/unit/services/b1-openspec-action-context.test.ts tests/unit/services/b1-run-execution-service.test.ts tests/unit/services/delivery-full-test-service.test.ts tests/unit/services/f1-checkpoint-boundary-service.test.ts tests/unit/services/g1-single-action-agent-adapter.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md#check-4`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 5

- scope: `tests-openspec-runtime`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/openspec-1-7-real-cli.test.ts tests/unit/external-command.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md#check-5`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 6

- scope: `tests-verification`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md#check-6`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 7

- scope: `typecheck`
- applicability: `applicable`
- command/method: `npm run typecheck`
- status: `passed`
- summary: typecheck execution passed
- result ref: `openspec/changes/sync-resume-and-single-action-agent-adapter/verification.md#check-7`
- environment: `platform=linux arch=x64 node=v22.16.0`

## Actual ChangeSet

- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/.openspec.yaml`
- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/design.md`
- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/explore.md`
- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/proposal.md`
- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/specs/flowkit-change-verification-selection/spec.md`
- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/specs/flowkit-diagnostic-cli/spec.md`
- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/specs/flowkit-lean-run-and-action-package/spec.md`
- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/specs/flowkit-sync-resume-and-single-action-agent-adapter/spec.md`
- `create` `openspec/changes/sync-resume-and-single-action-agent-adapter/tasks.md`
- `modify` `openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml`
- `modify` `src/diagnostics/resume-context.ts`
- `create` `src/diagnostics/resume-projection.ts`
- `modify` `src/services/b1-run-execution-service.ts`
- `create` `src/services/g1-single-action-agent-adapter.ts`
- `modify` `src/verification/change-selection/evidence.ts`
- `modify` `src/verification/change-selection/module-map.ts`
- `modify` `src/verification/change-selection/publication.ts`
- `create` `tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts`
- `create` `tests/unit/diagnostics/resume-projection.test.ts`
- `modify` `tests/unit/diagnostics/views.test.ts`
- `modify` `tests/unit/services/b1-run-execution-service.test.ts`
- `create` `tests/unit/services/g1-single-action-agent-adapter.test.ts`
- `modify` `tests/unit/verification/change-selection/evidence.test.ts`
- `modify` `tests/unit/verification/change-selection/module-map.test.ts`
- `modify` `tests/unit/verification/change-selection/publication.test.ts`
