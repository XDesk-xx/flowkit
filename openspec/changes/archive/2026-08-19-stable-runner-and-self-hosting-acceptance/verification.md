# Change Verification

> Flowkit Change Verification publication. Selection identity is logical and point-in-time; concrete commands belong to the verification executor.
<!-- flowkit-change-verification-status: passed -->

- Producing Run: `20260819-113-revise-apply`
- canonicalBase: `bbb9eff528f1ccd9624e2d20454ecaa2f0b4405c`
- postActionWorkspaceFingerprint: `6d182e9c5cd45ad8ab0ac6c2b895276ad58afb03321b32784835c4f642d8e471`
- verificationCatalog: `src/verification/change-selection/module-map.ts`
- verificationCatalogFingerprint: `9c619b4211a3bcf76781df2a6776237638b1fd77e6374d64b8e2bba314235480`
- selectionFingerprint: `aa765cd20f4aa0d04441ff9e3c9174291338b7beb328a1899331e945c5223eee`
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
- `flowkit-change-verification-selection`
- `flowkit-stable-runner-and-self-hosting-acceptance`

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
- result ref: `openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md#check-1`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 2

- scope: `openspec-current-change-strict`
- applicability: `applicable`
- command/method: `OpenSpecCliAdapter.validateChange(currentChangeId, strict=true)`
- status: `passed`
- summary: strict OpenSpec current Change validation passed
- result ref: `openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md#check-2`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 3

- scope: `tests-cli`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/a1-delivery-readiness-and-full-test-behavior.test.ts tests/integration/b1-delivery-findings-and-corrective-change.test.ts tests/integration/diagnostic-cli.test.ts tests/unit/cli/architecture.test.ts tests/unit/cli/change-action.test.ts tests/unit/cli/context-loader.test.ts tests/unit/diagnostics/resume-projection.test.ts tests/unit/diagnostics/views.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=executes all four commands without mutating repository files|rejects unknown commands with exit 2 on stderr tests/integration/diagnostic-cli-process.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=drives the happy lifecycle through real archive, verify projection, completion and checkpoint readiness without a Git checkpoint tests/integration/g1-change-cli-end-to-end.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=keeps non-author blockers out of revise while explicit review creates direct same-stage re-review; author blockers permit revise tests/integration/g1-change-cli-end-to-end.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=fails closed for stale review target and missing Owner activation tests/integration/g1-change-cli-end-to-end.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=exact-resumes the same pending Run after a future-Delivery fresh clone with no chat/provider state tests/integration/g1-change-cli-end-to-end.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=keeps changed-surface outcome-unknown archive pending and resumes the same generation after explicit recovery admission tests/integration/g1-change-cli-end-to-end.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=projects not-published Verification from structured authority and fails closed when OpenSpec projection is unavailable tests/integration/g1-change-cli-end-to-end.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=records Change Verification failure through apply admission instead of fabricating success tests/integration/g1-change-cli-end-to-end.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=replays the real F1 retry\+archive terminal and fails closed on ambiguous/corrupt archived authority tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=keeps historical E1 selection/evidence point-in-time even when the current Catalog fingerprint differs tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=fresh-clones a different future Delivery, resumes one exact pending Action, rebuilds context, and does not auto-next tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts && FLOWKIT_H1_FORMAL_PHASE=1 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=2 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=3 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=4 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=5 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=6 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=7 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=8 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=9 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=10 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=11 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=12 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=13 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=14 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=15 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=16 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=17 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=18 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=19 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=20 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=21 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=22 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=23 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=24 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=25 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts && FLOWKIT_H1_FORMAL_PHASE=26 FLOWKIT_H1_FORMAL_STATE_ROOT=/tmp/flowkit-h1-formal-e2e-ot9386 /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts`
- status: `passed`
- summary: bounded H1 tests-cli physical execution passed
- result ref: `openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md#check-3`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 4

- scope: `tests-execution`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/f1-archive-and-checkpoint-boundary.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/f1-delivery-finalize-and-git-boundary.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/formal-fact-reader-e1-tasks.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/formal-fact-reader-e1-verification.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/formal-fact-reader-ra007-admission.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/formal-fact-reader-ra011-legacy-provenance.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/formal-fact-reader.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/formal-fact-snapshot.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/full-test-reader.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/git-boundary-reader.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/facts/yaml-parser.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/can-run.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/contract-reset-currentness.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/diagnose.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/lineage.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/next.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/owner-decision.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/preconditions.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/stage-detector.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/types.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/unified-entry.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/policy/verification-gate.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/services/a1-write-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/services/b1-openspec-action-context.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/services/delivery-full-test-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/services/f1-checkpoint-boundary-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/unit/services/g1-single-action-agent-adapter.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=I1 Proposal archive-sync admission wiring tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=E1 new preparation boundary tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=E2 post-checkpoint three-file writer tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=I1 exact-candidate re-verification lifecycle tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=B1 fixed ActionDefinition catalog tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=D2 archive terminal continuation regressions tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=D1 structured Owner facts and reset-aware lineage tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=creates one Delivery-wide Run then resumes the same pending semantic input tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=fails closed on contractRef version drift without publishing a second pending Run tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=admits logical result after legitimate Action output mutation and Core derives artifact refs tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=keeps blocked next while explicit review creates a new same-stage Reviewer generation tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=failed execution retries as a new Run/NNN without provider-session identity tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=Apply package carries exact Owner ref and remains Change-only/minimal tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=rejects a tampered contractRef even when caller preserves the old fingerprint tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=rejects tampered authority identity outside contractRefs before terminal publication tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=still fails closed when immutable approved proposal content drifts during pending Apply tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=resumes the same pending Apply after Action-owned tasks and verification progress tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=resumes the same pending revise-apply after its own tasks and verification mutations tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=fails closed when pending review-explore target bytes drift outside Reviewer mutation boundary tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=fails closed when pending review-propose target bytes drift outside Reviewer mutation boundary tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=resumes the exact pending archive after Action-owned OpenSpec relocation tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=resumes the exact pending archive after Action-owned Change completed progress tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=does not create a new archive Run after completion when no pending archive identity exists tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=keeps current C1 self-archive resumable after canonical spec merge and active root relocation tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=admits terminal result for the exact persisted pending archive after Change completed progress tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=rejects fabricated completed archive admission when the persisted pending identity is gone tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=keeps non-archive terminal admission bound to the active Change tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=projects the same persisted pending archive through inspect/status/doctor/resume-context after completion tests/unit/services/b1-run-execution-service.test.ts && /opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern=keeps completed diagnostics at none when no pending archive exists tests/unit/services/b1-run-execution-service.test.ts`
- status: `passed`
- summary: bounded H1 tests-execution physical execution passed
- result ref: `openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md#check-4`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 5

- scope: `tests-openspec-runtime`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/openspec-1-7-real-cli.test.ts tests/unit/external-command.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md#check-5`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 6

- scope: `tests-verification`
- applicability: `applicable`
- command/method: `/opt/nvm/versions/node/v22.16.0/bin/node --import tsx --test --test-concurrency=1 tests/integration/e1-change-verification-selection.test.ts tests/integration/e2-change-verification-generalization.test.ts tests/unit/verification/affected-scopes.test.ts tests/unit/verification/change-selection/actual-change-set.test.ts tests/unit/verification/change-selection/contracts.test.ts tests/unit/verification/change-selection/entry-snapshot.test.ts tests/unit/verification/change-selection/evidence.test.ts tests/unit/verification/change-selection/module-map.test.ts tests/unit/verification/change-selection/mutation-declaration.test.ts tests/unit/verification/change-selection/publication.test.ts tests/unit/verification/change-selection/selection.test.ts tests/unit/verification/verification-plan.test.ts`
- status: `passed`
- summary: logical Node test execution passed
- result ref: `openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md#check-6`
- environment: `platform=linux arch=x64 node=v22.16.0`

### Check 7

- scope: `typecheck`
- applicability: `applicable`
- command/method: `npm run typecheck`
- status: `passed`
- summary: typecheck execution passed
- result ref: `openspec/changes/stable-runner-and-self-hosting-acceptance/verification.md#check-7`
- environment: `platform=linux arch=x64 node=v22.16.0`

## Actual ChangeSet

- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/.openspec.yaml`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/design.md`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/explore.md`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/proposal.md`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/specs/flowkit-archive-and-checkpoint-boundary/spec.md`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/specs/flowkit-change-verification-selection/spec.md`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/specs/flowkit-stable-runner-and-self-hosting-acceptance/spec.md`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/tasks.md`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/verification-history/33eebfb52f03e5ab4e02223d746b1eb12b89b83e356ea2faeebf072b241c2878.md`
- `create` `openspec/changes/stable-runner-and-self-hosting-acceptance/verification-history/50aa6b091bb1fbfc174778c24aa8e2a3ba0de65f21071d4d4704832df1b26516.md`
- `modify` `openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml`
- `modify` `src/cli/main.ts`
- `modify` `src/services/f1-checkpoint-boundary-service.ts`
- `modify` `src/verification/change-selection/evidence.ts`
- `modify` `src/verification/change-selection/module-map.ts`
- `create` `tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/architecture-template.json`
- `create` `tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/bootstrap-specs/flowkit-openspec-1-7-thin-integration/spec.md`
- `create` `tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/design.md`
- `create` `tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/explore.md`
- `create` `tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/proposal.md`
- `create` `tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/specs/flowkit-h1-future-fixture/spec.md`
- `create` `tests/fixtures/h1-stable-runner-and-self-hosting-acceptance/change-template/tasks.md`
- `create` `tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts`
- `modify` `tests/unit/services/f1-checkpoint-boundary-service.test.ts`
- `modify` `tests/unit/verification/change-selection/evidence.test.ts`
- `modify` `tests/unit/verification/change-selection/module-map.test.ts`
