## 1. Change CLI orchestration

- [x] 1.1 Add `src/cli/change-action.ts` with closed intent mapping for `explore | review | revise | propose | apply`, prepare/exact-resume handling, stable JSON transport output, and fail-closed mismatched-intent behavior.
- [x] 1.2 Extend `src/cli/main.ts` usage/dispatch for `explore | review | revise | propose | apply | verify | archive` and `--result <path>` without changing existing diagnostic/write/recovery command semantics.
- [x] 1.3 Add unit coverage for new intent mapping, exact pending resume, logical result admission, non-author revise rejection, stale/mismatched action failure, and no automatic next-action continuation.

## 2. Verification and archive authority-safe surfaces

- [x] 2.1 Implement `flowkit verify` by consuming the existing FormalFact/OpenSpec structured Change Verification projection for status and authority-path discovery; read selection details only through that projected logical path, fail closed on missing/ambiguous/conflicting projection, and never reconstruct `openspec/changes/<changeId>/verification.md` locally or execute/publish Verification.
- [x] 2.2 Implement `flowkit archive` by composing the exact pending archive Action Package with the existing durable OpenSpec archive service and terminal admission/recovery semantics; prove it never Commit/Push/checkpoints.
- [x] 2.3 Extend existing CLI integration/process regressions for stable output, help/usage compatibility, verify structured-projection success/not-published/missing-or-conflicting fail-closed cases, explicit no-path-reconstruction coverage, archive success/failure/recovery, and existing diagnostic command non-regression.

## 3. Complete disposable-repository CLI E2E

- [x] 3.1 Add `tests/integration/g1-change-cli-end-to-end.test.ts` and a minimal disposable Git/OpenSpec/Manifest fixture that drives the real CLI process rather than only direct services.
- [x] 3.2 Cover happy lifecycle plus explicit result admission from Explore through archive success and completed→checkpoint readiness, with no automatic checkpoint mutation.
- [x] 3.3 Cover missing Owner activation, Author/Owner/Verification/External blockers, direct re-review, no-op revise rejection, stale review target, pending exact resume, and Change Verification failure.
- [x] 3.4 Cover missing OpenSpec artifact, archive failure/outcome-unknown recovery, strict checkpoint recognition, fresh checkout/resume, different Change identities, and a future-Delivery-shaped consumer without chat/provider state.

## 4. Formal Verification closure for G1

- [x] 4.1 Update the source-controlled Verification module map so the G1 CLI E2E path maps uniquely to the CLI module/capability and current G1 selection does not zero-match.
- [x] 4.2 Update the `tests-cli` physical resolver so selected Verification actually executes `tests/integration/g1-change-cli-end-to-end.test.ts` together with the existing CLI targets.
- [x] 4.3 Add module-map/evidence regressions, including a failing sentinel/counterexample proving that failure of the expected G1 E2E physical target makes selected `tests-cli` verification fail closed.

## 5. Performance observation and final Change verification

- [x] 5.1 Capture bounded G1 observations for Action Package size, Run average size, prepare latency, exact `resumeRun` latency, focused/affected wall time, selected logical check count, OpenSpec process count, Review rounds, and reopened finding count; keep exact-resume vs `resume-context` and reopened vs still-open metrics distinct.
- [x] 5.2 Confirm no cache platform, parallel scheduler, Provider/Agent Registry, auto-review loop, Delivery Full Test/Finalize implementation, or automatic Git mutation was introduced by G1.
- [x] 5.3 Run focused/affected Change Verification, typecheck, lint, build, strict current-Change OpenSpec validation, quality/whitespace guards, and the repository regressions required by the selected formal Verification plan; record the final formal result in `verification.md` through Apply admission.
