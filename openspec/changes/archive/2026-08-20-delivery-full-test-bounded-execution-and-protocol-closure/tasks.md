## 1. Execution contract + persistence

- [x] 1.1 Extend `FullTestExecutionContract` to the closed `command | bounded-command-plan` discriminated union without introducing internal V1/V2 generations; retain `flowkit-full-test-result-v1/schemaVersion:1`.
- [x] 1.2 Add bounded plan reader/writer round-trip for ordered logical `id + resolverId + perTargetTimeoutMs`; reject unknown/duplicate/malformed fields and keep human `verification.fullTest.plan` as coverage intent only.
- [x] 1.3 Migrate the current 03 Delivery Manifest from `npm run verify:full` command binding to the frozen six-check bounded plan while preserving unrelated Manifest/Owner/architecture facts byte-semantically.

## 2. Shared transport + Verification-owned bounded plan

- [x] 2.1 Extend the low-level external-command transport with an ordered bounded helper that preserves `exited | spawn-failed | timed-out-cancelled | outcome-unknown`, per-child timeout/process-tree ownership and bounded diagnostics without interpreting Verification status.
- [x] 2.2 Add Verification-owned Full Test logical plan/resolver/aggregator for `quality → typecheck → lint → build → openspec-all → full`; make `scripts/verification.ts` consume the same logical definitions so no second executable plan is created.
- [x] 2.3 Expand `typecheck` into independent source/test `tsc` targets and resolve quality/lint/build/OpenSpec targets directly; prove no bounded logical check hides another long-lived `verify:step`/npm wrapper.

## 3. Coverage-complete full-suite physical partition

- [x] 3.1 Resolve `full` from current-checkout `resolveAllTests()` with ordinary file-per-worker fallback and exactly the five frozen heavy override files.
- [x] 3.2 Preserve diagnostic 3-case、G1 Change 7-case、G1 Adapter 3-case、B1 existing suite/case semantics, and map H1's two default cases completely: one independent installed-runner diagnostics smoke target plus the future-Delivery E2E case decomposed into `FLOWKIT_H1_FORMAL_PHASE=1..26`; do not import H1 safe-dedup/capability policy into the shared Full Test resolver.
- [x] 3.3 Add closure assertions/regressions requiring discovered files == partition union, missing=0, unintended duplicate=0, one heavy override per heavy file, and explicit case/selector semantic closure for all five heavy overrides; fail closed on missing/overlapping/title-or-branch-drifted selectors, prove the H1 smoke assertions remain covered, and automatically include a synthetic new ordinary test.

## 4. Protocol / duration / diagnostics closure

- [x] 4.1 For bounded kind, require PASS == complete logical plan and FAILED == exact non-empty prefix with only the last logical check failed; reject incomplete PASS/arbitrary check ids/order drift.
- [x] 4.2 Keep transport/resolver/protocol ambiguity as execution-error with no terminal Full Test result/ref; retain legacy command child result IPC and exit/protocol coherence behavior.
- [x] 4.3 Freeze physical/logical/total duration semantics and expose bounded target diagnostics (`logicalCheckId`, `physicalTargetId`, typed outcome, duration, bounded output context) without durable telemetry state.

## 5. Delivery lifecycle write-side closure

- [x] 5.1 Make `raw authorized + no executionBlock + Owner create required Change` atomically publish planned Change + create-change provenance + `fullTestStatus=not-ready`, preserving prior authorization history.
- [x] 5.2 Fail closed ordinary Change create and activation while current `executionBlock.reason=outcome-unknown`; do not clear the block or add a generic recovery mechanism.
- [x] 5.3 Prove after required Change completion/checkpoint the Delivery returns to effective `awaiting-user-decision` and historical authorization cannot execute the new candidate without a fresh Owner `authorize-full-test`.

## 6. Formal Change Verification physical closure + managed compatibility

- [x] 6.1 Make selected logical `tests-cli` always use the existing static bounded CLI physical fanout, independent of whether the current Change carries H1 capability; preserve full non-H1 diagnostic-process coverage and retain only the existing H1-specific legacy installed-smoke dedup.
- [x] 6.2 Make selected logical `tests-execution` always use the existing static per-file/B1 bounded physical fanout; do not increase the existing `120000ms` per-target timeout and do not add dynamic classification/scheduling.
- [x] 6.3 Repair the historical G1 checkpoint fixture in `f1-checkpoint-boundary-service.test.ts` so it resolves the formal G1 checkpoint boundary from Git history instead of current `HEAD`; prove the focused fixture regression is 5/5 PASS while `tests-execution` remains selected.
- [x] 6.4 Strengthen Verification evidence sentinels so mandatory predecessor physical targets pass before the intended sentinel/env assertion is reached; prove the Reset-related G1/A1/B1/F1 target-reachability cases physically execute their claimed target.
- [x] 6.5 Rebuild each bounded target environment from current resolver policy; prove nested Node-test/OpenSpec/Archify consumers resolve the same managed `FLOWKIT_HOME` identities without persisting machine absolute paths.
- [x] 6.6 Keep Windows `.cmd/.bat`/PowerShell process-tree cancellation and legacy command Full Test regressions green; add bounded CLI/integration proof that the persisted Delivery Full Test plan executes without Run/NNN creation.
- [x] 6.7 Update Verification module ownership for new Full Test Verification code/tests and prove I1 cumulative actual change paths deterministically select the required logical checks and their bounded physical targets.
- [x] 6.8 Before formal I1 Change Verification begins, complete targeted regressions for the bounded Full Test implementation plus the Reset-required Verification closure, then run typecheck, lint, build, OpenSpec current/all strict and `git diff --check`; all required implementation/task mutations MUST be finished before this formal Verification boundary.
- [x] 6.9 Confirm the stable Apply candidate does not execute the real post-I1 Delivery Full Test, Actual/Compare, Finalize or Delivery Final; real 03 `actual.architecture.json` MUST remain absent. Formal Change Verification remains Verification authority and is not represented as a Task checkbox or Reviewer handoff fact.
