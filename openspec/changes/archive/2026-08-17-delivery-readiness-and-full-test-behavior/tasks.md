## 1. Delivery Full Test contract and persistence

- [x] 1.1 Extend domain/snapshot types to distinguish persisted raw Full Test status from effective readiness projection and to carry typed per-Delivery execution contract + optional executionBlock + closed terminal result facts.
- [x] 1.2 Extend Delivery Manifest Reader validation for `verification.fullTest.execution` and terminal `verification.fullTest.result`, including malformed/missing/mismatched/resultRef/executionBlock fail-closed conflicts.
- [x] 1.3 Extend `DeliveryCreateInput` with caller-supplied typed Full Test execution contract including bounded `launcherMode=direct|npm-shim` and serialize exactly that contract for future Deliveries; do not hard-code current 03 command/timeout.
- [x] 1.4 Perform one bounded current-03 migration that adds only the approved `project-full-verification` instance binding while preserving coverage intent/unrelated bytes.
- [x] 1.5 Implement atomic Full Test lifecycle publication for Owner authorization (`owner fact + authorized`) and terminal result (`passed|failed + closed result`) without partial durable states.

## 2. Delivery readiness and Policy behavior

- [x] 2.1 Implement pure generic Delivery readiness/effective `awaiting-user-decision` projection from completed required Changes, admitted checkpoints, conflict-free facts and valid per-Delivery execution contract.
- [x] 2.2 Extend `PolicyResult` with the bounded `delivery-behavior: full-test` variant and update no-active-change Full Test routing without adding `full-test` to `FormalAction`/`canRun`.
- [x] 2.3 Preserve `failed` fail-closed/B1 handoff semantics and existing pre-F1 Finalize blocked/Owner boundaries.

## 3. Single physical Full Test execution authority

- [x] 3.1 Extend existing `scripts/verification.ts verify:full` so `FLOWKIT_FULL_TEST_RESULT_PATH` causes the same physical route to atomically emit `flowkit-full-test-result-v1` structured JSON while preserving existing human CLI output/exit behavior when the env is absent.
- [x] 3.2 Implement one bounded Delivery Full Test service that requires exact current `delivery-behavior: full-test`, resolves persisted logical `command + args + launcherMode` deterministically (`npm-shim`: npm/non-win, npm.cmd→ComSpec/win32), spawns that one route with the Delivery timeout and fresh protocol path, and never calls a second internal Full Test runner as authority.
- [x] 3.3 Classify external-command outcomes: only valid exited protocol may publish passed/failed; spawn-failed/process-proven-terminal `timed-out-cancelled`/missing/malformed/stale/mismatched protocol keep authorized with no resultRef; any platform `outcome-unknown` atomically writes current executionBlock and forbids a new attempt. Do not parse human stdout as formal result.
- [x] 3.4 Implement the closed terminal schema `schemaVersion/status/summary/totalDurationMs/checks[{id,status,durationMs}]/resultRef` and exact canonical JSON SHA-256 derivation excluding `resultRef`; Reader must recompute the same ref.
- [x] 3.5 Add `flowkit delivery full-test` as the explicit one-behavior operator and ensure all diagnostic commands remain read-only.
- [x] 3.6 Preserve bounded at-least-once re-entry from unchanged `authorized` only after the prior owned process tree is proven terminal, with a fresh disposable result path and no Run/NNN/attempt ledger; retain Windows whole-tree cancellation through the existing seam, add POSIX owned process-group termination plus bounded terminal confirmation, and keep every unproven termination outcome-unknown/blocked.

## 4. Diagnostics and compatibility

- [x] 4.1 Update `next`/resume-context formatting for `kind=delivery-behavior` and make status display the effective Full Test lifecycle status without mutating the Manifest.
- [x] 4.2 Preserve existing Change operator semantics, Owner scoping, historical Runs, Checkpoint recognition and 02 OpenSpec executable propagation; do not introduce C1 `FLOWKIT_HOME` behavior.
- [x] 4.3 Keep bare engineering `npm run verify:full` compatible as a secondary human view of the same physical route; it must not acquire lifecycle authority by itself.

## 5. Verification Closure and regressions

- [x] 5.1 Add unit tests for readiness projection, Owner authorization atomicity, generic execution-contract/launcherMode validation, current-03 bounded migration, terminal result/resultRef recomputation, transport-vs-Verification failure classification, executionBlock and authorized re-entry.
- [x] 5.2 Add create-Delivery regressions using at least two different caller-supplied Full Test commands/timeouts to prove no repository-global `npm run verify:full` / `120000` hardcode.
- [x] 5.3 Add public CLI/integration tests proving real `flowkit delivery full-test` executes the persisted logical binding through deterministic platform launcher normalization, consumes protocol v1, handles genuine passed/failed paths, allocates no Run/NNN and leaves diagnostics read-only.
- [x] 5.4 Add cross-platform launcher/timeout regressions: Windows npm-shim must resolve to npm.cmd→ComSpec and preserve taskkill whole-tree authority; POSIX timeout must kill the owned process group and physically prove descendants cannot survive a re-entry-safe `timed-out-cancelled`; every unproven termination must remain outcome-unknown, persist executionBlock, and prevent a second Full Test attempt.
- [x] 5.5 Add transport/protocol classification regressions proving no resultRef/failed publication on spawn/timeout/missing/malformed/mismatch and genuine B1 handoff only on valid protocol failed.
- [x] 5.6 Add the approved future-Delivery-shaped multi-Change + fresh-process regression so production behavior remains independent of current Delivery/A1 identity and Change count.
- [x] 5.7 Add counterfactual route-break sentinels proving selected A1 tests fail if the public operator stops spawning the persisted binding, substitutes an internal runner, or ignores/accepts malformed structured protocol output.
- [x] 5.8 Update Change Verification module mapping/physical resolver coverage for every actual A1 mutation family and prove `actualChangeSet → logical check → physical test target → formal result` closure.

## 6. Proposal/Apply quality gates

- [x] 6.1 Run focused/affected tests, typecheck, lint, build and OpenSpec strict validation required by A1 Change Verification; do not treat these as Delivery Full Test lifecycle authority.
- [x] 6.2 Run the exact-current-candidate OpenSpec archive-sync preflight required by the 02 baseline before requesting Review/Archive authority.
- [x] 6.3 Confirm `git diff --check` and that no Tool/Skill/Behavior/Verification Registry, dynamic command discovery, second plan compiler, `_delivery/**` Run, Full Test Action/Run, scheduler/concurrency change or unrelated B1/C1/F1 scope entered the candidate.
