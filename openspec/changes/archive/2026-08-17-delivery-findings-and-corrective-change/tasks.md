## 1. B1 failure/finding domain and read model

- [x] 1.1 Add bounded Full-Test-specific types for current derived Finding occurrence, content-addressed retained failed result set and occurrence-resolved Finding provenance without introducing generic Finding/Evidence storage.
- [x] 1.2 Extend `FormalFactSnapshot` and Reader so raw `failed + current result + latest authorize-full-test Owner fact` deterministically derives exact `authorizationRef/sourceResultRef` and occurrence-hashed `findingId`.
- [x] 1.3 Extend Manifest Reader closed-schema validation for optional `verification.fullTest.failureHistory[]` and `delivery.fullTestFindings[]`, including canonical resultRef recomputation/deduplication, occurrence-id recomputation, authorization/source cross-ref validation and exact `summary === source.summary`.
- [x] 1.4 Preserve pre-B1 Manifest compatibility: absent B1 fields read as empty without rewrite; createChange-only post-failure shape remains unconsumed/current failed.

## 2. Atomic Owner corrective Change admission

- [x] 2.1 Extend existing Change create input with optional exact `{corrective:{findingId,authorizationRef,sourceResultRef}}` while preserving ordinary create input semantics outside the failed boundary.
- [x] 2.2 Require `corrective` + `required=true` when current Policy is `full-test-failed`; reject missing/stale/mismatched binding and reject corrective markers outside that boundary before any mutation.
- [x] 2.3 Implement one atomic Manifest publication that appends ordinary planned Change + ordinary `create-change` Owner record, retains-or-reuses exact failed result, appends occurrence-resolved Finding provenance with source-derived summary, removes current result and resets `failed→not-ready`.
- [x] 2.4 Preserve completed historical Changes and unrelated Manifest sections byte-semantically; do not auto-activate, auto-retry Full Test, create Run/NNN or add a second Owner authorization step.

## 3. Policy and diagnostic handoff

- [x] 3.1 Extend `full-test-failed` blocked Policy projection with exact current Finding occurrence identity/authorizationRef/resultRef while keeping Owner choices non-executing and non-inferential.
- [x] 3.2 Ensure successful corrective admission exits `full-test-failed` and reuses existing ordinary dependency/activation/Change lifecycle rules.
- [x] 3.3 Update `next/status/resume-context` and doctor detail as needed so fresh process exposes the current Finding binding during failure and never surfaces historical resolved Findings as current blockers.
- [x] 3.4 Verify corrective Change completed + checkpointed returns to A1 `awaiting-user-decision` and requires a fresh Owner `authorize-full-test`; historical authorization records do not auto-authorize the new candidate.

## 4. Verification Closure, compatibility and genericity

- [x] 4.1 Add unit regressions for Finding occurrence derivation, repeated-identical-result dedup/reuse, result-history/hash validation, dangling authorization/source refs, summary equality, closed-schema optional fields, atomic writer preservation and mismatch/no-mutation behavior.
- [x] 4.2 Add public CLI/integration regression for genuine A1 failed result + authorization occurrence → `flowkit create change` corrective binding → fresh-process retained authority/provenance → ordinary Change lifecycle entry with no new corrective Action/Run.
- [x] 4.3 Add pre-B1 historical Manifest and post-B1 fresh-process fixtures, plus later same-Delivery and different future-Delivery consumers, proving checkpoint activation does not fall back to createChange-only inference.
- [x] 4.4 Add counterfactual regressions: stale authorizationRef/sourceResultRef, two byte-identical failure cycles, historical summary drift, status-reset-without-retention, missing Finding cross-ref and createChange-only old shape MUST fail formal selected verification or remain unconsumed as appropriate.
- [x] 4.5 Update Change Verification module/capability mapping for every actual B1 mutation family and prove `actualChangeSet → logical check → physical target → formal result` closure.

## 5. Proposal/Apply quality gates

- [x] 5.1 Keep implementation inside approved `flowkitMutationScope`; any required out-of-scope mutation MUST stop for Proposal authority rather than silently widening Apply.
- [x] 5.2 Run focused/affected regressions, typecheck, lint, build and current Change OpenSpec strict validation; these technical checks MUST NOT impersonate Delivery Full Test lifecycle authority.
- [x] 5.3 Run exact-current-candidate real OpenSpec archive-sync preflight and validate post-archive canonical specs strictly before requesting Review-Apply/Archive authority.
- [x] 5.4 Confirm `git diff --check` and verify no generic Finding DB/Evidence platform, new corrective Action/Run, second Owner authorization state machine, auto activation/retry/finalize or unrelated C1+ scope entered the candidate.
