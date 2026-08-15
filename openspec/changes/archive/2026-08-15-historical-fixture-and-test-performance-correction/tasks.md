## 1. Correct lifecycle-independent fixtures

- [x] 1.1 Update `tests/integration/g1-change-cli-end-to-end.test.ts` to source G1 planning artifacts from the explicit immutable post-archive point-in-time root, with no active/archive fallback or lifecycle scanning.
- [x] 1.2 Add test-local real-CLI-generated Explore-completed and approved-Proposal boundary templates; exact-copy them only for targeted scenarios while retaining one complete base→archive/checkpoint-readiness happy lifecycle and all seven required scenarios.
- [x] 1.3 Replace the historical E1-dependent MODIFIED/archive conformance case in `tests/integration/openspec-1-7-real-cli.test.ts` with a self-contained point-in-time canonical + delta fixture and keep real OpenSpec 1.7 validate/archive assertions.
- [x] 1.4 Update `tests/unit/services/a1-write-service.test.ts` to the current 11-Change 02 corpus while preserving exact legacy missing-`architectureImpact` and D2/E2/H1 explicit-false assertions.

## 2. Close real OpenSpec physical Verification

- [x] 2.1 Extend `tests-openspec-runtime` in `src/verification/change-selection/evidence.ts` so its physical Node union includes `tests/integration/openspec-1-7-real-cli.test.ts`.
- [x] 2.2 Propagate the current `OpenSpecCliAdapter.executable` as `FLOWKIT_OPENSPEC_BIN` into the compatible Node union when `tests-openspec-runtime` is selected, without changing logical selection identity or adding executable discovery.
- [x] 2.3 Extend `tests/unit/verification/change-selection/evidence.test.ts` with real-target inclusion, failing-sentinel and executable-propagation regressions through `executeVerificationSelection`.

## 3. Correctness and performance acceptance

- [x] 3.1 Run the complete G1 seven-scenario real-process E2E and confirm all scenarios terminal PASS; record real CLI child-process count and confirm it does not exceed the correctness-only baseline of 79.
- [x] 3.2 Run the real OpenSpec 1.7 conformance suite with the formal executable identity and confirm no required case is skipped because `FLOWKIT_OPENSPEC_BIN` is absent.
- [x] 3.3 Run the current 02 corpus/A1 regression, physical Verification sentinel regressions, focused/affected tests, typecheck, lint, build, quality and strict current-Change OpenSpec validation.
- [x] 3.4 Complete formal H1 Change Verification through Apply admission and publish the resulting `verification.md`; confirm no `scripts/verification.ts`, module-map, production CLI/Policy/runtime, cache/scheduler or 03 Delivery behavior change entered the candidate. Formal Delivery Full Test remains out of H1 Apply and may only run after H1 archive + checkpoint, Delivery Ready, and independent Owner authorization.
